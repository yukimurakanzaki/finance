import { useLiveQuery } from 'dexie-react-hooks'
import { HomeScreen } from '@features/home/HomeScreen'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'

export function ReportScreen() {
  const ym = todayISO().slice(0, 7)
  const monthTxns = useLiveQuery(() => transactionsRepo.getByMonth(ym), [ym]) ?? []
  const income = monthTxns.filter((t) => t.direction === 'in' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxns.filter((t) => t.direction === 'out' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
            This month — actuals
          </div>
          <MonthRow label="Income" value={income} color="var(--engine)" />
          <MonthRow label="Expenses" value={expenses} color="var(--ink-1)" />
          <div style={{ height: 1, background: 'var(--border-1)', margin: '8px 0' }} />
          <MonthRow label="Net" value={income - expenses} color={income >= expenses ? 'var(--engine)' : 'var(--amber-text)'} />
        </div>
      </div>
      <HomeScreen />
    </div>
  )
}

function MonthRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{formatRp(value)}</span>
    </div>
  )
}
