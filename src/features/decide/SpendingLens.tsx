import { Field, Input } from '@components/FormField'
import { Card } from '@components/ui'
import { db } from '@db/db'
import type { Lane } from '@db/types'
import { formatRp, parseRpInput } from '@lib/currency'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'

const LANE_OPTIONS: { value: Lane; label: string }[] = [
  { value: 'income_producing', label: 'Income Producing' },
  { value: 'store_of_value', label: 'Store of Value' },
  { value: 'protected_living', label: 'Protected Living' },
  { value: 'debt_liability', label: 'Debt / Liability' },
]

const LANE_VERDICT: Record<
  Lane,
  { color: string; label: string; sub: string }
> = {
  income_producing: {
    color: 'var(--engine)',
    label: 'This grows wealth',
    sub: 'Moves you toward FI. Keep going.',
  },
  store_of_value: {
    color: 'var(--store)',
    label: 'This preserves wealth',
    sub: 'Not compounding, but not burning either.',
  },
  protected_living: {
    color: 'var(--protected)',
    label: 'This maintains life',
    sub: 'Necessary cost. Keep it lean.',
  },
  debt_liability: {
    color: 'var(--ink-2)',
    label: 'This reduces debt',
    sub: 'Good use — debt is negative compounding.',
  },
  pass_through: {
    color: 'var(--ink-3)',
    label: 'Not your money',
    sub: 'Held for others — outside your own spending picture.',
  },
}

// Reused as-is from both the Decide sheet's "Spending Lens" tab and, per B3
// (PAIN-POINTS.md), a lightweight entry point on Today's standing strip —
// no props, no duplicated logic: same component, two doors in.
export function SpendingLens() {
  const [raw, setRaw] = useState('')
  const [lane, setLane] = useState<Lane>('protected_living')

  const allowance = useLiveQuery(() => db.allowance.get('local'))
  const latestIncome = useLiveQuery(() =>
    db.incomeEvents.orderBy('date').last(),
  )

  const amount = parseRpInput(raw) ?? 0
  const takeHome = latestIncome?.take_home_net ?? 0
  const monthlyPool = allowance?.monthly_amount ?? 0
  const dailyCeiling = monthlyPool > 0 ? monthlyPool / 22 : 0

  const metrics = useMemo(() => {
    if (!amount) return null
    const pctOfTakeHome = takeHome > 0 ? amount / takeHome : null
    const daysOfCeiling = dailyCeiling > 0 ? amount / dailyCeiling : null
    const hourlyRate = takeHome > 0 ? takeHome / (22 * 8) : null
    const hoursOfWork = hourlyRate ? amount / hourlyRate : null
    return { pctOfTakeHome, daysOfCeiling, hoursOfWork }
  }, [amount, takeHome, dailyCeiling])

  const verdict = LANE_VERDICT[lane]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-section)',
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        Enter an amount and pick its lane to see what you're really trading.
      </div>

      <Field label="Amount (Rp)">
        <Input
          type="text"
          inputMode="numeric"
          mono
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="250.000"
          style={{
            fontSize: 'var(--text-title)',
            textAlign: 'center',
            padding: 'var(--space-4)',
          }}
        />
      </Field>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {LANE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setLane(o.value)}
            style={{
              flex: 1,
              padding: 'var(--space-2) var(--space-1)',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              fontFamily: 'var(--font-ui)',
              fontWeight: lane === o.value ? 600 : 400,
              background:
                lane === o.value ? LANE_VERDICT[o.value].color : 'var(--bg-2)',
              color: lane === o.value ? 'var(--on-accent)' : 'var(--ink-3)',
              transition: 'background .15s',
            }}
          >
            {o.label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Verdict */}
      <Card
        padding="var(--space-3) var(--space-4)"
        style={{
          background: 'var(--bg-2)',
          border: `1px solid ${verdict.color}33`,
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-section)',
            fontWeight: 600,
            color: verdict.color,
          }}
        >
          {verdict.label}
        </div>
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--ink-2)',
            marginTop: 4,
          }}
        >
          {verdict.sub}
        </div>
      </Card>

      {/* Metrics */}
      {metrics && amount > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {metrics.pctOfTakeHome !== null && (
            <MetricRow
              label="% of monthly take-home"
              value={`${(metrics.pctOfTakeHome * 100).toFixed(1)}%`}
              sub={`of ${formatRp(takeHome)}/mo`}
            />
          )}
          {metrics.daysOfCeiling !== null && (
            <MetricRow
              label="Days of spending budget"
              value={
                metrics.daysOfCeiling >= 1
                  ? `${metrics.daysOfCeiling.toFixed(1)} days`
                  : `${(metrics.daysOfCeiling * 8).toFixed(1)} hrs`
              }
              sub={`daily ceiling ~${formatRp(Math.round(dailyCeiling))}`}
            />
          )}
          {metrics.hoursOfWork !== null && (
            <MetricRow
              label="Hours of life traded"
              value={`${metrics.hoursOfWork.toFixed(1)} hrs`}
              sub={`≈ ${(metrics.hoursOfWork / 8).toFixed(1)} work days`}
            />
          )}
          <MetricRow
            label="Amount"
            value={formatRp(amount)}
            sub="what you enter"
            highlight
          />
        </div>
      )}

      {!latestIncome && (
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          Add income in the raise log below for full metrics.
        </div>
      )}
    </div>
  )
}

function MetricRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: highlight ? 'var(--amber-surface)' : 'var(--bg-1)',
        border: `1px solid ${highlight ? 'var(--amber-border)' : 'var(--border-1)'}`,
        borderRadius: 8,
        padding: 'var(--space-2) var(--space-3)',
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      </div>
      <div
        style={{
          fontSize: 'var(--text-title)',
          fontFamily: 'var(--font-mono)',
          color: highlight ? 'var(--amber-text)' : 'var(--ink-1)',
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  )
}
