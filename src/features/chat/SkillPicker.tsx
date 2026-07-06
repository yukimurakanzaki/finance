import { useState } from 'react'
import { BUILT_IN_SKILLS } from '@ai/skills'
import type { ChatCustomSkill } from '@db/types'
import { db } from '@db/db'
import { BottomSheet } from '@components/BottomSheet'
import { useChatStore } from '@stores/chatStore'

interface Props {
  open: boolean
  onClose: () => void
  activeSessionId: string | null
  currentSkills: string[]
  onToggleSkill: (skillId: string) => void
}

export function SkillPicker({ open, onClose, activeSessionId, currentSkills, onToggleSkill }: Props) {
  const [customSkills, setCustomSkills] = useState<ChatCustomSkill[]>([])
  const [loading, setLoading] = useState(true)

  if (open) {
    // Only fetch once when opened
    if (customSkills.length === 0 && !loading) {
      setLoading(true)
      db.chatCustomSkills.toArray().then(setCustomSkills).finally(() => setLoading(false))
    }
  }

  const active = currentSkills

  function toggleSkill(id: string) {
    if (active.includes(id)) {
      onToggleSkill(id)
    } else {
      onToggleSkill(id)
    }
  }

  const allSkills = [
    ...BUILT_IN_SKILLS.map((s) => ({ ...s, isCustom: false })),
    ...customSkills.map((s) => ({ ...s, isCustom: true })),
  ]

  return (
    <BottomSheet open={open} onClose={onClose} title="Active skills" height="60dvh">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-3)' }}>Loading skills…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allSkills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-3)' }}>
              No skills configured. Ask Adi's AI to save a reusable workflow!
            </div>
          ) : (
            allSkills.map((s) => {
              const isActive = active.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSkill(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: isActive ? 'var(--amber-bg)' : 'var(--bg-2)',
                    border: `1px solid ${isActive ? 'var(--amber)' : 'var(--border-1)'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{s.icon || '⚡'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
                      {s.name}
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                        {s.description}
                      </div>
                    )}
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'var(--amber)' : 'transparent',
                    flexShrink: 0,
                  }}>
                    {isActive && <div style={{ width: 8, height: 4, background: '#000', borderRadius: 1 }} />}
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </BottomSheet>
  )
}
