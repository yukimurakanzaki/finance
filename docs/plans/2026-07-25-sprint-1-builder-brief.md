# Sprint 1 — Builder Brief

**For:** Hermes agents building on `minimax-m3`
**Repo:** `yukimurakanzaki/finance` · branch off `origin/main`
**Spec:** `docs/plans/2026-07-25-ai-manager-ux-requirements.md` (referred to below as *the plan*)

Read this whole brief before writing code. Read the plan sections named in each task before starting that task.

---

## 0. Ground rules — violating any of these fails review

1. **The engine computes; the UI renders; the model quotes.** Every money figure comes from `src/engine/**` or `src/lib/**`. Never recompute a number inside a component. If a component needs a value the engine does not return, **extend the engine** and add a test there. (Plan NFR-X3.)
2. **Never invent a formula.** Three tickets in this project were written with arithmetic that double-counts. Before writing any subtraction involving money, read plan §1 corrections C-1 and C-4.
3. **No new dependencies.** Everything in Sprint 1 is buildable with what is installed.
4. **Do not touch the system prompt** (`src/ai/context.ts` PERSONA) in Sprint 1. No task here requires it. If you believe one does, stop and ask.
5. **Verify before claiming done.** Run both, paste the output:
   ```bash
   npx tsc --noEmit && npx vitest run
   ```
   Current baseline: **545 tests passing, 0 failing.** A task is not done if that number goes down.
6. **One task, one commit.** Commit message names the task id.
7. **Reuse before writing.** Helpers that already exist and must not be reimplemented:
   - `deriveBalance(account, txns)` — `src/lib/balances.ts`
   - `computeSafeToSpend(input)` / `safeToSpendFromLedger(...)` / `isWeekDraw(t)` — `src/engine/safeToSpend.ts`
   - `computeAffordability(amount, sts)` — `src/engine/affordability.ts`
   - `formatRpFull`, `formatRpInput` — `src/lib/currency.ts`
   - `todayISO`, `isoWeekStart`, `isoWeekEnd`, `workdaysRemaining`, `weeksInMonth` — `src/lib/dates.ts`
   - `resolveRecurringItemId` — `src/lib/recurringMatch.ts`

---

## Task 1 — Dexie `version(12)`

**Do this first. Every other task with a schema need waits on it.**

- Add `version(12)` in `src/db/db.ts` with `allowance.onboarding_snoozed_until: string | null`.
- Add the field to the `Allowance` interface in `src/db/types.ts`.
- Add the Supabase column + migration file. **Do not apply the migration** — hand it to the human.
- `src/lib/syncMappers.ts` needs **no change** — `toCloudRow` spreads the whole row, there is no per-field allowlist. Verify this yourself before assuming otherwise.

**Only `version(12)`.** `version(13)` and `version(14)` belong to Sprint 2 and 3 (plan TR-X1). Do not claim them.

**Done when:** existing databases upgrade without data loss and the suite still passes.

---

## Task 2 — T3, overdraft split

Read plan §10. **Smallest task here; do it early.**

- New pure helper `splitOverdraft(balance) => { assetPortion, overdraftLiability }` = `{ Math.max(0, b), Math.max(0, -b) }`. Put it next to `deriveBalance` in `src/lib/balances.ts`.
- **`deriveBalance` keeps returning the true signed balance.** It is ledger truth. Do not clamp it.
- Lane aggregation uses `assetPortion` for the account's own lane and adds `overdraftLiability` to `debt_liability`. Two call sites: `src/ai/context.ts` (net worth block) and the equivalent UI path — find both.
- Account row shows an "Overdrawn" badge with amount and the date it went negative. **Amber token family, not red** — an overdraft is a state, not an error.
- Copy states the fact. No "you're broke", no warning iconography.

**Test:** `splitOverdraft` over positive, zero, negative. Plus: net worth for a fixture with one overdrawn account equals `assets − overdraft`, and is unchanged by routing through the split.

**Trap:** clamping at the display layer instead of at the source. Three consumers read `deriveBalance` independently; clamp in three places and they drift.

---

## Task 3 — Explain My Number

Read plan §5, **including correction C-4 — the sample formula in the original review is wrong twice.**

- Info affordance on each computed value opening a breakdown.
- Safe-to-spend decomposes as:
  `Monthly allowance (you set this)` → `− Weekend allocation` → `= Discretionary` → `÷ weeks in month` → `= This week's pool` → `− Spent this week` → `= Remaining` → `÷ remaining workdays` → `= Safe to spend today`
- **`allowance.monthly_amount` is ALREADY NET of every recurring item.** Do not subtract bills, subs, or the savings pipe. Read the comment at `src/engine/safeToSpend.ts:69-74` before writing this.
- Recurring totals (`payYourselfFirstTotal`, `householdBillTotal`, `personalSubTotal` — already returned by `computeSafeToSpend`) render in a **separate "already excluded from your allowance" block**, never inside the subtraction chain.
- Declared inputs look visually different from derived ones. "You set this" vs "we calculated this" is the actual user need.
- Unset or zero inputs render `—`, never `Rp 0`, and every derived row below them renders `—` too.

**Test (required):** a property test over generated allowance/recurring combinations asserting **the decomposition rows sum to the displayed number**. Not one example — generated inputs. This is the guard against C-1/C-4 recurring.

---

## Task 4 — T10, import reliability

Read plan §8 and **§2.1, which answers the retry question from the code.**

- Rows referencing an unknown `account_id` do not render as approvable.
- Offer `create_account` with guessed institution / type / lane in one confirmation card.
- Thread the new id into a re-attempted `log_transactions` in the same turn.
- User can override guessed name, type, and lane before confirming.
- Chunk imports at ≤50 rows; verify row count between chunks.

**Do not add a pre-flight `query_transactions` guard.** Plan §2.1 shows why it is redundant: unknown-account rows persist nothing (`src/ai/tools.ts:452` pushes an error and continues, it does not throw), and dedupe already exists (`getDuplicateCandidate`, `src/ai/tools.ts:458`).

**Lane guessing must never default to `pass_through`** (excluded from net worth) **or `protected_living`** (triggers protection semantics). Default `income_producing`; make the user pick.

**Test:** given a batch where some rows have an unknown `account_id`, exactly the valid rows persist and the rest are reported; re-running after `create_account` persists each remaining row exactly once.

---

## Task 5 — T1a, onboarding (deterministic half only)

Read plan §7, **including correction C-5.**

- When `recurringItems` is empty **and** `chatMemories` is empty **and** `allowance.monthly_amount === 0`, `buildSystemPrompt` emits an `=== ONBOARDING STATE ===` section naming the outstanding steps.
- Snooze sets `onboarding_snoozed_until` to end-of-day local. **While snoozed, omit the section from the prompt entirely** — suppression happens in context assembly. Never "instruct the model to stay quiet".
- **There are no deep links in this app.** No router exists; navigation is `activeTab` in the app store (`src/App.tsx:33`), and the wizard's step is component-local `useState` (`src/features/onboarding/OnboardingWizard.tsx:57`). The jump target sets `activeTab` and the wizard's starting step.
- **Lift the wizard's `step` to an entry prop or store value.** This is in scope, not a freebie.
- A persisted draft must **win over** a requested step. The draft already stores `step` (`OnboardingWizard.tsx:112`); jumping must not discard in-progress answers.

**Do not build a second onboarding wizard.** `OnboardingWizard.tsx` exists (~29KB). Build the bridge to it.

**T1b — the assistant's spoken three-step offer — is Sprint 2. Not in scope here.**

**Test:** a fixture household with recurring items **and** memory **and** a non-zero allowance emits no `ONBOARDING STATE`; the same fixture emptied does; a fixture snoozed to today omits it. Plus: opening the wizard with a requested step while a draft exists lands on the **draft's** step.

---

## Definition of done, per task

- Acceptance test from the task exists and passes
- `npx tsc --noEmit` clean
- `npx vitest run` ≥ 545 passing, 0 failing
- No new dependency
- No change to `PERSONA` or `PROMPT_VERSION`
- Commit message names the task id

## When to stop and ask

- A requirement seems to need a formula that subtracts recurring items from `monthly_amount` → **stop**, re-read C-1.
- A requirement seems to need the system prompt → **stop**.
- A requirement seems to need a new dependency, a router, or push notifications → **stop**, those are out of scope (plan §28 explains why notifications are not buildable).
- Two ways to compute the same number appear → **stop**, pick the engine one and say so.

## Known open items — not yours to solve

- **Caveat:** the proxy's CORS allowlist has a placeholder production domain, marked TODO in `supabase/functions/anthropic-proxy/index.ts`. Blocks deploying the proxy, not Sprint 1 app work.
- Whether `minimax-m3` reliably calls `check_affordability` rather than answering from the prompt is unverified. Sprint 2's problem.
- O-2, O-4, O-11, O-12, O-13 in the plan are open by decision, not oversight.
