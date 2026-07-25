import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input } from '@components/FormField'
import { Card, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

export function IncomeLog() {
  const [open, setOpen] = useState(false)
  const events =
    useLiveQuery(() => db.incomeEvents.orderBy('date').reverse().toArray()) ??
    []

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <SectionHeader
        trailing={
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--amber-text)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
            }}
          >
            + Log raise
          </button>
        }
      >
        Income history
      </SectionHeader>

      {events.length === 0 && (
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--ink-3)',
            padding: 'var(--space-3) 0',
          }}
        >
          No income events yet.
        </div>
      )}

      {events.map((ev, i) => {
        const prev = events[i + 1]
        const delta = prev ? ev.take_home_net - prev.take_home_net : null
        return (
          <Card key={ev.id} padding="var(--space-3) var(--space-4)">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 'var(--text-title)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-1)',
                  }}
                >
                  {formatRp(ev.take_home_net)}/mo
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  {ev.date}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {delta !== null && (
                  <div
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: delta >= 0 ? 'var(--engine)' : 'var(--amber-text)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {delta >= 0 ? '+' : '−'}
                    {formatRp(Math.abs(delta))}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  gross {formatRp(ev.gross)}
                </div>
              </div>
            </div>
            {ev.note && (
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--ink-2)',
                  marginTop: 'var(--space-2)',
                }}
              >
                {ev.note}
              </div>
            )}
            {ev.routed_to_pipe > 0 && (
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--engine)',
                  marginTop: 4,
                }}
              >
                Pipe: {formatRp(ev.routed_to_pipe)}/mo
              </div>
            )}
          </Card>
        )
      })}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Log income / raise"
        height="75dvh"
      >
        <AddIncomeForm
          onDone={() => setOpen(false)}
          prevNet={events[0]?.take_home_net ?? null}
        />
      </BottomSheet>
    </div>
  )
}

function AddIncomeForm({
  onDone,
  prevNet,
}: {
  onDone: () => void
  prevNet: number | null
}) {
  const [gross, setGross] = useState('')
  const [net, setNet] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  const parseNum = (s: string) => Number(s.replace(/[.,]/g, ''))
  const netNum = parseNum(net)
  const grossNum = parseNum(gross)
  const delta = prevNet !== null && netNum > 0 ? netNum - prevNet : null

  async function handleSave() {
    if (!net || !gross) return
    setSaving(true)
    const activeRecurring = await db.recurringItems
      .filter((r) => r.is_active && r.kind === 'pay_yourself_first')
      .toArray()
    const pipeTotal = activeRecurring.reduce((s, r) => s + r.amount, 0)

    await incomeEventsRepo.create({
      date,
      gross: grossNum,
      take_home_net: netNum,
      delta_vs_prev: delta,
      routed_to_pipe: pipeTotal,
      routed_to_lifestyle: netNum - pipeTotal,
      note: note || null,
      source: 'manual',
    })
    setSaving(false)
    onDone()
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <Field label="Effective date">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          mono
        />
      </Field>
      <Field label="Gross (Rp/mo)">
        <Input
          type="text"
          inputMode="numeric"
          mono
          value={gross}
          onChange={(e) => setGross(e.target.value)}
          placeholder="15.000.000"
        />
      </Field>
      <Field label="Take-home net (Rp/mo)">
        <Input
          type="text"
          inputMode="numeric"
          mono
          value={net}
          onChange={(e) => setNet(e.target.value)}
          placeholder="12.000.000"
        />
      </Field>

      {delta !== null && netNum > 0 && (
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: delta >= 0 ? 'var(--engine)' : 'var(--amber-text)',
          }}
        >
          {delta >= 0 ? '↑ Raise' : '↓ Cut'} of {formatRp(Math.abs(delta))}/mo
          vs previous
        </div>
      )}

      <Field label="Note (optional)">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Annual review 2026"
        />
      </Field>

      <Btn onClick={handleSave} disabled={saving || !net || !gross} fullWidth>
        {saving ? 'Saving…' : 'Save income event'}
      </Btn>
    </div>
  )
}
