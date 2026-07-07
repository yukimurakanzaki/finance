import { create } from 'zustand'
import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@db/db'
import { supabase } from '@lib/supabaseClient'
import { buildSystemPrompt, PROMPT_VERSION } from '../ai/context'
import { TOOL_DEFINITIONS, WRITE_TOOLS, executeReadTool, executeWriteTool } from '../ai/tools'

const MODEL = 'claude-sonnet-5'
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
  messages: ApiMessage[]
  status: 'idle' | 'thinking' | 'awaiting_confirm'
  error: string | null
  // Read-tool results already computed for the turn awaiting confirmation
  pendingWrites: PendingWrite[]
  pendingReadResults: Anthropic.ToolResultBlockParam[]

  hydrate: () => Promise<void>
  sendMessage: (text: string, images?: { media_type: string; data: string }[]) => Promise<void>
  resolvePending: (approve: boolean) => Promise<void>
  clearChat: () => Promise<void>
}

async function persist(msg: ApiMessage) {
  await db.chatMessages.add({
    role: msg.role,
    content: JSON.stringify(msg.content),
    created_at: new Date().toISOString(),
  })
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
  // Calls the Anthropic API via a Supabase Edge Function that holds the key
  // server-side. Supabase attaches the signed-in session's JWT automatically;
  // the function rejects the call (401) if no one is signed in.
  async function callAnthropic(system: string, messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('NOT_SIGNED_IN')

    const { data, error } = await supabase.functions.invoke('anthropic-proxy', {
      body: {
        model: MODEL, max_tokens: MAX_TOKENS, system, tools: TOOL_DEFINITIONS, messages,
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

  async function append(msg: ApiMessage) {
    set((s) => ({ messages: [...s.messages, msg] }))
    await persist(msg)
  }

  // Core agent loop: call the API, execute read tools, pause on write tools.
  async function runLoop() {
    const system = await buildSystemPrompt()

    while (true) {
      const response = await callAnthropic(system, trimForApi(get().messages) as Anthropic.MessageParam[])

      await append({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] })

      // Server-side tools (web search) can pause mid-turn; re-send to resume
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
        return // paused — resolvePending() resumes the loop
      }

      await append({ role: 'user', content: readResults })
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
    messages: [],
    status: 'idle',
    error: null,
    pendingWrites: [],
    pendingReadResults: [],

    hydrate: async () => {
      if (get().hydrated) return
      // Privacy retention (audit E4): conversations are device-local; prune 90+ day
      // old messages so sensitive prose doesn't accumulate indefinitely.
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
      await db.chatMessages.filter((m) => m.created_at < cutoff).delete()
      const rows = await db.chatMessages.orderBy('id').toArray()
      const messages: ApiMessage[] = rows.map((r) => ({
        role: r.role,
        content: JSON.parse(r.content),
      }))
      // If the app was closed mid-turn (dangling tool_use with no result),
      // drop trailing messages until the conversation ends cleanly.
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
      set({ messages, hydrated: true })
    },

    sendMessage: async (text, images) => {
      if (get().status !== 'idle') return
      set({ error: null, status: 'thinking' })

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

      await append({ role: 'user', content })
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
      await append({ role: 'user', content: [...pendingReadResults, ...writeResults] })
      await safeRunLoop()
    },

    clearChat: async () => {
      await db.chatMessages.clear()
      set({ messages: [], status: 'idle', error: null, pendingWrites: [], pendingReadResults: [] })
    },
  }
})
