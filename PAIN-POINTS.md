# Pain Points — Elicitation Round 2 (2026-07-12)

Requirements elicitation across the whole app: functional pain points, UI/design
experience audit, and a proposed design direction. Continues the 2026-07-09 round
tracked in [USER-JOURNEY.md](USER-JOURNEY.md) (P1–P9, 7 of 9 resolved).

**Method:** code walk of every screen (Today, Budget ×3 horizons, Report, Assets,
Manager/Chat, More + all sheets, Decide, Onboarding, Auth, Reconcile), checked
against the journey-map scenarios (lunch decision, payday, overspend week) and the
design spec in `design-system.html`.

**The theme this round:** the 07-09 work fixed *"the data doesn't exist"* pains.
What remains is different in character:

1. **Trust** — a few numbers users do see are wrong or misleading.
2. **Fragmentation** — the answer to any real question spans 2–3 tabs, and the two
   transaction lists have disjoint capabilities.
3. **Burial** — features exist but aren't reachable at the moment of need.
4. **Design debt** — the UI reads as generated filler ("every element is the same
   bordered gray box") rather than a finance instrument; the token spec exists but
   the app doesn't follow it.

---

## T — Trust: numbers that are wrong or misleading (fix first)

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| T1 | **Report's monthly actuals count transfers as income & expenses.** Moving Rp 5jt between own accounts shows +5jt income, +5jt expense on the screen literally labeled "actuals". Today and TransactionHistory both exclude transfers; Report doesn't. | `src/features/report/ReportScreen.tsx:10-11` filters `direction` only, never `is_transfer` | 🔴 High |
| T2 | **Committed bills double-count against the discretionary pool.** The safe-to-spend gauge subtracts *every* non-transfer expense from the weekly pool — pay the electricity bill from your wallet and log it, and the gauge drops even though bills were already carved out of the allowance. Diligent logging is punished with an artificially amber gauge. | `src/hooks/useSafeToSpend.ts:20` (only excludes `pass_through`) | 🔴 High |
| T3 | **`formatRp` abbreviates millions as "M"** (`Rp 2,5M`). In Indonesian convention **M = miliar (billion)**; juta is "jt". Every abbreviated figure reads 1000× off to an Indonesian reader. | `src/lib/currency.ts:17-19` | 🔴 High |
| T4 | **The Today "Balance" chip** shows day income − expenses, amber-negative on any normal spending day, using the one word ("balance") users associate with *wallet* balance — which the page doesn't show. | `src/features/today/TodayScreen.tsx:76` | 🟠 Med |
| T5 | **Decimal-input hazard.** Onboarding and the reconcile amount override strip `.` and `,` blindly (`12.5` → 125); `parseRpInput` shares the flaw. One slip corrupts the income event that drives savings rate and FI projection. | `OnboardingWizard.tsx:100-145`, `ReconcileConfirmScreen.tsx:199`, `currency.ts:31` | 🟠 Med |

## F — Fragmentation: one question, three tabs

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| F1 | **"Where do I stand?" has no single home.** Today's spend → Today tab; week gauge → Budget; wallet balances → Assets; month actuals + net worth → Report. The lunch-decision scenario still needs 2–3 tab visits; Today shows neither wallet balance nor safe-to-spend. | Journey map §Scenario A, still unresolved | 🔴 High |
| F2 | **Two transaction lists with disjoint capabilities.** Today: can edit, can't search, one day at a time. Budget → history sheet: can search/filter, **rows aren't tappable** — you find a transaction and can't fix it. | `TransactionHistory.tsx:132-160` (plain divs) | 🔴 High |
| F3 | **History search can't find transactions by title or category** — it only matches note + account name, and rows display `note ‖ account name`. A transaction logged the normal way (title, no note) shows as its bank's name and is unfindable by what the user typed. | `TransactionHistory.tsx:62-64, 146` | 🔴 High |
| F4 | **Plan vs. actual never meet.** MonthlyScreen is plan-only config; Report is actuals-only totals; the per-category breakdown (P4, still open) is the missing join. "Overspend week" still ends with *that* but not *where*. | Journey map P4 / Scenario C | 🟠 Med |

## B — Burial: exists, but not at the moment of need

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| B1 | **Salary update is four steps deep** (More → Plan → Decide sheet → Income Log tab) for the highest-leverage number in the model (drives savings rate, FI date, waterfall). P7, still open. | `MoreScreen.tsx:89` → `DecideScreen` sheet | 🟠 Med |
| B2 | **Safe-to-spend empty state points to the wrong place** — says "Recurring Register" but the pool that gates the gauge is set in More → Allowance. New user follows the instruction and the gauge stays empty. | `SafeToSpendScreen.tsx:23` vs `useSafeToSpend.ts:9` | 🟠 Med |
| B3 | **Spending Lens is a destination, not a moment.** "Should I buy this?" happens while viewing the gauge or logging an expense; the lens lives in a More sheet, connected to neither. | `MoreScreen.tsx:89` | 🟡 Low |
| B4 | **More is a 12-row junk drawer** mixing appearance, financial-model config, household admin, and data plumbing. Category editing still requires the trek (inline-create mitigates entry, not maintenance). | `MoreScreen.tsx` | 🟡 Low |

## O — Onboarding & the partner experience

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| O1 | **Onboarding never captures a starting balance**, so every wallet reads Rp 0 until the user finds the manual-override field in Assets → edit. First impression: "the app says I have no money." (Journey map: "this is where P2 begins" — wizard never updated after balances shipped.) | `OnboardingWizard.tsx:150-160` (`manual_balance_override: null`) | 🔴 High |
| O2 | **The wizard speaks the author's dialect** — "Pipe & DPLK", "RDPU", lanes — and has no skip path: a partner who only wants to log groceries must enter take-home income and a pool amount to get in. The household feature invites exactly this user. | `OnboardingWizard.tsx` steps 1–3, `disabled` gates line 333 | 🟠 Med |
| O3 | **The gauge goes dark on weekends** ("pre-carved. Resets Monday" — no number) on the two days most discretionary spending happens, despite a configured weekend allocation. | `GaugeCard.tsx:32-40` | 🟠 Med |

## S — Safety: destructive actions without guardrails

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| S1 | **Transaction delete is one tap, no confirm, no undo** — and the Delete button sits directly under Save in the edit sheet. Transfers delete both legs. | `TransactionForm.tsx:125-129, 198` | 🔴 High |
| S2 | **Reconcile approve is all-or-nothing**: amounts can be overridden but not category/account/date; invalid rows silently skipped; no per-row deselect short of cancelling the import. | `ReconcileConfirmScreen.tsx` | 🟠 Med |
| S3 | **Inconsistent confirm patterns**: `window.confirm/alert` for sign-out (low stakes) but nothing for delete (high stakes); Restore Backup replaces all data behind one sheet. | `MoreScreen.tsx:103-107` | 🟡 Low |

## M — Manager (AI) cross-cutting

| # | Pain point | Evidence | Severity |
|---|-----------|----------|----------|
| M1 | **Assistant replies render as raw text** (`pre-wrap`, no markdown) — formatted answers show literal `**asterisks**`. | `ChatScreen.tsx:446` | 🟠 Med |
| M2 | **Hardcoded stale default model** (`claude-sonnet-4-20250514`) and the picker exposes raw model-ID strings to an end user. | `ChatScreen.tsx:126, 209` | 🟠 Med |
| M3 | **Two competing import paths** — More → "Get Claude Prompt" → external Claude → paste JSON (three-app round trip) vs. in-app chat that accepts statement images. The more discoverable path is the worse one. | `MoreScreen.tsx:95-96` | 🟡 Low |
| M4 | **Chat history is device-local by design** (audit D3) — fine solo, but the sharpest cross-device expectation gap once the household is real. | AI-MANAGER-UX-AUDIT.md D3/E4 | 🟡 Low (tracked) |

## Today-page detail (from the 2026-07-12 focused session)

Logging flow: wallet must be re-picked on every entry (no last-used default);
six fields for a coffee; category chips render all categories unordered; title
chips don't carry their usual category; recent-titles query loads the whole
transactions table. Glance flow: no jump-back-to-today, no signal which days have
activity, empty state is a dead end. Edit flow: can't change direction; editing a
transaction on a deactivated wallet silently loses the wallet; edited transfers
re-order after save.

---

# UI / Design experience audit

## What works (keep — this is *not* slop)

- **The token philosophy is genuinely good.** `design-system.html` documents an
  elevation ladder (bg-0…4), a three-step ink hierarchy, hairline borders, and the
  one-accent rule — *"amber informs, never alarms"* (DECISION-2). Lane colours are
  deliberately muted ("they categorise, not celebrate"). This is a real point of
  view most finance apps lack.
- **Calm by default.** No red anywhere in the daily loop, no confetti, no
  gamification. Overspend renders amber-informative, matching the product's
  no-lecture principle.
- **A11y fundamentals landed**: `focus-visible` outlines, `aria-label`s on icon
  buttons, `role="alert"` on errors, safe-area insets, `100dvh`.
- **Dark theme is coherent** and the mono-for-numbers instinct is right.

## What hurts (the "AI slop" signature)

| # | Unhappy experience | Evidence |
|---|--------------------|----------|
| D1 | **The spec is ignored — every style is an ad-hoc inline literal.** Observed font sizes: 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 18, 20, 22, 24, 42px. Paddings 5–16px in 1px increments; radii 6/8/9/10/12/14/16. Tailwind is imported (`index.css:1`) and unused. There is no type scale or spacing scale *in practice* — the tell of generated UI. | every `*.tsx`; `design-system.html` header: "All colours, type, spacing must reference these vars" |
| D2 | **Everything is the same bordered gray box.** Cards inside cards; chips, rows, menu items, and buttons are all `bg-1 + 1px border + radius ~10 + padding ~12`. Hierarchy is attempted by adding *more boxes* instead of space and type. The eye has nowhere to land. | TodayScreen, MoreScreen, AssetsScreen, TransactionHistory |
| D3 | **10px-uppercase-letterspaced micro-labels everywhere** — the second slop tell. Section headers, chip labels, and card titles all use the same `fontSize:10, uppercase, letterSpacing:.5` treatment, so nothing outranks anything. | 14+ occurrences across screens |
| D4 | **Glyph/emoji iconography.** Tab bar: `☰ ◎ ✦ ◈ ⌂ ···`; FAB: `⇄ ✦ + −`; chat: `📎 ↑ ☰ ⚡`. Renders differently per platform, reads as placeholder, and the Today icon (`☰`) collides with the chat-sessions icon. | `TabBar.tsx:5-12`, `SpeedDialFAB.tsx:8-13`, `ChatScreen.tsx` |
| D5 | **Numbers — the product — have no typographic stage.** Amounts are 12–14px mono strings crammed into row ends; no tabular alignment down a list; `Rp` prefix stripped on Today but kept in History; `formatRp` vs `formatRpFull` chosen arbitrarily per screen. Only two hero numbers exist in the whole app. | `TodayScreen.tsx:108,133` vs `TransactionHistory.tsx:158` |
| D6 | **Sub-minimum touch targets and text.** 34px day-nav buttons, 30px chat-header buttons, 9–11px labels — below the 44px/11pt floor on the primary (mobile) surface. | `TodayScreen.tsx:141`, `ChatScreen.tsx:189` |
| D7 | **No feedback layer.** bg-3/bg-4 are defined *for* hover/pressed states and never used; sheets and lists have no motion; loading is the bare word "Loading…"; empty states are one gray sentence with no action. | tokens vs usage; `SafeToSpendScreen.tsx:9` |
| D8 | **The light theme is a palette hack** — `--amber` carries blue ("renaming is churn"), so semantics like `amber-banner` and "amber informs" silently mean *blue* in light mode, and mixed accents leak (engine-green toggles, blue AI FAB action `#4a9df0`, red `#e35d5b` expense FAB — three ad-hoc accents beside the "only accent"). | `index.css:48-76`, `SpeedDialFAB.tsx:9-12` |
| D9 | **AppBar burns ~64px on a static tab title + subtitle** that repeats the tab bar label, on screens that are already vertically tight. | `App.tsx:98-111` |

## Design direction — "Calm Ledger" (v2 proposal)

The fix is not a new palette — the palette philosophy is the best part. The fix is
**typography-led hierarchy instead of box-led hierarchy**, and actually enforcing
the existing tokens. Reference points: the numeric seriousness of a banking
statement, the row discipline of iOS Settings / Things 3, the restraint of Linear —
*not* the gradient-fintech look (Revolut) and not more cards.

Concrete mock: [`design-direction-v2.html`](design-direction-v2.html) (Today screen
re-rendered in this direction, plus the token sheet).

1. **A real type scale, four roles, nothing else.**
   `display 34/40 · title 17/24 · body 15/22 · caption 12/16` (px/line-height).
   Section headers become sentence-case 13px semibold ink-2 — the 10px-uppercase
   treatment is reserved for *data* labels inside stat tiles only.
2. **Numbers get the stage.** All amounts use `font-variant-numeric: tabular-nums`,
   right-aligned in a fixed column so digits gutter down a list. One hero number
   per screen (34px+). `Rp` prefix policy: hero and totals keep it, list rows drop
   it — one rule, everywhere. Abbreviations use Indonesian units: `jt` / `M`
   *(miliar)* — fixes T3 at the same time.
3. **Rows, not boxes.** Lists (transactions, accounts, menu) become flush rows with
   hairline separators and 44px+ hit areas; the card container survives only for
   the hero stat and the gauge. Transfers get an icon + muted row, not a dashed
   border. Depth comes from the bg-0/1/2 ladder, not from 1px borders on
   everything.
4. **One accent, honestly.** Rename the slot `--accent` (amber in dark, blue in
   light — same slot, honest name). Amber-the-colour stays reserved for governor
   states in *both* themes. Kill the stray accents (blue AI, red expense FAB);
   direction is communicated by +/− sign and position, per the calm principle.
5. **A real icon set.** Inline SVG (Lucide/Phosphor style, self-contained, no CDN),
   1.5px stroke, 20px grid — tab bar, FAB actions, chat controls. This single
   change removes most of the "placeholder" feel.
6. **Feedback layer.** Pressed states use bg-3/bg-4 (already tokenised); sheets
   slide 200ms ease-out; skeleton rows instead of "Loading…"; every empty state =
   one sentence + one action button.
7. **Spacing scale**: 4/8/12/16/24/32 only. Screen gutter 16, card padding 16,
   row padding 12×16, section gap 24.
8. **AppBar slims to a 44px row** (title only, subtitle deleted); reclaimed space
   goes to the hero number of each screen.

**Enforcement (the actual anti-slop mechanism):** promote `@components` into the
only styling authority — `<Screen>`, `<Card>`, `<Row>`, `<StatTile>`, `<Amount>`,
`<SectionHeader>`, `<Icon>` — with tokens baked in, then ban raw `style={{
fontSize }}` in feature code (biome rule / review checklist). The spec failed last
time because nothing enforced it.

---

## Ranked requirements candidates (this round)

1. **Trust fixes** (T1 transfer-inflated Report, T2 bill double-count, T3 jt/M
   notation, T5 decimal parse) — small diffs, protect everything else.
2. **One transaction surface** — searchable (title + category + note), editable,
   day/week/month scoped; dissolves F2/F3, gives P4/F4 a home.
3. **A "standing" strip on Today** — wallet balance + safe-to-spend remaining +
   today's spend on one screen; closes F1 / Scenario A. Replaces the Balance chip
   (T4).
4. **Design system v2** — tokens + primitive components + icon set (D1–D9);
   pays down the slop debt once instead of per-screen.
5. **Onboarding round 2** — starting balance (O1), skip path / partner mode (O2),
   weekend number (O3), delete-confirm (S1).
6. **Discoverability moves** (B1–B3) — entry points, not features; cheap,
   do alongside adjacent work.
