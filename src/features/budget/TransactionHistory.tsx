import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'

type Period = 'this_month' | 'last_month' | 'this_year' | 'all'

function periodBounds(period: Period): { from: string; to: string } | null {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const ym = `${y}-${String(m).padStart(2, '0')}`

  if (period === 'this_month') return { from: `${ym}-01`, to: todayISO() }
  if (period === 'last_month') {
    const last = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
    const lym = `${last.y}-${String(last.m).padStart(2, '0')}`
    const lastDay = new Date(last.y, last.m, 0).getDate()
    return { from: `${lym}-01`, to: `${lym}-${lastDay}` }
  }
  if (period === 'this_year') return { from: `${y}-01-01`, to: todayISO() }
  return null
}

const PERIOD_LABELS: Record<Period, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  all: 'All time',
}

const LANE_DOT: Record<string, string> = {
  income_producing: 'var(--engine)',
  store_of_value: 'var(--store)',
  debt_liability: 'var(--debt)',
  protected_living: 'var(--protected)',
  pass_through: 'var(--ink-3)',
}

export function TransactionHistory() {
  const [period, setPeriod] = useState<Period>('this_month')
  const [search, setSearch] = useState('')
  const [showTransfers, setShowTransfers] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id!, a.name])), [accounts])

  const txns = useLiveQuery(async () => {
    const bounds = periodBounds(period)
    let query = bounds
      ? db.transactions.where('date').between(bounds.from, bounds.to, true, true)
      : db.transactions.toCollection()
    return query.reverse().toArray()
  }, [period]) ?? []

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (!showTransfers && t.is_transfer) return false
      if (search) {
        const q = search.toLowerCase()
        const note = (t.note ?? '').toLowerCase()
        const acct = (accountMap.get(t.account_id) ?? '').toLowerCase()
        if (!note.includes(q) && !acct.includes(q)) return false
      }
      return true
    })
  }, [txns, showTransfers, search, accountMap])

  const totalOut = filtered.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)
  const totalIn = filtered.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1, padding: '7px 4px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--font-ui)', fontWeight: period === p ? 600 : 400,
              background: period === p ? 'var(--amber)' : 'var(--bg-2)',
              color: period === p ? 'var(--on-accent)' : 'var(--ink-2)',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search notes or account…"
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border-2)',
          borderRadius: 8, color: 'var(--ink-1)', padding: '9px 12px',
          fontSize: 13, outline: 'none', width: '100%', fontFamily: 'var(--font-ui)',
          boxSizing: 'border-box',
        }}
      />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 8 }}>
        <SummaryChip label="Out" value={totalOut} color="var(--ink-2)" />
        <SummaryChip label="In" value={totalIn} color="var(--engine)" />
        <SummaryChip label="Net" value={totalIn - totalOut} color={totalIn >= totalOut ? 'var(--engine)' : '#ef4444'} />
      </div>

      {/* Transfers toggle */}
      <button
        onClick={() => setShowTransfers(!showTransfers)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 11, color: showTransfers ? 'var(--amber-text)' : 'var(--ink-3)',
          textAlign: 'left', fontFamily: 'var(--font-ui)',
        }}
      >
        {showTransfers ? '✓' : '○'} Show transfers
      </button>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            No transactions found.
          </div>
        )}
        {filtered.map((t) => (
          <div key={t.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-1)', border: '1px solid var(--border-1)',
            borderRadius: 8, padding: '10px 12px',
            opacity: t.is_transfer ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: LANE_DOT[t.lane] ?? 'var(--ink-3)',
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.note || accountMap.get(t.account_id) || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
                  {t.date} · {accountMap.get(t.account_id) ?? '?'}
                  {t.is_transfer && ' · transfer'}
                </div>
              </div>
            </div>
            <div style={{
              fontSize: 13, fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 10,
              color: t.direction === 'in' ? 'var(--engine)' : 'var(--ink-1)',
            }}>
              {t.direction === 'in' ? '+' : '−'}{formatRp(t.amount)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>
        {filtered.length} transactions
      </div>
    </div>
  )
}

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-2)', borderRadius: 8, padding: '8px 10px',
      border: '1px solid var(--border-1)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color }}>{formatRp(Math.abs(value))}</div>
    </div>
  )
}
