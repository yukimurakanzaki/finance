import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The rest of the app (budget, accounts, assets, etc.) doesn't depend on
// Supabase at all, so a missing config must not crash app startup — only
// the AI Manager tab should degrade. Callers check this before using
// `supabase` for anything that would otherwise fail with a confusing error.
export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
)
