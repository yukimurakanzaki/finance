import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input, Select } from '@components/FormField'
import { Badge, Row, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { categoriesRepo } from '@db/repositories/categories.repo'
import type { Category, Lane } from '@db/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

const LANE_OPTIONS: { value: Lane; label: string }[] = [
  { value: 'income_producing', label: 'Income Producing' },
  { value: 'store_of_value', label: 'Store of Value' },
  { value: 'debt_liability', label: 'Debt / Liability' },
  { value: 'protected_living', label: 'Protected Living' },
  { value: 'pass_through', label: 'Pass-through (not your money)' },
]

const LANE_COLOR: Record<Lane, string> = {
  income_producing: 'var(--engine)',
  store_of_value: 'var(--store)',
  debt_liability: 'var(--debt)',
  protected_living: 'var(--protected)',
  pass_through: 'var(--ink-3)',
}

export function CategoryManager() {
  const categories =
    useLiveQuery(() => db.categories.orderBy('name').toArray()) ?? []
  const [editing, setEditing] = useState<Category | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const byLane = LANE_OPTIONS.map((o) => ({
    lane: o.value,
    label: o.label,
    items: categories.filter((c) => c.lane === o.value),
  })).filter((g) => g.items.length > 0)

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
            onClick={() => setAddOpen(true)}
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
            + Add
          </button>
        }
      >
        {categories.length} categories
      </SectionHeader>

      {categories.length === 0 && (
        <div
          style={{
            padding: 'var(--space-3) 0',
            fontSize: 'var(--text-body)',
            color: 'var(--ink-3)',
          }}
        >
          No categories yet. Add one to enable auto-categorisation during
          import.
        </div>
      )}

      {byLane.map((group) => (
        <div key={group.lane}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: LANE_COLOR[group.lane],
              marginBottom: 6,
            }}
          >
            {group.label}
          </div>
          <div>
            {group.items.map((cat) => (
              <Row
                key={cat.id}
                onClick={() => setEditing(cat)}
                primary={cat.name}
                right={cat.is_protected ? <Badge>Protected</Badge> : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add category"
        height="65dvh"
      >
        <CategoryForm onDone={() => setAddOpen(false)} />
      </BottomSheet>

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit category"
        height="65dvh"
      >
        {editing && (
          <CategoryForm editing={editing} onDone={() => setEditing(null)} />
        )}
      </BottomSheet>
    </div>
  )
}

function CategoryForm({
  editing,
  onDone,
}: { editing?: Category | undefined; onDone: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [lane, setLane] = useState<Lane>(editing?.lane ?? 'protected_living')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name) return
    setSaving(true)
    if (editing?.id) {
      await categoriesRepo.update(editing.id, { name, lane })
    } else {
      await categoriesRepo.create({
        name,
        lane,
        is_protected: false,
        envelope_id: null,
      })
    }
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
      <Field label="Category name *">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Groceries"
        />
      </Field>
      <Field label="Lane">
        <Select value={lane} onChange={(e) => setLane(e.target.value as Lane)}>
          {LANE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Btn onClick={handleSave} disabled={saving || !name} fullWidth>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Add category'}
      </Btn>
    </div>
  )
}
