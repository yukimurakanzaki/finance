// Canonical IDR display: "Rp 58.000" (dot separators, no decimal)
// Indonesian abbreviations: millions → "jt" (juta), billions → "M" (miliar).
// Millions: "Rp 2,5jt" · Billions: "Rp 4,42M"

function dotSep(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatRp(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000
    return `${sign}Rp ${b % 1 === 0 ? b : b.toFixed(2).replace('.', ',')}M`
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    return `${sign}Rp ${m % 1 === 0 ? m : m.toFixed(1).replace('.', ',')}jt`
  }
  return `${sign}Rp ${dotSep(abs)}`
}

export function formatRpFull(value: number): string {
  const sign = value < 0 ? '−' : ''
  return `${sign}Rp ${dotSep(Math.abs(value))}`
}

// Parses a user-typed rupiah amount to an integer, strictly.
// Accepts plain digit strings ("25000") and digit strings whose "." or ","
// appear ONLY as 3-digit group separators. The separator must be consistent
// and every group AFTER a separator exactly three digits; the leading group
// may be any width ("45000.000" is an unambiguous 45,000,000). Anything
// ambiguous — a decimal-looking "12.5", "1.2.3", or a trailing 1–2 digit
// group — returns null so forms surface their "Enter a valid amount" error
// instead of silently mis-parsing.
export function parseRpInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  // Plain digits, or grouped thousands with a single consistent separator.
  if (!/^\d+$/.test(s) && !/^\d+([.,])\d{3}(?:\1\d{3})*$/.test(s))
    return null
  const n = Number(s.replace(/[.,]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
