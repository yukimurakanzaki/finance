interface Props {
  children: React.ReactNode
  /** Inner padding. Default 16px (--space-4). Pass a token string or number. */
  padding?: number | string
  style?: React.CSSProperties
  className?: string
  /** Make the card respond to touch/mouse gestures (used for long-press delete). */
  interactive?: boolean
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
  title?: string
}

// The ONE bordered-box primitive (Calm Ledger v2 §3 / D2). Depth otherwise comes
// from the bg-0/1/2 ladder and hairline row separators — cards survive only for
// the hero stat and the gauge, so this is deliberately the sole boxed surface.
export function Card({
  children,
  padding = 'var(--space-4)',
  style,
  className,
  interactive,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  title,
}: Props) {
  return (
    <div
      className={className}
      title={title}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 16,
        padding,
        cursor: interactive ? 'pointer' : undefined,
        userSelect: interactive ? 'none' : undefined,
        WebkitUserSelect: interactive ? 'none' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
