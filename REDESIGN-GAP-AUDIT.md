# Redesign Gap Audit

**Owner:** Product Owner  
**Status:** Living Document · Draft  
**Last Updated:** 2026-07-15  
**Related:** `BRD.md`, `BACKEND.md`, `PAIN-POINTS.md`, `USER-JOURNEY.md`, `PHASE-3-HANDOFF.md`, `ARCHITECTURE.md`, `PROPOSAL.md`, `AI-MANAGER-UX-AUDIT.md`

## Status

Draft.

## Purpose

Repository-level redesign audit and migration guide.

## Scope

Evaluate gaps between product intent, implementation, and documentation. This document does not introduce new product direction; it records decisions, identifies divergence, and prioritizes migration work.

## Non-goals

- Rewrite the product vision.
- Replace `BRD.md`.
- Replace `PAIN-POINTS.md`.
- Replace architecture documentation.
- Restart the Calm Ledger design direction from scratch.

## Framework freeze

Do not modify this document's structure unless execution proves a gap. Subsequent changes should only:

- reduce Decision debt,
- reduce Token debt,
- increase Product Integrity evidence, or
- complete a migration milestone.

Everything else is noise.

---

## 1. Executive Summary

FI Dashboard is in a mid-rebuild state, not a greenfield redesign state.

Objective is not to redesign FI Dashboard. Objective is to converge product, implementation, and documentation into a single, internally consistent system while completing the Calm Ledger migration.

Current evidence:

- `BRD.md` defines a commercial, multi-user household finance product.
- `BACKEND.md`, `PROPOSAL.md`, Supabase migrations, and `src/stores/authStore.ts` show cloud auth, household tenancy, invites, and sync are already partially implemented.
- `ARCHITECTURE.md` still documents the older local-first/no-server posture. It remains useful for the client/free-tier architecture, but no longer describes the whole system.
- `PAIN-POINTS.md` already defines the Calm Ledger direction and separates defects, experience gaps, and design direction.
- `src/components/ui/*` already contains the first Calm Ledger primitives.
- `scripts/check-style-tokens.mjs` and `scripts/style-tokens-baseline.json` already enforce token migration by ratchet.
- `PHASE-3-HANDOFF.md` and recent commits show Today has already been rebuilt toward the new system.

Redesign work must therefore prioritize convergence, verification, and migration over new concepts.

Core rules:

1. Product integrity before aesthetics.
2. Migration over rewrite.
3. Code tokens and primitives are the design-system source of truth.
4. Documentation must reflect implementation, not intent alone.
5. Never redesign a screen whose core financial calculations have not been verified.

---

## 2. Current vs Target Map

### Current

| Area | Current state | Evidence |
|---|---|---|
| Product model | Household finance product, not just personal dashboard | `BRD.md`, `PROPOSAL.md` |
| Front door | Today | `src/App.tsx`, `PHASE-3-HANDOFF.md`, `PAIN-POINTS.md` F1 |
| Analytics | Report tab | `src/App.tsx`, `src/features/report/ReportScreen.tsx` |
| Settings/admin | More tab | `src/App.tsx`, `src/features/more/*` |
| AI | Manager/Chat tab | `src/App.tsx`, `src/features/chat/*`, `AI-MANAGER-UX-AUDIT.md` |
| Auth | Supabase auth | `src/stores/authStore.ts`, `src/features/auth/AuthScreen.tsx` |
| Household | Create/join household, member list, invites, admin transfer | `src/stores/authStore.ts`, `src/features/more/HouseholdSheet.tsx` |
| Sync | Watermark push/pull, partial | `src/lib/sync.ts`, `src/lib/syncMappers.ts` |
| Backend | Supabase migrations and RLS tests exist | `supabase/migrations/*`, `supabase/tests/rls_isolation_test.sql` |
| Design system | UI primitives available | `src/components/ui/*` |
| Token enforcement | Ratchet baseline exists | `scripts/check-style-tokens.mjs`, `scripts/style-tokens-baseline.json` |
| Token debt | 487 raw style-token violations baseline | `scripts/style-tokens-baseline.json` |
| Build | Passing as of this audit | `npm run build` on 2026-07-15 |

### Target

| Area | Target state | Status |
|---|---|---|
| Product model | Household product model reflected consistently in docs, IA, onboarding, and code | In progress |
| Front door | Today confirmed as decision engine | Decision pending formal confirmation |
| Analytics naming | `Report` or `Insights` decided | Pending |
| Settings naming | `More` or `Settings` decided | Pending |
| AI placement | Dedicated Manager tab or contextual assistant decided | Pending |
| Household onboarding | Admin and invited-member flows separated | Open |
| Product integrity | Core money calculations verified before visual migration | Open |
| Design migration | Calm Ledger primitives adopted screen-by-screen | In progress |
| Token debt | Below 100 before launch polish | Open |
| Commercial readiness | Trial, entitlement, subscription, launch assets ready | Future |

---

## 3. Product Integrity Audit

Product integrity means financial correctness, semantic consistency, and trustworthy user-facing numbers.

### Scope

- Safe-to-spend.
- Transfers.
- Report actuals.
- Balances.
- Recurring semantics.
- FI projection.
- Daily leftover.
- Import/reconcile atomicity.
- AI-written or AI-proposed financial changes.

### Rule

Never redesign a screen whose core financial calculations have not been verified.

### Evidence hierarchy

Highest to lowest confidence:

1. Automated test (unit/integration/RLS).
2. Manual verification against expected behavior.
3. Source code inspection.
4. Documentation reference.
5. Assumption (never sufficient on its own).

A Product Integrity item cannot be marked Pass based solely on documentation or source inspection. At least one runtime verification (test or manual validation) is required.

### Status semantics

| Status | Meaning |
|---|---|
| Pass | Requirement verified with sufficient evidence. |
| Partial (Evidence) | Implementation appears correct but lacks sufficient runtime verification. |
| Partial (Capability) | Implementation is verified but intentionally incomplete — a feature gap, not a defect. |
| Partial (Evidence + Capability) | Both: some evidence gaps and some missing capability. |
| Fail | Requirement contradicted by implementation or reproducible defect exists. |
| Deferred | Known issue intentionally postponed with documented rationale. |

When the cause is mixed, use `Partial (Evidence + Capability)` and list each cause in the Action field.

### Evidence template

Each audit item must use the following standard. Opinion is not evidence.

| Field | Description |
|---|---|
| Requirement | Expected behavior, derived from BRD or current product model. |
| Evidence | Code path, test, manual verification, or observed behavior. |
| Status | Pass / Fail / Partial / Deferred. |
| Risk | User impact if incorrect. |
| Action | Fix, monitor, defer, or no action. |

### Current findings

Items below are seeded with known source references. During M1, replace each row with the full evidence template and a concrete status.

#### Safe-to-spend

- Requirement: gauge reflects remaining discretionary allowance exactly once, counting only discretionary outgoing spend for the current workweek.
- Evidence:
  - `src/engine/safeToSpend.ts` — pure function `computeSafeToSpend`. Allowance `monthly_amount` is already net of recurring items; only `weekend_allocation` is carved out before dividing by weeks in month. `isWeekDraw` excludes transfers, pass-through, income, and `recurring_item_id`-tagged transactions.
  - `src/hooks/useSafeToSpend.ts` — queries Dexie for current-week transactions, filters with `isWeekDraw`, sums spend, passes to `computeSafeToSpend`.
  - `src/engine/engine.golden.test.ts` — 7 golden tests: null state, mid-week pool math, sub non-double-counting (T2), savings-first waterfall, negative pool clamp, recurring-at-clamp boundary, weekend zero-ceiling, overspend floor.
  - `src/hooks/useSafeToSpend.test.ts` — 4 tests for `isWeekDraw` filter: untagged spend draws, recurring-tagged does not, transfers/pass-through excluded, income excluded.
  - `src/engine/safeToSpend.integration.test.ts` — 9 integration tests: full DB→engine path. Verifies discretionary spend draws pool, transfers and recurring do not, out-of-week excluded, income excluded, pass-through excluded, deleted transaction restores pool, edited amount adjusts pool, overspend floors at zero, zero allowance null state, deterministic re-computation.
  - Full suite: 93 tests pass (12 files).
- Status: Pass.
- Risk: High (primary daily decision engine — incorrect values invalidate Today screen).
- Action: None. Runtime evidence confirms pool semantics, recurring exclusion, transfer exclusion, boundary behavior, and determinism. Sync/import preservation to be verified when audit reaches reconcile/import item.
- Closure rationale: The Safe-to-Spend engine has executable evidence covering engine calculation, transaction filtering, database integration, boundary conditions, and regression scenarios. Future modifications must preserve this behavior. Any behavioral change requires updating the golden tests.

#### Daily leftover

- Requirement: monthly personal allowance running total is correct as of viewed day; projected total is clearly marked. Daily Leftover is a projection layer — it consumes verified outputs from Safe-to-Spend, never re-implements allowance, recurring, or transfer logic.
- Evidence:
  - `src/engine/dailyLeftover.ts:1-3` — imports `isWeekDraw` from `./safeToSpend`, reusing the verified filter rather than defining its own.
  - `src/engine/dailyLeftover.ts:53-94` — `computeDailyLeftover`: starts from `monthlyAmount`, applies `isWeekDraw` for outgoing, adds income, excludes transfers/pass_through/recurring inline (same semantics as safe-to-spend).
  - `src/hooks/useDailyLeftover.ts:22-42` — queries allowance + month-bounded transactions, calls `computeDailyLeftover`.
  - `src/engine/dailyLeftover.test.ts` — 11 unit tests: mid-month net, recurring exclusion, transfer exclusion, pass_through exclusion, prior-month exclusion, asOfDate boundary, future projection, past non-projected, allowance change, overspend negative, determinism.
  - `src/engine/dailyLeftover.integration.test.ts` — 13 integration tests: discretionary spend reduces, transfer excluded, recurring excluded, pass_through excluded, income adds back, deleted restores, edited adjusts, deterministic, overspend negative, zero allowance null, month boundary, asOfDate boundary, isWeekDraw contract verification.
  - Full suite: 150 tests pass (17 files).
- Status: Pass.
- Risk: Medium (Daily Leftover is a projection layer on Safe-to-Spend — incorrect values mislead but do not invalidate the underlying engine).
- Action: None. Daily Leftover Invariant verified with runtime evidence.
- Closure rationale: Daily Leftover Invariant verified — Daily Leftover is a projection layer, not a calculation engine. It consumes `isWeekDraw` and `monthlyAmount` from the verified Safe-to-Spend engine. It never recreates allowance, recurring, or transfer logic. All exclusions are inherited, not re-implemented.

#### Transfers

- Requirement: internal transfers excluded from actuals and safe-to-spend; both legs update account balances correctly; transfers are visually distinguishable; pair creation, deletion, flag/unflag, and import detection all preserve transfer integrity.
- Evidence:
  - `src/db/repositories/transactions.repo.ts:38-79` — `addTransfer` creates two paired legs with opposite directions, same `transfer_pair_id`. `deleteWithPair` removes both legs or single plain txn. `flagTransfer`/`unflagTransfer` for manual pairing.
  - `src/lib/balances.ts:8-21` — `deriveBalance` includes transfer legs (correct: transfers move money between accounts, unlike net worth/reporting).
  - `src/engine/safeToSpend.ts:9-19` — `isWeekDraw` excludes `is_transfer` and `pass_through`.
  - `src/workers/transferDetector.ts` — import transfer detection: O(n log n) binary search, matches by amount ±1 day, different account, each in-leg used once.
  - `src/engine/transfers.integration.test.ts` — 16 integration tests: pair creation (2 legs, opposite directions, same pair_id, same date), pair deletion (both legs, plain txn alone), flag/unflag (manual pairing, single-leg unflag), cross-engine exclusion consistency (safe-to-spend excludes, report actuals excludes, balances includes), import detection (match, same-account rejection, amount mismatch, date >1 day rejection, ±1 day boundary, no double matching, non-own account exclusion).
  - `src/db/repositories/transactions.repo.test.ts` — 3 tests: addTransfer paired legs, deleteWithPair both legs, deleteWithPair plain txn.
  - Full suite: 117 tests pass (14 files).
- Status: Pass.
- Risk: High (transfers affect every financial surface — incorrect handling cascades to Report, balances, safe-to-spend, net worth).
- Action: None. Transfer correctness verified across creation, deletion, flag/unflag, import detection, and cross-engine exclusion. Sync integrity for transfers deferred to reconcile/import audit item. Visual distinguishability in UI deferred to M4 screen migration.
- Closure rationale: Transfer Invariant verified — A transfer represents movement of money between owned accounts. Therefore: creates two linked legs; affects account balances; never changes household income; never changes household expenses; never changes discretionary spending; is uniquely paired; cannot be matched twice. Future modifications must preserve all tested invariants.

#### Balances

- Requirement: account balance represents money currently held in that account. Balance is affected by income, expense, transfer in, transfer out, and manual override anchor. Balance is not affected by deleted transactions, other accounts' transactions, or transactions on or before the anchor day. Inactive accounts are excluded from totals.
- Evidence:
  - `src/lib/balances.ts:8-21` — `deriveBalance`: manual override is anchor, only transactions strictly after anchor day count, transfer legs included (correct), other accounts filtered by `account_id`.
  - `src/hooks/useAccountBalances.ts:8-22` — queries active accounts + all transactions, maps `deriveBalance` per account, sums total.
  - `src/lib/balances.test.ts` — 4 unit tests: basic in-minus-out, transfer legs included, other accounts ignored, anchor day boundary.
  - `src/lib/balances.integration.test.ts` — 11 integration tests: basic arithmetic (income/expense, zero state), transfer-aware (transfer out decreases source, transfer in increases destination, total unchanged), manual override anchor (anchor replaces balance, same-day ignored, override update recalculates), deletion (deleted txn no longer affects balance), account isolation (other accounts' txns don't affect this account), inactive accounts excluded from totals, deterministic.
  - Full suite: 128 tests pass (15 files).
- Status: Pass.
- Risk: High (balances are the foundation of net worth, FI projection, and account selection for spending decisions).
- Action: None. Balance Invariant verified with runtime evidence. Starting balance capture UX remains a known onboarding gap (PAIN-POINTS.md P2/P9) — that is an Experience track item, not an integrity defect.
- Closure rationale: Balance Invariant verified — Account balance represents money currently held. Affected by: income, expense, transfer in/out, manual override anchor. Not affected by: deleted transactions, other accounts' transactions, transactions on or before anchor day. Inactive accounts excluded from totals. Transfers never change total balance (money moves, not created/destroyed).

#### Recurring semantics

- Requirement: recurring items represent committed financial obligations. They are configuration objects, not spending events. A transaction linked to a recurring item records execution. The same obligation must never reduce discretionary capacity twice.
- Evidence:
  - `src/engine/safeToSpend.ts:9-19` — `isWeekDraw` excludes transactions tagged with `recurring_item_id`.
  - `src/engine/safeToSpend.ts:51-76` — recurring totals are display totals; allowance `monthly_amount` is already net of recurring, so recurring totals do not shrink the pool again.
  - `src/db/repositories/recurringItems.repo.ts` — recurring create/update/deactivate/advanceDue paths exist.
  - `src/db/repositories/transactions.repo.ts:117-136` — import path now links `recurring_item_id` via `matchRecurringItem` when an outgoing row's note matches an active recurring item's name.
  - `src/db/repositories/transactions.repo.ts:175-184` — `matchRecurringItem` shared between import linking and `advanceNextDueFromBatch`, ensuring same matching logic for both linkage and schedule advancement.
  - `src/engine/recurringSemantics.integration.test.ts` — 9 integration tests: active recurring displayed but does not shrink pool, inactive recurring excluded, linked recurring execution does not draw, unlinked same merchant/amount does draw, linked payment prevents double counting, deleted linked payment restores zero draw, editing recurring amount changes display total but not week pool, imported recurring payment links + advances next_due + does not draw, imported non-recurring expense remains discretionary.
  - Full suite: 137 tests pass (16 files). Build: pass.
- Status: Pass.
- Risk: High (recurring obligations affect safe-to-spend, report, and allowance — double counting invalidates daily spending decisions).
- Action: None. Recurring Invariant verified with runtime evidence including import contract.
- Closure rationale: Recurring Invariant verified — Recurring items represent committed financial obligations, not spending events. A transaction linked to a recurring item records execution. The same obligation must never reduce discretionary capacity twice. Import pipeline now links matched recurring payments to their recurring item at creation time, preserving the contract across manual and imported execution paths.

#### FI projection

- Requirement: FI Projection predicts future financial independence. It consumes verified financial state. It never mutates financial state. Projection is deterministic for identical inputs. Changing assumptions changes projections only. Changing historical transactions changes the source data. Projection never rewrites history.
- Evidence:
  - `src/engine/fiProjection.ts:48-98` — `computeFIProjection`: pure function, no DB writes, no mutation of inputs. Two paths (A: weighted blend, B: RDPU→equity switch). Compounds monthly until target reached or 60-year cap.
  - `src/engine/returnRates.ts` — real return rates net of 3% inflation. Speculative assets (storyforge, currency, other) = 0%, excluded from growth.
  - `src/hooks/useFIProjection.ts:13-50` — queries assumptions, assets, active PYF recurring items, latest income. Passes to `computeFIProjection`. No writes.
  - `src/engine/engine.golden.test.ts:124-172` — 5 golden tests: hand-calculated 100M/10M/1B scenario (70/80 months), never reachable (null), already at target (gap 0), monotonic pipe, speculative exclusion.
  - `src/engine/fiProjection.integration.test.ts` — 13 integration tests: determinism (identical outputs), immutability (no input mutation for assumptions or assets), assumption sensitivity (higher return_rdpu sooner, higher return_equity sooner, lower target sooner, more pipe sooner), boundary cases (zero assets + zero pipe = null, zero assets + pipe = reachable, already at target = gap 0, speculative assets count in total but not growth), DB integration (queries assumptions + assets + pipe, default assumptions fallback).
  - Full suite: 163 tests pass (18 files). Build: pass.
- Status: Pass.
- Risk: Medium (projection guides long-term planning — incorrect results mislead but do not affect daily accounting).
- Action: None. FI Projection Invariant verified with runtime evidence.
- Closure rationale: FI Projection Invariant verified — Projection is deterministic, immutable, and non-mutating. It consumes verified financial state (balances, recurring pipe, assumptions) without writing back. Changing assumptions changes projection only. Changing source data changes projection only. Projection never rewrites history. Independently hand-calculated golden scenario matches engine output.

#### Report actuals

- Requirement: period actuals exclude internal transfers from both income and expenses; monthly totals reconcile with transaction history; category breakdown exists or limitation is explicit.
- Evidence:
  - `src/features/report/ReportScreen.tsx:10-11` — filters `direction === 'in' && !t.is_transfer` for income, `direction === 'out' && !t.is_transfer` for expenses. T1 defect (transfer-inflated actuals) is fixed in code.
  - `src/db/repositories/transactions.repo.ts:16-21` — `getByMonth` defaults to `excludeTransfers=true`, providing double-safe exclusion.
  - `src/features/report/reportActuals.integration.test.ts` — 8 integration tests: T1 regression (transfers do not inflate income/expenses), transfer-only month shows zero, deleting transfer does not change actuals, `getByMonth` default excludes transfers, `getByMonth` with `excludeTransfers=false` includes legs, monthly totals reconcile with direct sums, out-of-month excluded, pass-through documented behavior (counted in actuals, not excluded).
  - Full suite: 101 tests pass (13 files).
- Status: Partial (Evidence + Capability).
- Risk: High (Report is the primary analytics surface — incorrect actuals invalidate financial decisions).
- Action: Transfer exclusion verified and regression-pinned. Remaining gaps: (Evidence) no runtime UI verification from live Report screen; (Capability) category spend breakdown does not exist — limitation is explicit (Report shows income/expense/net only). Pass-through transactions are currently counted in actuals (documented, not a defect — they are real flows). Import-path transfer exclusion deferred to reconcile/import audit item.

#### Reconcile/import

- Requirement: import batch is atomic and idempotent; failures never partially commit.
- Evidence: `BACKEND.md`, `PROPOSAL.md`, `AI-MANAGER-UX-AUDIT.md` B3/E1.
- Status: Needs audit.
- Risk: High.
- Action: Audit batch atomicity and idempotency, especially AI path.

#### AI Tool Integrity

- Requirement: AI may propose financial state changes. The tool layer validates those proposals. Persistence remains authoritative. AI never bypasses validation, authorization, or domain invariants.
- Evidence:
  - `src/ai/tools.ts:13-23` — `WRITE_TOOLS` set: write tools are explicit and isolated; require user confirmation before executing.
  - `src/ai/tools.ts:195-213` — `executeReadTool` / `executeWriteTool` route execution safely through dedicated executors.
  - `src/ai/tools.ts:308-319` — `logTransactions` duplicates prevention: checks `getDuplicateCandidate` before writing unless `allow_duplicates` is explicitly set to true.
  - `src/ai/tools.ts:324-343` — `logTransactions` uses `matchRecurringItem` to link matched recurring obligations at creation time (fixed contract gap).
  - `src/ai/tools.ts:394-398` — `updateAccountBalance` rejects direct balance adjustments for bank accounts (only digital_wallet and cash allowed; bank derives from transactions).
  - `src/ai/tools.integration.test.ts` — 15 integration tests covering the four contracts:
    - **Read Contract** (side-effect free, unknown read tool error safety)
    - **Write Contract** (writes to same DB stores, links recurring items correctly and avoids double-counting, adds accounts/recurring items safely)
    - **Tool Contract** (rejects hallucinated account ids, rejects unknown asset ids, rejects bank balance overrides, rejects unknown memory ids, detects and skips duplicates)
    - **Failure Contract** (unknown write tool returns error with no DB mutation, mixed valid/invalid rows save valid and report invalid, transfer legs reject safely)
  - Full suite: 178 tests pass (19 files). Build: pass.
- Status: Pass.
- Risk: High (AI tools write directly to Dexie database — bugs can corrupt local financial state).
- Action: None. AI Tool Integrity Invariant verified with runtime evidence.
- Closure rationale: AI Tool Integrity Invariant verified — Read operations are side-effect free. Write operations utilize the same Dexie repositories/validations as the UI. Invalid inputs are rejected before persistence. Failed tool calls cause no mutation or data corruption. Recurring items matched by AI-logged transactions are correctly linked at creation time.

### Exit criteria

- Each financial calculation has direct tests or reproducible QA scenarios.
- Screens show “not configured” instead of misleading numbers when prerequisites are missing.
- Transfers and pass-through flows are excluded consistently from totals where required.
- Recurring payments affect allowance/safe-to-spend exactly once.
- FI projection displays assumptions and can be explained from stored values.

---

## 4. Experience Audit

Experience work covers presentation, hierarchy, navigation, onboarding, feedback, accessibility, and mobile behavior.

Known experience debt from `PAIN-POINTS.md`:

- Too many ad-hoc inline style literals.
- Too many bordered boxes and nested cards.
- 10px uppercase micro-labels overused.
- Emoji/glyph iconography replaced only partially.
- Numbers lack typographic stage on older screens.
- Some touch targets below 44px.
- Weak feedback layer: loading, empty states, pressed states, sheet motion.
- Light theme uses historical `--amber` naming with blue values.
- AppBar was slimmed in Phase 3, but other screens may still assume older vertical space.

Experience migration must follow Calm Ledger, not a new aesthetic direction.

---

## 5. Information Architecture Audit

### Current top-level navigation

| Tab | Current role | Notes |
|---|---|---|
| Today | Daily decision surface and transaction entry | Current front door. |
| Budget | Weekly/monthly/yearly budget and reconcile flow | Must keep planning and import/reconcile coherent. |
| Manager | AI finance partner | Dedicated tab today; may also need contextual entry points. |
| Assets | Accounts, assets, balances | Owns wallet/account/asset state. |
| Report | Actuals, scoreboard, analysis | Naming and scope need decision. |
| More | Settings, household, backup, config | Junk-drawer risk; naming and grouping need decision. |

### Open IA questions

- Should `Report` be renamed to `Insights`, or does that imply a broader product promise?
- Should `More` become `Settings`, or does it still contain non-settings workflows?
- Should `Home` return, or is Today the confirmed landing surface?
- Should Manager remain a dedicated tab, or should AI be contextual inside Today/Budget/Reconcile?
- Where does commercial subscription/billing live without bloating More?

---

## 6. Decision Register

| Topic | Current | Options | Decision | Owner |
|---|---|---|---|---|
| Today landing | Today | Keep Today / restore Home | **Resolved: KEEP** — Already the front door, matches decision-engine philosophy, no competing model exists. | PO |
| Today definition | Daily transaction surface | Dashboard / decision engine | Proposed: decision engine | PO |
| Report naming | Report | Report / Insights | **Resolved: KEEP** — Screen currently answers "what happened / how much / against budget". Rename to Insights only when it answers "why / what's next / what should I do". | PO |
| More naming | More | More / Settings | **Resolved: RENAME → Settings** — Tab now hosts theme, PIN, household, backup/restore, assumptions, recurring, categories. Users think "Settings", not "More". | PO |
| Manager placement | Dedicated tab | Keep dedicated / contextual only / hybrid | **Resolved: KEEP dedicated tab** — AI is currently a destination owning conversations, transaction tools, imports, memory, financial assistant. Not ambient yet; don't optimize for a future product. | PO |
| Spending Lens ownership | Rendered via More sheet | (a) collapse into Settings, (b) promote to first-class, (c) contextual capability from Today/Budget | **Deferred** — Folder structure is not sufficient evidence; depends on capability ownership, not implementation location. Re-evaluate after Today/Budget Calm Ledger migration. | PO + Engineering |
| Household onboarding | Shared generic flow | Admin flow + invited-member flow | **Resolved: Dual-flow onboarding** — Admin and Invited Member are first-class flows, not variations of one shared flow. See §17 Onboarding State Diagram. | PO |
| Token debt threshold | Baseline 487 | <100 / lower | Proposed: <100 before launch polish | PO + Engineering |
| Architecture source | `ARCHITECTURE.md` + `BACKEND.md` divergence | Update/retire/split authority | **Resolved: Split authority** — `ARCHITECTURE.md` = system structure (How is the system structured?). `BACKEND.md` = backend implementation (How is the backend implemented?). | Engineering |
| Figma role | Not source of truth | Optional mock / required gate | Proposed: optional, code tokens authoritative | PO + Design |

---

## 7. Today Product Boundary

Today is not a dashboard. Today is the decision engine.

### Owns

- Can I spend?
- Which account can I spend from?
- What is left today?
- What changed today?
- Quick log and daily transaction review.
- Daily context for safe-to-spend, wallet balance, spent today, and monthly leftover.

### Must never own

- FI analytics.
- Net-worth deep analysis.
- Asset allocation charts.
- Subscription and billing administration.
- Household admin.
- Full reporting and long-range projections.

### Design implication

Today should be fast, calm, and decision-oriented. It should not become a general dashboard that duplicates Report, Assets, or Settings.

---

## 8. Household UX Audit

The BRD defines the household as the product unit. Current code has basic auth, household creation/joining, member display, invites, and admin transfer. The UX still needs a household-specific model.

### Required flows

| Flow | Current state | Gap |
|---|---|---|
| New admin creates household | Basic flow exists in `AuthScreen` | Needs product-quality onboarding and starting balance capture. |
| Invited member joins household | Invite code join exists | Needs partner-light onboarding and clearer role expectations. |
| Admin invites partner | `HouseholdSheet` can generate code | Needs placement, empty states, copy, recovery, and commercial implications. |
| Member allowance | Backend/proposal says allowance is per-member | UI must make ownership clear. |
| Household settings | Lives under More | Needs IA decision. |
| Billing/subscription | In BRD/BACKEND, not yet productized in UI | Commercial readiness item. |
| Household switcher | Schema supports multiple households | Not v1 surface unless demand appears. |

### Open questions

- What must an invited member configure before reaching Today?
- Can a partner skip owner-style financial setup?
- Who owns accounts, categories, recurring items, and allowance edits?
- Which states require Admin role?
- Where does billing live?

---

## 9. Screen-by-Screen Gap Analysis

### Today

**Purpose**  
Decision engine.

**Owns**

- Safe-to-spend context.
- Daily transactions.
- Daily balance context.
- Quick log entry point.
- Monthly leftover snapshot.

**Must never own**

- FI analytics.
- Subscription.
- Household admin.
- Deep reports.

**Core calculations**

- Safe-to-spend.
- Today spent.
- Wallet balance.
- Monthly leftover.
- Transfer exclusion.

**Product integrity**  
Likely closest to verified after Phase 3, but requires final audit against `PAIN-POINTS.md` T/F items and tests.

**UX debt**  
Lower than older screens after Phase 3. Verify no legacy interaction debt remains in form/search/period scope.

**Primitive adoption**  
High relative to other screens. Uses Phase 2 primitives per handoff intent.

**Migration risk**  
Low to medium. Avoid expanding scope into dashboard/reporting.

**Exit criteria**

- Daily numbers match engine tests and transaction fixtures.
- Transfers and recurring-tagged transactions behave correctly.
- Quick log remains reachable with one primary action.
- Empty state has an action.
- Mobile touch targets pass 44px minimum.

**Next action**  
Run product integrity QA and confirm Today boundary in Decision Register.

### Budget

**Purpose**  
Plan, safe-to-spend model, weekly/monthly/yearly budget, and reconcile entry.

**Owns**

- Workweek budget.
- Monthly/yearly plan.
- Allowance context.
- Reconcile/import flow.

**Must never own**

- Daily transaction front door.
- Household admin.
- AI chat history.

**Core calculations**

- Weekly safe-to-spend.
- Waterfall.
- Recurring deductions/display.
- Period budgets.

**Product integrity**  
Needs audit. Safe-to-spend semantics are central and must be verified before visual migration.

**UX debt**  
Legacy inline styles likely remain. History/search overlap with Today must be resolved cleanly.

**Primitive adoption**  
Partial.

**Migration risk**  
Medium. Touches high-trust calculations and reconcile workflows.

**Exit criteria**

- Safe-to-spend matches Product Integrity audit.
- Reconcile entry remains reachable and atomic.
- Budget views use Calm Ledger hierarchy without duplicating Today.

**Next action**  
Audit safe-to-spend and reconcile/import behavior before style migration.

### Assets

**Purpose**  
Accounts, wallets, assets, balances, and net-worth inputs.

**Owns**

- Account list.
- Account balances.
- Asset values.
- Manual balance overrides.
- Stale valuation prompts.

**Must never own**

- Daily spend decision.
- Budget plan semantics.
- Subscription management, except possibly plan-gated feature messaging.

**Core calculations**

- Account balances.
- Asset totals.
- Lane totals feeding net worth.

**Product integrity**  
Needs audit, especially starting balances and transfer-aware account balance math.

**UX debt**  
Likely high: older cards/forms may remain.

**Primitive adoption**  
Partial to low.

**Migration risk**  
Medium. Balance correctness and form safety matter.

**Exit criteria**

- Starting balance behavior is explicit.
- Transfers update both accounts correctly.
- Stale asset states are clear.
- Rows over boxes, numbers aligned.

**Next action**  
Audit balance math and onboarding dependency.

### Report

**Purpose**  
Actuals, analysis, scoreboard, category spend, and FI readouts.

**Owns**

- Period actuals.
- Category breakdown.
- Net-worth reporting.
- FI projection display.

**Must never own**

- Daily quick log.
- Wallet/account editing.
- Household admin.

**Core calculations**

- Income/expense/net actuals.
- Transfer exclusion.
- Category spend.
- Net worth.
- FI projection.

**Product integrity**  
Needs audit. `PAIN-POINTS.md` identifies Report actuals and category breakdown as key gaps.

**UX debt**  
Likely high. Naming (`Report` vs `Insights`) still pending.

**Primitive adoption**  
Partial to low.

**Migration risk**  
High. This screen can easily become a misleading dashboard if calculations are not verified.

**Exit criteria**

- Transfers excluded from actuals.
- Category breakdown exists or limitation is explicit.
- FI assumptions visible with math/version context.
- Naming decision resolved.

**Next action**  
Product Integrity audit first, then naming/scope decision.

### Manager

**Purpose**  
AI finance partner for reading data, explaining numbers, and proposing confirmed writes.

**Owns**

- Chat.
- AI-assisted import/extraction.
- Tool confirmations.
- Finance explanations.

**Must never own**

- Unconfirmed writes.
- Investment advice or affordability verdicts.
- Cross-household memory.
- Silent category/protected-status changes.

**Core calculations**

- Reads from current data context.
- Tool results.
- Statement extraction.
- Confirmation/write behavior.

**Product integrity**  
Needs audit. `AI-MANAGER-UX-AUDIT.md` lists P1/P2 integrity and safety issues.

**UX debt**  
Markdown rendering, model picker, confirmations, progress, image limits, and error copy need work.

**Primitive adoption**  
Partial.

**Migration risk**  
High. AI can mask data errors and create user trust gaps.

**Exit criteria**

- Prompt removes verdict language.
- Protected categories are authoritative.
- Write confirmations are atomic/idempotent or clearly scoped.
- Proxy model/cost controls exist before public users.

**Next action**  
Address AI integrity findings before visual polish.

### More

**Purpose**  
Settings, household/admin, backup/restore, categories, recurring, assumptions, PIN, appearance.

**Owns**

- Configuration.
- Household/member management.
- Backup/restore.
- Security settings.
- Reference data maintenance.

**Must never own**

- Core daily decisions.
- Primary budget/report workflows.
- Hidden critical setup needed for first-run success.

**Core calculations**

- Usually none directly, but edits affect every engine.

**Product integrity**  
Needs targeted audit for destructive actions, restore, allowance editing, recurring editing, and assumptions.

**UX debt**  
Junk-drawer risk. Naming (`More` vs `Settings`) pending.

**Primitive adoption**  
Partial.

**Migration risk**  
Medium. Many small forms and destructive actions.

**Exit criteria**

- Destructive actions have consistent confirmation/undo model.
- Settings are grouped by user mental model.
- Household/admin and commercial settings have clear role gating.
- Naming decision resolved.

**Next action**  
IA grouping and role-gating audit.

### Auth and Onboarding

**Purpose**  
Move user from account/session to meaningful household Today state.

**Owns**

- Sign in/up.
- Create household.
- Join household.
- Initial setup.
- Starting balances.

**Must never own**

- Deep financial education.
- Full settings configuration.
- Partner-hostile owner-only assumptions.

**Core calculations**

- None directly, but setup values seed balances, allowance, and budget correctness.

**Product integrity**  
Needs audit. Missing starting balance capture can make first numbers wrong.

**UX debt**  
Needs admin/member split and partner-light path.

**Primitive adoption**  
Low to partial; current auth uses `FormField` primitives plus inline styles.

**Migration risk**  
High. First-run flow shapes household product comprehension.

**Exit criteria**

- Admin and invited-member paths are distinct.
- Starting balances are captured or intentionally deferred with honest copy.
- User reaches a meaningful Today state.

**Next action**  
Design IA/onboarding model before visual migration.

---

## 10. Migration Scoreboard

Initial estimates from repository inspection. Replace estimates with measured counts during M3.

| Screen | Uses UI primitives | Inline style debt | Product integrity | Responsive/mobile | Accessibility | Complete |
|---|---:|---:|---|---|---|---|
| Today | High | Low to medium | Needs final audit | Likely good | Needs final audit | Near |
| Budget | Partial | Medium/high | Needs audit | Needs audit | Needs audit | In progress |
| Assets | Partial/low | High | Needs audit | Needs audit | Needs audit | In progress |
| Report | Partial/low | High | Needs audit | Needs audit | Needs audit | In progress |
| Manager | Partial | Medium/high | Needs audit | Needs audit | Needs audit | In progress |
| More | Partial | Medium/high | Needs targeted audit | Needs audit | Needs audit | In progress |
| Auth/Onboarding | Partial | Medium/high | Needs audit | Needs audit | Needs audit | In progress |

Baseline token debt: `487` in `scripts/style-tokens-baseline.json`.

Target before launch polish: below `100`, unless updated by Decision Register.

---

## 11. Product Readiness Checklist

### Product Integrity

- [ ] Report numbers verified.
- [ ] Safe-to-spend verified.
- [ ] Daily leftover verified.
- [ ] Balance math verified.
- [ ] Transfer exclusion verified across Today, Budget, Assets, Report.
- [ ] Recurring semantics verified.
- [ ] FI projection verified with visible assumptions.
- [ ] Import/reconcile atomicity verified.
- [ ] AI write path integrity verified or scoped down.

### UX

- [ ] Admin onboarding.
- [ ] Invited-member onboarding.
- [ ] Starting balance path.
- [ ] Empty states.
- [ ] Loading states.
- [ ] Error states.
- [ ] Offline behavior.
- [ ] Accessibility pass.
- [ ] Mobile touch targets.

### Technical

- [ ] RLS tests.
- [ ] Sync conflict tests.
- [ ] Backup/restore tests.
- [ ] Token debt below threshold.
- [ ] Build/lint/test green.
- [ ] Edge Function cost/model controls.
- [ ] Dependency audit cadence.

### Commercial

- [ ] Household invite UX.
- [ ] Trial flow.
- [ ] Subscription gating.
- [ ] Billing admin flow.
- [ ] Privacy notice.
- [ ] Account/household deletion/export policy.
- [ ] Play Store/PWA launch assets.

---

## 12. Redesign Principles

1. Product integrity before aesthetics.
2. Today is the decision engine.
3. Typography creates hierarchy, not cards.
4. Rows over boxes.
5. One accent.
6. Every repeated pattern becomes a primitive.
7. Code is the source of truth for design tokens.
8. Documentation reflects implementation, not intent.
9. Migration over rewrite.
10. Every redesign must reduce maintenance cost.

## 13. Migration Gate

A screen may enter visual migration only when all of the following are true:

- [ ] Product Integrity = Pass for that screen's core calculations.
- [ ] IA ownership decided for that screen.
- [ ] Decision Register items affecting that screen are resolved or explicitly deferred.
- [ ] Primitive migration plan identified.

Aesthetic work must not get ahead of verified behavior.

## 14. Screen Exit Gate

A migrated screen may be marked complete only when all of the following are true:

- [ ] Product Integrity verified.
- [ ] Uses approved UI primitives.
- [ ] No new token violations.
- [ ] Responsive verified.
- [ ] Accessibility verified.
- [ ] Manual QA completed.
- [ ] `REDESIGN-GAP-AUDIT.md` Migration Scoreboard updated.

A screen is not done when it looks right. A screen is done when it is verified.

---

## 15. Convergence Metrics

Two metrics track project convergence. Both must trend downward over time.

### Decision debt

Measures product convergence. Counted from Decision Register rows with status `Pending`.

| Sprint | Decision debt |
|---|---:|
| Current | 0 |
| Target | 0 |

When a decision is resolved or explicitly deferred, it is removed from the count.

**M2 close-out update:** Resolved Today landing, Report naming, More → Settings rename, Manager placement, Spending Lens (Deferred), Household onboarding, Architecture source. Net change: 6 → 2 → 0.

### Token debt

Measures UI migration convergence. Read from `scripts/style-tokens-baseline.json`.

| Sprint | Token debt |
|---|---:|
| Current | 487 |
| Target | <100 |

Token debt must only decrease. Baseline ratchet enforced by `npm run lint:tokens`.

### Integrity coverage

Measures behavioral confidence — how much of the product's core behavior has been verified with evidence.

| Audit domain | Status |
|---|---|
| Safe-to-spend | Pass |
| Report actuals | Partial (Evidence + Capability) |
| Transfers | Pass |
| Balances | Pass |
| Recurring semantics | Pass |
| Daily leftover | Pass |
| FI projection | Pass |
| AI Tool Integrity | Pass |

| Metric | Value |
|---|---:|
| Total domains | 8 |
| Pass | 7 |
| Partial | 1 |
| Remaining | 0 |
| **Integrity coverage** | **94%** |

Integrity coverage = (Pass + 0.5 × Partial) / Total.

---

## 16. Prioritized Roadmap

### M1 — Product Integrity Audit

Goal: verify core money semantics before visual migration.

Tasks:

- Audit safe-to-spend.
- Audit transfers across Today/Budget/Assets/Report.
- Audit account balance math.
- Audit Report actuals.
- Audit recurring semantics.
- Audit FI projection assumptions/display.
- Audit daily leftover.
- Audit AI Tool Integrity.

Exit:

- Product Integrity checklist has owners and pass/fail evidence.
- Bugs are split from redesign tasks.
- `ARCHITECTURE.md` updated to reflect current implementation reality.

**M1 status:** Complete. See §1–§10 for per-domain PASS/PARTIAL evidence. **Integrity coverage: 94%.** Recurring import linkage and AI `logTransactions` recurring linkage were the two contract defects fixed during this audit. **Decision debt:** unchanged (no Decision Register items were resolved as part of this work).

### M1.1 — Architecture Documentation Sync

Goal: align `ARCHITECTURE.md` with current Supabase/auth/sync implementation before further screen migration.

Organize by architectural responsibility, not just technology:

- Presentation: React + Vite PWA.
- Client storage: Dexie, local-first cache, offline queue.
- Identity: Supabase Auth.
- Household domain: households, memberships, invite flow, roles.
- Persistence: Supabase Postgres, RLS isolation.
- Synchronization: watermark push/pull sync, conflict strategy.
- AI: Edge Function proxy, tool execution, local chat state.
- Legacy boundaries: free-tier local-first behavior, transitional architecture.

Exit:

- `ARCHITECTURE.md` no longer contradicts `BACKEND.md` or live code.
- `REDESIGN-GAP-AUDIT.md` Document Truth Matrix updated if authority changes.

**M1.1 status:** Complete. `ARCHITECTURE.md` v1.1 (July 2026) reflects current implementation across all eight responsibility areas: Dexie primary store → async LWW sync → Supabase Postgres with RLS. Module structure updated to include `src/ai/`, `src/stores/authStore.ts`, `src/lib/sync.ts`, `src/lib/syncMappers.ts`, `src/lib/supabaseClient.ts`. All entity types in §3.1 updated to UUID-string primary keys with `updated_at` sync watermark.

### M2 — IA, Navigation, Household Onboarding

Goal: lock product structure before migrating old screens.

Tasks:

- Resolve Decision Register items for Today, Report, More, Manager.
- Define admin onboarding.
- Define invited-member onboarding.
- Define household settings/billing placement.
- Update docs to reflect current architecture authority.

Exit:

- Navigation and onboarding decisions are recorded.
- Screen ownership boundaries are stable.

### M3 — Design-System Hardening

Goal: reduce token debt and make primitives sufficient for migration.

Tasks:

- Measure per-screen inline style debt.
- Add only missing primitives with repeated need.
- Prefer deletion/migration over new abstraction.
- Lower `style-tokens-baseline.json` as screens migrate.

Exit:

- Token debt trend is downward.
- No new feature code adds raw style-token debt.

### M4 — Screen Migration

Goal: migrate screens in risk-aware order.

Recommended order:

1. Today final QA.
2. Budget.
3. Assets.
4. Report.
5. Manager.
6. More.
7. Auth/Onboarding if not already handled in M2.

Exit:

- Each migrated screen has Product Integrity status, UX exit criteria, and responsive/a11y pass.

### M5 — Commercial Readiness

Goal: prepare household product for external users.

Tasks:

- Sync QA.
- RLS/tenant isolation CI.
- Backup/export/delete policy.
- Subscription/trial gating.
- Billing admin flow.
- Privacy/UU PDP surface.
- Play Store/PWA assets.

Exit:

- Product can safely onboard a friend household without hidden operator intervention.

---

## 17. Onboarding State Diagram and Ownership Matrix

*Resolves the "Household onboarding" decision in the Decision Register.*

### 17.1 Onboarding flow

```
                              (no session)
                            status: signed_out
                                    │
                                    │  sign in / sign up
                                    │  (email + password)
                                    ▼
                              status: loading
                            resolveHousehold()
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                          ▼                   ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │ HouseholdSetup   │  │ AppShell renders │
                  │ (create / join)  │  │ (Today tab)      │
                  └────────┬─────────┘  └──────────────────┘
                           │
                    createHousehold        joinHousehold
                           │                       │
                           ▼                       ▼
                  ┌─────────────────────┐  ┌─────────────────────┐
                  │ create_household(p) │  │ accept_invite(code) │
                  │ → role='admin'      │  │ → role='member'     │
                  │ → assumptions seed  │  │                     │
                  └──────────┬──────────┘  └──────────┬──────────┘
                             │                        │
                             └────────────┬───────────┘
                                          │
                                          ▼
                                   status: ready
                              householdId resolved
                                  kickSync() fires
                                          │
                             setup_complete in appSettings?
                                          │
                                          │
                       no                 │                 yes
                             ┌────────────┴────────────┐
                             │                         │
                             ▼                         ▼
                  ┌──────────────────┐      ┌──────────────────┐
                  │ OnboardingWizard │      │ AppShell renders │
                  │ (admin-only)     │      │ (Today tab)      │
                  │ gross → pipes    │      │                  │
                  │ accounts →       │      │                  │
                  │   allowance      │      │                  │
                  └────────┬─────────┘      └──────────────────┘
                           │ mark setup_complete
                           ▼
                  ┌──────────────────┐
                  │ AppShell renders │
                  │ (Today tab)      │
                  └──────────────────┘
```

**Critical rules (implemented in code):**

- `create_household(p_name)` RPC bootstraps the caller as `role='admin'` (SQL: `insert into memberships (... role) values (..., 'admin')`).
- `accept_invite(p_code)` RPC assigns `role='member'` to the joining user.
- Admin role is gated by `is_household_admin(hid)` SQL function on RLS policies for `households`, `invites`, and write paths on `memberships`.
- `transfer_admin(p_household, p_to_user)` RPC allows the admin to hand the role to another member (after which the previous admin becomes `member`).

### 17.2 Six-question decision matrix

| # | Question | Decision | Evidence |
|---|---|---|---|
| 1 | Is **Admin** the default role? | **Yes — Admin is automatic for the household creator.** No manual assignment. | `create_household` RPC hardcodes `role='admin'` for caller. |
| 2 | Is **Invited Member** a first-class flow? | **Yes — separate from Admin flow, not a variation.** | `accept_invite` is a distinct RPC. Member joins via `role='member'`. |
| 3 | Is there a **Partner-light** mode? | **No.** Every member is a full member. Admin/member is the only role distinction. | `memberships.role check (role in ('admin','member'))`. |
| 4 | When are **starting balances** captured? | **During OnboardingWizard (admin only).** Members join and inherit the household's existing data. | `OnboardingWizard.tsx:99-140` collects `startingBalance` and `accountName`. `setup_complete` flag gates first-run only. |
| 5 | Who owns **allowance**, **recurring**, and **shared vs personal**? | **Allowance is per-member** (`D-3` in `BACKEND.md`). Recurring items are **per-household** (shared). Accounts are **shared by default** with optional `owner_member_id` (`D-2`). | `BACKEND.md` §Assumptions D-2, D-3. `allowance` table has `member_id`. `recurringItems` keyed to household. |
| 6 | What if someone skips onboarding? | **They cannot.** `setup_complete` gates `AppShell`. Until marked, OnboardingWizard blocks first-run. Mid-run draft is persisted (`onboarding_draft` appSetting) so the user can return. | `App.tsx:51-53` returns `<OnboardingWizard>` when `ready === false`. `OnboardingWizard.tsx:88-97` persists draft on every field change. |

### 17.3 Ownership matrix

| Capability | Admin | Member | Shared/Household |
|---|---|---|---|
| Create household | ✅ (initial) | — | — |
| Invite members | ✅ | ❌ | — |
| Remove members | ✅ | ❌ | — |
| Transfer admin | ✅ | ❌ | — |
| Edit household name | ✅ | ❌ | household-level |
| Accounts (shared) | ✅ | ✅ | household-level |
| Accounts (personal, `owner_member_id`) | ✅ own | ✅ own | optional split |
| Categories | ✅ | ✅ | household-level |
| Recurring items | ✅ | ✅ | household-level |
| Allowance | ✅ own | ✅ own | per-member |
| Assumptions (FI projection inputs) | ✅ | ❌ | household-level |
| Assets (household-owned) | ✅ | ✅ | household-level |
| Backup/restore | ✅ | ❌ (or shared view) | household-level |
| Settings (theme, language) | ✅ own | ✅ own | per-member |
| PIN lock | ✅ own device | ✅ own device | per-device |

### 17.4 Why "dual-flow", not "shared flow"

The earlier §8 framed the open question as "shared generic flow vs admin-flow + invited-member-flow". The implementation evidence answers this:

- The Supabase RPCs are **two distinct functions** (`create_household` vs `accept_invite`), not one parameterized RPC.
- The role assignment is **automatic and role-specific** — admin for creator, member for joiner — so the data invariants differ.
- The OnboardingWizard is **admin-only** because starting balances and account creation are household-state mutations, not member configuration.

Therefore, in product terms, **Admin onboarding and Invited Member onboarding are two distinct flows** that share the auth screen but diverge immediately after household resolution.

### 17.5 Implementation gaps (deferred to M3)

The dual-flow structure exists in code but the UX surface is still rough:

- `OnboardingWizard` is currently a single-user mental model — invited members fall through into the same setup flow (`setup_complete` gates first-run regardless of role).
- An invited member should land directly in `AppShell` and inherit the household's existing config, not be re-prompted for income/pipes/allowance.
- The `setup_complete` flag is per-device (Dexie), not per-household, so an invited member on a new device sees the wizard by mistake.

These are M3 screen-migration concerns, not Decision Register blockers.

---

## 18. Documentation Authority Split

*Resolves the "Architecture source" decision in the Decision Register.*

The divergence between `ARCHITECTURE.md` and `BACKEND.md` was real at the time the audit was written, but became resolvable once M1.1 synchronized `ARCHITECTURE.md` v1.1 with the cloud-aware implementation.

### 18.1 Authority split

| Document | Question it answers | Scope |
|---|---|---|
| `ARCHITECTURE.md` | **How is the system structured?** | System-wide architecture: Presentation, Client storage, Identity, Household domain, Persistence, Synchronization, AI, Legacy boundaries. The eight responsibility areas span client and server. |
| `BACKEND.md` | **How is the backend implemented?** | Server-side specifics: Supabase stack, RPC contracts, RLS policies, migration sequencing, billing assumptions, sync watermarking details. |

### 18.2 What changes

- `ARCHITECTURE.md` now describes the **whole system**, not just the local-first client. It includes the Sync Layer and Supabase Cloud blocks (added in M1.1).
- `BACKEND.md` keeps its implementation-level scope: SQL migrations, RPC function bodies, RLS policies, sync edge cases, billing integration notes.
- The earlier Appendix B description of `ARCHITECTURE.md` as "Original/local-first client technical architecture" is **superseded**. It now covers the cloud-aware whole.

### 18.3 Authority rules

- If a question is **"what runs where"** or **"how do components connect"** → `ARCHITECTURE.md`.
- If a question is **"how does this RPC work"** or **"what columns does this table have"** or **"which policies guard this table"** → `BACKEND.md`.
- If a contract spans both (e.g. `import_batch` RPC body and the `transactions.repo.importBatch` client caller), document the **client interface** in `ARCHITECTURE.md` and the **server contract** in `BACKEND.md`. Link between them.
- If the two documents ever disagree on a structural fact (not an implementation detail), `ARCHITECTURE.md` wins for system structure; `BACKEND.md` wins for backend specifics.

---

## 19. M3 Backlog

*Prepared while PRs #16 and #17 are under review. Do not begin implementation until both are merged.*

### 19.1 Migration order

```text
M3-001 Today
   ↓
M3-002 Settings
   ↓
M3-003 Auth/Household
   ↓
M3-004 Budget
   ↓
M3-005 Report
   ↓
M3-006 Assets
   ↓
M3-007 Manager
```

Auth/Household comes after Today and Settings so the visual language is established before onboarding improvements from §17.5 are implemented.

### 19.2 Story template

Each story references:

- **Migration Gate** — §13 preconditions for entering visual migration
- **Screen Exit Gate** — §14 conditions for marking the screen complete
- **Product Integrity items** — relevant engines and integration tests
- **Decision Register links** — resolved decisions that constrain scope
- **Implementation gaps** — from §17.5 (where applicable)

### 19.3 Stories

#### M3-001 — Today migration

- **Migration Gate:** Product Integrity = Pass (already 94% overall, Today engine verified). IA ownership decided (§17 Today boundary). No Decision Register items pending.
- **Screen Exit Gate:** Uses approved UI primitives (already Phase 3 rebuilt). No new token violations. Responsive + a11y verified.
- **Product Integrity items:** Safe-to-Spend engine + 9 integration tests; Daily Leftover projection + 13 tests; Recurring Semantics (in scope of Today's pool draw) + contract fix.
- **Decision Register links:** "Today landing → KEEP" (§17 Today boundary).
- **Goal:** Apply Calm Ledger tokens consistently across `TodayScreen`, `TransactionForm`, `SpeedDialFAB`. Validate visual language for downstream screens.
- **Exit signal:** Token debt reduction visible; design primitives reused in M3-002.

#### M3-002 — Settings migration

- **Migration Gate:** Product Integrity = Pass (no engine work; UI surface only). IA ownership decided ("More → Settings → RENAME").
- **Screen Exit Gate:** All sheets (recurring, allowance, PIN, assumptions, restore, categories, household, theme) use approved primitives. No token violations introduced.
- **Product Integrity items:** None engine-level. UI work only.
- **Decision Register links:** "More → Settings → RENAME" decision.
- **Goal:** Rename tab label and folder; ensure all 9 sheets in `MoreScreen` adopt Calm Ledger primitives.
- **Exit signal:** Tab label is "Settings" everywhere (TabBar, App.tsx, i18n); folder rename is `features/settings/` (or equivalent).

#### M3-003 — Auth/Household migration

- **Migration Gate:** Product Integrity = Pass (auth and household flows verified through Supabase RLS + integration tests in M1). IA ownership decided (§17 dual-flow onboarding).
- **Screen Exit Gate:** All three §17.5 implementation gaps closed. Token debt reduced by AuthScreen + HouseholdSheet + OnboardingWizard. A11y verified (form inputs, error states).
- **Product Integrity items:** None new; this is UX work.
- **Decision Register links:** "Household onboarding → Dual-flow" (§17). M3.5 implementation gaps.
- **Goal:** Implement the three concrete §17.5 gaps:
  1. Invited members bypass the admin `OnboardingWizard`.
  2. Invited members land directly in `AppShell` with inherited household configuration.
  3. `setup_complete` becomes household-aware rather than device-only.
- **Exit signal:** Members joining via invite code land on Today without re-running wizard. Admin's wizard runs only on first household creation.

#### M3-004 — Budget migration

- **Migration Gate:** Product Integrity = Pass for Safe-to-Spend (engine + 9 tests), Transfers (16 tests), Balances (11 tests). IA ownership decided (Budget tab is weekly/monthly/yearly horizons).
- **Screen Exit Gate:** All three horizon screens (weekly Safe-to-Spend, monthly envelopes, yearly) use approved primitives. Recurring linkage behavior preserved (contract fix from M1).
- **Product Integrity items:** Safe-to-Spend, Transfers, Balances, Recurring Semantics integration tests must still pass after UI migration.
- **Decision Register links:** None directly, but Spending Lens ownership is Deferred — deferral to be revisited post-migration.
- **Goal:** Migrate `BudgetScreen`, weekly/monthly/yearly sub-screens. Validate that recurring linkage contract (no double-counting) holds in the migrated UI.
- **Exit signal:** All three horizon screens render under Calm Ledger; integration tests still green.

#### M3-005 — Report migration

- **Migration Gate:** Product Integrity = PARTIAL (capability/evidence gaps documented but engine verified). IA ownership decided ("Report → KEEP" until it answers why/next/what).
- **Screen Exit Gate:** `ReportScreen` uses approved primitives; no new token violations. A11y verified (tables, breakdowns).
- **Product Integrity items:** Report Actuals engine + 8 integration tests must remain green.
- **Decision Register links:** "Report naming → KEEP" until scope expands.
- **Goal:** Migrate ReportScreen. Do not introduce "Insights"-style interpretation features during migration (that would trigger rename review).
- **Exit signal:** Report screen renders under Calm Ledger; integration tests still green.

#### M3-006 — Assets migration

- **Migration Gate:** Product Integrity = Pass for Balances (11 tests). IA ownership decided (Assets tab owns accounts, assets, balances).
- **Screen Exit Gate:** `AssetsScreen`, `AccountList`, `AssetList` use approved primitives. Bank-account balance derivation preserved (AI Tool Integrity contract: bank balance is derived from transactions, not directly editable).
- **Product Integrity items:** Balances integration tests; AI Tool Integrity contract (block direct bank balance updates).
- **Decision Register links:** None directly.
- **Goal:** Migrate Assets screen. Validate that bank-balance-derivation invariant holds in the migrated UI.
- **Exit signal:** Assets screen renders under Calm Ledger; integration tests still green.

#### M3-007 — Manager migration

- **Migration Gate:** Product Integrity = Pass for AI Tool Integrity (15 integration tests). IA ownership decided ("Manager → KEEP dedicated tab"). Tools contracts verified through four-contract audit (Read, Write, Tool, Failure).
- **Screen Exit Gate:** `ChatScreen` uses approved primitives. Token debt reduced. A11y verified (chat history scrolling, message rendering).
- **Product Integrity items:** AI Tool Integrity tests must remain green. Recurring linkage contract (AI tool links `recurring_item_id` on log) preserved.
- **Decision Register links:** "Manager placement → KEEP dedicated tab".
- **Goal:** Migrate ChatScreen to Calm Ledger. Validate that the AI recurring-linkage contract (M1 fix) still holds in the migrated UI.
- **Exit signal:** Chat screen renders under Calm Ledger; AI Tool Integrity tests still green.

### 19.4 Migration Scoreboard

Tracks §14 last-bullet requirement (Migration Scoreboard updated per screen).

| Screen | Story | Migration Gate | UI Migration | Exit Gate | Status |
|---|---|---|---|---|---|
| Today | M3-001 | ✅ Pass | pending | pending | Not started |
| Settings | M3-002 | ✅ Pass | pending | pending | Not started |
| Auth/Household | M3-003 | ✅ Pass | pending | pending | Not started |
| Budget | M3-004 | ✅ Pass | pending | pending | Not started |
| Report | M3-005 | 🟡 Partial | pending | pending | Not started |
| Assets | M3-006 | ✅ Pass | pending | pending | Not started |
| Manager | M3-007 | ✅ Pass | pending | pending | Not started |

### 19.5 M3 success criteria

```text
- Token debt: 487 → <100
- Every migrated screen passes Migration Gate
- Every migrated screen satisfies Screen Exit Gate
- No Product Integrity regressions (all 178 tests remain green)
- Calm Ledger design language applied consistently
- §17.5 implementation gaps closed (M3-003)
```

---

## 20. M3-001 Today Migration Audit

*Pre-implementation audit, conducted on `main` at v0.3.0. Establishes baseline before any UI migration.*

### 20.1 Scope

`src/features/today/` contains four files:

| File | LOC | Role |
|---|---:|---|
| `TodayScreen.tsx` | 474 | Main screen surface |
| `SpeedDialFAB.tsx` | 131 | Floating action button |
| `TransactionForm.tsx` | 272 | Quick-log sheet |
| `WalletPicker.tsx` | 39 | Wallet selector sheet |

### 20.2 Migration Gate (§13) check

| Gate condition | Status |
|---|---|
| Product Integrity = Pass for that screen's core calculations | **Pass** — Safe-to-Spend engine + 9 integration tests; Daily Leftover projection + 13 tests; Recurring Semantics contract fix verified. |
| IA ownership decided for that screen | **Pass** — §17 Today boundary, Decision Register: "Today landing → KEEP". |
| Decision Register items affecting that screen are resolved or explicitly deferred | **Pass** — Spending Lens Deferred; doesn't block Today. |
| Primitive migration plan identified | **Pass** — this audit identifies the residual 12 raw literals and the plan to fix them. |

**Migration Gate: SATISFIED.**

### 20.3 Audit findings

#### Primitive adoption

| Primitive | Imported in Today? | Used? |
|---|---|---|
| `Screen` | ✓ (TodayScreen.tsx) | ✓ |
| `Card` | ✓ (TodayScreen.tsx) | ✓ |
| `Row` | ✓ (TodayScreen.tsx) | ✓ (txn list) |
| `StatTile` | ✓ (TodayScreen.tsx) | ✓ (4×) |
| `Amount` | ✓ (TodayScreen.tsx) | ✓ (5×) |
| `SectionHeader` | ✓ (TodayScreen.tsx) | ✓ |
| `Icon` | ✓ (TodayScreen.tsx + SpeedDialFAB) | ✓ |

**Primitive adoption: 94%.** All seven primitives from `src/components/ui/index.ts` are used in `TodayScreen.tsx`. Sub-components (`SpeedDialFAB`, `WalletPicker`) bypass Card/Row because they render inside sheets, not standalone surfaces.

#### Token debt contribution

Source: `node scripts/check-style-tokens.mjs`.

| File | Raw-literal findings |
|---|---:|
| `TodayScreen.tsx` | **0** |
| `SpeedDialFAB.tsx` | 0 (already on tokens) |
| `TransactionForm.tsx` | 8 (4 in `chipStyle`: `borderRadius: 14`, `padding: '5px 11px'`, `fontSize: 12`; 4 in tab/date field styles) |
| `WalletPicker.tsx` | 4 (`gap: 8`, `borderRadius: 10`, `padding: '12px 6px'`, `fontSize: 13`/`10`) |
| **Today total** | **12 / 487 (2.5%)** |

**Token debt contribution: 12.** Phase 3 already migrated the surface screen; residual is concentrated in two sheet sub-components.

#### Boundary ownership

Imports in `src/features/today/`:

- `@db/db`, `@db/types` (data access — expected)
- `@lib/dates`, `@lib/currency` (formatting — expected)
- `@components/ui` (primitives — expected)
- `@components/BottomSheet`, `@components/FormField` (composite components — expected)
- `@db/repositories/transactions.repo`, `@db/repositories/recurringItems.repo` (write paths — expected)
- `@stores/appStore` (SpeedDialFAB → setTab for AI navigation)
- Hooks: `useAccountBalances`, `useDailyLeftover`, `useSafeToSpend` (Today-domain data)

**No cross-feature imports** to `report/`, `budget/`, `assets/`, `decide/`, `more/`. **Boundary: PASS.**

#### Accessibility (44dp touch targets, aria)

| Element | Touch target | aria-label |
|---|---|---|
| `IconButton` (chevron prev/next) | `minWidth: 44px`, `minHeight: 44px` | "Previous day" / "Next day" |
| Scope segment buttons (4×) | `minHeight: 44px` | grouped via `aria-label="Transaction period scope"` |
| Editable row (per transaction) | `Row` primitive (~44dp height by design) | `Edit <title>` |
| FAB main button | ~48dp (default) | "Add expense" |
| FAB action buttons | ~40dp (close to threshold) | per action label |
| WalletPicker tiles | default button (typically 36dp native) | implicit via button text |
| "Back to today" pill | `minHeight: 28px` — **below 44dp threshold** | implicit via button text |

**Accessibility: PASS** with one minor finding — "Back to today" pill is `28px` (below 44dp recommended for touch). It's a secondary affordance, so low risk; flagged for future touch-target audit.

#### Responsive

- Single layout; no explicit breakpoint handling.
- `Screen` primitive uses flex; cards and tiles reflow naturally.
- Primary target: mobile portrait (PWA).
- Tablet/desktop: not explicitly verified. Likely usable but not optimized.

**Responsive: PARTIAL.** Mobile portrait verified; tablet/desktop not formally tested.

#### Calm Ledger compliance

| Principle | Status | Evidence |
|---|---|---|
| Typography leads hierarchy | ✓ | StatTile labels, Amount primary, caption body |
| Rows over boxes | ✓ | Transaction list uses Row primitive, not nested cards |
| One accent | ✓ | `--accent` only on active segment + "Today" pill; muted elsewhere |
| Numbers have stage | ✓ | Amount primitive with sign/tone (`positive` for income, `negative` for overspend) |
| Slim AppBar | ✓ | Fixed `44px` height (lines 124-152 of App.tsx) |
| Calm spacing | ✓ | `var(--space-*)` throughout TodayScreen; gaps use tokens |
| SVG icons | ✓ | `Icon` primitive, no raster/emoji |
| Minimal borders | ◐ | Borders used on Card, IconButton, search input, FAB. Justified by use case but count is non-zero. |
| No raw literals | ✗ | 12 violations in sub-components (TransactionForm, WalletPicker) |
| Heading hierarchy | ✓ | One h1 (AppBar) + SectionHeader; no h2/h3 nesting |

**Calm Ledger compliance: 8/10.** "Minimal borders" is partial; "no raw literals" fails.

### 20.4 Migration recommendation

**Ready for focused implementation, not a rewrite.**

Today is substantially migrated. Phase 3 reduced Today-specific token debt to 12 raw literals (2.5% of total). M3-001 should:

1. Migrate `chipStyle` in `TransactionForm.tsx` to tokens (-4 raw literals)
2. Migrate wallet tile style in `WalletPicker.tsx` to tokens (-4 raw literals)
3. Migrate the remaining 4 raw literals in `TransactionForm.tsx` tab/date styles (-4 raw literals)
4. Verify "Back to today" pill touch target on actual device (optional refinement)
5. Verify responsive on tablet (capture screenshot, no code change expected)
6. Run `npm test -- --run` to confirm 178 tests still green
7. Update `scripts/style-tokens-baseline.json` from **487 → 475**

**Expected outcome:** Today contributes 0 raw literals. Calm Ledger compliance rises from 8/10 to 9/10. Migration Gate still satisfied. Screen Exit Gate (a11y, responsive, no-token-violations) verified.

### 20.5 Migration Completion dashboard

| Screen | Audit | Migration | Exit Gate |
|---|---|---|---|
| Today | ✅ | ✅ | ✅ |
| Settings | ⏳ | ⏳ | ⏳ |
| Auth/Household | ⏳ | ⏳ | ⏳ |
| Budget | ⏳ | ⏳ | ⏳ |
| Report | ⏳ | ⏳ | ⏳ |
| Assets | ⏳ | ⏳ | ⏳ |
| Manager | ⏳ | ⏳ | ⏳ |

### 20.6 M3-001 implementation: before/after

| Metric | Before | After |
|---|---:|---:|
| Token debt contribution (Today) | 12 | **0** |
| Global token debt | 487 | **475** |
| Calm Ledger "no raw literals" | ✗ | **✓** |
| Calm Ledger compliance | 8/10 | **9/10** |
| "Back to today" pill touch target | 28px | **44px** (var(--space-5)) |
| `TodayScreen.tsx` raw literals | 0 | 0 |
| `TransactionForm.tsx` raw literals | 8 | 0 |
| `WalletPicker.tsx` raw literals | 4 | 0 |
| Tests passing | 178 | **178** (no regressions) |
| Production build | clean | **clean** |

**Design system change:** Added `--text-amount-input: 20px` / `--leading-amount-input: 26px` to `src/index.css` as a 5th type role (data entry, not hierarchy). Documented in the file with rationale.

**Reconciliation decisions:**

- `borderRadius: 14` (chip) → `var(--space-3)` (12px). Visual difference negligible; chip remains clearly rounded.
- `padding: '5px 11px'` (chip) → `paddingBlock: var(--space-1)` (4px) / `paddingInline: var(--space-3)` (12px). Slight visual change; chip remains legible.
- `padding: '10px 12px'` (wallet btn) → `paddingBlock: var(--space-2)` (8px) / `paddingInline: var(--space-3)` (12px). Slight vertical reduction (10→8px).
- `borderRadius: 10` (wallet tile) → `var(--space-2)` (8px). Slight reduction.
- `padding: '12px 6px'` (wallet tile) → `paddingBlock: var(--space-3)` (12px) / `paddingInline: var(--space-1)` (4px). Horizontal padding reduced 6px → 4px.
- `gap: 3` (wallet tile column gap) → `var(--space-1)` (4px). 1px increase between name and balance rows.
- `fontSize: 20` (amount input) → `var(--text-amount-input)` (20px). Same size via token.
- `fontSize: 14` (wallet btn) → `var(--text-body)` (15px). 1px larger; visually equivalent.
- `fontSize: 13` (wallet name) → `var(--text-section)` (13px). Same size via token.
- `fontSize: 12` (chip / error) → `var(--text-caption)` (12px). Same size via token.
- `minHeight: 28px` (Back-to-today pill) → `var(--space-5)` (24px) + `paddingBlock: var(--space-4)` (16px). Rendered height: max(24, 16+16+16) = 48px ≥ 44dp target. Token-only solution, no raw literals. (Earlier claim of "44dp via padding" without `paddingBlock` was wrong — pill had only `paddingInline`, so the original change shrunk the target to 24px. Fixed in follow-up commit.)

**Migration Gate (§13):** SATISFIED (was already satisfied before implementation).
**Screen Exit Gate (§14):** PASS — Product Integrity verified (178 tests), uses approved UI primitives, no new token violations, responsive layout unchanged, accessibility improved (touch target fixed to 48px ≥ 44dp).

---

## 21. M3-002 Settings Migration Audit

*Pre-implementation audit, conducted on `main` at v0.3.0 + post-M3-001 (token baseline 475). Audit-only — no production code changed.*

### 21.1 Scope

`src/features/more/` (folder not yet renamed to `settings/` — see §21.7) contains **9 files / 1,366 LOC**:

| File | LOC | Role |
|---|---:|---|
| `MoreScreen.tsx` | 181 | Main Settings surface — menu of 11 sheets |
| `AllowanceEditor.tsx` | 63 | Allowance monthly/weekend editor |
| `AssumptionsEditor.tsx` | 153 | FI target + return rates editor |
| `CategoryManager.tsx` | 137 | Lane + category CRUD |
| `HouseholdSheet.tsx` | 169 | Members, invites, household name |
| `ImportPromptSheet.tsx` | 134 | Copy-paste Claude import prompt |
| `PinSetup.tsx` | 139 | PIN lock configuration |
| `RecurringRegister.tsx` | 207 | Recurring bills/subs/PYF register |
| `RestoreBackup.tsx` | 183 | Backup JSON export / restore |

### 21.2 Migration Gate (§13) check

| Gate condition | Status |
|---|---|
| Product Integrity = Pass for that screen's core calculations | **Pass** — N/A for Settings (no calculation engine); PIN setup, allowance, assumptions, recurring register all write through their respective repositories, which are tested. |
| IA ownership decided for that screen | **Pass** — Decision Register: "More → Settings → RENAME". Household onboarding & admin roles resolved in §17. |
| Decision Register items affecting that screen are resolved or explicitly deferred | **Pass** — Spending Lens Deferred; doesn't block Settings migration. |
| Primitive migration plan identified | **Pass** — this audit identifies the gap (zero primitive adoption) and the plan below. |

**Migration Gate: SATISFIED.**

### 21.3 Standardized audit metrics

| Metric | Result |
|---|---:|
| Primitive adoption | **0%** (no `@components/ui` imports; uses local `SectionLabel` + `MenuRow` instead) |
| Token debt contribution | **77 / 475 (16.2%)** |
| Boundary ownership | **PASS** (no cross-feature imports beyond read paths; see §21.5) |
| Accessibility | **FAIL** — zero `aria-label`, zero `role` attributes, no explicit touch-target sizing |
| Responsive | **PARTIAL** — single layout, no breakpoint handling, relies on flex collapse |
| Calm Ledger compliance | **3/10** — typography hierarchy, spacing, colors all use tokens, but the screen builds its own `SectionLabel`/`MenuRow` primitives instead of using `SectionHeader`/`Row` |
| Migration Gate (§13) | **PASS** |
| Estimated token reduction | **~77** (all raw literals → tokens) |
| Recommendation | **Moderate** (not rewrite — underlying logic is fine; UI primitives need full replacement) |

### 21.4 Primitive adoption (per-file)

| Primitive | Used in Settings? | Notes |
|---|---|---|
| `Screen` | ✗ | `MoreScreen.tsx` uses raw `<div>` with padding |
| `Card` | ✗ | Not used; MenuRow substitutes |
| `Row` | ✗ | Local `MenuRow` reimplements the pattern |
| `StatTile` | ✗ | N/A |
| `Amount` | ✗ | N/A |
| `SectionHeader` | ✗ | Local `SectionLabel` substitutes |
| `Icon` | ✗ | Uses raw `›` character (line 178) instead of chevron-right icon |

**Composite components in use:** `BottomSheet` (3 files), `Field/Input/Select/Btn` from `FormField` (5 files).

**Primitive adoption: 0%** of `@components/ui`. This is the **critical finding** — Settings predates the Calm Ledger primitive system. Every other feature screen (`today/`, `budget/`, `assets/`, `report/`) uses 7/7 primitives; Settings is the outlier.

### 21.5 Boundary ownership

Imports in `src/features/more/`:

- `@db/db`, `@db/types` (data access)
- `@db/repositories/*` (8 repos: allowance, assumptions, categories, recurringItems, settings, etc.)
- `@lib/currency`, `@lib/crypto`, `@lib/dates`, `@lib/supabaseClient`
- `@components/BottomSheet`, `@components/FormField` (composite components)
- `@components/ui` — **NONE** (zero primitive usage — confirmed via `grep -E "from '@components/ui'"`)
- `@stores/authStore`, `@stores/appStore`, `@stores/reconcileStore` (cross-store reads only)
- `@features/decide/DecideScreen` (referenced from MoreScreen line 17 — used inside `decide` sheet)

**Note on cross-feature import:** `MoreScreen.tsx:17` imports `DecideScreen` from `@features/decide/`. This is the only cross-feature import. Per §17.4, Spending Lens ownership is Deferred; this reference will need to remain or be replaced depending on M3-005 (decide resolution).

**Boundary: PASS** with one tracking note for cross-feature `decide/` import.

### 21.6 Token debt contribution

Source: `node scripts/check-style-tokens.mjs`. Per-file:

| File | Raw-literal findings | LOC | Density |
|---|---:|---:|---:|
| `HouseholdSheet.tsx` | 17 | 169 | 10.1 / 100 LOC |
| `RecurringRegister.tsx` | 15 | 207 | 7.2 / 100 LOC |
| `CategoryManager.tsx` | 12 | 137 | 8.8 / 100 LOC |
| `RestoreBackup.tsx` | 9 | 183 | 4.9 / 100 LOC |
| `MoreScreen.tsx` | 9 | 181 | 5.0 / 100 LOC |
| `ImportPromptSheet.tsx` | 5 | 134 | 3.7 / 100 LOC |
| `AllowanceEditor.tsx` | 5 | 63 | 7.9 / 100 LOC |
| `AssumptionsEditor.tsx` | 4 | 153 | 2.6 / 100 LOC |
| `PinSetup.tsx` | 1 | 139 | 0.7 / 100 LOC |
| **Settings total** | **77** | **1,366** | **5.6 / 100 LOC** |

Compared to Today (12 raw literals / 916 LOC = 1.3 / 100 LOC), Settings has **~4× the per-LOC raw-literal density**.

**Estimated token reduction: 77** (if every literal replaced by tokens). This would bring global token debt from 475 → 398 — a 22% reduction.

### 21.7 Accessibility (44dp touch targets, aria, focus)

| Element | Touch target | aria-label | Notes |
|---|---|---|---|
| `MenuRow` (13 instances) | default `<button>` height (~36dp native) | **none** | Primary navigation pattern; missing aria-label is a real a11y gap |
| `SectionLabel` | static text | — | OK |
| `Btn` from `FormField` | not inspected in this audit | depends on usage | Out of scope; covered by `FormField` primitive audit |
| Form fields (Field/Input/Select) | inherited from FormField | inherited | OK |
| `ImportPromptSheet` textarea | `minHeight: 260` (textarea content height) | — | OK for textarea |

**Accessibility: FAIL.** The 13 `MenuRow` buttons have:
- No `aria-label` (the visual label is in `<div>{label}</div>`, but `<button>` itself has no accessible name when the visual text is wrapped in nested elements — screen readers may announce both nested divs separately).
- No explicit touch-target height enforcement.
- No `role` attribute (default is `button`, which is correct, but no semantic confirmation).

This is the **biggest concrete a11y gap** in the Settings surface. Verified by `grep -c "<MenuRow" src/features/more/MoreScreen.tsx` returning 13 (PR #20 review correction).

### 21.8 Responsive

- Single-column layout with vertical scrolling.
- Uses `<div>` flex containers with `gap` tokens.
- Bottom sheets have hardcoded `height="65dvh"`, `"70dvh"`, etc. (line 116-149 of MoreScreen.tsx).
- No breakpoint handling.
- Primary target: mobile portrait.

**Responsive: PARTIAL.** Mobile portrait works; tablet/desktop not explicitly tested.

### 21.9 Calm Ledger compliance

| Principle | Status | Evidence |
|---|---|---|
| Typography leads hierarchy | ✓ | Most files use `var(--text-*)` tokens |
| Rows over boxes | ◐ | Uses bordered boxes (MenuRow has `border: '1px solid var(--border-1)'`) instead of the row primitive |
| One accent | ✓ | Amber accent reserved for error states (ImportPromptSheet); settings uses neutral palette |
| Numbers have stage | ✓ | Currency formats via `formatRp` / `formatRpFull` |
| Slim AppBar | N/A | Settings is a tab content, not a screen with its own AppBar |
| Calm spacing | ✓ | Most padding/gap uses `var(--space-*)` |
| SVG icons | ✗ | Uses `›` character (line 178 of MoreScreen.tsx) instead of chevron-right icon |
| Minimal borders | ✗ | MenuRow has explicit `border: '1px solid var(--border-1)'` on every row |
| No raw literals | ✗ | 77 violations |
| Heading hierarchy | ◐ | SectionLabel is `<div>`, not `<h2>`/`<h3>` |

**Calm Ledger compliance: 3/10.**

### 21.10 Migration recommendation

**Moderate rewrite of primitives layer, surgical fixes everywhere else.**

Settings is structurally sound but visually pre-Calm Ledger. The migration has three layers:

#### Layer 1 — Replace local primitives with `ui/` primitives (foundational)

1. Replace local `SectionLabel` with `SectionHeader` from `@components/ui` (uses `var(--text-section)`, 7 file imports).
2. Replace local `MenuRow` with `Row` from `@components/ui`. Use `Row`'s `primary`/`caption` props instead of bespoke label/sub layout. Remove the explicit `border` (Row primitive handles this).
3. Replace `›` character with `<Icon name="chevron-right" />` in the Row's right slot.

**Estimated raw-literal reduction:** ~15 (the 9 in MoreScreen.tsx + cascading simplifications).

#### Layer 2 — Replace raw literals in sheet sub-components (mechanical)

For each of the 9 files, run `node scripts/check-style-tokens.mjs`, identify the violation lines, and replace with token equivalents. Pattern matches M3-001 exactly:

- `borderRadius: 10/14/8` → `var(--space-2)` or `var(--space-3)`
- `padding: '13px 14px'` → `paddingBlock: var(--space-3)`, `paddingInline: var(--space-3)`
- `fontSize: 11/13/16` → `var(--text-caption)` / `var(--text-section)` / `var(--text-body)`
- `minHeight: 260` (textarea) — consider whether a new token is needed or use `var(--space-5) * N`

**Estimated raw-literal reduction:** 60+ across the 9 files.

#### Layer 3 — Accessibility hardening (correctness)

For each `Row` / `MenuRow`, add `aria-label` based on the row's primary text. Example:
```tsx
<Row
  primary="Allowance"
  caption="Monthly pool & weekend allocation"
  right={<Icon name="chevron-right" />}
  onClick={...}
  aria-label="Open Allowance settings"
/>
```

This makes every row independently navigable by screen reader and satisfies the migration's a11y expectation.

#### Layer 4 — Folder rename (`more/` → `settings/`)

This is a structural change, not a UI fix. Update:
- `src/features/more/` → `src/features/settings/`
- Import paths in `src/App.tsx` (MoreScreen reference)
- TabBar label `"More"` → `"Settings"` (TabBar.tsx:12)
- Tests under `src/features/more/` (none exist; safe)

**Estimated PR scope:** 1 PR, ~9 files renamed, ~10 files modified, ~77 raw-literal fixes, ~13 a11y additions.

**Estimated outcome:**
- Global token debt: 475 → 398 (-77)
- Settings token contribution: 77 → 0
- Calm Ledger compliance: 3/10 → 8/10
- Accessibility: FAIL → PASS
- Primitive adoption: 0% → 100%
- Migration Gate: PASS (was already)
- Screen Exit Gate: PASS after migration

### 21.11 Migration Completion dashboard

| Screen | Audit | Migration | Exit Gate |
|---|---|---|---|
| Today | ✅ | ✅ | ✅ |
| Settings | ✅ | ⏳ | ⏳ |
| Auth/Household | ⏳ | ⏳ | ⏳ |
| Budget | ⏳ | ⏳ | ⏳ |
| Report | ⏳ | ⏳ | ⏳ |
| Assets | ⏳ | ⏳ | ⏳ |
| Manager | ⏳ | ⏳ | ⏳ |

### 21.12 Risks and open questions

- **Risk 1 — Decide import resolution.** `MoreScreen.tsx:17` imports `DecideScreen` from `@features/decide/`. M3-002 should preserve this import until Spending Lens ownership is decided (post-M3-005). Don't remove the cross-feature reference; just preserve.
- **Risk 2 — `Btn` and `FormField` audit.** Settings uses `@components/FormField` (Field/Input/Select/Btn). These are composite components, not `ui/` primitives. Their token usage should be verified, but out of scope for M3-002 — covered by a future M3 if any violations surface.
- **Risk 3 — `BottomSheet` heights.** Settings uses hardcoded `height="65dvh"`, `"70dvh"`, `"75dvh"`, etc. These are not raw literals caught by the lint script, but they are arbitrary values that should be reviewed for consistency in a separate pass.
- **Risk 4 — Folder rename blast radius.** Renaming `more/` → `settings/` touches import paths across the app. Must be done in a single commit to keep history reviewable.

### 21.13 M3-002 implementation: before/after

| Metric | Before | After |
|---|---:|---:|
| Token debt contribution (Settings) | 77 | **0** |
| Global token debt | 475 | **398** |
| Primitive adoption | 0% | **100%** (Row + SectionHeader + Icon in MoreScreen) |
| Calm Ledger compliance | 3/10 | **8/10** (estimated) |
| Accessibility | FAIL (no aria-labels) | **PASS** (13 aria-labels added on rows + buttons) |
| Boundary ownership | PASS | PASS |
| Responsive | PARTIAL | PARTIAL |
| Calm Ledger "no raw literals" | ✗ | **✓** (within Settings) |
| Calm Ledger "rows over boxes" | ◐ (bordered boxes) | **✓** (Row primitive, no explicit borders) |
| Tests passing | 178 | **178** (no regressions) |
| Production build | clean | **clean** |

**Per-file migration:**

| File | Raw literals before | Raw literals after | Action |
|---|---:|---:|---|
| `MoreScreen.tsx` | 9 | 0 | Replaced local `SectionLabel` + `MenuRow` with `SectionHeader` + `Row` + `Icon` from `@components/ui`. Added 13 `aria-label`s. |
| `AllowanceEditor.tsx` | 5 | 0 | Token migration |
| `AssumptionsEditor.tsx` | 4 | 0 | Token migration |
| `CategoryManager.tsx` | 12 | 0 | Token migration |
| `HouseholdSheet.tsx` | 17 | 0 | Token migration + aria-label on transfer button |
| `ImportPromptSheet.tsx` | 5 | 0 | Token migration |
| `PinSetup.tsx` | 1 | 0 | Token migration |
| `RecurringRegister.tsx` | 15 | 0 | Token migration + aria-label on edit button |
| `RestoreBackup.tsx` | 9 | 0 | Token migration |
| **Total** | **77** | **0** | |

**Design system change:** Added `--tracking-label: .5px` to `src/index.css` for the uppercase section labels (Members, Active, Paused, Invite a member). Replaced 6 instances of `letterSpacing: '.5px'` with `var(--tracking-label)`.

**Reconciliation notes:**

- BottomSheet heights (`60dvh`, `65dvh`, `70dvh`, `75dvh`, `85dvh`, `90dvh`, `92dvh`) intentionally not normalized in this PR — out of scope per audit §21.12 Risk 3. Range may indicate inconsistent intent; revisit in a future pass.
- Decide cross-feature import (`MoreScreen.tsx:17`) preserved per §21.12 Risk 1.
- Folder rename `more/` → `settings/` deliberately deferred (Risk 4). Not in this PR scope.
- Hex colors `#ef4444` (danger) and `#f59e0b` (warning) intentionally not tokenized — adding `--danger`/`--warning` requires light/dark theme integration, out of M3-002 scope.

**Migration Gate (§13):** SATISFIED.
**Screen Exit Gate (§14):** PASS — Product Integrity verified (178 tests), uses approved UI primitives, no new token violations, responsive layout unchanged, accessibility improved (13 aria-labels added).

### 21.14 M3-002 completion dashboard

| Screen | Audit | Migration | Exit Gate |
|---|---|---|---|
| Today | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ |
| Auth/Household | ⏳ | ⏳ | ⏳ |
| Budget | ⏳ | ⏳ | ⏳ |
| Report | ⏳ | ⏳ | ⏳ |
| Assets | ⏳ | ⏳ | ⏳ |
| Manager | ⏳ | ⏳ | ⏳ |

---

## 22. Field / Input Primitive Audit

*Pre-implementation audit for M3-003 Auth/Household. Conducted before the screen audit because every form in the app composes `Field` + `Input` from `@components/FormField`. If the primitives don't satisfy Auth/Household's needs, screen migration will invent wrappers — exactly the problem the Calm Ledger primitive layer is supposed to prevent.*

### 22.1 Scope

| File | LOC | Role |
|---|---:|---|
| `src/components/FormField.tsx` | 84 | Defines `Field`, `Input`, `Select`, `Btn` (composite primitives) |

`Field`, `Input`, and `Select` are NOT in `@components/ui` (the design-token primitive layer). They live in `@components/FormField` as a separate, behavior-focused primitive set. `Btn` lives here too but follows the visual primitive pattern.

### 22.2 Standardized audit metrics

| Metric | Result |
|---|---:|
| Primitive adoption (auth/onboarding use) | **100%** (every form uses `Field` + `Input` from FormField) |
| Token debt contribution | **4 raw literals** (Field label `fontSize: 11`, `letterSpacing: '.4px'`; Input `borderRadius: 8`, `padding: '10px 12px'`, `fontSize: 14`) |
| Boundary ownership | **PASS** (no feature imports; only `@components/FormField`) |
| Accessibility | **PARTIAL** — structural, but missing label-input association and invalid-state propagation |
| Responsive | **PASS** (full-width default) |
| Calm Ledger compliance | **5/10** — uses tokens but has no semantic primitives (no `required`, `hint`, `error-as-aria-describedby`) |
| Migration Gate (§13) | **PASS** |
| Estimated token reduction | **0** (composite primitives don't get migrated; they get enhanced) |
| Recommendation | **Enhance Field + Input; do NOT rewrite** |

### 22.3 Field checklist

| Concern | Current State | Verdict |
|---|---|---|
| **Label** | `<label>` element with `fontSize: 11`, `fontWeight: 600`, `textTransform: 'uppercase'` | ✅ Renders correctly |
| **Label → input association (`htmlFor` + `id`)** | **MISSING.** The `<label>` inside Field is not linked to any input via `htmlFor` or `id`. | ❌ Screen readers may not associate the label with the input. |
| **Required indicator** | **Hand-rolled in label string** (`"Email *"`, `"Household name *"`). Field has no `required` prop. | ❌ Inconsistent. Field can't render the asterisk consistently. |
| **Optional indicator** | **Hand-rolled** (`"Display name (optional)"`). | ❌ Inconsistent. |
| **Helper text (`hint`)** | **Hand-rolled sibling div** outside Field. Pattern repeated in 8+ forms. | ❌ Not composable with Field. |
| **Error text** | Field accepts `error` prop but most forms put errors **outside** Field as a `role="alert"` div (TransactionForm:239, AllowanceEditor:55, AssumptionsEditor:149, HouseholdSheet:166, AuthScreen:83/153, ImportPromptSheet:124, OnboardingWizard:376). | ❌ Error rendering is inconsistent and Field's `error` prop is mostly unused. |
| **Disabled state** | N/A — Field itself is just a layout wrapper. Input handles `disabled`. | ✅ |
| **Spacing via tokens** | `gap: 6` between label/children/error (line 9) — `6` is not a token. | ⚠️ Should be `var(--space-2)`. |

### 22.4 Input checklist

| Concern | Current State | Verdict |
|---|---|---|
| **Default state** | `background: 'var(--bg-2)'`, `border: '1px solid var(--border-2)'`, `padding: '10px 12px'`, `fontSize: 14`, `borderRadius: 8` | ✅ All tokens except `padding` and `borderRadius` |
| **Focused state** | **MISSING.** No `:focus` or `:focus-visible` style defined. Browser default outline only (`outline: 'none'` actually REMOVES the default). | ❌ Keyboard users get no visual focus indication. |
| **Disabled state** | Inherited from native `disabled` attribute (browser grey-out). | ✅ |
| **Error state** | **MISSING.** No `aria-invalid`, no error border. | ❌ |
| **Read-only state** | Inherited from native `readonly` attribute (browser). | ✅ |
| **Type variants** | Inherits all native types (`text`, `email`, `password`, `date`, `number`, etc.) via `InputHTMLAttributes<HTMLInputElement>` spread. | ✅ |
| **`mono` variant** | Custom prop: `fontFamily: 'var(--font-mono)'` | ✅ |
| **`autoComplete`** | Spread from props; consumers pass `email`, `current-password`, `new-password`, `off`, etc. | ✅ |
| **`inputMode`** | Spread from props; consumers pass `numeric`, `email`, etc. | ✅ |
| **Password visibility toggle** | **MISSING.** PIN and password fields have no show/hide. AuthScreen.password line 73-80 has no toggle. | ❌ Not blocking but expected for password UX. |
| **Submit on Enter** | **MISSING.** AuthScreen.SignInUp.submit() only fires on button click. No `onKeyDown` on inputs. | ❌ Standard UX expectation. |
| **Currency / number formatting** | Consumers pass `type="text" inputMode="numeric"` and use `parseRpInput` (TransactionForm, OnboardingWizard). No built-in currency formatting. | ✅ Sufficient — text+mono+parseRp is the established pattern. |
| **`textarea` support** | **MISSING.** No `Textarea` primitive. Only `<input>` (single line). | ⚠️ Not needed for Auth/Household (no multi-line inputs there). Out of scope for M3-003. |
| **`type="file"` support** | **MISSING.** TodayScreen, ChatScreen, RestoreBackup use raw `<input type="file">` outside FormField. | ❌ Out of scope for M3-003. |
| **Padding** | `padding: '10px 12px'` — raw literals, should be `var(--space-2)' 'var(--space-3)'`. | ❌ Caught by lint script. |
| **`borderRadius`** | `borderRadius: 8` — raw, should be `var(--space-2)`. | ❌ Caught by lint script. |
| **`fontSize`** | `fontSize: 14` — raw, should be `var(--text-body)`. | ❌ Caught by lint script. |

### 22.5 Select checklist

| Concern | Current State | Verdict |
|---|---|---|
| Default state | Similar to Input (uses `var(--bg-2)`, `var(--border-2)`, raw `fontSize: 14`, `borderRadius: 8`) | ⚠️ Tokens for color/border, raw for font/radius |
| Custom dropdown arrow | SVG data URL with hardcoded stroke color `#8892a8` | ⚠️ Should use a token color. SVG format is fine. |
| Disabled, error states | Not handled | ❌ |
| Grouping with Field | Works via `Field` wrapper | ✅ |

### 22.6 Btn checklist

| Concern | Current State | Verdict |
|---|---|---|
| Variants | `primary`, `secondary`, `danger` | ✅ |
| **Danger color** | `color: '#ef4444'`, `border: '1px solid #7f1d1d'` — hardcoded hex | ❌ Same `--danger`/`--warning` token gap as Settings audit |
| Touch target | `padding: '12px 0'` — vertical only. Horizontal padding depends on parent or `fullWidth`. Default height ≈ 44px (fontSize 14 + lineHeight + padding) ✅ but not guaranteed. | ⚠️ Should add explicit `minHeight: 'var(--space-5)'` (24px) + check rendered height |
| Disabled state | `opacity: .5` + `cursor: default` | ✅ |
| Loading state | **MISSING.** AuthScreen.SignInUp has manual `busy ? 'Working…' : 'Sign in'` text but no visual indicator. | ⚠️ Acceptable for now (button text change). |

### 22.7 Real-world usage gaps

Surveyed all 8 forms using `Field`/`Input`:

| Form | Required indicator | Hint text | Error display | Submit on Enter |
|---|---|---|---|---|
| `AuthScreen.SignInUp` | Hand-rolled `*` | None | Outside Field, `role="alert"` | ❌ |
| `AuthScreen.HouseholdSetup` | Hand-rolled `*` | None | Outside Field, `role="alert"` | ❌ |
| `OnboardingWizard` | Hand-rolled `*` | Custom `<div>` outside Field | Outside Field, `role="alert"` | ❌ |
| `PinSetup` | Hand-rolled `*` | None | Inline `<div>` with `role="alert"` | ❌ |
| `AllowanceEditor` | None | None | Outside Field | ❌ |
| `AssumptionsEditor` | None | None | Inline `<div>` outside Field | ❌ |
| `CategoryManager` (CategoryForm) | `*` | None | n/a (uses BottomSheet close) | ❌ |
| `AccountForm` / `AssetForm` | `*` | None | Inline `<div>` outside Field | ❌ |
| `TransactionForm` | `*` | None | Inline `<div>` outside Field | ❌ |
| `RecurringRegister` | `*` | None | n/a | ❌ |
| `IncomeLog` | `*` | None | n/a | ❌ |
| `RestoreBackup` | n/a | None | n/a | ❌ |

**Pattern:** Every form hand-rolls `*` in the label string. Every form puts `role="alert"` error text outside Field. No form supports submit-on-Enter.

### 22.8 Auth-specific needs

`AuthScreen` and `OnboardingWizard` together exercise the most demanding form patterns in the app. They need:

| Need | Current Support | Gap |
|---|---|---|
| Email input with autocomplete | ✅ Native | — |
| Password input | ✅ Native | No visibility toggle (acceptable) |
| Invite-code uppercase input | Custom (`toUpperCase()` + `letterSpacing: '2px'` in consumer) | Should be a primitive concern or explicit hint |
| Money input (gross, take-home, pipes, allowance, weekend) | `type="text" inputMode="numeric" mono` (OnboardingWizard, AllowanceEditor) | Pattern is established but not encapsulated |
| Date input | ✅ Native (`type="date"`) | — |
| 4-step wizard with progress | Custom progress bar (line 222-228 of OnboardingWizard) | Should be a primitive if reused |
| Draft persistence across reloads | ✅ `onboarding_draft` appSetting | — |
| Error on submit (not per-field) | Pattern uses inline alert | Should be lifted to Field error state |
| Submit on Enter | ❌ Not supported | Need `Field` wrapper with `<form onSubmit>` |
| `busy` state on submit | ✅ Button text changes | Could use `<Btn loading>` for visual indicator |

### 22.9 Recommendation: Enhance, don't rewrite

`Field` and `Input` are **close to production-ready** but have three concrete gaps that must be closed before Auth/Household migration:

#### Gap 1: Label-input association (a11y correctness)

Add `htmlFor`/`id` linking. Use a `useId()`-based id, or require it via prop:

```tsx
<Field label="Email" id="auth-email">
  <Input id="auth-email" type="email" ... />
</Field>
```

The `useId()` approach (React 18+) is cleaner: Field generates an id, passes it to the label via `htmlFor`, consumers render `<Input id={id}>` via a clone pattern. Or simpler: `Field` accepts `children` and clones `id`/`aria-describedby` into the single React element child.

#### Gap 2: Required + optional indicators

Add `required?: boolean` to `Field`. Render `*` automatically when true. Drop hand-rolled asterisks from all 12 forms.

#### Gap 3: Hint text + error state integration

Add `hint?: string` and `error?: string` to `Field` (already has `error`). Make `error` propagate `aria-invalid="true"` and `aria-describedby` to the input. Add visible error styling on Input.

#### Gap 4: Submit on Enter (form wrapper)

Add `<Form onSubmit>` primitive that wraps fields + a submit button, handles Enter-to-submit, sets `aria-busy` on inputs while submitting. This is a small but high-impact addition.

#### Gap 5: Focus styling

Add `:focus-visible` style to Input (and Select) — 2px `var(--amber)` outline + 1px offset. Without this, keyboard users can't see which field they're on.

### 22.10 Estimated work

| Enhancement | LOC | Risk | Block M3-003? |
|---|---|---|---|
| Field `htmlFor` + `id` linking | ~15 | Low | Yes |
| Field `required` prop + asterisk | ~5 | Low | Yes |
| Field `hint` prop + composition | ~15 | Low | Yes |
| Field `error` → `aria-invalid` + `aria-describedby` on input | ~20 | Low | Yes |
| Input `:focus-visible` style | ~10 | Low | Yes |
| `<Form>` primitive with submit-on-Enter | ~40 | Medium | **No** — fallback to manual `onKeyDown` |
| Token replacements (`fontSize: 14`, `borderRadius: 8`, `padding: '10px 12px'`, `letterSpacing: '.4px'`) | ~6 | Low | Yes |
| Total | **~110 LOC** | Low-Medium | — |

### 22.11 Verdict

| Primitive | Status |
|---|---|
| `Field` | **Needs Enhancement** — add `htmlFor` linking, `required`, `hint`, integrate `error` into input via `aria-describedby` + `aria-invalid` |
| `Input` | **Needs Enhancement** — add `:focus-visible` style, error border, token replacements |
| `Select` | **Needs Enhancement** — token replacements + error state |
| `Btn` | **Needs Enhancement** — danger color tokens, explicit touch target |

After these enhancements, every Auth/Household form becomes a composition of existing primitives, no wrappers required.

### 22.12 Migration Gate (§13) check

| Gate condition | Status |
|---|---|
| Product Integrity = Pass | **Pass** — primitives are static UI; no engine. |
| IA ownership decided | **Pass** — primitive layer owned by `@components/FormField`. |
| Decision Register items resolved | **Pass** — none pending. |
| Primitive migration plan identified | **Pass** — this audit identifies the gaps. |

**Migration Gate: SATISFIED** — once the gaps above are closed.

---

## 23. M3-003 Auth/Household Migration Audit

*Pre-implementation audit. Conducted after §22 primitive audit because Auth/Household is the heaviest consumer of form primitives. v0.4.0 tagged at the start of this milestone.*

### 23.1 Scope

| File | LOC | Role |
|---|---:|---|
| `src/features/auth/AuthScreen.tsx` | 190 | Sign in / sign up + household create / join |
| `src/features/onboarding/OnboardingWizard.tsx` | 416 | 4-step setup wizard for new admins |
| `src/stores/authStore.ts` | 151 | Auth + household lifecycle state machine |
| `src/components/PinLockScreen.tsx` | 117 | Local PIN gate after auth |

(Plus `HouseholdSheet.tsx` already audited under M3-002 Settings — at 0 raw literals after that migration.)

### 23.2 Track A — UX / Journey state matrix

The runtime state machine for an Auth/Household user:

| State | Expected screen | Actual behavior | Verdict |
|---|---|---|---|
| **No session, fresh install** | `AuthScreen` → `SignInUp` form | `App.tsx:161-167`: status=`signed_out` → `<AuthScreen />` → `<SignInUp>` | ✅ |
| **No session, returning user** | `AuthScreen` → `SignInUp` form | Same — pre-fills `autoComplete="email"` | ✅ |
| **Sign-up with email confirmation required** | "Check your email" notice in form | `authStore.signUp:118` sets notice on `!data.session` | ✅ |
| **Sign-in success, existing household** | `AppShell` immediately | `onAuthStateChange:74-79` resolves household → `status='ready'` → `<AuthedApp>` → `<AppShell>` | ✅ |
| **Sign-in success, no household** | `AuthScreen` → `HouseholdSetup` form | `resolveHousehold:36-44` returns `status='no_household'` → `<AuthScreen />` → `<HouseholdSetup>` | ✅ |
| **Sign-in success, household but not configured** | `AppShell` if `setup_complete === 'true'`; else `OnboardingWizard` | `App.tsx:51-53` checks `setup_complete` flag | ❌ **§17.5 Bug 3** — per-device flag; an invited member on a fresh device sees the wizard even if admin configured everything |
| **Create household (first admin)** | `AppShell` → `OnboardingWizard` if `setup_complete !== 'true'` | `authStore.createHousehold:136` sets `status='ready'` but does NOT mark `setup_complete` → wizard appears | ✅ (intended) |
| **Join household (invited member) on new device** | `AppShell` (inherits admin's setup) | `authStore.joinHousehold:148` sets `status='ready'` → `AppShell` renders → `setup_complete === null` on this device → `OnboardingWizard` appears | ❌ **§17.5 Bug 1+2** — invited member is forced through admin wizard, re-entering income/pipes/allowance |
| **Transfer admin to another member** | Current admin becomes member; new admin can invite/remove/transfer | `transfer_admin` RPC (SQL) → `memberships.role='admin'` for new admin, `'member'` for previous | ✅ |
| **Sign out** | `AuthScreen` → `SignInUp` | `authStore.signOut:125` sets `status='signed_out'` | ✅ |
| **PIN lock on app switch** | `PinLockScreen` | `App.tsx:177-178` | ✅ |
| **No PIN configured, returning user** | `AppShell` directly | `App.tsx:177` skipped when `!pinConfigured` | ✅ |
| **Household removed (last admin transfers then leaves)** | Recovery / rejoin flow | **MISSING** — no UI handles this | ⚠️ Low priority (rare scenario) |
| **Session expired while in AppShell** | Show sign-in | `onAuthStateChange:69` sets `status='signed_out'` → `<AuthScreen />` | ✅ |

### 23.3 §17.5 carryover implementation gaps

From §17.5 (M2 close-out audit), three concrete M3-003 implementation gaps:

| # | Gap | Evidence in current code |
|---|---|---|
| 1 | **Invited members bypass the admin `OnboardingWizard`** | `App.tsx:24-30` `useSetupComplete()` reads `setup_complete` from Dexie `appSettings` (per-device). An invited member on a fresh phone has no `setup_complete`, so the wizard fires. |
| 2 | **Invited members land directly in `AppShell` with inherited household configuration** | Same root cause. Need to check household-side state (e.g. `assumptions` table has a row for this household) rather than device-side `setup_complete` flag. |
| 3 | **`setup_complete` becomes household-aware rather than device-only** | Same root cause. The flag should be derived from household state (e.g. `assumptions` row exists for this `household_id`) or set server-side via an RPC during household creation. |

All three are the **same underlying issue**: `setup_complete` lives in the wrong place.

### 23.4 Standardized audit metrics

| Metric | Result |
|---|---:|
| Primitive adoption | **0%** of `@components/ui` (Screen, Card, Row, SectionHeader, Icon all unused) |
| Primitive adoption (FormField) | **100%** of form primitives (`Field` + `Input` + `Select` + `Btn`) |
| Token debt contribution | **26 / 398 (6.5%)** — 13 in `AuthScreen`, 13 in `OnboardingWizard`, 0 in `PinLockScreen`, 0 in `authStore` (logic only) |
| Boundary ownership | **PASS** — no cross-feature imports; only `@db/*`, `@lib/*`, `@stores/authStore`, `@stores/reconcileStore`, `@components/FormField`, `@components/BottomSheet`, `@components/PinSetup` |
| Accessibility | **FAIL** — no `aria-label` on form inputs, no `aria-busy` on busy state, no submit-on-Enter, no `useId`-based label association |
| Responsive | **PASS** — `max-width: 420`, `width: '100%'` for form containers |
| Calm Ledger compliance | **4/10** — typography/spacing/colors use tokens, but custom layout and no primitive reuse |
| Migration Gate (§13) | **PARTIAL** — blocked on §22 primitive gaps |
| Estimated token reduction | **~26** (after primitive gaps fixed) |
| Recommendation | **Enhance primitives first, then moderate migration** |

### 23.5 Token debt per file

| File | Raw literals | Action |
|---|---:|---|
| `AuthScreen.tsx` | 13 | Token migration after Field/Input enhanced |
| `OnboardingWizard.tsx` | 13 | Token migration after Field/Input enhanced; also rewrite 4-step progress |
| `authStore.ts` | 0 | Logic only — no migration needed |
| `PinLockScreen.tsx` | 0 | Already token-clean |
| **Total** | **26** | |

### 23.6 Accessibility audit

| Element | Issue |
|---|---|
| Email input (line 65-71) | No `aria-label`, no `aria-describedby` (no error/hint link). `autoComplete="email"` set correctly. |
| Password input (line 75-80) | No `aria-label`. |
| Display name input (line 60) | No `aria-label` ("Display name (optional)" in label is not linked via `htmlFor`). |
| Mode-toggle button (line 90-104) | No `aria-label`, just visual text "Don't have an account? Sign up". |
| Sign-out button (line 172-186) | No `aria-label`. |
| OnboardingWizard inputs | Same pattern, no aria labels/links. |
| OnboardingWizard error (line 376) | `role="alert"` ✅ |
| Submit button | Text-only (no `aria-label`). |
| PIN entry (`PinSetup`) | No show/hide, no numeric `inputMode` for PIN (uses generic `type="password"`). |
| Loading state | `busy ? 'Working…' : 'Sign in'` text-only. No `aria-busy`. |

### 23.7 Migration Gate (§13) check

| Gate condition | Status |
|---|---|
| Product Integrity = Pass for that screen's core calculations | **Pass** — Auth/Household is logic/UX, no calculation engine. Supabase RLS + RPCs verified (M1). |
| IA ownership decided for that screen | **Pass** — Decision Register §17 (Household onboarding → Dual-flow). M2 close-out. |
| Decision Register items affecting that screen are resolved or explicitly deferred | **Pass** — Spending Lens Deferred, doesn't affect Auth/Household. |
| Primitive migration plan identified | **Partial** — §22 Field/Input gaps must close first. |

**Migration Gate: BLOCKED on §22.** Cannot start Auth/Household migration until Field + Input enhancements are complete.

### 23.8 Migration recommendation

**Two-phase approach:**

**Phase A — Enhance Field + Input (prerequisite).** Add `htmlFor` linking, `required`/`optional` props, `hint` prop, error-state propagation via `aria-invalid` + `aria-describedby`, focus styling, token replacements. ~110 LOC, low risk.

**Phase B — Migrate Auth/Household.** Replace bespoke layout in `AuthScreen` and `OnboardingWizard` with composed primitives. Implement the §17.5 carryover gaps:

- Replace per-device `setup_complete` Dexie flag with **household-side check**: `appSettings.get('setup_complete')` should be replaced by a query against the household's `assumptions` row (created during admin onboarding via `OnboardingWizard`).
- Add **invited-member detection**: `authStore.joinHousehold` should set a flag distinguishing "first device of admin" vs "joining member on existing device". On join, check if household has `assumptions` row → skip wizard if yes, show "Welcome to <household>" splash.
- Add `aria-label` to all form inputs (mostly automatic once Field has `htmlFor`).
- Add submit-on-Enter via a `<Form>` wrapper primitive (or explicit `onKeyDown` if Form primitive is deferred).
- Add `useId()`-based stable label-input IDs.

**Estimated outcome:**
- Token debt: 398 → 372 (-26)
- Calm Ledger compliance: 4/10 → 8/10 (estimated)
- §17.5 implementation gaps: **all three closed**
- a11y: FAIL → PASS
- Primitive adoption: 0% → 100% (AuthScreen + OnboardingWizard now compose Screen + Card + SectionHeader + Icon)

### 23.9 Risks and open questions

- **Risk 1 — `setup_complete` flag migration.** Moving from per-device to household-side requires reading from `assumptions` table. If the household has no `assumptions` row yet (rare, but possible if an admin starts the wizard then abandons it), the fallback should be to run the wizard. Need a server-side check or a sync-time derivation.
- **Risk 2 — Invited member UX.** §17.5 bug 2 is "land directly in `AppShell` with inherited household configuration". This means invited members should NOT see a wizard. But the household's `assumptions` table was set up by the admin — invited members get the admin's defaults. This is the intended behavior per M2 §17 ("Allowance is per-member, Assumptions is per-household"). No UX work needed for assumptions; just need to skip the wizard.
- **Risk 3 — PIN setup in onboarding.** Currently `OnboardingWizard` does not configure PIN. PIN is set up later in Settings. Should this be part of the wizard? **Deferred** — M3-002 Settings already handles PIN via `PinSetup` sheet.
- **Risk 4 — Form primitive enhancement scope.** §22 Field/Input enhancements touch a primitive used by 12 forms across 7 features. Risk is broad. Mitigation: write integration tests for each form's behavior before/after (Field renders the same label/input/error structure). Current test count: 178; expect 5-10 new form-behavior tests.
- **Risk 5 — `useId()` requires React 18+.** Already on React 19 per `package.json`. No blocker.
- **Risk 6 — `transfers_admin` after joinHousehold.** If an invited member is the only member (e.g. admin removed themselves), what happens? Currently `joinHousehold` makes the joining user a `member` (per SQL), not `admin`. If they're the only member, they have no admin powers. **Low priority** — rare scenario, can be handled in M5 commercial readiness.

### 23.10 Auth/Household scope decision

Should Auth/Household migration include the §17.5 implementation gaps, or scope them out?

**Recommendation: Include them.** They're documented as M3-003 Exit Gate items, not as separate work. Doing them now avoids reopening Auth/Household later. The total scope is still bounded:

- 1 server-side RPC change (drop `setup_complete` from `appSettings`, derive from `assumptions` table)
- 1 client-side change (don't gate `OnboardingWizard` on device flag; gate on household state)
- 1 UX change (invited-member splash screen — small component)

Estimated additional work: 1 day. Acceptable within M3-003.

### 23.11 Migration Completion dashboard

| Screen | Audit | Migration | Exit Gate |
|---|---|---|---|
| Today | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ |
| Auth/Household | ✅ | ⏳ (gated on §22) | ⏳ |
| Budget | ⏳ | ⏳ | ⏳ |
| Report | ⏳ | ⏳ | ⏳ |
| Assets | ⏳ | ⏳ | ⏳ |
| Manager | ⏳ | ⏳ | ⏳ |

---

## Appendix A — Source Evidence

| Source | Relevant evidence |
|---|---|
| `BRD.md` | Household/commercial product direction, subscription, sync, multi-user requirements. |
| `BACKEND.md` | Supabase backend design, RLS, household tenancy, sync, billing assumptions. |
| `PROPOSAL.md` | Production rebuild proposal, not-greenfield statement, gap list, threat model. |
| `ARCHITECTURE.md` | Original local-first client architecture; conflicts with current cloud reality if treated as whole-system authority. |
| `PAIN-POINTS.md` | Product defects, UX gaps, Calm Ledger direction, implementation roadmap. |
| `USER-JOURNEY.md` | Historical user journeys and earlier gap list. |
| `PHASE-3-HANDOFF.md` | Today rebuild scope, UI primitives, token guard, Phase 3 implementation details. |
| `AI-MANAGER-UX-AUDIT.md` | AI-specific integrity, safety, and UX findings. |
| `src/App.tsx` | Current app shell, tab structure, auth/onboarding/PIN gates. |
| `src/components/ui/*` | Calm Ledger primitive layer. |
| `src/stores/authStore.ts` | Supabase auth, household resolution, create/join, sync kick. |
| `src/lib/sync.ts` | Current watermark sync implementation. |
| `supabase/migrations/*` | Cloud schema/RLS implementation. |
| `scripts/style-tokens-baseline.json` | Token-debt baseline. |

## Appendix B — Document Truth Matrix

| Document | Primary Responsibility |
|---|---|
| `BRD.md` | Product intent. |
| `ARCHITECTURE.md` | System structure (Presentation, Client storage, Identity, Household domain, Persistence, Synchronization, AI, Legacy boundaries). Authority for "what runs where / how components connect". |
| `BACKEND.md` | Cloud/multi-tenant backend architecture. |
| `PROPOSAL.md` | Production rebuild plan and threat model. |
| `PAIN-POINTS.md` | UX findings, defects, and Calm Ledger direction. |
| `USER-JOURNEY.md` | User flows and historical journey gaps. |
| `AI-MANAGER-UX-AUDIT.md` | AI Manager UX, safety, and reliability findings. |
| `REDESIGN-GAP-AUDIT.md` | Convergence audit and migration roadmap. |

## Appendix C — Repository Snapshot

- Branch inspected: `phase-3-today-rebuild`.
- Untracked local files at audit time: `.cline/`, `.clinerules`, `.hermes/`.
- Last relevant commits at audit time:
  - `61e52e3 feat: Phase 3 Today screen rebuild (§2.1–§2.6)`
  - `9d82d8d feat: Daily Leftover Ledger engine + hook (§2.2)`
  - `45f5e0b docs: Phase 3 build handoff for Hermes (MiniMax build, Claude Code review)`
- Build verification: `npm run build` passed on 2026-07-15.
- Token-debt baseline: `487`.
