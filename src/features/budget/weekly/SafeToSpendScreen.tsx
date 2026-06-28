import { useSafeToSpend } from '../../../hooks/useSafeToSpend'
import { GaugeCard } from './GaugeCard'
import { Waterfall } from './Waterfall'

export function SafeToSpendScreen() {
  const { result, isLoading } = useSafeToSpend()

  if (isLoading) {
    return <div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
  }

  if (!result) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{
          background: 'var(--bg-2)', borderRadius: 12,
          border: '1px solid var(--border-1)', padding: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
            Set your monthly allowance
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Go to More → Recurring Register to configure your personal pool and see your daily safe-to-spend ceiling.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <GaugeCard result={result} />
      <Waterfall result={result} />
    </div>
  )
}
