import { create } from 'zustand'
import type { ParseResult, ValidImportRow } from '../import/schema'
import { settingsRepo } from '@db/repositories/settings.repo'

type Step = 'idle' | 'entry' | 'parsing' | 'detecting' | 'confirm' | 'committing'

interface ReconcileState {
  isInProgress: boolean
  step: Step
  rawInput: string
  parseResult: ParseResult | null
  flaggedRows: ValidImportRow[]
  error: string | null

  start: () => void
  setRawInput: (raw: string) => void
  setParseResult: (r: ParseResult) => void
  setFlaggedRows: (rows: ValidImportRow[]) => void
  setStep: (s: Step) => void
  setError: (e: string) => void
  cancel: () => void
  complete: () => void
}

const IDLE: Pick<
  ReconcileState,
  'isInProgress' | 'step' | 'rawInput' | 'parseResult' | 'flaggedRows' | 'error'
> = {
  isInProgress: false,
  step: 'idle',
  rawInput: '',
  parseResult: null,
  flaggedRows: [],
  error: null,
}

export const useReconcileStore = create<ReconcileState>((set) => ({
  ...IDLE,

  start: () => {
    settingsRepo.set('reconcile_in_progress', 'true')
    set({ isInProgress: true, step: 'entry' })
  },

  setRawInput: (rawInput) => set({ rawInput }),

  setParseResult: (parseResult) => set({ parseResult }),

  setFlaggedRows: (flaggedRows) => set({ flaggedRows }),

  setStep: (step) => set({ step }),

  setError: (error) => set({ error }),

  cancel: () => {
    settingsRepo.set('reconcile_in_progress', 'false')
    set(IDLE)
  },

  complete: () => {
    settingsRepo.set('reconcile_in_progress', 'false')
    set(IDLE)
  },
}))
