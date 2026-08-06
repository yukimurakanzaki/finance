import { useAppStore } from '@stores/appStore'
import { beforeEach, describe, expect, it } from 'vitest'

describe('appStore onboarding jump target (T1a FR-1.3, C-5)', () => {
  beforeEach(() => {
    useAppStore.setState({ activeTab: 'today', onboardingStep: null })
  })

  it('is closed by default', () => {
    expect(useAppStore.getState().onboardingStep).toBeNull()
  })

  it('opening sets both the tab and the requested step — no router involved', () => {
    useAppStore.getState().openOnboarding(3)
    expect(useAppStore.getState().activeTab).toBe('more')
    expect(useAppStore.getState().onboardingStep).toBe(3)
  })

  it('closing clears the request but leaves the tab where it landed', () => {
    useAppStore.getState().openOnboarding(2)
    useAppStore.getState().closeOnboarding()
    expect(useAppStore.getState().onboardingStep).toBeNull()
    expect(useAppStore.getState().activeTab).toBe('more')
  })
})
