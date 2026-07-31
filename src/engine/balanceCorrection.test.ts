// D1 — planning a balance correction. Pure decision logic: given what the app
// derives, what the user says is true, and where the account's onboarding
// anchor sits, decide whether a correction can be written and what it looks
// like. No DB, no clock — the caller supplies `today`.
import { describe, expect, it } from 'vitest'
import { adjustmentAfterEdit, planCorrection } from './balanceCorrection'

const base = {
  derivedBalance: 690_000,
  actualBalance: 412_000,
  asOfDate: '2026-07-31',
  today: '2026-07-31',
  anchorDate: null,
  laterFlow: 0,
}

describe('planCorrection', () => {
  it('books an outgoing adjustment when the real balance is lower', () => {
    const plan = planCorrection(base)
    expect(plan).toMatchObject({
      ok: true,
      amount: 278_000,
      direction: 'out',
      delta: -278_000,
    })
  })

  it('books an incoming adjustment when the real balance is higher', () => {
    const plan = planCorrection({ ...base, actualBalance: 900_000 })
    expect(plan).toMatchObject({ ok: true, amount: 210_000, direction: 'in', delta: 210_000 })
  })

  it('writes nothing when the balance already matches', () => {
    expect(planCorrection({ ...base, actualBalance: 690_000 })).toEqual({
      ok: false,
      reason: 'no_change',
    })
  })

  it('allows a correction to zero', () => {
    // Zero is a real balance, distinct from "never set" — the O1 bug in a new place.
    expect(planCorrection({ ...base, actualBalance: 0 })).toMatchObject({
      ok: true,
      amount: 690_000,
      direction: 'out',
    })
  })

  it('allows a correction into a negative balance', () => {
    expect(planCorrection({ ...base, derivedBalance: 0, actualBalance: -50_000 })).toMatchObject({
      ok: true,
      amount: 50_000,
      direction: 'out',
    })
  })

  it('rejects a future as-of date', () => {
    expect(planCorrection({ ...base, asOfDate: '2026-08-01' })).toEqual({
      ok: false,
      reason: 'future_date',
    })
  })

  // The trap. deriveBalance replays only transactions dated strictly after
  // last_balance_updated_at, so an adjustment dated on or before the onboarding
  // anchor is silently discarded — the balance simply never moves, with no error.
  it('rejects an as-of date on the anchor day', () => {
    expect(planCorrection({ ...base, anchorDate: '2026-07-31' })).toEqual({
      ok: false,
      reason: 'before_anchor',
      anchorDate: '2026-07-31',
    })
  })

  it('rejects an as-of date before the anchor day', () => {
    expect(planCorrection({ ...base, asOfDate: '2026-07-10', anchorDate: '2026-07-12' })).toEqual({
      ok: false,
      reason: 'before_anchor',
      anchorDate: '2026-07-12',
    })
  })

  it('accepts an as-of date strictly after the anchor day', () => {
    expect(
      planCorrection({ ...base, asOfDate: '2026-07-13', anchorDate: '2026-07-12' }),
    ).toMatchObject({ ok: true })
  })

  it('accepts a past as-of date when the account has no anchor', () => {
    expect(planCorrection({ ...base, asOfDate: '2026-01-05' })).toMatchObject({ ok: true })
  })

  // A backdated correction does not land the account on the figure typed: every
  // transaction after that date still applies on top. Show where it actually ends up.
  it('projects the resulting balance through later transactions', () => {
    const plan = planCorrection({ ...base, asOfDate: '2026-07-20', laterFlow: -24_000 })
    expect(plan).toMatchObject({ ok: true, resultingBalance: 388_000 })
  })

  it('resulting balance equals the entered balance when nothing follows it', () => {
    expect(planCorrection(base)).toMatchObject({ resultingBalance: 412_000 })
  })
})

describe('adjustmentAfterEdit', () => {
  it('a correction that gains a category stops being one', () => {
    expect(adjustmentAfterEdit(true, 'cat-food')).toBe(false)
  })

  it('a correction edited without naming a category stays one', () => {
    expect(adjustmentAfterEdit(true, null)).toBe(true)
  })

  it('an ordinary transaction never becomes one', () => {
    expect(adjustmentAfterEdit(undefined, null)).toBe(false)
    expect(adjustmentAfterEdit(false, 'cat-food')).toBe(false)
  })
})
