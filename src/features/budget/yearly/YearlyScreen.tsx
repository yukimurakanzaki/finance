import {
  Amount,
  Card,
  Row,
  Screen,
  SectionHeader,
  StatTile,
} from '@components/ui'
import { db } from '@db/db'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import type { Cadence, RecurringKind } from '@db/types'
import { useI18n } from '@i18n/index'
import { formatRp } from '@lib/currency'
import { useLiveQuery } from 'dexie-react-hooks'

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

const KIND_ORDER: RecurringKind[] = [
  'pay_yourself_first',
  'household_bill',
  'personal_sub',
  'other',
]

export function YearlyScreen() {
  const { t } = useI18n()
  const items =
    useLiveQuery(() =>
      db.recurringItems.filter((r) => r.is_active).toArray(),
    ) ?? []
  const allowance = useLiveQuery(() => db.allowance.get('local'))
  const latestIncome = useLiveQuery(() =>
    incomeEventsRepo.getLatest(),
  )

  const takeHomeAnnual = (latestIncome?.take_home_net ?? 0) * 12
  const poolAnnual = (allowance?.monthly_amount ?? 0) * 12
  const kindLabels: Record<RecurringKind, string> = {
    pay_yourself_first: t.budget.payYourselfFirst,
    household_bill: t.budget.billsAndSubs,
    personal_sub: t.budget.subscriptions,
    other: t.budget.otherCommitted,
  }

  const byKind = KIND_ORDER.map((kind) => {
    const kindItems = items.filter((i) => i.kind === kind)
    const total = kindItems.reduce(
      (s, i) => s + annualAmount(i.amount, i.cadence),
      0,
    )
    return { kind, items: kindItems, total }
  }).filter((g) => g.items.length > 0)

  const committedAnnual = byKind.reduce((s, g) => s + g.total, 0)
  const totalAllocated = committedAnnual + poolAnnual
  const unallocated = takeHomeAnnual - totalAllocated
  const pyf = byKind.find((g) => g.kind === 'pay_yourself_first')
  const pyfRate = pyf && takeHomeAnnual > 0 ? pyf.total / takeHomeAnnual : 0

  return (
    <Screen>
      {/* Annual summary */}
      <Card>
        <StatTile
          label={t.budget.annualPicture}
          value={takeHomeAnnual > 0 ? <Amount value={takeHomeAnnual} /> : '—'}
          sub={t.budget.annualTakeHome}
        />
        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <BarRow
            label={t.budget.committed}
            value={committedAnnual}
            total={takeHomeAnnual}
            color="var(--protected)"
          />
          <BarRow
            label={t.budget.discretionary}
            value={poolAnnual}
            total={takeHomeAnnual}
            color="var(--amber)"
          />
          <BarRow
            label={t.budget.unallocated}
            value={Math.max(0, unallocated)}
            total={takeHomeAnnual}
            color="var(--ink-3)"
          />
        </div>
      </Card>

      {/* PYF highlight */}
      {pyf && (
        <Card
          style={{
            background: 'var(--engine-bg)',
            border: '1px solid var(--engine)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 'var(--text-body)',
                  lineHeight: 'var(--leading-body)',
                  fontWeight: 600,
                  color: 'var(--engine)',
                }}
              >
                {t.home.savingsRate}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  lineHeight: 'var(--leading-caption)',
                  color: 'var(--ink-3)',
                  marginTop: 2,
                }}
              >
                {formatRp(pyf.total)}
                {t.budget.perYearShort} {t.budget.intoPipePerYear}
              </div>
            </div>
            <div
              style={{
                fontSize: 'var(--text-display)',
                lineHeight: 'var(--leading-display)',
                fontWeight: 700,
                color: 'var(--engine)',
              }}
            >
              {takeHomeAnnual > 0 ? `${Math.round(pyfRate * 100)}%` : '—'}
            </div>
          </div>
        </Card>
      )}

      {/* Grouped items */}
      {byKind.map((group) => (
        <div key={group.kind}>
          <SectionHeader
            trailing={`${formatRp(group.total)}${t.budget.perYearShort}`}
          >
            <span style={{ color: KIND_COLOR[group.kind] }}>
              {kindLabels[group.kind]}
            </span>
          </SectionHeader>
          <div>
            {group.items.map((item) => {
              const annual = annualAmount(item.amount, item.cadence)
              return (
                <Row
                  key={item.id}
                  primary={item.name}
                  caption={`${formatRp(item.amount)}/${t.budget.cadences[item.cadence]}`}
                  right={
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 2,
                      }}
                    >
                      <Amount
                        value={annual}
                        style={{ color: KIND_COLOR[item.kind] }}
                      />
                      <span
                        style={{
                          fontSize: 'var(--text-caption)',
                          lineHeight: 'var(--leading-caption)',
                          color: 'var(--ink-3)',
                        }}
                      >
                        {t.budget.perYearShort.replace('/', '')}
                      </span>
                    </span>
                  }
                />
              )
            })}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div style={emptyStyle}>{t.budget.recurringItemsEmpty}</div>
      )}
    </Screen>
  )
}

function BarRow({
  label,
  value,
  total,
  color,
}: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-1)',
        }}
      >
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
          {label}
        </div>
        {value > 0 ? (
          <Amount
            value={value}
            style={{ fontSize: 'var(--text-caption)', color }}
          />
        ) : (
          <span style={{ fontSize: 'var(--text-caption)', color }}>—</span>
        )}
      </div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2 }}>
        <div
          style={{
            width: `${pct * 100}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            transition: 'width .3s',
          }}
        />
      </div>
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-body)',
  textAlign: 'center',
  padding: 'var(--space-6) 0',
}
