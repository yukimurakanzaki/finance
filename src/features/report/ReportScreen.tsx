import {
  Amount,
  Card,
  Row,
  Screen,
  SectionHeader,
  StatTile,
} from '@components/ui'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { HomeScreen } from '@features/home/HomeScreen'
import { todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { groupByCategory } from './categoryBreakdown'

export function ReportScreen() {
  const ym = todayISO().slice(0, 7)
  const monthTxns =
    useLiveQuery(() => transactionsRepo.getByMonth(ym), [ym]) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []

  // Same "actuals" expense definition this screen has always used (T1 fix,
  // PAIN-POINTS.md): transactionsRepo.getByMonth excludes transfers by default,
  // the `!t.is_transfer` filter below is kept as a belt-and-suspenders no-op so
  // this reads identically to the pre-migration version. F4's per-category
  // breakdown below groups this exact `expenseTxns` array — see
  // categoryBreakdown.ts — so the per-category sums reconcile with `expenses`.
  const income = monthTxns
    .filter((t) => t.direction === 'in' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0)
  const expenseTxns = monthTxns.filter(
    (t) => t.direction === 'out' && !t.is_transfer,
  )
  const expenses = expenseTxns.reduce((s, t) => s + t.amount, 0)

  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id as string, c.name])),
    [categories],
  )
  const breakdown = useMemo(
    () => groupByCategory(expenseTxns, catName),
    [expenseTxns, catName],
  )

  return (
    <Screen>
      {/* This month — actuals (T1: transfers already excluded above). */}
      <Card>
        <SectionHeader>This month — actuals</SectionHeader>
        <div
          style={{
            display: 'flex',
            marginTop: 'var(--space-4)',
            gap: 'var(--space-5)',
          }}
        >
          <StatTile
            label="Income"
            size="title"
            value={<Amount value={income} tone="positive" />}
          />
          <StatTile
            label="Expenses"
            size="title"
            value={<Amount value={expenses} />}
          />
          <StatTile
            label="Net"
            size="title"
            value={
              <Amount
                value={income - expenses}
                style={{
                  color:
                    income >= expenses ? 'var(--engine)' : 'var(--amber-text)',
                }}
              />
            }
          />
        </div>
      </Card>

      {/* F4 — per-category spend breakdown (PAIN-POINTS.md Scenario C): turns
          "you overspent" into "you overspent on X". Placed here rather than
          MonthlyScreen because that screen is plan-only config while this is
          the actuals screen — the pain point is specifically about actuals. */}
      <div>
        <SectionHeader trailing={<Amount value={expenses} />}>
          By category
        </SectionHeader>
        {breakdown.length === 0 ? (
          <div style={emptyStyle}>No expenses logged this month yet.</div>
        ) : (
          <div>
            {breakdown.map((row) => (
              <Row
                key={row.id}
                primary={row.name}
                right={<Amount value={row.amount} />}
              />
            ))}
          </div>
        )}
      </div>

      <HomeScreen />
    </Screen>
  )
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-body)',
  textAlign: 'center',
  padding: 'var(--space-6) 0',
}
