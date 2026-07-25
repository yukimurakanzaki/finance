import { Amount, Badge, Row, SectionHeader } from '@components/ui'
import type { SafeToSpendResult } from '@engine/safeToSpend'

interface Props {
  result: SafeToSpendResult
}

export function Waterfall({ result }: Props) {
  const {
    payYourselfFirstTotal,
    householdBillTotal,
    personalPool,
    personalSubTotal,
    weekendAllocation,
    weekPool,
  } = result

  return (
    <div>
      <SectionHeader>How this number is built</SectionHeader>

      <div>
        {/* Committed items funded outside the personal pool. Shown for
            context — the allowance is already net of these, so they are NOT
            subtracted here. */}
        <Row
          primary={
            <>
              Pipe + DPLK <Badge tone="positive">Committed</Badge>
            </>
          }
          right={<Amount value={payYourselfFirstTotal} full tone="muted" />}
        />
        <Row
          primary={
            <>
              Household bills <Badge tone="positive">Committed</Badge>
            </>
          }
          right={<Amount value={householdBillTotal} full tone="muted" />}
        />
        <Row
          primary={
            <>
              Personal subs <Badge tone="positive">Committed</Badge>
            </>
          }
          right={<Amount value={personalSubTotal} full tone="muted" />}
        />
        <div
          style={{
            fontSize: 'var(--text-caption)',
            lineHeight: 'var(--leading-caption)',
            color: 'var(--ink-3)',
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          Your allowance is already net of these — they don't come out of the
          pool again.
        </div>

        <Row
          primary="Personal pool (allowance)"
          right={<Amount value={personalPool} full />}
        />
        <Row
          primary="− Weekend, pre-allocated"
          right={<Amount value={-weekendAllocation} full tone="muted" />}
          style={{ background: 'var(--bg-2)' }}
        />
        <Row
          primary={
            <span style={{ fontWeight: 700, color: 'var(--ink-1)' }}>
              = Workweek pool
            </span>
          }
          right={
            <span style={{ fontWeight: 700 }}>
              ~<Amount value={weekPool} full />
            </span>
          }
        />
      </div>
    </div>
  )
}
