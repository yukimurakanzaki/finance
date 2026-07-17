import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@lib/supabaseClient'
import { syncNow } from '@lib/sync'

// Auth + household lifecycle:
//   loading      → resolving session/household on boot
//   signed_out   → no session; show sign in / sign up
//   no_household → signed in but not in any household; show household setup
//   ready        → session + household resolved; render the app
export type AuthStatus = 'loading' | 'signed_out' | 'no_household' | 'ready'

interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  householdId: string | null
  error: string | null
  notice: string | null
  // True once the first cloud sync for this session has completed (or failed),
  // so local tables reflect the cloud before onboarding decides whether setup
  // is needed. Prevents re-onboarding (and duplicate account creation) on a
  // device whose local `setup_complete` flag never synced.
  synced: boolean

  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
  signOut: () => Promise<void>
  createHousehold: (name: string) => Promise<void>
  joinHousehold: (code: string) => Promise<void>
}

let subscribed = false

async function resolveHousehold(): Promise<{ householdId: string | null; status: AuthStatus }> {
  // auth_household_ids() returns the caller's household ids (RLS-safe helper)
  const { data, error } = await supabase.rpc('auth_household_ids')
  if (error) throw error
  const ids = (data as string[] | null) ?? []
  const first = ids[0]
  return first
    ? { householdId: first, status: 'ready' as AuthStatus }
    : { householdId: null, status: 'no_household' as AuthStatus }
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Cloud sync once a household is resolved. Marks `synced` once the first
  // sync of this session settles, so callers can wait for local tables to
  // reflect the cloud before making decisions (e.g. whether onboarding ran).
  function kickSync(householdId: string | null, user: User | null) {
    if (!householdId || !user) return
    syncNow(householdId, user.id)
      .catch((e) => console.error('sync', e))
      .finally(() => set({ synced: true }))
  }

  return {
    status: 'loading',
    session: null,
    user: null,
    householdId: null,
    error: null,
    notice: null,
    synced: false,

    init: async () => {
      if (!subscribed) {
        subscribed = true
        // Re-sync when the app returns to the foreground (second device catching up)
        // and on a slow heartbeat while open. syncNow() self-guards against overlap.
        const resync = () => {
          const { status, householdId, user } = get()
          if (status === 'ready' && document.visibilityState === 'visible') kickSync(householdId, user)
        }
        document.addEventListener('visibilitychange', resync)
        setInterval(resync, 5 * 60 * 1000)

        supabase.auth.onAuthStateChange((_event, session) => {
          // Keep session/user fresh; re-resolve household on sign-in/out.
          if (!session) {
            set({ status: 'signed_out', session: null, user: null, householdId: null })
            return
          }
          set({ session, user: session.user })
          resolveHousehold()
            .then(({ householdId, status }) => {
              set({ householdId, status })
              if (status === 'ready') kickSync(householdId, session.user)
            })
            .catch((e) => set({ error: String(e), status: 'no_household' }))
        })
      }

      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) {
        set({ status: 'signed_out', session: null, user: null })
        return
      }
      set({ session, user: session.user })
      try {
        const { householdId, status } = await resolveHousehold()
        set({ householdId, status })
        if (status === 'ready') kickSync(householdId, session.user)
      } catch (e) {
        set({ error: String(e), status: 'no_household' })
      }
    },

  signIn: async (email, password) => {
    set({ error: null, notice: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) set({ error: error.message })
    // onAuthStateChange resolves household on success.
  },

  signUp: async (email, password, displayName) => {
    set({ error: null, notice: null })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(displayName ? { options: { data: { display_name: displayName } } } : {}),
    })
    if (error) {
      set({ error: error.message })
      return
    }
    // If email confirmation is required, there is no session yet.
    if (!data.session) {
      set({ notice: 'Check your email to confirm your account, then sign in.' })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ status: 'signed_out', session: null, user: null, householdId: null })
  },

  createHousehold: async (name) => {
    set({ error: null })
    const { data, error } = await supabase.rpc('create_household', { p_name: name })
    if (error) {
      set({ error: error.message })
      return
    }
    const householdId = data as string
    set({ householdId, status: 'ready' })
    kickSync(householdId, get().user)
  },

  joinHousehold: async (code) => {
    set({ error: null })
    const { data, error } = await supabase.rpc('accept_invite', { p_code: code.trim().toUpperCase() })
    if (error) {
      set({ error: error.message })
      return
    }
    const householdId = data as string
    set({ householdId, status: 'ready' })
    kickSync(householdId, get().user)
  },
  }
})
