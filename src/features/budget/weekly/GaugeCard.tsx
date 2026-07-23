import { Amount, Card, StatTile } from '@components/ui'
import type { SafeToSpendResult } from '@engine/safeToSpend'
import { DayDots } from './DayDots'

interface Props {
  result: SafeToSpendResult
}

// Mirrors TodayScreen's SafeToSpendHero (null/negative-pool/weekend/normal
// branches — PHASE-3-HANDOFF.md §2.1) so the Today standing strip and the
// Budget gauge tell the same story through the same primitives. This card
// keeps the one visual difference that gives the gauge its identity: the
// amber tint and the day-dots row (Calm Ledger v2 — "the card container
// survives only for the hero stat and the gauge").
export function GaugeCard({ result }: Props) {
  const {
    todayCeiling,
    remainingPool,
    remainingWorkdays,
    isNegativePool,
    weekendAllocation,
  } = result

  if (isNegativePool) {
    return (
      <Card style={gaugeCardStyle}>
        <StatTile
          label="Safe to spend today"
          value={<Amount value={0} full tone="negative" />}
          sub="Committed items exceed your allowance this month. Review your recurring items."
        />
      </Card>
    )
  }

  if (remainingWorkdays === 0) {
    // O3 fix: the weekend allocation is a real configured number — surface it
    // instead of the bare word "Weekend" (mirrored from TodayScreen's
    // SafeToSpendHero so the two don't diverge).
    return (
      <Card style={gaugeCardStyle}>
        <StatTile
          label="Safe to spend today"
          value={<Amount value={weekendAllocation} full />}
          sub="Weekend allowance, pre-carved. Resets Monday."
        />
      </Card>
    )
  }

  return (
    <Card style={gaugeCardStyle}>
      <StatTile
        label="Safe to spend today"
        value={
          <>
            <Amount value={todayCeiling} full />
            <span
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--ink-3)',
                fontWeight: 500,
              }}
            >
              {' '}
              /day
            </span>
          </>
        }
        sub={
          <>
            <Amount value={remainingPool} full tone="muted" /> left ·{' '}
            {remainingWorkdays} workday{remainingWorkdays !== 1 ? 's' : ''} to
            go
          </>
        }
      />
      <DayDots />
    </Card>
  )
}

const gaugeCardStyle: React.CSSProperties = {
  background: 'var(--amber-surface)',
  border: '1px solid var(--amber-border)',
}
