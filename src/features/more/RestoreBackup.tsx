import { useState, useRef } from 'react'
import { db } from '@db/db'
import { Btn } from '@components/FormField'

type Phase = 'idle' | 'preview' | 'restoring' | 'done' | 'error'

interface BackupEnvelope {
  schema_version: number
  exported_at: string
  data: {
    accounts?: unknown[]
    assets?: unknown[]
    transactions?: unknown[]
    categories?: unknown[]
    envelopes?: unknown[]
    recurringItems?: unknown[]
    allowance?: unknown[]
    netWorthSnapshots?: unknown[]
    incomeEvents?: unknown[]
    milestones?: unknown[]
    assumptions?: unknown[]
    appSettings?: unknown[]
  }
}

function countRows(env: BackupEnvelope) {
  const d = env.data
  return {
    accounts: d.accounts?.length ?? 0,
    assets: d.assets?.length ?? 0,
    transactions: d.transactions?.length ?? 0,
    categories: d.categories?.length ?? 0,
    recurringItems: d.recurringItems?.length ?? 0,
    allowance: d.allowance?.length ?? 0,
    incomeEvents: d.incomeEvents?.length ?? 0,
    assumptions: d.assumptions?.length ?? 0,
    appSettings: d.appSettings?.length ?? 0,
  }
}

export function RestoreBackup({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [envelope, setEnvelope] = useState<BackupEnvelope | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleFilePick() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as BackupEnvelope
      if (!parsed.schema_version || !parsed.data) {
        throw new Error('Not a valid FI Dashboard backup file.')
      }
      setEnvelope(parsed)
      setPhase('preview')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file.')
      setPhase('error')
    }
    e.target.value = ''
  }

  async function handleRestore() {
    if (!envelope) return
    setPhase('restoring')
    try {
      const d = envelope.data
      await db.transaction('rw', [
        db.accounts, db.assets, db.transactions, db.categories,
        db.envelopes, db.recurringItems, db.allowance,
        db.netWorthSnapshots, db.incomeEvents, db.milestones,
        db.assumptions, db.appSettings,
      ], async () => {
        await db.accounts.clear()
        await db.assets.clear()
        await db.transactions.clear()
        await db.categories.clear()
        await db.envelopes.clear()
        await db.recurringItems.clear()
        await db.allowance.clear()
        await db.netWorthSnapshots.clear()
        await db.incomeEvents.clear()
        await db.milestones.clear()
        await db.assumptions.clear()
        await db.appSettings.clear()

        if (d.accounts?.length) await db.accounts.bulkAdd(d.accounts as Parameters<typeof db.accounts.bulkAdd>[0])
        if (d.assets?.length) await db.assets.bulkAdd(d.assets as Parameters<typeof db.assets.bulkAdd>[0])
        if (d.transactions?.length) await db.transactions.bulkAdd(d.transactions as Parameters<typeof db.transactions.bulkAdd>[0])
        if (d.categories?.length) await db.categories.bulkAdd(d.categories as Parameters<typeof db.categories.bulkAdd>[0])
        if (d.envelopes?.length) await db.envelopes.bulkAdd(d.envelopes as Parameters<typeof db.envelopes.bulkAdd>[0])
        if (d.recurringItems?.length) await db.recurringItems.bulkAdd(d.recurringItems as Parameters<typeof db.recurringItems.bulkAdd>[0])
        if (d.allowance?.length) await db.allowance.bulkAdd(d.allowance as Parameters<typeof db.allowance.bulkAdd>[0])
        if (d.netWorthSnapshots?.length) await db.netWorthSnapshots.bulkAdd(d.netWorthSnapshots as Parameters<typeof db.netWorthSnapshots.bulkAdd>[0])
        if (d.incomeEvents?.length) await db.incomeEvents.bulkAdd(d.incomeEvents as Parameters<typeof db.incomeEvents.bulkAdd>[0])
        if (d.milestones?.length) await db.milestones.bulkAdd(d.milestones as Parameters<typeof db.milestones.bulkAdd>[0])
        if (d.assumptions?.length) await db.assumptions.bulkAdd(d.assumptions as Parameters<typeof db.assumptions.bulkAdd>[0])
        if (d.appSettings?.length) await db.appSettings.bulkAdd(d.appSettings as Parameters<typeof db.appSettings.bulkAdd>[0])
      })
      setPhase('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed.')
      setPhase('error')
    }
  }

  if (phase === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
          This will <strong style={{ color: '#ef4444' }}>erase all current data</strong> and replace it with the backup.
          Make sure you've exported your current data first.
        </div>
        <input ref={inputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
        <Btn onClick={handleFilePick} fullWidth>Choose backup file…</Btn>
        <Btn variant="secondary" onClick={onDone} fullWidth>Cancel</Btn>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 'var(--text-section)', color: '#ef4444' }}>{errorMsg}</div>
        <Btn onClick={() => setPhase('idle')} fullWidth>Try again</Btn>
        <Btn variant="secondary" onClick={onDone} fullWidth>Cancel</Btn>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 'var(--text-section)', color: 'var(--engine)' }}>
          Restore complete. Reload the app to see your data.
        </div>
        <Btn onClick={() => window.location.reload()} fullWidth>Reload now</Btn>
      </div>
    )
  }

  if (phase === 'restoring') {
    return (
      <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-2)' }}>Restoring…</div>
    )
  }

  // preview
  if (!envelope) return null
  const counts = countRows(envelope)
  const exportedAt = new Date(envelope.exported_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-2)' }}>
        Backup from <strong style={{ color: 'var(--ink-1)' }}>{exportedAt}</strong>
      </div>
      <div style={{
        background: 'var(--bg-2)', borderRadius: 'var(--space-2)', paddingBlock: 'var(--space-3)', paddingInline: 'var(--space-3)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
      }}>
        {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-caption)' }}>
            <span style={{ color: 'var(--ink-3)' }}>{k}</span>
            <span style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 'var(--text-caption)', color: '#ef4444', lineHeight: 1.5 }}>
        All current data will be erased. This cannot be undone.
      </div>
      <Btn variant="danger" onClick={handleRestore} fullWidth>Restore this backup</Btn>
      <Btn variant="secondary" onClick={() => setPhase('idle')} fullWidth>Choose different file</Btn>
      <Btn variant="secondary" onClick={onDone} fullWidth>Cancel</Btn>
    </div>
  )
}
