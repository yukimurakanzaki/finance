import { useState } from 'react'
import { useAuthStore } from '@stores/authStore'
import { Field, Input, Btn } from '@components/FormField'

// Rendered when status is 'signed_out' (auth form) or 'no_household' (household setup).
export function AuthScreen() {
  const { status } = useAuthStore()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-0)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 20px',
        paddingTop: 'calc(24px + env(safe-area-inset-top))',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
        {status === 'no_household' ? <HouseholdSetup /> : <SignInUp />}
      </div>
    </div>
  )
}

function SignInUp() {
  const { signIn, signUp, error, notice } = useAuthStore()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    if (mode === 'in') await signIn(email.trim(), password)
    else await signUp(email.trim(), password, displayName.trim() || undefined)
    setBusy(false)
  }

  const canSubmit = email.includes('@') && password.length >= 6 && !busy

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.4px', margin: 0 }}>
          FI Dashboard
        </h1>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
          {mode === 'in' ? 'Sign in to your household.' : 'Create an account to get started.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mode === 'up' && (
          <Field label="Display name (optional)">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Yuki" />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </Field>

        {error && <div role="alert" style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
        {notice && <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{notice}</div>}

        <Btn fullWidth disabled={!canSubmit} onClick={submit}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </Btn>

        <button
          type="button"
          onClick={() => setMode((m) => (m === 'in' ? 'up' : 'in'))}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            padding: 8,
          }}
        >
          {mode === 'in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </>
  )
}

function HouseholdSetup() {
  const { createHousehold, joinHousehold, signOut, error, user } = useAuthStore()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    if (mode === 'create') await createHousehold(name.trim() || 'My Household')
    else await joinHousehold(code)
    setBusy(false)
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: '-.4px', margin: 0 }}>
          {mode === 'create' ? 'Name your household' : 'Join a household'}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
          {mode === 'create'
            ? `Signed in as ${user?.email}. Your household is the shared financial picture you and your partner will use. You can invite members later.`
            : `Signed in as ${user?.email}. Enter the invite code your household admin shared with you.`}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mode === 'create' ? (
          <Field label="Household name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kanzaki Household" />
          </Field>
        ) : (
          <Field label="Invite code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 3F9A21BC"
              autoComplete="off"
              style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
            />
          </Field>
        )}
        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--amber-text)' }}>{error}</div>}
        <Btn fullWidth disabled={busy || (mode === 'join' && code.trim().length < 6)} onClick={submit}>
          {busy ? 'Working…' : mode === 'create' ? 'Create household' : 'Join household'}
        </Btn>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'create' ? 'join' : 'create'))}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            padding: 8,
          }}
        >
          {mode === 'create' ? 'Have an invite code? Join a household' : 'Start fresh? Create a household'}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            padding: 8,
          }}
        >
          Sign out
        </button>
      </div>
    </>
  )
}
