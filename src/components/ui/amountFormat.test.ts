import { describe, expect, it } from 'vitest'
import { resolveAmount } from './amountFormat'

const MINUS = '−' // U+2212 MINUS SIGN (not hyphen-minus)

describe('resolveAmount — sign logic', () => {
  it('auto (default): no glyph on positive, minus on negative, nothing on zero', () => {
    expect(resolveAmount(28_000).text).toBe('Rp 28.000')
    expect(resolveAmount(-58_000).text).toBe(`${MINUS}Rp 58.000`)
    expect(resolveAmount(0).text).toBe('Rp 0')
  })

  it('uses U+2212, never a hyphen-minus, for negatives', () => {
    expect(resolveAmount(-58_000).text.startsWith(MINUS)).toBe(true)
    expect(resolveAmount(-58_000).text.includes('-')).toBe(false)
  })

  it("sign='always': explicit + on positive, minus on negative, nothing on zero", () => {
    expect(resolveAmount(28_000, { sign: 'always' }).text).toBe('+Rp 28.000')
    expect(resolveAmount(-58_000, { sign: 'always' }).text).toBe(
      `${MINUS}Rp 58.000`,
    )
    expect(resolveAmount(0, { sign: 'always' }).text).toBe('Rp 0')
  })

  it("sign='never': strips the sign glyph even on negatives", () => {
    expect(resolveAmount(-58_000, { sign: 'never' }).text).toBe('Rp 58.000')
    expect(resolveAmount(28_000, { sign: 'never' }).text).toBe('Rp 28.000')
  })

  it('never double-signs a negative value', () => {
    // formatRpFull(-x) would itself prepend a minus; resolveAmount formats the
    // magnitude, so there is exactly one glyph.
    const { text } = resolveAmount(-58_000, { full: true })
    expect(text).toBe(`${MINUS}Rp 58.000`)
    expect(text.split(MINUS).length - 1).toBe(1)
  })
})

describe('resolveAmount — full toggles formatRp vs formatRpFull', () => {
  it('full=false abbreviates (jt/M)', () => {
    expect(resolveAmount(2_500_000).text).toBe('Rp 2,5jt')
    expect(resolveAmount(4_420_000_000).text).toBe('Rp 4,42M')
  })

  it('full=true uses the dot-grouped long form', () => {
    expect(resolveAmount(2_500_000, { full: true }).text).toBe('Rp 2.500.000')
    expect(resolveAmount(58_000, { full: true }).text).toBe('Rp 58.000')
  })
})

describe('resolveAmount — tone maps to colour', () => {
  it('default → ink-1, positive → engine, muted → ink-3', () => {
    expect(resolveAmount(1, { tone: 'default' }).color).toBe('var(--ink-1)')
    expect(resolveAmount(1, { tone: 'positive' }).color).toBe('var(--engine)')
    expect(resolveAmount(1, { tone: 'muted' }).color).toBe('var(--ink-3)')
  })

  it('negative tone keeps ink-1 — direction is carried by the sign, not colour', () => {
    expect(resolveAmount(-1, { tone: 'negative' }).color).toBe('var(--ink-1)')
  })
})
