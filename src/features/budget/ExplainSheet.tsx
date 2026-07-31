import { BottomSheet } from '@components/BottomSheet'
import { Amount, SectionHeader } from '@components/ui'
import type { Explanation, ExplainRow } from '@engine/explain'
import { useI18n } from '@i18n/index'

interface Props {
  open: boolean
  onClose: () => void
  explanation: Explanation
  /** Opens the screen where a declared input is edited (FR-4.5). */
  onEditAllowance?: () => void
}

// Renders whatever `explainSafeToSpend` produced. Deliberately holds no formula
// of its own (FR-4.1 / NFR-4.1): it maps row ids to labels and lays them out.
// If a number here is ever wrong, the engine is wrong — there is nowhere else
// for it to go wrong.
const OP_GLYPH: Record<ExplainRow['op'], string> = {
  base: '',
  minus: '−',
  divide: '÷',
  equals: '=',
}

export function ExplainSheet({
  open,
  onClose,
  explanation,
  onEditAllowance,
}: Props) {
  const { t } = useI18n()
  const x = t.budget.explain

  return (
    <BottomSheet open={open} onClose={onClose} title={x.title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {explanation.rows.map((r) => {
          const label = x.rows[r.id as keyof typeof x.rows]
          const isResult = r.op === 'equals'
          const editable = r.kind === 'declared' && r.id === 'allowance'

          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) 0',
                // The chain reads as arithmetic: results sit flush, operands are
                // indented under the operator that combines them.
                paddingLeft: isResult ? 0 : 'var(--space-3)',
                borderTop: isResult ? '1px solid var(--border-1)' : 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  flexShrink: 0,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {OP_GLYPH[r.op]}
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 'var(--text-body)',
                    lineHeight: 'var(--leading-body)',
                    color: 'var(--ink-1)',
                    fontWeight: isResult ? 600 : 400,
                  }}
                >
                  {label}
                </span>
                {/* FR-4.4: "you set this" vs "we calculated this" is the actual
                    user need — a declared input is something they can change. */}
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-caption)',
                    lineHeight: 'var(--leading-caption)',
                    color: 'var(--ink-3)',
                    letterSpacing: 'var(--tracking-label)',
                  }}
                >
                  {r.kind === 'declared' ? x.youSetThis : x.weCalculated}
                  {r.note === 'floored' && ` · ${x.flooredNote}`}
                  {r.note === 'clamped' && ` · ${x.clampedNote}`}
                </span>
              </span>

              <span style={{ flexShrink: 0, textAlign: 'right' }}>
                {r.value === null ? (
                  // FR-4.6: an em dash, never Rp 0 — the app does not yet know.
                  <span
                    style={{
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink-3)',
                    }}
                  >
                    —
                  </span>
                ) : r.id === 'weeks' || r.id === 'remainingWorkdays' ? (
                  // Counts, not money — formatRp would render "Rp 4".
                  <span
                    style={{
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink-1)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.value}
                  </span>
                ) : (
                  <Amount value={r.value} full />
                )}
                {editable && onEditAllowance && (
                  <button
                    type="button"
                    onClick={onEditAllowance}
                    style={{
                      display: 'block',
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 'var(--text-caption)',
                      color: 'var(--accent-text)',
                    }}
                  >
                    {t.common.edit}
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* FR-4.3: never inside the subtraction chain. These are already netted
          into the allowance above; showing them as chain rows would be the C-1
          double count made visible and authoritative. */}
      {explanation.alreadyExcluded.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <SectionHeader>{x.alreadyExcludedTitle}</SectionHeader>
          <p
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              color: 'var(--ink-2)',
            }}
          >
            {x.alreadyExcludedNote}
          </p>
          {explanation.alreadyExcluded.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: 'var(--space-2) 0',
              }}
            >
              <span
                style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}
              >
                {x.rows[e.id as keyof typeof x.rows]}
              </span>
              <Amount value={e.value} full tone="muted" />
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
