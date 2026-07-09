# AI Manager Chat — Session & History Management

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transform the AI Manager from a single-conversation throwaway chat into a full session-based system with CRUD, history, archive, model selection, context window awareness, and a skills/plan system — modeled after Hermes' own chat UX.

**Architecture:** Multi-session chat backed by IndexedDB (local) + Supabase (cloud sync). Each session is a `ChatSession` object; messages belong to a session via `session_id`. UI gets a session drawer/list, archive toggle, model picker, and context window indicator. "Skills" are predefined prompt templates injected into the system prompt. "Plans" are structured task lists the AI can propose and the user can track.

**Tech Stack:** React + Zustand (existing), Dexie/IndexedDB (existing), Supabase sync (existing), TypeScript

---

## 0. Current State (what exists)

| Layer | Status |
|-------|--------|
| **DB** | `chatMessages` table — flat list, numeric autoincrement `id`, no session concept. Local-only (not in `SYNC_TABLES`). |
| **Store** | `chatStore.ts` — single `messages[]` array, `sendMessage()`, `clearChat()` (deletes everything), `hydrate()` loads all messages. |
| **UI** | `ChatScreen.tsx` — one conversation, "Clear conversation" button destroys all history, no session list, no model picker. |
| **Edge Function** | `anthropic-proxy/index.ts` — actually calls Gemini Flash, translates Anthropic format. Hardcoded model. |
| **System Prompt** | `ai/context.ts` — `buildSystemPrompt()` assembles financial context from all DB tables. No skills/plan injection. |

## 1. Blindspot Analysis

### 1.1 Data Model Blindspots

| # | Blindspot | Risk | Mitigation |
|---|-----------|------|------------|
| B-1 | **No session boundary** — all messages in one flat table. "Clear" = nuke everything. No way to revisit past conversations. | High — users lose valuable financial analysis history | Add `ChatSession` entity, FK messages to sessions |
| B-2 | **Chat not synced** — `chatMessages` excluded from `SYNC_TABLES`. Sessions created on one device invisible on another. | Medium — violates multi-device requirement (SR-2.1) | Add `chat_sessions` and `chat_messages` to cloud schema + sync |
| B-3 | **No soft delete** — "Clear" does `db.chatMessages.clear()`. No archive, no undo. | Medium — accidental data loss | Add `archived_at` / `deleted_at` fields, archive before delete |
| B-4 | **No session metadata** — no title, no timestamp summary, no message count. Session list would have nothing to show. | Low — UX gap | Auto-title from first user message, store `created_at`, `updated_at`, `message_count` |

### 1.2 Model & Context Window Blindspots

| # | Blindspot | Risk | Mitigation |
|---|-----------|------|------------|
| B-5 | **Hardcoded model** — `MODEL = 'claude-sonnet-5'` in chatStore, but proxy actually calls Gemini Flash. User can't choose. | High — misleading + no flexibility | Make model selectable per-session; proxy routes to correct backend based on model param |
| B-6 | **No context window tracking** — `HISTORY_LIMIT = 40` messages is an arbitrary trim, not token-aware. User has no idea how much context remains. | Medium — conversations silently lose context | Track token usage from API responses, show remaining capacity in UI |
| B-7 | **No token budget for system prompt** — `buildSystemPrompt()` can be 3-5K tokens. Not accounted for in the 40-message limit. | Medium — context overflow | Compute system prompt tokens, subtract from available window |

### 1.3 Skills & Plan Blindspots

| # | Blindspot | Risk | Mitigation |
|---|-----------|------|------------|
| B-8 | **No reusable prompts** — every conversation starts cold. Common workflows (monthly reconcile, salary logging, FI check-in) require the user to re-explain each time. | Medium — friction | Add "skills" = named prompt templates injected into system prompt when activated |
| B-9 | **No structured task output** — AI gives advice in prose. No way to track "should I do X, Y, Z" as actionable items. | Low — nice-to-have | Add a `plan` tool the AI can propose structured tasks; render as checkable list |

### 1.4 UX Blindspots

| # | Blindspot | Risk | Mitigation |
|---|-----------|------|------------|
| B-10 | **No session navigation** — user is trapped in one conversation. No way to start fresh without losing everything. | High — core UX gap | Session list drawer with new/switch/archive actions |
| B-11 | **No search** — can't find "that conversation where I analyzed my gold position" | Medium — grows with history | Full-text search across session titles and message content |
| B-12 | **Mobile-hostile session management** — adding a sidebar/drawer must work on phones (bottom-tab app, no hamburger menu currently) | Medium — core user is mobile | Use bottom sheet or slide-over panel, not a desktop sidebar |

### 1.5 Security & Privacy Blindspots

| # | Blindspot | Risk | Mitigation |
|---|-----------|------|------------|
| B-13 | **API key in model field** — if we add model selection and the user picks Anthropic, we'd need a second server-side key. Currently only Google key exists. | Medium | Model list comes from server config, not user input. Each model maps to a server-side key in Edge Function secrets. |
| B-14 | **Chat history contains financial data** — session sync means PII/financial data in Supabase. Already true for transactions, but chat transcripts are richer. | Low (already accepted in BRD §6) | Same household isolation (RLS), same encryption posture |

---

## 2. Data Model Changes

### 2.1 New: `ChatSession` type

```typescript
// src/db/types.ts — add:
export interface ChatSession {
  id: string           // UUID (synced)
  title: string        // auto-generated from first user message, editable
  model: string        // e.g. 'gemini-2.5-flash', 'claude-sonnet-4'
  skills: string[]     // active skill IDs for this session
  archived_at: string | null
  created_at: string
  updated_at: string
  message_count: number
  // Token tracking
  total_input_tokens: number
  total_output_tokens: number
}
```

### 2.2 Modified: `ChatMessage` type

```typescript
// src/db/types.ts — replace ChatMessage:
export interface ChatMessage {
  id: string           // UUID (synced) — was numeric autoincrement
  session_id: string   // FK to ChatSession
  role: 'user' | 'assistant'
  content: string      // JSON-serialized content blocks
  input_tokens: number | null   // from API response
  output_tokens: number | null  // from API response
  created_at: string
  updated_at: string
}
```

### 2.3 New: `ChatSkill` type

```typescript
// src/ai/skills.ts — add:
export interface ChatSkill {
  id: string
  name: string           // e.g. "Monthly Reconcile"
  description: string    // one-liner for the picker
  prompt_injection: string // text appended to system prompt when active
  icon: string           // emoji
}
```

### 2.4 DB Schema (Dexie v8)

```typescript
// db.ts — add in version(8):
this.version(8).stores({
  chatSessions: 'id, archived_at, updated_at, created_at',
  chatMessages: 'id, session_id, created_at, updated_at',
})
```

### 2.5 Supabase Cloud Tables

```sql
-- New tables for chat sync
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  member_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  skills TEXT[] NOT NULL DEFAULT '{}',
  archived_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  total_input_tokens INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  input_tokens INT,
  output_tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: same household-scoped pattern as other tables
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can CRUD own chat sessions"
  ON chat_sessions FOR ALL USING (
    household_id = (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Household members can CRUD own chat messages"
  ON chat_messages FOR ALL USING (
    household_id = (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );
```

---

## 3. Model Configuration

### 3.1 Available Models (server-side config)

```typescript
// Shared type (used by both client and edge function)
export interface ModelConfig {
  id: string           // 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'claude-sonnet-4'
  name: string         // display name
  provider: 'google' | 'anthropic'
  contextWindow: number // total tokens
  maxOutput: number
  costTier: 'free' | 'standard' | 'premium'
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini Flash',
    provider: 'google',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    costTier: 'free',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini Pro',
    provider: 'google',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    costTier: 'standard',
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_384,
    costTier: 'premium',
  },
]
```

### 3.2 Edge Function Changes

The proxy needs to route to the correct backend based on `model`:

```
POST /anthropic-proxy
Body: { model: "gemini-2.5-flash", ... } → Google Gemini API
Body: { model: "claude-sonnet-4", ... } → Anthropic API
```

Secrets needed in Supabase:
- `GOOGLE_API_KEY` (already exists)
- `ANTHROPIC_API_KEY` (add for Claude models)

---

## 4. Skills System

### 4.1 Built-in Skills

```typescript
export const BUILT_IN_SKILLS: ChatSkill[] = [
  {
    id: 'monthly-reconcile',
    name: 'Monthly Reconcile',
    description: 'Guide me through end-of-month reconciliation',
    icon: '📊',
    prompt_injection: `The user wants to do their monthly financial reconciliation. Guide them step by step:
1. Ask for their bank statement (screenshot or text)
2. Extract transactions and match to accounts
3. Flag any unusual amounts or missing recurring items
4. Propose the import batch for confirmation
5. After import, summarize: total in, total out, net, and how it compares to last month`,
  },
  {
    id: 'fi-checkin',
    name: 'FI Check-in',
    description: 'Review my FI progress and what to adjust',
    icon: '🎯',
    prompt_injection: `The user wants a financial independence check-in. Analyze:
1. Current FI-eligible assets vs target (gap analysis)
2. Monthly savings rate trend
3. Whether current pipe allocations are optimal
4. Any stale asset valuations that need updating
5. Projected FI date and what would move it earlier
Be specific with numbers. End with 1-2 actionable recommendations.`,
  },
  {
    id: 'salary-day',
    name: 'Salary Day',
    description: 'Log salary and route to pipes',
    icon: '💰',
    prompt_injection: `The user just received their salary. Help them:
1. Log the income event (ask for gross/net if not provided)
2. Confirm pipe allocations are still correct
3. Check if any recurring items are due soon
4. Show updated safe-to-spend for the week
5. Flag if savings rate changed vs last month`,
  },
  {
    id: 'spending-review',
    name: 'Spending Review',
    description: 'Analyze my spending patterns',
    icon: '🔍',
    prompt_injection: `The user wants to review their spending. Query recent transactions and analyze:
1. Top spending categories this month
2. Comparison to last month (up/down/new)
3. Any recurring charges that could be cut
4. Weekend vs workday spending pattern
5. How current spending pace affects this week's safe-to-spend
Use tables/numbers, not vague statements.`,
  },
  {
    id: 'gold-update',
    name: 'Update Investments',
    description: 'Refresh mutual fund and asset values',
    icon: '📈',
    prompt_injection: `The user wants to update their investment values. For each non-auto-priced asset:
1. Use web_search to find the current NAV/price
2. Calculate new value from their holdings
3. Propose the update with source and date cited
Skip assets marked [AUTO-PRICED] — those refresh automatically.`,
  },
]
```

---

## 5. Implementation Plan

### Phase A: Data Layer (Tasks 1–5)

#### Task 1: Add ChatSession type and update ChatMessage type

**Objective:** Define the new TypeScript types.

**Files:**
- Modify: `src/db/types.ts`

**Step 1: Add ChatSession interface**

Add after the existing `ChatMessage` interface:

```typescript
export interface ChatSession {
  id: string
  title: string
  model: string
  skills: string[]
  archived_at: string | null
  created_at: string
  updated_at: string
  message_count: number
  total_input_tokens: number
  total_output_tokens: number
}
```

**Step 2: Update ChatMessage interface**

Replace:
```typescript
export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
```

With:
```typescript
export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  updated_at: string
}
```

**Step 3: Commit**
```bash
git add src/db/types.ts
git commit -m "feat: add ChatSession type, update ChatMessage with session_id"
```

---

#### Task 2: Add Dexie v8 schema for chat sessions

**Objective:** Create the IndexedDB tables.

**Files:**
- Modify: `src/db/db.ts`

**Step 1: Add chatSessions table declaration**

In the `FIDatabase` class, add:
```typescript
chatSessions!: Table<ChatSession, string>
```

**Step 2: Update the import to include ChatSession**

```typescript
import type { ..., ChatSession } from './types'
```

**Step 3: Add version 8 migration**

After the `version(7)` block:
```typescript
// v8: multi-session chat with UUID keys, synced to cloud
this.version(8).stores({
  chatSessions: 'id, archived_at, updated_at, created_at',
  chatMessages: 'id, session_id, created_at, updated_at',
})
```

**Step 4: Add chatSessions and chatMessages to SYNC_TABLES**

```typescript
export const SYNC_TABLES = [
  // ... existing tables ...
  'chatSessions',
  'chatMessages',
] as const
```

**Step 5: Commit**
```bash
git add src/db/db.ts
git commit -m "feat: add chatSessions table, migrate chatMessages to UUID keys (Dexie v8)"
```

---

#### Task 3: Add sync mappers for chat tables

**Objective:** Map local chat tables to cloud Supabase tables.

**Files:**
- Modify: `src/lib/syncMappers.ts`

**Step 1: Add cloud table mappings**

Add to `CLOUD_TABLE`:
```typescript
chatSessions: 'chat_sessions',
chatMessages: 'chat_messages',
```

**Step 2: Add `toCloudRow` / `fromCloudRow` cases**

For `chatSessions`: map `skills` (string[]) ↔ Postgres `text[]`, pass through other fields.
For `chatMessages`: direct mapping, add `household_id`.

**Step 3: Add `cloudConflictKey` cases**

Both use `'id'`.

**Step 4: Commit**
```bash
git add src/lib/syncMappers.ts
git commit -m "feat: add sync mappers for chat_sessions and chat_messages"
```

---

#### Task 4: Create Supabase migration for cloud chat tables

**Objective:** SQL migration for `chat_sessions` and `chat_messages` with RLS.

**Files:**
- Create: `supabase/migrations/XXX_chat_sessions.sql`

**Step 1: Write migration SQL** (as specified in §2.5 above)

**Step 2: Commit**
```bash
git add supabase/migrations/
git commit -m "feat: add chat_sessions and chat_messages tables with RLS"
```

---

#### Task 5: Add model config and skills definitions

**Objective:** Define available models and built-in skills.

**Files:**
- Create: `src/ai/models.ts`
- Create: `src/ai/skills.ts`

**Step 1: Create `src/ai/models.ts`** with `AVAILABLE_MODELS` and `ModelConfig` type (as in §3.1).

**Step 2: Create `src/ai/skills.ts`** with `ChatSkill` type and `BUILT_IN_SKILLS` (as in §4.1).

**Step 3: Commit**
```bash
git add src/ai/models.ts src/ai/skills.ts
git commit -m "feat: add model config and built-in chat skills"
```

---

### Phase B: Store Layer (Tasks 6–9)

#### Task 6: Rewrite chatStore for multi-session

**Objective:** Replace the single-conversation store with a session-aware store.

**Files:**
- Rewrite: `src/stores/chatStore.ts`

**Key changes:**
- State adds: `sessions: ChatSession[]`, `activeSessionId: string | null`, `searchQuery: string`
- New actions: `createSession()`, `switchSession(id)`, `archiveSession(id)`, `unarchiveSession(id)`, `deleteSession(id)`, `renameSession(id, title)`, `searchSessions(query)`
- `hydrate()` loads all sessions + messages for active session only
- `sendMessage()` creates a session on first message if none exists (lazy creation like Hermes)
- `clearChat()` → `clearSession()` (clears messages for active session, not all)
- Track token usage from API responses (`usage.input_tokens`, `usage.output_tokens`) and update session totals
- `persist()` now writes `session_id` on every message

**Auto-title logic:**
- On first user message in a new session, take first 60 chars of the text as the title
- Strip leading/trailing whitespace, truncate with "…"

**State shape:**
```typescript
interface ChatState {
  hydrated: boolean
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ApiMessage[]
  status: 'idle' | 'thinking' | 'awaiting_confirm'
  error: string | null
  pendingWrites: PendingWrite[]
  pendingReadResults: Anthropic.ToolResultBlockParam[]
  showArchived: boolean

  // Actions
  hydrate: () => Promise<void>
  createSession: (model?: string, skills?: string[]) => Promise<string>
  switchSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  unarchiveSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  toggleArchived: () => void
  sendMessage: (text: string, images?: ...) => Promise<void>
  resolvePending: (approve: boolean) => Promise<void>
  clearSession: () => Promise<void>
}
```

**Step 1: Commit**
```bash
git add src/stores/chatStore.ts
git commit -m "feat: rewrite chatStore for multi-session with CRUD"
```

---

#### Task 7: Update context builder for skills injection

**Objective:** Inject active skill prompts into the system prompt.

**Files:**
- Modify: `src/ai/context.ts`

**Step 1: Add skills parameter**

Change signature:
```typescript
export async function buildSystemPrompt(activeSkills?: string[]): Promise<string>
```

**Step 2: Inject skill prompts**

After the `NOTICES` section, if `activeSkills` has entries, append:
```
=== ACTIVE SKILLS ===
[skill prompt_injection text for each active skill]
```

**Step 3: Commit**
```bash
git add src/ai/context.ts
git commit -m "feat: inject active skills into system prompt"
```

---

#### Task 8: Update Edge Function for model routing

**Objective:** Route to correct AI backend based on `model` parameter.

**Files:**
- Modify: `supabase/functions/anthropic-proxy/index.ts`

**Key changes:**
- Read `model` from request body
- If `model` starts with `gemini-` → use existing Gemini path with that model name
- If `model` starts with `claude-` → call Anthropic API directly (new path), read `ANTHROPIC_API_KEY` from env
- Return token usage in the Anthropic-format response for both paths

**Step 1: Add Anthropic API path**

```typescript
async function callAnthropic(body: any): Promise<Response> {
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")
  if (!ANTHROPIC_KEY) throw new Error("Server missing ANTHROPIC_API_KEY")
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: body.max_tokens,
      system: body.system,
      tools: body.tools,
      messages: body.messages,
    }),
  })
}
```

**Step 2: Route based on model**

```typescript
if (model.startsWith('claude-')) {
  // Direct Anthropic call — response is already in Anthropic format
  const res = await callAnthropic(body)
  const data = await res.json()
  return new Response(JSON.stringify(data), { status: res.status, headers: { ...corsHeaders, ... } })
} else {
  // Existing Gemini path (updated to use dynamic model name)
}
```

**Step 3: Commit**
```bash
git add supabase/functions/anthropic-proxy/index.ts
git commit -m "feat: route to Gemini or Anthropic based on model param"
```

---

#### Task 9: Pass model from chatStore to proxy

**Objective:** Send the session's selected model to the edge function.

**Files:**
- Modify: `src/stores/chatStore.ts`

**Key change:**
- `callAnthropic()` reads model from the active session instead of the hardcoded `MODEL` constant
- Passes `model` in the request body to the proxy

**Step 1: Commit**
```bash
git add src/stores/chatStore.ts
git commit -m "feat: send session model to proxy instead of hardcoded constant"
```

---

### Phase C: UI Layer (Tasks 10–15)

#### Task 10: Build SessionList component

**Objective:** A slide-over panel showing all sessions with create/switch/archive.

**Files:**
- Create: `src/features/chat/SessionList.tsx`

**UI spec:**
- Slide-over from left (mobile-friendly)
- "New Chat" button at top
- Session cards: title, model badge, date, message count
- Swipe-left to archive (or long-press → context menu)
- Toggle "Show archived" at bottom
- Tap to switch session

**Step 1: Commit**
```bash
git add src/features/chat/SessionList.tsx
git commit -m "feat: add SessionList slide-over panel"
```

---

#### Task 11: Build ModelPicker component

**Objective:** Let user select AI model when creating a session or changing mid-session.

**Files:**
- Create: `src/features/chat/ModelPicker.tsx`

**UI spec:**
- Bottom sheet with model cards
- Each card: model name, provider logo/emoji, context window size, cost tier badge
- Selected model highlighted
- Shown: on "New Chat" and via a model badge tap in the chat header

**Step 1: Commit**
```bash
git add src/features/chat/ModelPicker.tsx
git commit -m "feat: add ModelPicker bottom sheet"
```

---

#### Task 12: Build ContextWindowIndicator component

**Objective:** Show remaining context capacity.

**Files:**
- Create: `src/features/chat/ContextWindowIndicator.tsx`

**UI spec:**
- Thin progress bar below the app bar (like a loading bar but always visible)
- Color: green (<50% used) → amber (50-80%) → red (>80%)
- Tooltip/tap: "X / Y tokens used (Z%)"
- Computed from: session's `total_input_tokens + total_output_tokens` vs model's `contextWindow`

**Step 1: Commit**
```bash
git add src/features/chat/ContextWindowIndicator.tsx
git commit -m "feat: add context window usage indicator"
```

---

#### Task 13: Build SkillPicker component

**Objective:** Let user activate skills for a session.

**Files:**
- Create: `src/features/chat/SkillPicker.tsx`

**UI spec:**
- Bottom sheet with skill cards
- Each card: icon, name, description, toggle (on/off)
- Active skills shown as pills below the chat header
- Accessible from a "⚡ Skills" button in the input bar

**Step 1: Commit**
```bash
git add src/features/chat/SkillPicker.tsx
git commit -m "feat: add SkillPicker bottom sheet"
```

---

#### Task 14: Update ChatScreen with new components

**Objective:** Wire everything together in the main chat UI.

**Files:**
- Modify: `src/features/chat/ChatScreen.tsx`

**Key changes:**
- Add session list toggle button in header (hamburger or sessions icon)
- Show active session title in header (tappable to rename)
- Add model badge (tappable to change) in header
- Add ContextWindowIndicator below header
- Add SkillPicker trigger in input bar
- Replace "Clear conversation" with session management actions
- Empty state: if no sessions, show welcome + "Start a conversation" + skill suggestions
- Active skill pills displayed between header and messages

**New header layout:**
```
[☰ Sessions] [Session Title ✏️]        [gemini-flash ▼]
[═══════════ context: 12% ═══════════════════════════]
[⚡ Monthly Reconcile] [⚡ FI Check-in]              ← active skills
```

**Step 1: Commit**
```bash
git add src/features/chat/ChatScreen.tsx
git commit -m "feat: integrate session list, model picker, skills into ChatScreen"
```

---

#### Task 15: Update AppBar subtitle for active session

**Objective:** Show session title instead of static "Your AI finance partner".

**Files:**
- Modify: `src/App.tsx`

**Key change:**
- Chat tab subtitle becomes the active session title (or "Your AI finance partner" if no session)

**Step 1: Commit**
```bash
git add src/App.tsx
git commit -m "feat: show active session title in app bar"
```

---

### Phase D: Testing & Review (Tasks 16–19)

#### Task 16: Write tests for chatStore session CRUD

**Objective:** Verify create/switch/archive/delete/rename session logic.

**Files:**
- Create: `src/stores/chatStore.test.ts`

**Tests:**
1. `createSession()` creates a session with UUID, default model, empty skills
2. `switchSession()` loads correct messages, sets activeSessionId
3. `archiveSession()` sets `archived_at`, session no longer in active list
4. `unarchiveSession()` clears `archived_at`
5. `deleteSession()` removes session and all its messages
6. `renameSession()` updates title
7. `sendMessage()` on empty state creates a session first (lazy creation)
8. `sendMessage()` auto-titles session from first user message
9. Token tracking: session totals increment after each API response

**Step 1: Commit**
```bash
git add src/stores/chatStore.test.ts
git commit -m "test: add chatStore session CRUD tests"
```

---

#### Task 17: Write tests for model routing in Edge Function

**Objective:** Verify the proxy routes correctly based on model param.

**Files:**
- Create: `supabase/functions/anthropic-proxy/index.test.ts`

**Tests:**
1. `model: "gemini-2.5-flash"` → calls Google API
2. `model: "claude-sonnet-4"` → calls Anthropic API
3. Missing `ANTHROPIC_API_KEY` when Claude model requested → 500 error
4. Unknown model prefix → 400 error
5. Token usage is returned in response for both providers

**Step 1: Commit**
```bash
git add supabase/functions/anthropic-proxy/index.test.ts
git commit -m "test: add model routing tests for anthropic-proxy"
```

---

#### Task 18: Write tests for skills injection

**Objective:** Verify skill prompts appear in the system prompt.

**Files:**
- Create: `src/ai/context.test.ts`

**Tests:**
1. No active skills → no `=== ACTIVE SKILLS ===` section
2. One active skill → its `prompt_injection` appears after NOTICES
3. Multiple active skills → all injections appear, in order
4. Invalid skill ID → silently skipped

**Step 1: Commit**
```bash
git add src/ai/context.test.ts
git commit -m "test: add skills injection tests for buildSystemPrompt"
```

---

#### Task 19: Migration test — existing chat data survives v8 upgrade

**Objective:** Verify Dexie v7→v8 migration doesn't lose existing messages.

**Files:**
- Create: `src/db/migration.test.ts`

**Tests:**
1. Existing v7 chatMessages (numeric id) are preserved or migrated to a "legacy" session
2. New sessions created after migration have UUID ids
3. No data loss in synced tables during the schema upgrade

**Note:** Dexie migration from numeric autoincrement `++id` to string `id` primary key is destructive — the version(8) upgrade must handle this by creating a "Legacy Conversation" session and re-inserting existing messages with generated UUIDs.

**Step 1: Commit**
```bash
git add src/db/migration.test.ts
git commit -m "test: verify v7→v8 migration preserves chat history"
```

---

### Phase E: Persistent Memory & Auto-Skill Creation (Tasks 20–26)

#### Task 20: Add ChatMemory and ChatCustomSkill types

**Objective:** Define the new TypeScript types for persistent memory and user-created skills.

**Files:**
- Modify: `src/db/types.ts`

**Step 1: Add ChatMemory interface**

```typescript
export interface ChatMemory {
  id: string
  content: string            // compact declarative fact, e.g. "Gets paid on the 25th"
  source_session_id: string | null  // which session created this memory
  created_at: string
  updated_at: string
}
```

**Step 2: Add ChatCustomSkill interface**

```typescript
export interface ChatCustomSkill {
  id: string
  name: string               // e.g. "End of Month BCA Reconcile"
  description: string        // one-liner for the picker
  icon: string               // emoji
  prompt_injection: string   // text appended to system prompt when active
  source_session_id: string | null  // which session created this skill
  created_at: string
  updated_at: string
}
```

**Step 3: Commit**
```bash
git add src/db/types.ts
git commit -m "feat: add ChatMemory and ChatCustomSkill types"
```

---

#### Task 21: Add Dexie v9 schema for memory and custom skills

**Objective:** Create IndexedDB tables and add to sync.

**Files:**
- Modify: `src/db/db.ts`

**Step 1: Add table declarations**

```typescript
chatMemories!: Table<ChatMemory, string>
chatCustomSkills!: Table<ChatCustomSkill, string>
```

**Step 2: Add version 9 migration**

```typescript
// v9: persistent AI memory + user-created custom skills
this.version(9).stores({
  chatMemories: 'id, updated_at, created_at',
  chatCustomSkills: 'id, updated_at, created_at',
})
```

**Step 3: Add to SYNC_TABLES**

```typescript
export const SYNC_TABLES = [
  // ... existing ...
  'chatSessions',
  'chatMessages',
  'chatMemories',
  'chatCustomSkills',
] as const
```

**Step 4: Commit**
```bash
git add src/db/db.ts
git commit -m "feat: add chatMemories and chatCustomSkills tables (Dexie v9)"
```

---

#### Task 22: Supabase migration for chat_memories and chat_custom_skills

**Objective:** Cloud tables with RLS.

**Files:**
- Create: `supabase/migrations/XXX_chat_memories.sql`

**Step 1: Write migration**

```sql
CREATE TABLE chat_memories (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  content TEXT NOT NULL,
  source_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_custom_skills (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '⚡',
  prompt_injection TEXT NOT NULL,
  source_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_custom_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can CRUD own memories"
  ON chat_memories FOR ALL USING (
    household_id = (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Household members can CRUD own custom skills"
  ON chat_custom_skills FOR ALL USING (
    household_id = (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );
```

**Step 2: Add sync mappers** in `src/lib/syncMappers.ts`:
- `chatMemories` → `chat_memories` (direct mapping)
- `chatCustomSkills` → `chat_custom_skills` (direct mapping)

**Step 3: Commit**
```bash
git add supabase/migrations/ src/lib/syncMappers.ts
git commit -m "feat: add chat_memories and chat_custom_skills cloud tables with RLS"
```

---

#### Task 23: Inject memory into system prompt

**Objective:** All memories appear in the system prompt for every session.

**Files:**
- Modify: `src/ai/context.ts`

**Step 1: Load memories in buildSystemPrompt**

```typescript
const memories = await db.chatMemories.toArray()
```

**Step 2: Add MEMORY section after NOTICES**

```typescript
const memoryBlock = memories.length > 0
  ? memories.map(m => `- ${m.content}`).join('\n')
  : '(none)'

// ... append to the system prompt string:
// === MEMORY ===
// ${memoryBlock}
```

**Step 3: Add memory-awareness to PERSONA**

Add to the persona instructions:
```
- You have persistent memory across sessions. When the user states a preference, correction, or personal financial detail that will matter in future conversations (e.g. "I get paid on the 25th", "don't count DPLK as liquid", "wife handles grocery budget"), propose saving it with save_memory. Keep entries compact — declarative facts, not instructions. If you notice a memory is stale or contradicted, propose deleting the old one with delete_memory and saving the corrected version.
- When you complete a useful multi-step workflow (3+ tool calls, user approved all), offer to save it as a reusable skill with create_skill. Extract the workflow pattern, not the specific data.
```

**Step 4: Enforce soft cap**

Before injecting, compute total chars of all memories. If >2000 chars, add a notice:
```
(Memory is near capacity — consider removing stale entries)
```

**Step 5: Commit**
```bash
git add src/ai/context.ts
git commit -m "feat: inject persistent memory into system prompt"
```

---

#### Task 24: Add save_memory, delete_memory, create_skill tools

**Objective:** AI can propose memory saves and skill creation for user confirmation.

**Files:**
- Modify: `src/ai/tools.ts`

**Step 1: Add tool definitions**

```typescript
// Add to WRITE_TOOLS set:
'save_memory', 'delete_memory', 'create_skill'

// Add to TOOL_DEFINITIONS array:
{
  name: 'save_memory',
  description: 'Save a fact to persistent memory that survives across chat sessions. Use when the user states a preference, correction, or stable financial detail. Keep entries compact and declarative. Requires confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The fact to remember, e.g. "Gets paid on the 25th of each month"' },
    },
    required: ['content'],
  },
},
{
  name: 'delete_memory',
  description: 'Remove a memory entry that is stale, wrong, or contradicted by new information. Requires confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      memory_id: { type: 'string', description: 'ID of the memory to remove (from the MEMORY section in context)' },
    },
    required: ['memory_id'],
  },
},
{
  name: 'create_skill',
  description: 'Save a reusable workflow as a custom skill. Use after a successful multi-step interaction that the user would want to repeat. Extract the pattern (not the specific data) into a prompt injection. Requires confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name, e.g. "End of Month BCA Reconcile"' },
      description: { type: 'string', description: 'One-line description for the skill picker' },
      icon: { type: 'string', description: 'Single emoji icon' },
      prompt_injection: { type: 'string', description: 'The instruction text that will be injected into the system prompt when this skill is active. Describe the workflow steps.' },
    },
    required: ['name', 'description', 'prompt_injection'],
  },
},
```

**Step 2: Add executors**

```typescript
async function saveMemory(input: ToolInput): Promise<string> {
  const id = crypto.randomUUID()
  await db.chatMemories.add({
    id,
    content: String(input['content']),
    source_session_id: null, // set by caller with active session id
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return JSON.stringify({ saved: true, memory_id: id })
}

async function deleteMemory(input: ToolInput): Promise<string> {
  const id = String(input['memory_id'])
  const existing = await db.chatMemories.get(id)
  if (!existing) return JSON.stringify({ error: `No memory with id ${id}` })
  await db.chatMemories.delete(id)
  return JSON.stringify({ deleted: true, content: existing.content })
}

async function createSkill(input: ToolInput): Promise<string> {
  const id = crypto.randomUUID()
  await db.chatCustomSkills.add({
    id,
    name: String(input['name']),
    description: String(input['description']),
    icon: typeof input['icon'] === 'string' ? input['icon'] : '⚡',
    prompt_injection: String(input['prompt_injection']),
    source_session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return JSON.stringify({ saved: true, skill_id: id, name: input['name'] })
}
```

**Step 3: Add to executeWriteTool switch**

```typescript
case 'save_memory': return saveMemory(input)
case 'delete_memory': return deleteMemory(input)
case 'create_skill': return createSkill(input)
```

**Step 4: Add describeWrite cases**

```typescript
case 'save_memory':
  return [`💾 Remember: "${input['content']}"`]
case 'delete_memory':
  return [`🗑 Forget memory #${input['memory_id']}`]
case 'create_skill':
  return [`⚡ New skill: "${input['name']}" — ${input['description']}`]
```

**Step 5: Commit**
```bash
git add src/ai/tools.ts
git commit -m "feat: add save_memory, delete_memory, create_skill write tools"
```

---

#### Task 25: Update memory section to include IDs for delete_memory

**Objective:** The AI needs memory IDs to propose deletions.

**Files:**
- Modify: `src/ai/context.ts`

**Key change:**

Memory entries in the system prompt include their ID so the AI can reference them:
```
=== MEMORY ===
- [id: abc-123] Gets paid on the 25th of each month
- [id: def-456] Wife handles grocery budget, don't include in personal spending review
- [id: ghi-789] Prefers to keep 3 months emergency fund in BCA savings
```

**Step 1: Commit**
```bash
git add src/ai/context.ts
git commit -m "feat: include memory IDs in system prompt for delete_memory tool"
```

---

#### Task 26: Build Memory Management screen

**Objective:** User can view, edit, and delete memories from Settings.

**Files:**
- Create: `src/features/more/MemoryManager.tsx`
- Modify: `src/features/more/MoreScreen.tsx` (add link)

**UI spec:**
- Accessible from **More → AI Memory**
- List of all memories, most recent first
- Each row: content text, date created, source session title (if available)
- Swipe left → Delete (with confirmation)
- Tap → inline edit (textarea)
- Footer: "X / 2000 chars used" capacity indicator
- Empty state: "Your AI manager has no memories yet. As you chat, it will offer to remember important facts about your finances."

**Step 1: Commit**
```bash
git add src/features/more/MemoryManager.tsx src/features/more/MoreScreen.tsx
git commit -m "feat: add AI Memory management screen"
```

---

### Phase F: Updated UI for Custom Skills (Task 27)

#### Task 27: Add custom skills section to SkillPicker

**Objective:** User-created skills appear alongside built-in skills.

**Files:**
- Modify: `src/features/chat/SkillPicker.tsx`

**Key changes:**
- Load `db.chatCustomSkills.toArray()` on mount
- Two sections: **"Built-in"** and **"My Skills"**
- Custom skills show same card UI: icon, name, description, toggle
- Long-press custom skill → context menu: **Edit** / **Delete**
- Edit opens bottom sheet: name, description, icon, prompt text (all editable textarea)
- Delete → confirmation → `db.chatCustomSkills.delete(id)`

**Step 1: Commit**
```bash
git add src/features/chat/SkillPicker.tsx
git commit -m "feat: add custom skills section to SkillPicker"
```

---

### Phase G: Testing (Tasks 28–29)

#### Task 28: Write tests for memory CRUD and injection

**Objective:** Verify memory tools and prompt injection.

**Files:**
- Create: `src/ai/memory.test.ts`

**Tests:**
1. `save_memory` creates entry in `chatMemories` table
2. `delete_memory` removes entry, returns deleted content
3. `delete_memory` with invalid ID returns error, doesn't crash
4. `buildSystemPrompt()` includes `=== MEMORY ===` section with all memories
5. Memory entries include IDs in format `[id: xxx]`
6. Empty memories → section shows `(none)`
7. Over-capacity (>2000 chars total) → shows capacity warning
8. Memories survive across sessions (load from DB, not in-memory)

**Step 1: Commit**
```bash
git add src/ai/memory.test.ts
git commit -m "test: add memory CRUD and injection tests"
```

---

#### Task 29: Write tests for auto-skill creation

**Objective:** Verify create_skill tool and SkillPicker integration.

**Files:**
- Create: `src/ai/customSkills.test.ts`

**Tests:**
1. `create_skill` creates entry in `chatCustomSkills` table
2. Created skill has all required fields (name, description, icon, prompt_injection)
3. Default icon is '⚡' when omitted
4. Custom skills loaded alongside built-in skills in `buildSystemPrompt` when activated
5. Deleting a custom skill removes it from DB
6. Editing a custom skill updates `prompt_injection` and `updated_at`

**Step 1: Commit**
```bash
git add src/ai/customSkills.test.ts
git commit -m "test: add custom skill creation tests"
```

---

### Phase H: Security & UX Review (Tasks 30–32)

#### Task 30: Security review

**Checklist:**
- [ ] No API keys in client code (models list has no keys, only IDs)
- [ ] Edge Function validates `model` param against allowlist (not arbitrary strings)
- [ ] RLS on `chat_sessions`, `chat_messages`, `chat_memories`, `chat_custom_skills` enforces household isolation
- [ ] Token counts are server-reported, not client-computed (can't be faked to bypass limits)
- [ ] Session deletion is soft-delete first (archived_at), hard delete requires confirmation
- [ ] No XSS risk from rendering session titles or memory content (user-editable text)
- [ ] Memory content is sanitized before injection into system prompt (no prompt injection via memory)
- [ ] Custom skill `prompt_injection` field cannot break the system prompt structure (no `===` delimiters allowed in user-created content)
- [ ] `delete_memory` requires confirmation (it's a write tool) — AI can't silently erase memories

**Files to audit:**
- `supabase/functions/anthropic-proxy/index.ts` — model allowlist
- `supabase/migrations/XXX_chat_sessions.sql` — RLS policies
- `supabase/migrations/XXX_chat_memories.sql` — RLS policies
- `src/features/chat/SessionList.tsx` — title rendering
- `src/ai/context.ts` — memory injection safety

---

#### Task 31: UX review

**Checklist:**
- [ ] Session list works on 375px width (iPhone SE)
- [ ] Model picker is accessible (keyboard nav, screen reader labels)
- [ ] Context window indicator doesn't occlude content on small screens
- [ ] Skill pills are scrollable horizontally if >3 active
- [ ] Empty state is clear: new user knows what to do
- [ ] Archive vs delete distinction is obvious
- [ ] Session switch doesn't lose unsent input text
- [ ] Long session titles truncate gracefully
- [ ] Memory manager is reachable from More screen without scrolling on small screens
- [ ] Memory edit textarea is large enough to read the full content
- [ ] Confirmation card for save_memory clearly shows what will be remembered
- [ ] Confirmation card for create_skill shows the skill name and prompt preview (truncated)
- [ ] Custom skill edit bottom sheet is scrollable for long prompt_injection text

---

#### Task 32: Performance check

**Checklist:**
- [ ] Session list loads in <100ms for 100 sessions
- [ ] Switching sessions doesn't re-fetch all messages from cloud (local-first)
- [ ] Token tracking doesn't add perceptible latency to message send
- [ ] Hydration of chat store doesn't block app startup (lazy-load sessions)
- [ ] Memory injection adds <50ms to system prompt build (even with 50+ entries)
- [ ] Custom skills load doesn't delay SkillPicker open

---

## 6. Task Summary

| Phase | Tasks | Scope |
|-------|-------|-------|
| A: Data Layer | 1–5 | Types, DB schema, sync mappers, migrations, model/skill configs |
| B: Store Layer | 6–9 | chatStore rewrite, context builder, edge function routing |
| C: UI Layer | 10–15 | SessionList, ModelPicker, ContextWindowIndicator, SkillPicker, ChatScreen integration |
| D: Testing (sessions) | 16–19 | Store tests, proxy tests, skills tests, migration tests |
| E: Memory & Auto-Skills | 20–26 | ChatMemory + ChatCustomSkill types, DB, Supabase, prompt injection, tools, Memory Manager screen |
| F: Custom Skills UI | 27 | Custom skills in SkillPicker with edit/delete |
| G: Testing (memory/skills) | 28–29 | Memory CRUD tests, auto-skill creation tests |
| H: Review | 30–32 | Security audit, UX audit, performance audit |

**Total: 32 tasks across 8 phases.**

**Estimated effort:** ~4–5 Codex sessions (Phase A+B in one, Phase C in one, Phase E+F in one, Phase D+G in one, Phase H + fixes in one).

---

## 7. Out of Scope (defer)

- **Full-text search across sessions** — add after basic CRUD is solid
- **Plan/task system** — the AI proposing structured checklists. Good feature, but adds complexity to tool definitions. Ship sessions first.
- **Session sharing between household members** — sessions are per-member for now. Sharing = a later feature.
- **Streaming responses** — current proxy returns complete responses. Streaming improves UX but requires SSE plumbing. Separate effort.
- **Session export** (PDF/markdown) — nice-to-have, not core.
- **Memory categories/tags** — all memories are flat for now. Categorization adds UX complexity without clear value at small scale.
- **Skill marketplace / sharing** — custom skills are household-scoped. Sharing across households is a future product feature.
- **Memory auto-decay** — memories don't expire. Manual deletion is sufficient at household scale.
