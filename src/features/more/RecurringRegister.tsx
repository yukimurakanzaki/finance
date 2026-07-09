import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { recurringRepo } from '@db/repositories/recurringItems.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Select, Btn } from '@components/FormField'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'
import type { RecurringItem, RecurringKind, Cadence, Lane } from '@db/types'

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
  const items = useLiveQuery(() => db.recurringItems.orderBy('kind').toArray()) ?? []
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
      await recurringRepo.update(editing.id, { name: form.name, amount, cadence: form.cadence, kind: form.kind, lane: form.lane, note: form.note || null })
    } else {
      await recurringRepo.create({ name: form.name, amount, cadence: form.cadence, kind: form.kind, lane: form.lane, is_protected: false, is_active: true, next_due: today, end_date: null, note: form.note || null })
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
    <div style={{ padding: '16px 0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          Active ({active.length})
        </div>
        <button
          onClick={openAdd}
          style={{
            background: 'var(--amber)', border: 'none', borderRadius: 8,
            padding: '6px 14px', fontSize: 12, fontWeight: 700,
            color: 'var(--on-accent)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
          }}
        >
          + Add
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {active.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '8px 0' }}>No recurring items yet.</div>
        )}
        {active.map((item) => (
          <ItemRow key={item.id} item={item} onEdit={() => openEdit(item)} onDeactivate={() => handleDeactivate(item)} />
        ))}
      </div>

      {inactive.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Paused ({inactive.length})
          </div>
          {inactive.map((item) => (
            <ItemRow key={item.id} item={item} onEdit={() => openEdit(item)} dim />
          ))}
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit recurring item' : 'Add recurring item'}
        height="85dvh"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Claude Pro, KPR BRI" />
          </Field>
          <Field label="Monthly amount (Rp) *">
            <Input type="text" inputMode="numeric" mono value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="165.000" />
          </Field>
          <Field label="Kind">
            <Select value={form.kind} onChange={(e) => setKind(e.target.value as RecurringKind)}>
              {(Object.entries(KIND_LABELS) as [RecurringKind, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cadence">
            <Select value={form.cadence} onChange={(e) => set('cadence', e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional note" />
          </Field>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {editing && (
              <Btn variant="danger" style={{ flex: 1 }} onClick={async () => { await handleDeactivate(editing); setOpen(false) }}>
                Pause
              </Btn>
            )}
            <Btn style={{ flex: 2 }} onClick={handleSave} disabled={saving || !form.name || !form.amount} fullWidth>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
            </Btn>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function ItemRow({ item, onEdit, onDeactivate, dim }: { item: RecurringItem; onEdit: () => void; onDeactivate?: () => void; dim?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
      opacity: dim ? .5 : 1,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLORS[item.kind], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
          {KIND_LABELS[item.kind]} · {item.cadence}
        </div>
      </div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', fontWeight: 600 }}>
        {formatRp(item.amount)}
      </div>
      <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>
        ✎
      </button>
    </div>
  )
}
