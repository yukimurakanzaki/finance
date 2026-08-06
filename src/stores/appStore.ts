import { create } from 'zustand'

type Tab = 'today' | 'budget' | 'chat' | 'assets' | 'report' | 'more'
type BudgetHorizon = 'yearly' | 'monthly' | 'weekly'

interface AppState {
  activeTab: Tab
  budgetHorizon: BudgetHorizon
  showIOSBanner: boolean
  showGoldNudge: boolean
  // The onboarding jump target (T1a FR-1.3). There is no router: opening the
  // wizard means setting activeTab plus the step it should land on. null =
  // the wizard is not being requested. A persisted draft still wins over this
  // step inside the wizard (FR-1.3b) — this is a request, not a command.
  onboardingStep: number | null

  setTab: (t: Tab) => void
  setBudgetHorizon: (h: BudgetHorizon) => void
  dismissIOSBanner: () => void
  dismissGoldNudge: () => void
  openOnboarding: (step: number) => void
  closeOnboarding: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'today',
  budgetHorizon: 'weekly',
  showIOSBanner: false,
  showGoldNudge: false,
  onboardingStep: null,

  setTab: (activeTab) => set({ activeTab }),
  setBudgetHorizon: (budgetHorizon) => set({ budgetHorizon }),
  dismissIOSBanner: () => set({ showIOSBanner: false }),
  dismissGoldNudge: () => set({ showGoldNudge: false }),
  openOnboarding: (step) => set({ activeTab: 'more', onboardingStep: step }),
  closeOnboarding: () => set({ onboardingStep: null }),
}))
