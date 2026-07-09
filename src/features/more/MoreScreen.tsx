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
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel>Appearance</SectionLabel>
      <MenuRow
        label={`Theme: ${theme === 'light' ? 'Light (blue)' : 'Dark'}`}
        sub="Tap to switch between dark and light"
        onClick={toggleTheme}
      />

      <SectionLabel style={{ marginTop: 12 }}>Setup</SectionLabel>
      <MenuRow label="Allowance" sub="Monthly pool & weekend allocation" onClick={() => setSheet('allowance')} />
      <MenuRow label="Recurring Register" sub="Pipe, bills, subs — what's committed monthly" onClick={() => setSheet('recurring')} />
      <MenuRow label={pinLabel} sub={pinSub} onClick={() => setSheet('pin')} />
      <MenuRow label="FI Assumptions" sub="Target, return rates, inflation" onClick={() => setSheet('assumptions')} />
      <MenuRow label="Categories" sub="Tag transactions by lane for import auto-match" onClick={() => setSheet('categories')} />

      <SectionLabel style={{ marginTop: 12 }}>Plan</SectionLabel>
      <MenuRow label="Decide" sub="What does this buy? Milestones, income, spending lens" onClick={() => setSheet('decide')} />

      <SectionLabel style={{ marginTop: 12 }}>Household</SectionLabel>
      <MenuRow label="Members & Invites" sub="See who's in, invite your partner, transfer admin" onClick={() => setSheet('household')} />

      <SectionLabel style={{ marginTop: 12 }}>Data</SectionLabel>
      <MenuRow label="Get Claude Prompt" sub="Copy ready-made prompt to paste into Claude" onClick={() => setSheet('import_prompt')} />
      <MenuRow label="Import Transactions" sub="Paste Claude's JSON output" onClick={handleReconcile} />
      <MenuRow label="Export Backup" sub="Download all data as JSON" onClick={handleExport} />
      <MenuRow label="Restore Backup" sub="Replace all data from a backup file" onClick={() => setSheet('restore')} />
      <MenuRow
        label="Sign out of AI Manager"
        sub="End your household session on this device"
        onClick={async () => {
          if (window.confirm('Sign out of the AI Manager? The Manager tab will ask you to sign in again.')) {
            await supabase.auth.signOut()
            window.alert('Signed out.')
          }
        }}
      />

      <div style={{ marginTop: 24, padding: '0 4px' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          FI Dashboard v0.1.0 · Offline-first with household cloud sync · Chat history stays on this device.
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

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4, ...style }}>
      {children}
    </div>
  )
}

function MenuRow({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10,
        padding: '13px 14px', cursor: 'pointer', width: '100%', textAlign: 'left',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-1)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ color: 'var(--ink-3)', fontSize: 16 }}>›</span>
    </button>
  )
}
