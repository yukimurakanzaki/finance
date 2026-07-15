import { Icon, type IconName } from '@components/ui'
import { useAppStore } from '@stores/appStore'
import { useState } from 'react'

interface Props {
  onAdd: (mode: 'out' | 'in' | 'transfer') => void
}

const ACTIONS: {
  key: 'in' | 'transfer' | 'ai'
  label: string
  icon: IconName
}[] = [
  { key: 'in', label: 'Income', icon: 'add' },
  { key: 'transfer', label: 'Transfer', icon: 'transfer' },
  { key: 'ai', label: 'Ask AI', icon: 'manager' },
]

export function SpeedDialFAB({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const setTab = useAppStore((s) => s.setTab)

  function handle(key: (typeof ACTIONS)[number]['key']) {
    setOpen(false)
    if (key === 'ai') setTab('chat')
    else onAdd(key)
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 'var(--space-4)',
        bottom: 'calc(68px + env(safe-area-inset-bottom))',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 'var(--space-3)',
      }}
    >
      {open &&
        ACTIONS.map((a) => (
          <div
            key={a.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-caption)',
                lineHeight: 'var(--leading-caption)',
                color: 'var(--ink-1)',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--space-2)',
                padding: 'var(--space-1) var(--space-2)',
              }}
            >
              {a.label}
            </span>
            <button
              type="button"
              onClick={() => handle(a.key)}
              aria-label={a.label}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                border: '1px solid var(--border-2)',
                background: 'var(--bg-2)',
                color: 'var(--ink-1)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={a.icon} />
            </button>
          </div>
        ))}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close secondary actions' : 'More actions'}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-surface)',
            color: 'var(--accent-text)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name={open ? 'close' : 'more'} />
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            onAdd('out')
          }}
          aria-label="Add expense"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(240,165,0,.4)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="add" size={24} />
        </button>
      </div>
    </div>
  )
}
