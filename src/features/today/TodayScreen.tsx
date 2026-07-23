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
import { isWeekDraw } from '@engine/safeToSpend'
import { isoWeekEnd, isoWeekStart, todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useDailyLeftover } from '../../hooks/useDailyLeftover'
import { useSafeToSpend } from '../../hooks/useSafeToSpend'
import { SpeedDialFAB } from './SpeedDialFAB'
import { TransactionForm } from './TransactionForm'

type Scope = 'day' | 'week' | 'month' | 'all'

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All' },
]

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

// Bounds for the period-scope control (PHASE-3-HANDOFF.md §2.3). 'all' has no
// bound. 'day'/'week'/'month' are all anchored to the day nav's current `day`,
// not to the device's real "today" — browsing to a past day and picking
// "Week"/"Month" shows that day's week/month, matching the day nav's own frame.
function scopeBounds(
  scope: Scope,
  day: string,
): { from: string; to: string } | null {
  if (scope === 'day') return { from: day, to: day }
  if (scope === 'week') {
    const d = new Date(`${day}T12:00:00`)
    return { from: isoWeekStart(d), to: isoWeekEnd(d) }
  }
  if (scope === 'month') {
    const [y, m] = day.split('-').map(Number) as [number, number]
    const lastDay = new Date(y, m, 0).getDate()
    return {
      from: `${day.slice(0, 7)}-01`,
      to: `${day.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  return null
}

export function TodayScreen() {
  const [day, setDay] = useState(todayISO())
  const [scope, setScope] = useState<Scope>('day')
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{
    mode: 'out' | 'in' | 'transfer'
    editing?: Transaction
  } | null>(null)

  const isToday = day === todayISO()
  const bounds = scopeBounds(scope, day)

  const txns =
    useLiveQuery(
      () =>
        bounds
          ? db.transactions
              .where('date')
              .between(bounds.from, bounds.to, true, true)
              .toArray()
          : db.transactions.toArray(),
      [bounds?.from, bounds?.to],
    ) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []

  const { result: safeToSpend, isLoading: safeToSpendLoading } =
    useSafeToSpend()
  const accountBalances = useAccountBalances()
  const { result: leftover } = useDailyLeftover(day)

  const accName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  )
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  // Spent today: the day nav's own day, regardless of the list's scope — the
  // standing strip always answers "today", the list below answers "this scope".
  // Uses isWeekDraw (the same discretionary definition as the safe-to-spend hero
  // and the monthly-leftover tile beside it), so the three numbers in the strip
  // tell one coherent story: committed bills / transfers / pass-through don't
  // count against "spent today" any more than they draw the leftover pool.
  const spentToday =
    useLiveQuery(
      () => db.transactions.where('date').equals(day).toArray(),
      [day],
    ) ?? []
  const spentTodayTotal = spentToday
    .filter(isWeekDraw)
    .reduce((s, t) => s + t.amount, 0)

  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: { txn: Transaction; transferTo?: string | undefined }[] = []
    const sorted = [...txns].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    )
    for (const t of sorted) {
      if (t.is_transfer && t.transfer_pair_id) {
        if (seen.has(t.transfer_pair_id)) continue
        seen.add(t.transfer_pair_id)
        const other = txns.find(
          (o) => o.transfer_pair_id === t.transfer_pair_id && o.id !== t.id,
        )
        const outLeg = t.direction === 'out' ? t : (other ?? t)
        const inLeg = t.direction === 'in' ? t : other
        out.push({
          txn: outLeg,
          transferTo: inLeg ? accName.get(inLeg.account_id) : undefined,
        })
      } else {
        out.push({ txn: t })
      }
    }
    return out
  }, [txns, accName])

  // Search fixes F3: matches title, category name, AND note (the old
  // TransactionHistory only matched note + account name).
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(({ txn }) => {
      const title = (txn.title ?? '').toLowerCase()
      const cat = (catName.get(txn.category_id ?? '') ?? '').toLowerCase()
      const note = (txn.note ?? '').toLowerCase()
      return title.includes(q) || cat.includes(q) || note.includes(q)
    })
  }, [rows, search, catName])

  const listNet = filteredRows
    .filter(({ txn }) => !txn.is_transfer)
    .reduce(
      (s, { txn }) => s + (txn.direction === 'in' ? txn.amount : -txn.amount),
      0,
    )

  return (
    <Screen>
      {/* ① Standing strip — replaces the three DayChips (F1, T4) */}
      <Card>
        <SafeToSpendHero result={safeToSpend} isLoading={safeToSpendLoading} />
        <div
          style={{
            display: 'flex',
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border-1)',
            gap: 'var(--space-5)',
          }}
        >
          <StatTile
            label="Spent today"
            size="title"
            value={<Amount value={spentTodayTotal} full />}
          />
          <StatTile
            label="Wallet balance"
            size="title"
            value={<Amount value={accountBalances?.total ?? 0} full />}
          />
          <StatTile
            label="Monthly leftover"
            size="title"
            value={
              <Amount
                value={leftover?.leftover ?? 0}
                full
                tone={
                  leftover && leftover.leftover < 0 ? 'negative' : 'default'
                }
              />
            }
            sub={leftover?.isProjected ? 'projected' : undefined}
          />
        </div>
      </Card>

      {/* ② Date navigator with the Today anchor pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => setDay(shiftDay(day, -1))}
          aria-label="Previous day"
          style={navBtnStyle}
        >
          <Icon name="chevron-left" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'var(--text-body)',
              lineHeight: 'var(--leading-body)',
              fontWeight: 600,
              color: 'var(--ink-1)',
            }}
          >
            {dayLabel(day)}
          </div>
          {isToday ? (
            <span style={pillStyle}>Today</span>
          ) : (
            <button
              type="button"
              onClick={() => setDay(todayISO())}
              style={{ ...pillStyle, ...pillButtonStyle }}
            >
              Back to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDay(shiftDay(day, 1))}
          aria-label="Next day"
          style={navBtnStyle}
        >
          <Icon name="chevron-right" />
        </button>
      </div>

      {/* ③ Unified transaction surface: search + period scope (F2/F3) */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
      >
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o)
            if (searchOpen) setSearch('')
          }}
          aria-label={searchOpen ? 'Close search' : 'Search transactions'}
          style={iconBtnStyle}
        >
          <Icon name={searchOpen ? 'close' : 'search'} />
        </button>
        <div style={{ display: 'flex', flex: 1, gap: 'var(--space-1)' }}>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              style={segmentStyle(scope === s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {searchOpen && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, category, or note…"
          style={searchInputStyle}
        />
      )}

      <SectionHeader
        trailing={
          <>
            {filteredRows.length} · <Amount value={listNet} full />
          </>
        }
      >
        Transactions
      </SectionHeader>

      {filteredRows.length === 0 && (
        <div
          style={{
            color: 'var(--ink-3)',
            fontSize: 'var(--text-body)',
            textAlign: 'center',
            padding: 'var(--space-6) 0',
          }}
        >
          {search
            ? 'No transactions match your search.'
            : 'No transactions in this period.'}
        </div>
      )}
      <div>
        {filteredRows.map(({ txn, transferTo }) => (
          <Row
            key={txn.id}
            onClick={() =>
              setForm({
                mode: txn.is_transfer ? 'transfer' : txn.direction,
                editing: txn,
              })
            }
            icon={
              txn.is_transfer ? (
                <Icon name="transfer" size={18} aria-label="Transfer" />
              ) : undefined
            }
            primary={
              txn.is_transfer
                ? `${accName.get(txn.account_id) ?? '?'} → ${transferTo ?? '?'}`
                : (txn.title ??
                  txn.note ??
                  catName.get(txn.category_id ?? '') ??
                  '(no title)')
            }
            caption={
              txn.is_transfer
                ? 'Transfer'
                : [
                    catName.get(txn.category_id ?? ''),
                    accName.get(txn.account_id),
                  ]
                    .filter(Boolean)
                    .join(' · ')
            }
            right={
              <Amount
                value={txn.direction === 'in' ? txn.amount : -txn.amount}
                full
                tone={
                  txn.is_transfer
                    ? 'muted'
                    : txn.direction === 'in'
                      ? 'positive'
                      : 'default'
                }
                sign={txn.is_transfer ? 'never' : 'auto'}
              />
            }
          />
        ))}
      </div>

      {/* Spacer so the last row can scroll clear of the fixed FAB. */}
      <div style={{ height: 80 }} />

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

// Hero stat tile: mirrors GaugeCard's null/negative-pool/weekend/normal branches
// (PHASE-3-HANDOFF.md §2.1), rendered through StatTile/Amount instead of
// GaugeCard's own inline styles.
function SafeToSpendHero({
  result,
  isLoading,
}: {
  result: ReturnType<typeof useSafeToSpend>['result']
  isLoading: boolean
}) {
  if (isLoading) {
    return <StatTile label="Safe to spend today" value="…" />
  }
  if (!result) {
    return (
      <StatTile
        label="Safe to spend today"
        value={<Amount value={0} full />}
        sub="Set your monthly allowance in More → Allowance to see your daily ceiling."
      />
    )
  }
  if (result.isNegativePool) {
    return (
      <StatTile
        label="Safe to spend today"
        value={<Amount value={0} full tone="negative" />}
        sub="Committed items exceed your allowance this month."
      />
    )
  }
  if (result.remainingWorkdays === 0) {
    // O3 fix: the weekend allocation is a real configured number — surface
    // it instead of the bare word "Weekend" (mirrored into GaugeCard.tsx so
    // Today and Budget don't diverge on this branch).
    return (
      <StatTile
        label="Safe to spend today"
        value={<Amount value={result.weekendAllocation} full />}
        sub="Weekend allowance, pre-carved. Resets Monday."
      />
    )
  }
  return (
    <StatTile
      label="Safe to spend today"
      value={
        <>
          <Amount value={result.todayCeiling} full />
          <span
            style={{
              fontSize: 'var(--text-body)',
              color: 'var(--ink-3)',
              fontWeight: 500,
            }}
          >
            {' '}
            /day
          </span>
        </>
      }
      sub={
        <>
          <Amount value={result.remainingPool} full tone="muted" /> left ·{' '}
          {result.remainingWorkdays} workday
          {result.remainingWorkdays !== 1 ? 's' : ''} to go
        </>
      }
    />
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 12,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const iconBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 12,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 3,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--accent-text)',
  background: 'var(--accent-surface)',
  border: '1px solid var(--accent-border)',
  borderRadius: 999,
  padding: '2px 10px',
}

const pillButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 'var(--text-caption)',
    fontFamily: 'var(--font-ui)',
    fontWeight: active ? 600 : 400,
    padding: 'var(--space-2) 0',
    background: active ? 'var(--accent)' : 'var(--bg-2)',
    color: active ? 'var(--on-accent)' : 'var(--ink-2)',
  }
}

const searchInputStyle: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  color: 'var(--ink-1)',
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  fontFamily: 'var(--font-ui)',
  boxSizing: 'border-box',
}
