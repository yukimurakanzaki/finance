import type { SafeToSpendResult } from '@engine/safeToSpend'
import { formatRp, formatRpFull } from '@lib/currency'
import { DayDots } from './DayDots'

interface Props {
  result: SafeToSpendResult
}

export function GaugeCard({ result }: Props) {
  const { todayCeiling, remainingPool, remainingWorkdays, isNegativePool } = result

  return (
    <div style={{
      background: 'var(--amber-surface)',
      border: '1px solid var(--amber-border)',
      borderRadius: 14,
      padding: '16px 16px 14px',
    }}>
      <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--amber-dim)', fontWeight: 600 }}>
        Safe to spend today
      </div>

      {isNegativePool ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', fontFamily: 'var(--font-mono)', color: 'var(--amber-text)' }}>
            Rp 0<small style={{ fontSize: 18, color: 'var(--amber-dim)', fontWeight: 500 }}> /day</small>
          </div>
          <div style={{ fontSize: 12, color: 'var(--amber-text)', marginTop: 6 }}>
            Committed items exceed your allowance this month. Review your recurring items.
          </div>
        </div>
      ) : remainingWorkdays === 0 ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--amber-text)', fontFamily: 'var(--font-mono)' }}>
            Weekend
          </div>
          <div style={{ fontSize: 12, color: 'var(--amber-dim)', marginTop: 4 }}>
            Your weekend allocation is pre-carved. Resets Monday.
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
              {formatRp(todayCeiling)}
              <small style={{ fontSize: 18, color: 'var(--ink-2)', fontWeight: 500 }}> /day</small>
            </div>
            <div style={{ fontSize: 12, color: 'var(--amber-dim)', marginTop: 4 }}>
              {formatRpFull(remainingPool)} left · {remainingWorkdays} workday{remainingWorkdays !== 1 ? 's' : ''} to go
            </div>
          </div>

          <DayDots />
        </>
      )}
    </div>
  )
}
