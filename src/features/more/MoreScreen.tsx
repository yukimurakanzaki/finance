import { useState } from 'react'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { useReconcileStore } from '@stores/reconcileStore'
import { useAppStore } from '@stores/appStore'
import { RecurringRegister } from './RecurringRegister'
import { AllowanceEditor } from './AllowanceEditor'
import { BottomSheet } from '@components/BottomSheet'

type Sheet = 'recurring' | 'allowance' | null

export function MoreScreen() {
  const { start: startReconcile } = useReconcileStore()
  const { setTab } = useAppStore()
  const [sheet, setSheet] = useState<Sheet>(null)

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

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel>Setup</SectionLabel>
      <MenuRow label="Allowance" sub="Monthly pool & weekend allocation" onClick={() => setSheet('allowance')} />
      <MenuRow label="Recurring Register" sub="Pipe, bills, subs — what's committed monthly" onClick={() => setSheet('recurring')} />

      <SectionLabel style={{ marginTop: 12 }}>Data</SectionLabel>
      <MenuRow label="Import Transactions" sub="Paste Claude's JSON output" onClick={handleReconcile} />
      <MenuRow label="Export Backup" sub="Download all data as JSON" onClick={handleExport} />

      <div style={{ marginTop: 24, padding: '0 4px' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          FI Dashboard v0.1.0 · Local-first · No server · Your data stays on this device.
        </div>
      </div>

      <BottomSheet open={sheet === 'allowance'} onClose={() => setSheet(null)} title="Allowance" height="65dvh">
        <AllowanceEditor />
      </BottomSheet>

      <BottomSheet open={sheet === 'recurring'} onClose={() => setSheet(null)} title="Recurring Register" height="90dvh">
        <RecurringRegister />
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
