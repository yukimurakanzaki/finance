interface Props {
  /** Sentence-case label — NOT uppercase (Calm Ledger v2 §1 / D3). */
  children: React.ReactNode
  /** Optional right-aligned trailing summary (e.g. "3 · −Rp 61.500"). */
  trailing?: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

// Section header: sentence-case 13px semibold ink-2, with an optional caption
// summary on the right. This replaces the 10px-uppercase-everywhere pattern for
// section headers specifically — the uppercase treatment survives only as tile
// data labels (see <StatTile>), which is the distinction D3 calls out.
export function SectionHeader({ children, trailing, style, className }: Props) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-section)',
          lineHeight: 'var(--leading-section)',
          fontWeight: 600,
          color: 'var(--ink-2)',
        }}
      >
        {children}
      </span>
      {trailing !== undefined && (
        <span
          style={{
            fontSize: 'var(--text-caption)',
            lineHeight: 'var(--leading-caption)',
            color: 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {trailing}
        </span>
      )}
    </div>
  )
}
