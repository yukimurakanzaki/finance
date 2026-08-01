import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input } from '@components/FormField'
import { Card, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { incomeEventsRepo } from '@db/repositories/incomeEvents.repo'
import { formatRp, parseRpInput } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { salaryAfterRemoving } from '@engine/incomeSeries'
import type { IncomeEvent } from '@db/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLongPress } from '../../hooks/useLongPress'
import { useState } from 'react'

export function IncomeLog() {
  const [open, setOpen] = useState(false)
  // D3 — incomeEventsRepo.update existed and nothing ever called it: a mistyped
  // salary could only be deleted and retyped. Tapping a card now edits it.
  const [editing, setEditing] = useState<IncomeEvent | null>(null)
  const events = useLiveQuery(() => incomeEventsRepo.getAllDesc()) ?? []
  const longPress = useLongPress(
    ({ id, label }: { id: string; label: string }) => {
      if (window.confirm(`Delete this income event?\n${label}`)) {
        incomeEventsRepo.remove(id)
      }
    },
  )

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
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
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
          <Card
            key={ev.id}
            padding="var(--space-3) var(--space-4)"
            interactive
            onClick={() => {
              // The press that just deleted this row still fires a click, which
              // would open the editor on the row that no longer exists.
              if (longPress.consumedClick()) return
              setEditing(ev)
              setOpen(true)
            }}
            {...longPress.handlers({
              id: ev.id!,
              label: `${formatRp(ev.take_home_net)} · ${ev.date}`,
            })}
            title="Tap to edit · long-press to delete"
          >
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
        title={editing ? 'Edit income' : 'Log income / raise'}
        height="80dvh"
      >
        <IncomeForm
          key={editing?.id ?? 'new'}
          editing={editing}
          events={events}
          onDone={() => setOpen(false)}
          prevNet={events[0]?.take_home_net ?? null}
        />
      </BottomSheet>
    </div>
  )
}

function IncomeForm({
  editing,
  events,
  onDone,
  prevNet,
}: {
  editing: IncomeEvent | null
  events: IncomeEvent[]
  onDone: () => void
  prevNet: number | null
}) {
  const [gross, setGross] = useState(editing ? String(editing.gross) : '')
  const [net, setNet] = useState(editing ? String(editing.take_home_net) : '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // parseRpInput, not a bare separator strip: "12.5" became 125 and silently
  // corrupted the figure the whole FI projection is built on (PAIN-POINTS T5).
  const netNum = parseRpInput(net)
  const grossNum = parseRpInput(gross)
  const delta =
    prevNet !== null && netNum !== null && !editing ? netNum - prevNet : null

  // The pipe/lifestyle split is recomputed from the currently active
  // pay-yourself-first items, the same way it is on create — so the user sees
  // what the edit will actually store, not what it stored last time.
  const pipeTotal =
    useLiveQuery(async () => {
      const active = await db.recurringItems
        .filter((r) => r.is_active && r.kind === 'pay_yourself_first')
        .toArray()
      return active.reduce((s, r) => s + r.amount, 0)
    }) ?? 0

  // Deleting the newest raise re-bases the FI projection and the savings rate.
  const fallback = editing?.id
    ? salaryAfterRemoving(events, editing.id)
    : undefined

  async function handleSave() {
    if (netNum === null || grossNum === null) return
    setSaving(true)

    if (editing?.id) {
      await incomeEventsRepo.update(editing.id, {
        date,
        gross: grossNum,
        take_home_net: netNum,
        routed_to_pipe: pipeTotal,
        routed_to_lifestyle: netNum - pipeTotal,
        note: note || null,
      })
    } else {
      await incomeEventsRepo.create({
        date,
        gross: grossNum,
        take_home_net: netNum,
        // The repo re-answers the whole series on write; this is only the
        // optimistic value for the row being inserted.
        delta_vs_prev: delta,
        routed_to_pipe: pipeTotal,
        routed_to_lifestyle: netNum - pipeTotal,
        note: note || null,
        source: 'manual',
      })
    }
    setSaving(false)
    onDone()
  }

  async function handleDelete() {
    if (!editing?.id) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await incomeEventsRepo.remove(editing.id)
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
          max={todayISO()}
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

      {delta !== null && netNum !== null && netNum > 0 && (
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

      {(net !== '' && netNum === null) || (gross !== '' && grossNum === null) ? (
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--amber-text)' }}>
          Enter whole rupiah — e.g. 12.000.000, not 12,5.
        </div>
      ) : null}

      {netNum !== null && (
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          Pipe {formatRp(pipeTotal)}/mo · lifestyle{' '}
          {formatRp(Math.max(0, netNum - pipeTotal))}/mo
        </div>
      )}

      <Btn
        onClick={handleSave}
        disabled={saving || netNum === null || grossNum === null}
        fullWidth
      >
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Save income event'}
      </Btn>

      {editing?.id && (
        <>
          <Btn variant="danger" onClick={handleDelete} fullWidth>
            {confirmDelete ? 'Tap again to delete' : 'Delete this income event'}
          </Btn>
          {confirmDelete && (
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              {fallback
                ? `Your current salary becomes ${formatRp(fallback.take_home_net)}/mo (${fallback.date}).`
                : 'This is your only income event — the FI projection will have no salary to work from.'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
