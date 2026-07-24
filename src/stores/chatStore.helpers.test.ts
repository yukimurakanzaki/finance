// Audit B1 / C3 regression tests for the chat store's pure helpers. We don't
// boot the full store here because that requires stubbing Supabase; instead we
// exercise the load + strip helpers directly, which are the parts where these
// specific audit items live.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { db } from '@db/db'
import { loadSessionMessages, stripImagesFromHistory, type ApiMessage } from './chatStore'
import { DEFAULT_MODEL } from '../ai/models'

const now = () => new Date().toISOString()

async function seedSessionWithMessages(sessionId: string, messages: ApiMessage[]) {
  await db.chatSessions.add({
    id: sessionId, title: 'test', model: DEFAULT_MODEL,
    skills: [], archived_at: null, created_at: now(), updated_at: now(),
    message_count: messages.length, total_input_tokens: 0, total_output_tokens: 0,
  })
  for (const m of messages) {
    await db.chatMessages.add({
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: m.role,
      content: JSON.stringify(m.content),
      input_tokens: null, output_tokens: null,
      created_at: now(), updated_at: now(),
    })
  }
}

beforeEach(async () => {
  await Promise.all([
    db.chatSessions.clear(),
    db.chatMessages.clear(),
  ])
})

describe('stripImagesFromHistory (audit C3)', () => {
  it('replaces image blocks in user messages with a marker text block', () => {
    const before: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
          { type: 'text', text: 'What is this?' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'A coffee.' }] },
    ]
    const after = stripImagesFromHistory(before)
    const userBlocks = after[0]!.content as Anthropic.ContentBlockParam[]
    expect(userBlocks.some((b) => b.type === 'image')).toBe(false)
    expect(userBlocks.some((b) => b.type === 'text' && (b as Anthropic.TextBlockParam).text.includes('stripped'))).toBe(true)
    // Assistant message untouched.
    expect(after[1]).toEqual(before[1])
  })

  it('returns the same per-message object references when no images present', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'plain text' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    ]
    const after = stripImagesFromHistory(msgs)
    // Same array length, same per-message references (no needless re-render churn).
    expect(after.length).toBe(msgs.length)
    expect(after[0]).toBe(msgs[0])
    expect(after[1]).toBe(msgs[1])
  })

  it('preserves tool_result blocks adjacent to images', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BBBB' } },
          { type: 'tool_result', tool_use_id: 'tu-1', content: 'OK' },
        ],
      },
    ]
    const after = stripImagesFromHistory(msgs)
    const blocks = after[0]!.content as Anthropic.ContentBlockParam[]
    expect(blocks.some((b) => b.type === 'image')).toBe(false)
    expect(blocks.some((b) => b.type === 'tool_result')).toBe(true)
  })
})

describe('loadSessionMessages (audit B1)', () => {
  it('returns droppedDangling=true when the tail message is a dangling tool_use', async () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'log this please' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'OK, here are the transactions:' },
          { type: 'tool_use', id: 'tu-1', name: 'log_transactions', input: { transactions: [] } },
        ],
      },
    ]
    await seedSessionWithMessages('s-1', messages)
    const { messages: loaded, droppedDangling } = await loadSessionMessages('s-1')
    // The dangling assistant message is dropped (per existing behavior)…
    expect(loaded.length).toBe(1)
    expect(loaded[0]!.role).toBe('user')
    // …and we report it so hydrate() can show the B1 notice.
    expect(droppedDangling).toBe(true)
  })

  it('returns droppedDangling=false when the tail message is a normal assistant reply', async () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]
    await seedSessionWithMessages('s-2', messages)
    const { messages: loaded, droppedDangling } = await loadSessionMessages('s-2')
    expect(loaded.length).toBe(2)
    expect(droppedDangling).toBe(false)
  })

  it('drops the entire dangling suffix including orphan tool_result messages', async () => {
    // Worst case: model proposed writes, user dismissed, model proposed more,
    // app closed. The dangling suffix is assistant(tool_use) →
    // user(tool_result) → assistant(tool_use); we strip every one of them
    // because the model never saw the result of the dropped tool_uses and
    // the API would reject an orphan tool_result on the next call anyway.
    const messages: ApiMessage[] = [
      { role: 'user', content: 'log 5 transactions' },
      { role: 'assistant', content: [
        { type: 'tool_use', id: 'tu-1', name: 'log_transactions', input: { transactions: [] } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tu-1', content: 'saved: false (declined)' },
      ] },
      { role: 'assistant', content: [
        { type: 'tool_use', id: 'tu-2', name: 'log_transactions', input: { transactions: [] } },
      ] },
    ]
    await seedSessionWithMessages('s-3', messages)
    const { messages: loaded, droppedDangling } = await loadSessionMessages('s-3')
    // Only the original user prompt survives; everything past it is dangling.
    expect(loaded.length).toBe(1)
    expect(loaded[0]!.role).toBe('user')
    expect(droppedDangling).toBe(true)
  })
})