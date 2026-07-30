import { Icon, type IconName } from '@components/ui'
import { useI18n } from '@i18n/index'
import { useAppStore } from '@stores/appStore'

type Tab = 'today' | 'budget' | 'chat' | 'assets' | 'report' | 'more'

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'today', icon: 'today' },
  { id: 'budget', icon: 'budget' },
  { id: 'chat', icon: 'manager' },
  { id: 'assets', icon: 'assets' },
  { id: 'report', icon: 'report' },
  { id: 'more', icon: 'more' },
]

export function TabBar() {
  const { activeTab, setTab } = useAppStore()
  const { t } = useI18n()

  return (
    <nav
      aria-label={t.nav.primaryLandmark}
      style={{
        display: 'flex',
        height: 56,
        borderTop: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            aria-current={active ? 'page' : undefined}
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
              color: active ? 'var(--accent-text)' : 'var(--ink-3)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              fontWeight: active ? 600 : 500,
              transition: 'color .15s',
            }}
          >
            <Icon name={tab.icon} size={21} />
            {t.nav[tab.id]}
          </button>
        )
      })}
    </nav>
  )
}
