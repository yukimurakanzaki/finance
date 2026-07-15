import { useState } from 'react'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { supabase } from '@lib/supabaseClient'
import { useReconcileStore } from '@stores/reconcileStore'
import { useAppStore } from '@stores/appStore'
import { hasPin } from '@lib/crypto'
import { RecurringRegister } from './RecurringRegister'
import { AllowanceEditor } from './AllowanceEditor'
import { PinSetup } from './PinSetup'
import { AssumptionsEditor } from './AssumptionsEditor'
import { RestoreBackup } from './RestoreBackup'
import { CategoryManager } from './CategoryManager'
import { ImportPromptSheet } from './ImportPromptSheet'
import { HouseholdSheet } from './HouseholdSheet'
import { BottomSheet } from '@components/BottomSheet'
import { Icon, Row, SectionHeader } from '@components/ui'
import { DecideScreen } from '@features/decide/DecideScreen'

type Sheet = 'recurring' | 'allowance' | 'pin' | 'assumptions' | 'restore' | 'categories' | 'import_prompt' | 'household' | 'decide' | null

export function MoreScreen() {
  const { start: startReconcile } = useReconcileStore()
  const { setTab } = useAppStore()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pinConfigured, setPinConfigured] = useState(hasPin())
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    if (next === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    try { localStorage.setItem('fi-theme', next) } catch { /* private mode */ }
    db.appSettings.put({ key: 'theme', value: next, updated_at: new Date().toISOString() })
  }

  async function handleExport() {
    const [accounts, assets, transactions, categories, envelopes, recurringItems,
      allowance, netWorthSnapshots, incomeEvents, milestones, assumptions, appSettings] =
      await Promise.all([
        db.accounts.toArray(), db.assets.toArray(), db.transactions.toArray(),
        db.categories.toArray(), db.envelopes.toArray(), db.recurringItems.toArray(),
        db.allowance.toArray(), db.netWorthSnapshots.toArray(), db.incomeEvents.toArray(),
        db.milestones.toArray(), db.assumptions.toArray(), db.appSettings.toArray(),
      ])

    const envelope = {
      schema_version: 1, app_version: '0.1.0',
      exported_at: new Date().toISOString(),
      data: { accounts, assets, transactions, categories, envelopes, recurringItems,
        allowance, netWorthSnapshots, incomeEvents, milestones, assumptions, appSettings },
    }

    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
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
  const pinSub = pinConfigured ? 'App is locked on switch' : 'Lock app when you switch away'

  return (
    <div style={{ paddingInline: 'var(--space-4)', paddingBlock: 'var(--space-4) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <SectionHeader>Appearance</SectionHeader>
      <Row
        primary={`Theme: ${theme === 'light' ? 'Light (blue)' : 'Dark'}`}
        caption="Tap to switch between dark and light"
        onClick={toggleTheme}
        right={<Icon name="chevron-right" />}
        aria-label={`Switch theme, currently ${theme === 'light' ? 'light' : 'dark'}`}
      />

      <SectionHeader style={{ marginTop: 'var(--space-3)' }}>Setup</SectionHeader>
      <Row
        primary="Allowance"
        caption="Monthly pool & weekend allocation"
        onClick={() => setSheet('allowance')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Allowance settings"
      />
      <Row
        primary="Recurring Register"
        caption="Pipe, bills, subs — what's committed monthly"
        onClick={() => setSheet('recurring')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Recurring Register"
      />
      <Row
        primary={pinLabel}
        caption={pinSub}
        onClick={() => setSheet('pin')}
        right={<Icon name="chevron-right" />}
        aria-label="Open PIN lock settings"
      />
      <Row
        primary="FI Assumptions"
        caption="Target, return rates, inflation"
        onClick={() => setSheet('assumptions')}
        right={<Icon name="chevron-right" />}
        aria-label="Open FI Assumptions"
      />
      <Row
        primary="Categories"
        caption="Tag transactions by lane for import auto-match"
        onClick={() => setSheet('categories')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Categories manager"
      />

      <SectionHeader style={{ marginTop: 'var(--space-3)' }}>Plan</SectionHeader>
      <Row
        primary="Decide"
        caption="What does this buy? Milestones, income, spending lens"
        onClick={() => setSheet('decide')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Decide lens"
      />

      <SectionHeader style={{ marginTop: 'var(--space-3)' }}>Household</SectionHeader>
      <Row
        primary="Members & Invites"
        caption="See who's in, invite your partner, transfer admin"
        onClick={() => setSheet('household')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Household members and invites"
      />

      <SectionHeader style={{ marginTop: 'var(--space-3)' }}>Data</SectionHeader>
      <Row
        primary="Get Claude Prompt"
        caption="Copy ready-made prompt to paste into Claude"
        onClick={() => setSheet('import_prompt')}
        right={<Icon name="chevron-right" />}
        aria-label="Open Claude import prompt"
      />
      <Row
        primary="Import Transactions"
        caption="Paste Claude's JSON output"
        onClick={handleReconcile}
        right={<Icon name="chevron-right" />}
        aria-label="Import transactions from Claude output"
      />
      <Row
        primary="Export Backup"
        caption="Download all data as JSON"
        onClick={handleExport}
        right={<Icon name="chevron-right" />}
        aria-label="Export data backup as JSON"
      />
      <Row
        primary="Restore Backup"
        caption="Replace all data from a backup file"
        onClick={() => setSheet('restore')}
        right={<Icon name="chevron-right" />}
        aria-label="Restore data from backup file"
      />
      <Row
        primary="Sign out of AI Manager"
        caption="End your household session on this device"
        onClick={async () => {
          if (window.confirm('Sign out of the AI Manager? The Manager tab will ask you to sign in again.')) {
            await supabase.auth.signOut()
            window.alert('Signed out.')
          }
        }}
        right={<Icon name="chevron-right" />}
        aria-label="Sign out of AI Manager"
      />

      <div style={{ paddingBlock: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
          FI Dashboard v0.3.0 · Offline-first with household cloud sync · Chat history stays on this device.
        </div>
      </div>

      <BottomSheet open={sheet === 'allowance'} onClose={() => setSheet(null)} title="Allowance" height="65dvh">
        <AllowanceEditor />
      </BottomSheet>

      <BottomSheet open={sheet === 'recurring'} onClose={() => setSheet(null)} title="Recurring Register" height="90dvh">
        <RecurringRegister />
      </BottomSheet>

      <BottomSheet open={sheet === 'pin'} onClose={() => setSheet(null)} title={pinLabel} height="60dvh">
        <PinSetup onDone={() => { setPinConfigured(hasPin()); setSheet(null) }} />
      </BottomSheet>

      <BottomSheet open={sheet === 'assumptions'} onClose={() => setSheet(null)} title="FI Assumptions" height="90dvh">
        <AssumptionsEditor />
      </BottomSheet>

      <BottomSheet open={sheet === 'restore'} onClose={() => setSheet(null)} title="Restore Backup" height="70dvh">
        <RestoreBackup onDone={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet open={sheet === 'categories'} onClose={() => setSheet(null)} title="Categories" height="90dvh">
        <CategoryManager />
      </BottomSheet>

      <BottomSheet open={sheet === 'import_prompt'} onClose={() => setSheet(null)} title="Claude Import Prompt" height="90dvh">
        <ImportPromptSheet />
      </BottomSheet>

      <BottomSheet open={sheet === 'household'} onClose={() => setSheet(null)} title="Household" height="75dvh">
        <HouseholdSheet />
      </BottomSheet>

      <BottomSheet open={sheet === 'decide'} onClose={() => setSheet(null)} title="Decide" height="92dvh">
        <DecideScreen />
      </BottomSheet>
    </div>
  )
}
