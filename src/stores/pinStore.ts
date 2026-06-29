import { create } from 'zustand'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5 min

interface PinState {
  isLocked: boolean
  attemptCount: number
  lockoutUntil: number | null
  biometricEnrolled: boolean

  unlock: () => void
  lock: () => void
  recordFailedAttempt: () => void
  resetAttempts: () => void
  enrollBiometric: () => void
}

export const usePinStore = create<PinState>((set, get) => ({
  isLocked: true,
  attemptCount: 0,
  lockoutUntil: null,
  biometricEnrolled: false,

  unlock: () => set({ isLocked: false, attemptCount: 0, lockoutUntil: null }),

  lock: () => set({ isLocked: true }),

  recordFailedAttempt: () => {
    const next = get().attemptCount + 1
    const lockout = next >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null
    set({ attemptCount: next, lockoutUntil: lockout })
  },

  resetAttempts: () => set({ attemptCount: 0, lockoutUntil: null }),

  enrollBiometric: () => set({ biometricEnrolled: true }),
}))
