import { db } from '@db/db'
import { computeSafeToSpend } from '@engine/safeToSpend'
import { computeFIProjection } from '@engine/fiProjection'
import type { AssetType, Lane } from '@db/types'
import { isoWeekStart, isoWeekEnd, todayISO } from '@lib/dates'

const PERSONA = `You are Adi's personal AI finance manager inside the FI Dashboard app — a trusted partner who manages his money with him. All amounts are Indonesian Rupiah (IDR); write them like "Rp 1.500.000".

Core rules:
- Reply in whatever language the user writes (Indonesian, English, or mixed).
- NEVER assume. If a detail needed for a data change is missing or ambiguous (which account, exact amount, date, direction), ask a short clarifying question instead of guessing. For questions and analysis, reasonable interpretation is fine.
- Data changes (log_transactions, log_income, add_recurring_item, update_asset_value, update_account_balance) are shown to the user for approval before saving — so propose them freely when the user's intent is clear, but never call them speculatively.
- When the user pastes an image of a bank statement or transaction list, extract every row: date, amount, direction (money out = "out", money in = "in"), merchant/description as note. Match to the right account by asking or from context. If any row is unclear, ask about that row instead of skipping silently. Use query_transactions first if there's a chance rows were already logged.
- Bulk imports: if the data references an account that doesn't exist yet, propose create_account first (its result returns the new account id to use). Internal moves between the user's own accounts must be logged with is_transfer=true on BOTH legs sharing one transfer_pair_key — they're excluded from spending and balance math. Rows that are explicitly not the user's personal money (managed pools, pass-through funds held for others) should be skipped — confirm the exclusion with the user, don't log them. For large imports, load in batches of at most ~50 rows per log_transactions call so each confirmation card stays reviewable.
- For affordability questions ("can I afford X?"), reason from the data: safe-to-spend this week, monthly discretionary pool, upcoming committed spending, and — for big purchases — impact on the savings pipe and FI timeline. Give a clear verdict (yes / yes-with-tradeoff / no) and the one or two numbers that drive it.
- Asset prices: gold and foreign-currency assets marked AUTO refresh themselves daily from market APIs — don't offer to update those. For mutual funds (RDPU, equity funds) and anything else without a live feed, use web_search to find today's NAV/price (e.g. "NAV <fund name> hari ini site:bibit.id OR site:bareksa.com"), compute the new value from the user's holdings, cite the source and date, and propose it with update_asset_value. If you can't find a trustworthy current figure, say so — never invent a price.
- Be concise and mobile-friendly: short paragraphs, no long lists unless asked. Warm but direct, like a good financial partner.
- If the "Notices" section below is non-empty and this is the start of a conversation, briefly surface the most important notice.`

export async function buildSystemPrompt(): Promise<string> {
  const today = new Date()
  const iso = todayISO()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })

  const [accounts, assets, categories, recurring, allowance, assumptions, lastIncome] =
    await Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.assets.toArray(),
      db.categories.toArray(),
      db.recurringItems.filter((r) => r.is_active).toArray(),
      db.allowance.get(1),
      db.assumptions.orderBy('id').last(),
      db.incomeEvents.orderBy('date').last(),
    ])

  // Account balances: bank = transaction ledger sum, others = manual override
  const txnSums: Record<number, number> = {}
  const allTxns = await db.transactions.filter((t) => !t.is_transfer).toArray()
  for (const t of allTxns) {
    txnSums[t.account_id] = (txnSums[t.account_id] ?? 0) + (t.direction === 'in' ? t.amount : -t.amount)
  }

  const accountLines = accounts.map((a) => {
    const bal = a.account_type === 'bank' ? (txnSums[a.id!] ?? 0) : (a.manual_balance_override ?? 0)
    return `- id ${a.id}: ${a.name} (${a.institution}, ${a.account_type}) — balance Rp ${bal.toLocaleString('id-ID')}`
  })

  const assetLines = assets.map((a) => {
    const qty = a.quantity_grams ? `, ${a.quantity_grams}g` : a.fx_amount ? `, ${a.fx_amount} ${a.fx_code}` : ''
    const auto = a.auto_price ? ' [AUTO-PRICED]' : ''
    return `- id ${a.id}: ${a.name} (${a.asset_type}${qty}) — Rp ${a.value.toLocaleString('id-ID')}, last valued ${a.last_valued_at}${auto}`
  })

  const categoryLines = categories.map((c) => `- ${c.name} [${c.lane}]`)
  const recurringLines = recurring.map(
    (r) => `- ${r.name}: Rp ${r.amount.toLocaleString('id-ID')} / ${r.cadence} (${r.kind}), next due ${r.next_due}`,
  )

  // Net worth by lane
  const byLane: Record<Lane, number> = {
    income_producing: 0, store_of_value: 0, debt_liability: 0, protected_living: 0,
  }
  for (const a of accounts) {
    const bal = a.account_type === 'bank' ? (txnSums[a.id!] ?? 0) : (a.manual_balance_override ?? 0)
    byLane[a.lane] += bal
  }
  for (const a of assets) byLane[a.lane] += a.value
  const netWorth = byLane.income_producing + byLane.store_of_value - byLane.debt_liability + byLane.protected_living

  // Safe to spend
  let stsBlock = 'Not configured yet (no allowance set).'
  if (allowance && allowance.monthly_amount > 0) {
    const weekTxns = allTxns.filter(
      (t) => t.direction === 'out' && t.date >= isoWeekStart(today) && t.date <= isoWeekEnd(today),
    )
    const spendThisWeek = weekTxns.reduce((s, t) => s + t.amount, 0)
    const sts = computeSafeToSpend({ allowance, activeRecurringItems: recurring, spendThisWeek, today })
    if (sts) {
      stsBlock = [
        `Monthly personal pool: Rp ${sts.personalPool.toLocaleString('id-ID')}`,
        `Weekend allocation: Rp ${sts.weekendAllocation.toLocaleString('id-ID')} / month`,
        `This workweek's pool: Rp ${sts.weekPool.toLocaleString('id-ID')}, spent so far: Rp ${sts.spentThisWeek.toLocaleString('id-ID')}, remaining: Rp ${sts.remainingPool.toLocaleString('id-ID')}`,
        `Safe to spend today: Rp ${sts.todayCeiling.toLocaleString('id-ID')} (${sts.remainingWorkdays} workdays left this week)`,
        sts.isNegativePool ? 'WARNING: monthly pool is negative after subs + weekend allocation.' : '',
      ].filter(Boolean).join('\n')
    }
  }

  // FI projection
  let fiBlock = 'Not configured yet (no FI assumptions).'
  if (assumptions) {
    const currentAssets: Record<AssetType, number> = {
      investment_rdpu: 0, investment_equity: 0, gold: 0, dplk: 0, storyforge: 0, currency: 0, other: 0,
    }
    for (const a of assets) currentAssets[a.asset_type] += a.value
    const pipeMonthly = recurring
      .filter((r) => r.kind === 'pay_yourself_first' && r.cadence === 'monthly')
      .reduce((s, r) => s + r.amount, 0)
    const fi = computeFIProjection({ assumptions, currentAssets, pipeMonthlyActive: pipeMonthly, currentDate: today })
    fiBlock = [
      `FI target: Rp ${assumptions.target_low.toLocaleString('id-ID')} – Rp ${assumptions.target_high.toLocaleString('id-ID')}`,
      `Current FI-eligible assets: Rp ${fi.total_current.toLocaleString('id-ID')} (gap to low target: Rp ${fi.gap_to_low.toLocaleString('id-ID')})`,
      `Monthly pipe (pay-yourself-first): Rp ${pipeMonthly.toLocaleString('id-ID')}`,
      fi.years_to_fi_path_b !== null
        ? `Projected FI (Path B, RDPU→equity switch): ~${fi.years_to_fi_path_b.toFixed(1)} years (${fi.fi_date_path_b?.getFullYear()})`
        : 'FI not reachable within 60 years on current pipe (Path B).',
    ].join('\n')
  }

  // Notices — proactive check-in material
  const notices: string[] = []
  const staleAssets = assets.filter(
    (a) => (today.getTime() - new Date(a.last_valued_at).getTime()) / 86_400_000 > 35,
  )
  if (staleAssets.length > 0) {
    notices.push(`Stale asset values (not updated in 35+ days): ${staleAssets.map((a) => a.name).join(', ')}.`)
  }
  const soon = new Date(today); soon.setDate(soon.getDate() + 7)
  const soonISO = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
  const dueSoon = recurring.filter((r) => r.next_due >= iso && r.next_due <= soonISO)
  if (dueSoon.length > 0) {
    notices.push(`Due within 7 days: ${dueSoon.map((r) => `${r.name} (${r.next_due}, Rp ${r.amount.toLocaleString('id-ID')})`).join(', ')}.`)
  }

  return `${PERSONA}

=== TODAY ===
${dayName}, ${iso}

=== ACCOUNTS ===
${accountLines.join('\n') || '(none yet)'}

=== ASSETS ===
${assetLines.join('\n') || '(none yet)'}

=== CATEGORIES ===
${categoryLines.join('\n') || '(none yet)'}

=== ACTIVE RECURRING (committed monthly) ===
${recurringLines.join('\n') || '(none yet)'}

=== NET WORTH ===
Total: Rp ${netWorth.toLocaleString('id-ID')}
By lane: income_producing Rp ${byLane.income_producing.toLocaleString('id-ID')}, store_of_value Rp ${byLane.store_of_value.toLocaleString('id-ID')}, debt_liability Rp ${byLane.debt_liability.toLocaleString('id-ID')}, protected_living Rp ${byLane.protected_living.toLocaleString('id-ID')}

=== SAFE TO SPEND ===
${stsBlock}

=== FI PROJECTION ===
${fiBlock}

=== LAST INCOME EVENT ===
${lastIncome ? `${lastIncome.date}: take-home Rp ${lastIncome.take_home_net.toLocaleString('id-ID')}` : '(none logged)'}

=== NOTICES ===
${notices.join('\n') || '(none)'}`
}
