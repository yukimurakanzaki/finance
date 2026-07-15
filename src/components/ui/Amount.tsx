import { type AmountSign, type AmountTone, resolveAmount } from './amountFormat'

export type { AmountTone, AmountSign }

interface Props {
  /** Signed rupiah value. Magnitude is formatted; sign glyph is controlled by `sign`. */
  value: number
  /** false → formatRp (abbreviated: jt/M); true → formatRpFull (dot-grouped). Default false. */
  full?: boolean
  /** Colour role. Default 'default' (ink-1). */
  tone?: AmountTone
  /** Leading-sign policy. Default 'auto' (minus on negatives only). */
  sign?: AmountSign
  style?: React.CSSProperties
  className?: string
}

// Right-aligned, tabular-figures rupiah amount — the one sanctioned way to put a
// number on screen (Calm Ledger v2 §2 / D5). Digits gutter down a list because
// every Amount shares `font-variant-numeric: tabular-nums` and right alignment.
export function Amount({
  value,
  full = false,
  tone = 'default',
  sign = 'auto',
  style,
  className,
}: Props) {
  const { text, color } = resolveAmount(value, { tone, sign, full })
  return (
    <span
      className={className}
      style={{
        color,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </span>
  )
}
