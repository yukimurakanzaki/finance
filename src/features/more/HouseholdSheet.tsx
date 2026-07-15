import { useEffect, useState } from 'react'
import { supabase } from '@lib/supabaseClient'
import { useAuthStore } from '@stores/authStore'
import { Btn } from '@components/FormField'

interface Member {
  user_id: string
  role: 'admin' | 'member'
  display_name: string | null
}

// Members, invite codes, and admin transfer for the current household.
export function HouseholdSheet() {
  const { householdId, user } = useAuthStore()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const me = members?.find((m) => m.user_id === user?.id)
  const isAdmin = me?.role === 'admin'

  useEffect(() => {
    if (!householdId) return
    ;(async () => {
      // No FK between memberships.user_id and profiles.id (both reference
      // auth.users), so PostgREST can't embed — fetch the two separately.
      const { data: ms, error: mErr } = await supabase
        .from('memberships')
        .select('user_id, role')
        .eq('household_id', householdId)
      if (mErr) {
        setError(mErr.message)
        return
      }
      const ids = (ms ?? []).map((m) => m.user_id as string)
      const { data: ps } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ids)
      const nameById = new Map((ps ?? []).map((p) => [p.id as string, p.display_name as string | null]))
      setMembers(
        (ms ?? []).map((m) => ({
          user_id: m.user_id as string,
          role: m.role as Member['role'],
          display_name: nameById.get(m.user_id as string) ?? null,
        })),
      )
    })()
  }, [householdId])

  async function generateInvite() {
    if (!householdId) return
    setBusy(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('create_invite', { p_household: householdId })
    setBusy(false)
    if (err) setError(err.message)
    else setInviteCode(data as string)
  }

  async function copyCode() {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function transferAdmin(toUser: string) {
    if (!householdId) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('transfer_admin', {
      p_household: householdId,
      p_to_user: toUser,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setMembers(
      (ms) =>
        ms?.map((m) => ({
          ...m,
          role: m.user_id === toUser ? ('admin' as const) : ('member' as const),
        })) ?? null,
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingInline: 'var(--space-1)' }}>
      <div>
        <div style={{ fontSize: 'var(--text-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
          Members
        </div>
        {members === null && !error && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>Loading…</div>
        )}
        {members?.map((m) => (
          <div
            key={m.user_id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBlock: 'var(--space-2)', paddingInline: 'var(--space-3)', background: 'var(--bg-1)', border: '1px solid var(--border-1)',
              borderRadius: 'var(--space-2)', marginBottom: 'var(--space-2)',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-section)', color: 'var(--ink-1)' }}>
                {m.display_name ?? 'Member'}
                {m.user_id === user?.id ? ' (you)' : ''}
              </div>
              <div style={{ fontSize: 'var(--text-caption)', color: m.role === 'admin' ? 'var(--amber-text)' : 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                {m.role}
              </div>
            </div>
            {isAdmin && m.user_id !== user?.id && m.role !== 'admin' && (
              <button
                onClick={() => transferAdmin(m.user_id)}
                disabled={busy}
                aria-label={`Make ${m.display_name ?? 'member'} admin`}
                style={{
                  background: 'none', border: '1px solid var(--border-2)', borderRadius: 'var(--space-2)',
                  color: 'var(--ink-2)', fontSize: 'var(--text-caption)', paddingBlock: 'var(--space-1)', paddingInline: 'var(--space-2)', cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Make admin
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div>
          <div style={{ fontSize: 'var(--text-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
            Invite a member
          </div>
          {inviteCode ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-1)', border: '1px solid var(--amber)', borderRadius: 'var(--space-2)',
              paddingBlock: 'var(--space-3)', paddingInline: 'var(--space-3)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-title)', letterSpacing: '3px', color: 'var(--ink-1)' }}>
                {inviteCode}
              </span>
              <Btn variant="secondary" onClick={copyCode} style={{ paddingBlock: 'var(--space-2)', paddingInline: 'var(--space-3)' }}>
                {copied ? 'Copied' : 'Copy'}
              </Btn>
            </div>
          ) : (
            <Btn fullWidth disabled={busy} onClick={generateInvite}>
              {busy ? 'Generating…' : 'Generate invite code'}
            </Btn>
          )}
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
            Codes expire after 7 days and admit one member. Your partner enters it after signing
            up, via "Join a household".
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--amber-text)' }}>{error}</div>}
    </div>
  )
}
