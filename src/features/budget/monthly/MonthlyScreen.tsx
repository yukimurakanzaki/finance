import { Amount, Card, Row, Screen, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import type { RecurringKind } from '@db/types'
import { formatRp } from '@lib/currency'
import { useLiveQuery } from 'dexie-react-hooks'

const KIND_LABELS: Record<RecurringKind, string> = {
  pay_yourself_first: 'Pay Yourself First',
  household_bill: 'Household Bills',
  personal_sub: 'Personal Subscriptions',
  other: 'Other Committed',
}

const KIND_ORDER: RecurringKind[] = [
  'pay_yourself_first',
  'household_bill',
  'personal_sub',
  'other',
]

const KIND_COLOR: Record<RecurringKind, string> = {
  pay_yourself_first: 'var(--engine)',
  household_bill: 'var(--protected)',
  personal_sub: 'var(--amber-text)',
  other: 'var(--ink-2)',
}

export function MonthlyScreen() {
  const items =
    useLiveQuery(() =>
      db.recurringItems.filter((r) => r.is_active).toArray(),
    ) ?? []
  const allowance = useLiveQuery(() => db.allowance.get('local'))
  const latestIncome = useLiveQuery(() =>
    db.incomeEvents.orderBy('date').last(),
  )

  const takeHome = latestIncome?.take_home_net ?? 0
  const pool = allowance?.monthly_amount ?? 0

  const byKind = KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
    total: items
      .filter((i) => i.kind === kind)
      .reduce((s, i) => s + i.amount, 0),
  })).filter((g) => g.items.length > 0)

  const committedTotal = byKind.reduce((s, g) => s + g.total, 0)
  const pyfTotal =
    byKind.find((g) => g.kind === 'pay_yourself_first')?.total ?? 0
  const barsTotal = committedTotal + pool

  return (
    <Screen>
      {/* Summary card */}
      <Card>
        <SectionHeader>Monthly waterfall</SectionHeader>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <WaterfallRow
            label="Take-home net"
            value={takeHome}
            accent="var(--engine)"
            total={takeHome}
          />
          <Divider />
          <WaterfallRow
            label="Pay Yourself First"
            value={pyfTotal}
            accent="var(--engine)"
            total={takeHome}
            indent
          />
          <WaterfallRow
            label="Bills & subs"
            value={committedTotal - pyfTotal}
            accent="var(--protected)"
            total={takeHome}
            indent
          />
          <WaterfallRow
            label="Discretionary pool"
            value={pool}
            accent="var(--amber)"
            total={takeHome}
            indent
          />
          <Divider />
          <WaterfallRow
            label="Unallocated"
            value={takeHome - barsTotal}
            accent="var(--ink-3)"
            total={takeHome}
          />
        </div>
      </Card>

      {/* Grouped recurring items */}
      {byKind.map((group) => (
        <div key={group.kind}>
          <SectionHeader trailing={`${formatRp(group.total)}/mo`}>
            <span style={{ color: KIND_COLOR[group.kind] }}>
              {KIND_LABELS[group.kind]}
            </span>
          </SectionHeader>
          <div>
            {group.items.map((item) => (
              <Row
                key={item.id}
                primary={item.name}
                caption={item.note}
                right={
                  <Amount
                    value={item.amount}
                    style={{ color: KIND_COLOR[item.kind] }}
                  />
                }
              />
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div style={emptyStyle}>
          No recurring items yet. Add them in More → Recurring Register.
        </div>
      )}

      {/* Pool card */}
      {pool > 0 && (
        <div>
          <SectionHeader>
            <span style={{ color: 'var(--amber-text)' }}>
              Discretionary pool
            </span>
          </SectionHeader>
          <Card
            style={{
              background: 'var(--amber-surface)',
              border: '1px solid var(--amber-border)',
              marginTop: 'var(--space-2)',
            }}
            padding={0}
          >
            <Row
              primary="Monthly allowance"
              right={
                <Amount value={pool} style={{ color: 'var(--amber-text)' }} />
              }
              style={{ borderBottom: 'none' }}
            />
          </Card>
        </div>
      )}
    </Screen>
  )
}

function WaterfallRow({
  label,
  value,
  accent,
  total,
  indent,
}: {
  label: string
  value: number
  accent: string
  total: number
  indent?: boolean
}) {
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  return (
    <div
      style={{
        marginBottom: 'var(--space-2)',
        paddingLeft: indent ? 'var(--space-2)' : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-1)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: indent ? 'var(--ink-2)' : 'var(--ink-1)',
          }}
        >
          {label}
        </div>
        <Amount
          value={value}
          style={{ fontSize: 'var(--text-caption)', color: accent }}
        />
      </div>
      {total > 0 && (
        <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2 }}>
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: accent,
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  )
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--border-1)',
        margin: 'var(--space-2) 0',
      }}
    />
  )
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-body)',
  textAlign: 'center',
  padding: 'var(--space-6) 0',
}
