import { PinLockScreen } from '@components/PinLockScreen'
import { TabBar } from '@components/TabBar'
import { settingsRepo } from '@db/repositories/settings.repo'
import { AssetsScreen } from '@features/assets/AssetsScreen'
import { AuthScreen } from '@features/auth/AuthScreen'
import { BudgetScreen } from '@features/budget/BudgetScreen'
import { ChatScreen } from '@features/chat/ChatScreen'
import { MoreScreen } from '@features/more/MoreScreen'
import { OnboardingWizard } from '@features/onboarding/OnboardingWizard'
import { ReconcileConfirmScreen } from '@features/reconcile/ReconcileConfirmScreen'
import { ReconcileEntryScreen } from '@features/reconcile/ReconcileEntryScreen'
import { ReportScreen } from '@features/report/ReportScreen'
import { TodayScreen } from '@features/today/TodayScreen'
import { useI18n } from '@i18n/index'
import { seedTransactionsIfNeeded } from '@import/seedTransactions'
import { hasPin } from '@lib/crypto'
import { refreshAssetPrices } from '@lib/marketPrices'
import { useAppStore } from '@stores/appStore'
import { useAuthStore } from '@stores/authStore'
import { usePinStore } from '@stores/pinStore'
import { useReconcileStore } from '@stores/reconcileStore'
import { useEffect, useState } from 'react'

function useSetupComplete() {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    settingsRepo.get('setup_complete').then((v) => setReady(v === 'true'))
  }, [])
  return { ready, markDone: () => setReady(true) }
}

function AppShell() {
  const { activeTab } = useAppStore()
  const { isInProgress, step } = useReconcileStore()
  const { ready, markDone } = useSetupComplete()
  const { init: initI18n } = useI18n()

  // Initialize i18n, seed demo transactions once, and silent daily market-price refresh
  useEffect(() => {
    initI18n()
    seedTransactionsIfNeeded().catch((err) => {
      console.error('Failed to seed transactions:', err)
    })
    refreshAssetPrices().catch(() => {})
  }, [])

  if (ready === null) {
    return <div style={{ height: '100dvh', background: 'var(--bg-0)' }} />
  }

  if (ready === false) {
    return <OnboardingWizard onComplete={markDone} />
  }

  if (isInProgress && activeTab === 'budget') {
    if (step === 'confirm' || step === 'committing') {
      return (
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <AppBar title="Reconcile" subtitle="Review & approve" />
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <ReconcileConfirmScreen />
          </main>
          <TabBar />
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AppBar title="Reconcile" subtitle="Import transactions" />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <ReconcileEntryScreen />
        </main>
        <TabBar />
      </div>
    )
  }

  const SCREENS = {
    today: {
      title: 'Today',
      subtitle: 'Daily transaction log',
      component: <TodayScreen />,
    },
    budget: {
      title: 'Budget',
      subtitle: 'This workweek',
      component: <BudgetScreen />,
    },
    chat: {
      title: 'Manager',
      subtitle: 'Your AI finance partner',
      component: <ChatScreen />,
    },
    assets: {
      title: 'Assets',
      subtitle: 'Accounts & assets',
      component: <AssetsScreen />,
    },
    report: {
      title: 'Report',
      subtitle: 'The Scoreboard',
      component: <ReportScreen />,
    },
    more: { title: 'More', subtitle: '', component: <MoreScreen /> },
  }

  const screen = SCREENS[activeTab]
  // Chat manages its own scrolling and input bar; the FAB would cover the send button
  const isChat = activeTab === 'chat'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title={screen.title} subtitle={screen.subtitle} />
      <main style={{ flex: 1, overflowY: isChat ? 'hidden' : 'auto' }}>
        {screen.component}
      </main>
      <TabBar />
    </div>
  )
}

function AppBar({ title }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        minHeight: '44px',
        padding: '0 var(--space-4)',
        paddingTop: 'env(safe-area-inset-top)',
        borderBottom: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'var(--text-title)',
          lineHeight: 'var(--leading-title)',
          fontWeight: 700,
          color: 'var(--ink-1)',
          letterSpacing: '-.2px',
          margin: 0,
        }}
      >
        {title}
      </h1>
    </div>
  )
}

export function App() {
  const { status, init } = useAuthStore()

  useEffect(() => {
    init()
  }, [init])

  if (status === 'loading') {
    return <div style={{ height: '100dvh', background: 'var(--bg-0)' }} />
  }

  if (status === 'signed_out' || status === 'no_household') {
    return <AuthScreen />
  }

  return <AuthedApp />
}

// Signed in + household resolved: the original PIN gate + app shell.
function AuthedApp() {
  const { isLocked } = usePinStore()
  const pinConfigured = hasPin()

  if (pinConfigured && isLocked) {
    return <PinLockScreen />
  }

  return <AppShell />
}
