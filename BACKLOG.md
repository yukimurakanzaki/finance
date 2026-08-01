# Backlog — Phases 1–4 (all delivered)

> **Status as of 2026-08-01: everything in this document has shipped.**
> This file is now a **historical record**, not a queue. It was written on
> 2026-07-13, when Phases 3 and 4 were still unbuilt; every ticket below has since
> been built and merged. The scope text is kept verbatim as the record of what was
> asked for, with each section marked with the PR that delivered it.
>
> **The live queue is `docs/plans/2026-07-25-sprint-1-builder-brief.md`** (Sprint 1,
> 1 of 5 tasks done). Do not hand tickets out of this file.

This was a ready-to-execute ticket list distilled from `PAIN-POINTS.md` (the
analysis) and the project's build history. `PAIN-POINTS.md` stays the source of
truth for *why*; this file was the *what's left, in what order*.

## Where things stand

Verified against `git log` and the source tree on 2026-07-31 at `a81e4f2`.

| # | What | State | Where |
|---|------|-------|-------|
| — | Elicitation: pain points + design audit + Calm Ledger direction | ✅ Merged | PR #12 |
| Phase 1 | Trust & safety fixes (T1, T2, T3, T5, O1, S1) | ✅ Merged | PR #13 |
| Phase 2 | Design primitives (`src/components/ui/*`, tokens, lint guard) | ✅ Merged | PR #14 |
| Phase 3 | Today screen rebuild (standing strip, daily leftover ledger, unified transaction surface, one-action FAB, icons, slim AppBar) | ✅ Merged | PR #23 |
| Phase 4 | Remaining screens migrate to the primitives (§B, B1–B6) | ✅ All six merged | PR #24–#29 |
| Standalone | C1 — recurring-item tagging for AI & import (§C) | ✅ Merged | PR #31 |
| Ledger Control | Correct a balance without logging a transaction + full CRUD on accounts/assets, income, recurring, allowance | ✅ Merged (D1–D3) | PR #48–#51 + `docs/plans/2026-07-31-ledger-control-requirements.md` |

Style-token debt tracked by `scripts/check-style-tokens.mjs`: **507 → 120** across
Phases 2–4.

### Shipped since this document was written, and never in it

| What | Where |
|------|-------|
| Settings & Today migration audits (M3-001/002/003) | PR #19–#22 |
| AI Manager routed to MiniMax (Anthropic-compatible `/v1/messages`) | PR #32–#34 |
| `computeAffordability` engine + `check_affordability` tool | PR #35 |
| Sprint 1 Task 1 — Dexie `version(12)`, `onboarding_snoozed_until` | PR #37 |
| i18n en/id module wired into 14 screens; market-price cache fallback | PR #40, #41 |
| Ledger Control D1 — balance corrections (audit trail, sync, dup-correction detection) | PR #48 |
| Ledger Control D2 — delete accounts/assets without orphaning | PR #49 |
| Ledger Control D3 — edit an income event instead of delete-and-retype | PR #50, #51 |
| Sync — deletion log (tombstones) so deletes don't reappear from another device | PR #51 |

### Still open

Sprint 1 Tasks 2–5 — see `docs/plans/2026-07-25-sprint-1-builder-brief.md`.
`create_account` predates the sprint (PR #3), so Task 4's own scope is untouched.

---

## How to hand a ticket to a builder

*The tickets below are all delivered, but this process still applies to Sprint 1
and anything after it — it's the part of this document worth keeping.*

Every ticket below is written to the same standard as `PHASE-3-HANDOFF.md`. When
you pick one:

1. Copy the ticket's **Scope** section into your builder session verbatim, plus
   this preamble:
   > Repo: `yukimurakanzaki/finance`. Branch: create `<ticket-branch-name>` off
   > the latest `claude/fi-dashboard-safe-to-spend-ot3w4b` (after PR #14 merges;
   > check first that the branch has Phase 2's `src/components/ui/*` primitives —
   > if it doesn't yet, stop and say so). Read `PAIN-POINTS.md` and
   > `design-direction-v2.html` in the repo root first for conventions and visual
   > language. Commit locally; do not push, do not open a PR — a review pass
   > happens after you stop.
2. The builder must run, before stopping, and report verbatim:
   ```
   npx vitest run
   npm run build
   npx biome check src        # compare against the current baseline, don't regress it
   node scripts/check-style-tokens.mjs   # if the ticket touches src/features/**
   ```
3. The builder's final report must include: every file touched and why, the four
   command outputs, every judgment call it made on anything this ticket left
   open-ended, and anything it couldn't finish with the specific blocker.
4. Bring the diff + report back here (or to whichever Claude Code session is
   reviewing) for an independent multi-angle review before it gets pushed — same
   process used on Phases 1 and 2 (which each caught real bugs: a currency-parser
   edge case, a CSS specificity bug where an inline style silently defeated a
   pressed-state class, an untokenized literal hiding inside an exempted
   directory). Don't skip this step because a ticket looks small — Phase 1's
   smallest-looking item (a regex tweak) was also where a real bug hid.

---

## §A — Phase 3 — ✅ Shipped, PR #23

*Delivered: standing strip, Daily Leftover Ledger (`src/engine/dailyLeftover.ts`),
unified transaction surface, one-action FAB. Note that
`src/engine/dailyLeftover.test.ts` currently has one failing test on `main` — see
the Sprint 1 brief's baseline section.*

Don't re-derive this — `PHASE-3-HANDOFF.md` in the repo root is a complete,
self-contained brief (repo conventions, exact current primitive APIs, the full
Daily Leftover Ledger algorithm, non-goals, Definition of Done, report format).
Hand it to the builder as-is. One thing to add when you do: tell the builder which
branch actually has Phase 2's primitives merged in by then (PR #14, once merged,
or its branch directly if still open) — the handoff doc's branch name may be stale
by the time you run this.

---

## §B — Phase 4: remaining screens — ✅ All six shipped, PR #24–#29

Per the roadmap: same treatment Phase 3 gives Today — `<Screen>`/`<Card>`/`<Row>`/
`<StatTile>`/`<Amount>`/`<SectionHeader>`/`<Icon>` instead of raw inline literals,
lowering `scripts/style-tokens-baseline.json`'s count as each screen migrates.
Zero behavior change unless a ticket explicitly says otherwise — these are
restyles, not rewrites, except where a listed pain point requires a real fix.

### B1 — Assets screen — ✅ PR #24 (baseline 499 → 465)

**Scope:** Migrate `src/features/assets/AssetsScreen.tsx`, `AccountForm.tsx`,
`AssetForm.tsx` to the primitives. Account and asset rows become `<Row>`s (tap to
edit, unchanged). "Total balance" becomes a `<StatTile size="display">`. Replace
the `AUTO`/`PRICE STALE` inline-styled badges with a small shared badge pattern
(introduce one if none exists yet after Phase 3 — check what Phase 3 did for
transfer/status badges on Today's transaction rows first, and reuse that instead
of inventing a second one).
**No functional changes required.** Pure visual migration.

### B2 — Budget screen — ✅ PR #25 (465 → 389)

*Both folded-in fixes verified: the O3 weekend-allocation figure is rendered at
`GaugeCard.tsx:39-47`, and the empty state at `SafeToSpendScreen.tsx:44` now points
at More → Allowance.*

**Scope:** Migrate `src/features/budget/BudgetScreen.tsx`,
`weekly/SafeToSpendScreen.tsx`, `weekly/GaugeCard.tsx`, `weekly/Waterfall.tsx`,
`weekly/DayDots.tsx`, `monthly/MonthlyScreen.tsx`, `yearly/YearlyScreen.tsx` to the
primitives.

Also fix, while you're in these files:
- **B2 (empty-state pointer, PAIN-POINTS.md item)** — `SafeToSpendScreen.tsx`'s
  empty state currently reads "Go to More → Recurring Register to configure your
  personal pool," but the pool that gates the gauge (`useSafeToSpend.ts` checks
  `allowance.monthly_amount`) is set in **More → Allowance**, not Recurring
  Register. Fix the copy to point at the right place. This is a one-line text
  change — do it as part of this ticket, don't spin up a separate one.
- **O3** — the weekend gauge state (`GaugeCard.tsx`, the `remainingWorkdays === 0`
  branch) currently shows the word "Weekend" with no number, even though
  `allowance.weekend_allocation` is a real configured value. Show it (e.g. "Rp X
  weekend allowance" as a `<StatTile>` or similar), so the two days most
  discretionary spending happens aren't a blank screen.

**Depends on:** if Phase 3 built `useDailyLeftover`/`computeDailyLeftover`
(`src/engine/dailyLeftover.ts`), do NOT duplicate that here — this ticket is about
the existing weekly gauge only, which is unrelated math.

### B3 — Report screen — ✅ PR #26 (389 → 352)

*Includes the F4 per-category spend breakdown — the one substantive feature in
Phase 4.*

**Scope:** Migrate `src/features/report/ReportScreen.tsx` and
`src/features/home/HomeScreen.tsx` + `NWChart.tsx` to the primitives. The "This
month — actuals" card and the Net Worth hero both become `<StatTile>`/`<Card>`
compositions.

Also fix, while you're in this file:
- **F4 (category spend breakdown)** — this is the one substantive *feature* add in
  Phase 4, not just a restyle. `MonthlyScreen.tsx` is plan-only config; Report is
  actuals-only totals; neither shows spend-by-category. Add a per-category
  breakdown for the current month to Report (or fold into Monthly, your call —
  document which). Every transaction already carries a `category_id`; group this
  month's expenses by category, sum, sort descending, render as a list (use
  `<Row>`, category name as `primary`, `<Amount>` as `right`). This is what turns
  "you overspent" into "you overspent on X" (PAIN-POINTS.md Scenario C). No new
  schema needed — this is a query + aggregation over existing `db.transactions`
  and `db.categories`, similar to how `ReportScreen.tsx` already aggregates
  income/expense totals for the month.

### B4 — More + Decide — ✅ PR #27 (352 → 227)

*All five folded-in items delivered. S2 shipped the per-row exclude and the visible
skip count; per-field category/account/date overrides were scoped out as a
follow-up, as the ticket allowed.*

**Scope:** Migrate `src/features/more/MoreScreen.tsx` and its sheets
(`AllowanceEditor.tsx`, `RecurringRegister.tsx`, `PinSetup.tsx`,
`AssumptionsEditor.tsx`, `RestoreBackup.tsx`, `CategoryManager.tsx`,
`ImportPromptSheet.tsx`, `HouseholdSheet.tsx`) and `src/features/decide/*`
(`DecideScreen.tsx`, `SpendingLens.tsx`, `IncomeLog.tsx`, `Milestones.tsx`) to the
primitives — `MenuRow` becomes `<Row>`, section labels become `<SectionHeader>`.

Also address, while you're in these files (each is small; do all four together):
- **B1 (salary-update discoverability)** — income entry (`IncomeLog.tsx`) is four
  taps deep (More → Plan → Decide sheet → Income Log tab). Add a more direct entry
  point — a `MenuRow` under a new/existing "Income" section directly in
  `MoreScreen.tsx` that opens `IncomeLog` without the intermediate Decide tab
  navigation, or promote it to its own top-level sheet like Allowance already is.
  Your call on exact placement; document it.
- **B3 (Spending Lens in-context)** — `SpendingLens.tsx` only lives in the Decide
  sheet, disconnected from the moment someone would actually use it (looking at
  the gauge, or mid-way through logging an expense). Add a lightweight entry point
  from wherever Phase 3 put the safe-to-spend gauge/standing strip on Today (a
  small "what does this cost me?" affordance) that opens the same
  `SpendingLens` component. Don't duplicate its logic — reuse the component,
  just add a second way to reach it.
- **B4 (More reorg)** — 12+ rows in one flat list mixing appearance, financial
  config, household admin, and data plumbing. Group into clearer sections if not
  already effectively grouped by the existing `SectionLabel`s (check first — it
  may already be reasonably organized; if so, this item may already be
  substantially addressed and you should say so rather than reorganizing for its
  own sake).
- **S2 (reconcile all-or-nothing)** — `src/features/reconcile/ReconcileConfirmScreen.tsx`
  (used via More → Import Transactions) lets you override amount per row but not
  category/account/date, silently skips invalid rows with no visible reason beyond
  a small red line easy to miss, and has no per-row deselect short of cancelling
  the whole import. At minimum: make invalid-row skip reasons impossible to miss
  (not just a small red line — a clear count in the action button, e.g. "Approve
  22 of 25 — 3 skipped"), and add a per-row exclude toggle. Category/account/date
  overrides are a larger change — scope those as a follow-up if this ticket is
  already large, and say so in your report rather than cutting corners silently.
- **S3 (confirm-pattern consistency)** — `MoreScreen.tsx`'s sign-out uses
  `window.confirm`/`alert`; Restore Backup replaces all data behind one sheet with
  no explicit confirm at all. If Phase 3 introduced a shared confirm pattern for
  transaction delete (check `TransactionForm.tsx` after Phase 3 lands — it may
  have its own inline two-tap pattern, or Phase 3's reviewer may have generalized
  it per the Phase 2 review's altitude note about a future shared `ConfirmButton`),
  reuse that pattern for Restore Backup at minimum (the single most destructive
  action in the app). Standardizing sign-out is lower priority — note it, don't
  block the ticket on it.

### B5 — Chat / Manager — ✅ PR #28 (227 → 146)

*M1 shipped as a hand-rolled renderer (`src/lib/markdown.tsx`), no new dependency.*

**Scope:** Migrate `src/features/chat/ChatScreen.tsx`, `SessionList.tsx`,
`ModelPicker.tsx`, `SkillPicker.tsx` to the primitives where it doesn't conflict
with Chat's own scrolling/input-bar layout (the file itself notes chat manages
its own scroll region — respect that, don't force `<Screen>` where it breaks the
message-list layout; use the primitives for individual pieces like session rows
and the model/skill picker sheets instead).

Also fix, while you're in this file:
- **M1 (markdown rendering)** — assistant replies render via `white-space:
  pre-wrap` with no markdown parsing, so formatted responses show literal
  `**asterisks**`. Add a minimal markdown renderer (check if a lightweight one is
  already a dependency before adding a new package — prefer zero new deps if a
  small hand-rolled bold/italic/list/code-span renderer covers Claude's typical
  reply style adequately; only reach for a library if hand-rolling proves
  genuinely inadequate, and say which you chose and why).
- **M2 (stale default model + raw model IDs)** — `ChatScreen.tsx` hardcodes
  `claude-sonnet-4-20250514` as the fallback default model; check
  `ModelPicker.tsx` for the current list of available models and pick a sensible
  current default from it instead of a hardcoded stale string. Also give the
  model picker human labels (e.g. "Sonnet", "Opus") instead of exposing raw
  model-ID strings to the end user, while keeping the underlying ID as the stored
  value.
- **M3 (two competing import paths)** — `MoreScreen.tsx` offers "Get Claude
  Prompt" (external round-trip: copy a prompt, paste into a separate Claude
  session, copy its JSON output back into Reconcile) alongside the in-app chat,
  which already accepts pasted statement images directly via `log_transactions`.
  The external path is more discoverable but strictly worse. Either (a) remove
  the "Get Claude Prompt" / external-JSON-paste entry point from `MoreScreen.tsx`
  now that in-app image logging covers the same job, or (b) if you're not
  confident the in-app path fully covers every case the external one does (e.g.
  bulk multi-month imports), leave both but demote the external path visually
  (move it lower, relabel it "Advanced / bulk import") and make the in-app chat
  path more prominent. Pick one, document which and why — don't silently leave
  both equally prominent.

### B6 — Onboarding — ✅ PR #29 (146 → 132; combined tree recomputed at 120)

**Scope:** Migrate `src/features/onboarding/OnboardingWizard.tsx` to the
primitives (the 4-step wizard's fields/buttons).

Also fix, while you're in this file:
- **O2 (jargon + no skip path)** — steps 1–3 use "Pipe & DPLK," "RDPU," and lane
  terminology that's fine for the app's original author but is a real barrier for
  an invited household partner who just wants to log groceries. Add a lightweight
  "Skip — I'll fill this in later" path off step 1 (or a "Quick setup" vs. "Full
  setup" branch at the very start) that gets a second household member to a
  working app with just a name and a first account, deferring
  income/pipe/allowance entry to later (via the entry points from **B4** above,
  once those exist). Don't remove the detailed path — add a shorter one alongside
  it.

---

## §C — Standalone item — ✅ Shipped, PR #31

This one isn't in PAIN-POINTS.md as a fresh finding — it's a **known gap** the
Phase 1 PR (#13) explicitly called out and deferred:

### C1 — AI chat & reconcile import can't tag `recurring_item_id` — ✅ PR #31

*Delivered via `src/lib/recurringMatch.ts` (`resolveRecurringItemId`), which the
Sprint 1 brief now lists as a helper to reuse rather than reimplement.*

**Context:** Phase 1 added `Transaction.recurring_item_id` (nullable) so a logged
expense can be marked as paying a committed recurring item, keeping it from
drawing the personal safe-to-spend pool. The manual `TransactionForm` supports
tagging via a "Pays a recurring item" dropdown. Two other transaction-creation
paths were shipped **without** this capability:

- **`src/ai/tools.ts`** — the chat assistant's `log_transactions` tool hardcodes
  `recurring_item_id: null` on every row it creates. A bill or subscription
  payment logged by asking the AI assistant to log it therefore always draws the
  personal pool, even if it's a recognized recurring item.
- **`src/features/reconcile/ReconcileConfirmScreen.tsx`** / the import pipeline —
  same gap for statement-import rows.

**Scope:** For both paths, when a row's description/category plausibly matches an
active `RecurringItem`'s name (simple case-insensitive substring match against
`db.recurringItems.filter(r => r.is_active)` is sufficient — this doesn't need
fuzzy matching or ML), either auto-tag it or surface a lightweight confirmation
("This looks like your Netflix subscription — mark it as a recurring payment?")
before saving. For the AI path specifically, this may mean updating the tool's
JSON schema (check `src/ai/tools.ts` for how `log_transactions` is defined as a
tool spec) to accept an optional `recurring_item_id` and updating the system
prompt/context (`src/ai/context.ts`) to list active recurring items so the model
can match against them itself, similar to how it already lists accounts and
categories.
**Depends on:** nothing from Phase 3/4 — this is independent and can be built any
time.

---

## §D — Ledger Control (epic L1)

Elicited 2026-07-31 from a post-use complaint that no existing ticket covers:
*"can I change the account balance to the correct one without having to log the
transaction, because I forgot what I had used it for"* — plus a request for full
CRUD freedom over accounts/assets, income, recurring bills, and the weekly /
workday allowance.

**The full requirement lives in
`docs/plans/2026-07-31-ledger-control-requirements.md`** — business through test
plan, 11 sections, with the five design decisions (D1–D5) already made and
recorded in its §0.1. Do not re-derive it, and do not re-open D1–D5 without
saying why. What follows is the ticket split only.

**Read before starting:** that doc's §0.1 (decisions), §3 (functional
requirements), §7 (edge cases). The edge cases are where the real work is.

**Shared foundation — do this once, in D1's ticket, before anything else:**
`Transaction` gains `is_adjustment: boolean` (default `false`), and
`isWeekDraw()` in `src/engine/safeToSpend.ts:14` gains `!t.is_adjustment`. That
one function is shared by the safe-to-spend hook, `dailyLeftover.ts`, the AI
context builder and `check_affordability` — fixing it there fixes all four.
Legacy rows arrive with `is_adjustment === undefined`, so test truthiness, never
`=== false` (same convention the file already documents for `recurring_item_id`
at `safeToSpend.ts:19-22`).

### D1 — Balance correction ("Set true balance") 🔴 the headline ask

**Scope:** A correction is recorded as a **transaction**, not as a silent field
overwrite. Entering the true balance writes one `Transaction` carrying the delta
with `is_adjustment: true`, `category_id: null`. It moves the account balance and
net worth; it must **not** move safe-to-spend, the daily leftover ledger, the
category breakdown, or Report actuals. Later, the user can give it a category
once they remember what it was — which converts it into an ordinary transaction
(warn first if that lands in the current week and would draw the pool).

`manual_balance_override` keeps exactly one job — the onboarding opening balance
— and is **not** the correction mechanism. `AccountForm.tsx`'s
`accountType !== 'bank'` gate therefore stays as-is; bank accounts get
corrections through adjustment transactions like every other type.

Also in scope: the `balanceCorrections` audit table (append-only, attributed,
undoable), the correction sheet (three fields, delta preview, no category
picker), and distinct rendering of adjustments in every transaction list.

**Two traps, both mandatory to handle:**
1. **D1×D2 anchor collision.** `deriveBalance` skips transactions dated
   `<= last_balance_updated_at` (`src/lib/balances.ts:17`). An adjustment dated
   inside an onboarding anchor window is **silently discarded** — no error, the
   balance just doesn't move. Reject that as-of date at the boundary and say why.
2. **Offline duplicate.** Two devices correcting the same account offline both
   apply, leaving the balance wrong by the duplicate — unlike a last-write-wins
   overwrite, this cannot self-resolve. Detect same-account/same-date
   adjustments on sync and prompt. Do not auto-merge.

**Depends on:** PR #14 primitives. Nothing else.

### D2 — Accounts & assets CRUD

**Scope:** Assets currently have **no delete at all** — `assets.repo.ts` has no
`remove()` and `AssetForm.tsx` has no delete button. Add a tombstone delete
(`Asset.deleted_at`, filtered at every read, same pattern as
`incomeEvents.repo.ts`) plus a quick re-value action. Accounts: split
Deactivate from Delete; Delete is a tombstone and is **blocked while
transactions reference the account** — offer "move transactions to another
account" (which must move adjustments too) or "deactivate instead". Never offer
to delete the transactions. `accountsRepo.remove()` is currently a hard delete,
which the watermark sync will resurrect on the next pull — fix that.

### D3 — Income / salary CRUD

**Scope:** `incomeEventsRepo.update` exists and **the UI never calls it** —
there is no edit path, so a mistyped salary can only be deleted and re-entered.
Make an income card tappable into a pre-filled edit form. On save, recompute
`delta_vs_prev` for the edited row **and its neighbours** (a date edit reorders
the series), recompute the pipe/lifestyle split, and show it before committing.
Deleting the latest event must state which salary the FI projection falls back
to.

### D4 — Recurring bills CRUD

**Scope:** Mostly done already — create/edit/pause/tombstone-delete all work.
Two gaps: `next_due` and `end_date` are unreachable after creation (`next_due`
is hardcoded to `todayISO()` at `RecurringRegister.tsx:113`), and there are no
`update_recurring_item` / `delete_recurring_item` AI tools. Add both. An
`end_date` in the past must exclude the item from `getActive()`, which today
filters on `is_active` alone. Amount edits are prospective only — never rewrite
already-tagged historical transactions.

### D5 — Weekly & workday allowance

**Scope:** `AllowanceEditor.tsx` is two blind number inputs; the weekly pool and
today's ceiling that the user actually lives by are derived and never shown
there. Add a live derived preview driven by `computeSafeToSpend` ("Rp
2.500.000/month → Rp 480.000 this week → Rp 96.000 today across 5 workdays"),
let the user type the **weekly** figure instead (back-solved to monthly —
storage stays monthly, so `computeSafeToSpend` is untouched), and record changes
in an `allowanceHistory` table.

**Explicitly cut:** a *this-week-only* override. Decided against on
2026-07-31 — it needs its own table plus a new parameter on
`computeSafeToSpend`, and no one has asked for a travel-week adjustment yet.
Revisit as its own ticket if that changes.

### Sequencing

D1 first (it carries the shared `is_adjustment` foundation). D2–D5 are
independent of each other afterwards.

**Collision warning:** D1/D2 touch the same files as **§B1** (Assets screen) and
D5 touches the same files as **§B4** (More sheets, incl. `AllowanceEditor`).
Land B1/B4 first as pure restyles, then §D on top — or fold D1/D2 into B1 and D5
into B4 and drop the separate tickets. **Do not run them in parallel.**

**One live hazard these tickets must not spread:** `AllowanceEditor.tsx:22-23`,
`AccountForm.tsx:50` and `IncomeLog.tsx:185` still parse money with a bare
`.replace(/[.,]/g, '')`, which turns `12.5` into `125` — PAIN-POINTS.md T5, never
fixed in those three files. Any §D ticket touching them uses `parseRpInput`.

---

## Anything not listed here

If you find something in `PAIN-POINTS.md` not represented above, it's because it's
either already fixed (check the T1–T5 rows and PR #13 first) or it's one of the
D1–D9 design-debt items, which are covered implicitly: every §B ticket carries
"migrate this screen to the primitives," and that migration *is* the fix for
D1/D2/D3/D5/D6/D7 on that screen. D4 (icons) and D8 (light-theme token naming) are
narrower — D4 is fixed screen-by-screen as each migrates (add any missing
`IconName` entries as needed, following `src/components/ui/icons/paths.tsx`'s
existing convention); D8 (the ad-hoc blue `#4a9df0`/red `#e35d5b` FAB accent
colors, and `--amber` silently meaning blue in light mode) has one concrete
loose end worth calling out explicitly: **check that Phase 3's FAB rebuild
(§2.4 of `PHASE-3-HANDOFF.md`) actually removed those two stray hex colors from
`SpeedDialFAB.tsx`** — the handoff brief asks for an icon swap but doesn't
explicitly call out deleting the ad-hoc `bg`/`fg` hex values on the action array;
if Phase 3's builder left them, fold that fix into whichever §B ticket you do
right after (or file it as its own two-line ticket — it's that small).
