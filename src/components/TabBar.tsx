import { Icon, type IconName } from '@components/ui'
import { useAppStore } from '@stores/appStore'

type Tab = 'today' | 'budget' | 'chat' | 'assets' | 'report' | 'more'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'budget', label: 'Budget', icon: 'budget' },
  { id: 'chat', label: 'Manager', icon: 'manager' },
  { id: 'assets', label: 'Assets', icon: 'assets' },
  { id: 'report', label: 'Report', icon: 'report' },
  { id: 'more', label: 'More', icon: 'more' },
]

export function TabBar() {
  const { activeTab, setTab } = useAppStore()

  return (
    <nav
      aria-label="Primary"
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
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent-text)' : 'var(--ink-3)',
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              fontFamily: 'var(--font-ui)',
              fontWeight: active ? 600 : 400,
              transition: 'color .15s',
            }}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
