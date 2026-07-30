import { Card, Screen } from '@components/ui'
import { useSafeToSpend } from '../../../hooks/useSafeToSpend'
import { GaugeCard } from './GaugeCard'
import { Waterfall } from './Waterfall'

export function SafeToSpendScreen() {
  const { result, isLoading } = useSafeToSpend()

  if (isLoading) {
    return (
      <Screen>
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
          Loading…
        </div>
      </Screen>
    )
  }

  if (!result) {
    return (
      <Screen>
        <Card style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'var(--text-title)',
              lineHeight: 'var(--leading-title)',
              fontWeight: 600,
              color: 'var(--ink-1)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Set your monthly allowance
          </div>
          <div
            style={{
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-body)',
              color: 'var(--ink-2)',
            }}
          >
            {/* B2 fix: the pool that gates this gauge (useSafeToSpend.ts checks
                allowance.monthly_amount) is set in More → Allowance, not
                Recurring Register — pointing users there left the gauge
                empty. */}
            Go to More → Allowance to configure your personal pool and see your
            daily safe-to-spend ceiling.
          </div>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <GaugeCard result={result} />
      <Waterfall result={result} />
    </Screen>
  )
}
