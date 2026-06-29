import { useState } from 'react'
import { useReconcileStore } from '@stores/reconcileStore'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { formatRp } from '@lib/currency'
import { LanePill } from '@components/LanePill'
import type { ValidImportRow } from '../../import/schema'

export function ReconcileConfirmScreen() {
  const { parseResult, flaggedRows, complete, cancel, setStep } = useReconcileStore()
  const [busy, setBusy] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, number>>({})

  if (!parseResult) return null

  const { invalid, duplicates } = parseResult
  const transfers = flaggedRows.filter((r) => r.is_transfer)
  const regular = flaggedRows.filter((r) => !r.is_transfer)

  async function handleApprove() {
    setBusy(true)
    setStep('committing')
    try {
      // Apply any amount overrides
      const rows: ValidImportRow[] = flaggedRows.map((r) => {
        const ov = overrides[r._row_index]
        return ov !== undefined ? { ...r, amount: ov } : r
      })

      // Compute yearMonth from first row date
      const firstDate = rows[0]?.date ?? new Date().toISOString().slice(0, 7)
      const yearMonth = firstDate.slice(0, 7)

      // Simple lane totals for snapshot (all zeros — will be recalculated by useNetWorth)
      const blankTotals = {
        income_producing: 0,
        store_of_value: 0,
        debt_liability: 0,
        protected_living: 0,
      }

      await transactionsRepo.importBatch(rows, yearMonth, blankTotals, 0)
      complete()
    } catch (e) {
      console.error(e)
      setStep('confirm')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Chip label="Import" value={regular.length} color="var(--engine)" />
        <Chip label="Transfers" value={transfers.length} color="var(--store)" />
        <Chip label="Dupes" value={duplicates.length} color="var(--ink-3)" />
        <Chip label="Invalid" value={invalid.length} color={invalid.length > 0 ? 'var(--amber-text)' : 'var(--ink-3)'} />
      </div>

      {/* Regular transactions */}
      {regular.length > 0 && (
        <section>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Transactions ({regular.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {regular.map((row) => (
              <ReconcileRow
                key={row._row_index}
                row={row}
                override={overrides[row._row_index] ?? undefined}
                onOverride={(v) => setOverrides((prev) => ({ ...prev, [row._row_index]: v }))}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transfers */}
      {transfers.length > 0 && (
        <section>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Auto-collapsed transfers ({transfers.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {transfers.map((row) => (
              <div
                key={row._row_index}
                style={{
                  background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border-1)',
                  padding: '10px 12px', opacity: 0.6,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{row.note || row.category}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{row.date} · Transfer</div>
                </div>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
                  {row.direction === 'out' ? '−' : '+'}{formatRp(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invalids */}
      {invalid.length > 0 && (
        <section>
          <div style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--amber-text)', marginBottom: 8 }}>
            Invalid rows (will be skipped)
          </div>
          {invalid.map((row) => (
            <div key={row._row_index} style={{ fontSize: 12, color: 'var(--amber-dim)', padding: '4px 0' }}>
              Row {row._row_index + 1}: {row.errors.map((e) => e.message).join(', ')}
            </div>
          ))}
        </section>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={cancel}
          style={{
            flex: 1, padding: '13px 0', background: 'var(--bg-2)',
            border: '1px solid var(--border-2)', borderRadius: 10,
            color: 'var(--ink-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleApprove}
          disabled={busy || flaggedRows.length === 0}
          style={{
            flex: 2, padding: '13px 0',
            background: busy ? 'var(--bg-3)' : 'var(--amber)',
            border: 'none', borderRadius: 10,
            color: busy ? 'var(--ink-3)' : '#000',
            fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)', transition: 'background .15s',
          }}
        >
          {busy ? 'Saving…' : `Approve all (${regular.length})`}
        </button>
      </div>
    </div>
  )
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-1)',
      borderRadius: 8, padding: '8px 6px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '.3px', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ReconcileRow({
  row,
  override,
  onOverride,
}: {
  row: ValidImportRow
  override: number | undefined
  onOverride: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div style={{
      background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--border-1)',
      padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.note || row.category || '—'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
          {row.date} · {row._resolved_account.name}
          <LanePill lane={row.suggested_lane} size="xs" />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = Number(draft.replace(/[.,]/g, ''))
              if (n > 0) onOverride(n)
              setEditing(false)
            }}
            style={{
              width: 80, background: 'var(--bg-3)', border: '1px solid var(--amber-border)',
              borderRadius: 6, color: 'var(--amber-text)', fontFamily: 'var(--font-mono)',
              fontSize: 12, padding: '3px 6px', outline: 'none', textAlign: 'right',
            }}
          />
        ) : (
          <button
            onClick={() => { setDraft(String(override ?? row.amount)); setEditing(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: override !== undefined ? 'var(--amber-text)' : 'var(--ink-1)',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, padding: 0,
            }}
          >
            {row.direction === 'out' ? '−' : '+'}{formatRp(override ?? row.amount)}
          </button>
        )}
      </div>
    </div>
  )
}
