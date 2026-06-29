import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRp } from '@lib/currency'
import type { RecurringKind, Cadence } from '@db/types'

const KIND_LABELS: Record<RecurringKind, string> = {
  pay_yourself_first: 'Pay Yourself First',
  household_bill: 'Household Bills',
  personal_sub: 'Subscriptions',
  other: 'Other Committed',
}

const KIND_COLOR: Record<RecurringKind, string> = {
  pay_yourself_first: 'var(--engine)',
  household_bill: 'var(--protected)',
  personal_sub: 'var(--amber-text)',
  other: 'var(--ink-2)',
}

function annualAmount(amount: number, cadence: Cadence): number {
  if (cadence === 'monthly') return amount * 12
  if (cadence === 'weekly') return amount * 52
  if (cadence === 'yearly') return amount
  return 0 // one_off — not recurring
}

const KIND_ORDER: RecurringKind[] = ['pay_yourself_first', 'household_bill', 'personal_sub', 'other']

export function YearlyScreen() {
  const items = useLiveQuery(() => db.recurringItems.filter((r) => r.is_active).toArray()) ?? []
  const allowance = useLiveQuery(() => db.allowance.get(1))
  const latestIncome = useLiveQuery(() => db.incomeEvents.orderBy('date').last())

  const takeHomeAnnual = (latestIncome?.take_home_net ?? 0) * 12
  const poolAnnual = (allowance?.monthly_amount ?? 0) * 12

  const byKind = KIND_ORDER.map((kind) => {
    const kindItems = items.filter((i) => i.kind === kind)
    const total = kindItems.reduce((s, i) => s + annualAmount(i.amount, i.cadence), 0)
    return { kind, items: kindItems, total }
  }).filter((g) => g.items.length > 0)

  const committedAnnual = byKind.reduce((s, g) => s + g.total, 0)
  const totalAllocated = committedAnnual + poolAnnual
  const unallocated = takeHomeAnnual - totalAllocated

  return (
    <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Annual summary */}
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border-1)',
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
          Annual picture
        </div>

        <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', marginBottom: 4 }}>
          {takeHomeAnnual > 0 ? formatRp(takeHomeAnnual) : '—'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 16 }}>annual take-home</div>

        <BarRow label="Committed" value={committedAnnual} total={takeHomeAnnual} color="var(--protected)" />
        <BarRow label="Discretionary" value={poolAnnual} total={takeHomeAnnual} color="var(--amber)" />
        <BarRow label="Unallocated" value={Math.max(0, unallocated)} total={takeHomeAnnual} color="var(--ink-3)" />
      </div>

      {/* PYF highlight */}
      {byKind.find((g) => g.kind === 'pay_yourself_first') && (() => {
        const pyf = byKind.find((g) => g.kind === 'pay_yourself_first')!
        const pyfRate = takeHomeAnnual > 0 ? pyf.total / takeHomeAnnual : 0
        return (
          <div style={{
            background: 'var(--engine-bg)', border: '1px solid var(--engine)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--engine)' }}>Savings rate</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {formatRp(pyf.total)}/yr into pipe
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--engine)' }}>
                {takeHomeAnnual > 0 ? `${Math.round(pyfRate * 100)}%` : '—'}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Grouped items */}
      {byKind.map((group) => (
        <div key={group.kind}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: KIND_COLOR[group.kind] }}>
              {KIND_LABELS[group.kind]}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
              {formatRp(group.total)}/yr
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items.map((item) => {
              const annual = annualAmount(item.amount, item.cadence)
              return (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--bg-1)', border: '1px solid var(--border-1)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink-1)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      {formatRp(item.amount)}/{item.cadence.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: KIND_COLOR[item.kind] }}>
                      {formatRp(annual)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>per year</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          No recurring items yet. Add them in More → Recurring Register.
        </div>
      )}
    </div>
  )
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color }}>
          {value > 0 ? formatRp(value) : '—'}
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  )
}
