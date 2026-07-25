# AI Manager — UX Feedback Requirements & Build Plan

**Date:** 2026-07-25 · **Revision:** 4 (D-1 option (c) — computed verdict — added as the recommended resolution)
**Source:** 10 UX feedback tickets + product-vision reprioritisation + PM/Staff-Engineer review
**Structure:** Part I (§0–19) — what the system does. Part II (§20–33) — why someone opened the app.
**Target implementer:** Hermes AI agents, model `minimax-m3` via `anthropic-proxy`
**Grounded against:** `src/ai/context.ts`, `src/ai/tools.ts`, `src/stores/chatStore.ts`, `src/engine/safeToSpend.ts`, `src/lib/balances.ts`, `src/db/types.ts` (Dexie v11), `AI-MANAGER-UX-AUDIT.md` v1.2

---

## 0. Product lens

Every ticket is judged against one question:

> **"Can the user make a good financial decision right now?"**

Ordering follows from it: data must be *present* (T1), then *trusted* (Explain My Number), then *reliable* (T10), then *useful on the day they look* (T5), then *actionable* (Health Check). Polish last.

**One decision is outstanding — see D-1 in §4.** It is a product-principle decision, deliberately not resolved here. As of revision 3 it blocks **two** things: the Health Check ticket's content, and layer 1 of the progressive-disclosure hierarchy in §23. It is now the most consequential open item in the document.

---

## 1. Corrections to the ticket text — read before building

Four tickets, as written, contradict the code. Building them literally ships bugs.

| # | Ticket claim | Reality | Consequence |
|---|---|---|---|
| **C-1** | T4: pool = `income − pipe − bills − subs − weekend` | `allowance.monthly_amount` is **already net** of every recurring item ([safeToSpend.ts:69-74](../../src/engine/safeToSpend.ts)); only the weekend carve-out is subtracted. It is a **declared input**, not derived. | Implementing the stated formula double-counts subs and bills on every screen. |
| **C-2** | T1: "no guided path to set them up" | `src/features/onboarding/OnboardingWizard.tsx` exists (~29KB). | Building a second in-chat wizard creates two paths that drift. Build the bridge. |
| **C-3** | T9 vs audit E11 ("v1 remembers nothing") | `save_memory` is already in the persona ([context.ts:32](../../src/ai/context.ts)), `db.chatMemories` exists, MEMORY block is assembled. | Code shipped past the policy. Ratify it and update E11 in the same PR. |
| **C-5** | T1: "deep links into the right app screens" | No router exists. Navigation is `activeTab` in the app store; the wizard's step is component-local `useState`. | "Deep link" is unbuildable as stated. Restated as programmatic navigation in FR-1.3, with the wizard's step lifted (FR-1.3a) as in-scope prerequisite work. |

**A further correction (C-4) applies to the "Explain My Number" proposal itself** — see §5.

---

## 2. Resolved open questions

| id | Question | Resolution |
|---|---|---|
| **O-10** | Partial-write behaviour | **Answered from code — see §2.1.** Writes are per-row, not batch-atomic (audit B3 confirmed). *But* T10's path writes nothing, and dedupe already exists. The proposed `query_transactions` guard is **dropped as redundant**. |
| **O-9** | Memory scope | **Device-local for this release.** No sync, no RLS. Memory screen states the limitation explicitly. Shared memory deferred to its own ticket. |
| **O-4** | Derived vs declared `monthly_amount` | **Keep declared.** Ship provenance only. Derivation is a separate, larger ticket. |
| **O-2** | Merge under sync conflict | **Defer the merge action.** Ship nickname + disambiguated picker only. |
| **O-X** | Regression-suite budget | **Assume none.** Length and ranking enforcement move into code, never prompt instruction. |

### 2.1 O-10, answered precisely

`logTransactions` ([tools.ts:451-481](../../src/ai/tools.ts)) iterates rows with `await db.transactions.add(...)` and **no Dexie transaction wrapper** — each row commits independently. Audit B3 stands.

Two facts change T10's design:

1. **Unknown-account rows write nothing.** The loop pushes an error string and `continue`s ([tools.ts:452-457](../../src/ai/tools.ts)); it does not throw. When the account is missing, *zero* of those rows were persisted. Re-attempting after `create_account` writes them exactly once. **No double-book is possible on T10's path.**
2. **Dedupe already exists.** Every row is checked via `transactionsRepo.getDuplicateCandidate(date, amount, direction, account_id)` unless `allow_duplicates === true`, and suspects return as `possible_duplicates` ([tools.ts:458-473](../../src/ai/tools.ts)).

**Retained from the O-10 decision:** ≤50-row chunking, row-count verification between chunks, and `allow_duplicates=true` only after explicit user confirmation of flagged rows.
**Dropped:** the `query_transactions` pre-flight guard — it reimplements the dedupe layer above it.
**Still worth doing, but not blocking T10:** the write-atomicity audit (B3).

---

## 3. Requirement taxonomy

**FR** = observable behaviour, assertable · **NFR** = quality constraint (cost, a11y, token budget, i18n, privacy) · **TR** = transition: migration, backfill, prompt version, sync mapper, rollout.

---

## 4. Cross-cutting requirements

### NFR-X1 — Prompt token budget
Persona text may not grow more than 15% from its current size. Any ticket adding a rule removes or compresses one. `minimax-m3` degrades faster than Claude with rule-count growth, and the prompt is rebuilt and re-sent **every turn** — growth is a per-turn multiplier.

### NFR-X2 — Prompt version discipline
`PROMPT_VERSION` ([context.ts:10](../../src/ai/context.ts), currently `4`) increments in the same commit as any persona change, with the ticket id in the commit body. Only trace linking a behaviour regression to a prompt change.

### NFR-X3 — Deterministic UI, non-deterministic model
Every actionable number is computed in `src/engine/**` or `src/lib/**` and rendered by the app. **The model quotes; it never computes.** Binding on Explain My Number, T3, T5, and the Health Check baseline.

### NFR-X4 — Enforcement in code, not prompt
Consequence of O-X. Any requirement of the form "at most N", "≤ N characters", "the most important one" is implemented in context assembly or the UI. Prompt instructions may *describe* the constraint; they may not be the only thing enforcing it.

### NFR-X5 — Indonesian-first copy
All user-facing strings in Indonesian and English. Currency stays `toLocaleString('id-ID')` with `Rp ` prefix.

### NFR-X6 — Device-local truth
Chat and memory stay in device-local Dexie (audit E4). No ticket introduces a server round-trip on a dashboard number's render path.

### TR-X1 — Dexie version allocation *(revised)*
Sequential versions across sprints are fine — v12 → v13 → v14 is normal Dexie. **The hazard is narrower than revision 1 stated:** two in-flight PRs both defining `version(12)` with different stores produce divergent client schemas in the field.

**Allocate up front, one owner per number:**

| Version | Sprint | Fields |
|---|---|---|
| `version(12)` | 1 | `allowance.onboarding_snoozed_until` |
| `version(13)` | 2 | `allowance.workweek_definition` |
| `version(14)` | 3 | `accounts.nickname` |

### TR-X2 — Sync mapper parity
Every new persisted field lands in `src/lib/syncMappers.ts` **and** the Supabase column **and** the RLS policy in the same change — or it silently fails to sync and the partner device shows stale data (audit D3).

### D-1 — OUTSTANDING PRODUCT DECISION (blocks §6 content and §23 layer 1)
The Health Check ticket asks the app to answer *"what should I do next?"* Audit finding **A1 is a P1** whose entire content was removing exactly that, and [context.ts:17](../../src/ai/context.ts) now reads: *"You present facts and trade-offs; the user decides. Never issue a confident verdict."*

**Three options, owner's call:**

- **(a) Principles hold.** Health Check ships as ranked *facts and deltas*. Four of the five proposed insights qualify unchanged. The fifth ("delay this purchase until payday and you'll stay within allowance") ships as a stated trade-off without the conclusion. §23 layer 1 is dropped.
- **(b) Principle #4 is amended.** The model issues affordability verdicts. Requires `AI-MANAGER-UX-AUDIT.md` §2 safety policy, the persona rule, and the A1 finding all updated in one PR.
- **(c) Computed verdict — recommended.** See D-1c below.

### D-1c — the computed verdict *(recommended resolution)*

(a) and (b) both assume a verdict is a *judgement*. It does not have to be. The affordability answer is a threshold over numbers the engine already produces — so compute it, and let the model phrase it.

```
computeAffordability({ amount, safeToSpend, upcomingCommitments, weekendAllocation })
  -> { verdict: 'comfortable' | 'tight' | 'over', driver: <the one number>, margin: number }
```

**Rules:**

- **FR-D1c.1** The verdict is a pure function in `src/engine/**`. Thresholds are named constants, not model judgement, and not magic numbers scattered in a component.
- **FR-D1c.2** The model receives `verdict` and `driver` in the tool/context payload and **phrases** them. It never derives the verdict, and never contradicts it. This keeps NFR-X3 intact — the model still quotes and never computes.
- **FR-D1c.3** The verdict is always accompanied by its driver number in the same breath. "Comfortable" alone is never shown. This is layer 1 and layer 2 of §23 arriving together.
- **FR-D1c.4** Scope is **discretionary purchase affordability only**. Investments (principle #2 — no sell tooling exists), protected items (principle #5), and tax/legal remain verdict-free under all three options.
- **FR-D1c.5** Thresholds are declared in the doc and reviewable — e.g. `comfortable` = amount ≤ remaining pool after upcoming committed spend; `tight` = fits the pool but not the margin; `over` = exceeds it. Tune the numbers, not the mechanism.

**Why this is the better answer:**

| Concern | (b) model judges | (c) engine computes |
|---|---|---|
| Wrong verdict risk | Model reasoning, unbounded | Threshold error, bounded and fixable |
| `minimax-m3` variance | Verdict varies turn to turn | Verdict is deterministic; only phrasing varies |
| Testable | No — needs the unbuilt E6 suite | **Yes — a pure function with a unit test** |
| NFR-X3 | Violated: the model concludes | Upheld: the model quotes |
| Audit A1 | Superseded | **Satisfied in substance** — the objection was to *confident model verdicts*, not to the app stating what its own arithmetic implies |

**(c) still needs the persona rule rewritten** — from "never issue a verdict" to "never *form* a verdict; state the computed one with its driver" — plus a `PROMPT_VERSION` bump. It does **not** require gutting §2's capability boundary or marking A1 superseded, because the safety property A1 protected (no unbounded model judgement about the user's money) survives intact.

**Acceptance assertion (extends §17):** `computeAffordability` is unit-tested across comfortable / tight / over, including the boundary at each threshold, and a fixture where an upcoming committed payment flips `comfortable` to `over`.

**Do not let this be decided implicitly by whoever writes the first insight generator.** §6 and §23 are currently specified against (a). Switching to (c) changes FR-11.3, unblocks §23 layer 1, and adds FR-D1c.1–5.

---

## 5. Explain My Number *(replaces and supersedes T4)*

Generalises T4: every calculated value — Safe to Spend, Personal Pool, Daily Leftover, FI Projection — carries an info affordance that decomposes it.

**Correction C-4 — the proposed sample decomposition is wrong twice.** As proposed:

```
Safe to Spend = Salary − Recurring Bills − Savings − Upcoming Obligations + Available Balance
```

1. Bills, savings, and subs are **already netted** into `monthly_amount` (C-1). Subtracting them again double-counts.
2. `+ Available Balance` adds a **stock** to a **flow**. The account balance is the pot the allowance is drawn *from*, not a component of it. Include it and safe-to-spend leaps by the full balance every payday.

The pattern's risk is exactly its value: ship one wrong decomposition and it is wrong on four screens, each with an info button attesting to it.

### Functional
- **FR-4.1** Every explanation is **generated from the engine result object that produced the number** — the same `SafeToSpendResult` / `FIProjection` fields the UI rendered. No hand-authored per-screen formula strings.
- **FR-4.2** Safe-to-spend decomposes as: `Monthly allowance (you set this)` → `− Weekend allocation` → `= Discretionary` → `÷ weeks in month` → `= This week's pool` → `− Spent this week` → `= Remaining` → `÷ remaining workdays` → `= Safe to spend today`.
- **FR-4.3** Recurring totals (`payYourselfFirstTotal`, `householdBillTotal`, `personalSubTotal` — all already returned by `computeSafeToSpend` for display) render in a separate **"already excluded from your allowance"** block, never inside the subtraction chain.
- **FR-4.4** Declared inputs are visually distinct from derived ones. "You set this" vs "we calculated this" is the actual user need.
- **FR-4.5** Each declared input links to its edit screen.
- **FR-4.6** Unset or zero inputs render `—`, never `Rp 0`, and every derived row below renders `—` too.
- **FR-4.7** The negative-pool warning fires only from `isNegativePool` on real declared commitments; suppressed entirely while the allowance is unset.

### Non-functional
- **NFR-4.1** Zero new math (NFR-X3). If the breakdown needs a value the engine doesn't return, **extend the engine** — never recompute in a component.
- **NFR-4.2** One unit test asserts the decomposition sums to the displayed number, for each explained value. This is the regression guard against C-4 recurring.
- **NFR-4.3** Info affordance is a real button with an accessible name.

### Transition
- **TR-4.1** None — display only, no schema.
- **TR-4.2** Derived `monthly_amount` stays out of scope (O-4). If adopted later it touches the allowance model, onboarding, and every historical comparison.

---

## 6. Financial Health Check *(new — specified against D-1 option (a); see D-1c for the recommended resolution)*

After each sync or import, generate 3–5 prioritised insights.

### Functional
- **FR-11.1** A deterministic rule set generates the baseline. **AI is optional and additive** — the feature works with the model switched off.
- **FR-11.2** Insights are ranked by impact; **ranking is computed in code**, not chosen by the model (NFR-X4).
- **FR-11.3** *(Under (a))* Insights state **facts and deltas**, never recommendations. A trade-off may be stated in full — "buying this today leaves Rp X of this week's pool; waiting until the 25th leaves it untouched" — with the conclusion left to the user. *(Under (b), this constraint is lifted and the audit updates with it.)*
- **FR-11.4** Never more than five, ever.
- **FR-11.5** Each insight deep-links to the screen where it can be acted on.
- **FR-11.6** Dismissed insights stay hidden until their **generating condition changes** — not for a fixed interval.
- **FR-11.7** Protected categories and recurring items are never the subject of a reduction insight (principle #5, [context.ts:18](../../src/ai/context.ts)). An emergency-fund depletion *fact* is permitted; steering away from funding it is not.

### Non-functional
- **NFR-11.1** Baseline generation is synchronous local computation over Dexie — no model call on the render path.
- **NFR-11.2** Insight copy carries no moralising register. State the number; skip the adjective.
- **NFR-11.3** Suppressed entirely for empty-state households — an unconfigured household would otherwise generate five insights about missing data. That is T1's job.

### Transition
- **TR-11.1** Dismissal state needs persistence keyed by **insight type + generating condition hash**, so FR-11.6 is enforceable. Allocate a Dexie version when the ticket is scheduled.
- **TR-11.2** Ships **after** T1 and Explain My Number — insights over untrusted or unexplained numbers erode the trust they depend on.

---

## 7. T1 — Onboarding for empty-state households *(split)*

Per C-2: bridge to the existing wizard, do not build a second one.

**The split matters.** T1 is the most prompt-dependent ticket in the set, running on an uncharacterised model with no regression suite. Its deterministic half is ordinary app code; only the model's phrasing is unproven. Split so a bad onboarding turn is a copy fix, not a data bug.

### T1a — Deterministic (Sprint 1)
- **FR-1.1** When `recurringItems` is empty **and** `chatMemories` is empty **and** `allowance.monthly_amount === 0`, `buildSystemPrompt` emits `=== ONBOARDING STATE ===` naming the outstanding steps.
- **FR-1.2** Snooze sets `onboarding_snoozed_until` to end-of-day local. While snoozed the section is **omitted from the prompt entirely** — suppression in context assembly, never "ask the model to stay quiet".
- **FR-1.3** **Correction C-5 — "deep links" do not exist in this app and must not be specified as URLs.** There is no router (`package.json` has no routing dependency); navigation is `activeTab` in the app store ([App.tsx:33](../../src/App.tsx)), and the wizard's step is component-local `useState` ([OnboardingWizard.tsx:57](../../src/features/onboarding/OnboardingWizard.tsx)), unaddressable from outside. The requirement is therefore **programmatic navigation**: a jump target sets `activeTab` and the wizard's starting step.
- **FR-1.3a** Lift the wizard's `step` from local state to an entry prop (or store value) so a caller can open it at a chosen step. This is prerequisite work inside T1a's scope, not a freebie — budget it.
- **FR-1.3b** The existing persisted draft (`step` is already written to the draft, [OnboardingWizard.tsx:112](../../src/features/onboarding/OnboardingWizard.tsx)) must keep winning over the requested step when a draft is mid-flight, or a jump silently discards in-progress answers.
- **FR-1.4** Once all three steps have data the section disappears permanently, and safe-to-spend / FI stop rendering null states.

### T1b — Model-facing (Sprint 2)
- **FR-1.5** On the first assistant turn in that state, the three steps are offered in one short message.
- **FR-1.6** Each step is completable in chat (`log_income`, `add_recurring_item`) or by the jump target of FR-1.3.

### Non-functional
- **NFR-1.1** ≤ 400 characters added to the prompt; zero cost once complete or snoozed.
- **NFR-1.2** Jumping to the wizard and returning must not lose chat scroll position on mobile web.

### Transition
- **TR-1.1** `onboarding_snoozed_until: string | null` on the allowance row — Dexie `version(12)`.
- **TR-1.2** **Existing populated households must never see onboarding.** The FR-1.1 predicate is self-satisfying, but verify explicitly — a false positive nags every existing user.
- **TR-1.3** `PROMPT_VERSION` bump with T1b.

---

## 8. T10 — Import reliability / account-not-found fallback

Composes with audit **B4** (reject unknown ids at confirm time) rather than contradicting it: reject silently-failing rows **and** offer creation as the recovery path.

### Functional
- **FR-10.1** Rows referencing an unknown `account_id` do not render as approvable (B4).
- **FR-10.2** The card offers `create_account` with guessed institution / type / lane in one confirmation.
- **FR-10.3** The new id is threaded into a re-attempted `log_transactions` within the same turn.
- **FR-10.4** User can override guessed name, type, and lane before confirming.
- **FR-10.5** Imports chunk at ≤50 rows; row count is verified between chunks.
- **FR-10.6** `allow_duplicates=true` is sent only for rows the user explicitly confirmed are new.

### Non-functional
- **NFR-10.1** Retry safety rests on §2.1: unknown-account rows persisted nothing, so the re-attempt writes once. **No pre-flight guard.**
- **NFR-10.2** Lane guessing never defaults to `pass_through` (excluded from net worth) or `protected_living` (triggers protection semantics). Default `income_producing`; make the user pick.

### Transition
- **TR-10.1** No schema change.
- **TR-10.2** Write-atomicity audit (B3) is a **follow-up, not a blocker**.

---

## 9. T5 — Weekend-aware safe-to-spend

Root cause: [safeToSpend.ts:81-82](../../src/engine/safeToSpend.ts) — `remainingWorkdays === 0` on weekends makes `todayCeiling` zero by construction.

### Functional
- **FR-5.1** `computeSafeToSpend` returns a discriminated union, not a bare zero: `{ kind: 'workday', todayCeiling }` | `{ kind: 'weekend', nextWeekPool, startsOn }` | `{ kind: 'unconfigured' }`.
- **FR-5.2** Weekends show the upcoming workweek's pool labelled "starts Monday" / "mulai Senin".
- **FR-5.3** A separate line shows weekend discretionary from `allowance.weekend_allocation`.
- **FR-5.4** **The card never renders `Rp 0` without an adjacent reason.** Assert this as an invariant.
- **FR-5.5** Workweek definition (Mon–Fri vs Mon–Sun) is a setting consumed by `workdaysRemaining`.

### Non-functional
- **NFR-5.1** The return-type change is breaking. Use a **discriminated** union so TypeScript forces every consumer — the UI hook and [context.ts:117](../../src/ai/context.ts) — to update in the same commit. Do not use an optional field.
- **NFR-5.2** "Weekend" evaluates in device-local timezone, consistent with `todayISO()`. A WITA user must not see Monday's card on Sunday evening.

### Transition
- **TR-5.1** `workweek_definition: 'mon_fri' | 'mon_sun'` — Dexie `version(13)`, default `'mon_fri'` (current behaviour).
- **TR-5.2** **The setting applies from the current week forward. Past weeks are never recomputed** — otherwise historical comparisons become meaningless. Easy to get wrong; assert in a test.
- **TR-5.3** `PROMPT_VERSION` bump — the SAFE TO SPEND block's wording changes.

---

## 10. T3 — Overdrawn accounts as data

**Correction to mechanism.** The ticket says "clamp at display". `deriveBalance` ([balances.ts:8](../../src/lib/balances.ts)) feeds the Assets screen, the AI context, and net-worth math *independently* — clamping in three places guarantees drift. Model it once, at the source.

### Functional
- **FR-3.1** `deriveBalance` keeps returning the true signed balance. It is ledger truth and must not lie.
- **FR-3.2** New pure helper `splitOverdraft(balance) → { assetPortion, overdraftLiability }` = `{ max(0, b), max(0, -b) }`. Single source of truth.
- **FR-3.3** Lane aggregation ([context.ts:95-103](../../src/ai/context.ts) and the UI equivalent) uses `assetPortion` for the account's own lane and adds `overdraftLiability` to `debt_liability`.
- **FR-3.4** Safe-to-spend and FI consume the same split — never the raw negative.
- **FR-3.5** Account row shows an "Overdrawn" badge with amount and the date it went negative.
- **FR-3.6** AI context emits the overdraft as a distinct line.

### Non-functional
- **NFR-3.1** Calm amber token family, not red (audit A3). An overdraft is a state, not an error.
- **NFR-3.2** Unit test covering positive, zero, negative. Non-negotiable — money math.
- **NFR-3.3** Copy states the fact. No "you're broke", no warning iconography.

### Transition
- **TR-3.1** No schema change — derived. Cheapest ticket in the set.
- **TR-3.2** Net worth visibly changes for any household with a negative account. Ship with a one-time explanation or it reads as a bug.
- **TR-3.3** Linking overdraft to a credit-card / pay-later product is **out of scope** — needs a product-linkage model that doesn't exist.

---

## 11. T2 — Account nicknames *(merge deferred, O-2)*

### Functional
- **FR-2.1** `Account` gains `nickname: string | null`, user-editable.
- **FR-2.2** Every picker renders `nickname ?? name` plus a disambiguator (institution, type). **Two visually identical rows must be impossible.**
- **FR-2.3** `accountLines` emits the nickname so the model refers to accounts the way the user does.
- **FR-2.4** Ambiguous phrasing → ask before proposing any write. Covered by the existing "NEVER assume" rule ([context.ts:16](../../src/ai/context.ts)); needs disambiguated data, not a new rule.

### Non-functional
- **NFR-2.1** **Last-4-digits is dropped from scope.** It is account-number data and must not enter the system prompt or any log. Institution + type disambiguates sufficiently.

### Transition
- **TR-2.1** `nickname` — Dexie `version(14)` + `syncMappers.ts` + Supabase column + RLS (TR-X2).
- **TR-2.2** Backfill `null`; UI falls back to `name`.

### Deferred — merge action
Blocked on O-2 (merge on device A while device B writes to the absorbed account, under LWW). When built it requires: one Dexie transaction, `operation_id` idempotency (audit E1), soft-delete not hard-delete, `transfer_pair_key` preservation on both legs, and an audit row.

---

## 12. T8 — First-reply format for mobile

### Functional
- **FR-8.1** First reply: ≤ 3 headline numbers plus one question.
- **FR-8.2** "Show full snapshot" expands on request — the model already holds the context.
- **FR-8.3** No list longer than 4 items in the opening message.
- **FR-8.4** First reply ≤ 600 characters.

### Non-functional
- **NFR-8.1** **FR-8.4 is enforced by a UI fold at render time, not by prompt instruction** (NFR-X4). Length adherence is precisely where smaller models drift, and the fold also fixes long replies that aren't the first.
- **NFR-8.2** Measured in characters, not tokens — Indonesian text and `Rp 1.500.000` formatting inflate token counts relative to Latin-script English.

### Transition
- **TR-8.1** `PROMPT_VERSION` bump if the "be concise" rule ([context.ts:30](../../src/ai/context.ts)) is rewritten.

---

## 13. T7 — Friendly empty states

### Functional
- **FR-7.1** Categories, Assets, Active Recurring each render a one-line CTA when empty, one tap to the add flow.
- **FR-7.2** Copy is specific and example-led ("Add your first subscription — e.g. Netflix").
- **FR-7.3** CTA disappears at ≥ 1 entry.
- **FR-7.4** **Empty-state copy stays out of the chat greeting.** The prompt's `(none yet)` markers are model-facing data, not user copy.

### Non-functional
- **NFR-7.1** App layer only. Zero prompt change, no `PROMPT_VERSION` bump.
- **NFR-7.2** Real buttons with accessible names, not tappable text.

### Transition
None. Lowest-risk ticket in the set.

---

## 14. T9 — Memory *(device-local, O-9)*

Per C-3: the propose-before-save behaviour already exists. **The deliverable is that `chatMemories` has no UI at all today** — it is reachable only through chat.

### Functional
- **FR-9.1** Existing propose-before-save preserved, with a one-line preview in the confirm card.
- **FR-9.2** **New:** a Memory screen listing entries with a delete affordance.
- **FR-9.3** Entries editable in the app, not chat-only.
- **FR-9.4** Stale/contradicted memory → propose `delete_memory` + save corrected, never silent overwrite. Already in the persona ([context.ts:32](../../src/ai/context.ts)) — verify, don't duplicate the rule.

### Non-functional
- **NFR-9.1** The 2000-character capacity warning ([context.ts:201](../../src/ai/context.ts)) surfaces in the UI, not only to the model.
- **NFR-9.2** **The screen states the scope in plain words:** "Saved on this device. Your partner won't see these unless they save the same fact on theirs." / "Tersimpan di perangkat ini. Pasangan Anda tidak melihatnya kecuali menyimpannya sendiri."
- **NFR-9.3** Memory content is user-authored free text rendered in the UI — escape it. XSS hygiene, not a new trust boundary.

### Transition
- **TR-9.1** No schema change — `chatMemories` exists.
- **TR-9.2** Update audit E11 in the same PR (C-3).
- **TR-9.3** Shared-memory ticket deferred until sync has a conflict-resolution policy. Optional: a "notify me when shared memory ships" affordance, if device-local reads as a bug in testing.

---

## 15. T6 — Notices

Partly built: [context.ts:171-192](../../src/ai/context.ts) generates two kinds (stale assets 35+ days, recurring due within 7 days) and [context.ts:31](../../src/ai/context.ts) already instructs surfacing the top one. The gap is *coverage* and *ranking*, not the mechanism.

### Functional
- **FR-6.1** Existing behaviour preserved: non-empty → surface one briefly; empty → `(none)`, model stays silent.
- **FR-6.2** Add generators: pay-day approaching, bill due in 3 days, pool exhausted mid-week, FI milestone reached, balance not refreshed in 7+ days.
- **FR-6.3** **Ranking computed in `context.ts` and emitted in priority order** (NFR-X4) — not left to model judgement.
- **FR-6.4** At most 3 notices enter the prompt; truncation deterministic by rank.

### Non-functional
- **NFR-6.1** Generation stays inside the existing `Promise.all`. No new queries — `buildSystemPrompt` is on the turn's critical path.
- **NFR-6.2** Must not fire on empty-state households — every account would trip "not refreshed in 7 days" immediately.

### Transition
- **TR-6.1** Pay-day source is onboarding/income events (T1), **not** memory. If unknown, the generator is skipped, never guessed.
- **TR-6.2** `PROMPT_VERSION` bump.

---

## 16. Priority and sequencing

| Priority | Item | Rationale |
|---|---|---|
| ★★★★★ | **T1a** Onboarding (deterministic) | Without data every insight is wrong. Unlocks everything. |
| ★★★★★ | **Explain My Number** | Users must trust the numbers before they'll trust anything built on them. |
| ★★★★☆ | **T10** Import reliability | Data integrity outranks new surface area. |
| ★★★★☆ | **T5** Weekend safe-to-spend | The differentiator. "Today" must be useful on the day people look. |
| ★★★★☆ | **Health Check** | Turns facts into decisions — but only after they're trusted. Blocked on **D-1**. |
| ★★★☆☆ | **T1b** Onboarding (model-facing) | Highest model variance; lands once the deterministic half is proven. |
| ★★★☆☆ | **T3** Overdraft split | Cheap, no schema, removes a false "negative net worth" signal. |
| ★★★☆☆ | **T2** Nicknames | Removes confusion; doesn't change decisions. |
| ★★★☆☆ | **T8** Mobile greeting | Usability, low effort, UI-enforced. |
| ★★☆☆☆ | **T7** Empty states | Polish once the core flow works. |
| ★★☆☆☆ | **T9** Memory UI | Onboarding captures the critical facts; memory covers the rest. |
| ★☆☆☆☆ | **T6** Notices | Valuable once people are actively using the app. |
| ☆☆☆☆☆ | **T2 merge** | Postponed until sync conflict policy is mature (O-2). |

### Sprint 1 — Foundation (trust)
T1a · Explain My Number · T10 · **T3** *(added: no schema, and it removes a wrong number before Explain My Number starts explaining numbers)*
Dexie `version(12)`.

### Sprint 2 — Decision engine
T5 · Health Check *(pending D-1; under (c) also `computeAffordability` + §23 layer 1)* · T8 · T1b
Dexie `version(13)`.

### Sprint 3 — Polish
T2 (nickname) · T7 · T9 · T6
Dexie `version(14)`.

**Sequencing rationale:** every schema-touching and model-facing change is separated. Waves 1–2 land the deterministic work first so a prompt regression on `minimax-m3` can never be mistaken for a data bug — which matters more than usual given O-X (no regression suite).

---

## 17. Acceptance assertions — definition of done

One assertion per ticket: the smallest runnable check that fails if the requirement breaks. **A ticket is not done until its assertion exists and passes.**

This is load-bearing, not ceremony. With `minimax-m3` and no prompt regression suite (O-X), these tests are the only mechanism that detects a behaviour regression. Every assertion below is a pure-function or component test — none requires an API call.

| Ticket | Assertion | Fails when |
|---|---|---|
| **T1a** | `buildSystemPrompt` on a fixture household with recurring items **and** memory **and** a non-zero allowance contains no `ONBOARDING STATE` section; the same fixture emptied does. A fixture with `onboarding_snoozed_until` set to today omits it. | Onboarding nags a populated household (TR-1.2), or snooze leaks. |
| **T1a** | Opening the wizard with a requested step while a persisted draft exists lands on the **draft's** step, not the requested one. | FR-1.3b — a jump discards in-progress answers. |
| **Explain My Number** | For each explained value, the decomposition rows sum to the displayed figure. Property test over generated allowance/recurring combinations, not one example. | C-1/C-4 recur — a component re-derives a number and drifts from the engine. |
| **Explain My Number** | An unset allowance renders `—` for every derived row, and no `Rp 0` appears. | FR-4.6 — phantom zeros return. |
| **T3** | `splitOverdraft` over positive, zero, and negative balances. Plus: net worth for a fixture with one overdrawn account equals `assets − overdraft`, and is unchanged by routing through the split. | The clamp drifts between the three consumers of `deriveBalance`. |
| **T5** | `computeSafeToSpend` on a Saturday returns `kind: 'weekend'`. Snapshot of the rendered card asserts no `Rp 0` string appears without an adjacent reason. | FR-5.4 — the dead-zero card comes back. |
| **T5** | Changing `workweek_definition` leaves the previous week's computed pool unchanged. | TR-5.2 — history silently rewrites. |
| **T10** | Given a batch where some rows reference an unknown `account_id`, `logTransactions` persists exactly the valid rows and reports the rest; re-running with a created account persists each remaining row exactly once. | §2.1's no-double-book guarantee stops holding. |
| **T2** | Two accounts sharing a `name` render distinct labels in the picker. | FR-2.2 — identical rows return. |
| **T6** | Notices emitted from a fixture arrive in rank order, capped at 3; an empty-state household emits none. | FR-6.3/NFR-6.2 — ranking drifts to model judgement, or empty households get spammed. |
| **T8** | A reply exceeding 600 characters renders folded. | NFR-8.1 — enforcement quietly relocates to the prompt. |
| **T9** | Memory screen renders an entry's content escaped. | NFR-9.3. |
| **Health Check** | Never returns more than 5; ordering is deterministic for a fixed fixture; no insight names a `[PROTECTED]` item as reducible. | FR-11.4/11.7. **Content assertions pending D-1.** |
| **T7** | CTA renders at zero entries, absent at one. | FR-7.3. |

**Not assertable by test, verify by review:** NFR-3.3 and NFR-11.2 (copy register — no moralising), NFR-9.2 (the device-local disclosure is present and accurate), NFR-X1 (persona token budget — check the diff).

---

## 18. Remaining open items

| id | Item | Blocks |
|---|---|---|
| **D-1** | Principle #4 (no verdicts): hold (a), amend (b), or **computed verdict (c) — recommended**? | Health Check FR-11.3, §23 layer 1 |
| **B3** | Dexie batch write atomicity audit | Nothing — follow-up |
| **O-2** | Merge under LWW sync conflict | T2 merge only |
| **O-4** | Derived `monthly_amount` | Future ticket |
| **O-9b** | Shared household memory | Future ticket |

---

## 19. Rewritten ticket copy

User-facing, cause-and-consequence, no blame, Indonesian + English.

**T1** — EN: "A new household starts with nothing set up, so every number on the dashboard is a placeholder. Three questions turn it on." · ID: "Rumah tangga baru mulai tanpa data, jadi semua angka masih kosong. Tiga pertanyaan menghidupkannya."

**Explain My Number** — EN: "People don't distrust calculations. They distrust unexplained ones. Show what went into every number." · ID: "Orang tidak meragukan perhitungan — mereka meragukan yang tak dijelaskan. Tunjukkan asal setiap angka."

**Health Check** — EN: "The app shows what's true. Show what it means this week, ranked, at most five." · ID: "Aplikasi menampilkan fakta. Tunjukkan artinya minggu ini, terurut, maksimal lima."

**T2** — EN: "Two accounts share a name, so choosing the wrong one is a matter of luck. Let people name accounts the way they talk about them." · ID: "Dua rekening punya nama sama, jadi salah pilih tinggal soal keberuntungan. Biarkan pengguna menamai rekening sesuai cara mereka menyebutnya."

**T3** — EN: "A temporary overdraft currently reads as negative net worth. An overdrawn balance is a debt to settle, not a verdict on the household." · ID: "Saldo minus sementara terbaca sebagai kekayaan bersih negatif. Saldo minus itu utang yang harus dilunasi, bukan vonis."

**T5** — EN: "Safe-to-spend reads Rp 0 every Saturday — precisely when people check it. Show the week ahead instead of a dead zero." · ID: "Safe-to-spend jadi Rp 0 tiap Sabtu — justru saat paling sering dilihat. Tampilkan pekan depan, bukan nol kosong."

**T6** — EN: "Timely notices exist but rarely reach the user. Surface the one that matters, once, and stay quiet otherwise." · ID: "Notifikasi penting sudah ada tapi jarang sampai. Tampilkan satu yang paling penting, sekali, sisanya diam."

**T7** — EN: "Empty sections say '(none yet)', which is accurate and useless. Say what to add first." · ID: "Bagian kosong cuma tertulis '(belum ada)' — benar tapi tidak membantu. Sebutkan apa yang perlu ditambahkan lebih dulu."

**T8** — EN: "The first reply delivers the entire financial picture at once. Lead with two numbers and a question; keep the rest one tap away." · ID: "Balasan pertama menumpahkan seluruh gambaran keuangan sekaligus. Mulai dengan dua angka dan satu pertanyaan; sisanya cukup satu ketukan."

**T9** — EN: "Stable facts like pay date get re-asked every session because nothing remembers them. Save them once, and let people see and delete what was saved." · ID: "Fakta tetap seperti tanggal gajian ditanya ulang terus karena tidak tersimpan. Simpan sekali, dan biarkan pengguna melihat serta menghapusnya."

**T10** — EN: "Pasting a statement from an untracked account dead-ends. Offer to create the account and continue in the same step." · ID: "Menempel mutasi dari rekening yang belum terdaftar berujung buntu. Tawarkan membuat rekening lalu lanjutkan di langkah yang sama."

---
---

# Part II — Product specification

Added in response to PM review. Part I answers *what the system does*; Part II answers *why someone opened the app*. Where a review item presumes infrastructure this codebase does not have, it is marked **[NO INFRA]** and scoped honestly rather than specified as if it were free.

---

## 20. Primary user intent

Nobody opens this app to see a dashboard. They arrive with a question. Every surface maps to one of these or it does not ship.

| # | Intent | Arrives asking | Success | Primary surface |
|---|---|---|---|---|
| **I-1** | Permission | "Can I buy this?" | Answer in < 15s, without leaving chat | Chat + safe-to-spend |
| **I-2** | Accounting | "Where did my salary go?" | Top spending categories visible without a query | Health Check + category view |
| **I-3** | Attention | "Is anything wrong?" | Top issue visible without scrolling | Health Check row 1 |
| **I-4** | Timing | "Did my salary arrive?" | Last income event visible on open | Today screen |
| **I-5** | Horizon | "Can I afford a holiday?" | Trade-off stated in FI-date delta and weeks of pool | Chat, scenario framing |
| **I-6** | Weekend | "What can I spend this weekend?" | Weekend allocation distinct from workweek pool | T5 card |

**Mapping rule.** Every ticket in Part I names the intent it serves. T5 serves I-6. Explain My Number serves I-1 as a trust precondition. Health Check serves I-2 and I-3. T10 serves I-2 through data completeness. T1 is a precondition for all of them.

**T2, T7, and T9 serve no intent directly** — they are hygiene. That is the honest reason they sit in Sprint 3, and it is a better reason than "polish".

**I-1 is the product.** If "can I buy this?" takes more than 15 seconds or more than two turns, nothing else in this document matters.

---

## 21. Lifecycle — the assistant's job changes by phase

Onboarding is specified (T1). Steady state is not. The same numbers mean different things depending on where the household sits in the month.

| Phase | Household's question | Assistant's job | Emphasis |
|---|---|---|---|
| **First day** | "Is this worth setting up?" | Reach one true number fast | One step, not three |
| **Week 1** | "Does this reflect reality?" | Confirm and correct | Corrections over insights |
| **Payday** | "What do I do with this?" | Allocate: pipe, bills, pool | Savings pipe first |
| **Mid-month** | "Am I on track?" | Surface drift early enough to act on | Pace against pool |
| **Weekend** | "What is safe today?" | Separate weekend from workweek | T5's `kind: weekend` |
| **Month end** | "What happened?" | Reflect; feed next month's allowance | Category totals |
| **Year end** | "Did we get closer?" | FI progress, not monthly noise | FI-date delta |

**Phase derivation is deterministic** — it follows from `todayISO()`, the allowance row, and the last income event. Computed in `context.ts`, emitted as one line, never inferred by the model (NFR-X4).

**Scope note.** Phase-aware *emphasis* is a Sprint 3 concern. Sprints 1–2 need only the phase line in context. Behaviour differentiation follows once the deterministic surfaces are proven.

---

## 22. Conversation patterns

Part I specified screens. The AI Manager is mostly not screens. Each pattern is a turn-shape contract, not a script.

### CP-1 — Purchase advice (serves I-1)

```
intent received
  -> missing info?  ONE clarifying question, never a form
  -> compute        engine, never the model (NFR-X3)
  -> present        decision layer, then reason layer (see section 23)
  -> offer action   log it / remind me / nothing
```

**Turn budget: 2.** One clarification maximum. If two facts are missing, ask for the more decision-relevant one and state an assumption on the other. A third turn means the pattern failed.

### CP-2 — Income received
Detect from statement or user statement, propose an allocation across pipe / bills / pool, confirm, log. Never allocate without confirmation.

### CP-3 — Bill or recurring payment
Match against ACTIVE RECURRING (already in the persona). Matched, tag `recurring_item_id`. Unmatched, ask before creating a recurring item. Never silently create a commitment.

### CP-4 — Transfer
Both legs, one `transfer_pair_key`, `is_transfer=true` — already specified in the persona. Confirm direction when ambiguous; this is the highest-frequency misclassification.

### CP-5 — Goal or horizon (serves I-5)
Translate the amount into two units the household already understands: weeks of pool, and FI-date delta. Never a third unit — extra precision here reads as evasion.

**Common rule.** Every pattern ends with an offered action or an explicit "nothing to do". A turn ending in prose with no exit is a dead end.

---

## 23. Progressive disclosure — resolving the analytical-overload risk

The review's sharpest point: the product risks answering "here are twelve variables" when asked "can I afford this?". Correct. The fix is layering, not less rigour.

```
Layer 1  Decision       one line
Layer 2  Reason         the one number that drove it
Layer 3  Explanation    "How we calculated this" (section 5)
Layer 4  Breakdown      full formula and assumptions
```

Layers 2–4 are already specified and buildable. **Layer 1 is not currently permitted.**

> **Layer 1 is the D-1 decision.** "Yes, you can comfortably afford this" is exactly the affordability verdict that audit finding **A1 (P1)** removed, and that [context.ts:17](../../src/ai/context.ts) forbids: *"Never issue a confident verdict on whether the user should or shouldn't spend."*
>
> The review's hierarchy as written **presumes D-1 resolves to option (b): amend principle #4** so the model may judge. That is a legitimate choice, but it cannot arrive through a copy revision, and it is not the only way to get layer 1.
>
> **Option (c) — the computed verdict (§4, D-1c) — delivers layer 1 without model judgement.** `computeAffordability` returns `comfortable | tight | over` plus the driving number; the model phrases it and never derives it. Deterministic, unit-testable, and NFR-X3 stays intact. **This is the recommended resolution.**
>
> **Until D-1 is signed off, build layers 2–4 and leave layer 1 out.** Layers 2–4 alone answer I-1 in a single turn: *"You would have Rp 850.000 left this week"* is not a verdict, and for most users it is the entire answer. Under (c), layer 1 becomes a one-line addition on top of work already done.

**Under (b) or (c), these constraints still survive:** verdicts remain forbidden on investments (no sell tooling exists — principle #2) and on protected items (principle #5). Only discretionary-purchase affordability opens up (FR-D1c.4).

---

## 24. Zero-data experience

T7 specifies CTAs. That is UI. The first ten minutes decide retention.

| State | Path | Notes |
|---|---|---|
| No accounts | Manual account creation | **[NO INFRA]** "Connect account" implies bank aggregation. No open-banking integration exists and none is planned here. Do not show a Connect affordance that leads nowhere. |
| No transactions | Paste or upload a statement, into the T10 flow | Already the strongest path in the product. Make it the primary CTA. |
| No categories | Generate a starter set on first import, user-editable | Never require category setup before first value |
| No recurring items | Derive suggestions from an import — `seedRecurringFromLog.ts` already exists on this branch | Propose, confirm, never auto-create |
| No goals | Suggest an emergency-fund target sized from declared bills | Suggestion only; goals are not a modelled entity yet |

**Ordering principle.** The shortest path to one true number is one account, then one statement paste. Everything else can stay empty. T1's three steps must not block that path.

---

## 25. Trust journey

Trust is the actual product in personal finance. It develops in stages, and each stage has a design job.

| Stage | User believes | Design job | Ticket |
|---|---|---|---|
| 1 | "I don't believe this number." | Show provenance on demand | Explain My Number |
| 2 | "So that is where it came from." | Distinguish declared from derived | FR-4.4 |
| 3 | "That is actually correct." | Agree with the user's own screens | `deriveBalance` parity, already true |
| 4 | "I will rely on this." | Never contradict itself between chat and app | NFR-X3 |
| 5 | "I will decide using it." | Consistency over time; no silent recalculation | TR-5.2 |

**Trust is lost fastest by:** a number changing with no visible cause; chat disagreeing with a screen; a confident answer that turns out wrong. In that order.

Every one of those is already a Part I invariant. Section 17's assertions are the trust mechanism, not merely test hygiene.

---

## 26. Failure and recovery journeys

Part I is happy-path heavy. Each failure below needs a defined state, not a generic error.

| Failure | Today | Required |
|---|---|---|
| Salary not received when expected | Silent | Notice: "no income logged since <date>" — fact, no alarm |
| Recurring item deleted by accident | Tombstone exists (`deleted_at`, this branch) | Undo affordance within the session |
| Duplicate import | `possible_duplicates` returned | Already correct; surface per row, not per batch |
| Sync conflict | LWW, silent | Out of scope here — **O-2** |
| Model unavailable or quota exceeded | Generic error | Distinct copy for quota vs outage vs offline (audit E8) |
| Offline | Dexie works, chat fails | State plainly that logging works and the assistant is unavailable |
| Timezone or clock change | Undefined | `todayISO()` is device-local; a traveller crossing midnight sees the pool reset. **Define, then assert** — extends NFR-5.2 |
| Negative weekend allocation | `isNegativePool` handled | Ensure copy explains the cause |

**Rule.** Every failure state names what was *not* lost. In a money app, "nothing was saved" is the reassurance that matters — and it is already the state machine's guarantee for reads (audit section 3.1).

---

## 27. Health Check priority taxonomy

"3–5 insights" is underspecified: it permits "Nice job!" above a negative balance. Rank by class first, magnitude second.

| Rank | Class | Example |
|---|---|---|
| **P1** | Immediate financial risk | Account below zero; pool exhausted with 9 days left |
| **P2** | Cashflow risk | Bill due before the next income event |
| **P3** | Overspending | Category materially above its own trailing norm |
| **P4** | Opportunity | Pipe underfunded against declared target |
| **P5** | Achievement | Milestone reached |

**Hard rules.** A P5 never displaces a P1–P3. If any P1 exists it occupies row 1. A household with an unresolved P1 sees **no P5 at all** — congratulating someone who is overdrawn is the fastest way to lose stage-4 trust (section 25).

Ranking is computed in code (FR-11.2). The model may phrase; it may never order.

---

## 28. Notification strategy — [NO INFRA]

The review asks for morning, payday, bill-due, inactivity, weekly, monthly, and yearly notifications.

**None of it is deliverable today.** There is no PWA manifest, no service worker, and no `web-push` dependency in `package.json`. The app cannot reach a user who has not opened it.

Scoped honestly, in two parts:

- **In-app, buildable now.** Every trigger the review lists already maps to a Notice (section 15 / T6) or a Health Check insight (section 27). Ship them there. The taxonomy in section 27 *is* the notification priority model.
- **Out-of-app, a project of its own.** PWA install, service worker, push subscription storage, a server-side scheduler, and permission UX. That is not a ticket, it is a milestone. It also converts a device-local product into one needing server-side knowledge of when to wake someone, which interacts directly with the E4 privacy policy.

**Recommendation:** ship the in-app half, and write no copy implying notifications will arrive.

---

## 29. Action state model

The review is right that actions lack completion criteria. One model, applied to every write.

| Phase | Requirement |
|---|---|
| **Before** | State what will change, in the confirm card. Already true. |
| **During** | Status reflects the actual step, not a spinner (audit E8) |
| **After — success** | Say what changed and where it landed; offer the next step from the same pattern (section 22); return to the surface the user started from |
| **After — partial** | Name exactly which rows saved and which did not — section 2.1 makes this knowable |
| **After — failure** | Name what was *not* saved, and offer retry |

Applies uniformly to `create_account`, `log_transactions`, memory save, nickname edit, and onboarding completion.

**Concretely for `create_account` (T10):** confirm, create, thread the id, re-attempt, report rows saved, stay in chat. No navigation, no toast, no animation.

---

## 30. Metrics — [NO INFRA]

The review asks for per-feature KPIs. There is **no analytics client** in `package.json` — no PostHog, Mixpanel, Amplitude, Sentry, or Plausible. Nothing client-side is measurable today.

What does exist: the `ai_usage` ledger (`supabase/migrations/20260707000009_a_ai_usage.sql`) recording turns, tokens, and `prompt_version` server-side.

| Measurable now (server-side) | Needs an analytics client |
|---|---|
| Turns per household, tokens, model, prompt version | Onboarding completion rate and drop-off |
| Turn error rate | Explain My Number open and dismiss rate |
| Quota trips | Health Check click-through, dismissal, helpfulness |
| | Weekend card open rate |

**The proposed trust KPI — "95% of users understand why Safe To Spend changed" — is not observable at all.** Understanding is not an event. The closest honest proxies are Explain-My-Number open rate and repeat-opens on the same value. State it that way, or it becomes a target nobody can compute.

**Decision required.** Adding an analytics client to a product whose stated policy is device-local and never-synced (audit E4) is a privacy-policy change, not a dependency addition. Logged as **O-11**.

---

## 31. Accessibility

Part I specified accessible buttons only. Full baseline, all deliverable without new infrastructure:

- **Dynamic type** — no fixed pixel font sizes on money figures; the largest OS text setting must not clip a Rupiah amount (`Rp 1.500.000` is long)
- **Screen-reader order** — the decision layer (section 23) is read first; the breakdown is reachable, not interruptive
- **Money semantics** — amounts announce as currency, not digit strings; negative announces as "minus", never a bare hyphen
- **Colour independence** — amber and red states carry text or an icon, never colour alone; interacts with NFR-3.1 and `isAmber`
- **Contrast** — WCAG AA on every money figure, including amber on dark
- **Reduced motion** — honour `prefers-reduced-motion`; no essential state conveyed by animation alone
- **Keyboard** — the confirm card fully operable, including per-row toggles when B2 lands (audit review pt. 15)

**Assertion:** the axe ruleset passes on the Today screen, the confirm card, and the Explain My Number sheet.

---

## 32. Copy revision

The review is right that current copy is system-oriented. Adopted, with one exception.

| Current | Revised (EN) | Revised (ID) |
|---|---|---|
| Safe to Spend | **Available today** | Tersedia hari ini |
| Monthly allowance | **Your monthly spending plan** | Rencana belanja bulanan |
| Overdrawn | **Below zero** | Di bawah nol |
| Financial Health Check | **This week's highlights** | Sorotan minggu ini |
| Explain My Number | **How we calculated this** | Cara kami menghitungnya |
| Monthly personal pool | **Your spending money this month** | Uang belanja bulan ini |

**Not adopted: "Protected Categories" to "Essential Spending".**

`is_protected` is a user-set flag meaning *"never suggest cutting this"*, enforced in the persona and in the tool surface. It is **not** a synonym for essential. A household may protect a hobby fund, and may leave a genuine essential unprotected. Renaming it "Essential" makes the label lie about the flag's semantics, and invites the model to reason about essentialness instead of the declared flag.

**Counter-proposal: "Off-limits" / "Tidak diutak-atik"** — plain language, and it says what the flag actually does.

**Constraint on every copy change:** the persona's internal marker stays `[PROTECTED]`. UI labels may change; the prompt vocabulary and the DB flag must not drift apart (audit E2 — DB flags are authoritative).

---

## 33. Additional open items from Part II

| id | Item | Blocks |
|---|---|---|
| **D-1** | Principle #4, verdicts. Blocks section 23 layer 1 and Health Check content. **Most consequential open item in the document.** Recommended resolution: **(c) computed verdict**, section 4 / D-1c. | Section 23, FR-11.3 |
| **O-11** | Analytics client vs the device-local privacy policy (E4) | Section 30, all product KPIs |
| **O-12** | Timezone and clock-change behaviour for `todayISO()` and pool reset | Section 26 |
| **O-13** | Push notification milestone — is it on the roadmap at all? | Section 28 |
