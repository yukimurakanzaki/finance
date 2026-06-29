import { create } from 'zustand'

type Tab = 'home' | 'budget' | 'assets' | 'decide' | 'more'
type BudgetHorizon = 'yearly' | 'monthly' | 'weekly'

interface AppState {
  activeTab: Tab
  budgetHorizon: BudgetHorizon
  showIOSBanner: boolean
  showGoldNudge: boolean

  setTab: (t: Tab) => void
  setBudgetHorizon: (h: BudgetHorizon) => void
  dismissIOSBanner: () => void
  dismissGoldNudge: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'home',
  budgetHorizon: 'weekly',
  showIOSBanner: false,
  showGoldNudge: false,

  setTab: (activeTab) => set({ activeTab }),
  setBudgetHorizon: (budgetHorizon) => set({ budgetHorizon }),
  dismissIOSBanner: () => set({ showIOSBanner: false }),
  dismissGoldNudge: () => set({ showGoldNudge: false }),
}))
