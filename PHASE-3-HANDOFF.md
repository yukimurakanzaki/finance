# Phase 3 Build Handoff — Today Screen Rebuild

**For:** an autonomous build agent (Hermes running MiniMax via Ollama).
**Reviewed by:** a separate Claude Code pass (Sonnet 5 or Opus 4.8) after you finish — see
"Handoff back" at the end. You do not need to review your own work beyond the
Definition of Done checklist; a second, independent AI will do that.

This document is self-contained. You have no memory of any prior conversation about
this project — everything you need is either in this file or in the repo files it
points you to. Read the referenced files before writing code; do not guess at APIs
this document doesn't show you inline.

---

## 0. Repo & branch

- Repo: `yukimurakanzaki/finance` (React 18 + TypeScript + Vite + Dexie/IndexedDB,
  offline-first personal-finance PWA, IDR currency, household cloud sync via Supabase).
- Branch: `claude/today-page-value-yr08x6`, based on `claude/fi-dashboard-safe-to-spend-ot3w4b`
  (the repo's long-lived integration branch — NOT `main`). If you cannot access that
  exact branch name, create `phase-3-today-rebuild` off the latest
  `claude/fi-dashboard-safe-to-spend-ot3w4b` and say so plainly in your final report.
- **Commit locally. Do not push, do not open a pull request.** A human/Claude Code
  review happens after you stop (see end of document).
- Every commit message must end with:
  ```
  Co-Authored-By: MiniMax (Hermes) <noreply@hermes.local>
  ```

## 1. What already shipped (read these before touching anything)

Two prior phases are merged into your base branch already. Do not re-do or undo them.

1. **`PAIN-POINTS.md`** (repo root) — the full requirements doc. Read in full, but
   especially:
   - The **Executive summary** and **"How to read this document"** sections (defect
     vs. experience-gap vs. design-direction classification).
   - **F1–F4** (fragmentation pain points — Today has no standing/context strip, and
     there are two disjoint transaction lists).
   - **T2's `DECISION (2026-07-12)`** block — the safe-to-spend pool semantics
     already implemented: `allowance.monthly_amount` is the personal pool, already
     net of all recurring items; a transaction tagged with `recurring_item_id`
     never draws the pool. Don't relitigate this — it's shipped, tested, and the
     engine (`src/engine/safeToSpend.ts`) and hook (`src/hooks/useSafeToSpend.ts`)
     already implement it via the shared `isWeekDraw()` predicate.
   - The **Implementation roadmap**'s Phase 3 paragraph (search for "Phase 3 — Today
     screen on the new system") — this is your assignment, verbatim from the plan.
2. **`design-direction-v2.html`** (repo root) — open it in a browser. This is the
   visual target: a phone-frame mock of the Today screen in the "Calm Ledger"
   style, with numbered annotations explaining each change and which pain point it
   answers. Match its visual language (type scale, row layout, standing strip,
   Today anchor pill, one-action FAB, real icons) — you do not need to match it
   pixel-for-pixel, but the *shape* of the layout and the primitives it implies are
   what Phase 2 (below) already built for you to consume.
3. **Phase 2 — the primitive component library**, already merged, at
   `src/components/ui/`. **You must build Phase 3 using these components. Do not
   write new raw `style={{ fontSize: 13, padding: 12, ... }}` literals in feature
   code** — a lint guard (`scripts/check-style-tokens.mjs`, wired into `npm run
   lint`) enforces this against a ratchet baseline and will fail your build if you
   add new violations (see §6).

### The primitives you have available (`import { ... } from '@components/ui'`)

Read each file in `src/components/ui/` before use; exact current signatures:

- **`<Screen noPadding? style? className?>`** — page container, 16px gutter,
  vertical flex, `--space-4` gap between children. Wrap your rebuilt Today screen's
  body in this instead of an ad-hoc padded div.
- **`<Card padding? style? className?>`** — the ONE bordered-box primitive
  (bg-1, 1px border-1, 16px radius). Use it for the standing strip. Do not add a
  second box style — everything else should be `<Row>` or plain flex, per the
  "rows not boxes" design intent (PAIN-POINTS.md D2).
- **`<Row primary caption? icon? right? onClick? aria-label? style? className?>`**
  — flush 56px list row with a single hairline bottom border and a pressed state
  (renders as `<button>` when `onClick` is passed, else `<div>`). This is your
  transaction-list row primitive. `right` is typically an `<Amount>`.
- **`<StatTile label value sub? size='display'|'title' style? className?>`** — an
  uppercase caption label over one tabular-nums number (display=34px hero,
  title=17px). This is the standing-strip building block.
- **`<Amount value full? tone='default'|'positive'|'negative'|'muted' sign='auto'|'always'|'never' style? className?>`**
  — the ONE sanctioned way to render a rupiah figure: tabular-nums, right-aligned,
  delegates to the existing `formatRp`/`formatRpFull` from `@lib/currency`. Use it
  for every amount you render (row amounts, stat tile values, the hero number).
- **`<SectionHeader trailing? style? className?>children</SectionHeader>`** —
  sentence-case 13px semibold section title with an optional right-aligned
  trailing summary (e.g. "3 · −Rp 61.500"). Use this for "Transactions" instead of
  a 10px-uppercase label.
- **`<Icon name size=20 strokeWidth=1.7 aria-label? style? className?>`** — inline
  SVG icon, `currentColor` stroke. Current `IconName` union (see
  `src/components/ui/icons/paths.tsx`): `'today' | 'budget' | 'manager' | 'assets' |
  'report' | 'more' | 'add' | 'transfer' | 'search' | 'close' | 'chevron-left' |
  'chevron-right'`. **If Today's rebuild needs an icon that doesn't exist yet**
  (e.g. a food/category icon, an income icon), add it to `ICON_PATHS` and the
  `IconName` union in that file — follow the existing 24-viewBox/1.7-stroke/
  currentColor convention exactly, and keep the icon abstract/generic (no
  per-category icon set — categories are user-defined free text, not a fixed enum).

### Files you will modify

- `src/features/today/TodayScreen.tsx` — full rebuild (see §2).
- `src/features/today/SpeedDialFAB.tsx` — becomes a one-action FAB (see §2.4).
- `src/components/TabBar.tsx` — swap the emoji glyphs (`☰ ◎ ✦ ◈ ⌂ ···`) for
  `<Icon name="today"|"budget"|"manager"|"assets"|"report"|"more" />`. The `manager`
  icon already exists and maps to the Chat tab.
- `src/App.tsx` — the `AppBar` component (in this file) currently renders a title +
  subtitle at ~64px tall. Slim it to a single 44–48px row (title only, no
  subtitle) per PAIN-POINTS.md D9. This is a small, isolated change — do not
  restructure `AppShell`/routing.
- `scripts/style-tokens-baseline.json` — you MUST lower the `"count"` value in this
  file once you've migrated `src/features/today/**` off raw style literals (see §6).

### Files you must NOT modify

Everything under `src/features/budget/`, `src/features/assets/`, `src/features/report/`,
`src/features/more/`, `src/features/decide/`, `src/features/chat/`,
`src/features/onboarding/`, `src/features/reconcile/`, `src/features/auth/`, and
every file under `src/engine/`, `src/db/`, `src/hooks/` **except** where §2 explicitly
tells you to add something. If you think a change outside this list is necessary,
stop and say so in your final report instead of making it — don't improvise scope.

One narrow exception: `src/features/budget/TransactionHistory.tsx` currently
duplicates search/list logic that Today's rebuild subsumes (see §2.3). You may
**delete** its now-redundant search/filter UI and have it delegate to (or be
replaced by) the shared component you build for Today, but the `BudgetScreen.tsx`
"View all transactions →" entry point must keep working — it can open the same
unified transaction browser Today now uses. If this feels risky, the safe fallback
is: leave `TransactionHistory.tsx` completely untouched, and don't claim F2/F3 are
fully dissolved — see the Definition of Done for exactly what's required vs. optional.

---

## 2. Scope: what to build

Quoting the roadmap you're implementing (`PAIN-POINTS.md`, Phase 3):

> Rebuild Today per `design-direction-v2.html`: standing strip (F1, T4), Today
> anchor pill, row list, one-action FAB, slim AppBar — plus the unified transaction
> surface (F2/F3: title/category search, tappable rows, period scope), since Today
> is its natural home. This PR is the reference implementation for Phase 4.

Six concrete deliverables:

### 2.1 Standing strip (replaces the three `DayChip`s)

A single `<Card>` near the top of the screen containing:
- **Hero `<StatTile>`** (`size="display"`): label "Safe to spend today", value from
  the existing `useSafeToSpend()` hook's `result.todayCeiling` (already computed,
  already correct — do not reimplement this math). Render `Rp 0 /day` /
  "Weekend" states exactly as `src/features/budget/weekly/GaugeCard.tsx` already
  does (read that file — reuse its `isNegativePool`/`remainingWorkdays === 0`
  branches conceptually, but render through `<StatTile>`/`<Amount>`, not
  GaugeCard's old inline styles).
- A row of 3–4 smaller stats (title-size `<StatTile>`s or a plain flex row of
  label+`<Amount>` pairs) below the hero:
  - **Spent today** — sum of today's non-transfer expenses (this already exists as
    `TodayScreen`'s old `expenses` calculation — keep the logic, restyle the
    presentation).
  - **Wallet balance** — total across active accounts, from `useAccountBalances()`
    (`src/hooks/useAccountBalances.ts`) — this hook already exists and is used by
    the Assets screen; import and use it here too, don't recompute balances.
  - **Monthly leftover** — see §2.2, the new Daily Leftover Ledger. This is the one
    genuinely new number on the whole screen; everything else above already
    existed in some form and is being re-presented, not recalculated.

### 2.2 Daily Leftover Ledger (new — the one new engine piece)

This is a deliberate, specified feature — implement exactly this algorithm, do not
invent a different one. It answers a different question than the existing weekly
safe-to-spend gauge (which resets every week): "how much of this month's personal
allowance do I have left, running total, as of the day I'm looking at — and what
would it project to if I stopped spending?"

**Create `src/engine/dailyLeftover.ts`** (new file, parallel to the existing
`src/engine/safeToSpend.ts` — do not modify `safeToSpend.ts`, this is additive):

```ts
export interface DailyLeftoverInput {
  monthlyAmount: number       // allowance.monthly_amount, current value
  transactions: Transaction[] // all transactions in the relevant month
  asOfDate: string            // YYYY-MM-DD, the day being viewed
}

export interface DailyLeftoverResult {
  leftover: number       // running total as of asOfDate (see algorithm)
  isProjected: boolean   // true when asOfDate is after today (no txns exist yet there)
}

export function computeDailyLeftover(input: DailyLeftoverInput): DailyLeftoverResult
```

**Algorithm** (deliberately simple — do not add proration, carry-over between
months, or retroactive rewrites when the allowance changes):

1. Let `monthStart` = the 1st of `asOfDate`'s calendar month (`YYYY-MM-01`).
2. Start `leftover = monthlyAmount` (the CURRENT value of `allowance.monthly_amount`
   — if the user changes it mid-month, every day in that month recomputes against
   the new value; there is no stored historical ledger, everything is derived
   fresh from `transactions` + the live `allowance` row, same pattern as
   `computeSafeToSpend` already uses).
3. For every transaction `t` where `isWeekDraw(t)` is true (reuse this exact
   predicate — import it from `@engine/safeToSpend`; it already excludes
   transfers, `pass_through` lane, and `recurring_item_id`-tagged rows — that's
   precisely "personal, non-committed" spend, which is what this ledger should
   also track) **and** `monthStart <= t.date <= asOfDate` (inclusive of both
   ends, i.e. including the viewed day's own transactions):
   - `leftover += t.direction === 'in' ? t.amount : -t.amount`
4. `isProjected = asOfDate > todayISO()` (`@lib/dates`). When projecting into the
   future, there are no transactions dated later than today, so step 3 simply
   contributes nothing past today — the result is "what you'd have left if you
   stop spending," which is the correct, simple interpretation. Do not attempt to
   subtract future-dated recurring items or otherwise "predict" spending.
5. Do not clamp `leftover` to zero — a negative leftover is a legitimate signal
   (overspent this month) and should render in `tone="negative"` on the `<Amount>`,
   not be hidden.

**Add the corresponding hook** `src/hooks/useDailyLeftover.ts`, following the exact
shape of `src/hooks/useSafeToSpend.ts` (a `useLiveQuery` wrapper): takes the viewed
`day` (the same `day` state `TodayScreen` already tracks for its date navigator),
pulls `db.allowance.get('local')` and the month's transactions
(`db.transactions.where('date').between(monthStart, monthEnd, true, true)`), and
calls `computeDailyLeftover`. Return `{ result: DailyLeftoverResult | null,
isLoading: boolean }` matching `useSafeToSpend`'s return shape.

**Wire it into the standing strip**: the "Monthly leftover" stat tile's value
changes as the user navigates days with the existing ‹ › date nav — showing the
past day's post-transaction total when browsing backward, and the flat projected
total when browsing forward into the future (tag it visually, e.g. a small
"(projected)" caption via the `sub` prop, when `isProjected` is true).

**Tests**: add `src/engine/dailyLeftover.test.ts` with at minimum: a mid-month day
with mixed income/expense transactions nets correctly; a transaction tagged with
`recurring_item_id` does NOT affect the leftover (reuses `isWeekDraw`, same as the
existing safe-to-spend tests already verify — mirror that test's setup); a
transfer does NOT affect it; a future date returns `isProjected: true` and equals
the last real day's leftover; a past date within the month returns
`isProjected: false`; changing `monthlyAmount` between two calls with the same
transaction set changes the result (no caching/staleness).

### 2.3 Unified transaction surface (F2/F3)

Today currently shows one day's transactions with no search; a *separate* history
browser lives in `src/features/budget/TransactionHistory.tsx` with search/period
filters but non-tappable rows. Fold these into one capability, reachable from
Today:

- Rebuild the transaction list on Today using `<Row>` (icon left — pick something
  generic like a bullet/dot or omit the icon slot for now if no natural per-item
  icon exists; primary = title/note/category fallback chain, same priority the old
  code used: `txn.title ?? txn.note ?? catName.get(...) ?? '(no title)'`; caption =
  `category · account`; right = `<Amount value tone="positive"|"default" sign="auto">`).
  Transfers render with a `transfer` icon and muted tone, same semantic distinction
  the old code drew (dashed border → now just muted `<Row>` styling, e.g. lower
  opacity or `tone="muted"` on the Amount).
- Add a search affordance (a `search` `<Icon>` button in the slimmed AppBar, or a
  search field that appears above the list) that searches **title, category name,
  AND note** (the old `TransactionHistory` only searched note+account — that gap is
  explicitly called out as pain point F3 in PAIN-POINTS.md; your search must fix
  it, not repeat it).
- Add a period scope control so the same surface can show "today" (default, driven
  by the existing day nav), or broaden to week/month/all — this is what dissolves
  the separate history sheet. A simple segmented control (reuse the visual pattern
  from `BudgetScreen.tsx`'s existing horizon segment control, restyled with tokens)
  is sufficient; it does not need to be fancy.
- Every row must be tappable (`onClick` → opens `TransactionForm` in edit mode,
  exactly as Today already does today) — this is the core F2 fix (the old history
  browser's rows were plain divs, not tappable).
- Update `BudgetScreen.tsx`'s "View all transactions →" button so it still leads
  somewhere sensible (open the same component in a broadened/"all time" scope, or
  simply route to the Today tab — your call, document which you picked).

### 2.4 One-action FAB

`SpeedDialFAB.tsx` currently requires two taps for the dominant action (open dial
→ Expense). Per the design mock, make the default single tap open the expense
form directly; keep Income/Transfer/Ask AI reachable via a long-press or a small
secondary affordance (a short-press-and-hold reveal, or a smaller "+" that expands
on a second tap if long-press isn't practical in this stack — pick whichever is
simpler to implement correctly; document your choice). Render it with
`<Icon name="add">` instead of the raw `+` glyph, sized/styled per the mock.

### 2.5 Today anchor pill + date nav

Per the mock: when viewing today, show a small pill/badge reading "Today" next to
the date label. When the user has navigated to a different day, that same pill
becomes tappable and reads "Back to today" (or similar), jumping back to
`todayISO()` on tap. Replace the `‹`/`›` glyph buttons with
`<Icon name="chevron-left">`/`<Icon name="chevron-right">`.

### 2.6 Slim AppBar

In `src/App.tsx`, the `AppBar` function currently renders `title` + an optional
`subtitle` line, ~64px total. Reduce it to a single-row, ~44–48px bar (title only,
drop the subtitle entirely — the `SCREENS` map's `subtitle` fields become dead
values you can leave as unused strings or remove, your call, just don't break the
other five screens that also render through `AppBar`). This is a small, isolated
change with app-wide effect — test that Budget/Manager/Assets/Report/More still
render correctly after this change (their content didn't move, only the bar above
them got shorter).

---

## 3. Non-goals (explicitly out of scope)

- Do not touch `src/engine/safeToSpend.ts` or its existing tests — the weekly
  gauge is shipped and correct; the Daily Leftover Ledger is a new, additive,
  parallel calculation, not a replacement.
- Do not change the `Transaction`, `Account`, or `Allowance` DB schema — no Dexie
  version bump is needed for this phase.
- Do not redesign Budget, Assets, Report, More, Chat, Onboarding, or Auth. If the
  slimmed AppBar or new Icon set changes how those screens *look* in a shared
  chrome element, that's expected and fine; changing their *own* screen content is
  not in scope.
- Do not remove or rename any existing `--amber*`/`--engine`/`--store`/`--debt`/
  `--protected` token — Phase 2 added `--accent*` as an alias specifically so nothing
  downstream breaks; use whichever name you prefer going forward in new code, but
  don't delete the old ones.

## 4. Design/tone constraints (carried over from PAIN-POINTS.md)

- **One accent, informative not alarming** — amber/accent is for the safe-to-spend
  gauge and CTAs, never for "you overspent" panic. A negative leftover renders in
  `tone="negative"` (ink-1 with a minus sign per `Amount`'s existing convention),
  not red/alarm styling.
- **No emoji/glyph icons** anywhere you touch — this phase exists partly to retire
  them (D4). Every icon must go through `<Icon name="...">`.
- **Tabular numbers everywhere** — every amount on screen goes through `<Amount>`,
  never a hand-formatted string.
- **44px minimum touch targets** — the old day-nav buttons were 34px (D6); fix this
  as you rebuild them.

## 5. Currency/locale details already correct — do not "fix" these again

- `formatRp`/`formatRpFull` (`src/lib/currency.ts`) already use Indonesian
  abbreviations (jt = juta/millions, M = miliar/billions) — this was a Phase 1 fix.
  Don't touch this file.
- `parseRpInput` is already strict/decimal-safe — Phase 1 fix, don't touch.

## 6. The lint-token ratchet — you MUST lower it

`scripts/check-style-tokens.mjs` scans `src/features/**` for raw `fontSize`/
`padding*`/`borderRadius` numeric or px-string literals and compares the count
against `scripts/style-tokens-baseline.json`'s `"count"` field (currently 507).
It **passes if you're at or below the baseline, fails if you exceed it**.

Since you're migrating `src/features/today/**` to use the primitives (which set
these values internally via CSS custom properties, invisible to the scan), your
changes should **reduce** the count. Before finishing:

```
node scripts/check-style-tokens.mjs
```

Read the printed count, and if it's lower than the current baseline, **update
`scripts/style-tokens-baseline.json`'s `"count"` to the new, lower number** — this
locks in your improvement so Phase 4 can't silently regress past it. If your
changes somehow *increase* the count (e.g. you left raw literals in new Today
code instead of using the primitives), that's a sign you didn't use `<Row>`/
`<StatTile>`/`<Amount>`/`<SectionHeader>` where you should have — go back and fix
it rather than bumping the baseline up.

## 7. Definition of Done — verify ALL of these before stopping

```
npx vitest run          # every existing test still passes, plus your new ones
npm run build            # tsc -b && vite build — must exit 0
npx biome check src      # report the before/after error count; must not increase
                          # (baseline going in: 299 errors, 119 files — this is
                          # PRE-EXISTING repo debt unrelated to you; don't try to
                          # fix it, just confirm you didn't add to it)
node scripts/check-style-tokens.mjs   # must exit 0; report old vs new count
```

Also manually confirm (no automated test covers these, describe your check in the
final report):
- Today screen renders with no console errors for: a day with 0 transactions, a
  day with several including a transfer, a day with only expenses, viewing a
  future date, viewing a past date.
- The FAB's primary action opens the expense form; the secondary path (however you
  implemented it) still reaches Income/Transfer/Ask AI.
- Tapping a transaction row opens it in edit mode (existing behavior, must not
  regress).
- The Today anchor pill correctly flips between "Today" (static) and "Back to
  today" (tappable) as you navigate days.
- Budget/Assets/Report/More/Manager tabs still render (slimmed AppBar didn't break
  their layout).

## 8. Final report — required format

When you stop, report:
1. Every file created/modified, one line each on *why*.
2. Verbatim output of the four Definition-of-Done commands above (exact pass/fail
   counts, not paraphrased).
3. The lint-token count before and after, and confirmation you updated
   `style-tokens-baseline.json` if it went down.
4. Every design/implementation judgment call you made where this document said
   "your call" or left something open-ended, and what you chose.
5. Anything in this document you could not complete, with the specific blocker —
   do not silently drop a requirement.
6. Confirm you did NOT touch any file outside the allowed list in §1, or list
   exactly what you touched and why if you had to deviate.

---

## Handoff back — what happens after you stop

A Claude Code session (Sonnet 5 or Opus 4.8) will review your diff next, using
this process (for your awareness — you don't need to do this yourself):

1. Read your final report and the diff (`git diff
   claude/fi-dashboard-safe-to-spend-ot3w4b...claude/today-page-value-yr08x6` or the
   equivalent for whatever branch you used).
2. Run an independent multi-angle review (correctness/line-scan, removed-behavior,
   cross-file breakage, reuse, simplification, efficiency, altitude/architecture)
   looking for real bugs — the kind of thing a fresh pair of eyes catches that the
   builder's own verification wouldn't (see Phase 1 and Phase 2 of this project's
   history for examples: a currency-parser edge case, a CSS specificity bug where
   an inline style silently defeated a pressed-state class, an untokenized literal
   hiding inside an exempted directory).
3. Fix whatever it finds directly, re-verify (re-run the four commands above), and
   only then push and open a draft PR against `claude/fi-dashboard-safe-to-spend-ot3w4b`
   with a summary of what shipped and what the review caught and corrected.

You do not need to anticipate this — just build carefully, verify honestly, and
report precisely. A thorough, honest final report (especially section 4 and 5
above — where you made a judgment call or hit a wall) is more valuable to the
review pass than a report that claims everything went perfectly.
