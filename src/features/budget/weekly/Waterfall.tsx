import type { SafeToSpendResult } from '@engine/safeToSpend'
import { formatRpFull } from '@lib/currency'

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
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        How this number is built
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Paid first rows */}
        <WRow
          label={<>Pipe + DPLK <Badge>✓ Paid first</Badge></>}
          value={formatRpFull(payYourselfFirstTotal)}
          dim
        />
        <WRow
          label={<>Household bills <Badge>✓ Paid first</Badge></>}
          value={formatRpFull(householdBillTotal)}
          dim
        />

        <Divider />

        <WRow label="Personal pool (allowance)" value={formatRpFull(personalPool)} />
        <WRow label="− Personal subs" value={`−${formatRpFull(personalSubTotal)}`} />
        <WRow
          label="− Weekend, pre-allocated"
          value={`−${formatRpFull(weekendAllocation)}`}
          carved
        />

        <Divider bold />

        <WRow
          label="= Workweek pool"
          value={`~${formatRpFull(weekPool)}`}
          bold
        />
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      background: 'var(--engine-bg)',
      color: 'var(--engine)',
      borderRadius: 4,
      fontSize: 9,
      fontWeight: 600,
      padding: '1px 5px',
      marginLeft: 6,
      textTransform: 'uppercase',
      letterSpacing: '.3px',
    }}>
      {children}
    </span>
  )
}

function WRow({
  label, value, dim, bold, carved,
}: {
  label: React.ReactNode
  value: string
  dim?: boolean
  bold?: boolean
  carved?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: carved ? '4px 8px' : '4px 0',
      background: carved ? 'var(--bg-2)' : 'transparent',
      borderRadius: carved ? 6 : 0,
      margin: carved ? '2px 0' : 0,
    }}>
      <span style={{ fontSize: 12, color: dim ? 'var(--ink-3)' : 'var(--ink-2)', fontWeight: bold ? 600 : 400 }}>
        {label}
      </span>
      <span style={{
        fontSize: 12, fontFamily: 'var(--font-mono)',
        color: dim ? 'var(--ink-3)' : bold ? 'var(--ink-1)' : 'var(--ink-2)',
        fontWeight: bold ? 700 : 500,
      }}>
        {value}
      </span>
    </div>
  )
}

function Divider({ bold }: { bold?: boolean }) {
  return (
    <div style={{
      height: 1,
      background: bold ? 'var(--ink-3)' : 'var(--border-1)',
      margin: '6px 0',
    }} />
  )
}
