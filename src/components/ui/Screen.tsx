interface Props {
  children: React.ReactNode
  /** Drop the standard 16px gutter (e.g. for edge-to-edge row lists). */
  noPadding?: boolean
  style?: React.CSSProperties
  className?: string
}

// Page container: the standard 16px screen gutter and a vertical flex column
// with a 16px section rhythm (Calm Ledger v2 §7 — spacing scale). Every feature
// screen wraps its body in this instead of an ad-hoc padded div.
export function Screen({ children, noPadding, style, className }: Props) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: noPadding ? 0 : 'var(--space-4)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
