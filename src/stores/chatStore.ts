import { create } from 'zustand'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@db/db'
import { settingsRepo } from '@db/repositories/settings.repo'
import { buildSystemPrompt } from '../ai/context'
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
  async function getClient(): Promise<Anthropic> {
    const key = await settingsRepo.get('anthropic_api_key')
    if (!key) throw new Error('NO_API_KEY')
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  }

  async function append(msg: ApiMessage) {
    set((s) => ({ messages: [...s.messages, msg] }))
    await persist(msg)
  }

  // Core agent loop: call the API, execute read tools, pause on write tools.
  async function runLoop() {
    const client = await getClient()
    const system = await buildSystemPrompt()

    while (true) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: TOOL_DEFINITIONS,
        messages: trimForApi(get().messages) as Anthropic.MessageParam[],
      })

      await append({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] })

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
      if (err instanceof Error && err.message === 'NO_API_KEY') {
        msg = 'No API key configured.'
      } else if (err instanceof Anthropic.AuthenticationError) {
        msg = 'Invalid API key. Check it in the setup screen (clear the key in More if needed).'
      } else if (err instanceof Anthropic.RateLimitError) {
        msg = 'Rate limited by the API — wait a moment and try again.'
      } else if (err instanceof Anthropic.APIError) {
        msg = `API error: ${err.message}`
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
