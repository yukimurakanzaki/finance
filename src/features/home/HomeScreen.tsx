import { useNetWorth } from '../../hooks/useNetWorth'
import { useFIProjection } from '../../hooks/useFIProjection'
import { formatRp } from '@lib/currency'
import { LANE_LABELS, ALL_LANES } from '../../constants/lanes'
import { AmberBanner } from '@components/AmberBanner'
import { useAppStore } from '@stores/appStore'
import { NWChart } from './NWChart'

const LANE_COLORS = {
  income_producing: 'var(--engine)',
  store_of_value:   'var(--store)',
  debt_liability:   'var(--debt)',
  protected_living: 'var(--protected)',
} as const

export function HomeScreen() {
  const { total, byLane, isGoldStale, isLoading } = useNetWorth()
  const { result: fi, savingsRate } = useFIProjection()
  const { showGoldNudge, dismissGoldNudge } = useAppStore()

  if (isLoading) {
    return (
      <div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
    )
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Gold staleness nudge */}
      {isGoldStale && (
        <AmberBanner onDismiss={dismissGoldNudge}>
          Gold price hasn't been updated in 30+ days. Tap Assets to update.
        </AmberBanner>
      )}

      {/* Net worth hero */}
      <div style={{
        background: 'var(--bg-1)', borderRadius: 14,
        border: '1px solid var(--border-1)', padding: '20px 18px',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
          Net Worth
        </div>
        <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>
          {total !== null ? formatRp(total) : '—'}
        </div>

        {/* Lane breakdown */}
        {byLane && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALL_LANES.map((lane) => {
              const val = byLane[lane] ?? 0
              return (
                <div key={lane} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: LANE_COLORS[lane], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{LANE_LABELS[lane]}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontFamily: 'var(--font-mono)',
                    color: lane === 'debt_liability' && val > 0 ? 'var(--debt)' : 'var(--ink-1)',
                  }}>
                    {lane === 'debt_liability' && val > 0 ? '−' : ''}{formatRp(Math.abs(val))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Net worth chart */}
      <NWChart />

      {/* FI readout */}
      {fi && (
        <div style={{
          background: 'var(--bg-1)', borderRadius: 14,
          border: '1px solid var(--border-1)', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            FI Projection
          </div>

          {fi.fi_date_path_b && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Path B (Equity switch)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber-text)', fontFamily: 'var(--font-mono)' }}>
                {fi.fi_date_path_b.getFullYear()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>
                {fi.years_to_fi_path_b?.toFixed(1)} years away
              </div>
            </div>
          )}

          {savingsRate && !savingsRate.is_null && (
            <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>Savings Rate</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--engine)', fontFamily: 'var(--font-mono)' }}>
                  {Math.round(savingsRate.rate * 100)}%
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                  {formatRp(savingsRate.pipe_total)} pipe / {formatRp(savingsRate.take_home_net)} net
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>Gap to low target</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', marginTop: 2 }}>
                {formatRp(fi.gap_to_low)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>Gap to high target</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', marginTop: 2 }}>
                {formatRp(fi.gap_to_high)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
