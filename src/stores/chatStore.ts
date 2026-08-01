import { create } from 'zustand'
import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@db/db'
import type { ChatSession, ChatMessage } from '@db/types'
import { supabase } from '@lib/supabaseClient'
import { buildSystemPrompt, PROMPT_VERSION } from '../ai/context'
import { TOOL_DEFINITIONS, WRITE_TOOLS, executeReadTool, executeWriteTool } from '../ai/tools'
import { DEFAULT_MODEL, getModelConfig } from '../ai/models'

const MAX_TOKENS = 8000
const HISTORY_LIMIT = 40 // messages sent to the API per turn
const DISCARDED_PENDING_NOTICE =
  "A change you were asked to confirm wasn't saved — the app closed before you responded."

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | Anthropic.ContentBlockParam[]
}

interface PendingWrite {
  tool_use_id: string
  name: string
  input: Record<string, unknown>
}

interface ChatState {
  hydrated: boolean

  // Session management
  sessions: ChatSession[]
  activeSessionId: string | null

  // Current session messages
  messages: ApiMessage[]
  status: 'idle' | 'thinking' | 'awaiting_confirm'
  error: string | null
  pendingWrites: PendingWrite[]
  pendingReadResults: Anthropic.ToolResultBlockParam[]

  // Audit B1: set when loading a session finds — and drops — a dangling
  // tool_use tail (app closed mid-turn), so the UI can tell the user
  // nothing was saved.
  discardedPendingNotice: string | null

  // Token tracking for current session
  sessionInputTokens: number
  sessionOutputTokens: number

  // Actions
  hydrate: () => Promise<void>
  loadSessions: () => Promise<void>
  createSession: (model?: string) => Promise<string>
  switchSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  archiveSession: (sessionId: string) => Promise<void>
  unarchiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  setSessionModel: (sessionId: string, model: string) => Promise<void>
  setSessionSkills: (sessionId: string, skills: string[]) => Promise<void>
  sendMessage: (text: string, images?: { media_type: string; data: string }[]) => Promise<void>
  resolvePending: (approve: boolean) => Promise<void>
  clearSession: () => Promise<void>
  stopTurn: () => void
  clearDiscardedNotice: () => void
}

const now = () => new Date().toISOString()

async function persistMessage(sessionId: string, msg: ApiMessage): Promise<string> {
  const id = crypto.randomUUID()
  await db.chatMessages.add({
    id,
    session_id: sessionId,
    role: msg.role,
    content: JSON.stringify(msg.content),
    input_tokens: null,
    output_tokens: null,
    created_at: now(),
    updated_at: now(),
  })
  return id
}

function isDanglingAssistant(msg: ApiMessage | undefined): boolean {
  return (
    msg !== undefined &&
    msg.role === 'assistant' &&
    Array.isArray(msg.content) &&
    msg.content.some((b) => b.type === 'tool_use')
  )
}

function isToolResultCarrier(msg: ApiMessage | undefined): boolean {
  return (
    msg !== undefined &&
    msg.role === 'user' &&
    Array.isArray(msg.content) &&
    msg.content.length > 0 &&
    msg.content.every((b) => b.type === 'tool_result')
  )
}

// Audit B1: load a session's messages, dropping any dangling tail left by
// the app closing mid-turn — an unresolved assistant tool_use, and every
// carrier message feeding it, since the model never saw a resolution and
// the exchange can't be resumed safely.
export async function loadSessionMessages(
  sessionId: string,
): Promise<{ messages: ApiMessage[]; droppedDangling: boolean }> {
  const rows = await db.chatMessages
    .where('session_id')
    .equals(sessionId)
    .sortBy('created_at')
  const messages: ApiMessage[] = rows.map((r) => ({
    role: r.role,
    content: JSON.parse(r.content),
  }))

  let droppedDangling = false
  while (messages.length > 0) {
    const last = messages[messages.length - 1]
    if (isDanglingAssistant(last)) {
      messages.pop()
      droppedDangling = true
      continue
    }
    if (droppedDangling && isToolResultCarrier(last)) {
      messages.pop()
      continue
    }
    break
  }
  return { messages, droppedDangling }
}

// Audit C3: replace image blocks in older history with a text marker so we
// don't keep re-sending (and re-billing for) every past attachment on
// every turn. Returns the same message references when nothing changes.
export function stripImagesFromHistory(messages: ApiMessage[]): ApiMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content) || !m.content.some((b) => b.type === 'image')) return m
    const content = [
      ...m.content.filter((b) => b.type !== 'image'),
      { type: 'text' as const, text: '[image stripped from older message]' },
    ]
    return { ...m, content }
  })
}

// Auto-generate title from first user message
function autoTitle(msg: ApiMessage): string {
  let text = ''
  if (typeof msg.content === 'string') {
    text = msg.content
  } else if (Array.isArray(msg.content)) {
    const tb = msg.content.find((b) => b.type === 'text')
    if (tb && 'text' in tb) text = tb.text
  }
  return text.slice(0, 60) || 'New chat'
}

function toolUseIdsOf(msg: ApiMessage): Set<string> | null {
  if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return null
  const ids = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map((b) => b.id)
  return ids.length > 0 ? new Set(ids) : null
}

function toolResultIdsOf(msg: ApiMessage): string[] | null {
  if (msg.role !== 'user' || !Array.isArray(msg.content)) return null
  if (msg.content.length === 0 || !msg.content.every((b) => b.type === 'tool_result')) return null
  return (msg.content as Anthropic.ToolResultBlockParam[]).map((b) => b.tool_use_id)
}

// A provider only accepts a user tool_result turn immediately after the
// assistant tool_use turn whose ids it answers — any other shape (a
// tool_result referencing an id the immediately preceding assistant message
// never introduced, or an assistant tool_use never followed by its results)
// gets rejected outright ("tool result's tool id ... not found"). That
// mismatch can end up locally persisted — e.g. an interrupted confirm flow,
// or two tabs on the same session interleaving writes — and once it's in a
// session's history, every future turn resends the same broken pair and
// fails identically, forever, until something drops it. Walk the full
// history and drop any assistant tool_use turn (and, if present, its
// following user turn) whose ids don't round-trip cleanly, so a corrupted
// session self-heals on the very next send instead of staying wedged.
export function sanitizeToolPairing(messages: ApiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = []
  let pending: Set<string> | null = null

  for (const msg of messages) {
    const toolUseIds = toolUseIdsOf(msg)
    if (toolUseIds) {
      if (pending) out.pop() // previous assistant tool_use turn was never answered
      out.push(msg)
      pending = toolUseIds
      continue
    }

    const resultIds = toolResultIdsOf(msg)
    if (resultIds) {
      const matches = pending !== null && resultIds.every((id) => pending?.has(id))
      if (!matches) {
        if (pending) out.pop() // drop the assistant turn these results don't answer
        pending = null
        continue // and drop this mismatched carrier itself
      }
      out.push(msg)
      pending = null
      continue
    }

    if (pending) out.pop() // a plain message can't follow an unanswered tool_use either
    out.push(msg)
    pending = null
  }

  if (pending) out.pop() // trailing unanswered tool_use
  return out
}

// The API requires the first message to be a user message without orphaned
// tool_result blocks. Trim from the front until that holds.
function trimForApi(messages: ApiMessage[]): ApiMessage[] {
  let slice = sanitizeToolPairing(messages).slice(-HISTORY_LIMIT)
  while (slice.length > 0) {
    const first = slice[0]
    if (!first) break
    const hasOrphanToolResult =
      first.role !== 'user' ||
      (Array.isArray(first.content) && first.content.some((b) => b.type === 'tool_result'))
    if (!hasOrphanToolResult) break
    slice = slice.slice(1)
  }
  return slice
}

export const useChatStore = create<ChatState>((set, get) => {
  // Audit C2: tracks the in-flight request so stopTurn() can abort it.
  let activeAbort: AbortController | null = null

  // 502/503/504 from the proxy mean the upstream AI provider call itself threw
  // (see anthropic-proxy's catch-all) — often a transient rate limit or blip,
  // not something retrying with different input would fix. One quiet retry
  // before surfacing anything to the user.
  const RETRYABLE_STATUSES = new Set([502, 503, 504])

  function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('ABORTED'))
      const t = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(t)
        reject(new Error('ABORTED'))
      }, { once: true })
    })
  }

  async function callProxy(
    model: string,
    system: string,
    messages: Anthropic.MessageParam[],
    signal: AbortSignal,
  ): Promise<Anthropic.Message> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('NOT_SIGNED_IN')

    const modelConfig = getModelConfig(model)
    const maxTokens = modelConfig?.maxOutput ?? MAX_TOKENS

    for (let attempt = 0; ; attempt++) {
      const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
        body: {
          model, max_tokens: maxTokens, system, tools: TOOL_DEFINITIONS, messages,
          prompt_version: PROMPT_VERSION,
        },
        signal,
      })
      if (!error) return data as Anthropic.Message

      const context = (error as { context?: Response & { name?: string } }).context
      if (context?.name === 'AbortError') throw new Error('ABORTED')
      // The proxy returns 429 with a budget marker when the daily AI cap is hit.
      if (context?.status === 429) throw new Error('BUDGET_EXCEEDED')

      if (attempt === 0 && context?.status !== undefined && RETRYABLE_STATUSES.has(context.status)) {
        await abortableDelay(1500, signal)
        continue
      }

      // supabase-js's own error.message is always the generic "Edge Function
      // returned a non-2xx status code" — the actual reason the proxy sent
      // back only lives in the (unread) response body on error.context.
      // Read it so a failure is debuggable instead of a dead end.
      let detail: string | undefined
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json()
          detail = typeof body?.error === 'string' ? body.error : body?.error?.message
        } catch {
          // body wasn't JSON, or was already consumed — fall back below
        }
      }
      throw new Error(detail ?? error.message ?? 'Chat request failed')
    }
  }

  async function appendMessage(msg: ApiMessage) {
    const sessionId = get().activeSessionId
    if (!sessionId) return
    set((s) => ({ messages: [...s.messages, msg] }))
    await persistMessage(sessionId, msg)
  }

  async function updateTokens(sessionId: string, inputTokens: number, outputTokens: number) {
    const session = await db.chatSessions.get(sessionId)
    if (!session) return
    const newInput = session.total_input_tokens + inputTokens
    const newOutput = session.total_output_tokens + outputTokens
    await db.chatSessions.update(sessionId, {
      total_input_tokens: newInput,
      total_output_tokens: newOutput,
      updated_at: now(),
    })
    set({ sessionInputTokens: newInput, sessionOutputTokens: newOutput })
  }

  async function incrementMessageCount(sessionId: string, delta: number) {
    const session = await db.chatSessions.get(sessionId)
    if (!session) return
    await db.chatSessions.update(sessionId, {
      message_count: session.message_count + delta,
      updated_at: now(),
    })
  }

  // Core agent loop
  async function runLoop() {
    const sessionId = get().activeSessionId
    if (!sessionId) return

    const session = await db.chatSessions.get(sessionId)
    const model = getModelConfig(session?.model ?? '') ? session?.model ?? DEFAULT_MODEL : DEFAULT_MODEL
    const system = await buildSystemPrompt(session?.skills ?? [])

    while (true) {
      // Audit C3: keep images only on the most recent message — older
      // turns get a text marker instead so we don't resend every past
      // attachment on every request.
      const trimmed = trimForApi(get().messages)
      const last = trimmed[trimmed.length - 1]
      const history =
        trimmed.length > 1 && last !== undefined
          ? [...stripImagesFromHistory(trimmed.slice(0, -1)), last]
          : trimmed

      const abort = new AbortController()
      activeAbort = abort
      const response = await callProxy(
        model,
        system,
        history as Anthropic.MessageParam[],
        abort.signal,
      )
      if (activeAbort === abort) activeAbort = null

      await appendMessage({
        role: 'assistant',
        content: response.content as Anthropic.ContentBlockParam[],
      })

      // Track tokens
      if (response.usage) {
        await updateTokens(
          sessionId,
          response.usage.input_tokens ?? 0,
          response.usage.output_tokens ?? 0,
        )
      }

      if (response.stop_reason === 'pause_turn') continue
      if (response.stop_reason !== 'tool_use') break

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )

      const readResults: Anthropic.ToolResultBlockParam[] = []
      const writes: PendingWrite[] = []
      for (const tu of toolUses) {
        if (WRITE_TOOLS.has(tu.name)) {
          writes.push({ tool_use_id: tu.id, name: tu.name, input: tu.input as Record<string, unknown> })
        } else {
          const result = await executeReadTool(tu.name, tu.input as Record<string, unknown>)
          readResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
        }
      }

      if (writes.length > 0) {
        set({ pendingWrites: writes, pendingReadResults: readResults, status: 'awaiting_confirm' })
        return
      }

      await appendMessage({ role: 'user', content: readResults })
    }

    set({ status: 'idle' })
  }

  async function safeRunLoop() {
    try {
      await runLoop()
    } catch (err) {
      activeAbort = null
      if (err instanceof Error && err.message === 'ABORTED') {
        // Audit C2: user-initiated stop — quiet, not an error.
        set({ status: 'idle' })
        return
      }
      let msg = 'Something went wrong.'
      if (err instanceof Error && err.message === 'NOT_SIGNED_IN') {
        msg = 'You were signed out. Sign in again to keep chatting.'
      } else if (err instanceof Error && err.message === 'BUDGET_EXCEEDED') {
        msg = "Today's AI allowance is used up — it resets within 24 hours. Your data and the rest of the app are unaffected."
      } else if (err instanceof Error) {
        msg = err.message
      }
      set({ status: 'idle', error: msg })
    }
  }

  return {
    hydrated: false,
    sessions: [],
    activeSessionId: null,
    messages: [],
    status: 'idle',
    error: null,
    pendingWrites: [],
    pendingReadResults: [],
    discardedPendingNotice: null,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,

    hydrate: async () => {
      if (get().hydrated) return
      // Privacy retention (audit E4): conversations are device-local; prune 90+ day
      // old messages so sensitive prose doesn't accumulate indefinitely.
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
      await db.chatMessages.filter((m) => m.created_at < cutoff).delete()
      const sessions = await db.chatSessions
        .orderBy('updated_at')
        .reverse()
        .toArray()
      const lastActive = sessions.find((s) => !s.archived_at)
      let messages: ApiMessage[] = []
      let inputTokens = 0
      let outputTokens = 0
      let droppedDangling = false
      if (lastActive) {
        const loaded = await loadSessionMessages(lastActive.id)
        messages = loaded.messages
        droppedDangling = loaded.droppedDangling
        inputTokens = lastActive.total_input_tokens
        outputTokens = lastActive.total_output_tokens
      }
      set({
        sessions,
        activeSessionId: lastActive?.id ?? null,
        messages,
        sessionInputTokens: inputTokens,
        sessionOutputTokens: outputTokens,
        hydrated: true,
        discardedPendingNotice: droppedDangling ? DISCARDED_PENDING_NOTICE : null,
      })
    },

    loadSessions: async () => {
      const sessions = await db.chatSessions
        .orderBy('updated_at')
        .reverse()
        .toArray()
      set({ sessions })
    },

    createSession: async (model?: string) => {
      const id = crypto.randomUUID()
      const session: ChatSession = {
        id,
        title: '',
        model: model ?? DEFAULT_MODEL,
        skills: [],
        archived_at: null,
        created_at: now(),
        updated_at: now(),
        message_count: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      }
      await db.chatSessions.add(session)
      const sessions = await db.chatSessions.orderBy('updated_at').reverse().toArray()
      set({
        sessions,
        activeSessionId: id,
        messages: [],
        status: 'idle',
        error: null,
        pendingWrites: [],
        pendingReadResults: [],
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
      })
      return id
    },

    switchSession: async (sessionId: string) => {
      const session = await db.chatSessions.get(sessionId)
      if (!session) return
      const { messages, droppedDangling } = await loadSessionMessages(sessionId)
      set({
        activeSessionId: sessionId,
        messages,
        status: 'idle',
        error: null,
        pendingWrites: [],
        pendingReadResults: [],
        sessionInputTokens: session.total_input_tokens,
        sessionOutputTokens: session.total_output_tokens,
        discardedPendingNotice: droppedDangling ? DISCARDED_PENDING_NOTICE : null,
      })
    },

    renameSession: async (sessionId: string, title: string) => {
      await db.chatSessions.update(sessionId, { title, updated_at: now() })
      set((s) => ({
        sessions: s.sessions.map((ss) => ss.id === sessionId ? { ...ss, title } : ss),
      }))
    },

    archiveSession: async (sessionId: string) => {
      const archivedAt = now()
      await db.chatSessions.update(sessionId, { archived_at: archivedAt, updated_at: now() })
      const { activeSessionId } = get()
      const sessions = await db.chatSessions.orderBy('updated_at').reverse().toArray()
      if (activeSessionId === sessionId) {
        const next = sessions.find((s) => !s.archived_at && s.id !== sessionId)
        if (next) {
          const { messages, droppedDangling } = await loadSessionMessages(next.id)
          set({
            sessions,
            activeSessionId: next.id,
            messages,
            sessionInputTokens: next.total_input_tokens,
            sessionOutputTokens: next.total_output_tokens,
            discardedPendingNotice: droppedDangling ? DISCARDED_PENDING_NOTICE : null,
          })
        } else {
          set({ sessions, activeSessionId: null, messages: [] })
        }
      } else {
        set({ sessions })
      }
    },

    unarchiveSession: async (sessionId: string) => {
      await db.chatSessions.update(sessionId, { archived_at: null, updated_at: now() })
      const sessions = await db.chatSessions.orderBy('updated_at').reverse().toArray()
      set({ sessions })
    },

    deleteSession: async (sessionId: string) => {
      await db.chatMessages.where('session_id').equals(sessionId).delete()
      await db.chatSessions.delete(sessionId)
      const { activeSessionId } = get()
      const sessions = await db.chatSessions.orderBy('updated_at').reverse().toArray()
      if (activeSessionId === sessionId) {
        const next = sessions.find((s) => !s.archived_at)
        if (next) {
          const { messages, droppedDangling } = await loadSessionMessages(next.id)
          set({
            sessions,
            activeSessionId: next.id,
            messages,
            sessionInputTokens: next.total_input_tokens,
            sessionOutputTokens: next.total_output_tokens,
            discardedPendingNotice: droppedDangling ? DISCARDED_PENDING_NOTICE : null,
          })
        } else {
          set({ sessions, activeSessionId: null, messages: [] })
        }
      } else {
        set({ sessions })
      }
    },

    setSessionModel: async (sessionId: string, model: string) => {
      await db.chatSessions.update(sessionId, { model, updated_at: now() })
      set((s) => ({
        sessions: s.sessions.map((ss) => ss.id === sessionId ? { ...ss, model } : ss),
      }))
    },

    setSessionSkills: async (sessionId: string, skills: string[]) => {
      await db.chatSessions.update(sessionId, { skills, updated_at: now() })
      set((s) => ({
        sessions: s.sessions.map((ss) => ss.id === sessionId ? { ...ss, skills } : ss),
      }))
    },

    sendMessage: async (text, images) => {
      if (get().status !== 'idle') return
      set({ error: null, status: 'thinking' })

      // Lazy session creation on first message
      let sessionId = get().activeSessionId
      if (!sessionId) {
        sessionId = await get().createSession()
      }

      let content: string | Anthropic.ContentBlockParam[] = text
      if (images && images.length > 0) {
        content = [
          ...images.map((img): Anthropic.ImageBlockParam => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: img.data,
            },
          })),
          { type: 'text', text: text || 'Here is my bank statement — please extract the transactions.' },
        ]
      }

      const userMsg: ApiMessage = { role: 'user', content }
      await appendMessage(userMsg)
      await incrementMessageCount(sessionId, 1)

      // Auto-title on first message
      const session = await db.chatSessions.get(sessionId)
      if (session && !session.title) {
        const title = autoTitle(userMsg)
        await db.chatSessions.update(sessionId, { title, updated_at: now() })
        set((s) => ({
          sessions: s.sessions.map((ss) => ss.id === sessionId ? { ...ss, title } : ss),
        }))
      }

      await safeRunLoop()
    },

    resolvePending: async (approve) => {
      const { pendingWrites, pendingReadResults, status } = get()
      if (status !== 'awaiting_confirm') return
      set({ status: 'thinking' })

      const writeResults: Anthropic.ToolResultBlockParam[] = []
      for (const w of pendingWrites) {
        const result = approve
          ? await executeWriteTool(w.name, w.input)
          : JSON.stringify({ saved: false, reason: 'User declined this change.' })
        writeResults.push({ type: 'tool_result', tool_use_id: w.tool_use_id, content: result })
      }

      set({ pendingWrites: [], pendingReadResults: [] })
      await appendMessage({ role: 'user', content: [...pendingReadResults, ...writeResults] })
      await safeRunLoop()
    },

    clearSession: async () => {
      const sessionId = get().activeSessionId
      if (sessionId) {
        await db.chatMessages.where('session_id').equals(sessionId).delete()
        await db.chatSessions.update(sessionId, {
          message_count: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          updated_at: now(),
        })
      }
      set({
        messages: [],
        status: 'idle',
        error: null,
        pendingWrites: [],
        pendingReadResults: [],
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
      })
    },

    stopTurn: () => {
      activeAbort?.abort()
    },

    clearDiscardedNotice: () => {
      set({ discardedPendingNotice: null })
    },
  }
})
