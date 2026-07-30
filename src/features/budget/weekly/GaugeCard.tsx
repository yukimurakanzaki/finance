import { Amount, Card, StatTile } from '@components/ui'
import type { SafeToSpendResult } from '@engine/safeToSpend'
import { useI18n } from '@i18n/index'
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
  const { t } = useI18n()

  if (isNegativePool) {
    return (
      <Card style={gaugeCardStyle}>
        <StatTile
          label={t.budget.safeToSpend}
          value={<Amount value={0} full tone="negative" />}
          sub={t.budget.negativePoolWarning}
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
          label={t.budget.safeToSpend}
          value={<Amount value={weekendAllocation} full />}
          sub={t.budget.weekendReset}
        />
      </Card>
    )
  }

  return (
    <Card style={gaugeCardStyle}>
      <StatTile
        label={t.budget.safeToSpend}
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
              {t.budget.perDayShort}
            </span>
          </>
        }
        sub={
          <>
            <Amount value={remainingPool} full tone="muted" />{' '}
            {t.budget.leftSuffix} · {remainingWorkdays}{' '}
            {remainingWorkdays === 1
              ? t.budget.workdayToGo
              : t.budget.workdaysToGo}
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
