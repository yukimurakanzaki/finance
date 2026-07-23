import { BottomSheet } from '@components/BottomSheet'
import { Row, Screen, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { DecideScreen } from '@features/decide/DecideScreen'
import { IncomeLog } from '@features/decide/IncomeLog'
import { hasPin } from '@lib/crypto'
import { supabase } from '@lib/supabaseClient'
import { useAppStore } from '@stores/appStore'
import { useReconcileStore } from '@stores/reconcileStore'
import { useState } from 'react'
import { AllowanceEditor } from './AllowanceEditor'
import { AssumptionsEditor } from './AssumptionsEditor'
import { CategoryManager } from './CategoryManager'
import { HouseholdSheet } from './HouseholdSheet'
import { ImportPromptSheet } from './ImportPromptSheet'
import { PinSetup } from './PinSetup'
import { RecurringRegister } from './RecurringRegister'
import { RestoreBackup } from './RestoreBackup'

type Sheet =
  | 'recurring'
  | 'allowance'
  | 'income'
  | 'pin'
  | 'assumptions'
  | 'restore'
  | 'categories'
  | 'import_prompt'
  | 'household'
  | 'decide'
  | null

export function MoreScreen() {
  const { start: startReconcile } = useReconcileStore()
  const { setTab } = useAppStore()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pinConfigured, setPinConfigured] = useState(hasPin())
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    if (next === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    try {
      localStorage.setItem('fi-theme', next)
    } catch {
      /* private mode */
    }
    db.appSettings.put({
      key: 'theme',
      value: next,
      updated_at: new Date().toISOString(),
    })
  }

  async function handleExport() {
    const [
      accounts,
      assets,
      transactions,
      categories,
      envelopes,
      recurringItems,
      allowance,
      netWorthSnapshots,
      incomeEvents,
      milestones,
      assumptions,
      appSettings,
    ] = await Promise.all([
      db.accounts.toArray(),
      db.assets.toArray(),
      db.transactions.toArray(),
      db.categories.toArray(),
      db.envelopes.toArray(),
      db.recurringItems.toArray(),
      db.allowance.toArray(),
      db.netWorthSnapshots.toArray(),
      db.incomeEvents.toArray(),
      db.milestones.toArray(),
      db.assumptions.toArray(),
      db.appSettings.toArray(),
    ])

    const envelope = {
      schema_version: 1,
      app_version: '0.1.0',
      exported_at: new Date().toISOString(),
      data: {
        accounts,
        assets,
        transactions,
        categories,
        envelopes,
        recurringItems,
        allowance,
        netWorthSnapshots,
        incomeEvents,
        milestones,
        assumptions,
        appSettings,
      },
    }

    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fi-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    await settingsRepo.set('last_exported_at', new Date().toISOString())
  }

  function handleReconcile() {
    startReconcile()
    setTab('budget')
  }

  const pinLabel = pinConfigured ? 'Change / Remove PIN' : 'Set up PIN lock'
  const pinSub = pinConfigured
    ? 'App is locked on switch'
    : 'Lock app when you switch away'

  return (
    <Screen>
      <SectionHeader>Appearance</SectionHeader>
      <div>
        <Row
          onClick={toggleTheme}
          primary={`Theme: ${theme === 'light' ? 'Light (blue)' : 'Dark'}`}
          caption="Tap to switch between dark and light"
        />
      </div>

      <SectionHeader>Financial setup</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('allowance')}
          primary="Allowance"
          caption="Monthly pool & weekend allocation"
        />
        <Row
          onClick={() => setSheet('recurring')}
          primary="Recurring Register"
          caption="Pipe, bills, subs — what's committed monthly"
        />
        <Row
          onClick={() => setSheet('assumptions')}
          primary="FI Assumptions"
          caption="Target, return rates, inflation"
        />
        <Row
          onClick={() => setSheet('categories')}
          primary="Categories"
          caption="Tag transactions by lane for import auto-match"
        />
        <Row
          onClick={() => setSheet('pin')}
          primary={pinLabel}
          caption={pinSub}
        />
      </div>

      {/* B1 fix (PAIN-POINTS.md — salary update was 4 taps deep: More → Plan
          → Decide sheet → Income Log tab). Income gets its own top-level
          section and sheet here, matching how Allowance already sits one tap
          away — the Decide sheet (below) still holds the full Income Log
          history, this is just a direct shortcut to log a raise. */}
      <SectionHeader>Income</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('income')}
          primary="Log income / raise"
          caption="Update take-home pay — drives savings rate & FI date"
        />
      </div>

      <SectionHeader>Plan</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('decide')}
          primary="Decide"
          caption="What does this buy? Milestones, income, spending lens"
        />
      </div>

      <SectionHeader>Household</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('household')}
          primary="Members & Invites"
          caption="See who's in, invite your partner, transfer admin"
        />
      </div>

      {/* M3 fix (PAIN-POINTS.md — "two competing import paths"): the in-app
          Manager chat already accepts pasted statement screenshots directly
          via its log_transactions tool, no external round-trip needed. That
          path can't be trusted to cover *every* case yet, though — a
          multi-month bulk statement import is still easiest as one big
          JSON paste, and the chat tool takes at most 4 images per message
          (ChatScreen.tsx's MAX_IMAGES) — so option (b) was taken: keep both,
          but demote the external prompt-copy path. It moves below "Import
          Transactions" (the step that actually writes data), is relabeled
          "Advanced / bulk import" instead of the more-discoverable-looking
          "Get Claude Prompt", and a new row above both points at the
          in-app path first. */}
      <SectionHeader>Data</SectionHeader>
      <div>
        <Row
          onClick={() => setTab('chat')}
          primary="Log via AI Manager"
          caption="Paste a statement screenshot in chat — no copy/paste round trip"
        />
        <Row
          onClick={handleReconcile}
          primary="Import Transactions"
          caption="Paste JSON output into Reconcile"
        />
        <Row
          onClick={() => setSheet('import_prompt')}
          primary="Advanced / bulk import"
          caption="Copy a prompt for a separate Claude session — for large multi-month imports"
        />
        <Row
          onClick={handleExport}
          primary="Export Backup"
          caption="Download all data as JSON"
        />
        <Row
          onClick={() => setSheet('restore')}
          primary="Restore Backup"
          caption="Replace all data from a backup file"
        />
        <Row
          onClick={async () => {
            if (
              window.confirm(
                'Sign out of the AI Manager? The Manager tab will ask you to sign in again.',
              )
            ) {
              await supabase.auth.signOut()
              window.alert('Signed out.')
            }
          }}
          primary="Sign out of AI Manager"
          caption="End your household session on this device"
        />
      </div>

      <div style={{ marginTop: 'var(--space-5)', padding: '0 var(--space-1)' }}>
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--ink-3)',
            lineHeight: 1.6,
          }}
        >
          FI Dashboard v0.1.0 · Offline-first with household cloud sync · Chat
          history stays on this device.
        </div>
      </div>

      <BottomSheet
        open={sheet === 'allowance'}
        onClose={() => setSheet(null)}
        title="Allowance"
        height="65dvh"
      >
        <AllowanceEditor />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'recurring'}
        onClose={() => setSheet(null)}
        title="Recurring Register"
        height="90dvh"
      >
        <RecurringRegister />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'income'}
        onClose={() => setSheet(null)}
        title="Income Log"
        height="85dvh"
      >
        <IncomeLog />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'pin'}
        onClose={() => setSheet(null)}
        title={pinLabel}
        height="60dvh"
      >
        <PinSetup
          onDone={() => {
            setPinConfigured(hasPin())
            setSheet(null)
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'assumptions'}
        onClose={() => setSheet(null)}
        title="FI Assumptions"
        height="90dvh"
      >
        <AssumptionsEditor />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'restore'}
        onClose={() => setSheet(null)}
        title="Restore Backup"
        height="70dvh"
      >
        <RestoreBackup onDone={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'categories'}
        onClose={() => setSheet(null)}
        title="Categories"
        height="90dvh"
      >
        <CategoryManager />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'import_prompt'}
        onClose={() => setSheet(null)}
        title="Advanced / Bulk Import"
        height="90dvh"
      >
        <ImportPromptSheet />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'household'}
        onClose={() => setSheet(null)}
        title="Household"
        height="75dvh"
      >
        <HouseholdSheet />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'decide'}
        onClose={() => setSheet(null)}
        title="Decide"
        height="92dvh"
      >
        <DecideScreen />
      </BottomSheet>
    </Screen>
  )
}
