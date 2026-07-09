import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRpFull } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { TransactionForm } from './TransactionForm'
import { SpeedDialFAB } from './SpeedDialFAB'
import type { Transaction } from '@db/types'

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function TodayScreen() {
  const [day, setDay] = useState(todayISO())
  const [form, setForm] = useState<{ mode: 'out' | 'in' | 'transfer'; editing?: Transaction } | null>(null)

  const txns = useLiveQuery(
    () => db.transactions.where('date').equals(day).toArray(),
    [day],
  ) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []

  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const income = txns.filter((t) => t.direction === 'in' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)
  const expenses = txns.filter((t) => t.direction === 'out' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)

  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: { txn: Transaction; transferTo?: string | undefined }[] = []
    const sorted = [...txns].sort((a, b) => b.created_at.localeCompare(a.created_at))
    for (const t of sorted) {
      if (t.is_transfer && t.transfer_pair_id) {
        if (seen.has(t.transfer_pair_id)) continue
        seen.add(t.transfer_pair_id)
        const other = txns.find((o) => o.transfer_pair_id === t.transfer_pair_id && o.id !== t.id)
        const outLeg = t.direction === 'out' ? t : (other ?? t)
        const inLeg = t.direction === 'in' ? t : other
        out.push({ txn: outLeg, transferTo: inLeg ? accName.get(inLeg.account_id) : undefined })
      } else {
        out.push({ txn: t })
      }
    }
    return out
  }, [txns, accName])

  return (
    <div style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day" style={navBtn}>‹</button>
        <label style={{ position: 'relative', fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', cursor: 'pointer' }}>
          {dayLabel(day)}
          <input
            type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
        <button onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day" style={navBtn}>›</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <DayChip label="Income" value={income} color="var(--engine)" />
        <DayChip label="Expenses" value={expenses} color="var(--ink-1)" />
        <DayChip label="Balance" value={income - expenses} color={income >= expenses ? 'var(--engine)' : 'var(--amber-text)'} />
      </div>

      {rows.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
          No transactions on this day
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ txn, transferTo }) => (
          <button
            key={txn.id}
            onClick={() => setForm({ mode: txn.is_transfer ? 'transfer' : txn.direction, editing: txn })}
            style={{
              background: 'var(--bg-1)', border: `1px ${txn.is_transfer ? 'dashed' : 'solid'} var(--border-1)`,
              borderRadius: 10, padding: '11px 13px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: txn.is_transfer ? 'var(--ink-2)' : 'var(--ink-1)' }}>
                {txn.is_transfer
                  ? `${accName.get(txn.account_id) ?? '?'} → ${transferTo ?? '?'}`
                  : (txn.title ?? txn.note ?? catName.get(txn.category_id ?? '') ?? '(no title)')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                {txn.is_transfer
                  ? 'Transfer'
                  : [catName.get(txn.category_id ?? ''), accName.get(txn.account_id)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: txn.is_transfer ? 'var(--ink-3)' : txn.direction === 'in' ? 'var(--engine)' : 'var(--ink-1)' }}>
              {txn.is_transfer ? '' : txn.direction === 'in' ? '+' : '−'}{formatRpFull(txn.amount).replace('Rp ', '')}
            </div>
          </button>
        ))}
      </div>

      <SpeedDialFAB onAdd={(mode) => setForm({ mode })} />

      {form && (
        <TransactionForm
          key={form.editing?.id ?? form.mode}
          open onClose={() => setForm(null)}
          mode={form.mode} defaultDate={day}
          {...(form.editing ? { editing: form.editing } : {})}
        />
      )}
    </div>
  )
}

function DayChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color, marginTop: 3 }}>
        {formatRpFull(value).replace('Rp ', '')}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8,
  color: 'var(--ink-2)', width: 34, height: 34, fontSize: 18, cursor: 'pointer',
}
