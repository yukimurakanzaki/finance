import { useEffect, useState } from 'react'
import { useAppStore } from '@stores/appStore'
import { usePinStore } from '@stores/pinStore'
import { TabBar } from '@components/TabBar'
import { PinLockScreen } from '@components/PinLockScreen'
import { QuickLogFAB } from '@components/QuickLogFAB'
import { HomeScreen } from '@features/home/HomeScreen'
import { BudgetScreen } from '@features/budget/BudgetScreen'
import { AssetsScreen } from '@features/assets/AssetsScreen'
import { DecideScreen } from '@features/decide/DecideScreen'
import { MoreScreen } from '@features/more/MoreScreen'
import { ChatScreen } from '@features/chat/ChatScreen'
import { useReconcileStore } from '@stores/reconcileStore'
import { ReconcileEntryScreen } from '@features/reconcile/ReconcileEntryScreen'
import { ReconcileConfirmScreen } from '@features/reconcile/ReconcileConfirmScreen'
import { OnboardingWizard } from '@features/onboarding/OnboardingWizard'
import { hasPin } from '@lib/crypto'
import { settingsRepo } from '@db/repositories/settings.repo'

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

  if (ready === null) {
    return <div style={{ height: '100dvh', background: 'var(--bg-0)' }} />
  }

  if (ready === false) {
    return <OnboardingWizard onComplete={markDone} />
  }

  if (isInProgress && activeTab === 'budget') {
    if (step === 'confirm' || step === 'committing') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <AppBar title="Reconcile" subtitle="Review & approve" />
          <div style={{ flex: 1, overflowY: 'auto' }}><ReconcileConfirmScreen /></div>
          <TabBar />
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AppBar title="Reconcile" subtitle="Import transactions" />
        <div style={{ flex: 1, overflowY: 'auto' }}><ReconcileEntryScreen /></div>
        <TabBar />
      </div>
    )
  }

  const SCREENS = {
    home:   { title: 'Home',   subtitle: 'The Scoreboard',      component: <HomeScreen /> },
    budget: { title: 'Budget', subtitle: 'This workweek',       component: <BudgetScreen /> },
    chat:   { title: 'Manager', subtitle: 'Your AI finance partner', component: <ChatScreen /> },
    assets: { title: 'Assets', subtitle: 'Accounts & assets',   component: <AssetsScreen /> },
    decide: { title: 'Decide', subtitle: 'What does this buy?', component: <DecideScreen /> },
    more:   { title: 'More',   subtitle: '',                    component: <MoreScreen /> },
  }

  const screen = SCREENS[activeTab]
  // Chat manages its own scrolling and input bar; the FAB would cover the send button
  const isChat = activeTab === 'chat'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title={screen.title} subtitle={screen.subtitle} />
      <div style={{ flex: 1, overflowY: isChat ? 'hidden' : 'auto' }}>
        {screen.component}
      </div>
      <TabBar />
      {!isChat && <QuickLogFAB />}
    </div>
  )
}

function AppBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      padding: '12px 16px 10px',
      paddingTop: 'calc(12px + env(safe-area-inset-top))',
      borderBottom: '1px solid var(--border-1)',
      background: 'var(--bg-1)',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.2px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  )
}

export function App() {
  const { isLocked } = usePinStore()
  const pinConfigured = hasPin()

  if (pinConfigured && isLocked) {
    return <PinLockScreen />
  }

  return <AppShell />
}
