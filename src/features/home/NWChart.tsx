import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'

export function NWChart() {
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('year_month').toArray()) ?? []

  if (snapshots.length < 2) return null

  const values = snapshots.map((s) => s.total)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const W = 300
  const H = 72
  const PAD = 6

  const points = snapshots.map((s, i) => {
    const x = PAD + (i / (snapshots.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((s.total - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const last = snapshots[snapshots.length - 1]
  const prev = snapshots[snapshots.length - 2]
  const delta = last && prev ? last.total - prev.total : null
  const positive = delta !== null && delta >= 0

  return (
    <div style={{
      background: 'var(--bg-1)', borderRadius: 14,
      border: '1px solid var(--border-1)', padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          Net Worth Trend
        </div>
        {delta !== null && (
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: positive ? 'var(--engine)' : '#ef4444' }}>
            {positive ? '+' : '−'}{formatRp(Math.abs(delta))} vs last mo
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}
      >
        {/* Fill area */}
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`${PAD},${H - PAD} ${points} ${W - PAD},${H - PAD}`}
          fill="url(#nw-grad)" stroke="none"
        />
        <polyline
          points={points}
          fill="none" stroke="var(--amber)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Last point dot */}
        {snapshots.length > 0 && (() => {
          const lastIdx = snapshots.length - 1
          const x = PAD + (lastIdx / (snapshots.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((last!.total - min) / range) * (H - PAD * 2)
          return <circle cx={x} cy={y} r={3.5} fill="var(--amber)" />
        })()}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{snapshots[0]?.year_month}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{snapshots[snapshots.length - 1]?.year_month}</div>
      </div>
    </div>
  )
}
