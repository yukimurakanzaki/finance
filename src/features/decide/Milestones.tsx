import { BottomSheet } from '@components/BottomSheet'
import { Btn, Field, Input } from '@components/FormField'
import { Badge, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import type { Milestone, MilestoneStatus } from '@db/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

const now = () => new Date().toISOString()

const STATUS_STYLE: Record<MilestoneStatus, { color: string; label: string }> =
  {
    pending: { color: 'var(--ink-3)', label: 'Pending' },
    triggered: { color: 'var(--amber-text)', label: 'Triggered' },
    done: { color: 'var(--engine)', label: 'Done' },
    skipped: { color: 'var(--ink-3)', label: 'Skipped' },
  }

// Badge only has default/positive/warning tones; map each milestone status to
// the closest semantic tone (done → positive, triggered → warning, else
// default) while keeping STATUS_STYLE's own colour for text elsewhere.
const STATUS_BADGE_TONE: Record<
  MilestoneStatus,
  'default' | 'positive' | 'warning'
> = {
  pending: 'default',
  triggered: 'warning',
  done: 'positive',
  skipped: 'default',
}

const STATUS_ORDER: MilestoneStatus[] = [
  'triggered',
  'pending',
  'done',
  'skipped',
]

export function Milestones() {
  const [addOpen, setAddOpen] = useState(false)
  const milestones =
    useLiveQuery(() => db.milestones.orderBy('flag_date').toArray()) ?? []

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: milestones.filter((m) => m.status === s),
  })).filter((g) => g.items.length > 0)

  async function cycleStatus(m: Milestone) {
    const next: Record<MilestoneStatus, MilestoneStatus> = {
      pending: 'triggered',
      triggered: 'done',
      done: 'skipped',
      skipped: 'pending',
    }
    if (m.id) await db.milestones.update(m.id, { status: next[m.status] })
  }

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
        Milestones
      </SectionHeader>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        Track your FI milestones. Tap a card to advance its status.
      </div>

      {milestones.length === 0 && (
        <div
          style={{
            padding: 'var(--space-4) 0',
            fontSize: 'var(--text-body)',
            color: 'var(--ink-3)',
          }}
        >
          No milestones yet. Add your first one — e.g. "First 100M IDR
          invested".
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.status}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: STATUS_STYLE[group.status].color,
              marginBottom: 6,
            }}
          >
            {STATUS_STYLE[group.status].label}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {group.items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => cycleStatus(m)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  background: 'var(--bg-1)',
                  border: `1px solid ${STATUS_STYLE[m.status].color}33`,
                  borderRadius: 10,
                  padding: 'var(--space-3) var(--space-4)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  width: '100%',
                  textAlign: 'left',
                  opacity: m.status === 'skipped' ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    marginRight: 'var(--space-3)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--text-section)',
                      fontWeight: 600,
                      color: 'var(--ink-1)',
                      textDecoration:
                        m.status === 'done' || m.status === 'skipped'
                          ? 'line-through'
                          : 'none',
                    }}
                  >
                    {m.title}
                  </div>
                  {m.description && (
                    <div
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--ink-2)',
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {m.description}
                    </div>
                  )}
                  {m.flag_date && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        marginTop: 4,
                      }}
                    >
                      {m.flag_date}
                    </div>
                  )}
                </div>
                <Badge
                  tone={STATUS_BADGE_TONE[m.status]}
                  style={{ flexShrink: 0, marginTop: 2 }}
                >
                  {STATUS_STYLE[m.status].label}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      ))}

      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add milestone"
        height="70dvh"
      >
        <MilestoneForm onDone={() => setAddOpen(false)} />
      </BottomSheet>
    </div>
  )
}

function MilestoneForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [flagDate, setFlagDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title) return
    setSaving(true)
    await db.milestones.add({
      title,
      description: description || null,
      flag_date: flagDate || null,
      status: 'pending',
      source: 'manual',
      income_event_id: null,
      created_at: now(),
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
      <Field label="Title *">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. First 100M invested"
        />
      </Field>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional context"
        />
      </Field>
      <Field label="Target date (optional)">
        <Input
          type="date"
          value={flagDate}
          onChange={(e) => setFlagDate(e.target.value)}
          mono
        />
      </Field>
      <Btn onClick={handleSave} disabled={saving || !title} fullWidth>
        {saving ? 'Saving…' : 'Add milestone'}
      </Btn>
    </div>
  )
}
