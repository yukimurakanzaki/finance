import { PinLockScreen } from '@components/PinLockScreen'
import { TabBar } from '@components/TabBar'
import { db } from '@db/db'
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
  const synced = useAuthStore((s) => s.synced)
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    // `setup_complete` is a local-only flag (never synced to the cloud), so a
    // fresh device/browser profile always starts without it. Wait for the
    // first cloud sync to land before deciding — if the household already
    // has accounts, treat setup as done rather than re-running onboarding.
    if (!synced) return
    Promise.all([settingsRepo.get('setup_complete'), db.accounts.count()]).then(
      ([flag, accountCount]) => setReady(flag === 'true' || accountCount > 0),
    )
  }, [synced])
  return { ready, markDone: () => setReady(true) }
}

function AppShell() {
  const { activeTab, onboardingStep, closeOnboarding } = useAppStore()
  const { isInProgress, step } = useReconcileStore()
  const { ready, markDone } = useSetupComplete()
  const { t, init: initI18n } = useI18n()

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

  // Two ways in: setup was never completed, or something asked to reopen the
  // wizard at a step (T1a FR-1.3 — the jump target, since there is no router).
  if (ready === false || onboardingStep !== null) {
    const wizard = (
      <OnboardingWizard
        initialStep={onboardingStep ?? undefined}
        onComplete={() => {
          closeOnboarding()
          markDone()
        }}
      />
    )
    // First-run onboarding has no way out — it is the app. A reopened wizard
    // does: the draft is already persisted, so closing loses nothing.
    if (ready === false) return wizard
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px',
            paddingTop: 'calc(12px + env(safe-area-inset-top))',
            borderBottom: '1px solid var(--border-1)',
            background: 'var(--bg-1)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={closeOnboarding}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              fontSize: 15,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {t.common.close}
          </button>
        </div>
        <main style={{ flex: 1, overflowY: 'auto' }}>{wizard}</main>
      </div>
    )
  }

  if (isInProgress && activeTab === 'budget') {
    if (step === 'confirm' || step === 'committing') {
      return (
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <AppBar title={t.reconcile.title} />
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <ReconcileConfirmScreen />
          </main>
          <TabBar />
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AppBar title={t.reconcile.title} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <ReconcileEntryScreen />
        </main>
        <TabBar />
      </div>
    )
  }

  // Slim AppBar (PAIN-POINTS.md D9): title only, no subtitle line.
  const SCREENS = {
    today: { title: t.nav.today, component: <TodayScreen /> },
    budget: { title: t.nav.budget, component: <BudgetScreen /> },
    chat: { title: t.nav.chat, component: <ChatScreen /> },
    assets: { title: t.nav.assets, component: <AssetsScreen /> },
    report: { title: t.nav.report, component: <ReportScreen /> },
    more: { title: t.nav.more, component: <MoreScreen /> },
  }

  const screen = SCREENS[activeTab]
  // Chat manages its own scrolling and input bar; the FAB would cover the send button
  const isChat = activeTab === 'chat'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title={screen.title} />
      <main style={{ flex: 1, overflowY: isChat ? 'hidden' : 'auto' }}>
        {screen.component}
      </main>
      <TabBar />
    </div>
  )
}

// Slim, single-row app bar (PAIN-POINTS.md D9): ~44-48px tall, title only —
// down from the old ~64px title+subtitle bar. Reclaimed space goes to each
// screen's own hero number (Calm Ledger v2 §8).
function AppBar({ title }: { title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        borderBottom: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
        flexShrink: 0,
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
