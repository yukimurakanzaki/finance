import { Icon, type IconName } from '@components/ui'
import { useAppStore } from '@stores/appStore'
import { useRef, useState } from 'react'

interface Props {
  onAdd: (mode: 'out' | 'in' | 'transfer') => void
}

// The action menu (PHASE-3-HANDOFF.md §2.4). Expense is the dominant case and is
// the FAB's single-tap action; the rest stay one press-and-hold (or keyboard
// open) away instead of behind an extra tap. Expense is ALSO listed here so the
// menu is the complete action set — that's the only path keyboard / assistive-tech
// users have to add an expense, since they can't perform the pointer long-press.
// No new stray accent colours (D8) — every menu action uses a neutral bg-2/ink-1
// surface; the FAB itself keeps the one sanctioned accent.
const ACTIONS: {
  key: 'expense' | 'ai' | 'transfer' | 'in'
  label: string
  icon: IconName
}[] = [
  { key: 'expense', label: 'Expense', icon: 'add' },
  { key: 'ai', label: 'Ask AI', icon: 'manager' },
  { key: 'transfer', label: 'Transfer', icon: 'transfer' },
  { key: 'in', label: 'Income', icon: 'add' },
]

const LONG_PRESS_MS = 450

export function SpeedDialFAB({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const setTab = useAppStore((s) => s.setTab)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  function handleSecondary(key: (typeof ACTIONS)[number]['key']) {
    setOpen(false)
    if (key === 'ai') setTab('chat')
    else if (key === 'expense') onAdd('out')
    else onAdd(key)
  }

  // Keyboard / assistive-tech path to the menu. A keyboard user can't perform the
  // pointer long-press, so Enter (on keydown) and Space (on keyup — matching a
  // native button's own activation timing) open the menu here. preventDefault
  // stops the button's synthetic click so handleTap doesn't also fire and
  // immediately re-toggle it.
  function toggleMenu(e: React.KeyboardEvent) {
    e.preventDefault()
    setOpen((o) => !o)
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') toggleMenu(e)
  }
  function handleKeyUp(e: React.KeyboardEvent) {
    if (e.key === ' ') toggleMenu(e)
  }

  function startPress() {
    longPressFired.current = false
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setOpen((o) => !o)
    }, LONG_PRESS_MS)
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  // Single tap: primary action (add expense) directly — the dominant 90% case,
  // now one tap instead of "open dial → Expense". A long-press (or a tap while
  // already open, to dismiss) reaches the secondary actions instead.
  function handleTap() {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (open) {
      setOpen(false)
      return
    }
    onAdd('out')
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 18,
        bottom: 'calc(68px + env(safe-area-inset-bottom))',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      {open &&
        ACTIONS.map((a) => (
          <div
            key={a.key}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--ink-1)',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-1)',
                borderRadius: 6,
                padding: '3px 8px',
              }}
            >
              {a.label}
            </span>
            <button
              type="button"
              onClick={() => handleSecondary(a.key)}
              aria-label={a.label}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: 'none',
                background: 'var(--bg-2)',
                color: 'var(--ink-1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={a.icon} size={18} />
            </button>
          </div>
        ))}
      <button
        type="button"
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onClick={handleTap}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          open ? 'Close actions' : 'Add expense — hold for more actions'
        }
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(240,165,0,.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: open ? 'rotate(45deg)' : 'none',
          transition: 'transform .15s',
        }}
      >
        <Icon name="add" size={26} strokeWidth={2} />
      </button>
    </div>
  )
}
