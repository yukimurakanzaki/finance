import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import type { RecurringKind } from '@db/types'

const KIND_LABELS: Record<RecurringKind, string> = {
  pay_yourself_first: 'Pay Yourself First',
  household_bill: 'Household Bills',
  personal_sub: 'Personal Subscriptions',
  other: 'Other Committed',
}

const KIND_ORDER: RecurringKind[] = ['pay_yourself_first', 'household_bill', 'personal_sub', 'other']

const KIND_COLOR: Record<RecurringKind, string> = {
  pay_yourself_first: 'var(--engine)',
  household_bill: 'var(--protected)',
  personal_sub: 'var(--amber-text)',
  other: 'var(--ink-2)',
}

export function MonthlyScreen() {
  const items = useLiveQuery(() => db.recurringItems.filter((r) => r.is_active).toArray()) ?? []
  const allowance = useLiveQuery(() => db.allowance.get(1))
  const latestIncome = useLiveQuery(() => db.incomeEvents.orderBy('date').last())

  const takeHome = latestIncome?.take_home_net ?? 0
  const pool = allowance?.monthly_amount ?? 0

  const byKind = KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
    total: items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0),
  })).filter((g) => g.items.length > 0)

  const committedTotal = byKind.reduce((s, g) => s + g.total, 0)
  const pyfTotal = byKind.find((g) => g.kind === 'pay_yourself_first')?.total ?? 0
  const barsTotal = committedTotal + pool

  return (
    <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary card */}
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border-1)',
        borderRadius: 12, padding: '16px',
      }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
          Monthly waterfall
        </div>
        <WaterfallRow label="Take-home net" value={takeHome} accent="var(--engine)" total={takeHome} />
        <div style={{ height: 1, background: 'var(--border-1)', margin: '10px 0' }} />
        <WaterfallRow label="Pay Yourself First" value={pyfTotal} accent="var(--engine)" total={takeHome} indent />
        <WaterfallRow label="Bills & subs" value={committedTotal - pyfTotal} accent="var(--protected)" total={takeHome} indent />
        <WaterfallRow label="Discretionary pool" value={pool} accent="var(--amber)" total={takeHome} indent />
        <div style={{ height: 1, background: 'var(--border-1)', margin: '10px 0' }} />
        <WaterfallRow label="Unallocated" value={takeHome - barsTotal} accent="var(--ink-3)" total={takeHome} />
      </div>

      {/* Grouped recurring items */}
      {byKind.map((group) => (
        <div key={group.kind}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: KIND_COLOR[group.kind] }}>
              {KIND_LABELS[group.kind]}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
              {formatRp(group.total)}/mo
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items.map((item) => (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-1)', border: '1px solid var(--border-1)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--ink-1)' }}>{item.name}</div>
                  {item.note && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{item.note}</div>}
                </div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: KIND_COLOR[item.kind] }}>
                  {formatRp(item.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          No recurring items yet. Add them in More → Recurring Register.
        </div>
      )}

      {/* Pool card */}
      {pool > 0 && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--amber-text)', marginBottom: 8 }}>
            Discretionary pool
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--amber-surface)', border: '1px solid var(--amber-border)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 13, color: 'var(--ink-1)' }}>Monthly allowance</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--amber-text)' }}>
              {formatRp(pool)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WaterfallRow({
  label, value, accent, total, indent,
}: {
  label: string; value: number; accent: string; total: number; indent?: boolean
}) {
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  return (
    <div style={{ marginBottom: 8, paddingLeft: indent ? 8 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: indent ? 'var(--ink-2)' : 'var(--ink-1)' }}>{label}</div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: accent }}>
          {value >= 0 ? formatRp(value) : `−${formatRp(Math.abs(value))}`}
        </div>
      </div>
      {total > 0 && (
        <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2 }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: accent, borderRadius: 2 }} />
        </div>
      )}
    </div>
  )
}
