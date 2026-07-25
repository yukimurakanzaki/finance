import { BottomSheet } from '@components/BottomSheet'
import { Row } from '@components/ui'
import { db } from '@db/db'
import type { ChatCustomSkill } from '@db/types'
import { useEffect, useState } from 'react'
import { BUILT_IN_SKILLS } from '../../ai/skills'

interface Props {
  open: boolean
  onClose: () => void
  activeSessionId: string | null
  currentSkills: string[]
  onToggleSkill: (skillId: string) => void
}

export function SkillPicker({
  open,
  onClose,
  currentSkills,
  onToggleSkill,
}: Props) {
  const [customSkills, setCustomSkills] = useState<ChatCustomSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    db.chatCustomSkills
      .toArray()
      .then(setCustomSkills)
      .finally(() => setLoading(false))
  }, [open])

  const active = currentSkills

  const allSkills = [
    ...BUILT_IN_SKILLS.map((s) => ({ ...s, isCustom: false })),
    ...customSkills.map((s) => ({ ...s, isCustom: true })),
  ]

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Active skills"
      height="60dvh"
    >
      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--space-6) 0',
            color: 'var(--ink-3)',
          }}
        >
          Loading skills…
        </div>
      ) : allSkills.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--space-5) 0',
            color: 'var(--ink-3)',
          }}
        >
          No skills configured. Ask Adi's AI to save a reusable workflow!
        </div>
      ) : (
        <div>
          {allSkills.map((s) => {
            const isActive = active.includes(s.id)
            return (
              <Row
                key={s.id}
                onClick={() => onToggleSkill(s.id)}
                icon={
                  <span style={{ fontSize: 'var(--text-title)' }}>
                    {s.icon || '⚡'}
                  </span>
                }
                primary={s.name}
                caption={s.description || undefined}
                right={
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '2px solid var(--border-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isActive ? 'var(--amber)' : 'transparent',
                      flexShrink: 0,
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          width: 8,
                          height: 4,
                          background: 'var(--on-accent)',
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </span>
                }
                {...(isActive
                  ? { style: { background: 'var(--amber-surface)' } }
                  : {})}
                aria-label={`${s.name}${isActive ? ' (active)' : ''}`}
              />
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
