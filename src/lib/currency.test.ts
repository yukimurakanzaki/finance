import { describe, expect, it } from 'vitest'
import { formatRp, parseRpInput } from './currency'

describe('formatRp (Indonesian abbreviations)', () => {
  it('millions use jt (juta)', () => {
    expect(formatRp(2_500_000)).toBe('Rp 2,5jt')
    expect(formatRp(1_000_000)).toBe('Rp 1jt')
    expect(formatRp(12_000_000)).toBe('Rp 12jt')
  })
  it('billions use M (miliar)', () => {
    expect(formatRp(4_420_000_000)).toBe('Rp 4,42M')
    expect(formatRp(1_000_000_000)).toBe('Rp 1M')
  })
  it('sub-million keeps dot-grouped full form', () => {
    expect(formatRp(58_000)).toBe('Rp 58.000')
    expect(formatRp(-58_000)).toBe('−Rp 58.000')
  })
})

describe('parseRpInput (strict, decimal-safe)', () => {
  it('accepts plain digit strings', () => {
    expect(parseRpInput('25000')).toBe(25_000)
    expect(parseRpInput(' 25000 ')).toBe(25_000)
  })
  it('accepts 3-digit group separators (consistent)', () => {
    expect(parseRpInput('25.000')).toBe(25_000)
    expect(parseRpInput('1,250,000')).toBe(1_250_000)
    expect(parseRpInput('1.234.567')).toBe(1_234_567)
  })
  it('rejects decimal-looking input rather than mis-parsing it', () => {
    expect(parseRpInput('12.5')).toBeNull()
    expect(parseRpInput('12,5')).toBeNull()
    expect(parseRpInput('1.2.3')).toBeNull()
  })
  it('rejects trailing 1–2 digit groups', () => {
    expect(parseRpInput('1.234.5')).toBeNull()
    expect(parseRpInput('1.234.56')).toBeNull()
  })
  it('rejects mixed separators', () => {
    expect(parseRpInput('12.345,678')).toBeNull()
  })
  it('rejects empty, zero, and non-numeric', () => {
    expect(parseRpInput('')).toBeNull()
    expect(parseRpInput('   ')).toBeNull()
    expect(parseRpInput('0')).toBeNull()
    expect(parseRpInput('abc')).toBeNull()
    expect(parseRpInput('12a')).toBeNull()
  })
})
