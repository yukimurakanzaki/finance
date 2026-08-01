# Plan — v2 Decision-First Restructure (4 tabs)

Status: Rewritten after deep review, 2026-07-10. Supersedes the v1 draft (approved by PO
2026-07-10) — v1's task shape and intent are preserved; this version closes blindspots
found by reading every file it touches.
Wireframes: https://claude.ai/code/artifact/3df86ef0-a6b8-4ee7-a993-15c5f9a11b0c
Executor: Cline / Hermes. This doc is self-contained — do not invent scope beyond it.
If a task references a "Finding" below, read it before writing code for that task —
it's the reasoning the original plan was missing.

## Context

Restructure from 6 tabs (home, budget, chat, assets, decide, more) to 4 tabs
(spend, assets, report, more), landing on Spend. Presentation-only: no engine,
DB, or sync changes — **except T0**, a narrowly-scoped import-time fix without which
T4 cannot be verified (see Finding 1).

Constraints (from design principles — do not violate):
- Amber informs, never red-alarms (except over-bucket bars in Report, which use `--debt`,
  a slate-gray `#64748b` — NOT red. Confirmed in `src/index.css:28`).
- Facts, not advice: no "don't spend" copy anywhere.
- Money is integer rupiah; format via `@lib/currency`. Use `formatRpFull` (exact) for any
  panel where numbers must reconcile to the rupiah (T7, T4 bars); `formatRp` (abbreviated
  M/B) is fine for headline numbers only (gauge, hero).
- Match existing inline-style idiom; reuse existing components (AmberBanner, BottomSheet,
  GaugeCard patterns). No new dependencies.
- There is no `--ok` CSS variable in this codebase (verified in `src/index.css`). The
  existing "positive/green" semantic variable is `--engine` (`#34d399`). Use it, not a
  new `--ok` var.

---

## Deep-review findings (read before building)

These are blindspots in the original 8-task plan, found by reading every file each task
touches (`appStore.ts`, `TabBar.tsx`, `App.tsx`, `safeToSpend.ts`, `categories.repo.ts`,
`transactions.repo.ts`, `db/types.ts`, `seedTransactions.ts`, `ai/tools.ts`,
`TransactionHistory.tsx`, `GaugeCard.tsx`, `Waterfall.tsx`, `MoreScreen.tsx`,
`useFIProjection.ts`, `useNetWorth.ts`, `AssetsScreen.tsx`, `HomeScreen.tsx`, i18n files).

**Finding 1 — T4's "category bars" have zero real data to render against.**
`category_id` on `Transaction` is `null` in every code path except the AI/Claude reconcile
import (`src/ai/tools.ts:263-272`, matches `category_name` case-insensitively against
`categoriesRepo.getAll()`). Specifically:
- `QuickLogFAB.tsx:43` hardcodes `category_id: null` on every manual log.
- `seedTransactions.ts:51` hardcodes `category_id: null` on every one of the 688 seeded
  Jan–Jun 2026 rows — **even though** `data/transactions-jan-jun-2026.json` already carries
  a `category` string per row (`SeedRow.category`, `seedTransactions.ts:14`) that is read
  and then silently discarded.
The v1 plan's own verify step for T4 ("bars match manual sums for the seeded Jan–Jun 2026
data") is impossible as written — there is nothing to sum. **T0 below fixes this** by
reusing the exact resolution pattern already used in `ai/tools.ts` (name → category,
case-insensitive) inside `seedTransactionsIfNeeded()`. This is import-time enrichment, not
an engine change, and touches one file.

**Finding 2 — Category → "bucket" is not a 1:1 field; it's routed through Envelope.**
`Category` (`db/types.ts:89-95`) has `envelope_id: string | null`, not a bucket amount of
its own. `Envelope` (`db/types.ts:97-105`) has `target_amount` + `horizon`
(`yearly | monthly | weekly`). Two problems the v1 plan didn't address:
- A category can have `envelope_id: null` → no bucket at all (spend-only bar, as v1
  correctly anticipated, but didn't say how to compute the fallback bar's "full" width).
- An envelope's `target_amount` must be normalized to a **monthly** figure before it can
  be a per-month bucket: `monthly === target_amount`, `yearly === target_amount / 12`,
  `weekly === target_amount × weeksInMonth(selectedYearMonth)`. v1 never mentions this
  conversion; T4 below specifies it exactly.
- Multiple categories can share one `envelope_id` (many-to-one). Showing the envelope's
  full `target_amount` on *each* category that points to it double-counts the bucket
  visually. T4 below specifies: if 2+ categories share an envelope, show the bar as
  spend-only (no bucket line) for all of them and note "(shared bucket)" — do not divide
  the target arbitrarily, that would be inventing data.

**Finding 3 — `Tab` type is duplicated, not shared.**
`appStore.ts:3` and `TabBar.tsx:4` each independently declare
`type Tab = 'home' | 'budget' | 'assets' | 'chat' | 'decide' | 'more'`. There is no shared
export. T2 below extracts one `Tab` type, exported from `appStore.ts`, imported by
`TabBar.tsx` — both files must change, and `'home'` must be **removed** from the union
entirely (not just hidden from the tab bar) once `HomeScreen` is deleted in T3, otherwise
`activeTab` can hold a value (`'home'`) with no reachable UI and no `SCREENS['home']` entry,
which is a silent dead state, not just dead code.

**Finding 4 — i18n additions are underspecified.**
`src/i18n/types.ts` has no `report` section and no `nav.spend` / `nav.report` fields at all
— this isn't "add a nav label," it's a new top-level `Translations.report` interface block
(title, subtitle, category-bar copy, feed-forward template, empty state) that must be added
to **three** files in lockstep: `types.ts` (interface), `en.ts`, `id.ts`. v1 says "keep old
keys (still used)" for `nav.home/chat/decide` — that's not accurate: `TabBar.tsx` is the
*only* consumer of `t.nav.*`, and once the tab bar shrinks to 4 entries, `nav.home`,
`nav.chat`, `nav.decide` become unused. Keeping them is fine (cheap, avoids touching the
`Translations` interface shape unnecessarily) but the reason is "not worth the diff," not
"still used" — say so in the commit message so a future cleanup pass isn't confused.
`App.tsx`'s `SCREENS` map needs `t.report.title` / `t.report.subtitle` for the `AppBar`,
following the exact pattern every other screen entry already uses (`App.tsx:75-82`).

**Finding 5 — T7's "new collapsible panel" duplicates the existing `Waterfall.tsx`.**
`SafeToSpendScreen.tsx` already renders `<GaugeCard result={result} /><Waterfall
result={result} />`. `Waterfall.tsx` **already shows 4 of T7's 6 rows** (`personalPool`,
`personalSubTotal`, `weekendAllocation`, `weekPool`) uncollapsed, using `formatRpFull`
already. Building a second, separate "why this number" panel would show the same 4 numbers
twice on one screen — bad UX, not what a careful engineer would ship. **T7 below is
corrected to extend `Waterfall.tsx` in place**: add the two missing rows (spent this week,
today ceiling division) and wrap the whole thing in a collapse toggle, rather than
creating a new component from scratch.

**Finding 6 — T5's "TabBar highlights More" doesn't happen automatically.**
`setTab('chat')` sets `activeTab` to `'chat'`, not `'more'`. Once `TABS` in `TabBar.tsx`
only contains 4 entries (`budget/assets/report/more`), the active-check
(`activeTab === t.id`) matches *nothing* while on chat/decide — every tab renders
unhighlighted, it does not specifically highlight More. If the plan's promised behavior
("TabBar highlights More") is to actually happen, the active-check needs an explicit
alias, given in T5 below.

**Finding 7 — T8's "tick-down animation" needs local state; it will not happen for free.**
`GaugeCard` is a stateless display component fed by `result` from `useSafeToSpend()` (a
Dexie `useLiveQuery`, which just re-renders with the new value — no transition). To animate
old→new you need to retain the previous value and interpolate frames yourself (no animation
library allowed). T8 below specifies a small `useTickingNumber` hook. It also clarifies a
scope point v1 missed: `QuickLogFAB` is mounted globally in `App.tsx` regardless of active
tab, so a log made while on Assets/Report/More will **not** animate the gauge (it isn't
mounted) — the gauge will just show the correct value next time it mounts. That's correct
behavior, not a bug; state it explicitly so the builder doesn't try to force a cross-screen
animation.

**Finding 8 — `TransactionHistory.tsx` has no month-pinning prop, only a 4-way `Period`
enum (`this_month | last_month | this_year | all`).** T4's "tap category → filtered list
below it" implies filtering to *whatever month the Report screen currently has selected*,
which can be any past month, not just this/last. `TransactionHistory` needs a new optional
prop to pin an arbitrary `{ from, to }` range, in addition to its own period selector, or
the embedded instance in Report will silently ignore the selected month. Specified in T4.

**Finding 9 — a pre-existing (out-of-scope) bug in the gold-staleness dismiss.**
`HomeScreen.tsx`'s gold banner is gated on `isGoldStale` (derived live from data in
`useNetWorth`), but its `onDismiss` calls `dismissGoldNudge`, which only flips the
*unrelated* `showGoldNudge` store flag — which the banner's visibility condition never
reads. Clicking the × on the gold banner today does nothing observable. T3 moves this
block verbatim into `AssetsScreen.tsx`; **preserve the bug as-is** (fixing it is
out-of-scope per "no scope creep," and `AssetsScreen.tsx` already has its own, unrelated
per-asset "PRICE STALE" tag — both can coexist, they're different granularities: one says
"something's stale," the other says "which one"). Flagging this so the builder doesn't
"fix" it mid-move and call that a regression risk.

---

## Tasks (in order; each independently verifiable)

### T0 — Prerequisite: resolve category names on seed import (new)
**Why:** Finding 1. Without this, T4 has no data to verify against.
- `src/import/seedTransactions.ts`: before the insert loop, load categories once:
  `const categories = await db.categories.toArray()`.
- In the per-row mapping (currently line 51, `category_id: null`), replace with:
  ```ts
  const category = row.category
    ? (categories.find((c) => c.name.toLowerCase() === row.category!.toLowerCase()) ?? null)
    : null
  ```
  and set `category_id: category?.id ?? null`. This mirrors `ai/tools.ts:263-265` exactly
  — same matching rule, so behavior is consistent across both import paths.
- This only helps if categories with matching names exist *before* seeding runs. Check
  `src/features/onboarding/OnboardingWizard.tsx` and any default-category seed — if no
  default categories are created during onboarding/setup, add a one-time default category
  seed (names matching the distinct `category` values found in
  `data/transactions-jan-jun-2026.json`) gated behind its own `AppSettingKey`
  (`seeded:default-categories`), inserted before `seedTransactionsIfNeeded()` runs in
  `App.tsx`'s `useEffect`. Do not invent categories beyond what the JSON actually contains
  — enumerate the distinct `category` strings in the JSON file first.
- Verify: after a fresh IndexedDB (clear site data) + reload, `db.transactions` rows
  seeded from `transactions-jan-jun-2026.json` have non-null `category_id` for every row
  whose source JSON `category` field is non-empty and case-insensitively matches a
  category name.

### T1 — Land on Budget tab
- `src/stores/appStore.ts`: default `activeTab: 'budget'` (was `'home'`).
- Verify: reload app → opens on the safe-to-spend gauge.

### T2 — Tab restructure: 6 → 4, single source of truth for `Tab`
- `src/stores/appStore.ts`: define and **export**
  `export type Tab = 'budget' | 'assets' | 'chat' | 'decide' | 'more' | 'report'`
  (`'home'` removed entirely — Finding 3). Update `BudgetHorizon` import site untouched.
- `src/components/TabBar.tsx`: delete the local `type Tab = ...` line; instead
  `import type { Tab } from '@stores/appStore'`. `TABS` becomes:
  ```ts
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'budget', label: t.nav.spend,   icon: '◎' },
    { id: 'assets', label: t.nav.assets,  icon: '◈' },
    { id: 'report', label: t.nav.report,  icon: '▤' },
    { id: 'more',   label: t.nav.more,    icon: '···' },
  ]
  ```
  Then apply Finding 6's alias so More highlights while on chat/decide:
  ```ts
  const active = activeTab === t.id || (t.id === 'more' && (activeTab === 'chat' || activeTab === 'decide'))
  ```
- `src/i18n/types.ts`: add `spend: string` and `report: string` to the `nav` block.
  Add a new top-level `report: { title: string; subtitle: string; monthLabel: string;
  categoryBarEmpty: string; overBucketLine: string; sharedBucketNote: string;
  noBucket: string }` interface (extend with more keys as T4 needs; do not leave any used
  in T4's JSX unadded here).
- `src/i18n/en.ts` and `src/i18n/id.ts`: add matching values for `nav.spend`, `nav.report`,
  and the new `report` block (English text in `en.ts`; Bahasa Indonesia in `id.ts` — this
  project's language rule for user-facing product copy is English source-of-truth per
  `CLAUDE.md`, but `id.ts` must still stay structurally complete or `Translations` won't
  typecheck. Translate naturally into Bahasa Indonesia for `id.ts`, don't leave stub text).
- `src/App.tsx`: remove the `home:` entry from `SCREENS` (Finding 3 — `'home'` is no longer
  a valid `Tab`). Add:
  ```ts
  report: { title: t.report.title, subtitle: t.report.subtitle, component: <ReportScreen /> },
  ```
  Keep `chat` and `decide` entries in `SCREENS` (More still routes to them via `setTab`).
  Remove the `HomeScreen` import once T3 deletes the file.
- Verify: `npx tsc --noEmit` clean (this is the task that will surface any remaining
  `'home'` references — let it). 4 tabs render; every tab opens; chat/decide are reachable
  only via More and highlight the More tab per Finding 6.

### T3 — Assets absorbs Home
- `src/features/assets/AssetsScreen.tsx`: insert directly after the opening
  `<div style={{ padding: '16px 16px 24px', ... }}>` (line 46) and before the `{/* Accounts
  */}` comment (line 48):
  - The gold-staleness `AmberBanner` block, moved verbatim from `HomeScreen.tsx:33-37`
    (condition `isGoldStale`, `onDismiss={dismissGoldNudge}` — **preserve as-is**, see
    Finding 9, do not fix the dismiss bug).
  - The net-worth hero card, moved verbatim from `HomeScreen.tsx:39-73`.
  - `<NWChart />`, moved verbatim from `HomeScreen.tsx:76`.
  - Do **not** move the "FI readout" block (`HomeScreen.tsx:78-130` — FI projection,
    savings rate, gap-to-target). That block does not move to Assets or to More's row
    (T5 only shows an inline FI date on a menu row, not the full card) — it currently has
    no destination in this plan and none is in scope. Leave that JSX deleted along with the
    rest of `HomeScreen.tsx`; the data it showed remains reachable via Decide → Spending
    Lens if a user wants projection detail (confirm `SpendingLens.tsx` covers this before
    deleting — if it doesn't, flag to PO before deleting the FI card, don't silently drop a
    feature).
  - Add the needed imports to `AssetsScreen.tsx`: `useNetWorth`, `useFIProjection` is NOT
    needed here (FI block isn't moving), `AmberBanner`, `useAppStore` (for
    `dismissGoldNudge`), `NWChart`, `LANE_LABELS`/`ALL_LANES` from `constants/lanes` if
    used by the hero's lane breakdown, `formatRp`.
- `src/features/home/HomeScreen.tsx`: delete only after `src/App.tsx` no longer imports it
  (confirmed in T2).
- Verify: Assets shows gold-stale banner (when applicable) → net-worth hero → lane
  breakdown → chart → existing account/asset list, in that order. Per-asset "PRICE STALE"
  tags still appear independently on individual gold assets (Finding 9 — this is expected,
  not a duplicate to remove).

### T4 — New Report screen
- New `src/features/report/ReportScreen.tsx`, registered as tab `report` (T2).
- State: `const [selectedMonth, setSelectedMonth] = useState(currentYearMonth)` where
  `currentYearMonth` is derived the same way `safeToSpend.ts:49` does it
  (`${y}-${String(m+1).padStart(2,'0')}`) — do not add a new date-formatting helper,
  reuse this exact pattern for consistency.
- Content, top to bottom:
  1. **Month control**: `‹ {Month Year} ›`, current month default. `›` (next) disabled
     when `selectedMonth === currentYearMonth` (cannot navigate into the future).
     `‹` (prev) is unbounded — navigating before any seeded data simply renders empty bars
     and the existing `t.budget.noTransactions`-style empty copy (add
     `t.report.categoryBarEmpty` for this, per T2). Do not query "earliest transaction
     month" to bound `‹` — unnecessary complexity for a personal app with a known data
     start (Jan 2026).
  2. **Category bars**: for `selectedMonth`, aggregate `transactionsRepo.getByMonth(selectedMonth)`
     (already excludes transfers) filtered to `direction === 'out'`, grouped by
     `category_id`. For each category with a non-null `envelope_id` that maps to exactly
     one category (Finding 2 — check `categories.filter(c => c.envelope_id === envId).length === 1`
     before treating it as that category's own bucket), compute:
     - `monthlyBucket = envelope.horizon === 'monthly' ? envelope.target_amount
        : envelope.horizon === 'yearly' ? envelope.target_amount / 12
        : envelope.target_amount * weeksInMonth(selectedMonth)` (weekly case; import
       `weeksInMonth` from `@lib/dates`).
     - bar fill % = `spent / monthlyBucket` (cap the *rendered* width at 100%, but keep the
       real ratio for color threshold and the feed-forward line's overage math).
     - color: `--engine` (green) `< 0.85`; `--amber` `0.85–1.0`; `--debt` `> 1.0`.
     For categories with `envelope_id === null`, or whose envelope is shared by 2+
     categories (Finding 2), render a spend-only bar (no bucket line, no percentage fill —
     just show the spent total as a label) and, if shared, append
     `t.report.sharedBucketNote` in small text.
     Transactions with `category_id === null` are grouped into a synthetic
     "Uncategorized" row (label from `t.report.noBucket` or similar), spend-only, always
     last in the list, since T0 does not guarantee 100% category coverage (only the seeded
     dataset's rows that had a JSON `category` value and a matching Category row).
  3. **Feed-forward line** (only categories currently `> 1.0`): "«Category» is Rp X over —
     lowering your daily safe-to-spend by Rp Y/day" where
     `X = spent - monthlyBucket`, `Y = X / workdaysRemaining(new Date())` (import from
     `@lib/dates`; if `workdaysRemaining` returns 0 — i.e. it's the weekend — show the line
     without the "/day" clause, e.g. "…Rp X over this month" — do not divide by zero).
     Facts only, no advice verbs — do not write "you should," "avoid," "cut back."
  4. **Tap-to-filter**: tapping a category bar sets a `selectedCategoryId` state and
     renders `<TransactionHistory categoryId={selectedCategoryId} monthRange={{ from:
     \`${selectedMonth}-01\`, to: lastDayOf(selectedMonth) }} />` below the bars (not in a
     BottomSheet — inline, per Finding 8, since Report needs a specific month pinned, which
     `TransactionHistory`'s own Period selector can't express).
- `src/features/budget/TransactionHistory.tsx`: add two new **optional** props,
  `categoryId?: string | null` and `monthRange?: { from: string; to: string }`. When
  `monthRange` is passed, it overrides the internal `period` state's computed bounds (skip
  rendering the period-tab row entirely when `monthRange` is provided — those two controls
  would conflict). When `categoryId` is passed, add
  `if (categoryId && t.category_id !== categoryId) return false` to the existing `filtered`
  `useMemo` (`TransactionHistory.tsx:57-68`). Do not fork the component — these are additive,
  backward-compatible props; the existing bare `<TransactionHistory />` usage in
  `BudgetScreen.tsx` keeps working unchanged until T4's last step removes it.
- `src/features/budget/BudgetScreen.tsx`: remove the "Transactions link" block
  (lines 52-66) and the trailing `<BottomSheet>` wrapping `<TransactionHistory />`
  (lines 68-70) — Report replaces this entry point. Remove the now-unused `historyOpen`
  state and `BottomSheet` import if nothing else in the file needs them.
- Verify: with T0 done, bars for `2026-01` through `2026-06` match manual sums of the
  seeded dataset filtered by category and month; tap-to-filter shows exactly that
  category's transactions for that month; navigating `‹` past January renders the empty
  state without crashing; feed-forward line math is exact (spot-check one over-bucket
  category by hand).

### T5 — More absorbs Chat + Decide
- `src/features/more/MoreScreen.tsx`: add a "Planning" `SectionLabel` + rows near the top
  (after the opening `<div>`, before the existing `SectionLabel>{t.more.settings}`):
  - "Chat assistant" row → `onClick={() => setTab('chat')}`.
  - "Decide (FI projection)" row → `onClick={() => setTab('decide')}`, with the FI date
    shown inline as the row's `sub` text: pull `const { result: fi } = useFIProjection()`
    and render `sub={fi?.fi_date_path_b ? \`On track for \${fi.fi_date_path_b.getFullYear()}\`
    : 'Set FI assumptions to see a projection'}` (handles the null case — `fi` is `null`
    while `useLiveQuery` is loading or if assumptions/assets are unset; do not assume it's
    always populated).
- Chat/Decide screens themselves are unchanged (still rendered via `App.tsx` `SCREENS`,
  T2). TabBar highlights More while on either, per Finding 6's alias (already wired in T2
  — do not re-implement it here).
- Verify: both reachable in ≤2 taps from More; the Decide row's inline date matches what
  `DecideScreen` itself would compute (same hook, same data); back to More via tapping the
  More tab (which — because of the alias — is already visually "active," so this is really
  "tap Budget/Assets/Report to leave chat/decide," confirm that works too, not just the
  literal More tap).

### T6 — Staleness indicator on Spend
- `src/lib/dates.ts`: add a small pure helper (keeps the threshold testable without
  touching the UI layer):
  ```ts
  export function daysSince(isoDate: string, today: Date = new Date()): number {
    return Math.floor((today.getTime() - new Date(isoDate).getTime()) / 86_400_000)
  }
  ```
- `src/hooks/useSafeToSpend.ts`: alongside the existing week query, fetch the newest
  transaction date across **all** non-transfer transactions (both directions — this is a
  general "have you logged anything lately" signal, not spend-specific):
  `const newest = await db.transactions.filter((t) => !t.is_transfer).toArray()` then take
  the max `date` (or, cheaper: `db.transactions.orderBy('date').filter(t => !t.is_transfer).last()`
  — use whichever Dexie can execute as an indexed query; `date` already has a compound
  index per `db.ts`, confirm `orderBy('date').last()` is usable given the existing
  `where('date')` indexes). Return `lastLoggedDate: string | null` alongside `result` from
  the hook.
- `src/features/budget/weekly/GaugeCard.tsx`: accept `lastLoggedDate` as a new prop from
  `SafeToSpendScreen.tsx`. Compute `const stale = lastLoggedDate ? daysSince(lastLoggedDate) > 3 : false`
  (threshold `3`, hardcoded constant per v1's own instruction — no settings UI).
  - Render "Last logged: {relative}" under the ceiling number in the **normal** branch only
    (`!isNegativePool && remainingWorkdays !== 0` — the weekend and negative-pool branches
    already show different content in that slot; do not try to cram a relative-time string
    into "Weekend" or the negative-pool warning line).
  - When `stale`: render an `AmberBanner` **above** `GaugeCard` (in `SafeToSpendScreen.tsx`,
    not inside `GaugeCard` — `AmberBanner` is used as a sibling elsewhere, e.g.
    `HomeScreen.tsx:34`, keep that convention) with copy "No transactions logged for N
    days — this number may be higher than reality" and a "Log now" action that opens the
    same `QuickLogFAB` sheet. `QuickLogFAB`'s `open` state is local to that component with
    no external trigger today — add a minimal way to open it from outside: either lift
    `open` to a tiny zustand slice (`quickLogOpenStore`, one boolean + setter, mirroring
    `appStore`'s pattern) or pass a `ref`/callback down. Prefer the zustand slice — it's
    the pattern already used for cross-component UI state in this codebase (`appStore`,
    `pinStore`, `reconcileStore`), not a new pattern.
  - Regardless of `stale`, when in the normal branch: color the ceiling number
    `var(--amber-text)` instead of `var(--ink-1)` and append a small "UNVERIFIED" tag next
    to it, both **only** when `stale` is true.
- Verify: extract the threshold math into `daysSince` so it's independently testable
  (`src/lib/dates.test.ts`, new file — table-test a handful of day deltas: 0, 3, 4, 30).
  For the full UI path, manually edit the newest seeded transaction's `date` via the
  browser's IndexedDB devtools (or a temporary Dexie console call) to be >3 days in the
  past, reload, confirm banner + amber + tag appear; restore/re-seed to confirm they
  disappear.

### T7 — Extend `Waterfall.tsx` into the "why this number" panel (was: new panel — Finding 5)
- `src/features/budget/weekly/Waterfall.tsx`: keep the existing 4 rows and their exact
  values/labels (`personalPool`, `personalSubTotal`, `weekendAllocation`, `weekPool`),
  they already match 4 of the 6 lines in the target frame. Add:
  - A `weeks` value: `weeksInMonth(currentYearMonth)` (import from `@lib/dates`; derive
    `currentYearMonth` the same way `safeToSpend.ts:49` does — do not add a new helper).
    Relabel the `weekPool` row to `= ÷ {weeks} weeks → week pool` per the target frame.
  - `− Spent this week` row using `result.spentThisWeek` (already on `SafeToSpendResult`,
    no new field needed).
  - `= ÷ {result.remainingWorkdays} workdays → today` row using `result.todayCeiling`
    (both already on `SafeToSpendResult`).
  - Do **not** present this as salary − bills — the existing "✓ Paid first" rows already
    correctly frame pipe/bills as pre-separated, keep that framing for the new rows too
    (no new "salary" language anywhere in this component).
- Wrap the component's content in a disclosure: default **collapsed** to a single summary
  line ("How this number is built ›"), tap to expand the full 6-row breakdown (use a plain
  `useState<boolean>` + conditional render — no new dependency, `<details>` is also
  acceptable if it doesn't fight the existing inline-style pattern; pick whichever is less
  code, they're equivalent here).
- Verify: every line reconciles with `db.allowance`, `db.recurringItems`, and the current
  week's transaction sums (spot check by hand against `computeSafeToSpend`'s inputs); the
  collapsed summary and expanded detail never disagree on `todayCeiling` with the number
  shown in `GaugeCard`.

### T8 — Gauge tick-down on quick log
- New `src/hooks/useTickingNumber.ts` (Finding 7 — this doesn't happen for free):
  ```ts
  import { useEffect, useRef, useState } from 'react'

  const DURATION_MS = 400

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }

  export function useTickingNumber(target: number): number {
    const [display, setDisplay] = useState(target)
    const prevRef = useRef(target)

    useEffect(() => {
      const from = prevRef.current
      const to = target
      prevRef.current = target
      if (from === to) return
      if (prefersReducedMotion()) { setDisplay(to); return }

      const start = performance.now()
      let raf = 0
      function tick(now: number) {
        const progress = Math.min(1, (now - start) / DURATION_MS)
        setDisplay(Math.round(from + (to - from) * progress))
        if (progress < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [target])

    return display
  }
  ```
- `src/features/budget/weekly/GaugeCard.tsx`: in the normal (non-weekend,
  non-negative-pool) branch, replace the direct `formatRp(todayCeiling)` with
  `formatRp(useTickingNumber(todayCeiling))`. Do not apply this to the weekend or
  negative-pool branches — they don't show a comparable ticking figure.
- Clarify scope (Finding 7): this only animates while `GaugeCard` stays mounted across the
  value change (i.e., user is already on the Spend/Budget tab, weekly horizon, when the
  `QuickLogFAB` save resolves and `useSafeToSpend`'s live query re-fires). A log made from
  another tab correctly shows the new value with no animation on next mount — this is
  expected, do not try to animate on mount.
- Verify: on Spend (weekly), open `QuickLogFAB`, log an expense, close the sheet — watch
  the ceiling number visibly count down over ~400ms without a reload. With OS-level
  "reduce motion" enabled (or `prefers-reduced-motion: reduce` emulated in devtools), the
  number jumps directly to the new value with no animation.

## Out of scope (do not do)
- Merging Weekly/Monthly/Yearly screens into one component.
- Any change to `src/engine/*`, sync, Supabase, migrations, AI proxy.
- New tabs, FI/what-if features, category bucket **editing** UI (T4 reads existing
  Envelope/Category data; it does not add UI to create or edit envelopes).
- Refactoring or lint-fixing untouched files (248 pre-existing biome errors are known).
- Fixing the gold-staleness dismiss bug (Finding 9) — move it as-is.
- Bounding the Report month control by querying earliest transaction date — unbounded `‹`
  is an accepted simplification (see T4).
- Building a full category-assignment UI for manual/`QuickLogFAB` transactions — T0 only
  back-fills the seeded dataset; `QuickLogFAB` continues to log `category_id: null`. If
  that gap turns out to matter product-wise, it's a separate, future-scoped decision, not
  part of this restructure.

## Definition of done
- `npx tsc --noEmit` clean (script: `npm run build` runs `tsc -b && vite build`; use
  `npx tsc --noEmit` directly for a faster incremental check during development).
- `npx vitest run` green — 23 existing engine golden tests untouched, plus the new
  `src/lib/dates.test.ts` cases from T6.
- `npx biome check src` — no *new* errors introduced by touched files (the 248
  pre-existing errors in untouched files are out of scope; do not let `biome` output
  convince you to touch files this plan doesn't name).
- All 9 task verifications (T0–T8) pass on the seeded Jan–Jun 2026 dataset, after T0 has
  run so categories are actually populated.
- One commit per task, messages `feat(v2): T{n} — {summary}` (T0 included:
  `feat(v2): T0 — resolve category names on seed import`).

---

## Edge cases checklist (cross-task; verify each explicitly, don't assume "covered")

| # | Edge case | Where it bites | Expected behavior |
|---|---|---|---|
| 1 | Allowance not yet configured (`monthly_amount === 0`) | T4, T6, T7 | `useSafeToSpend` returns `null` result — Report's category bars still render (they don't depend on `SafeToSpendResult`), but T6/T7 additions must no-op gracefully, matching `SafeToSpendScreen.tsx`'s existing `!result` early-return branch. Don't crash reading `result.spentThisWeek` when `result` is null. |
| 2 | Weekend (`workdaysRemaining === 0`) | T4 feed-forward line, T6, T7 | T4: feed-forward line drops the "/day" clause (see T4 step 3). T6/T7: gauge is in its "Weekend" branch; staleness banner still shows if applicable (orthogonal), but the amber-number/tag treatment doesn't apply (no comparable number in that branch). |
| 3 | Negative pool (`isNegativePool`) | T6, T7, T8 | Existing red/amber warning branch is unchanged; T6's staleness banner can still stack above it; T8's ticking number does not apply to this branch (no ceiling number shown). |
| 4 | Category with `envelope_id` pointing to a shared envelope | T4 | Spend-only bar + "(shared bucket)" note, per Finding 2 — never divide the bucket. |
| 5 | Transaction with `category_id: null` (uncategorized) | T4 | Grouped into a synthetic "Uncategorized" row, spend-only, listed last. |
| 6 | Selected Report month has zero transactions | T4 | Empty state copy (`t.report.categoryBarEmpty`), no crash, `‹`/`›` still work. |
| 7 | `useFIProjection()` still loading or assumptions unset | T5 | Decide row's `sub` text shows the fallback string, not `undefined`/a crash (see T5's exact ternary). |
| 8 | `lastLoggedDate` is `null` (fresh household, zero transactions ever) | T6 | Treat as not-stale (don't show a banner claiming "N days" with no data) — `stale` should be `false` when `lastLoggedDate` is `null`, not `true` by some `Infinity` fallback. |
| 9 | User taps a category bar, then changes the month control | T4 | Either clear `selectedCategoryId` on month change (simplest, recommended) or keep it selected and let the embedded `TransactionHistory` naturally show zero rows for a month with no matching transactions — pick the former; it's less surprising. |
| 10 | `prefers-reduced-motion` toggled mid-session (not just at load) | T8 | `useTickingNumber` reads the media query inside the effect on every `target` change, so it responds correctly without needing a `matchMedia` change listener — confirm this is actually true when testing (the hook as written re-checks on every animated transition, which is sufficient; it does not need to react to the preference changing while an animation is mid-flight). |
| 11 | Two categories with the exact same name, different lane | T0 | `categories.find(...)` returns the *first* case-insensitive match — if category names aren't unique in the household's data, seeding is non-deterministic about which one wins. Out of scope to enforce uniqueness (that's `CategoryManager.tsx`'s job, untouched); just be aware seeding assumes names are effectively unique, and don't "fix" this by adding validation — not this plan's scope. |

## TODO list (flat, for an agent executing task-by-task)

- [ ] T0: back-fill `category_id` in `seedTransactionsIfNeeded()`; add default-category
      seed if none exist yet; verify non-null `category_id` on matching rows.
- [ ] T1: change `appStore.ts` default tab to `'budget'`.
- [ ] T2: export shared `Tab` type from `appStore.ts` (drop `'home'`); update
      `TabBar.tsx` to import it, shrink `TABS` to 4, add the More-highlight alias; add
      `nav.spend`/`nav.report` + full `report` i18n block to `types.ts`/`en.ts`/`id.ts`;
      update `App.tsx` `SCREENS` (drop `home`, add `report`).
- [ ] T3: move gold-staleness banner + net-worth hero + `NWChart` from `HomeScreen.tsx`
      into `AssetsScreen.tsx` verbatim (preserve the dismiss bug); confirm the FI block's
      only content is covered elsewhere before deleting it; delete `HomeScreen.tsx`.
- [ ] T4: build `ReportScreen.tsx` (month control, category bars with envelope/horizon
      normalization + shared-bucket + uncategorized handling, feed-forward line, tap-to-
      filter); add `categoryId`/`monthRange` optional props to `TransactionHistory.tsx`;
      remove the transactions-link + BottomSheet from `BudgetScreen.tsx`.
- [ ] T5: add "Planning" section to `MoreScreen.tsx` with Chat/Decide rows, FI date inline
      on the Decide row with a null-safe fallback.
- [ ] T6: add `daysSince` to `dates.ts` (+ test file); surface `lastLoggedDate` from
      `useSafeToSpend`; add staleness banner + amber number + "UNVERIFIED" tag to
      `GaugeCard`/`SafeToSpendScreen`; add a minimal store to open `QuickLogFAB` from
      outside itself.
- [ ] T7: extend `Waterfall.tsx` with the 2 missing rows + collapse toggle (do not build a
      second component).
- [ ] T8: add `useTickingNumber.ts`; wire it into `GaugeCard`'s normal-branch number only.
- [ ] Final: `npx tsc --noEmit`, `npx vitest run`, `npx biome check src` (no new errors in
      touched files), walk all 11 edge cases in the table above by hand.
