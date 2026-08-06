import { Amount, Card, StatTile } from '@components/ui'
import { explainSafeToSpend } from '@engine/explain'
import type { SafeToSpendResult } from '@engine/safeToSpend'
import { useI18n } from '@i18n/index'
import { useState } from 'react'
import { ExplainSheet } from '../ExplainSheet'
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
  const [explaining, setExplaining] = useState(false)

  // Built from the same result object the card rendered its number from
  // (FR-4.1) — the sheet cannot drift from the gauge.
  const explanation = explainSafeToSpend(result)

  // NFR-4.3: a real button with an accessible name, not a tappable glyph.
  const explainButton = (
    <button
      type="button"
      aria-label={t.budget.explain.openLabel}
      onClick={() => setExplaining(true)}
      style={{
        background: 'none',
        border: '1px solid var(--amber-border)',
        borderRadius: 999,
        width: 22,
        height: 22,
        padding: 0,
        cursor: 'pointer',
        color: 'var(--amber-text)',
        fontSize: 'var(--text-caption)',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      ?
    </button>
  )

  const sheet = (
    <ExplainSheet
      open={explaining}
      onClose={() => setExplaining(false)}
      explanation={explanation}
    />
  )

  if (isNegativePool) {
    return (
      <Card style={gaugeCardStyle}>
        <div style={headerRowStyle}>
          <StatTile
            label={t.budget.safeToSpend}
            value={<Amount value={0} full tone="negative" />}
            sub={t.budget.negativePoolWarning}
          />
          {explainButton}
        </div>
        {sheet}
      </Card>
    )
  }

  if (remainingWorkdays === 0) {
    // O3 fix: the weekend allocation is a real configured number — surface it
    // instead of the bare word "Weekend" (mirrored from TodayScreen's
    // SafeToSpendHero so the two don't diverge).
    return (
      <Card style={gaugeCardStyle}>
        <div style={headerRowStyle}>
          <StatTile
            label={t.budget.safeToSpend}
            value={<Amount value={weekendAllocation} full />}
            sub={t.budget.weekendReset}
          />
          {explainButton}
        </div>
        {sheet}
      </Card>
    )
  }

  return (
    <Card style={gaugeCardStyle}>
      <div style={headerRowStyle}>
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
      {explainButton}
      </div>
      <DayDots />
      {sheet}
    </Card>
  )
}

// The affordance sits beside the tile, not inside its label: StatTile's label is
// a plain string by design (uppercase-tracked data label, D3) and widening that
// shared primitive to fit one caller would push the treatment onto every tile.
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const gaugeCardStyle: React.CSSProperties = {
  background: 'var(--amber-surface)',
  border: '1px solid var(--amber-border)',
}
