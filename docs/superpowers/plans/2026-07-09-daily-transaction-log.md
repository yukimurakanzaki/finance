# Daily Transaction Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual + AI-assisted transaction logging with a Today-first UI: daily log screen as the default tab, speed-dial FAB (Expense/Income/Transfer/Ask AI), derived wallet balances, and a light theme.

**Architecture:** Local-first React PWA. Dexie (IndexedDB) is the source of truth with generic watermark sync to Supabase — sync mappers pass fields through, so new columns only need a Dexie version + a Supabase migration. UI is a 6-slot tab shell in `App.tsx` driven by `useAppStore().activeTab`. AI writes go through `executeWriteTool` behind a user confirm gate.

**Tech Stack:** React 19 + TypeScript, Dexie 4 + dexie-react-hooks, Zustand, Vitest + fake-indexeddb, Supabase (Postgres + edge functions), Biome.

**Spec:** `docs/superpowers/specs/2026-07-09-daily-transaction-log-design.md`

**Conventions used below (read once):**
- Path aliases: `@db/*` → `src/db/*`, `@lib/*` → `src/lib/*`, `@components/*` → `src/components/*`, `@features/*` → `src/features/*`, `@stores/*` → `src/stores/*`.
- All styling is inline `style={{}}` objects with CSS variables (`var(--bg-1)`, `var(--ink-1)`, `var(--amber)` …). No Tailwind classes in components. Match this.
- Currency: `formatRp` (abbreviated) / `formatRpFull` (exact) / `parseRpInput` from `@lib/currency`. Dates: `todayISO()` from `@lib/dates` (device-local, never UTC).
- Dexie hooks auto-assign `id` (UUID) and `updated_at` on create for synced tables — writers never set those.
- Run tests: `npx vitest run <path>` · typecheck: `npx tsc -b` · lint: `npx biome check src`.

**Already built — do NOT re-implement (verified 2026-07-09):**
- AI write tools `log_transactions`, `create_account`, `log_income` in `src/ai/tools.ts` with confirm gate in `chatStore.ts`. System prompt (`src/ai/context.ts:24-25`) already instructs image extraction, wallet clarification, transfer pairing, and query-before-log dedupe.
- `transactionsRepo.getDuplicateCandidate(date, amount, direction, account_id)` in `src/db/repositories/transactions.repo.ts:23`.
- `useNetWorth` (`src/hooks/useNetWorth.ts`) derives bank balances excluding transfers — leave unchanged.
- `BottomSheet`, `Field`/`Input`/`Select`/`Btn` (`src/components/`), `useSafeToSpend` reads `db.transactions` directly.

---

### Task 1: `title` field on Transaction (schema, all writers, cloud migration)

**Files:**
- Modify: `src/db/types.ts:70-87` (Transaction interface)
- Modify: `src/db/db.ts` (add version 10)
- Modify: `src/db/repositories/transactions.repo.ts:75-91` (importBatch record)
- Modify: `src/import/seedTransactions.ts` (seed record gains `title: null`)
- Modify: `src/components/QuickLogFAB.tsx:38-53` (add `title: null` — file is deleted in Task 6, but must compile until then)
- Modify: `src/ai/tools.ts` (TxnRow + logTransactions write — schema description updated in Task 8)
- Create: `supabase/migrations/20260709000001_c_transactions_title.sql`

- [ ] **Step 1: Add `title` to the Transaction type**

In `src/db/types.ts`, inside `interface Transaction`, after `amount: number`:

```ts
  title: string | null
```

- [ ] **Step 2: Run typecheck to enumerate every writer that now fails**

Run: `npx tsc -b`
Expected: errors in `transactions.repo.ts` (importBatch), `seedTransactions.ts`, `QuickLogFAB.tsx`, `ai/tools.ts` (logTransactions) — anywhere building a full `Transaction`/`Omit<Transaction,...>` object. (Reads and partial updates don't fail.)

- [ ] **Step 3: Add `title: null` to each failing writer**

In each object literal the compiler flagged, add the line below next to `note`:

```ts
      title: null,
```

Exception — in `src/ai/tools.ts` `logTransactions`, wire it from input instead (TxnRow gains the field in this step too):

```ts
// in interface TxnRow:
  title?: string
// in the db.transactions.add({...}) call:
      title: t.title || null,
```

- [ ] **Step 4: Add Dexie version 10 with a null-backfill upgrade**

In `src/db/db.ts`, after the `version(9)` block:

```ts
    // v10: user-facing title on transactions (note becomes the optional description)
    this.version(10)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Transaction>('transactions')
          .toCollection()
          .modify((t) => {
            if (t.title === undefined) t.title = null
          }),
      )
```

- [ ] **Step 5: Create the Supabase migration**

Create `supabase/migrations/20260709000001_c_transactions_title.sql`:

```sql
-- Transactions gain a user-facing title; note remains the optional description.
alter table public.transactions add column if not exists title text;
```

(Sync mappers in `src/lib/syncMappers.ts` spread rows generically — no mapper change needed.)

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npx vitest run`
Expected: typecheck clean; existing suites (`seedTransactions.test.ts`, `syncMappers.test.ts`, `legacyIdMigration.test.ts`) pass.

- [ ] **Step 7: Commit**

```bash
git add src supabase/migrations
git commit -m "feat: add title field to transactions (dexie v10 + cloud migration)"
```

---

### Task 2: Balance derivation (pure function + hook)

**Files:**
- Create: `src/lib/balances.ts`
- Create: `src/lib/balances.test.ts`
- Create: `src/hooks/useAccountBalances.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/balances.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveBalance } from './balances'
import type { Account, Transaction } from '@db/types'

const acc = (over: Partial<Account>): Account => ({
  id: 'a1', name: 'BCA', institution: 'BCA', account_type: 'bank',
  lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
  manual_balance_override: null, last_balance_updated_at: null, created_at: '', ...over,
})

const txn = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-01', amount: 100, direction: 'out', account_id: 'a1',
  category_id: null, lane: 'protected_living', source: 'manual', title: null, note: null,
  original_amount: null, overridden_amount: null, override_note: null, overridden_at: null,
  is_transfer: false, transfer_pair_id: null, created_at: '', ...over,
})

describe('deriveBalance', () => {
  it('sums in minus out with no anchor', () => {
    const txns = [
      txn({ direction: 'in', amount: 500 }),
      txn({ id: 't2', direction: 'out', amount: 120 }),
    ]
    expect(deriveBalance(acc({}), txns)).toBe(380)
  })

  it('includes transfer legs (unlike net worth math)', () => {
    const txns = [
      txn({ direction: 'in', amount: 500 }),
      txn({ id: 't2', direction: 'out', amount: 200, is_transfer: true, transfer_pair_id: 'p1' }),
    ]
    expect(deriveBalance(acc({}), txns)).toBe(300)
  })

  it('ignores other accounts', () => {
    expect(deriveBalance(acc({}), [txn({ account_id: 'other', direction: 'in', amount: 999 })])).toBe(0)
  })

  it('anchors at manual_balance_override and only counts later days', () => {
    const a = acc({ manual_balance_override: 1000, last_balance_updated_at: '2026-07-05T10:00:00.000Z' })
    const txns = [
      txn({ date: '2026-07-04', direction: 'out', amount: 400 }),
      txn({ id: 't2', date: '2026-07-05', direction: 'out', amount: 300 }),
      txn({ id: 't3', date: '2026-07-06', direction: 'out', amount: 250 }),
    ]
    expect(deriveBalance(a, txns)).toBe(750)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/balances.test.ts`
Expected: FAIL — `deriveBalance` not found.

- [ ] **Step 3: Implement**

Create `src/lib/balances.ts`:

```ts
import type { Account, Transaction } from '@db/types'

// Per-account balance: the manual override (when set) is the true balance as of
// last_balance_updated_at; only transactions dated strictly AFTER that day move it.
// Transfer legs count on both sides — that is the whole point of a transfer.
// ponytail: day-granularity anchor — same-day txns after a correction are absorbed
// by it; switch the anchor to created_at if that ever misleads.
export function deriveBalance(account: Account, txns: Transaction[]): number {
  const hasAnchor = account.manual_balance_override !== null
  const anchorDay =
    hasAnchor && account.last_balance_updated_at
      ? account.last_balance_updated_at.slice(0, 10)
      : ''
  let balance = hasAnchor ? (account.manual_balance_override as number) : 0
  for (const t of txns) {
    if (t.account_id !== account.id) continue
    if (t.date <= anchorDay) continue
    balance += t.direction === 'in' ? t.amount : -t.amount
  }
  return balance
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/balances.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Add the live hook**

Create `src/hooks/useAccountBalances.ts`:

```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { deriveBalance } from '@lib/balances'

// Live per-account balances + total across active accounts.
// Returns undefined while loading (useLiveQuery semantics).
export function useAccountBalances() {
  return useLiveQuery(async () => {
    const [accounts, txns] = await Promise.all([
      db.accounts.filter((a) => a.is_active).toArray(),
      db.transactions.toArray(),
    ])
    const balances = new Map<string, number>()
    let total = 0
    for (const a of accounts) {
      const b = deriveBalance(a, txns)
      balances.set(a.id as string, b)
      total += b
    }
    return { balances, total }
  })
}
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc -b && npx vitest run src/lib/balances.test.ts`
Expected: clean.

```bash
git add src/lib/balances.ts src/lib/balances.test.ts src/hooks/useAccountBalances.ts
git commit -m "feat: derive per-account balances (anchor + ledger, transfer-aware)"
```

---

### Task 3: Balances on the Assets screen

**Files:**
- Modify: `src/features/assets/AssetsScreen.tsx`

- [ ] **Step 1: Show total + per-row balances**

In `AssetsScreen.tsx`:

1. Import the hook and formatter (formatRpFull is already imported as formatRp? — it imports `formatRp`; add `formatRpFull`):

```ts
import { useAccountBalances } from '../../hooks/useAccountBalances'
```

2. Inside the component, after the existing `useLiveQuery` calls:

```ts
const accountBalances = useAccountBalances()
```

3. Directly above the `{/* Accounts */}` section header `<div>` (inside the `<section>`, before the flex header row), insert a total card:

```tsx
<div style={{
  background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10,
  padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', marginBottom: 10,
}}>
  <span style={{ fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
    Total balance
  </span>
  <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
    {accountBalances ? formatRp(accountBalances.total) : '—'}
  </span>
</div>
```

4. Replace the conditional balance block on each account row (currently `{acc.account_type !== 'bank' && acc.manual_balance_override !== null && (...)}` at line ~77) with an unconditional derived balance:

```tsx
<div style={{ textAlign: 'right' }}>
  <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-1)' }}>
    {accountBalances ? formatRp(accountBalances.balances.get(acc.id as string) ?? 0) : '—'}
  </div>
</div>
```

Keep whatever secondary line the old block rendered under the amount (e.g. "updated …" caption) if present — check the lines just below 80 and preserve them.

- [ ] **Step 2: Verify in preview**

Run the dev server (`preview_start` with the vite config) and check: Assets tab shows a Total balance card and every account row (including banks) shows a number; with seeded data banks show non-zero sums.

- [ ] **Step 3: Commit**

```bash
git add src/features/assets/AssetsScreen.tsx
git commit -m "feat: show derived balances and total on assets screen"
```

---

### Task 4: Transfer + delete support in the transactions repo

**Files:**
- Modify: `src/db/repositories/transactions.repo.ts`
- Create: `src/db/repositories/transactions.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/db/repositories/transactions.repo.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { transactionsRepo } from './transactions.repo'

beforeEach(async () => {
  await db.transactions.clear()
})

describe('addTransfer', () => {
  it('writes two paired legs that net to zero', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-09', amount: 200_000,
      from_account_id: 'acc-bca', from_lane: 'protected_living',
      to_account_id: 'acc-gopay', to_lane: 'protected_living',
      note: null,
    })
    const rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)
    const [a, b] = rows
    expect(a.transfer_pair_id).toBe(b.transfer_pair_id)
    expect(rows.every((r) => r.is_transfer)).toBe(true)
    expect(rows.find((r) => r.direction === 'out')?.account_id).toBe('acc-bca')
    expect(rows.find((r) => r.direction === 'in')?.account_id).toBe('acc-gopay')
  })
})

describe('deleteWithPair', () => {
  it('deletes both legs of a transfer', async () => {
    await transactionsRepo.addTransfer({
      date: '2026-07-09', amount: 50_000,
      from_account_id: 'a', from_lane: 'protected_living',
      to_account_id: 'b', to_lane: 'protected_living',
      note: null,
    })
    const leg = await db.transactions.toCollection().first()
    await transactionsRepo.deleteWithPair(leg?.id as string)
    expect(await db.transactions.count()).toBe(0)
  })

  it('deletes a plain transaction alone', async () => {
    const id = await transactionsRepo.add({
      date: '2026-07-09', amount: 10_000, direction: 'out', account_id: 'a',
      category_id: null, lane: 'protected_living', source: 'manual',
      title: 'Kopi', note: null, original_amount: null, overridden_amount: null,
      override_note: null, overridden_at: null, is_transfer: false, transfer_pair_id: null,
    })
    await transactionsRepo.deleteWithPair(id)
    expect(await db.transactions.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/db/repositories/transactions.repo.test.ts`
Expected: FAIL — `addTransfer` / `deleteWithPair` are not functions.

- [ ] **Step 3: Implement both methods**

Add to the `transactionsRepo` object in `transactions.repo.ts` (import `Lane` is already there via types import):

```ts
  addTransfer: (data: {
    date: string
    amount: number
    from_account_id: string
    from_lane: Lane
    to_account_id: string
    to_lane: Lane
    note: string | null
  }) => {
    const pairId = crypto.randomUUID()
    const base = {
      date: data.date,
      amount: data.amount,
      category_id: null,
      source: 'manual' as const,
      title: null,
      note: data.note,
      original_amount: null,
      overridden_amount: null,
      override_note: null,
      overridden_at: null,
      is_transfer: true,
      transfer_pair_id: pairId,
      created_at: now(),
    }
    return db.transaction('rw', db.transactions, async () => {
      await db.transactions.add({ ...base, direction: 'out', account_id: data.from_account_id, lane: data.from_lane })
      await db.transactions.add({ ...base, direction: 'in', account_id: data.to_account_id, lane: data.to_lane })
    })
  },

  deleteWithPair: (id: string) =>
    db.transaction('rw', db.transactions, async () => {
      const t = await db.transactions.get(id)
      if (!t) return
      if (t.transfer_pair_id) {
        await db.transactions.where('transfer_pair_id').equals(t.transfer_pair_id).delete()
      } else {
        await db.transactions.delete(id)
      }
    }),
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/db/repositories/transactions.repo.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/transactions.repo.ts src/db/repositories/transactions.repo.test.ts
git commit -m "feat: transfer pair and pair-aware delete in transactions repo"
```

---

### Task 5: TransactionForm + WalletPicker

**Files:**
- Create: `src/features/today/WalletPicker.tsx`
- Create: `src/features/today/TransactionForm.tsx`

No unit tests — UI composition over tested repo/lib code; verified via preview in Task 6 Step 4.

- [ ] **Step 1: Create the wallet picker**

Create `src/features/today/WalletPicker.tsx`:

```tsx
import { BottomSheet } from '@components/BottomSheet'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { formatRp } from '@lib/currency'
import type { Account } from '@db/types'

interface Props {
  open: boolean
  onClose: () => void
  accounts: Account[]
  excludeId?: string
  onSelect: (account: Account) => void
}

// Reference-app pattern: grid of wallet tiles, each showing its live balance.
export function WalletPicker({ open, onClose, accounts, excludeId, onSelect }: Props) {
  const balances = useAccountBalances()
  return (
    <BottomSheet open={open} onClose={onClose} title="Select wallet">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {accounts.filter((a) => a.id !== excludeId).map((a) => (
          <button
            key={a.id}
            onClick={() => { onSelect(a); onClose() }}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10,
              padding: '12px 6px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{a.name}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              {balances ? formatRp(balances.balances.get(a.id as string) ?? 0) : '—'}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Create the transaction form**

Create `src/features/today/TransactionForm.tsx`. Behavior contract:
- `mode`: `'out' | 'in' | 'transfer'`. `editing` (a `Transaction`) optional — when set, fields prefill and Save updates instead of adds; a Delete button appears (uses `deleteWithPair`).
- Expense/income save: resolve category by case-insensitive name match; create it when the typed name is new (`lane: 'protected_living'`); `lane` copied from the chosen account; `source: 'manual'`.
- Transfer save: `transactionsRepo.addTransfer`; editing a transfer deletes the old pair and re-adds (simplest correct pair edit).
- Recent title chips: distinct titles of the last 50 manual transactions, max 8.

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { BottomSheet } from '@components/BottomSheet'
import { Field, Input, Btn } from '@components/FormField'
import { parseRpInput } from '@lib/currency'
import { WalletPicker } from './WalletPicker'
import type { Account, Transaction } from '@db/types'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'out' | 'in' | 'transfer'
  defaultDate: string
  editing?: Transaction
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--amber)' : 'var(--bg-2)',
  color: active ? 'var(--on-accent, #000)' : 'var(--ink-2)',
  border: `1px solid ${active ? 'var(--amber)' : 'var(--border-2)'}`,
  borderRadius: 14, padding: '5px 11px', fontSize: 12, cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
})

export function TransactionForm({ open, onClose, mode, defaultDate, editing }: Props) {
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState(editing?.note ?? '')
  const [fromAccount, setFromAccount] = useState<Account | null>(null)
  const [toAccount, setToAccount] = useState<Account | null>(null)
  const [pickerFor, setPickerFor] = useState<'from' | 'to' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const recentTitles = useLiveQuery(async () => {
    const rows = await db.transactions.orderBy('date').reverse().limit(50).toArray()
    const seen = new Set<string>()
    for (const r of rows) if (r.title && r.source === 'manual') seen.add(r.title)
    return [...seen].slice(0, 8)
  }) ?? []

  // Prefill wallet + category when editing (once accounts/categories load)
  if (editing && !fromAccount && accounts.length > 0) {
    const acc = accounts.find((a) => a.id === editing.account_id)
    if (acc) setFromAccount(acc)
    if (editing.category_id && !categoryName) {
      const cat = categories.find((c) => c.id === editing.category_id)
      if (cat) setCategoryName(cat.name)
    }
  }

  async function resolveCategoryId(): Promise<string | null> {
    const name = categoryName.trim()
    if (!name) return null
    const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing.id ?? null
    const id = await db.categories.add({
      name, lane: 'protected_living', is_protected: false, envelope_id: null,
    })
    return id
  }

  async function handleSave() {
    setError(null)
    const amt = parseRpInput(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!fromAccount) { setError(mode === 'transfer' ? 'Pick the source wallet' : 'Pick a wallet'); return }
    if (mode === 'transfer' && !toAccount) { setError('Pick the destination wallet'); return }
    if (mode === 'transfer' && toAccount?.id === fromAccount.id) { setError('Wallets must differ'); return }
    setSaving(true)
    try {
      if (mode === 'transfer') {
        if (editing?.transfer_pair_id) await transactionsRepo.deleteWithPair(editing.id as string)
        await transactionsRepo.addTransfer({
          date, amount: amt,
          from_account_id: fromAccount.id as string, from_lane: fromAccount.lane,
          to_account_id: toAccount!.id as string, to_lane: toAccount!.lane,
          note: note || null,
        })
      } else {
        const category_id = await resolveCategoryId()
        const record = {
          date, amount: amt, direction: mode, account_id: fromAccount.id as string,
          category_id, lane: fromAccount.lane, source: 'manual' as const,
          title: title.trim() || null, note: note || null,
          original_amount: null, overridden_amount: null, override_note: null,
          overridden_at: null, is_transfer: false, transfer_pair_id: null,
        }
        if (editing) await db.transactions.update(editing.id as string, record)
        else await transactionsRepo.add(record)
      }
      onClose()
    } catch {
      setError('Could not save — try again')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editing) return
    await transactionsRepo.deleteWithPair(editing.id as string)
    onClose()
  }

  const titles = { out: 'Add expense', in: 'Add income', transfer: 'Transfer' }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? `Edit — ${titles[mode]}` : titles[mode]} height="85dvh">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={mode === 'transfer' ? 'From wallet *' : 'Wallet *'}>
          <button onClick={() => setPickerFor('from')} style={walletBtnStyle}>
            {fromAccount?.name ?? 'Select wallet…'}
          </button>
        </Field>

        {mode === 'transfer' && (
          <Field label="To wallet *">
            <button onClick={() => setPickerFor('to')} style={walletBtnStyle}>
              {toAccount?.name ?? 'Select wallet…'}
            </button>
          </Field>
        )}

        <Field label="Amount (Rp) *">
          <Input
            type="text" inputMode="numeric" mono autoFocus={!editing}
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="50.000" style={{ fontSize: 20, textAlign: 'center' }}
          />
        </Field>

        {mode !== 'transfer' && (
          <>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kopi pagi" />
            </Field>
            {recentTitles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {recentTitles.map((t) => (
                  <button key={t} onClick={() => setTitle(t)} style={chipStyle(title === t)}>{t}</button>
                ))}
              </div>
            )}

            <Field label="Category">
              <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Type to select or create…" />
            </Field>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryName(c.name)} style={chipStyle(categoryName.toLowerCase() === c.name.toLowerCase())}>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        <Field label="Description (optional)">
          <Input value={note ?? ''} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
        </Field>

        {error && <div style={{ fontSize: 12, color: 'var(--amber-text)' }}>{error}</div>}

        <Btn onClick={handleSave} disabled={saving} fullWidth>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        {editing && (
          <Btn variant="danger" onClick={handleDelete} fullWidth>Delete</Btn>
        )}
      </div>

      <WalletPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        accounts={accounts}
        excludeId={pickerFor === 'to' ? fromAccount?.id : pickerFor === 'from' ? toAccount?.id : undefined}
        onSelect={(a) => (pickerFor === 'to' ? setToAccount(a) : setFromAccount(a))}
      />
    </BottomSheet>
  )
}

const walletBtnStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8,
  color: 'var(--ink-1)', padding: '10px 12px', fontSize: 14, width: '100%',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)',
}
```

Note: `BottomSheet` — check its props (`open`, `onClose`, `title`, `height`, children). If nesting a sheet inside a sheet misbehaves in preview (Task 6 Step 4), render `WalletPicker` as a sibling overlay `<div>` instead; keep the same props.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/features/today
git commit -m "feat: transaction form with wallet picker, title/category chips, transfer mode"
```

---

### Task 6: Today screen + speed-dial FAB

**Files:**
- Create: `src/features/today/SpeedDialFAB.tsx`
- Create: `src/features/today/TodayScreen.tsx`
- Modify: `src/App.tsx` (remove global `QuickLogFAB`; wiring into tabs happens in Task 7)
- Delete: `src/components/QuickLogFAB.tsx`

- [ ] **Step 1: Create the speed-dial FAB**

Create `src/features/today/SpeedDialFAB.tsx`:

```tsx
import { useState } from 'react'
import { useAppStore } from '@stores/appStore'

interface Props {
  onAdd: (mode: 'out' | 'in' | 'transfer') => void
}

const ACTIONS: { key: 'out' | 'in' | 'transfer' | 'ai'; label: string; icon: string; bg: string; fg: string }[] = [
  { key: 'ai', label: 'Ask AI', icon: '✦', bg: '#4a9df0', fg: '#fff' },
  { key: 'transfer', label: 'Transfer', icon: '⇄', bg: 'var(--debt)', fg: '#fff' },
  { key: 'in', label: 'Income', icon: '+', bg: 'var(--amber)', fg: 'var(--on-accent, #000)' },
  { key: 'out', label: 'Expense', icon: '−', bg: '#e35d5b', fg: '#fff' },
]

export function SpeedDialFAB({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const setTab = useAppStore((s) => s.setTab)

  function handle(key: (typeof ACTIONS)[number]['key']) {
    setOpen(false)
    if (key === 'ai') setTab('chat')
    else onAdd(key)
  }

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 'calc(68px + env(safe-area-inset-bottom))', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      {open && ACTIONS.map((a) => (
        <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-1)', background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 6, padding: '3px 8px' }}>
            {a.label}
          </span>
          <button
            onClick={() => handle(a.key)}
            aria-label={a.label}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: a.bg, color: a.fg, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.icon}
          </button>
        </div>
      ))}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close actions' : 'Add transaction'}
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'var(--amber)', color: 'var(--on-accent, #000)', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(240,165,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s',
        }}
      >
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create the Today screen**

Create `src/features/today/TodayScreen.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@db/db'
import { formatRpFull } from '@lib/currency'
import { todayISO } from '@lib/dates'
import { TransactionForm } from './TransactionForm'
import { SpeedDialFAB } from './SpeedDialFAB'
import type { Transaction } from '@db/types'

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function TodayScreen() {
  const [day, setDay] = useState(todayISO())
  const [form, setForm] = useState<{ mode: 'out' | 'in' | 'transfer'; editing?: Transaction } | null>(null)

  const txns = useLiveQuery(
    () => db.transactions.where('date').equals(day).toArray(),
    [day],
  ) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []

  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const income = txns.filter((t) => t.direction === 'in' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)
  const expenses = txns.filter((t) => t.direction === 'out' && !t.is_transfer).reduce((s, t) => s + t.amount, 0)

  // Collapse transfer pairs into one display row (keyed by pair id, out-leg carries it)
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: { txn: Transaction; transferTo?: string }[] = []
    const sorted = [...txns].sort((a, b) => b.created_at.localeCompare(a.created_at))
    for (const t of sorted) {
      if (t.is_transfer && t.transfer_pair_id) {
        if (seen.has(t.transfer_pair_id)) continue
        seen.add(t.transfer_pair_id)
        const other = txns.find((o) => o.transfer_pair_id === t.transfer_pair_id && o.id !== t.id)
        const outLeg = t.direction === 'out' ? t : (other ?? t)
        const inLeg = t.direction === 'in' ? t : other
        out.push({ txn: outLeg, transferTo: inLeg ? accName.get(inLeg.account_id) : undefined })
      } else {
        out.push({ txn: t })
      }
    }
    return out
  }, [txns, accName])

  return (
    <div style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day" style={navBtn}>‹</button>
        <label style={{ position: 'relative', fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', cursor: 'pointer' }}>
          {dayLabel(day)}
          <input
            type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>
        <button onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day" style={navBtn}>›</button>
      </div>

      {/* Day summary */}
      <div style={{ display: 'flex', gap: 8 }}>
        <DayChip label="Income" value={income} color="var(--engine)" />
        <DayChip label="Expenses" value={expenses} color="var(--ink-1)" />
        <DayChip label="Balance" value={income - expenses} color={income >= expenses ? 'var(--engine)' : 'var(--amber-text)'} />
      </div>

      {/* Transactions */}
      {rows.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
          No transactions on this day
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ txn, transferTo }) => (
          <button
            key={txn.id}
            onClick={() => setForm({ mode: txn.is_transfer ? 'transfer' : txn.direction, editing: txn })}
            style={{
              background: 'var(--bg-1)', border: `1px ${txn.is_transfer ? 'dashed' : 'solid'} var(--border-1)`,
              borderRadius: 10, padding: '11px 13px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: txn.is_transfer ? 'var(--ink-2)' : 'var(--ink-1)' }}>
                {txn.is_transfer
                  ? `${accName.get(txn.account_id) ?? '?'} → ${transferTo ?? '?'}`
                  : (txn.title ?? txn.note ?? catName.get(txn.category_id ?? '') ?? '(no title)')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                {txn.is_transfer
                  ? 'Transfer'
                  : [catName.get(txn.category_id ?? ''), accName.get(txn.account_id)].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: txn.is_transfer ? 'var(--ink-3)' : txn.direction === 'in' ? 'var(--engine)' : 'var(--ink-1)' }}>
              {txn.is_transfer ? '' : txn.direction === 'in' ? '+' : '−'}{formatRpFull(txn.amount).replace('Rp ', '')}
            </div>
          </button>
        ))}
      </div>

      <SpeedDialFAB onAdd={(mode) => setForm({ mode })} />

      {form && (
        <TransactionForm
          key={form.editing?.id ?? form.mode}
          open onClose={() => setForm(null)}
          mode={form.mode} defaultDate={day} editing={form.editing}
        />
      )}
    </div>
  )
}

function DayChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color, marginTop: 3 }}>
        {formatRpFull(value).replace('Rp ', '')}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8,
  color: 'var(--ink-2)', width: 34, height: 34, fontSize: 18, cursor: 'pointer',
}
```

- [ ] **Step 3: Remove the old QuickLogFAB**

- In `src/App.tsx`: delete the `import { QuickLogFAB }` line and the `{!isChat && <QuickLogFAB />}` render.
- Delete `src/components/QuickLogFAB.tsx`.

- [ ] **Step 4: Typecheck + commit** (screen not yet routable — wired in Task 7)

Run: `npx tsc -b`
Expected: clean.

```bash
git add -A src
git commit -m "feat: today screen with date navigator, day summary, speed-dial FAB"
```

---

### Task 7: Tab restructure (Today default, Report tab, Decide → More)

**Files:**
- Modify: `src/stores/appStore.ts:3` (Tab union)
- Modify: `src/components/TabBar.tsx:3-12` (tab list)
- Modify: `src/App.tsx:75-84` (SCREENS map)
- Create: `src/features/report/ReportScreen.tsx`
- Modify: `src/features/more/MoreScreen.tsx` (Decide entry)

- [ ] **Step 1: Update the Tab union in both places**

`src/stores/appStore.ts` line 3 and `src/components/TabBar.tsx` line 3 (same literal type in both files):

```ts
type Tab = 'today' | 'budget' | 'chat' | 'assets' | 'report' | 'more'
```

In `appStore.ts`, change the initial value: `activeTab: 'today',`

- [ ] **Step 2: Update the TabBar list**

Replace the `TABS` array in `TabBar.tsx`:

```ts
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today',  label: 'Today',  icon: '☰' },
  { id: 'budget', label: 'Budget', icon: '◎' },
  { id: 'chat',   label: 'Manager', icon: '✦' },
  { id: 'assets', label: 'Assets', icon: '◈' },
  { id: 'report', label: 'Report', icon: '⌂' },
  { id: 'more',   label: 'More',   icon: '···' },
]
```

- [ ] **Step 3: Create the Report screen**

Create `src/features/report/ReportScreen.tsx` — the moved net-worth view plus this month's actuals:

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { HomeScreen } from '@features/home/HomeScreen'
import { transactionsRepo } from '@db/repositories/transactions.repo'
import { formatRp } from '@lib/currency'
import { todayISO } from '@lib/dates'

export function ReportScreen() {
  const ym = todayISO().slice(0, 7)
  const monthTxns = useLiveQuery(() => transactionsRepo.getByMonth(ym), [ym]) ?? []
  const income = monthTxns.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxns.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
            This month — actuals
          </div>
          <MonthRow label="Income" value={income} color="var(--engine)" />
          <MonthRow label="Expenses" value={expenses} color="var(--ink-1)" />
          <div style={{ height: 1, background: 'var(--border-1)', margin: '8px 0' }} />
          <MonthRow label="Net" value={income - expenses} color={income >= expenses ? 'var(--engine)' : 'var(--amber-text)'} />
        </div>
      </div>
      <HomeScreen />
    </div>
  )
}

function MonthRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{formatRp(value)}</span>
    </div>
  )
}
```

(`getByMonth` excludes transfers by default — correct here.)

- [ ] **Step 4: Rewire the SCREENS map in App.tsx**

Replace the `SCREENS` object (line ~75) and its imports:

```ts
import { TodayScreen } from '@features/today/TodayScreen'
import { ReportScreen } from '@features/report/ReportScreen'
```

```ts
const SCREENS = {
  today:  { title: 'Today',  subtitle: 'Daily transaction log',     component: <TodayScreen /> },
  budget: { title: 'Budget', subtitle: 'This workweek',             component: <BudgetScreen /> },
  chat:   { title: 'Manager', subtitle: 'Your AI finance partner',  component: <ChatScreen /> },
  assets: { title: 'Assets', subtitle: 'Accounts & assets',         component: <AssetsScreen /> },
  report: { title: 'Report', subtitle: 'The Scoreboard',            component: <ReportScreen /> },
  more:   { title: 'More',   subtitle: '',                          component: <MoreScreen /> },
} as const
```

Remove now-unused `HomeScreen`/`DecideScreen` imports from `App.tsx` (HomeScreen is imported by ReportScreen instead). Keep the reconcile-flow branch (`isInProgress && activeTab === 'budget'`) untouched.

- [ ] **Step 5: Add the Decide entry to More**

In `src/features/more/MoreScreen.tsx`, follow the screen's existing row/sheet pattern (it already opens sheets like `HouseholdSheet` / `AllowanceEditor` — copy that structure):

```tsx
import { useState } from 'react' // if not already imported
import { BottomSheet } from '@components/BottomSheet'
import { DecideScreen } from '@features/decide/DecideScreen'
```

Add a state + a row where the other feature rows live, and the sheet at the bottom of the JSX:

```tsx
const [decideOpen, setDecideOpen] = useState(false)
```

```tsx
{/* row, styled like the screen's other rows */}
<button onClick={() => setDecideOpen(true)} /* copy the adjacent row's style */>
  Decide — what does this buy?
</button>
```

```tsx
<BottomSheet open={decideOpen} onClose={() => setDecideOpen(false)} title="Decide" height="92dvh">
  <DecideScreen />
</BottomSheet>
```

- [ ] **Step 6: Verify end-to-end in preview**

Start the dev server. Check:
1. App opens on Today; date navigator steps days; date picker jumps.
2. FAB → Expense → fill form (wallet grid shows balances) → Save → row appears, day chips update, Assets balance moved.
3. FAB → Transfer → both wallets change on Assets, day chips unchanged, row renders `A → B` dashed.
4. Tap a row → edit sheet prefilled → change amount → chips update. Delete a transfer → both legs gone.
5. Typing a brand-new category name and saving creates the category (visible in More → Categories).
6. FAB → Ask AI lands on Manager tab. Report tab shows month actuals + net-worth hero. More opens Decide.

- [ ] **Step 7: Full check + commit**

Run: `npx tsc -b && npx vitest run && npx biome check src`
Expected: all clean.

```bash
git add -A src
git commit -m "feat: today-first tab layout with report tab and decide in more"
```

---

### Task 8: AI logging — `title` support + duplicate guard

**Files:**
- Modify: `src/ai/tools.ts` (log_transactions schema + executor)
- Modify: `src/ai/context.ts:25` (one sentence appended)
- Create: `src/ai/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ai/tools.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@db/db'
import { executeWriteTool } from './tools'

const row = (over: Record<string, unknown> = {}) => ({
  date: '2026-07-09', amount: 24_000, direction: 'out', account_id: 'acc-1',
  lane: 'protected_living', title: 'Kopi pagi', note: 'Kopi Kenangan', ...over,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.accounts.add({
    id: 'acc-1', name: 'Gopay', institution: 'GoTo', account_type: 'digital_wallet',
    lane: 'protected_living', currency: 'IDR', is_protected: false, is_active: true,
    manual_balance_override: null, last_balance_updated_at: null, created_at: '',
  })
})

describe('log_transactions', () => {
  it('saves title', async () => {
    const res = JSON.parse(await executeWriteTool('log_transactions', { transactions: [row()] }))
    expect(res.saved_count).toBe(1)
    const t = await db.transactions.toCollection().first()
    expect(t?.title).toBe('Kopi pagi')
  })

  it('skips exact duplicates and reports them', async () => {
    await executeWriteTool('log_transactions', { transactions: [row()] })
    const res = JSON.parse(await executeWriteTool('log_transactions', { transactions: [row()] }))
    expect(res.saved_count).toBe(0)
    expect(res.possible_duplicates).toHaveLength(1)
  })

  it('saves duplicates when allow_duplicates is true', async () => {
    await executeWriteTool('log_transactions', { transactions: [row()] })
    const res = JSON.parse(await executeWriteTool('log_transactions', {
      transactions: [row()], allow_duplicates: true,
    }))
    expect(res.saved_count).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ai/tools.test.ts`
Expected: test 1 may already pass (title wired in Task 1); tests 2–3 FAIL — no dedupe behavior.

- [ ] **Step 3: Implement the guard + schema**

In `src/ai/tools.ts`:

1. `log_transactions` input schema — add to `items.properties`:

```ts
              title: { type: 'string', description: 'Short user-facing title, e.g. "Kopi pagi". Merchant detail goes in note.' },
```

and add a top-level property beside `transactions`:

```ts
        allow_duplicates: { type: 'boolean', description: 'Set true ONLY after the user confirmed flagged rows are genuinely new, to save them anyway.' },
```

2. In `logTransactions`, import the repo at the top of the file:

```ts
import { transactionsRepo } from '@db/repositories/transactions.repo'
```

and inside the row loop, after the account check and before `db.transactions.add`:

```ts
    if (input['allow_duplicates'] !== true) {
      const dup = await transactionsRepo.getDuplicateCandidate(t.date, t.amount, t.direction, t.account_id)
      if (dup) {
        duplicates.push({ date: t.date, amount: t.amount, note: t.note ?? null, existing_id: dup.id })
        continue
      }
    }
```

with `const duplicates: Record<string, unknown>[] = []` declared beside `errors`, and the return extended:

```ts
  return JSON.stringify({ saved_count: saved, errors, possible_duplicates: duplicates })
```

3. In `src/ai/context.ts`, append one sentence to the end of the line-25 bulk-import bullet (after "…per log_transactions call so each confirmation card stays reviewable."):

```
 If the tool result reports possible_duplicates, tell the user which rows were skipped and re-call with allow_duplicates=true only for rows the user confirms are new.
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/ai/tools.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ai
git commit -m "feat: title + duplicate guard in AI log_transactions"
```

---

### Task 9: Light theme + toggle

**Files:**
- Modify: `src/index.css`
- Modify: `index.html`
- Modify: `src/features/more/MoreScreen.tsx`
- Modify: `src/components/FormField.tsx:66` (Btn primary text color)
- Modify: `src/features/budget/TransactionHistory.tsx` (period-tab text color)

- [ ] **Step 1: Define the light theme variables**

In `src/index.css`, add `--on-accent: #000;` inside the existing `:root` block (next to `--amber`), then append after the `:root` block:

```css
/* Light "blue" theme — accent slot stays named --amber but carries blue here.
   ponytail: renaming the var across ~30 files is churn with zero user value. */
:root[data-theme='light'] {
  --bg-0: #e9eef6;
  --bg-1: #ffffff;
  --bg-2: #f2f6fb;
  --bg-3: #e7edf5;
  --bg-4: #dbe4ef;
  --ink-1: #1c2534;
  --ink-2: #5a6579;
  --ink-3: #8b95a8;
  --amber: #2b8ae0;
  --amber-text: #1d6fc0;
  --amber-dim: #7fb4e8;
  --amber-surface: #e9f2fc;
  --amber-border: #bcd8f3;
  --on-accent: #ffffff;
  --engine: #149e6d;
  --engine-bg: #e3f5ee;
  --store: #b17a00;
  --store-bg: #faf2dd;
  --debt: #64748b;
  --debt-bg: #eef1f5;
  --protected: #5b64d8;
  --protected-bg: #eceefc;
  --border-1: #dde5ef;
  --border-2: #c9d4e3;
  color-scheme: light;
}
```

- [ ] **Step 2: Fix hardcoded black-on-accent text**

- `src/components/FormField.tsx` line 66: `primary: { background: 'var(--amber)', color: 'var(--on-accent)', border: 'none' },`
- `src/features/budget/TransactionHistory.tsx` period tab buttons: replace `color: period === p ? '#000' : 'var(--ink-2)'` with `color: period === p ? 'var(--on-accent)' : 'var(--ink-2)'`.
- Grep for remaining accent-background black text: `grep -rn "color: '#000'" src` — fix each the same way if its background is `var(--amber)`.

- [ ] **Step 3: No-flash boot script**

In `index.html`, inside `<head>` before the module script:

```html
<script>
  try { if (localStorage.getItem('fi-theme') === 'light') document.documentElement.dataset.theme = 'light' } catch (e) {}
</script>
```

- [ ] **Step 4: Toggle in More**

In `src/features/more/MoreScreen.tsx`, add near the top of the settings rows (reuse the screen's row style):

```tsx
const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

function toggleTheme() {
  const next = theme === 'light' ? 'dark' : 'light'
  setTheme(next)
  if (next === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem('fi-theme', next) } catch { /* private mode */ }
  db.appSettings.put({ key: 'theme', value: next })
}
```

```tsx
<button onClick={toggleTheme} /* copy adjacent row style */>
  Appearance: {theme === 'light' ? 'Light' : 'Dark'} — tap to switch
</button>
```

(Check the `AppSetting` type in `src/db/types.ts` for its exact shape — if it's `{ key, value }` the `put` above is right; adjust the property name if it differs. localStorage is the boot source of truth; appSettings is a synced mirror only.)

- [ ] **Step 5: Verify in preview**

Toggle in More → whole app flips (blue accent, light surfaces); reload → theme sticks with no dark flash; check contrast on: TabBar active label, day chips, amber Save button (white text), gauge card, chat screen. Fix any component found using hardcoded dark hex.

- [ ] **Step 6: Commit**

```bash
git add -A src index.html
git commit -m "feat: light blue theme with persisted toggle"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full automated pass**

Run: `npx tsc -b && npx vitest run && npx biome check src`
Expected: all clean. Fix anything that isn't before proceeding.

- [ ] **Step 2: Manual scenario pass (preview)**

Walk spec's testing list end to end:
1. Fresh-ish flow: app opens on Today with seeded data visible for a seeded date (navigate back to June 2026).
2. Log expense from FAB → Today row + chips + Assets balance all move together.
3. Transfer BCA→Gopay → both balances move, day chips unchanged.
4. New category typed in form → appears in More → Categories.
5. Manager tab: "log 15k kopi from Gopay today" → AI proposes log_transactions (title filled) → approve → appears on Today. Repeat the same message → AI reports a possible duplicate instead of double-saving.
6. Theme toggle both directions + reload persistence.

- [ ] **Step 3: Commit any fixes, then update USER-JOURNEY.md statuses**

Mark P1, P2, P3, P5, P6, P9 resolved (✅) in the pain-point table with a one-line note ("shipped 2026-07-XX, daily transaction log").

```bash
git add -A
git commit -m "docs: mark daily-log pain points resolved in user journey map"
```
