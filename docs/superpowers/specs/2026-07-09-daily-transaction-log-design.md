# Daily Transaction Log — Design Spec

*Date: 2026-07-09 · Status: approved direction from user journey session (see USER-JOURNEY.md gaps #1, #2, #3, part of #7)*

## Problem

The app is strong on planning/trajectory but has no way to log daily money movement. Users can't enter an expense, income, or wallet-to-wallet transfer; can't see today's totals; and bank accounts show no balance. The first screen (net-worth hero) answers "where am I on the FI path" when the daily question is "what happened today and what's in my wallets."

Reference UX: user's previous money-manager app (screenshots reviewed 2026-07-09): daily view with date navigator + Income/Expenses/Balance chips, FAB speed-dial (Expense/Income/Transfer), bottom-sheet wallet grid picker, recent-title and category chips, wallet tab with per-wallet balances.

## Scope

In: tab restructure, Today screen, add-transaction form (3 modes), `title` field, derived wallet balances, `save_transactions` AI tool + "Ask AI" FAB action, light theme toggle.

Out (next rounds): category spend breakdown report (P4), monthly actuals on Report beyond the basic in/out/net, gap-to-FI calculator, raise-trigger banner.

## 1. Tab restructure

| Slot | Before | After |
|------|--------|-------|
| 1 (default) | Home (net-worth hero) | **Today** — daily transaction log |
| 2 | Budget | Budget (unchanged) |
| 3 | Manager | Manager (unchanged) |
| 4 | Assets | Assets (+ balances, §5) |
| 5 | Decide | **Report** — net-worth hero + NWChart moved here, plus a monthly In/Out/Net summary row |
| 6 | More | More (+ Decide screens moved here as an entry, + theme toggle) |

`activeTab` union in the app store gains `'today' | 'report'`; `home` and `decide` keys are removed/migrated (stored active tab falls back to `today`).

## 2. Today screen (`src/features/today/`)

- **Date navigator**: `‹ Mon, 06 Jul 2026 ›`. Defaults to today; arrows step ±1 day; tapping the label opens `<input type="date">`. Selected date is screen-local state.
- **Summary chips** for the selected day: Income (sum `in`), Expenses (sum `out`), Balance (in − out). Transfers excluded from all three.
- **Transaction list** for the day, newest first: title (fallback: category name, then note), category name, wallet name, signed amount. Transfer pairs render as one row: `From → To` with amount, neutral color. Tap a row → edit in the same sheet used for add.
- **Empty state**: "No transactions on this day" + the FAB remains the call to action.
- **FAB speed-dial** (bottom-right, above tab bar): four actions —
  - **Expense** (red) → add sheet, mode `out`
  - **Income** (amber) → add sheet, mode `in`
  - **Transfer** (grey) → add sheet, transfer mode
  - **Ask AI** (blue) → switches to the Manager tab

## 3. Add Transaction sheet (`TransactionForm` in `src/features/today/`)

One bottom-sheet form, three modes. Also used for editing.

**Expense / Income mode fields**
- Date — defaults to the Today screen's selected date (auto-today on first open)
- Wallet — required; opens a bottom-sheet grid of active accounts (reference-app pattern)
- Amount — required, > 0, rupiah numeric input
- Title — free text; below it, chips of the ~8 most recent distinct titles for one-tap reuse
- Category — chips of existing categories + a `+ new` chip that creates a category inline (name only, sensible lane default) — resolves P5 discoverability
- Description — optional, maps to `note`

**Transfer mode fields**: date, from-wallet, to-wallet (must differ), amount, optional description. Saved as the existing paired pattern: two transactions (`out` from source, `in` to destination), `is_transfer: true`, shared `transfer_pair_id`, `category_id: null`.

**Save behavior**: writes to Dexie (`db.transactions`), `source: 'manual'`; lane copied from the selected account. Editing a transfer edits both legs. Deleting a transfer deletes both legs.

## 4. Schema change

`Transaction` gains `title: string | null`.
- Dexie: version bump with no index change (title is not queried).
- Supabase: migration `alter table transactions add column title text`.
- Sync mappers updated in both directions.
- Existing rows: `title` null; UI falls back to note/category for display.

## 5. Wallet balances (Assets screen)

Derived balance per account:

```
balance = (manual_balance_override ?? 0 at last_balance_updated_at ?? beginning)
        + Σ in − Σ out of that account's transactions after the anchor date
```

- `manual_balance_override` + `last_balance_updated_at` act as the opening/correction anchor — same mental model as the reference app's "balance correction". Editing the override from `AccountForm` re-anchors.
- Shown on every account row (bank accounts included — fixes P2/P9) and as a **Total balance** header over the accounts section (P3 partial).
- Implemented as a `useAccountBalances()` hook (Dexie `useLiveQuery`), reused by the wallet picker in the add sheet (each wallet tile shows its balance).

## 6. AI transaction logging (`save_transactions` write tool)

- New tool in `src/ai/tools.ts`, added to `WRITE_TOOLS` so it flows through the existing confirm gate in `chatStore`/ChatScreen.
- Input: array of `{ date, amount, direction, account_id, category_id?, title?, note?, is_transfer?, transfer_pair_id? }` — supports one-at-a-time and bulk (statement image extraction).
- Executor validates: account exists, amount > 0, valid date; rejects the whole batch with a per-row error report otherwise.
- System prompt (in `src/ai/context.ts`) gains guidance: before saving, confirm with the user **which wallet** the money moved through and **which category** applies (list options via existing read tools); for images, extract rows then present the batch for confirmation.
- The FAB "Ask AI" action is the discoverability bridge from the manual flow to this one.

## 7. Theme toggle (light "blue" mode)

- `index.css` gains a `[data-theme="light"]` block overriding the existing CSS variables (light surfaces, blue accent — reference-app palette; amber/engine/protected semantic colors re-tuned for contrast on light).
- Toggle in More ("Appearance: Dark / Light"), persisted in `db.appSettings` (`theme`), applied to `<html data-theme>` on boot before first paint (inline in `index.html` reading localStorage mirror to avoid flash).
- Default remains dark. All components already use CSS variables, so no per-component work beyond spot-checking hardcoded colors (`#000` on amber buttons, chart strokes).

## Gap review additions (2026-07-09)

- **Duplicate guard on AI bulk import**: the `save_transactions` executor checks each row against existing transactions on (date, amount, account_id) and returns matches as `possible_duplicates` so the AI can ask before the confirm gate. Manual form entry is exempt.
- **Within-day ordering**: Today list orders by `created_at` within the selected date. No time-of-day field (known ceiling; add later if backfilled ordering matters).
- **Balance hook includes transfers**: unlike `useNetWorth` (which correctly excludes transfer pairs for the aggregate), per-account balances must count both transfer legs. Reuse the derivation pattern in `useNetWorth.ts` but without the transfer filter; `useNetWorth` itself is unchanged.
- Confirmed: `useSafeToSpend` reads `db.transactions`, so manual/AI entries feed the weekly gauge automatically — no integration work.

## Error handling

- Form: inline validation (missing wallet/amount, transfer same-wallet); save failures surface as a sheet-level error, never silent.
- AI tool: invalid rows never partially write — batch is transactional via Dexie `db.transaction()`.
- Balance derivation with no anchor and no transactions shows `Rp 0`, not blank.

## Testing

- Unit: balance derivation (anchor + mixed directions + transfers), transfer pair save/edit/delete integrity, `save_transactions` validation (happy path, bad account, negative amount, bulk with one bad row).
- Manual verify (preview): add expense → appears on Today + day chips update + wallet balance drops; transfer → both wallets move, day chips unchanged; date navigation; theme toggle persists across reload; AI flow — image → extract → confirm → rows appear on Today.

## Build order (for the implementation plan)

1. Schema (`title`) + migration + mappers
2. Balance hook + Assets balances
3. TransactionForm + wallet picker (manual entry working end-to-end)
4. Today screen + FAB + tab restructure
5. `save_transactions` tool + prompt guidance + Ask AI FAB action
6. Light theme + toggle
