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
| Household onboarding | Shared generic flow | Admin flow + invited-member flow | Pending | PO |
| Token debt threshold | Baseline 487 | <100 / lower | Proposed: <100 before launch polish | PO + Engineering |
| Architecture source | `ARCHITECTURE.md` + `BACKEND.md` divergence | Update/retire/split authority | Pending | Engineering |
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
| Current | 2 |
| Target | 0 |

When a decision is resolved or explicitly deferred, it is removed from the count.

**M2 close-out update:** Resolved Today landing, Report naming, More → Settings rename, and Manager placement (4 resolved). Added Spending Lens ownership as Deferred. Remaining Pending: Household onboarding, Architecture source. Net change: 6 → 2.

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
| `ARCHITECTURE.md` | Original/local-first client technical architecture. Must be updated or scoped to avoid conflict with cloud reality. |
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
