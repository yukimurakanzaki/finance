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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 2px' }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
          Members
        </div>
        {members === null && !error && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Loading…</div>
        )}
        {members?.map((m) => (
          <div
            key={m.user_id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--border-1)',
              borderRadius: 10, marginBottom: 6,
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-1)' }}>
                {m.display_name ?? 'Member'}
                {m.user_id === user?.id ? ' (you)' : ''}
              </div>
              <div style={{ fontSize: 11, color: m.role === 'admin' ? 'var(--amber-text)' : 'var(--ink-3)', marginTop: 2 }}>
                {m.role}
              </div>
            </div>
            {isAdmin && m.user_id !== user?.id && m.role !== 'admin' && (
              <button
                onClick={() => transferAdmin(m.user_id)}
                disabled={busy}
                style={{
                  background: 'none', border: '1px solid var(--border-2)', borderRadius: 8,
                  color: 'var(--ink-2)', fontSize: 11, padding: '6px 10px', cursor: 'pointer',
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
          <div style={{ fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Invite a member
          </div>
          {inviteCode ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-1)', border: '1px solid var(--amber)', borderRadius: 10,
              padding: '12px 14px',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, letterSpacing: '3px', color: 'var(--ink-1)' }}>
                {inviteCode}
              </span>
              <Btn variant="secondary" onClick={copyCode} style={{ padding: '8px 14px' }}>
                {copied ? 'Copied' : 'Copy'}
              </Btn>
            </div>
          ) : (
            <Btn fullWidth disabled={busy} onClick={generateInvite}>
              {busy ? 'Generating…' : 'Generate invite code'}
            </Btn>
          )}
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
            Codes expire after 7 days and admit one member. Your partner enters it after signing
            up, via "Join a household".
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: 'var(--amber-text)' }}>{error}</div>}
    </div>
  )
}
