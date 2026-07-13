interface Props {
  /** Primary line — body text, ellipsis-truncated. */
  primary: React.ReactNode
  /** Secondary line — caption text, ellipsis-truncated. */
  caption?: React.ReactNode
  /** Left slot, typically an <Icon> in a tile. */
  icon?: React.ReactNode
  /** Right slot, typically an <Amount>. */
  right?: React.ReactNode
  /** When passed, the row renders as a <button> with a pressed state. */
  onClick?: () => void
  'aria-label'?: string
  style?: React.CSSProperties
  className?: string
}

// Flush list row (Calm Ledger v2 §3 — "rows, not boxes"): 56px min height,
// 12×16 padding, a single hairline separator, and a pressed state (via the
// .ui-row class in index.css). Renders as a <button> when interactive, else a
// <div>. Middle content truncates so amounts in the right slot always gutter.
export function Row({
  primary,
  caption,
  icon,
  right,
  onClick,
  style,
  className,
  ...rest
}: Props) {
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    minHeight: 56,
    padding: '12px 16px',
    width: '100%',
    borderBottom: '1px solid var(--border-1)',
    textAlign: 'left',
    color: 'inherit',
    background: 'none',
    ...style,
  }

  const content = (
    <>
      {icon !== undefined && (
        <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-body)',
            fontWeight: 500,
            color: 'var(--ink-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {primary}
        </span>
        {caption !== undefined && (
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              color: 'var(--ink-3)',
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {caption}
          </span>
        )}
      </span>
      {right !== undefined && <span style={{ flexShrink: 0 }}>{right}</span>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={['ui-row', className].filter(Boolean).join(' ')}
        style={{
          ...base,
          border: 'none',
          borderBottom: base.borderBottom,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        {...rest}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={className} style={base} {...rest}>
      {content}
    </div>
  )
}
