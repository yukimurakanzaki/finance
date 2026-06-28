import { useAppStore } from '@stores/appStore'
import { usePinStore } from '@stores/pinStore'
import { TabBar } from '@components/TabBar'
import { PinLockScreen } from '@components/PinLockScreen'
import { HomeScreen } from '@features/home/HomeScreen'
import { BudgetScreen } from '@features/budget/BudgetScreen'
import { AssetsScreen } from '@features/assets/AssetsScreen'
import { DecideScreen } from '@features/decide/DecideScreen'
import { MoreScreen } from '@features/more/MoreScreen'
import { useReconcileStore } from '@stores/reconcileStore'
import { ReconcileEntryScreen } from '@features/reconcile/ReconcileEntryScreen'
import { ReconcileConfirmScreen } from '@features/reconcile/ReconcileConfirmScreen'
import { hasPin } from '@lib/crypto'

function AppShell() {
  const { activeTab } = useAppStore()
  const { isInProgress, step } = useReconcileStore()

  // Reconcile overlay when in progress
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
    home:   { title: 'Home',   subtitle: 'The Scoreboard',     component: <HomeScreen /> },
    budget: { title: 'Budget', subtitle: 'This workweek',      component: <BudgetScreen /> },
    assets: { title: 'Assets', subtitle: 'Accounts & assets',  component: <AssetsScreen /> },
    decide: { title: 'Decide', subtitle: 'What does this buy?', component: <DecideScreen /> },
    more:   { title: 'More',   subtitle: '',                   component: <MoreScreen /> },
  }

  const screen = SCREENS[activeTab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title={screen.title} subtitle={screen.subtitle} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {screen.component}
      </div>
      <TabBar />
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
