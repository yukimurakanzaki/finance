export type BadgeTone = 'default' | 'positive' | 'warning'

const TONE_COLOR: Record<BadgeTone, string> = {
  default: 'var(--ink-3)',
  // Matches <Amount>'s 'positive' tone colour (--engine) — same semantic slot.
  positive: 'var(--engine)',
  // Matches the app's one-accent "informs, never alarms" governor colour.
  warning: 'var(--amber-text)',
}

interface Props {
  children: React.ReactNode
  /** Colour role. Default 'default' (ink-3, neutral). */
  tone?: BadgeTone
  style?: React.CSSProperties
  className?: string
}

// Small uppercase status tag — text-only, no fill, token-based (Calm Ledger v2 /
// D1). Introduced in Phase 4/B1: Phase 3's Today screen signalled transfer/status
// via the Row `icon` slot + `caption` text + `<Amount tone="muted">`, which
// doesn't fit a compact inline marker sitting next to another pill (e.g. AUTO /
// PRICE STALE beside a LanePill) — so there was no reusable badge component to
// carry forward. This is deliberately minimal: no background, no border, reusing
// the same tone vocabulary as <Amount> so status colour stays consistent
// app-wide.
export function Badge({ children, tone = 'default', style, className }: Props) {
  return (
    <span
      className={className}
      style={{
        fontSize: 'var(--text-caption)',
        lineHeight: 'var(--leading-caption)',
        fontWeight: 600,
        letterSpacing: '.3px',
        textTransform: 'uppercase',
        color: TONE_COLOR[tone],
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
