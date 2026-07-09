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

async function loadSessionMessages(sessionId: string): Promise<ApiMessage[]> {
  const rows = await db.chatMessages
    .where('session_id')
    .equals(sessionId)
    .sortBy('created_at')
  const messages: ApiMessage[] = rows.map((r) => ({
    role: r.role,
    content: JSON.parse(r.content),
  }))
  // Drop dangling tool_use at the end (app closed mid-turn)
  while (messages.length > 0) {
    const last = messages[messages.length - 1]
    const dangling =
      last !== undefined &&
      last.role === 'assistant' &&
      Array.isArray(last.content) &&
      last.content.some((b) => b.type === 'tool_use')
    if (!dangling) break
    messages.pop()
  }
  return messages
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

// The API requires the first message to be a user message without orphaned
// tool_result blocks. Trim from the front until that holds.
function trimForApi(messages: ApiMessage[]): ApiMessage[] {
  let slice = messages.slice(-HISTORY_LIMIT)
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
  async function callProxy(
    model: string,
    system: string,
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.Message> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('NOT_SIGNED_IN')

    const modelConfig = getModelConfig(model)
    const maxTokens = modelConfig?.maxOutput ?? MAX_TOKENS

    const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
      body: {
        model, max_tokens: maxTokens, system, tools: TOOL_DEFINITIONS, messages,
        prompt_version: PROMPT_VERSION,
      },
    })
    if (error) {
      // The proxy returns 429 with a budget marker when the daily AI cap is hit.
      const status = (error as { context?: { status?: number } }).context?.status
      if (status === 429) throw new Error('BUDGET_EXCEEDED')
      throw new Error(error.message ?? 'Chat request failed')
    }
    return data as Anthropic.Message
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
      const response = await callProxy(
        model,
        system,
        trimForApi(get().messages) as Anthropic.MessageParam[],
      )

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
      if (lastActive) {
        messages = await loadSessionMessages(lastActive.id)
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
      const messages = await loadSessionMessages(sessionId)
      set({
        activeSessionId: sessionId,
        messages,
        status: 'idle',
        error: null,
        pendingWrites: [],
        pendingReadResults: [],
        sessionInputTokens: session.total_input_tokens,
        sessionOutputTokens: session.total_output_tokens,
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
          const messages = await loadSessionMessages(next.id)
          set({
            sessions,
            activeSessionId: next.id,
            messages,
            sessionInputTokens: next.total_input_tokens,
            sessionOutputTokens: next.total_output_tokens,
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
          const messages = await loadSessionMessages(next.id)
          set({
            sessions,
            activeSessionId: next.id,
            messages,
            sessionInputTokens: next.total_input_tokens,
            sessionOutputTokens: next.total_output_tokens,
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
  }
})
