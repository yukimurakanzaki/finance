import { AmberBanner } from '@components/AmberBanner'
import { Amount, Card, SectionHeader, StatTile } from '@components/ui'
import { useI18n } from '@i18n/index'
import { formatRp } from '@lib/currency'
import { useAppStore } from '@stores/appStore'
import { ALL_LANES } from '../../constants/lanes'
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
  const { t } = useI18n()

  if (isLoading) {
    return (
      <div
        style={{
          color: 'var(--ink-3)',
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-body)',
        }}
      >
        {t.common.loading}
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
          {t.home.goldStaleWarning}
        </AmberBanner>
      )}

      {/* Net worth hero — the screen's one hero number (Calm Ledger v2 §2). */}
      <Card>
        <StatTile
          label={t.home.netWorth}
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
                      {t.home.lanes[lane]}
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
          <SectionHeader>{t.home.fiProjection}</SectionHeader>
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
                label={t.home.pathB}
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
                sub={`${fi.years_to_fi_path_b?.toFixed(1)} ${t.home.yearsAway}`}
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
                  label={t.home.savingsRate}
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
                  sub={t.home.pipeVsNet
                    .replace('{pipe}', formatRp(savingsRate.pipe_total))
                    .replace('{net}', formatRp(savingsRate.take_home_net))}
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
                label={t.home.gapToLowTarget}
                size="title"
                value={<Amount value={fi.gap_to_low} />}
              />
              <StatTile
                label={t.home.gapToHighTarget}
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
