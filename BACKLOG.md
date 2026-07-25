# Backlog — Everything Still Unbuilt

**Status as of 2026-07-13.** This is a ready-to-execute ticket list distilled from
`PAIN-POINTS.md` (the analysis) and the project's build history so far. Use this
document, not `PAIN-POINTS.md` directly, when handing work to a builder — it tells
you exactly what's left, in what order, and with enough scope per ticket that a
smaller/local model (Claude Code running a MiniMax backend) can execute one without
re-deriving context. `PAIN-POINTS.md` stays the source of truth for *why*; this
file is the *what's left, in what order*.

## Where things stand

| # | What | State | Where |
|---|------|-------|-------|
| — | Elicitation: pain points + design audit + Calm Ledger direction | ✅ Merged | PR #12 |
| Phase 1 | Trust & safety fixes (T1, T2, T3, T5, O1, S1) | ✅ Merged | PR #13 |
| Phase 2 | Design primitives (`src/components/ui/*`, tokens, lint guard) | 🟡 Open, awaiting your review | PR #14 |
| Phase 3 | Today screen rebuild (standing strip, daily leftover ledger, unified transaction surface, one-action FAB, icons, slim AppBar) | 📋 Fully specified, **not yet built** | `PHASE-3-HANDOFF.md` (in PR #14's branch) |
| Phase 4 | Remaining screens migrate to the primitives | 📋 Not yet broken into tickets | **This document, §B** |
| Standalone | Everything in PAIN-POINTS.md not folded into a phase | 📋 Not yet broken into tickets | **This document, §C** |

**Recommended order:** merge PR #14 → build Phase 3 (already has its own complete
brief, use it as-is) → then work this document's §B and §C tickets, which have no
dependencies on each other and can go in parallel across sessions if you want.

---

## How to hand a ticket to a builder

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

## §A — Phase 3 (next up, already fully specified)

Don't re-derive this — `PHASE-3-HANDOFF.md` in the repo root is a complete,
self-contained brief (repo conventions, exact current primitive APIs, the full
Daily Leftover Ledger algorithm, non-goals, Definition of Done, report format).
Hand it to the builder as-is. One thing to add when you do: tell the builder which
branch actually has Phase 2's primitives merged in by then (PR #14, once merged,
or its branch directly if still open) — the handoff doc's branch name may be stale
by the time you run this.

---

## §B — Phase 4: remaining screens (one ticket per screen)

Per the roadmap: same treatment Phase 3 gives Today — `<Screen>`/`<Card>`/`<Row>`/
`<StatTile>`/`<Amount>`/`<SectionHeader>`/`<Icon>` instead of raw inline literals,
lowering `scripts/style-tokens-baseline.json`'s count as each screen migrates.
Zero behavior change unless a ticket explicitly says otherwise — these are
restyles, not rewrites, except where a listed pain point requires a real fix.

### B1 — Assets screen

**Scope:** Migrate `src/features/assets/AssetsScreen.tsx`, `AccountForm.tsx`,
`AssetForm.tsx` to the primitives. Account and asset rows become `<Row>`s (tap to
edit, unchanged). "Total balance" becomes a `<StatTile size="display">`. Replace
the `AUTO`/`PRICE STALE` inline-styled badges with a small shared badge pattern
(introduce one if none exists yet after Phase 3 — check what Phase 3 did for
transfer/status badges on Today's transaction rows first, and reuse that instead
of inventing a second one).
**No functional changes required.** Pure visual migration.

### B2 — Budget screen (weekly/monthly/yearly + history sheet)

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

### B3 — Report screen

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

### B4 — More + Decide

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

### B5 — Chat / Manager

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

### B6 — Onboarding

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

## §C — Standalone item already flagged in a merged PR, not yet built

This one isn't in PAIN-POINTS.md as a fresh finding — it's a **known gap** the
Phase 1 PR (#13) explicitly called out and deferred:

### C1 — AI chat & reconcile import can't tag `recurring_item_id`

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
