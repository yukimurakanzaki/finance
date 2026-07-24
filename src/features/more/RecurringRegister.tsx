import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input, Select } from '@components/FormField'
import { Row, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import type { Cadence, Lane, RecurringItem, RecurringKind } from '@db/types'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

const KIND_LABELS: Record<RecurringKind, string> = {
  pay_yourself_first: 'Pay yourself first (Pipe)',
  household_bill: 'Household bill',
  personal_sub: 'Personal subscription',
  other: 'Other',
}

const KIND_COLORS: Record<RecurringKind, string> = {
  pay_yourself_first: 'var(--engine)',
  household_bill: 'var(--protected)',
  personal_sub: 'var(--amber-text)',
  other: 'var(--ink-3)',
}

const EMPTY_FORM = {
  name: '',
  amount: '',
  cadence: 'monthly' as Cadence,
  kind: 'personal_sub' as RecurringKind,
  lane: 'protected_living' as Lane,
  note: '',
}

export function RecurringRegister() {
  const items =
    useLiveQuery(() => db.recurringItems.orderBy('kind').toArray()) ?? []
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function openEdit(item: RecurringItem) {
    setEditing(item)
    setForm({
      name: item.name,
      amount: String(item.amount),
      cadence: item.cadence,
      kind: item.kind,
      lane: item.lane,
      note: item.note ?? '',
    })
    setOpen(true)
  }

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Auto-set lane when kind changes
  function setKind(kind: RecurringKind) {
    const laneMap: Record<RecurringKind, Lane> = {
      pay_yourself_first: 'income_producing',
      household_bill: 'protected_living',
      personal_sub: 'protected_living',
      other: 'protected_living',
    }
    setForm((f) => ({ ...f, kind, lane: laneMap[kind] }))
  }

  async function handleSave() {
    if (!form.name || !form.amount) return
    setSaving(true)
    const amount = Number(form.amount.replace(/[.,]/g, ''))
    const today = todayISO()

    if (editing?.id) {
      await recurringRepo.update(editing.id, {
        name: form.name,
        amount,
        cadence: form.cadence,
        kind: form.kind,
        lane: form.lane,
        note: form.note || null,
      })
    } else {
      await recurringRepo.create({
        name: form.name,
        amount,
        cadence: form.cadence,
        kind: form.kind,
        lane: form.lane,
        is_protected: false,
        is_active: true,
        next_due: today,
        end_date: null,
        note: form.note || null,
      })
    }
    setSaving(false)
    setOpen(false)
  }

  async function handleDeactivate(item: RecurringItem) {
    if (!item.id) return
    await recurringRepo.deactivate(item.id)
  }

  const active = items.filter((i) => i.is_active)
  const inactive = items.filter((i) => !i.is_active)

  return (
    <div style={{ padding: 'var(--space-4) 0 var(--space-6)' }}>
      <SectionHeader
        trailing={
          <button
            type="button"
            onClick={openAdd}
            style={{
              background: 'var(--amber)',
              border: 'none',
              borderRadius: 8,
              padding: 'var(--space-1) var(--space-3)',
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              color: 'var(--on-accent)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            + Add
          </button>
        }
      >
        Active ({active.length})
      </SectionHeader>

      <div style={{ marginTop: 'var(--space-2)' }}>
        {active.length === 0 && (
          <div
            style={{
              color: 'var(--ink-3)',
              fontSize: 'var(--text-body)',
              padding: 'var(--space-2) 0',
            }}
          >
            No recurring items yet.
          </div>
        )}
        {active.map((item) => (
          <ItemRow key={item.id} item={item} onEdit={() => openEdit(item)} />
        ))}
      </div>

      {inactive.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <SectionHeader>Paused ({inactive.length})</SectionHeader>
          <div style={{ marginTop: 'var(--space-2)' }}>
            {inactive.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onEdit={() => openEdit(item)}
                dim
              />
            ))}
          </div>
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit recurring item' : 'Add recurring item'}
        height="85dvh"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <Field label="Name *">
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Claude Pro, KPR BRI"
            />
          </Field>
          <Field label="Monthly amount (Rp) *">
            <Input
              type="text"
              inputMode="numeric"
              mono
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="165.000"
            />
          </Field>
          <Field label="Kind">
            <Select
              value={form.kind}
              onChange={(e) => setKind(e.target.value as RecurringKind)}
            >
              {(Object.entries(KIND_LABELS) as [RecurringKind, string][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Cadence">
            <Select
              value={form.cadence}
              onChange={(e) => set('cadence', e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Optional note"
            />
          </Field>

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            {editing && (
              <Btn
                variant="danger"
                style={{ flex: 1 }}
                onClick={async () => {
                  await handleDeactivate(editing)
                  setOpen(false)
                }}
              >
                Pause
              </Btn>
            )}
            <Btn
              style={{ flex: 2 }}
              onClick={handleSave}
              disabled={saving || !form.name || !form.amount}
              fullWidth
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
            </Btn>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function ItemRow({
  item,
  onEdit,
  dim,
}: { item: RecurringItem; onEdit: () => void; dim?: boolean }) {
  return (
    <Row
      onClick={onEdit}
      style={{ opacity: dim ? 0.5 : 1 }}
      icon={
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: KIND_COLORS[item.kind],
            display: 'block',
          }}
        />
      }
      primary={item.name}
      caption={`${KIND_LABELS[item.kind]} · ${item.cadence}`}
      right={
        <span
          style={{
            fontSize: 'var(--text-body)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-1)',
            fontWeight: 600,
          }}
        >
          {formatRp(item.amount)}
        </span>
      }
    />
  )
}
