import { AmberBanner } from '@components/AmberBanner'
import { Amount, Card, SectionHeader, StatTile } from '@components/ui'
import { formatRp } from '@lib/currency'
import { useAppStore } from '@stores/appStore'
import { ALL_LANES, LANE_LABELS } from '../../constants/lanes'
import { useFIProjection } from '../../hooks/useFIProjection'
import { useNetWorth } from '../../hooks/useNetWorth'
import { NWChart } from './NWChart'

const LANE_COLORS = {
  income_producing: 'var(--engine)',
  store_of_value: 'var(--store)',
  debt_liability: 'var(--debt)',
  protected_living: 'var(--protected)',
  pass_through: 'var(--ink-3)',
} as const

export function HomeScreen() {
  const { total, byLane, isGoldStale, isLoading } = useNetWorth()
  const { result: fi, savingsRate } = useFIProjection()
  const { showGoldNudge, dismissGoldNudge } = useAppStore()

  if (isLoading) {
    return (
      <div
        style={{
          color: 'var(--ink-3)',
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-body)',
        }}
      >
        Loading…
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      {/* Gold staleness nudge */}
      {isGoldStale && (
        <AmberBanner onDismiss={dismissGoldNudge}>
          Gold price hasn't been updated in 30+ days. Tap Assets to update.
        </AmberBanner>
      )}

      {/* Net worth hero — the screen's one hero number (Calm Ledger v2 §2). */}
      <Card>
        <StatTile
          label="Net Worth"
          size="display"
          value={total !== null ? <Amount value={total} /> : '—'}
        />

        {/* Lane breakdown */}
        {byLane && (
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {ALL_LANES.filter(
              (lane) => lane !== 'pass_through' || (byLane[lane] ?? 0) !== 0,
            ).map((lane) => {
              const val = byLane[lane] ?? 0
              const isDebt = lane === 'debt_liability' && val > 0
              return (
                <div
                  key={lane}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: LANE_COLORS[lane],
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        lineHeight: 'var(--leading-caption)',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {LANE_LABELS[lane]}
                    </span>
                  </div>
                  {/* Preserves the original glyph/colour exactly: a '−' glyph only
                      appears for a positive debt-liability balance (isDebt), and
                      the magnitude is always |val| — the same rule the pre-migration
                      inline JSX used, just expressed through <Amount>. */}
                  <Amount
                    value={isDebt ? -Math.abs(val) : Math.abs(val)}
                    style={{
                      fontSize: 'var(--text-caption)',
                      lineHeight: 'var(--leading-caption)',
                      color: isDebt ? 'var(--debt)' : 'var(--ink-1)',
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Net worth chart */}
      <NWChart />

      {/* FI readout */}
      {fi && (
        <Card>
          <SectionHeader>FI Projection</SectionHeader>
          <div
            style={{
              marginTop: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            {fi.fi_date_path_b && (
              <StatTile
                label="Path B (Equity switch)"
                size="title"
                value={
                  <span
                    style={{
                      color: 'var(--amber-text)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {fi.fi_date_path_b.getFullYear()}
                  </span>
                }
                sub={`${fi.years_to_fi_path_b?.toFixed(1)} years away`}
              />
            )}

            {savingsRate && !savingsRate.is_null && (
              <div
                style={{
                  borderTop: '1px solid var(--border-1)',
                  paddingTop: 'var(--space-3)',
                }}
              >
                <StatTile
                  label="Savings Rate"
                  size="title"
                  value={
                    <span
                      style={{
                        color: 'var(--engine)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {Math.round(savingsRate.rate * 100)}%
                    </span>
                  }
                  sub={`${formatRp(savingsRate.pipe_total)} pipe / ${formatRp(savingsRate.take_home_net)} net`}
                />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--border-1)',
                paddingTop: 'var(--space-3)',
              }}
            >
              <StatTile
                label="Gap to low target"
                size="title"
                value={<Amount value={fi.gap_to_low} />}
              />
              <StatTile
                label="Gap to high target"
                size="title"
                value={<Amount value={fi.gap_to_high} />}
                style={{ alignItems: 'flex-end' }}
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
