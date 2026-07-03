import { useAppStore } from '@stores/appStore'

type Tab = 'home' | 'budget' | 'assets' | 'chat' | 'decide' | 'more'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home',   label: 'Home',   icon: '⌂' },
  { id: 'budget', label: 'Budget', icon: '◎' },
  { id: 'chat',   label: 'Manager', icon: '✦' },
  { id: 'assets', label: 'Assets', icon: '◈' },
  { id: 'decide', label: 'Decide', icon: '◆' },
  { id: 'more',   label: 'More',   icon: '···' },
]

export function TabBar() {
  const { activeTab, setTab } = useAppStore()

  return (
    <nav
      style={{
        display: 'flex',
        height: 56,
        borderTop: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map((t) => {
        const active = activeTab === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: active ? 'var(--amber-text)' : 'var(--ink-3)',
              fontSize: 9,
              fontFamily: 'var(--font-ui)',
              fontWeight: active ? 600 : 400,
              letterSpacing: '.5px',
              textTransform: 'uppercase',
              transition: 'color .15s',
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>{t.icon}</span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
