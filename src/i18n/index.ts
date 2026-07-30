import { create } from 'zustand'
import { settingsRepo } from '@db/repositories/settings.repo'
import type { Language, Translations } from './types'
import { en } from './en'
import { id } from './id'

const translations: Record<Language, Translations> = { en, id }

interface I18nState {
  language: Language
  t: Translations
  setLanguage: (lang: Language) => Promise<void>
  init: () => Promise<void>
}

export const useI18n = create<I18nState>((set) => ({
  language: 'en',
  t: en,
  
  init: async () => {
    const saved = await settingsRepo.get('language')
    const lang = (saved === 'id' ? 'id' : 'en') as Language
    set({ language: lang, t: translations[lang] })
  },
  
  setLanguage: async (lang: Language) => {
    await settingsRepo.set('language', lang)
    set({ language: lang, t: translations[lang] })
  },
}))

// Re-export types for convenience
export type { Language, Translations }
