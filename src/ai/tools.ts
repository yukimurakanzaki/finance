import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@db/db'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import {
  matchRecurringItem,
  transactionsRepo,
} from '@db/repositories/transactions.repo'
import type { Cadence, Lane, RecurringKind } from '@db/types'
import { computeAffordability } from '@engine/affordability'
import { isActualFlow, safeToSpendFromLedger } from '@engine/safeToSpend'
import {
  correctionsRepo,
  type CorrectBalanceResult,
} from '@db/repositories/corrections.repo'
import { formatRpFull } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { resolveRecurringItemId } from '@lib/recurringMatch'

const now = () => new Date().toISOString()

const LANE_ENUM = [
  'income_producing',
  'store_of_value',
  'debt_liability',
  'protected_living',
  'pass_through',
]

// Write tools mutate the DB and require user confirmation before executing.
export const WRITE_TOOLS = new Set([
  'create_account',
  'log_transactions',
  'log_income',
  'add_recurring_item',
  'update_asset_value',
  'update_account_balance',
  'save_memory',
  'delete_memory',
  'create_skill',
])

export const TOOL_DEFINITIONS: Anthropic.Messages.ToolUnion[] = [
  // Server-side web search: runs on Anthropic's infrastructure, used for
  // looking up mutual fund NAV and other prices with no free local API.
  { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
  {
    name: 'query_transactions',
    description:
      'Search past transactions. Call this when the user asks about spending history, a specific purchase, totals for a period, or before logging transactions that might be duplicates. Dates are YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: {
          type: 'string',
          description: 'Start date (inclusive), YYYY-MM-DD',
        },
        to_date: {
          type: 'string',
          description: 'End date (inclusive), YYYY-MM-DD',
        },
        direction: {
          type: 'string',
          enum: ['in', 'out'],
          description: 'Filter by money in or out',
        },
        account_id: { type: 'string', description: 'Filter by account id' },
        search_note: {
          type: 'string',
          description: 'Case-insensitive substring match on the note field',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return, default 50',
        },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'check_affordability',
    description:
      'Answer "can I afford X?" for a discretionary purchase. Returns a verdict (comfortable / tight / over) computed from this week\'s remaining personal pool, plus the driving number. Always call this instead of judging affordability yourself, and always quote the number it returns alongside the verdict. Not for investments or protected commitments.',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Purchase amount in whole rupiah, e.g. 450000',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'create_account',
    description:
      'Create a new account (bank, digital wallet, or cash) so transactions can be logged against it. Use when the user has an account not yet tracked in the app. Requires confirmation. Returns the new account id — use that id for subsequent log_transactions calls.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name, e.g. "blu by BCA Digital"',
        },
        institution: {
          type: 'string',
          description: 'Bank/provider name, e.g. "BCA Digital"',
        },
        account_type: {
          type: 'string',
          enum: ['bank', 'digital_wallet', 'cash'],
        },
        lane: {
          type: 'string',
          enum: LANE_ENUM,
          description: 'protected_living for day-to-day spending accounts',
        },
      },
      required: ['name', 'institution', 'account_type', 'lane'],
    },
  },
  {
    name: 'log_transactions',
    description:
      'Log one or more transactions (spending, income received into an account, top-ups). Use this after extracting rows from a pasted bank statement image, or when the user tells you about spending. The user will review and confirm before anything is saved. For internal moves between the user’s own accounts, set is_transfer on BOTH legs and give both the same transfer_pair_key — transfer legs are excluded from spending and balance math.',
    input_schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              amount: {
                type: 'number',
                description: 'Positive amount in IDR, no separators',
              },
              direction: { type: 'string', enum: ['in', 'out'] },
              title: {
                type: 'string',
                description:
                  'Short user-facing title, e.g. "Kopi pagi". Merchant detail goes in note.',
              },
              account_id: {
                type: 'string',
                description: 'Account id from the context or snapshot',
              },
              category_name: {
                type: 'string',
                description:
                  'Category name from the user’s category list, or omit if none matches',
              },
              lane: {
                type: 'string',
                enum: LANE_ENUM,
                description:
                  'protected_living for day-to-day spending unless clearly otherwise',
              },
              note: {
                type: 'string',
                description: 'Short description, e.g. merchant name',
              },
              is_transfer: {
                type: 'boolean',
                description:
                  'true for internal moves between the user’s own accounts',
              },
              transfer_pair_key: {
                type: 'string',
                description:
                  'Same arbitrary key on both legs of one transfer so they are paired, e.g. "tf-2026-05-09-blu-bca"',
              },
              recurring_item_id: {
                type: 'string',
                description:
                  'id of an active recurring item (from the ACTIVE RECURRING section in context) this expense pays, e.g. a Netflix subscription payment or a household bill. Only set this when the transaction plausibly IS that committed payment — tagging it excludes the amount from the personal safe-to-spend pool. Omit if unsure or if none match; the app also auto-matches by description as a fallback, but an explicit id from you takes precedence.',
              },
            },
            required: ['date', 'amount', 'direction', 'account_id', 'lane'],
          },
        },
        allow_duplicates: {
          type: 'boolean',
          description:
            'Set true ONLY after the user confirmed flagged rows are genuinely new, to save them anyway.',
        },
      },
      required: ['transactions'],
    },
  },
  {
    name: 'log_income',
    description:
      'Record a salary / take-home income event (not a regular account transaction). Use when the user reports receiving their salary. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        gross: {
          type: 'number',
          description: 'Gross salary in IDR if known, else omit',
        },
        take_home_net: { type: 'number', description: 'Take-home net in IDR' },
        note: { type: 'string' },
      },
      required: ['date', 'take_home_net'],
    },
  },
  {
    name: 'add_recurring_item',
    description:
      'Add a recurring monthly/weekly/yearly commitment: a savings pipe (pay_yourself_first), household bill, or personal subscription. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: {
          type: 'number',
          description: 'Amount in IDR per cadence period',
        },
        cadence: {
          type: 'string',
          enum: ['monthly', 'weekly', 'yearly', 'one_off'],
        },
        kind: {
          type: 'string',
          enum: [
            'pay_yourself_first',
            'household_bill',
            'personal_sub',
            'other',
          ],
        },
        lane: { type: 'string', enum: LANE_ENUM },
        note: { type: 'string' },
      },
      required: ['name', 'amount', 'cadence', 'kind', 'lane'],
    },
  },
  {
    name: 'update_asset_value',
    description:
      'Update the current value of an asset (investment, gold, DPLK). Asset ids are listed in the context. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
        new_value: { type: 'number', description: 'New total value in IDR' },
      },
      required: ['asset_id', 'new_value'],
    },
  },
  {
    name: 'update_account_balance',
    description:
      "Correct an account's balance to what it actually holds, for any account type including banks. Use when the user says the app's figure is wrong and they don't want to reconstruct the missing transactions. The gap is booked as a dated balance correction: it moves the balance and net worth but never counts as spending or income, and can be given a category later. Do NOT use it to record a purchase — use log_transactions for that. Requires confirmation.",
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string' },
        new_balance: {
          type: 'number',
          description: 'What the account actually holds now, in IDR',
        },
        note: {
          type: 'string',
          description: "Optional short note, e.g. \"cash I forgot to log\"",
        },
      },
      required: ['account_id', 'new_balance'],
    },
  },
  {
    name: 'save_memory',
    description:
      'Save a fact to persistent memory that survives across chat sessions. Use when the user states a preference, correction, or stable financial detail. Keep entries compact and declarative. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The fact to remember, e.g. "Gets paid on the 25th of each month"',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'delete_memory',
    description:
      'Remove a memory entry that is stale, wrong, or contradicted by new information. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description:
            'ID of the memory to remove (from the MEMORY section in context)',
        },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'create_skill',
    description:
      'Save a reusable workflow as a custom skill. Use after a successful multi-step interaction that the user would want to repeat. Extract the pattern (not the specific data) into a prompt injection. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short name, e.g. "End of Month BCA Reconcile"',
        },
        description: {
          type: 'string',
          description: 'One-line description for the skill picker',
        },
        icon: { type: 'string', description: 'Single emoji icon' },
        prompt_injection: {
          type: 'string',
          description:
            'The instruction text injected into the system prompt when this skill is active. Describe the workflow steps.',
        },
      },
      required: ['name', 'description', 'prompt_injection'],
    },
  },
]

// ---------- Executors ----------

type ToolInput = Record<string, unknown>

export async function executeReadTool(
  name: string,
  input: ToolInput,
): Promise<string> {
  if (name === 'query_transactions') return queryTransactions(input)
  if (name === 'check_affordability') return checkAffordability(input)
  return JSON.stringify({ error: `Unknown read tool: ${name}` })
}

// D-1c: the verdict is computed here, never by the model. The tool hands back
// the verdict AND the number behind it, so the reply can satisfy FR-D1c.3
// (a verdict is never rendered alone) without the model doing arithmetic.
async function checkAffordability(input: ToolInput): Promise<string> {
  const amount = typeof input['amount'] === 'number' ? input['amount'] : Number.NaN

  const today = new Date()
  const [allowance, recurring, allTxns] = await Promise.all([
    db.allowance.get('local'),
    db.recurringItems.filter((r) => r.is_active).toArray(),
    db.transactions.toArray(),
  ])

  const sts = safeToSpendFromLedger(allowance, recurring, allTxns, today)
  const { verdict, driver, margin } = computeAffordability(amount, sts)

  if (verdict === 'unknown') {
    return JSON.stringify({
      verdict,
      reason:
        sts === null
          ? 'No monthly allowance is set yet, so there is no pool to check against.'
          : 'Amount must be a whole number of rupiah greater than zero.',
    })
  }

  return JSON.stringify({
    verdict,
    // Name the driver explicitly rather than shipping a bare number — the model
    // has to be able to say what it is.
    remaining_pool_this_week: driver,
    remaining_after_purchase: margin,
    formatted: {
      remaining_pool_this_week: formatRpFull(driver as number),
      remaining_after_purchase: formatRpFull(margin as number),
    },
  })
}

export async function executeWriteTool(
  name: string,
  input: ToolInput,
): Promise<string> {
  switch (name) {
    case 'create_account':
      return createAccount(input)
    case 'log_transactions':
      return logTransactions(input)
    case 'log_income':
      return logIncome(input)
    case 'add_recurring_item':
      return addRecurringItem(input)
    case 'update_asset_value':
      return updateAssetValue(input)
    case 'update_account_balance':
      return updateAccountBalance(input)
    case 'save_memory':
      return saveMemory(input)
    case 'delete_memory':
      return deleteMemory(input)
    case 'create_skill':
      return createCustomSkill(input)
    default:
      return JSON.stringify({ error: `Unknown write tool: ${name}` })
  }
}

async function queryTransactions(input: ToolInput): Promise<string> {
  const from = String(input['from_date'])
  const to = String(input['to_date'])
  const limit = typeof input['limit'] === 'number' ? input['limit'] : 50

  let rows = await db.transactions
    .where('date')
    .between(from, to, true, true)
    .toArray()

  if (input['direction'])
    rows = rows.filter((t) => t.direction === input['direction'])
  if (typeof input['account_id'] === 'string' && input['account_id'])
    rows = rows.filter((t) => t.account_id === input['account_id'])
  if (typeof input['search_note'] === 'string') {
    const q = (input['search_note'] as string).toLowerCase()
    rows = rows.filter((t) => t.note?.toLowerCase().includes(q))
  }

  const [accounts, categories] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
  ])
  const accName = new Map(accounts.map((a) => [a.id, a.name]))
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  // Same actuals definition the Report screen uses (isActualFlow): transfers
  // and balance corrections are not spend or income. A chat reply quoting a
  // different total than the screen is the fastest way to lose earned trust.
  const actuals = rows.filter(isActualFlow)
  const totalIn = actuals
    .filter((t) => t.direction === 'in')
    .reduce((s, t) => s + t.amount, 0)
  const totalOut = actuals
    .filter((t) => t.direction === 'out')
    .reduce((s, t) => s + t.amount, 0)

  rows.sort((a, b) => b.date.localeCompare(a.date))
  const trimmed = rows.slice(0, limit).map((t) => ({
    id: t.id,
    date: t.date,
    amount: t.amount,
    direction: t.direction,
    account: accName.get(t.account_id) ?? `#${t.account_id}`,
    category: t.category_id ? (catName.get(t.category_id) ?? null) : null,
    lane: t.lane,
    note: t.note,
    is_transfer: t.is_transfer,
  }))

  return JSON.stringify({
    match_count: rows.length,
    total_in_excl_transfers: totalIn,
    total_out_excl_transfers: totalOut,
    transactions: trimmed,
  })
}

interface TxnRow {
  date: string
  amount: number
  direction: 'in' | 'out'
  account_id: string
  category_name?: string
  lane: Lane
  title?: string
  note?: string
  is_transfer?: boolean
  transfer_pair_key?: string
  recurring_item_id?: string
}

async function createAccount(input: ToolInput): Promise<string> {
  const id = await db.accounts.add({
    name: String(input['name']),
    institution: String(input['institution']),
    account_type: input['account_type'] as 'bank' | 'digital_wallet' | 'cash',
    lane: input['lane'] as Lane,
    currency: 'IDR',
    is_protected: false,
    is_active: true,
    manual_balance_override: null,
    last_balance_updated_at: null,
    created_at: now(),
  })
  return JSON.stringify({ saved: true, account_id: id, name: input['name'] })
}

async function logTransactions(input: ToolInput): Promise<string> {
  const txns = (input['transactions'] ?? []) as TxnRow[]
  const [accounts, categories, activeRecurring] = await Promise.all([
    db.accounts.filter((a) => a.is_active).toArray(),
    db.categories.toArray(),
    db.recurringItems.filter((r) => r.is_active).toArray(),
  ])
  const accountIds = new Set(accounts.map((a) => a.id))

  // Legs sharing a transfer_pair_key get the same generated pair id
  const pairIds = new Map<string, string>()
  const pairIdFor = (key: string) => {
    let id = pairIds.get(key)
    if (!id) {
      id = crypto.randomUUID()
      pairIds.set(key, id)
    }
    return id
  }

  let saved = 0
  const errors: string[] = []
  const duplicates: Record<string, unknown>[] = []
  for (const t of txns) {
    if (!accountIds.has(t.account_id)) {
      errors.push(
        `No active account with id ${t.account_id} (note: "${t.note ?? ''}")`,
      )
      continue
    }
    if (!Number.isInteger(t.amount) || t.amount <= 0) {
      errors.push(
        `Invalid amount ${t.amount} — must be a positive whole-rupiah integer (note: "${t.note ?? ''}")`,
      )
      continue
    }
    if (input['allow_duplicates'] !== true) {
      const dup = await transactionsRepo.getDuplicateCandidate(
        t.date,
        t.amount,
        t.direction,
        t.account_id,
      )
      if (dup) {
        duplicates.push({
          date: t.date,
          amount: t.amount,
          note: t.note ?? null,
          existing_id: dup.id,
        })
        continue
      }
    }
    const category = t.category_name
      ? (categories.find(
          (c) => c.name.toLowerCase() === t.category_name!.toLowerCase(),
        ) ?? null)
      : null
    const isTransfer = t.is_transfer === true
    await db.transactions.add({
      date: t.date,
      amount: t.amount,
      direction: t.direction,
      account_id: t.account_id,
      category_id: category?.id ?? null,
      lane: t.lane,
      source: 'claude_import',
      title: t.title || null,
      note: t.note || null,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: isTransfer,
      transfer_pair_id:
        isTransfer && t.transfer_pair_key
          ? pairIdFor(t.transfer_pair_key)
          : null,
      // An explicit, validated id from the model wins; never trust an
      // unvalidated id (resolveRecurringItemId rejects unknown/inactive ids).
      // Fall back to the existing description-based auto-match so untagged
      // rows (or older prompt versions) still link automatically.
      recurring_item_id:
        resolveRecurringItemId(t.recurring_item_id, activeRecurring) ??
        matchRecurringItem(t, activeRecurring)?.id ??
        null,
      created_at: now(),
    })
    saved++
  }
  return JSON.stringify({
    saved_count: saved,
    errors,
    possible_duplicates: duplicates,
  })
}

async function logIncome(input: ToolInput): Promise<string> {
  const prev = await incomeEventsRepo.getLatest()
  const takeHome = Number(input['take_home_net'])
  const id = await db.incomeEvents.add({
    date: String(input['date'] ?? todayISO()),
    gross: typeof input['gross'] === 'number' ? input['gross'] : 0,
    take_home_net: takeHome,
    delta_vs_prev: prev ? takeHome - prev.take_home_net : null,
    routed_to_pipe: 0,
    routed_to_lifestyle: 0,
    note: typeof input['note'] === 'string' ? input['note'] : null,
    source: 'manual',
    created_at: now(),
  })
  return JSON.stringify({ saved: true, income_event_id: id })
}

async function addRecurringItem(input: ToolInput): Promise<string> {
  const id = await db.recurringItems.add({
    name: String(input['name']),
    amount: Number(input['amount']),
    cadence: input['cadence'] as Cadence,
    kind: input['kind'] as RecurringKind,
    lane: input['lane'] as Lane,
    is_protected: input['kind'] === 'pay_yourself_first',
    is_active: true,
    next_due: todayISO(),
    end_date: null,
    note: typeof input['note'] === 'string' ? input['note'] : null,
    created_at: now(),
  })
  return JSON.stringify({ saved: true, recurring_item_id: id })
}

async function updateAssetValue(input: ToolInput): Promise<string> {
  const id = String(input['asset_id'])
  const asset = await db.assets.get(id)
  if (!asset) return JSON.stringify({ error: `No asset with id ${id}` })
  await db.assets.update(id, {
    value: Number(input['new_value']),
    last_valued_at: todayISO(),
  })
  return JSON.stringify({
    saved: true,
    asset: asset.name,
    new_value: input['new_value'],
  })
}

async function updateAccountBalance(input: ToolInput): Promise<string> {
  const id = String(input['account_id'])
  const account = await db.accounts.get(id)
  if (!account) return JSON.stringify({ error: `No account with id ${id}` })

  // D1 — every account type, bank included, corrects the same way the
  // Set-true-balance sheet does: book the gap as an adjustment transaction
  // through the shared repository. This tool used to refuse bank accounts,
  // which left the most common type with no correction path at all.
  const result = await correctionsRepo.correctBalance({
    accountId: id,
    actualBalance: Number(input['new_balance']),
    note: typeof input['note'] === 'string' ? input['note'] : null,
  })

  if (!result.ok) return JSON.stringify({ error: correctionError(result, account.name) })

  return JSON.stringify({
    saved: true,
    account: account.name,
    new_balance: input['new_balance'],
    booked_as: 'balance correction (not counted as spending)',
  })
}

function correctionError(
  result: Exclude<CorrectBalanceResult, { ok: true }>,
  accountName: string,
): string {
  if (result.reason === 'before_anchor')
    return `${accountName}'s starting balance was set on ${result.anchorDate}; a correction must be dated after that.`
  if (result.reason === 'future_date')
    return 'A correction cannot be dated in the future.'
  return `${accountName} already shows that balance — nothing to correct.`
}

async function saveMemory(input: ToolInput): Promise<string> {
  const id = crypto.randomUUID()
  await db.chatMemories.add({
    id,
    content: String(input['content']),
    source_session_id: null,
    created_at: now(),
    updated_at: now(),
  })
  return JSON.stringify({ saved: true, memory_id: id })
}

async function deleteMemory(input: ToolInput): Promise<string> {
  const id = String(input['memory_id'])
  const existing = await db.chatMemories.get(id)
  if (!existing) return JSON.stringify({ error: `No memory with id ${id}` })
  await db.chatMemories.delete(id)
  return JSON.stringify({ deleted: true, content: existing.content })
}

async function createCustomSkill(input: ToolInput): Promise<string> {
  const id = crypto.randomUUID()
  await db.chatCustomSkills.add({
    id,
    name: String(input['name']),
    description: String(input['description']),
    icon: typeof input['icon'] === 'string' ? input['icon'] : '⚡',
    prompt_injection: String(input['prompt_injection']),
    source_session_id: null,
    created_at: now(),
    updated_at: now(),
  })
  return JSON.stringify({ saved: true, skill_id: id, name: input['name'] })
}

// ---------- Human-readable summaries for the confirmation card ----------

// SEC-5 — the confirm card is the gate between model output and a written
// balance, so for a correction it has to show how far the ledger is about to
// move, not just where it lands. "Set to Rp 5.000.000" hides a wrong figure;
// "Rp 690.000 → Rp 5.000.000 (+Rp 4.310.000)" makes it obvious. Needs a DB
// read, hence the async twin of describeWrite rather than a wider signature
// change on every other tool's summary.
export async function describeWriteLive(
  name: string,
  input: ToolInput,
): Promise<string[]> {
  if (name !== 'update_account_balance') return describeWrite(name, input)

  const account = await db.accounts.get(String(input['account_id']))
  if (!account?.id) return describeWrite(name, input)

  const actualBalance = Number(input['new_balance'])
  const plan = await correctionsRepo.preview({ accountId: account.id, actualBalance })
  if (!plan.ok) return [`${account.name}: ${correctionError(plan, account.name)}`]

  const before = actualBalance - plan.delta
  const sign = plan.delta < 0 ? '−' : '+'
  return [
    `${account.name}: ${formatRpFull(before)} → ${formatRpFull(actualBalance)} ` +
      `(${sign}${formatRpFull(Math.abs(plan.delta))}, booked as a correction — not spending)`,
  ]
}

export function describeWrite(name: string, input: ToolInput): string[] {
  switch (name) {
    case 'create_account':
      return [
        `New account: ${input['name']} (${input['institution']}, ${input['account_type']})`,
      ]
    case 'log_transactions': {
      const txns = (input['transactions'] ?? []) as TxnRow[]
      return txns.map(
        (t) =>
          `${t.is_transfer ? '⇄' : t.direction === 'out' ? '−' : '+'} ${formatRpFull(t.amount)} · ${t.date}` +
          `${t.note ? ` · ${t.note}` : ''}${t.category_name ? ` (${t.category_name})` : ''}` +
          // Visible indicator when the model explicitly tagged this row as a
          // recurring payment, so the user sees it before confirming (the
          // description-based auto-match fallback resolves later at save
          // time and isn't previewable here without a DB round trip).
          `${t.recurring_item_id ? ' 🔁 recurring' : ''}`,
      )
    }
    case 'log_income':
      return [
        `Income: ${formatRpFull(Number(input['take_home_net']))} take-home on ${input['date']}`,
      ]
    case 'add_recurring_item':
      return [
        `Recurring: ${input['name']} — ${formatRpFull(Number(input['amount']))} / ${input['cadence']}`,
      ]
    case 'update_asset_value':
      return [
        `Asset #${input['asset_id']} → ${formatRpFull(Number(input['new_value']))}`,
      ]
    case 'update_account_balance':
      return [
        `Account #${input['account_id']} balance → ${formatRpFull(Number(input['new_balance']))}`,
      ]
    case 'save_memory':
      return [`💾 Remember: "${input['content']}"`]
    case 'delete_memory':
      return [`🗑 Forget memory #${String(input['memory_id']).slice(0, 8)}…`]
    case 'create_skill':
      return [`⚡ New skill: "${input['name']}" — ${input['description']}`]
    default:
      return [JSON.stringify(input)]
  }
}
