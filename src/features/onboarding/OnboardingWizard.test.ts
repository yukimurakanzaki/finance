import { describe, expect, it } from 'vitest'
import { resolveWizardStep } from './OnboardingWizard'

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
