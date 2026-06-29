import { useState } from 'react'
import { useReconcileStore } from '@stores/reconcileStore'
import { parseImportJSON, detectTransfersAsync } from '../../import/parser'
import { db } from '@db/db'

export function ReconcileEntryScreen() {
  const { rawInput, setRawInput, setStep, setParseResult, setFlaggedRows, setError } =
    useReconcileStore()
  const [busy, setBusy] = useState(false)

  async function handleParse() {
    if (!rawInput.trim()) return
    setBusy(true)
    setStep('parsing')
    try {
      const result = await parseImportJSON(rawInput)
      setParseResult(result)

      setStep('detecting')
      const accounts = await db.accounts.filter((a) => a.is_active).toArray()
      const ownIds = accounts.map((a) => a.id!)
      const flagged = await detectTransfersAsync(result.valid, ownIds)
      setFlaggedRows(flagged)
      setStep('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setStep('entry')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 6 }}>
          Paste Claude's JSON output
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>
          Share your bank statement with Claude and ask it to extract transactions in the FI Dashboard import format.
        </div>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={'[\n  {"date": "2026-06-01", "amount": 50000, "direction": "out", ...}\n]'}
          style={{
            width: '100%', height: 180, background: 'var(--bg-2)',
            border: '1px solid var(--border-2)', borderRadius: 10,
            color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontSize: 12,
            padding: 12, resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      <button
        onClick={handleParse}
        disabled={busy || !rawInput.trim()}
        style={{
          background: busy || !rawInput.trim() ? 'var(--bg-3)' : 'var(--amber)',
          color: busy || !rawInput.trim() ? 'var(--ink-3)' : '#000',
          border: 'none', borderRadius: 10, padding: '14px 0',
          fontSize: 14, fontWeight: 700, cursor: busy || !rawInput.trim() ? 'default' : 'pointer',
          fontFamily: 'var(--font-ui)', transition: 'background .15s',
        }}
      >
        {busy ? 'Processing…' : 'Parse & Detect Transfers'}
      </button>
    </div>
  )
}
