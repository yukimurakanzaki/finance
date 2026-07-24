import { LanePill } from '@components/LanePill'
import { Badge, SectionHeader } from '@components/ui'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { formatRp, parseRpInput } from '@lib/currency'
import { useReconcileStore } from '@stores/reconcileStore'
import { useState } from 'react'
import type { ValidImportRow } from '../../import/schema'
import { exclusionGroup } from './transferExclusion'

export function ReconcileConfirmScreen() {
  const { parseResult, flaggedRows, complete, cancel, setStep } =
    useReconcileStore()
  const [busy, setBusy] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, number>>({})
  // S2 fix (PAIN-POINTS.md): reconcile approve was all-or-nothing beyond amount
  // overrides — invalid rows were silently skipped behind a small red line, and
  // there was no way to drop a single valid-but-unwanted row short of cancelling
  // the whole import. Category/account/date overrides are a larger change and
  // are explicitly deferred — see the report. This adds: (a) a per-row exclude
  // toggle for valid rows, (b) a skip count baked into the action button copy
  // so it can't be missed.
  const [excluded, setExcluded] = useState<Set<number>>(new Set())

  if (!parseResult) return null

  const { invalid, duplicates } = parseResult
  const transfers = flaggedRows.filter((r) => r.is_transfer)
  const regular = flaggedRows.filter((r) => !r.is_transfer)

  function toggleExcluded(rowIndex: number) {
    // Exclude/include always covers the whole transfer pair, never a single leg
    // (see transferExclusion.ts — a lone leg would import a balance-breaking
    // orphan).
    const groupIndices = exclusionGroup(flaggedRows, rowIndex)
    setExcluded((prev) => {
      const next = new Set(prev)
      const willExclude = !next.has(rowIndex)
      for (const i of groupIndices) {
        if (willExclude) next.add(i)
        else next.delete(i)
      }
      return next
    })
  }

  // Everything the import file actually contained a row for (valid + invalid),
  // used as the denominator in the button copy so "22 of 25" reads honestly.
  const totalParsedRows = flaggedRows.length + invalid.length
  const excludedCount = [...excluded].filter((i) =>
    flaggedRows.some((r) => r._row_index === i),
  ).length
  const willImportCount = flaggedRows.length - excludedCount
  const skippedCount = invalid.length + excludedCount

  async function handleApprove() {
    setBusy(true)
    setStep('committing')
    try {
      // Apply any amount overrides, and drop user-excluded rows.
      const rows: ValidImportRow[] = flaggedRows
        .filter((r) => !excluded.has(r._row_index))
        .map((r) => {
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
        pass_through: 0,
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
    <div
      style={{
        padding: 'var(--space-4) var(--space-4) var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Chip label="Import" value={regular.length} color="var(--engine)" />
        <Chip label="Transfers" value={transfers.length} color="var(--store)" />
        <Chip label="Dupes" value={duplicates.length} color="var(--ink-3)" />
        <Chip
          label="Invalid"
          value={invalid.length}
          color={invalid.length > 0 ? 'var(--amber-text)' : 'var(--ink-3)'}
        />
      </div>

      {/* Regular transactions */}
      {regular.length > 0 && (
        <section>
          <SectionHeader>Transactions ({regular.length})</SectionHeader>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)',
            }}
          >
            {regular.map((row) => (
              <ReconcileRow
                key={row._row_index}
                row={row}
                override={overrides[row._row_index] ?? undefined}
                onOverride={(v) =>
                  setOverrides((prev) => ({ ...prev, [row._row_index]: v }))
                }
                excludedFlag={excluded.has(row._row_index)}
                onToggleExcluded={() => toggleExcluded(row._row_index)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transfers */}
      {transfers.length > 0 && (
        <section>
          <SectionHeader>
            Auto-collapsed transfers ({transfers.length})
          </SectionHeader>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)',
            }}
          >
            {transfers.map((row) => (
              <div
                key={row._row_index}
                style={{
                  background: 'var(--bg-2)',
                  borderRadius: 8,
                  border: '1px solid var(--border-1)',
                  padding: 'var(--space-2) var(--space-3)',
                  opacity: excluded.has(row._row_index) ? 0.4 : 0.6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleExcluded(row._row_index)}
                  aria-label={
                    excluded.has(row._row_index)
                      ? 'Include this row'
                      : 'Exclude this row'
                  }
                  aria-pressed={excluded.has(row._row_index)}
                  style={excludeToggleStyle(excluded.has(row._row_index))}
                >
                  {excluded.has(row._row_index) ? '↺' : '✕'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {row.note || row.category}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                    }}
                  >
                    {row.date} · Transfer
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-3)',
                  }}
                >
                  {row.direction === 'out' ? '−' : '+'}
                  {formatRp(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invalids — now impossible to miss: called out here AND folded into the
          button copy below (S2 fix). */}
      {invalid.length > 0 && (
        <section>
          <SectionHeader trailing={<Badge tone="warning">Skipped</Badge>}>
            Invalid rows ({invalid.length})
          </SectionHeader>
          <div style={{ marginTop: 'var(--space-2)' }}>
            {invalid.map((row) => (
              <div
                key={row._row_index}
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--amber-dim)',
                  padding: 'var(--space-1) 0',
                }}
              >
                Row {row._row_index + 1}:{' '}
                {row.errors.map((e) => e.message).join(', ')}
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={cancel}
          style={{
            flex: 1,
            padding: 'var(--space-3) 0',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            color: 'var(--ink-2)',
            fontSize: 'var(--text-section)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy || willImportCount === 0}
          style={{
            flex: 2,
            padding: 'var(--space-3) 0',
            background: busy ? 'var(--bg-3)' : 'var(--amber)',
            border: 'none',
            borderRadius: 10,
            color: busy ? 'var(--ink-3)' : 'var(--on-accent)',
            fontSize: 'var(--text-body)',
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'var(--font-ui)',
            transition: 'background .15s',
          }}
        >
          {busy
            ? 'Saving…'
            : skippedCount > 0
              ? `Approve ${willImportCount} of ${totalParsedRows} — ${skippedCount} skipped`
              : `Approve all (${willImportCount})`}
        </button>
      </div>
    </div>
  )
}

function Chip({
  label,
  value,
  color,
}: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-2)',
        border: '1px solid var(--border-1)',
        borderRadius: 8,
        padding: 'var(--space-2) var(--space-2)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-title)',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--ink-3)',
          letterSpacing: '.3px',
          textTransform: 'uppercase',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function excludeToggleStyle(excludedFlag: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: 8,
    border: `1px solid ${excludedFlag ? 'var(--amber-border)' : 'var(--border-2)'}`,
    background: excludedFlag ? 'var(--amber-surface)' : 'var(--bg-2)',
    color: excludedFlag ? 'var(--amber-text)' : 'var(--ink-3)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  }
}

function ReconcileRow({
  row,
  override,
  onOverride,
  excludedFlag,
  onToggleExcluded,
}: {
  row: ValidImportRow
  override: number | undefined
  onOverride: (v: number) => void
  excludedFlag: boolean
  onToggleExcluded: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div
      style={{
        background: 'var(--bg-1)',
        borderRadius: 8,
        border: '1px solid var(--border-1)',
        padding: 'var(--space-2) var(--space-3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-2)',
        opacity: excludedFlag ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggleExcluded}
        aria-label={excludedFlag ? 'Include this row' : 'Exclude this row'}
        aria-pressed={excludedFlag}
        style={excludeToggleStyle(excludedFlag)}
      >
        {excludedFlag ? '↺' : '✕'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--ink-1)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.note || row.category || '—'}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            marginTop: 2,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {row.date} · {row._resolved_account.name}
          <LanePill lane={row.suggested_lane} size="xs" />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {editing ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: this input renders only in response to an explicit tap-to-edit, so focusing it immediately is the intended behavior
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = parseRpInput(draft)
              if (n !== null) onOverride(n)
              setEditing(false)
            }}
            style={{
              width: 80,
              background: 'var(--bg-3)',
              border: '1px solid var(--amber-border)',
              borderRadius: 6,
              color: 'var(--amber-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-caption)',
              padding: '3px 6px',
              outline: 'none',
              textAlign: 'right',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(override ?? row.amount))
              setEditing(true)
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color:
                override !== undefined ? 'var(--amber-text)' : 'var(--ink-1)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-section)',
              fontWeight: 600,
              padding: 0,
            }}
          >
            {row.direction === 'out' ? '−' : '+'}
            {formatRp(override ?? row.amount)}
          </button>
        )}
      </div>
    </div>
  )
}
