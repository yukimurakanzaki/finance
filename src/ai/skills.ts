// Built-in AI skills for the finance manager. Each skill injects extra
// instructions into the system prompt when activated by the user.

export interface BuiltInSkill {
  id: string
  name: string
  description: string
  icon: string
  prompt_injection: string
}

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: 'monthly-reconcile',
    name: 'Monthly Reconcile',
    description: 'Walk through end-of-month account reconciliation',
    icon: '📊',
    prompt_injection: `You are in "Monthly Reconcile" mode. Guide the user through:
1. Check each active account balance matches reality (ask them to open their banking app).
2. Flag any transactions that look miscategorized or duplicated.
3. Update any stale asset valuations (use web_search for mutual fund NAVs).
4. Summarize: total in vs out for the month, by lane. Highlight surprises.
5. Propose any adjustments (recurring items that changed, new subscriptions spotted).
Be systematic — go account by account. Don't skip ahead until each is confirmed.`,
  },
  {
    id: 'fi-checkin',
    name: 'FI Check-in',
    description: 'Review FI progress and pipe health',
    icon: '🎯',
    prompt_injection: `You are in "FI Check-in" mode. Walk through:
1. Current net worth vs last month (if net worth snapshots exist).
2. FI projection: years to target, are we on track?
3. Pipe health: is pay-yourself-first actually happening? Any skipped months?
4. Asset allocation: is the RDPU→equity switch month approaching?
5. One actionable suggestion to improve the trajectory.
Keep it motivating but honest. Use real numbers from context.`,
  },
  {
    id: 'salary-day',
    name: 'Salary Day',
    description: 'Process incoming salary and route allocations',
    icon: '💰',
    prompt_injection: `You are in "Salary Day" mode. When the user reports salary received:
1. Log the income event (log_income) with gross/net if provided.
2. Compare to previous month — flag any change.
3. Walk through the allocation: pay-yourself-first pipe items, then bills, then what's left for lifestyle.
4. Calculate: after all committed items, what's the discretionary pool this month?
5. If there's a surplus vs last month, suggest where the extra could go (extra pipe, one-off treat, etc.).
Ask for the take-home amount if not provided.`,
  },
  {
    id: 'spending-review',
    name: 'Spending Review',
    description: 'Analyze recent spending patterns',
    icon: '🔍',
    prompt_injection: `You are in "Spending Review" mode. Analyze spending:
1. Query transactions for the requested period (default: last 30 days).
2. Break down by category and by account.
3. Compare to previous period if data exists.
4. Flag: unusual spikes, uncategorized transactions, potential duplicates.
5. Safe-to-spend status: are we on track for the week/month?
Use tables for clarity. Keep insights actionable — "you spent X more on Y this month, mainly because of Z."`,
  },
  {
    id: 'update-investments',
    name: 'Update Investments',
    description: 'Refresh investment valuations from market data',
    icon: '📈',
    prompt_injection: `You are in "Update Investments" mode. For each non-auto-priced asset:
1. Use web_search to find today's NAV/price (bibit.id, bareksa.com, or the fund's official site).
2. Calculate new value from the user's holdings/units.
3. Propose update_asset_value with the new figure, citing the source and date.
4. Skip assets marked [AUTO-PRICED] — those refresh themselves.
5. After all updates, show the before/after total and percentage change.
If a price can't be found, say so clearly — never guess.`,
  },
]

export function getBuiltInSkill(id: string): BuiltInSkill | undefined {
  return BUILT_IN_SKILLS.find((s) => s.id === id)
}
