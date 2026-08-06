import { describe, expect, it } from 'vitest'
import { resolveWizardMode, resolveWizardStep } from './OnboardingWizard'

describe('resolveWizardStep (T1a FR-1.3b)', () => {
  it('draft step wins over initialStep prop', () => {
    expect(resolveWizardStep(3, 2)).toBe(2)
  })

  it('draft step wins even when it is step 1', () => {
    expect(resolveWizardStep(4, 1)).toBe(1)
  })

  it('initialStep used when no draft', () => {
    expect(resolveWizardStep(3, null)).toBe(3)
    expect(resolveWizardStep(2, undefined)).toBe(2)
  })

  it('defaults to 1 when neither is provided', () => {
    expect(resolveWizardStep(undefined, null)).toBe(1)
    expect(resolveWizardStep(undefined, undefined)).toBe(1)
  })
})

describe('resolveWizardMode (T1a FR-1.3)', () => {
  it('a jump forces the detailed flow so the step body renders', () => {
    expect(resolveWizardMode(3, null)).toBe('full')
    expect(resolveWizardMode(1, undefined)).toBe('full')
  })

  it('no jump and no draft leaves the entry picker alone', () => {
    expect(resolveWizardMode(undefined, null)).toBe('choose')
  })

  it('a draft past the picker wins over the jump', () => {
    expect(resolveWizardMode(3, 'quick')).toBe('quick')
    expect(resolveWizardMode(3, 'full')).toBe('full')
  })

  it('a draft still on the picker holds no answers, so the jump wins', () => {
    expect(resolveWizardMode(3, 'choose')).toBe('full')
  })

  it('draft mode survives when there is no jump', () => {
    expect(resolveWizardMode(undefined, 'quick')).toBe('quick')
    expect(resolveWizardMode(undefined, 'choose')).toBe('choose')
  })
})
