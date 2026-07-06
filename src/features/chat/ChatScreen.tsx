import { useState, useEffect, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useChatStore, type ApiMessage } from '@stores/chatStore'
import { supabase, supabaseConfigured } from '@lib/supabaseClient'
import { describeWrite } from '../../ai/tools'
import { Btn, Input } from '@components/FormField'
import { SessionList } from './SessionList'
import { ModelPicker } from './ModelPicker'
import { SkillPicker } from './SkillPicker'
import { ContextWindowIndicator } from './ContextWindowIndicator'

const SUGGESTIONS = [
  'Where am I at this month?',
  'How is my savings rate?',
  'Can I afford a 5jt trip next month?',
  'I spent 150rb on lunch today',
]

const TOOL_LABELS: Record<string, string> = {
  create_account: 'Creating account',
  query_transactions: 'Checked your transactions',
  log_transactions: 'Logging transactions',
  log_income: 'Logging income',
  add_recurring_item: 'Adding recurring item',
  update_asset_value: 'Updating asset value',
  update_account_balance: 'Updating balance',
  save_memory: 'Saving to memory',
  delete_memory: 'Removing from memory',
  create_skill: 'Creating skill',
}

export function ChatScreen() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) {
    return (
      <div style={{ padding: '32px 20px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        The AI Manager isn't configured on this deployment yet (missing Supabase environment
        variables). The rest of the app works normally.
      </div>
    )
  }
  if (session === undefined) return <div style={{ height: '100%' }} />
  if (!session) return <SignIn />
  return <Conversation />
}

// ---------- Household sign-in ----------

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    if (!email.trim() || !password) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message)
  }

  return (
    <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-1)' }}>
        Meet your finance manager
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        Chat with an AI partner that knows your accounts, budget, and FI plan. Log spending by
        typing or pasting a bank statement screenshot, ask where you stand, or whether you can
        afford that trip.
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        Sign in with your household account — the same one you and your partner both use. No API
        key to manage; the app talks to Claude through a shared backend.
      </div>
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn() }}
      />
      {error && (
        <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>
      )}
      <Btn onClick={handleSignIn} disabled={!email.trim() || !password || busy} fullWidth>
        Sign in
      </Btn>
    </div>
  )
}

// ---------- Conversation ----------

function Conversation() {
  const {
    hydrated, messages, status, error, pendingWrites,
    hydrate, sendMessage, resolvePending, clearChat,
    sessions, activeSessionId, setSessionModel, setSessionSkills,
  } = useChatStore()
  const [input, setInput] = useState('')
  const [images, setImages] = useState<{ media_type: string; data: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showSessions, setShowSessions] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [showSkills, setShowSkills] = useState(false)

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null
  const currentModel = activeSession?.model || 'gemini-2.5-flash'
  const currentSkills = activeSession?.skills || []

  useEffect(() => { hydrate() }, [hydrate])
  // Auto-scroll on new content
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, error])

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg && images.length === 0) return
    setInput('')
    const imgs = images
    setImages([])
    await sendMessage(msg, imgs.length > 0 ? imgs : undefined)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      for (const byte of bytes) binary += String.fromCharCode(byte)
      setImages((prev) => [...prev, { media_type: file.type, data: btoa(binary) }])
    }
    e.target.value = ''
  }

  const busy = status !== 'idle'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Session/Model top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)',
      }}>
        <button
          onClick={() => setShowSessions(true)}
          style={{
            background: 'var(--bg-3)', border: 'none', borderRadius: 8,
            width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-2)', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ☰
        </button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeSession?.title || 'New chat'}
          </div>
        </div>
        <button
          onClick={() => setShowModel(true)}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--border-2)',
            borderRadius: 8, padding: '4px 8px', fontSize: 10, fontWeight: 600,
            color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}
        >
          {currentModel.split('-').slice(0, 2).join('-')}
        </button>
        <button
          onClick={() => setShowSkills(true)}
          style={{
            background: currentSkills.length > 0 ? 'var(--amber-bg)' : 'var(--bg-2)',
            border: `1px solid ${currentSkills.length > 0 ? 'var(--amber)' : 'var(--border-2)'}`,
            borderRadius: 8, padding: '4px 8px', fontSize: 10, fontWeight: 600,
            color: currentSkills.length > 0 ? 'var(--amber-text)' : 'var(--ink-3)', cursor: 'pointer',
          }}
        >
          ⚡{currentSkills.length > 0 ? ` ${currentSkills.length}` : ''}
        </button>
      </div>
      <ContextWindowIndicator />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hydrated && messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.6 }}>
              Ask anything about your money, or log spending by typing or pasting a statement screenshot.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  style={{
                    background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 16,
                    padding: '8px 14px', fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}

        {status === 'thinking' && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--ink-3)', fontSize: 12, padding: '8px 12px' }}>
            Thinking…
          </div>
        )}

        {status === 'awaiting_confirm' && pendingWrites.length > 0 && (
          <ConfirmCard
            writes={pendingWrites}
            onConfirm={() => resolvePending(true)}
            onCancel={() => resolvePending(false)}
          />
        )}

        {error && (
          <div style={{
            alignSelf: 'stretch', background: 'rgba(239,68,68,.08)', border: '1px solid #7f1d1d',
            borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#ef4444',
          }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attached image previews */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 14px' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={`data:${img.media_type};base64,${img.data}`}
                alt="attachment"
                style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-2)' }}
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9,
                  background: 'var(--bg-3)', border: '1px solid var(--border-2)', color: 'var(--ink-2)',
                  fontSize: 10, cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-1)',
        background: 'var(--bg-1)', alignItems: 'flex-end',
      }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Attach statement screenshot"
          style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--bg-2)',
            border: '1px solid var(--border-2)', color: 'var(--ink-2)', fontSize: 16,
            cursor: busy ? 'default' : 'pointer', flexShrink: 0, opacity: busy ? .5 : 1,
          }}
        >
          📎
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Message your finance manager…"
          rows={1}
          disabled={busy}
          style={{
            flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10,
            color: 'var(--ink-1)', padding: '10px 12px', fontSize: 14, outline: 'none', resize: 'none',
            fontFamily: 'var(--font-ui)', maxHeight: 100, opacity: busy ? .6 : 1,
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={busy || (!input.trim() && images.length === 0)}
          style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--amber)', border: 'none',
            color: '#000', fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            flexShrink: 0, opacity: busy || (!input.trim() && images.length === 0) ? .5 : 1,
          }}
        >
          ↑
        </button>
      </div>

      {/* Footer: clear chat */}
      {messages.length > 0 && (
        <button
          onClick={() => { if (window.confirm('Clear this conversation?')) clearChat() }}
          style={{
            background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 10,
            padding: '4px 0 8px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}
        >
          Clear conversation
        </button>
      )}

      {/* Pickers */}
      <SessionList open={showSessions} onClose={() => setShowSessions(false)} />
      <ModelPicker
        open={showModel}
        onClose={() => setShowModel(false)}
        currentModel={currentModel}
        onSelect={async (model) => {
          if (activeSessionId) await setSessionModel(activeSessionId, model)
        }}
      />
      <SkillPicker
        open={showSkills}
        onClose={() => setShowSkills(false)}
        activeSessionId={activeSessionId}
        currentSkills={currentSkills}
        onToggleSkill={async (skillId) => {
          const next = currentSkills.includes(skillId)
            ? currentSkills.filter((s) => s !== skillId)
            : [...currentSkills, skillId]
          if (activeSessionId) await setSessionSkills(activeSessionId, next)
        }}
      />
    </div>
  )
}

// ---------- Message rendering ----------

function MessageBubble({ msg }: { msg: ApiMessage }) {
  if (msg.role === 'user') {
    // tool_result carrier messages are internal — render nothing visible
    if (Array.isArray(msg.content) && msg.content.every((b) => b.type === 'tool_result')) return null

    const texts: string[] = []
    const imgs: string[] = []
    if (typeof msg.content === 'string') {
      texts.push(msg.content)
    } else {
      for (const b of msg.content) {
        if (b.type === 'text') texts.push(b.text)
        if (b.type === 'image' && b.source.type === 'base64') {
          imgs.push(`data:${b.source.media_type};base64,${b.source.data}`)
        }
      }
    }
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {imgs.map((src, i) => (
          <img key={i} src={src} alt="attachment" style={{ maxWidth: 180, borderRadius: 10, border: '1px solid var(--border-2)' }} />
        ))}
        {texts.filter(Boolean).map((t, i) => (
          <div key={i} style={{
            background: 'var(--amber)', color: '#000', borderRadius: '14px 14px 4px 14px',
            padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            {t}
          </div>
        ))}
      </div>
    )
  }

  // Assistant
  const blocks = Array.isArray(msg.content) ? msg.content : [{ type: 'text' as const, text: String(msg.content) }]
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'text' && b.text.trim()) {
          return (
            <div key={i} style={{
              alignSelf: 'flex-start', maxWidth: '88%', background: 'var(--bg-2)',
              border: '1px solid var(--border-1)', borderRadius: '14px 14px 14px 4px',
              padding: '10px 13px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-1)',
              whiteSpace: 'pre-wrap',
            }}>
              {b.text}
            </div>
          )
        }
        if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const label = b.type === 'server_tool_use'
            ? 'Searching the web'
            : (TOOL_LABELS[b.name] ?? b.name)
          return (
            <div key={i} style={{
              alignSelf: 'flex-start', fontSize: 11, color: 'var(--ink-3)',
              padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 10 }}>{b.type === 'server_tool_use' ? '🔍' : '⚙'}</span>
              {label}
            </div>
          )
        }
        return null // thinking / web_search_tool_result blocks etc.
      })}
    </>
  )
}

// ---------- Confirmation card ----------

function ConfirmCard({
  writes, onConfirm, onCancel,
}: {
  writes: { name: string; input: Record<string, unknown> }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const lines = writes.flatMap((w) => describeWrite(w.name, w.input))
  return (
    <div style={{
      alignSelf: 'stretch', background: 'var(--bg-1)', border: '1px solid var(--amber)',
      borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber-text)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        Confirm changes ({lines.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 12.5, color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="secondary" style={{ flex: 1, padding: '10px 0' }} onClick={onCancel}>
          Cancel
        </Btn>
        <Btn style={{ flex: 2, padding: '10px 0' }} onClick={onConfirm}>
          Confirm & save
        </Btn>
      </div>
    </div>
  )
}
