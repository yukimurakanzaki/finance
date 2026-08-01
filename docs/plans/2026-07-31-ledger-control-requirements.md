# Ledger Control — Requirements (Balance Correction + Full CRUD)

**Date:** 2026-07-31
**Status:** Requirements gathering / elicitation. Not yet a ticket.
**Source pain point (verbatim, user):** *"After using the app, the user wants to
know if they could change the account balance to the correct one without having
to log the transaction, because they forgot what they had used it for"* — plus
requested CRUD freedom over (1) accounts and asset values, (2) income/salary,
(3) recurring bills, (4) weekly and workday balance.
**Related docs:** `PAIN-POINTS.md` (why), `BACKLOG.md` (what's left), `BRD.md`,
`REQUIREMENTS.md`, `ARCHITECTURE.md`.

---

## 0. Gap analysis — is this already addressed?

**Short answer: no. Partly built at the data layer, largely missing at the UI
layer, and not represented anywhere in `BACKLOG.md`.**

`BACKLOG.md` §A/§B/§C contains no ticket for balance correction or for CRUD
completeness. The closest items are O1 (starting balance at onboarding — now
done, `OnboardingWizard.tsx:186` writes `manual_balance_override`) and S2
(reconcile per-row control). Neither covers *post-onboarding correction*.

| Capability | Data layer | UI (human) | UI (AI chat) | Verdict |
|---|---|---|---|---|
| Correct an account balance without a transaction | ✅ `Account.manual_balance_override` + `last_balance_updated_at`; `deriveBalance()` (`src/lib/balances.ts:8`) treats the override as an anchor and replays only txns dated *after* it. `accountsRepo.updateManualBalance()` exists. | ❌ **Gated off for `account_type === 'bank'`** — `AccountForm.tsx:35` (`needsManualBalance = accountType !== 'bank'`) hides the field and copy says *"Bank account balance is derived from imported transactions — no manual entry needed."* Bank accounts therefore have **no** correction path. | 🟡 `update_account_balance` tool exists (`src/ai/tools.ts:251`) but its own description excludes bank accounts. | **Gap — primary.** The engine already supports exactly what the user asked for; the UI forbids it on the most common account type. |
| Update asset value | ✅ `assetsRepo.updateValue()` / `update()` | 🟡 Edit via `AssetForm` (tap row). No quick "re-value" action, no history. | ✅ `update_asset_value` | Partial |
| **Delete** an account | 🟡 `accountsRepo.remove()` (hard delete — no tombstone, unlike income/recurring) | ❌ Only **Deactivate** (`AccountForm.tsx:141`) | ❌ | Gap |
| **Delete** an asset | ❌ No `remove()` in `assets.repo.ts` at all | ❌ No delete button in `AssetForm.tsx` | ❌ | **Gap — assets are create/edit only, forever** |
| Create/edit income event | ✅ `incomeEventsRepo.create/update` | 🟡 Create only (`IncomeLog.tsx` → `AddIncomeForm`). **No edit path** — a typo'd salary can only be deleted and re-entered. | ✅ `log_income` | Gap (U of CRUD) |
| Delete income event | ✅ tombstone `remove()` | ✅ long-press on card | ❌ | Done |
| Recurring bill CRUD | ✅ create/update/deactivate/tombstone-remove | ✅ full C-R-U-D + Pause (`RecurringRegister.tsx`) — **but** the form never exposes `next_due` or `end_date`; `next_due` is hardcoded to today on create. | 🟡 `add_recurring_item` only (no update/delete tool) | Mostly done; two fields unreachable |
| Weekly / workday balance | ✅ `Allowance{monthly_amount, weekend_allocation}`; `computeSafeToSpend()` derives `weekPool` and `todayCeiling` | 🟡 `AllowanceEditor.tsx` sets the two monthly inputs only. No way to set a **week** pool or a **workday** ceiling directly; no history; no reset; no delete. | ❌ no tool | Gap |

**Conclusion:** write the requirement. Scope it as one epic, `L1`, with five
sub-features (L1.1–L1.5), independent of Phase 3/4 work in `BACKLOG.md`.

### 0.1 Decisions taken (elicitation, 2026-07-31)

| # | Decision | Consequence |
|---|---|---|
| D1 | **A correction is recorded as a transaction**, not as a silent balance overwrite. A new `Transaction` with `is_adjustment: true` carries the delta, direction `in` or `out` as needed. | The gap is visible in history and can be re-categorised later once the user remembers what it was. Requires a schema flag and an exclusion in `isWeekDraw()`. |
| D2 | **`manual_balance_override` keeps exactly one job: the onboarding opening balance.** It is not the correction mechanism and the `AccountForm` field stays as-is. | The `account_type !== 'bank'` gate stops mattering — bank accounts get corrections through adjustment transactions like every other type. No unhiding, no ambiguity about which of two mechanisms is authoritative. `deriveBalance()` is unchanged. |
| D3 | **Audit history is in v1** — `balanceCorrections` and `allowanceHistory`. `balanceCorrections` is a thin audit row referencing the adjustment transaction it created. | Undo, attribution between household members, "changed from Rp X on <date>". |
| D4 | **Per-week override is cut from L1** (was FR-5.3). No `weeklyOverrides` table, no signature change to `computeSafeToSpend`. | L1.5 shrinks to: live derived preview, weekly-figure entry back-solved to monthly, and allowance change history. Revisit only if users actually ask for a travel-week adjustment. |
| D5 | **Deleting an account with transactions is blocked**; offer "move transactions to another account" or "deactivate instead". | No orphaned `account_id`, no silent rewrite of past months. |

---

## 1. Business requirements (BR)

| ID | Requirement | Rationale | Success measure |
|---|---|---|---|
| BR-1 | The ledger must be **correctable without fabricating history**. A user who cannot reconcile the app to reality must be able to state the truth ("this wallet has Rp 412.000") in one action. | The app's entire value chain (safe-to-spend → daily leftover → net worth → FI projection) is downstream of balances. A wrong balance the user *cannot* fix converts the app from a decision tool into noise, and abandonment follows within days. | ≥90% of accounts show a balance the user confirms as correct at any given check-in; no user-reported "I gave up because it was wrong". |
| BR-2 | Every user-entered financial object must be **fully reversible** (create, read, update, delete). | Data entry errors are certain. Irreversibility is a trust failure and, for a household product with an invited partner, a shared-blame failure. | Zero object types with a missing CRUD verb reachable by a non-technical user. |
| BR-3 | Corrections must **not distort behavioral signals**. A correction is recorded as a transaction (D1) so the money is traceable, but it must never draw down safe-to-spend and never count as category spending until the user *chooses* to categorise it. | If correcting the ledger costs the user their daily allowance, they will not correct it. Recording it as an untagged adjustment keeps the door open for "oh, that was groceries" later. | `computeSafeToSpend`/`computeDailyLeftover` outputs are provably unchanged by any correction (test-enforced, FR-1.5). |
| BR-4 | Corrections must be **auditable and attributable** in a household. | Two members, one ledger. An unexplained jump of Rp 2.000.000 with no author and no timestamp is a fight. | Every correction carries who/when/old/new and is visible in-app. |
| BR-5 | Keep the schema change to the minimum the decisions actually require. | Sprint velocity. D1 costs one boolean column on `transactions`; D3 costs two audit tables; D2 and D4 cost nothing. | L1 ships with one column added to `transactions`, zero changes to `accounts`, and no change to `deriveBalance`. |

**Explicitly out of scope (business level):** double-entry accounting, bank
API/Open Banking auto-sync, multi-currency correction, and retroactive
recomputation of historical safe-to-spend gauges.

---

## 2. Stakeholder requirements (SR)

| Stakeholder | Need | Requirement |
|---|---|---|
| **Primary user (owner/operator)** — Indonesian, IDR, mobile-first, uses the app daily for the lunch/coffee decision | "My wallet says Rp 412k, the app says Rp 690k, and I don't remember what I spent it on. Just let me set it to 412k and move on." | SR-1: Set-true-balance in ≤2 taps from where the wrong number is displayed, with no requirement to explain, categorize, or date the difference. |
| | "I mistyped my salary as 1.500.000 instead of 15.000.000." | SR-2: Edit any income event in place; the FI projection and savings rate follow immediately. |
| | "Netflix went up to Rp 186k and the due date moved." | SR-3: Edit amount **and** `next_due`/`end_date` of any recurring item. |
| | "I think in weeks, not months — let me type the weekly figure." | SR-4: Enter the weekly pool directly and see the resulting workday ceiling, without doing the division by hand. (A *this-week-only* adjustment is **deferred**, D4.) |
| | "I sold the gold. Get it out of my net worth." | SR-5: Delete an asset (and an account) — not just hide it. |
| **Invited household partner** (see `PAIN-POINTS.md` O2) | Must not be able to silently wreck the owner's ledger. | SR-6: Corrections are attributed and visible to both members; destructive deletes are confirmed. |
| **AI Manager (chat)** | Must be able to do everything the human UI can, and never claim a capability it lacks. | SR-7: Tool parity — `update_account_balance` works for all account types; add `update_recurring_item`, `delete_recurring_item`, `update_income_event`, `update_allowance`. Confirmation card required for each (existing `AiOperation` idempotency ledger applies). |
| **Maintainer / reviewer** | Must not fork the balance math. | SR-8: One derivation (`deriveBalance`) remains the single source of per-account balance. No second code path. |
| **Sync layer (Supabase)** | Watermark sync has no delete channel (`incomeEvents.repo.ts` comment). | SR-9: New deletes must be tombstones, not hard deletes, or they resurrect on the next pull. |

---

## 3. Functional requirements (FR)

### L1.1 — Balance correction ("Set true balance") — *the headline ask*

- **FR-1.1** Every active account row (Assets screen, and the standing strip /
  wallet picker on Today) exposes a **"Set true balance"** action, for **every**
  `account_type` including `bank`.
- **FR-1.2** The action takes: **actual balance (required)**, **as-of date
  (default = today, cannot be in the future)**, **note (optional, free text)**.
  The user types the balance they actually have; they are never asked what the
  difference was spent on.
- **FR-1.3** On save the system computes `delta = actual − derived` and writes a
  single `Transaction`:
  `{ date: <as-of date>, amount: |delta|, direction: delta < 0 ? 'out' : 'in',
  account_id, title: 'Balance correction', is_adjustment: true, is_transfer:
  false, category_id: null, recurring_item_id: null, source: 'manual',
  lane: <account's lane>, note }`.
  `manual_balance_override` is **not** touched (D2).
- **FR-1.4** `Transaction` gains **`is_adjustment: boolean`** (default `false`).
  It is the single flag every consumer branches on. It is **not** a new
  `TransactionSource` — source stays `'manual'`/`'claude_import'` so import
  provenance is unaffected.
- **FR-1.5** **Exclusions — the load-bearing requirement.** An adjustment
  transaction must be excluded from:
  - `isWeekDraw()` (`src/engine/safeToSpend.ts:14`) — so it never draws the
    personal pool, and therefore never moves `computeSafeToSpend` or
    `computeDailyLeftover` (which delegates to `isWeekDraw`);
  - the category breakdown (`src/features/report/categoryBreakdown.ts`);
  - Report monthly actuals (income/expense totals);
  - savings-rate and FI-projection inputs.
  It is **included** in: account balance (`deriveBalance` sums all transactions
  after the anchor — no change needed), net worth, and the transaction history
  list.
- **FR-1.6** Before saving, the sheet shows the **delta preview**: current
  derived balance, entered balance, and the difference, with the caption "Not
  counted as spending".
- **FR-1.7** Every correction appends a row to **`balanceCorrections`**:
  `id, account_id, transaction_id, previous_balance, new_balance, as_of_date,
  note, author_member_id, created_at`. Append-only, read-only in the UI, shown
  as "Correction history" in the account's edit sheet, newest first (BR-4).
- **FR-1.8** Adjustment transactions are **visually distinct** in every
  transaction list (Today, history, account detail): a distinct icon and a
  "Correction" caption, never styled as ordinary spending.
- **FR-1.9** An adjustment transaction is **editable and deletable like any
  other transaction** (amount, date, note) via the existing `TransactionForm`.
  Deleting it reverses the correction; the `balanceCorrections` row is not
  deleted but gains a reverting entry (never edited in place).
- **FR-1.10** An adjustment transaction **may later be given a `category_id`**
  ("I remembered — it was groceries"). Assigning a category **clears
  `is_adjustment`**, converting it into an ordinary transaction that from then on
  counts in category totals and — if dated in the current week — in the personal
  pool draw. The UI must state that consequence before committing.
- **FR-1.11** The account row shows an **"as of <date>"** caption sourced from
  the most recent correction, and a muted **stale** treatment when the last
  correction is >30 days old.

### L1.2 — Accounts & assets CRUD

- **FR-2.1** Assets gain **delete** (`assetsRepo.remove()` as a tombstone —
  `Asset` gains `deleted_at`; every read filters it, matching the
  `incomeEvents.repo`/`recurringItems.repo` pattern) surfaced as a `danger`
  button in `AssetForm.tsx`, behind confirmation.
- **FR-2.2** Assets gain a **quick re-value** action (value + `last_valued_at`)
  parallel to FR-1.2, reusing `assetsRepo.updateValue()`. Auto-priced assets
  (`auto_price !== null`) show their computed value and require switching to
  manual before a re-value is accepted.
- **FR-2.3** Accounts: **Deactivate** (existing) and **Delete** become distinct
  actions with distinct copy. Delete is a tombstone; it is **blocked** while
  transactions reference the account — offer "Deactivate instead" or "Move N
  transactions to <account>" (moving is the safe default; deleting transactions
  is never offered here).
- **FR-2.4** Deactivated accounts remain visible in a collapsed "Inactive"
  section on the Assets screen and can be reactivated.

### L1.3 — Income / salary CRUD

- **FR-3.1** Tapping an income card in `IncomeLog.tsx` opens the same form
  pre-filled for **edit** (`incomeEventsRepo.update` already exists and is
  unused by the UI). Fields: date, gross, take-home net, note.
- **FR-3.2** On edit, `delta_vs_prev` is **recomputed for the edited event and
  for the next event in date order**, since both depend on the previous row.
- **FR-3.3** `routed_to_pipe`/`routed_to_lifestyle` recompute from currently
  active `pay_yourself_first` items on edit, matching create-time behavior
  (`IncomeLog.tsx:193-204`), and the user is shown the resulting split before
  confirming.
- **FR-3.4** Delete stays a tombstone (existing) but moves off long-press-only
  to an explicit button inside the edit sheet; long-press stays as the shortcut.
- **FR-3.5** Deleting the latest income event must surface its consequence:
  "This is your current salary. The FI projection will fall back to <date /
  amount> or to no-income." (`incomeEventsRepo.getLatest()` drives projections.)

### L1.4 — Recurring bills CRUD

- **FR-4.1** The recurring form exposes `next_due` (date) and `end_date`
  (date, nullable) — today they are unreachable after creation and `next_due` is
  hardcoded to `todayISO()` on create (`RecurringRegister.tsx:113`).
- **FR-4.2** Editing `amount` takes effect prospectively only; already-tagged
  historical transactions (`Transaction.recurring_item_id`) are never rewritten.
  The edit sheet states this in one line.
- **FR-4.3** Delete stays a tombstone (`recurringRepo.remove`, already correct)
  and keeps the existing "linked payment history stays intact" promise.
  Confirmation moves from `window.confirm` to the app's shared confirm pattern
  (see `BACKLOG.md` S3).
- **FR-4.4** New AI tools `update_recurring_item` and `delete_recurring_item`,
  both behind the existing confirm-card + `AiOperation` idempotency path.

### L1.5 — Weekly & workday balance CRUD

- **FR-5.1** `AllowanceEditor` is extended from two blind number inputs into a
  **derived preview**: entering `monthly_amount` and `weekend_allocation` shows
  the resulting `weekPool` and `todayCeiling` live, using
  `computeSafeToSpend()` — the user edits the input they understand and sees the
  number they actually live by.
- **FR-5.2** The user may instead enter the **weekly pool** directly; the
  monthly amount is back-solved (`monthly = weekly × weeksInMonth(currentMonth)
  + weekend_allocation`) and stored — storage stays monthly, so there is exactly
  one stored representation and `computeSafeToSpend` is untouched.
- **FR-5.3** Allowance changes are recorded in **`allowanceHistory`** (previous
  monthly/weekend, new monthly/weekend, author, timestamp) and surfaced as
  "Changed from Rp X on <date>". `Allowance` currently keeps only `updated_at`
  and no prior value.
- **FR-5.4** ~~Per-week override~~ — **cut (D4)**. A weekly figure typed here
  changes the standing allowance for every week, not just this one. If a
  travel-week adjustment is requested later, it comes back as its own ticket
  with a `weeklyOverrides` table and an optional `weekPoolOverride` parameter on
  `computeSafeToSpend`.

### Cross-cutting

- **FR-6.1** Every mutating action in L1 is available to both the human UI and
  the AI chat, and both write through the **same repository functions**.
- **FR-6.2** Every destructive action (delete, revert, restore) is confirmed
  with an explicit two-step affordance, never `window.confirm`.

---

## 4. Non-functional requirements (NFR)

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | A correction commits and the UI reflects it in **<150 ms** on a mid-range Android device. `deriveBalance` is O(accounts × transactions); with correction history added, `useAccountBalances` must not regress — re-measure at 10k transactions and index `balanceCorrections.account_id`. |
| NFR-2 | Offline-first | All L1 writes succeed offline against Dexie and reconcile via the existing watermark sync. No L1 action may require connectivity. |
| NFR-3 | Sync correctness | All new numeric fields are added to the numeric-coercion allowlist in `src/lib/syncMappers.ts` (same class of bug as commit `98236bf`). All new deletes are tombstones (SR-9). |
| NFR-4 | Data integrity | No L1 operation may leave a dangling reference: transactions must never point at a deleted account; recurring tags must survive item deletion. |
| NFR-5 | Auditability | Correction/allowance history is append-only. No UI path may edit or delete a history row (only append a reverting row). Retain indefinitely. |
| NFR-6 | Accessibility | All new controls ≥44×44px hit area, labelled for screen readers, and colour is never the sole carrier of the "stale"/"adjusted" state. |
| NFR-7 | Consistency | Zero raw hex/px literals; all new UI composed from `src/components/ui/*` primitives; `node scripts/check-style-tokens.mjs` baseline must not regress. |
| NFR-8 | Localisation | All new copy passes through the i18n layer with EN + ID strings; IDR formatting via `formatRp`/`formatRpFull`; numeric input via `parseRpInput` only (never bare `.replace(/[.,]/g,'')` — that is the T5 decimal hazard, still live in `AllowanceEditor.tsx:22-23`, `AccountForm.tsx:50`, and `IncomeLog.tsx:185`). |
| NFR-9 | Testability | Engine-level behavior (correction ≠ spend) is covered by pure unit tests, not UI tests. |
| NFR-10 | Reversibility | Every L1 write is undoable within the session for at least the most recent action per object. |

---

## 5. Transition requirements (TR)

| ID | Requirement |
|---|---|
| TR-1 | **Schema migration (local, Dexie):** bump the version; add `Transaction.is_adjustment` (default `false`), `Asset.deleted_at`, and the `balanceCorrections` + `allowanceHistory` stores. Additive only. |
| TR-2 | **Schema migration (Supabase):** `transactions.is_adjustment boolean not null default false`; `assets.deleted_at`; two audit tables with RLS by `household_id`/`member_id` mirroring existing tables. |
| TR-3 | **Legacy rows carry `undefined`, not `false`.** Rows written before the column existed (cloud pulls from another device, restored pre-field backups) arrive with `is_adjustment === undefined`. Every consumer must test truthiness, never `=== false` — the exact convention already used for `recurring_item_id` (`safeToSpend.ts:19-22`). No backfill. |
| TR-4 | **Backfill (optional, one-time):** for accounts carrying a `manual_balance_override` from onboarding, seed one `balanceCorrections` row from `last_balance_updated_at` labelled "Set during setup", so the history list is not empty on first open. No transaction is generated for it. |
| TR-5 | **Rollback:** degrades safely. If the release is reverted, adjustment transactions remain ordinary transactions — balances stay correct, they simply start counting as spending again. Note this in the release checklist; it is the one thing a rollback does *not* leave untouched. |
| TR-6 | **Backup/restore parity:** `RestoreBackup.tsx` and the export path must include the new tables; a backup taken pre-release must restore cleanly post-release (missing tables treated as empty). |
| TR-7 | **AI context:** `src/ai/context.ts` must list current balances *with their as-of dates* so the model never quotes a stale corrected balance as live. |
| TR-8 | **Docs:** update `BACKLOG.md` (add §D — Ledger Control), `REQUIREMENTS.md`, and the AI tool inventory in `ARCHITECTURE.md`. |
| TR-9 | **No user training required** — if the feature needs an explainer beyond one line of inline copy, the design is wrong (see §8). |

---

## 6. Dependencies

**Internal (code):**
- `src/engine/safeToSpend.ts` — **`isWeekDraw()` gains one clause**
  (`!t.is_adjustment`). This is the single highest-leverage line in L1: it is
  shared by the UI hook, `dailyLeftover.ts`, the AI context builder and
  `check_affordability`, so fixing it there fixes every consumer at once. No
  signature changes anywhere in the engine.
- `src/features/report/categoryBreakdown.ts` + Report actuals — second and third
  exclusion sites (FR-1.5). Grep for every `direction === 'out'` aggregation
  before assuming there are only three.
- `src/lib/balances.ts` (`deriveBalance`) — **unchanged**. Adjustment
  transactions flow through it as ordinary rows, which is the point.
- `src/features/today/TransactionForm.tsx` — edit/delete/categorise an
  adjustment (FR-1.9, FR-1.10).
- `src/db/db.ts` — Dexie version bump; `src/db/types.ts` — `is_adjustment`,
  `Asset.deleted_at`, two audit interfaces.
- `src/db/repositories/{accounts,assets,incomeEvents,recurringItems,allowance,transactions}.repo.ts`.
- `src/lib/syncMappers.ts` — boolean coercion for `is_adjustment` + new table
  mappings (NFR-3).
- `src/ai/tools.ts`, `src/ai/context.ts` — tool parity (SR-7, TR-7).
- `src/components/ui/*` primitives (Phase 2, PR #14) — **hard dependency** for
  NFR-7.
- `src/lib/currency.ts` `parseRpInput` — must be fixed/confirmed decimal-safe
  before L1 reuses it broadly (`PAIN-POINTS.md` T5).

**Sequencing against `BACKLOG.md`:**
- **Depends on:** PR #14 (primitives) merged.
- **Collides with:** §B1 (Assets screen migration) and §B4 (More sheets,
  including `AllowanceEditor`) touch the same files. **Recommendation:** land
  B1/B4 first (pure restyle), then L1 on top — or fold L1.1/L1.2 into B1 and
  L1.5 into B4 and drop the separate tickets. Do not run them in parallel.
- **Independent of:** Phase 3, §C1, §B2/B3/B5/B6.

**External:** Supabase project `lanvhaliejwuazqerbvp` (migrations + RLS). No new
npm dependencies — everything here is Dexie + existing primitives.

**Organizational:** household partner (second test account) needed to validate
BR-4/SR-6 attribution.

---

## 7. Edge cases

**Balance correction (transaction model)**
1. **Backdated correction.** As-of date in the past: the adjustment lands on
   that date, and every transaction after it still applies on top — so the
   *current* balance ends up at `actual + (sum of txns after the as-of date)`,
   not at `actual`. The preview must show that resulting figure, not just the
   entered one, or the user will be surprised twice.
2. **Correction dated on or before an existing `manual_balance_override`
   anchor.** `deriveBalance` skips every transaction with `t.date <= anchorDay`
   — an adjustment dated inside the onboarding anchor window is **silently
   discarded**. Requirement: reject (or forward-date) an as-of date that is not
   strictly after `last_balance_updated_at`, and say why. This interaction
   between D1 and D2 is the single most likely bug in L1.
3. **Future-dated correction.** Rejected (FR-1.2).
4. **Delta of zero.** No-op; write neither a transaction nor a history row.
5. **Correction into a negative balance.** Allowed (credit/debt accounts). No
   clamping.
6. **Correction on an account whose balance is 0 because it was never set up.**
   The adjustment does the right thing (0 → actual), so onboarding's opening
   balance and a first correction converge on the same result. Both paths must
   not be run for the same account on the same day (edge case 2).
7. **Two devices correct the same account offline.** Both adjustments are
   independent transactions and **both apply** — the balance ends up wrong by
   the amount of the duplicate. Unlike a last-write-wins overwrite, this cannot
   silently resolve itself. Requirement: on sync, detect two adjustments on the
   same account with the same as-of date and surface a "duplicate correction?"
   prompt. Do not auto-merge.
8. **Correction + later import.** A statement import inserting transactions
   dated *after* the correction moves the balance normally (correct). Rows dated
   *before* it also apply, which double-counts what the correction already
   absorbed. Reconcile must warn when importing rows that predate the most
   recent correction on the target account.
9. **Transfers.** An adjustment is never part of a transfer pair
   (`is_transfer: false`, `transfer_pair_id: null`), even when the user is in
   fact correcting for an unlogged transfer.
10. **Pass-through lane accounts.** Excluded from net worth; the adjustment
    inherits the account's lane, so this holds without special-casing.
11. **Deleting an account that has corrections.** Blocked while transactions
    exist (D5) — and its adjustments *are* transactions, so the "move
    transactions" path must move them too, or the account can never be deleted.
12. **Categorising an adjustment (FR-1.10) dated in the current week** turns it
    into a live pool draw and can push safe-to-spend negative on the spot. Warn
    before committing, and never do it silently.
13. **An adjustment with `amount` larger than every other transaction combined**
    — legitimate (first correction on a long-unused account). No cap, but the
    confirm copy should restate the figure in full.

**Income**
14. Editing an event's **date** can reorder the series → `delta_vs_prev` must be
    recomputed for the moved row *and* both old and new neighbours.
15. Editing the **only** income event: `delta_vs_prev` stays `null`.
16. Two income events on the same date: sort must be stable
    (`date`, then `created_at`) or "latest salary" flips randomly.
17. Editing an event that was `source: 'seed'` (from onboarding) — allowed;
    flip `source` to `'manual'`.

**Recurring**
18. `end_date` set to the past → item must be treated as inactive by
    `getActive()`, which today filters on `is_active` only. Either enforce on
    write (auto-deactivate) or extend the filter; pick one and test it.
19. `next_due` in the past → the item is overdue; do not silently roll it
    forward.
20. Changing `kind` (e.g. `personal_sub` → `pay_yourself_first`) changes lane
    *and* changes safe-to-spend classification for future draws. Warn.
21. Deleting a recurring item that historical transactions reference: those
    transactions keep `recurring_item_id` pointing at a tombstoned row and must
    still be excluded from the personal pool (`isWeekDraw` checks truthiness
    only — this already holds; add a regression test).

**Allowance**
22. `monthly_amount = 0` → `computeSafeToSpend` returns `null` (null state). The
    derived preview must render the null state, not "Rp 0 today", which reads as
    a real ceiling.
23. `weekend_allocation > monthly_amount` → `isNegativePool`, `weekPool = 0`.
    Validation warning at entry, not a silently broken gauge.
24. Weekly-figure entry (FR-5.2) back-solves with `weeksInMonth(currentMonth)`,
    which varies 4–5 by month. Typing "Rp 500.000/week" in a 5-week month and a
    4-week month stores different monthly amounts. State the resulting monthly
    figure before saving.
25. Rounding: `weekPool` uses `Math.floor` (`safeToSpend.ts:81`). Back-solving
    weekly → monthly → weekly must not drift the displayed weekly figure away
    from what the user typed by more than the floor remainder; show the stored
    monthly amount as the source of truth.
26. Editing the allowance mid-month: no retroactive rewrite (documented behavior
    in `dailyLeftover.ts:33-36`) — the daily leftover ledger jumps. Warn once.
27. Timezone: all dates are `YYYY-MM-DD` local strings compared
    lexicographically. Never introduce `Date` arithmetic into L1 paths.

**General**
28. Rapid double-tap on save → idempotency (the `AiOperation` pattern for chat;
    a disabled-while-saving guard for UI).
29. Restoring a backup taken before this release (TR-6) — legacy rows arrive
    without `is_adjustment` (TR-3).
30. Very large numbers (Rp 999.999.999.999) must not overflow layout or
    `formatRp`.

---

## 8. UX / UI design

**Principle:** the correction is the *fastest* path, not a buried admin
function. The user is standing at a cashier comparing a wallet to a screen.

**Entry points (3, all leading to one sheet):**
1. Assets screen → account row → edit sheet → **"Set true balance"** (primary).
2. Long-press an account balance anywhere it is displayed (Assets, wallet
   picker, Today's standing strip) → same sheet. Reuses `useLongPress`.
3. Chat: "my BCA is actually 412 ribu" → confirm card → same repository call.

**The sheet — `BottomSheet`, ~55dvh, three fields, one button:**

```
┌──────────────────────────────┐
│  Set true balance            │
│  BCA Tabungan                │
│                              │
│  App shows      Rp 690.000   │
│                              │
│  Actual balance              │
│  ┌────────────────────────┐  │
│  │ Rp 412.000             │  │  ← numeric keypad, autofocus
│  └────────────────────────┘  │
│                              │
│  Difference     −Rp 278.000  │  ← amber, live
│  Logged as a correction.     │  ← caption, always visible
│  Not counted as spending.    │
│                              │
│  As of   [ 2026-07-31 ▾ ]    │  ← native date input, max=today
│  Note (optional)             │
│  ┌────────────────────────┐  │
│  │ Forgot what I spent on │  │
│  └────────────────────────┘  │
│                              │
│  [   Set balance   ]         │
│                              │
│  Correction history      ▸   │  ← collapsed, 0 rows hides it
└──────────────────────────────┘
```

- **No category picker. No "what was this?" field. No required note.** The whole
  point of the pain point is that the user *does not know*. Asking is the bug.
- **Delta is informational, never a form field.** The user types the truth; the
  app computes the gap.
- **Primitives only:** `Screen`/`Card`/`Row`/`StatTile`/`Amount`/
  `SectionHeader`/`Icon` (`BACKLOG.md` §B convention). Amber = attention token,
  never a raw hex.
- **Post-save feedback:** sheet closes, the account row's number animates to the
  new value, and an inline caption reads "as of today". No toast, no modal.
- **The correction in the transaction list.** It appears like any other row but
  reads as bookkeeping, not spending: a distinct icon (a small `±` or scales
  glyph, added to `src/components/ui/icons/paths.tsx`), title "Balance
  correction", caption "Correction · not counted as spending", and the amount in
  the muted ink token rather than the spend colour. Tapping it opens
  `TransactionForm` where it can be edited, deleted, or — the whole reason for
  D1 — **categorised once the user remembers** ("It was groceries"), which
  converts it into an ordinary transaction (FR-1.10) behind an explicit warning.
- **Stale treatment:** last correction older than 30 days → the "as of" caption
  gains a muted dot and the row taps straight into the correction sheet.
- **Correction history:** collapsed `Row` list — `primary` = new balance,
  `caption` = "was Rp X · <author> · <date>", `right` = the delta. Most recent
  row carries an "Undo" affordance (FR-1.9).
- **Assets:** identical sheet, relabelled "Update value" (`last_valued_at`
  replaces `last_balance_updated_at`). Auto-priced assets show a lock with
  "Switch to manual value" rather than a disabled field with no explanation.
- **Allowance editor (L1.5):** two inputs stay, plus a live derived block —
  "This week: Rp 480.000 · Today: Rp 96.000 across 5 workdays" — and a
  segmented control `Monthly | Weekly` choosing which figure you type. Typing
  the weekly figure shows the monthly amount it will store (edge case 24), since
  that is what is actually persisted. No per-week override (D4).
- **Delete vs deactivate:** two visually distinct buttons — `secondary`
  "Deactivate (hide, keep history)" and `danger` "Delete permanently". Never
  the same colour, never adjacent without a gap.
- **Empty states:** "No corrections yet — the balance is derived from your
  transactions."

---

## 9. Copywriting

**Voice:** Calm Ledger — plain, non-judgmental, never implies the user was
careless. The user already feels bad about not remembering.

| Surface | Copy |
|---|---|
| Action label | **Set true balance** (not "Adjust", not "Override", not "Reconcile") |
| Sheet title | Set true balance |
| Current-value label | App shows |
| Input label | Actual balance |
| Delta caption (negative) | **Not counted as spending.** Saved as a correction in your history. |
| Delta caption (positive) | **Not counted as income.** Saved as a correction in your history. |
| As-of helper | Transactions after this date will still be added on top. |
| Backdated result (edge case 1) | After the transactions you logged since then, your balance will show Rp 388.000. |
| Blocked as-of date (edge case 2) | Pick a date after 12 Jul — that's when this account's starting balance was set. |
| Note placeholder | Optional — e.g. "cash I forgot to log" |
| Primary button | Set balance |
| Success (inline) | Balance set. As of today. |
| Correction row title (in history) | Balance correction |
| Correction row caption | Correction · not counted as spending |
| Categorise prompt (FR-1.10) | Remembered what this was? Give it a category. |
| Categorise warning (current week) | This becomes ordinary spending and will come out of this week's Rp 480.000. |
| Duplicate correction (edge case 7) | Two corrections on this account for 31 Jul. Keep both, or remove one? |
| History header | Correction history |
| History row | Rp 412.000 · was Rp 690.000 · Yuki · 31 Jul |
| Undo | Undo this correction |
| Stale badge | Last set 47 days ago |
| Asset variant | **Update value** / "What's it worth now?" |
| Auto-priced asset lock | Priced automatically from the gold spot rate. Switch to manual value to set it yourself. |
| Account delete confirm | Delete "BCA Tabungan"? This removes the account. Its 84 transactions stay in your history — move them to another account first, or deactivate instead. |
| Account deactivate | Deactivate — hides it from your totals and keeps every transaction. |
| Asset delete confirm | Delete "Antam 10g"? It leaves your net worth from today. Past net-worth snapshots are unchanged. |
| Recurring delete confirm | Delete "Claude Pro"? Payments you already logged for it stay exactly as they are. |
| Income edit warning | This is your current salary — your FI projection updates when you save. |
| Income delete (latest) | Deleting this leaves Rp 12.000.000/mo (Jan 2026) as your current salary. |
| Allowance derived preview | Rp 2.500.000/month → Rp 480.000 this week → Rp 96.000 today across 5 workdays. |
| Weekly entry helper (edge case 24) | Rp 500.000/week saves as Rp 2.800.000/month — this month has 4 weeks. |
| Allowance change note | Changed from Rp 2.200.000 on 14 Jul. |
| Validation — weekend > monthly | Weekend allocation can't be more than the monthly pool. |
| Validation — future date | Pick today or an earlier date. |
| Validation — empty amount | Enter the balance you actually have. |

**Indonesian (`id`) strings are required for every line above** (NFR-8);
"balance" → *saldo*, "Set true balance" → *"Perbaiki saldo"*.

**Banned words in *user-facing* copy:** override, reconcile, adjustment, plug,
journal, discrepancy, error, mistake. The user sees "correction"; the code and
this document say `is_adjustment` — that split is deliberate, keep it.

---

## 10. Security

| ID | Requirement |
|---|---|
| SEC-1 | **Authorization.** Both new tables (`balanceCorrections`, `allowanceHistory`) carry `household_id` and are protected by RLS identical to `accounts`/`allowance`. A member of household A can never read or write household B's corrections. |
| SEC-2 | **Attribution is server-derived.** `author_member_id` is set from the authenticated session server-side, never accepted from the client payload — otherwise a member can forge who made a correction (BR-4 becomes worthless). |
| SEC-3 | **Append-only history.** No `UPDATE`/`DELETE` grant on history tables for the client role; reverting appends. Prevents a member erasing evidence of a correction. |
| SEC-4 | **Local-at-rest.** Corrections and notes sit in IndexedDB unencrypted, same as the rest of the ledger. The PIN gate (`PinSetup.tsx`) is the only local control; a free-text note field is a new place users may paste sensitive detail. Placeholder copy must not invite account numbers, and the note is capped (e.g. 200 chars). |
| SEC-5 | **AI tool surface.** `update_account_balance` changes meaning under D1: it now *creates a transaction* rather than setting a field, and it becomes available for bank accounts. Both widen what a prompt-injected statement image could cause. Every balance/CRUD tool stays **confirmation-gated** through the existing `ConfirmCard` + `AiOperation` idempotency ledger; the confirm card must show **before → after and the delta**, not just the new figure. A tool result is never user authorization. Update the tool's description string too — it currently tells the model bank balances "cannot be set directly" (`src/ai/tools.ts:252`), which will be false. |
| SEC-5b | **`is_adjustment` is not model-settable.** `log_transactions` must never accept `is_adjustment` in its input schema — otherwise a model (or injected content) can write spending that is invisible to safe-to-spend. The flag is set only by the correction code path. |
| SEC-6 | **Injection via imported content.** Statement images and pasted text are untrusted data. The model must not be able to trigger a balance correction from content inside an import — only from an explicit user instruction in the chat turn. |
| SEC-7 | **Input validation at the boundary.** Amounts parsed with `parseRpInput` only; reject `NaN`, `Infinity`, and values beyond a sane bound before they reach Dexie or Supabase. Note fields are rendered as text, never as markdown/HTML (the chat markdown renderer must not be reused for user notes). |
| SEC-8 | **Deletion semantics.** Tombstones are not erasure. If a "delete my data" request ever needs to be honoured, tombstoned rows must be included in the hard-delete path — document this, do not build it now. |
| SEC-9 | **No secrets in history.** Correction notes and allowance history sync to Supabase like any other row; nothing in L1 introduces a new external egress point. |

---

## 11. Test plan

**Unit — engine/lib (`vitest`, pure, no DOM)**
1. `isWeekDraw()` returns `false` for `is_adjustment: true`, and **`true` for
   `is_adjustment: undefined`** (legacy rows, TR-3). Both directions.
2. `computeSafeToSpend` and `computeDailyLeftover` are **byte-identical** before
   and after inserting an arbitrary adjustment transaction — the BR-3 guard.
   Run it for an adjustment dated inside the current week, which is the case
   that would actually break.
3. `categoryBreakdown` and Report monthly actuals exclude adjustments.
4. `deriveBalance` **includes** adjustments (they are ordinary rows to it) and
   is unchanged for every existing case — run the existing suite untouched.
5. Delta arithmetic: `actual < derived` → `direction: 'out'`; `actual > derived`
   → `'in'`; equal → no transaction (edge case 4). Negative and zero targets.
6. An adjustment dated on/before an existing `manual_balance_override` anchor is
   rejected at the boundary, not silently swallowed (edge case 2). **This is the
   D1×D2 interaction test — name it in the report.**
7. Backdated adjustment: resulting current balance equals
   `actual + sum(txns after as-of date)` (edge case 1).
8. Categorising an adjustment (FR-1.10) clears `is_adjustment` and the same
   transaction now counts in `isWeekDraw` and in the category breakdown.
9. Weekly ↔ monthly back-solve (FR-5.2) round-trips within the `Math.floor`
   remainder, in both a 4-week and a 5-week month (edge cases 24, 25).
10. Income `delta_vs_prev` recomputation on edit, including a date move across
    neighbours and the single-event case.
11. `end_date` in the past excludes an item from `getActive()`.

**Repository / integration (Dexie, fake-indexeddb)**
12. A correction writes exactly one transaction **and** one `balanceCorrections`
    row referencing it by `transaction_id`.
13. Deleting the adjustment transaction reverses the balance and appends (never
    deletes) a reverting history row.
14. Undo from the history list produces the same end state as deleting the
    transaction directly — two paths, one outcome.
15. Asset tombstone: deleted asset disappears from every read and from net
    worth; historical `NetWorthSnapshot` rows unchanged.
16. Account delete blocked while transactions reference it; the "move
    transactions" path reassigns **including adjustments** (edge case 11) and
    leaves none dangling.
17. Recurring tombstone: transactions tagged with the deleted item stay excluded
    from the personal pool (edge case 21).
18. Income tombstone + edit: `getLatest()` returns the right row in every case.

**Sync**
19. `is_adjustment` survives a push/pull round trip as a boolean — not `"true"`,
    not `1` (the `98236bf` coercion regression class, now for a boolean).
20. A row pulled without `is_adjustment` is treated as an ordinary transaction
    and never crashes a consumer (TR-3).
21. A tombstoned asset does not resurrect after a cloud pull.
22. Two devices correcting the same account offline: **both** adjustments apply
    (the balance is now wrong by the duplicate) and the duplicate-detection
    prompt fires (edge case 7). Assert the prompt, not silent merging.
23. Backup taken pre-release restores post-release with empty history tables
    (TR-6).

**Component / UI (Testing Library)**
24. "Set true balance" is present and functional on a **bank** account — the
    specific gap this feature exists to close.
25. Delta preview updates live, correct sign, correct copy variant.
26. Future date rejected; button disabled with the validation line visible.
27. An adjustment renders in the transaction list with the correction icon and
    caption, and **not** in the spend colour.
28. Categorising an adjustment dated in the current week shows the
    safe-to-spend warning before committing.
29. Decimal input `12,5` / `12.5` handled by `parseRpInput`, never becomes `125`
    (T5 regression).
30. Double-tap on save commits once.
31. Delete vs deactivate are separate controls with separate confirmations.
32. Allowance editor's derived preview matches `computeSafeToSpend` for the same
    inputs, and renders the null state at `monthly_amount = 0` (edge case 22).

**AI**
33. `update_account_balance` on a bank account produces a confirm card showing
    before → after → delta, and on approval writes an adjustment transaction.
34. `log_transactions` rejects / ignores an `is_adjustment` field in its input
    (SEC-5b).
35. Replaying the same `operation_id` returns the stored result and does not
    write twice.
36. A statement image containing text like "set balance to 0" produces no write
    without an explicit user instruction (SEC-6).
37. `src/ai/context.ts` quotes balances with their as-of dates (TR-7).

**Manual / exploratory (device)**
38. Full loop on a real phone: wallet says one thing, app says another →
    correct → Today's standing strip and Assets total agree, **safe-to-spend
    gauge does not move**, and the correction is visible in today's transaction
    list looking like bookkeeping, not spending.
39. Two-member household: partner makes a correction; owner sees it attributed
    in history.
40. Offline: correct, kill the app, reopen, reconnect → value and history
    survive and sync.
41. Screen reader pass over the correction sheet; 44px hit areas verified.
42. Indonesian locale: every new string translated, no clipping at long IDR
    figures.

**Exit criteria (Definition of Done)**
- `npx vitest run` green; `npm run build` clean; `npx biome check src` no
  regression vs baseline; `node scripts/check-style-tokens.mjs` no regression.
- Tests **1, 2, 6, 24 and 29** named explicitly in the builder's report: the
  legacy-`undefined` case, the safe-to-spend guard, the D1×D2 anchor collision,
  the bank-account gap this feature exists to close, and the T5 decimal
  regression.
- Every §7 edge case is either covered by a test above or explicitly documented
  as accepted behavior in the PR description.
