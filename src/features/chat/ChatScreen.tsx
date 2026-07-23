import { Btn, Input } from '@components/FormField'
import { Card, Screen } from '@components/ui'
import { supabase, supabaseConfigured } from '@lib/supabaseClient'
import { type ApiMessage, useChatStore } from '@stores/chatStore'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MODEL, getModelLabel } from '../../ai/models'
import { describeWrite } from '../../ai/tools'
import { ContextWindowIndicator } from './ContextWindowIndicator'
import { ModelPicker } from './ModelPicker'
import { SessionList } from './SessionList'
import { SkillPicker } from './SkillPicker'
import { Markdown } from './markdown'

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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) {
    return (
      <Screen>
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--ink-2)',
            lineHeight: 1.6,
          }}
        >
          The AI Manager isn't configured on this deployment yet (missing
          Supabase environment variables). The rest of the app works normally.
        </div>
      </Screen>
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
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (err) setError(err.message)
  }

  return (
    <Screen>
      <div
        style={{
          fontSize: 'var(--text-title)',
          fontWeight: 700,
          color: 'var(--ink-1)',
        }}
      >
        Meet your finance manager
      </div>
      <div
        style={{
          fontSize: 'var(--text-body)',
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        Chat with an AI partner that knows your accounts, budget, and FI plan.
        Log spending by typing or pasting a bank statement screenshot, ask where
        you stand, or whether you can afford that trip.
      </div>
      <div
        style={{
          fontSize: 'var(--text-body)',
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        Sign in with your household account — the same one you and your partner
        both use. No API key to manage; the app talks to Claude through a shared
        backend.
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSignIn()
        }}
      />
      {error && (
        <div style={{ fontSize: 'var(--text-caption)', color: '#ef4444' }}>
          {error}
        </div>
      )}
      <Btn
        onClick={handleSignIn}
        disabled={!email.trim() || !password || busy}
        fullWidth
      >
        Sign in
      </Btn>
    </Screen>
  )
}

// ---------- Conversation ----------
//
// NOT wrapped in <Screen>: chat manages its own scroll region (a sticky
// header, a flex-1 scrolling message list, and a sticky input bar pinned to
// the bottom). <Screen> adds a uniform 16px gutter + vertical gap around
// every child, which would inset the header/input bar off the screen edges
// and break the sticky-bottom input layout (B5 ticket: "respect that, don't
// force <Screen> where it breaks the message-list layout"). The individual
// pieces below (session rows, model/skill pickers) use the primitives; this
// outer shell and the message-bubble/input-bar visual language stay
// hand-styled — see the per-section notes.
function Conversation() {
  const {
    hydrated,
    messages,
    status,
    error,
    pendingWrites,
    hydrate,
    sendMessage,
    resolvePending,
    clearSession,
    sessions,
    activeSessionId,
    setSessionModel,
    setSessionSkills,
  } = useChatStore()
  const [input, setInput] = useState('')
  const [images, setImages] = useState<{ media_type: string; data: string }[]>(
    [],
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showSessions, setShowSessions] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [showSkills, setShowSkills] = useState(false)

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null
  // M2 fix: was a hardcoded literal ('claude-sonnet-4-20250514') duplicating
  // (and risking drifting from) ai/models.ts's list. DEFAULT_MODEL is now the
  // single source of truth both files read from.
  const currentModel = activeSession?.model || DEFAULT_MODEL
  const currentSkills = activeSession?.skills || []

  useEffect(() => {
    hydrate()
  }, [hydrate])
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

  const MAX_IMAGES = 4
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024
  const API_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ])
  const [fileNote, setFileNote] = useState<string | null>(null)

  // Shared by the paperclip file-input and the textarea paste handler so both
  // entry points validate and attach images identically.
  async function addImageFiles(files: File[]) {
    setFileNote(null)
    for (const file of files) {
      if (images.length >= MAX_IMAGES) {
        setFileNote(
          `Up to ${MAX_IMAGES} images per message — extra files were skipped.`,
        )
        break
      }
      if (!API_IMAGE_TYPES.has(file.type)) {
        setFileNote(
          `"${file.name}" isn't a supported format (JPEG/PNG/WebP/GIF). iPhone HEIC photos: screenshot the statement instead, or change camera format to "Most Compatible".`,
        )
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFileNote(
          `"${file.name}" is over 5MB — try a screenshot or a smaller image.`,
        )
        continue
      }
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      for (const byte of bytes) binary += String.fromCharCode(byte)
      setImages((prev) => [
        ...prev,
        { media_type: file.type, data: btoa(binary) },
      ])
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    await addImageFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  // Statement screenshots pasted straight into the composer (the primary import
  // path More → Log via AI Manager promotes). A paste that carries image files
  // is consumed here; a plain-text paste is left untouched so typing is normal.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (files.length === 0) return
    e.preventDefault()
    void addImageFiles(files)
  }

  const busy = status !== 'idle'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Session/Model top bar — kept hand-styled: a horizontal icon-button
          toolbar isn't a <Row> (no primary/caption line), and fixed 30px
          touch targets are unchanged deliberately (Part 1 is rendering-only,
          zero behavior change — bumping to 44px would be a layout change). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-1)',
        }}
      >
        <button
          onClick={() => setShowSessions(true)}
          aria-label="Open chat sessions"
          style={{
            background: 'var(--bg-3)',
            border: 'none',
            borderRadius: 8,
            width: 30,
            height: 30,
            cursor: 'pointer',
            color: 'var(--ink-2)',
            fontSize: 'var(--text-body)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ☰
        </button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: 'var(--text-section)',
              fontWeight: 600,
              color: 'var(--ink-1)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeSession?.title || 'New chat'}
          </div>
        </div>
        {/* M2 fix: shows the model's human label (e.g. "Sonnet"), not the raw
            model-ID string the id-splitting used to produce. */}
        <button
          onClick={() => setShowModel(true)}
          aria-label="Choose AI model"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 8,
            padding: 'var(--space-1) var(--space-2)',
            fontSize: 'var(--text-caption)',
            fontWeight: 600,
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {getModelLabel(currentModel, 'short')}
        </button>
        <button
          onClick={() => setShowSkills(true)}
          aria-label="Choose active skills"
          style={{
            background:
              currentSkills.length > 0 ? 'var(--amber-surface)' : 'var(--bg-2)',
            border: `1px solid ${currentSkills.length > 0 ? 'var(--amber)' : 'var(--border-2)'}`,
            borderRadius: 8,
            padding: 'var(--space-1) var(--space-2)',
            fontSize: 'var(--text-caption)',
            fontWeight: 600,
            color:
              currentSkills.length > 0 ? 'var(--amber-text)' : 'var(--ink-3)',
            cursor: 'pointer',
          }}
        >
          ⚡{currentSkills.length > 0 ? ` ${currentSkills.length}` : ''}
        </button>
      </div>
      <ContextWindowIndicator />

      {/* Messages — chat's own scroll region (flex:1 + overflowY:auto), left
          structurally alone per the ticket. Message-bubble shape (the
          asymmetric "speech tail" corner radii distinguishing user/assistant)
          is this screen's visual identity and isn't expressed by any current
          primitive, so it stays hand-styled too — introducing a new
          MessageBubble primitive is out of this ticket's scope. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-4) var(--space-4) var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {hydrated && messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-5)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--ink-2)',
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              Ask anything about your money, or log spending by typing or
              pasting a statement screenshot.
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                justifyContent: 'center',
                marginTop: 'var(--space-2)',
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 16,
                    padding: 'var(--space-2) var(--space-4)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}

        {status === 'thinking' && (
          <div
            aria-live="polite"
            style={{
              alignSelf: 'flex-start',
              color: 'var(--ink-3)',
              fontSize: 'var(--text-caption)',
              padding: 'var(--space-2) var(--space-3)',
            }}
          >
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
          <Card
            style={{
              alignSelf: 'stretch',
              background: 'rgba(239,68,68,.08)',
              border: '1px solid #7f1d1d',
              color: '#ef4444',
              fontSize: 'var(--text-caption)',
            }}
            padding="var(--space-3) var(--space-3)"
          >
            <div role="alert">{error}</div>
          </Card>
        )}
        <div ref={bottomRef} />
      </div>

      {/* File validation notice */}
      {fileNote && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-caption)',
            color: 'var(--amber-text)',
            lineHeight: 1.5,
          }}
        >
          {fileNote}
        </div>
      )}

      {/* Attached image previews */}
      {images.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={`data:${img.media_type};base64,${img.data}`}
                alt="attachment"
                style={{
                  width: 52,
                  height: 52,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                }}
              />
              <button
                onClick={() =>
                  setImages((prev) => prev.filter((_, j) => j !== i))
                }
                aria-label="Remove attachment"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border-2)',
                  color: 'var(--ink-2)',
                  fontSize: 'var(--text-caption)',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar — chat's own sticky footer, left structurally alone
          (fixed 38px touch targets on attach/send are unchanged for the same
          zero-behavior-change reason as the top bar above). */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderTop: '1px solid var(--border-1)',
          background: 'var(--bg-1)',
          alignItems: 'flex-end',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Attach statement screenshot"
          aria-label="Attach statement screenshot"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            color: 'var(--ink-2)',
            fontSize: 'var(--text-title)',
            cursor: busy ? 'default' : 'pointer',
            flexShrink: 0,
            opacity: busy ? 0.5 : 1,
          }}
        >
          📎
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message your finance manager…"
          rows={1}
          disabled={busy}
          style={{
            flex: 1,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            color: 'var(--ink-1)',
            padding: 'var(--space-3) var(--space-3)',
            fontSize: 'var(--text-body)',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-ui)',
            maxHeight: 100,
            opacity: busy ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={busy || (!input.trim() && images.length === 0)}
          aria-label="Send message"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'var(--amber)',
            border: 'none',
            color: 'var(--on-accent)',
            fontSize: 'var(--text-body)',
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            flexShrink: 0,
            opacity: busy || (!input.trim() && images.length === 0) ? 0.5 : 1,
          }}
        >
          ↑
        </button>
      </div>

      {/* Footer: clear chat */}
      {messages.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm('Clear this conversation?')) clearSession()
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: 'var(--text-caption)',
            padding: 'var(--space-1) 0 var(--space-2)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            textTransform: 'uppercase',
            letterSpacing: '.5px',
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
    if (
      Array.isArray(msg.content) &&
      msg.content.every((b) => b.type === 'tool_result')
    )
      return null

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
      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '82%',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'flex-end',
        }}
      >
        {imgs.map((src, i) => (
          <img
            key={i}
            src={src}
            alt="attachment"
            style={{
              maxWidth: 180,
              borderRadius: 10,
              border: '1px solid var(--border-2)',
            }}
          />
        ))}
        {texts.filter(Boolean).map((t, i) => (
          <div
            key={i}
            style={{
              background: 'var(--amber)',
              color: 'var(--on-accent)',
              borderRadius: '14px 14px 4px 14px',
              padding: '9px 13px',
              fontSize: 'var(--text-body)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    )
  }

  // Assistant
  const blocks = Array.isArray(msg.content)
    ? msg.content
    : [{ type: 'text' as const, text: String(msg.content) }]
  return (
    <>
      {blocks.map((b, i) => {
        // M1 fix: was `whiteSpace: 'pre-wrap'` over the raw string (so
        // "**bold**" showed literal asterisks) — now parsed through the
        // hand-rolled <Markdown> renderer (src/features/chat/markdown.tsx).
        // The bubble container's shape/color stays hand-styled (see the
        // Conversation-level note on message bubbles); only the text content
        // inside it is now markdown-aware.
        if (b.type === 'text' && b.text.trim()) {
          return (
            <div
              key={i}
              style={{
                alignSelf: 'flex-start',
                maxWidth: '88%',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-1)',
                borderRadius: '14px 14px 14px 4px',
                padding: '10px 13px',
                fontSize: 'var(--text-body)',
                lineHeight: 1.55,
                color: 'var(--ink-1)',
              }}
            >
              <Markdown text={b.text} />
            </div>
          )
        }
        if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const label =
            b.type === 'server_tool_use'
              ? 'Searching the web'
              : (TOOL_LABELS[b.name] ?? b.name)
          return (
            <div
              key={i}
              style={{
                alignSelf: 'flex-start',
                fontSize: 'var(--text-caption)',
                color: 'var(--ink-3)',
                padding: 'var(--space-1) var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 'var(--text-caption)' }}>
                {b.type === 'server_tool_use' ? '🔍' : '⚙'}
              </span>
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
  writes,
  onConfirm,
  onCancel,
}: {
  writes: { name: string; input: Record<string, unknown> }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const lines = writes.flatMap((w) => describeWrite(w.name, w.input))
  return (
    <Card style={{ alignSelf: 'stretch', border: '1px solid var(--amber)' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-caption)',
            fontWeight: 700,
            color: 'var(--amber-text)',
            textTransform: 'uppercase',
            letterSpacing: '.5px',
          }}
        >
          Confirm changes ({lines.length})
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {lines.map((l, i) => (
            <div
              key={i}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--ink-1)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.4,
              }}
            >
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Btn
            variant="secondary"
            style={{ flex: 1, padding: 'var(--space-3) 0' }}
            onClick={onCancel}
          >
            Cancel
          </Btn>
          <Btn
            style={{ flex: 2, padding: 'var(--space-3) 0' }}
            onClick={onConfirm}
          >
            Confirm & save
          </Btn>
        </div>
      </div>
    </Card>
  )
}
