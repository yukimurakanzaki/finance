import { deriveBalance } from '@lib/balances'
import { todayISO } from '@lib/dates'
import { planCorrection, type CorrectionPlan } from '@engine/balanceCorrection'
import { db } from '../db'
import type { Account, BalanceCorrection, Transaction } from '../types'

const now = () => new Date().toISOString()

export interface CorrectBalanceInput {
  accountId: string
  /** What the account actually holds, per the user. */
  actualBalance: number
  /** YYYY-MM-DD. Defaults to today. */
  asOfDate?: string
  note?: string | null
}

export type CorrectBalanceResult =
  | { ok: true; transaction_id: string; correction_id: string; resultingBalance: number }
  | Exclude<CorrectionPlan, { ok: true }>

// D1 — "Set true balance". The user says what an account really holds; we book
// the gap as an adjustment transaction (excluded from every spending signal by
// isWeekDraw/isActualFlow) plus an append-only audit row.
//
// Deliberately does NOT touch manual_balance_override: that field carries the
// onboarding opening balance and nothing else, so there is exactly one
// authoritative mechanism per job and `deriveBalance` needs no special case.
export const correctionsRepo = {
  byAccount: (accountId: string) =>
    db.balanceCorrections.where('account_id').equals(accountId).reverse().sortBy('created_at'),

  latestFor: async (accountId: string): Promise<BalanceCorrection | undefined> =>
    (await correctionsRepo.byAccount(accountId))[0],

  async correctBalance(input: CorrectBalanceInput): Promise<CorrectBalanceResult> {
    const asOfDate = input.asOfDate ?? todayISO()
    const account = await db.accounts.get(input.accountId)
    if (!account) throw new Error(`Account ${input.accountId} not found`)

    const accountTxns = await db.transactions
      .where('account_id')
      .equals(input.accountId)
      .toArray()

    // The balance as the app derives it *on the correction's own date* — not
    // today's. The user is telling us what the account held on `asOfDate`, so
    // the gap has to be measured there; transactions after it then replay on
    // top exactly as deriveBalance already does.
    const derivedBalance = deriveBalance(
      account,
      accountTxns.filter((t) => t.date <= asOfDate),
    )
    const plan = planCorrection({
      derivedBalance,
      actualBalance: input.actualBalance,
      asOfDate,
      today: todayISO(),
      anchorDate: anchorOf(account),
      laterFlow: netFlowAfter(accountTxns, asOfDate),
    })
    if (!plan.ok) return plan

    const transaction_id = crypto.randomUUID()
    const correction_id = crypto.randomUUID()

    await db.transaction('rw', db.transactions, db.balanceCorrections, async () => {
      const adjustment: Transaction = {
        id: transaction_id,
        date: asOfDate,
        amount: plan.amount,
        direction: plan.direction,
        title: 'Balance correction',
        account_id: input.accountId,
        // Left uncategorised on purpose: the user corrects precisely because
        // they don't remember what the money went on. Giving it a category
        // later is what turns it back into an ordinary transaction.
        category_id: null,
        lane: account.lane,
        source: 'manual',
        note: input.note ?? null,
        original_amount: null,
        overridden_amount: null,
        override_note: null,
        overridden_at: null,
        is_transfer: false,
        transfer_pair_id: null,
        recurring_item_id: null,
        is_adjustment: true,
        created_at: now(),
      }
      await db.transactions.add(adjustment)
      await db.balanceCorrections.add({
        id: correction_id,
        account_id: input.accountId,
        transaction_id,
        reverts_id: null,
        previous_balance: derivedBalance,
        new_balance: input.actualBalance,
        as_of_date: asOfDate,
        note: input.note ?? null,
        author_member_id: null,
        created_at: now(),
      })
    })

    return { ok: true, transaction_id, correction_id, resultingBalance: plan.resultingBalance }
  },

  // Undo: drop the adjustment transaction and append a reverting audit row.
  // History is append-only (SEC-3) — the original row is never edited or
  // deleted, so a member cannot erase evidence that a correction happened.
  async revert(correctionId: string): Promise<void> {
    const source = await db.balanceCorrections.get(correctionId)
    if (!source) throw new Error(`Correction ${correctionId} not found`)

    await db.transaction('rw', db.transactions, db.balanceCorrections, async () => {
      if (source.transaction_id) await db.transactions.delete(source.transaction_id)
      await db.balanceCorrections.add({
        id: crypto.randomUUID(),
        account_id: source.account_id,
        transaction_id: null,
        reverts_id: correctionId,
        previous_balance: source.new_balance,
        new_balance: source.previous_balance,
        as_of_date: source.as_of_date,
        note: null,
        author_member_id: null,
        // Strictly after the row it reverts. Two writes can land in the same
        // millisecond, and history is read newest-first — a tie would order by
        // random UUID and show the undo above or below its own cause at random.
        created_at: strictlyAfter(source.created_at),
      })
    })
  },
}

function anchorOf(account: Account): string | null {
  return account.manual_balance_override !== null && account.last_balance_updated_at
    ? account.last_balance_updated_at.slice(0, 10)
    : null
}

/** Net effect (in − out) of an account's transactions dated after `date`. */
function netFlowAfter(txns: Transaction[], date: string): number {
  let net = 0
  for (const t of txns) {
    if (t.date <= date) continue
    net += t.direction === 'in' ? t.amount : -t.amount
  }
  return net
}

function strictlyAfter(iso: string): string {
  const n = now()
  return n > iso ? n : new Date(Date.parse(iso) + 1).toISOString()
}
