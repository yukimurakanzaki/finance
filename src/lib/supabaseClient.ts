import { createClient } from '@supabase/supabase-js'

// Public project defaults. The anon/publishable key is designed to be shipped in
// the client bundle — row-level security is what protects the data — so falling
// back to the real values keeps prod working even if the Vercel build env is
// missing VITE_SUPABASE_ANON_KEY. Override via env vars for other environments.
const DEFAULT_URL = 'https://lanvhaliejwuazqerbvp.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_9dbcLpGW9HaB7Ggl4gk9yA_V2YfHcFI'

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY

// Always configured now that we have working defaults.
export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url, anonKey)
