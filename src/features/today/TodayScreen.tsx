import {
  Amount,
  Card,
  Icon,
  Row,
  Screen,
  SectionHeader,
  StatTile,
} from '@components/ui'
import { db } from '@db/db'
import type { Transaction } from '@db/types'
import { todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useDailyLeftover } from '../../hooks/useDailyLeftover'
import { useSafeToSpend } from '../../hooks/useSafeToSpend'
import { SpeedDialFAB } from './SpeedDialFAB'
import { TransactionForm } from './TransactionForm'

type Scope = 'today' | 'week' | 'month' | 'all'

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function monthBounds(day: string) {
  const start = `${day.slice(0, 7)}-01`
  const [y, m] = start.split('-').map(Number) as [number, number]
  const end = `${start.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  return { start, end }
}

function weekBounds(day: string) {
  const d = new Date(`${day}T12:00:00`)
  const dow = (d.getDay() + 6) % 7
  const start = new Date(d)
  start.setDate(d.getDate() - dow)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const toISO = (x: Date) => {
    const m = String(x.getMonth() + 1).padStart(2, '0')
    return `${x.getFullYear()}-${m}-${String(x.getDate()).padStart(2, '0')}`
  }
  return { start: toISO(start), end: toISO(end) }
}

function boundsFor(scope: Scope, day: string) {
  if (scope === 'today') return { start: day, end: day }
  if (scope === 'week') return weekBounds(day)
  if (scope === 'month') return monthBounds(day)
  return null
}

function scopeLabel(scope: Scope) {
  if (scope === 'today') return 'Today'
  if (scope === 'week') return 'Week'
  if (scope === 'month') return 'Month'
  return 'All'
}

export function TodayScreen() {
  const [day, setDay] = useState(todayISO())
  const [scope, setScope] = useState<Scope>('today')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{
    mode: 'out' | 'in' | 'transfer'
    editing?: Transaction
  } | null>(null)

  const bounds = useMemo(() => boundsFor(scope, day), [scope, day])
  const txns =
    useLiveQuery(async () => {
      if (!bounds) return db.transactions.orderBy('date').reverse().toArray()
      return db.transactions
        .where('date')
        .between(bounds.start, bounds.end, true, true)
        .reverse()
        .toArray()
    }, [bounds?.start, bounds?.end, scope]) ?? []

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const safe = useSafeToSpend()
  const balances = useAccountBalances()
  const leftover = useDailyLeftover(day)

  const accName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  )
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )
  const todayRows =
    useLiveQuery(
      () => db.transactions.where('date').equals(day).toArray(),
      [day],
    ) ?? []
  const spentToday = todayRows
    .filter((t) => t.direction === 'out' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const seen = new Set<string>()
    const out: { txn: Transaction; transferTo?: string }[] = []
    const sorted = [...txns].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    )
    for (const t of sorted) {
      const category = catName.get(t.category_id ?? '') ?? ''
      const account = accName.get(t.account_id) ?? ''
      const haystack = [t.title, category, t.note, account]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (q && !haystack.includes(q)) continue
      if (t.is_transfer && t.transfer_pair_id) {
        if (seen.has(t.transfer_pair_id)) continue
        seen.add(t.transfer_pair_id)
        const other = txns.find(
          (o) => o.transfer_pair_id === t.transfer_pair_id && o.id !== t.id,
        )
        const outLeg = t.direction === 'out' ? t : (other ?? t)
        const inLeg = t.direction === 'in' ? t : other
        const transferTo = inLeg ? accName.get(inLeg.account_id) : undefined
        out.push(transferTo ? { txn: outLeg, transferTo } : { txn: outLeg })
      } else out.push({ txn: t })
    }
    return out
  }, [txns, search, catName, accName])

  const totalOut = rows
    .filter(({ txn }) => txn.direction === 'out' && !txn.is_transfer)
    .reduce((s, { txn }) => s + txn.amount, 0)
  const totalIn = rows
    .filter(({ txn }) => txn.direction === 'in' && !txn.is_transfer)
    .reduce((s, { txn }) => s + txn.amount, 0)
  const isToday = day === todayISO()

  return (
    <Screen style={{ paddingBottom: 'calc(var(--space-6) * 3)' }}>
      <Card>
        <StatTile
          label="Safe to spend today"
          value={
            safe.result?.isNegativePool ||
            safe.result?.remainingWorkdays === 0 ? (
              <Amount value={0} sign="never" />
            ) : (
              <Amount value={safe.result?.todayCeiling ?? 0} sign="never" />
            )
          }
          sub={
            safe.result?.isNegativePool
              ? 'Committed items exceed allowance'
              : safe.result?.remainingWorkdays === 0
                ? 'Weekend · resets Monday'
                : '/day'
          }
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
          }}
        >
          <StatTile
            label="Spent today"
            size="title"
            value={<Amount value={spentToday} sign="never" />}
          />
          <StatTile
            label="Wallet balance"
            size="title"
            value={<Amount value={balances?.total ?? 0} sign="never" />}
          />
          <StatTile
            label="Monthly leftover"
            size="title"
            value={
              <Amount
                value={leftover.result?.leftover ?? 0}
                tone={
                  (leftover.result?.leftover ?? 0) < 0 ? 'negative' : 'default'
                }
              />
            }
            sub={leftover.result?.isProjected ? 'projected' : undefined}
          />
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <IconButton
          label="Previous day"
          onClick={() => setDay(shiftDay(day, -1))}
          icon="chevron-left"
        />
        <label
          style={{
            position: 'relative',
            flex: 1,
            textAlign: 'center',
            color: 'var(--ink-1)',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-body)',
              fontWeight: 600,
            }}
          >
            {dayLabel(day)}
          </span>
          {isToday ? (
            <span
              style={{
                display: 'inline-flex',
                marginTop: 'var(--space-1)',
                color: 'var(--accent-text)',
                fontSize: 'var(--text-caption)',
                lineHeight: 'var(--leading-caption)',
              }}
            >
              Today
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setDay(todayISO())
              }}
              style={pillStyle}
            >
              Back to today
            </button>
          )}
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </label>
        <IconButton
          label="Next day"
          onClick={() => setDay(shiftDay(day, 1))}
          icon="chevron-right"
        />
      </div>

      <div
        style={{ display: 'flex', gap: 'var(--space-2)' }}
        aria-label="Transaction period scope"
      >
        {(['today', 'week', 'month', 'all'] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            style={segmentStyle(scope === s)}
          >
            {scopeLabel(s)}
          </button>
        ))}
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: 'var(--bg-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--space-2)',
          padding: 'var(--space-3)',
          color: 'var(--ink-2)',
        }}
      >
        <Icon name="search" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, category, or note…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink-1)',
            font: 'inherit',
            minWidth: 0,
          }}
        />
      </label>

      <SectionHeader
        trailing={
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
            <span>{rows.length} ·</span>
            <Amount value={totalIn - totalOut} sign="auto" />
          </span>
        }
      >
        Transactions
      </SectionHeader>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 && (
          <div
            style={{
              color: 'var(--ink-3)',
              fontSize: 'var(--text-section)',
              lineHeight: 'var(--leading-section)',
              textAlign: 'center',
              padding: 'var(--space-6) 0',
            }}
          >
            No transactions found.
          </div>
        )}
        {rows.map(({ txn, transferTo }) => {
          const category = catName.get(txn.category_id ?? '')
          const account = accName.get(txn.account_id)
          const title = txn.is_transfer
            ? `${account ?? '?'} → ${transferTo ?? '?'}`
            : (txn.title ?? txn.note ?? category ?? '(no title)')
          const caption = txn.is_transfer
            ? 'Transfer'
            : [category, account, scope === 'today' ? null : txn.date]
                .filter(Boolean)
                .join(' · ')
          return (
            <Row
              key={txn.id}
              {...(txn.is_transfer ? { icon: <Icon name="transfer" /> } : {})}
              primary={title}
              caption={caption}
              right={
                txn.is_transfer ? (
                  <Amount value={0} tone="muted" sign="never" />
                ) : (
                  <Amount
                    value={txn.direction === 'in' ? txn.amount : -txn.amount}
                    tone={txn.direction === 'in' ? 'positive' : 'default'}
                    sign="auto"
                  />
                )
              }
              onClick={() =>
                setForm({
                  mode: txn.is_transfer ? 'transfer' : txn.direction,
                  editing: txn,
                })
              }
              aria-label={`Edit ${title}`}
              {...(txn.is_transfer ? { style: { opacity: '.7' } } : {})}
            />
          )
        })}
      </div>

      <SpeedDialFAB onAdd={(mode) => setForm({ mode })} />

      {form && (
        <TransactionForm
          key={form.editing?.id ?? form.mode}
          open
          onClose={() => setForm(null)}
          mode={form.mode}
          defaultDate={day}
          {...(form.editing ? { editing: form.editing } : {})}
        />
      )}
    </Screen>
  )
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: 'chevron-left' | 'chevron-right'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        minWidth: '44px',
        minHeight: '44px',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--space-2)',
        color: 'var(--ink-2)',
        cursor: 'pointer',
      }}
    >
      <Icon name={icon} />
    </button>
  )
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: '44px',
    border: 'none',
    borderRadius: 'var(--space-2)',
    cursor: 'pointer',
    fontSize: 'var(--text-caption)',
    fontFamily: 'var(--font-ui)',
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'var(--bg-2)',
    color: active ? 'var(--on-accent)' : 'var(--ink-2)',
  }
}

const pillStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  marginTop: 'var(--space-1)',
  minHeight: 'var(--space-5)',
  paddingBlock: 'var(--space-4)',
  border: '1px solid var(--accent-border)',
  borderRadius: '50%',
  paddingInline: 'var(--space-3)',
  background: 'var(--accent-surface)',
  color: 'var(--accent-text)',
  fontSize: 'var(--text-caption)',
  lineHeight: 'var(--leading-caption)',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
}
