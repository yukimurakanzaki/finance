import { BottomSheet } from '@components/BottomSheet'
import { Row, Screen, SectionHeader } from '@components/ui'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { DecideScreen } from '@features/decide/DecideScreen'
import { IncomeLog } from '@features/decide/IncomeLog'
import { useI18n } from '@i18n/index'
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
  const { t, language, setLanguage } = useI18n()
  const { start: startReconcile } = useReconcileStore()
  const { setTab, openOnboarding } = useAppStore()
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

  const pinLabel = pinConfigured ? t.more.pinLockSet : t.more.pinLockNotSet
  const pinSub = pinConfigured
    ? t.more.pinLockedCaption
    : t.more.pinNotLockedCaption

  return (
    <Screen>
      <SectionHeader>{t.more.appearance}</SectionHeader>
      <div>
        <Row
          onClick={toggleTheme}
          primary={`${t.more.theme}: ${theme === 'light' ? t.more.themeLight : t.more.themeDark}`}
          caption={t.more.themeCaption}
        />
        <Row
          onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}
          primary={`${t.more.language}: ${language === 'id' ? 'Bahasa Indonesia' : 'English'}`}
          caption={t.more.languageDesc}
        />
      </div>

      <SectionHeader>{t.more.financialSetup}</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('allowance')}
          primary={t.more.allowance}
          caption={t.more.allowanceCaption}
        />
        <Row
          onClick={() => setSheet('recurring')}
          primary={t.more.recurringRegister}
          caption={t.more.recurringRegisterCaption}
        />
        <Row
          onClick={() => openOnboarding(1)}
          primary={t.more.setupWizard}
          caption={t.more.setupWizardCaption}
        />
        <Row
          onClick={() => setSheet('assumptions')}
          primary={t.more.fiAssumptions}
          caption={t.more.fiAssumptionsCaption}
        />
        <Row
          onClick={() => setSheet('categories')}
          primary={t.more.categories}
          caption={t.more.categoriesCaption}
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
      <SectionHeader>{t.more.income}</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('income')}
          primary={t.more.logIncome}
          caption={t.more.logIncomeCaption}
        />
      </div>

      <SectionHeader>{t.more.plan}</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('decide')}
          primary={t.nav.decide}
          caption={t.more.decideCaption}
        />
      </div>

      <SectionHeader>{t.more.household}</SectionHeader>
      <div>
        <Row
          onClick={() => setSheet('household')}
          primary={t.more.membersInvites}
          caption={t.more.membersInvitesCaption}
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
      <SectionHeader>{t.more.data}</SectionHeader>
      <div>
        <Row
          onClick={() => setTab('chat')}
          primary={t.more.logViaManager}
          caption={t.more.logViaManagerCaption}
        />
        <Row
          onClick={handleReconcile}
          primary={t.more.importTransactions}
          caption={t.more.importTransactionsCaption}
        />
        <Row
          onClick={() => setSheet('import_prompt')}
          primary={t.more.advancedImport}
          caption={t.more.advancedImportCaption}
        />
        <Row
          onClick={handleExport}
          primary={t.more.exportBackup}
          caption={t.more.exportBackupCaption}
        />
        <Row
          onClick={() => setSheet('restore')}
          primary={t.more.restoreBackup}
          caption={t.more.restoreBackupCaption}
        />
        <Row
          onClick={async () => {
            if (window.confirm(t.more.signOutConfirm)) {
              await supabase.auth.signOut()
              window.alert(t.more.signedOutAlert)
            }
          }}
          primary={t.more.signOutManager}
          caption={t.more.signOutCaption}
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
          {t.more.footer}
        </div>
      </div>

      <BottomSheet
        open={sheet === 'allowance'}
        onClose={() => setSheet(null)}
        title={t.more.allowance}
        height="65dvh"
      >
        <AllowanceEditor />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'recurring'}
        onClose={() => setSheet(null)}
        title={t.more.recurringRegister}
        height="90dvh"
      >
        <RecurringRegister />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'income'}
        onClose={() => setSheet(null)}
        title={t.decide.incomeLog}
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
        title={t.more.fiAssumptions}
        height="90dvh"
      >
        <AssumptionsEditor />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'restore'}
        onClose={() => setSheet(null)}
        title={t.more.restoreBackup}
        height="70dvh"
      >
        <RestoreBackup onDone={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'categories'}
        onClose={() => setSheet(null)}
        title={t.more.categories}
        height="90dvh"
      >
        <CategoryManager />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'import_prompt'}
        onClose={() => setSheet(null)}
        title={t.more.advancedImport}
        height="90dvh"
      >
        <ImportPromptSheet />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'household'}
        onClose={() => setSheet(null)}
        title={t.more.household}
        height="75dvh"
      >
        <HouseholdSheet />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'decide'}
        onClose={() => setSheet(null)}
        title={t.nav.decide}
        height="92dvh"
      >
        <DecideScreen />
      </BottomSheet>
    </Screen>
  )
}
