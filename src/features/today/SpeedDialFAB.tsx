import { useState } from 'react'
import { useAppStore } from '@stores/appStore'

interface Props {
  onAdd: (mode: 'out' | 'in' | 'transfer') => void
}

const ACTIONS: { key: 'out' | 'in' | 'transfer' | 'ai'; label: string; icon: string; bg: string; fg: string }[] = [
  { key: 'ai', label: 'Ask AI', icon: '✦', bg: '#4a9df0', fg: '#fff' },
  { key: 'transfer', label: 'Transfer', icon: '⇄', bg: 'var(--debt)', fg: '#fff' },
  { key: 'in', label: 'Income', icon: '+', bg: 'var(--amber)', fg: 'var(--on-accent, #000)' },
  { key: 'out', label: 'Expense', icon: '−', bg: '#e35d5b', fg: '#fff' },
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
    <div style={{ position: 'fixed', right: 18, bottom: 'calc(68px + env(safe-area-inset-bottom))', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      {open && ACTIONS.map((a) => (
        <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-1)', background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '3px 8px' }}>
            {a.label}
          </span>
          <button
            onClick={() => handle(a.key)}
            aria-label={a.label}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: a.bg, color: a.fg, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.icon}
          </button>
        </div>
      ))}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close actions' : 'Add transaction'}
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'var(--amber)', color: 'var(--on-accent, #000)', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(240,165,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s',
        }}
      >
        +
      </button>
    </div>
  )
}
