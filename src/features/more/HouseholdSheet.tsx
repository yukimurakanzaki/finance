import { Btn } from '@components/FormField'
import { Badge, Row, SectionHeader } from '@components/ui'
import { supabase } from '@lib/supabaseClient'
import { useAuthStore } from '@stores/authStore'
import { useEffect, useState } from 'react'

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
      const nameById = new Map(
        (ps ?? []).map((p) => [
          p.id as string,
          p.display_name as string | null,
        ]),
      )
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
    const { data, error: err } = await supabase.rpc('create_invite', {
      p_household: householdId,
    })
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        padding: 'var(--space-1) 2px',
      }}
    >
      <div>
        <SectionHeader>Members</SectionHeader>
        {members === null && !error && (
          <div
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            Loading…
          </div>
        )}
        <div style={{ marginTop: 'var(--space-2)' }}>
          {members?.map((m) => (
            <Row
              key={m.user_id}
              primary={`${m.display_name ?? 'Member'}${m.user_id === user?.id ? ' (you)' : ''}`}
              caption={
                <Badge tone={m.role === 'admin' ? 'warning' : 'default'}>
                  {m.role}
                </Badge>
              }
              right={
                isAdmin && m.user_id !== user?.id && m.role !== 'admin' ? (
                  <button
                    type="button"
                    onClick={() => transferAdmin(m.user_id)}
                    disabled={busy}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-2)',
                      borderRadius: 8,
                      color: 'var(--ink-2)',
                      fontSize: 'var(--text-caption)',
                      padding: 'var(--space-2) var(--space-2)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    Make admin
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      {isAdmin && (
        <div>
          <SectionHeader>Invite a member</SectionHeader>
          {inviteCode ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-1)',
                border: '1px solid var(--amber)',
                borderRadius: 10,
                padding: 'var(--space-3) var(--space-4)',
                marginTop: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-title)',
                  letterSpacing: '3px',
                  color: 'var(--ink-1)',
                }}
              >
                {inviteCode}
              </span>
              <Btn
                variant="secondary"
                onClick={copyCode}
                style={{ padding: 'var(--space-2) var(--space-4)' }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Btn>
            </div>
          ) : (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Btn fullWidth disabled={busy} onClick={generateInvite}>
                {busy ? 'Generating…' : 'Generate invite code'}
              </Btn>
            </div>
          )}
          <div
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-2)',
              lineHeight: 1.5,
            }}
          >
            Codes expire after 7 days and admit one member. Your partner enters
            it after signing up, via "Join a household".
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--amber-text)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
