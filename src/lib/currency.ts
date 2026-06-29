// Canonical IDR display: "Rp 58.000" (dot separators, no decimal)
// Millions: "Rp 2,5M" · Billions: "Rp 4,42B"

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
    return `${sign}Rp ${b % 1 === 0 ? b : b.toFixed(2).replace('.', ',')}B`
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    return `${sign}Rp ${m % 1 === 0 ? m : m.toFixed(1).replace('.', ',')}M`
  }
  return `${sign}Rp ${dotSep(abs)}`
}

export function formatRpFull(value: number): string {
  const sign = value < 0 ? '−' : ''
  return `${sign}Rp ${dotSep(Math.abs(value))}`
}

// Parses "25000", "25.000", "25,000" → 25000. Returns null for invalid input.
export function parseRpInput(raw: string): number | null {
  const cleaned = raw.replace(/[.,]/g, '').trim()
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
