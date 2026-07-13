interface Props {
  /** Data label — rendered uppercase-tracked (the caption treatment kept ONLY
   *  for data labels inside tiles, per D3; section headers use <SectionHeader>). */
  label: string
  /** The number/value. Pass an <Amount> or a formatted string. */
  value: React.ReactNode
  /** Optional smaller line under the value. */
  sub?: React.ReactNode
  /** Value type-scale size. Default 'display' (the standing-strip hero). */
  size?: 'display' | 'title'
  style?: React.CSSProperties
  className?: string
}

// The "standing strip" building block (Calm Ledger v2 §1): an uppercase data
// label over one staged, tabular number, with an optional sub-value.
export function StatTile({
  label,
  value,
  sub,
  size = 'display',
  style,
  className,
}: Props) {
  const isDisplay = size === 'display'
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}
    >
      <span
        style={{
          fontSize: 'var(--text-caption)',
          lineHeight: 'var(--leading-caption)',
          color: 'var(--ink-2)',
          textTransform: 'uppercase',
          letterSpacing: '.5px',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: isDisplay ? 'var(--text-display)' : 'var(--text-title)',
          lineHeight: isDisplay
            ? 'var(--leading-display)'
            : 'var(--leading-title)',
          fontWeight: 700,
          letterSpacing: isDisplay ? '-.8px' : '-.2px',
          color: 'var(--ink-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {sub !== undefined && (
        <span
          style={{
            fontSize: 'var(--text-caption)',
            lineHeight: 'var(--leading-caption)',
            color: 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}
