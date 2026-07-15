import { formatRp, formatRpFull } from '@lib/currency'

export type AmountTone = 'default' | 'positive' | 'negative' | 'muted'

// Sign policy:
//   'auto'   — show '−' for negative values, nothing for positive/zero
//              (matches formatRpFull's own default and the calm "sign carries
//              direction" principle; a leading '+' is opt-in).
//   'always' — '+' for positive, '−' for negative, nothing for zero
//              (use for income rows that want an explicit '+').
//   'never'  — no leading sign glyph at all.
export type AmountSign = 'auto' | 'always' | 'never'

const TONE_COLOR: Record<AmountTone, string> = {
  default: 'var(--ink-1)',
  positive: 'var(--engine)',
  // Direction is carried by the '−' sign, not colour (Calm Ledger v2 §2 / D5),
  // so a negative amount keeps ink-1 rather than turning red.
  negative: 'var(--ink-1)',
  muted: 'var(--ink-3)',
}

// U+2212 MINUS SIGN — matches TodayScreen / TransactionHistory, not '-'.
const MINUS = '−'

function signGlyph(value: number, sign: AmountSign): string {
  if (sign === 'never') return ''
  if (value < 0) return MINUS
  if (sign === 'always' && value > 0) return '+'
  return ''
}

export interface ResolvedAmount {
  text: string
  color: string
}

// Pure formatting/tone resolution — extracted so it is unit-testable without a
// DOM. Formats the magnitude (abs value) via formatRp/formatRpFull, then
// prepends the sign glyph so the '−' is never doubled.
export function resolveAmount(
  value: number,
  {
    tone = 'default',
    sign = 'auto',
    full = false,
  }: {
    tone?: AmountTone
    sign?: AmountSign
    full?: boolean
  } = {},
): ResolvedAmount {
  const magnitude = full
    ? formatRpFull(Math.abs(value))
    : formatRp(Math.abs(value))
  return {
    text: `${signGlyph(value, sign)}${magnitude}`,
    color: TONE_COLOR[tone],
  }
}
