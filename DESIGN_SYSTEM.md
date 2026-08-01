# FI Dashboard — Design System v1.1
**Codename: Calm Instrument**
Owner: Muhammad Adi Putra · Stack: Next.js + Supabase + Vercel (PWA) · Last updated: 2026-07-27

**Primary target: mobile web, 390 × 844.** Desktop is a widened variant of the mobile
layout, never the reverse. Design and review every screen at 390px first.

*v1.1 adds §11 Interaction Language and §12 Confidence System. Onboarding and
multi-user information architecture are deliberately deferred until real beta users exist —
designing progressive disclosure for a hypothetical stranger is speculative work.*

> **How to use this file with an AI coding harness (Claude Code / Codex / Hermes):**
> Place at repo root as `DESIGN_SYSTEM.md` and reference it in `CLAUDE.md` / `AGENTS.md` with:
> *"All UI must conform to DESIGN_SYSTEM.md. Read it before writing any component. Never introduce a color, font size, spacing value, or alert state that is not defined there. If a design need is not covered, stop and ask."*
> Section 9 (Governance Constraints) is machine-checkable — treat violations as build failures.

---

## 1. Product thesis

This is not a trading app. It is a **measuring instrument** for a 19-year accumulation
project. The user checks it monthly, not daily, and the app's job is to make the
*trajectory* legible while making *daily volatility* boring.

Three consequences that override normal fintech UI instinct:

| Normal fintech does | This app does | Why |
|---|---|---|
| Big hero balance, gradient, animated count-up | Hero is **gap-to-goal as distance**, stated plainly | Net worth today is ~1.8% of target. A hero number demoralizes; distance informs. |
| Red for negative, urgency for drops | **No red exists in the token set.** Amber informs, never shames | Panic-selling is the single largest modeled risk (+7 yrs to FI). UI must not create the feeling. |
| Savings shown as leftover after spend | **Savings drawn off the top, before living costs** | Savings-first waterfall is a non-negotiable. Layout encodes it. |

### The governing sentence

> **Every screen reduces uncertainty. No screen manufactures motivation.**

When a design decision is ambiguous, ask which option leaves the user less uncertain
about the state of their money. That option wins. Motivation is a mood and it decays;
certainty is a fact and it compounds. This sentence outranks everything below it in
this document.

---

## 2. Color tokens

CSS custom properties. **This is the complete palette. Do not add to it.**

```css
:root {
  /* Surfaces */
  --paper:        #F7F8F7;  /* app background — cool paper, not cream */
  --card:         #FFFFFF;  /* raised surface */
  --card-sunk:    #F1F3F1;  /* inset / table zebra / disabled */
  --rule:         #E2E6E3;  /* 1px hairlines, borders */
  --rule-strong:  #C9D0CB;  /* emphasized divider */

  /* Ink */
  --ink:          #14181C;  /* primary text, all money figures */
  --ink-muted:    #6B7570;  /* secondary text, units, timestamps */
  --ink-faint:    #9BA5A0;  /* labels, eyebrows, placeholder */

  /* Accent — progress, the pipe, primary action */
  --flow:         #2F6F5E;  /* deep pine */
  --flow-hover:   #275C4E;
  --flow-tint:    #E8F0ED;  /* fill behind progress, selected row */

  /* Inform — the ONLY alert tone */
  --amber:        #B4802B;
  --amber-tint:   #FBF3E4;

  /* Lane identity (Kiyosaki four + pass-through) */
  --lane-income:    #2F6F5E;  /* income_producing  — same as flow, intentional */
  --lane-store:     #9A7B4F;  /* store_of_value    — muted gold */
  --lane-debt:      #6E6A7C;  /* debt_liability    — slate violet, NOT red */
  --lane-protected: #4A6B84;  /* protected_living  — steel blue */
  --lane-external:  #9BA5A0;  /* external_pool     — faint, visually excluded */

  /* Focus */
  --focus-ring:   #2F6F5E;
}
```

### Forbidden colors
`red`, `crimson`, `#EF4444`, `#DC2626`, `#F87171`, or any hue in the 340°–20° range at
saturation > 25%. Also forbidden: neon green (`#00FF__`, `#22C55E`), and gradients on
any surface that displays a number.

### Dark mode
Deferred to v1.1. When added: invert surfaces only, keep `--flow` and `--amber` hues
identical. Do not introduce a second accent.

---

## 3. Typography

```css
--font-ui:    'Inter Tight', -apple-system, system-ui, sans-serif;
--font-money: 'IBM Plex Mono', ui-monospace, monospace;
```

**Rule: every rupiah amount, percentage, date, and count is set in `--font-money`
with `font-variant-numeric: tabular-nums`.** Prose is `--font-ui`. There is no
exception. This is what makes the app feel like an instrument.

### Scale

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `--t-hero` | 40px / 1.05 | 500 mono | -0.02em | The one gap-to-goal figure per screen |
| `--t-figure-lg` | 26px / 1.15 | 500 mono | -0.01em | Card primary numbers (net worth, pipe rate) |
| `--t-figure` | 17px / 1.3 | 450 mono | 0 | Table amounts, lane totals |
| `--t-figure-sm` | 13px / 1.3 | 450 mono | 0 | Deltas, sub-figures |
| `--t-title` | 20px / 1.3 | 600 ui | -0.01em | Section headings |
| `--t-body` | 15px / 1.5 | 400 ui | 0 | Prose, explanations |
| `--t-label` | 11px / 1.2 | 600 ui | 0.10em | UPPERCASE eyebrows above every figure |
| `--t-meta` | 12px / 1.4 | 400 ui | 0 | Timestamps, source notes, footnotes |

Only one `--t-hero` per screen. If a screen needs two, it's two screens.

---

## 4. Number formatting (IDR)

Non-negotiable, because misread numbers are the failure mode this whole AC exists to fix.

| Context | Format | Example |
|---|---|---|
| Net worth, target, large balances | Abbreviated, 1–2 sig decimals, unit in `--ink-muted` | `Rp 82,4 jt` · `Rp 4,5 M` |
| Monthly flows | Abbreviated to millions, one decimal | `Rp 17,2 jt` |
| Transaction rows | Full, thousands-grouped, **no decimals** | `Rp 1.250.000` |
| Deltas | Signed, always with direction glyph, never colored red | `↑ Rp 2,1 jt` / `↓ Rp 340 rb` |
| Percentages | One decimal, `%` in `--ink-muted` | `18,4 %` |
| Savings rate | Whole number | `13 %` |

- Locale `id-ID`: **`.` for thousands, `,` for decimals.** `jt` = juta, `M` = miliar, `rb` = ribu.
- Downward deltas use `--ink` or `--amber` — never a distinct "bad" color.
- Never abbreviate inside a reconciliation table. Full precision where the user is checking arithmetic.
- Align all numeric columns right, tabular.

---

## 5. Spacing, radius, elevation

```css
--sp-1: 4px;  --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;
--sp-5: 24px; --sp-6: 32px;  --sp-7: 48px;  --sp-8: 64px;

--r-sm: 6px;  --r-md: 10px;  --r-lg: 14px;  --r-pill: 999px;

--shadow-card: 0 1px 2px rgba(20,24,28,.04), 0 1px 1px rgba(20,24,28,.03);
--shadow-pop:  0 8px 24px rgba(20,24,28,.10);
```

One elevation level for cards. Modals and popovers get `--shadow-pop`. No third level.
Card default: `background: var(--card); border: 1px solid var(--rule); border-radius: var(--r-lg); padding: var(--sp-5);`

### Layout — mobile-first

Base canvas **390 × 844**. Single column, page padding `--sp-4` (16px), card gap `--sp-4`.
Cards go edge-to-edge within that padding; no nested cards, ever.

| Breakpoint | Behavior |
|---|---|
| ≤ 480px (base) | Single column. One card per row. Hero full-bleed. |
| 481–899px | Single column, `max-width: 560px`, centered. FigureCards may pair 2-up. |
| ≥ 900px | Two columns, `max-width: 1180px`. Column order = mobile stack order. Nothing new appears; things only sit side by side. |

**Vertical priority order on mobile** — this order is fixed, and any new component must
declare where it inserts:

1. GapToGoal (hero)
2. TodayState — three facts, no charts
3. InformBanner (only when there is something true to say)
4. ThePipe
5. FigureCards
6. Everything else

**Touch targets:** minimum 44 × 44px hit area, even where the visible control is smaller.
Primary actions sit in the lower two-thirds of the screen — this app is used one-handed,
in bed, at night. Nothing important goes in the top-left corner.

---

## 6. Motion

```css
--ease: cubic-bezier(.2,.8,.2,1);
--dur-fast: 120ms;  --dur: 200ms;  --dur-slow: 420ms;
```

Permitted: hover/focus state changes, progress bar fill on first paint (`--dur-slow`),
disclosure expand, toast entry.
**Forbidden:** count-up animations on money, pulsing, anything that draws the eye to a
number changing. Movement implies urgency; urgency is the enemy of a 19-year plan.
`@media (prefers-reduced-motion: reduce)` disables all of it.

---

## 7. Components — built / specified

### 7.1 GapToGoal (hero) — the signature pairing, part 1
Horizontal distance track. Left tick = `Rp 0`, right tick = target. A marker at current
net worth with the *distance remaining* as `--t-hero`, and projected arrival year as meta.
Never expresses progress as a lonely percentage.

### 7.2 ThePipe — signature element, part 2
Vertical waterfall, top → bottom: **Income → Savings draw-off (first) → Automations
(DPLK, Bibit autodebit) → Living costs → Discretionary**. Savings branch is physically
above living costs. Widths proportional to amount.
*If this component ever renders savings below living costs, the design system is broken.*

### 7.3 FigureCard
`--t-label` eyebrow, `--t-figure-lg` number, optional delta, optional one-line meta
naming the data source and date. Every figure states where it came from.

### 7.4 LaneBar
Horizontal stacked bar of the four lanes + external pool. `external_pool` is rendered
in `--lane-external` with a hatch pattern and excluded from all totals, labeled
"pass-through — not yours."

### 7.5 TransactionTable
Zebra `--card-sunk`, right-aligned mono amounts, full precision, lane chip per row,
inline category edit. Sticky header. Sortable by date/amount/lane.

### 7.6 InformBanner
Amber only. Structure: **what happened → what it means for the goal → one optional action.**
Never imperative-scolding. Copy: *"Personal spend ran Rp 175.500 over allowance in July.
Effect on FI date: none measurable. Two ways to close it if you want to."*

### 7.7 ProtectedChip
Marks mortgage / Alina / family trips. Renders in `--lane-protected` with a lock glyph.
**Any optimization surface must filter these out before rendering suggestions.**

### 7.8 ImportDropzone
Accepts the fixed schema (date, amount, direction, account, suggested category, lane, note).
Shows parse confidence per row, balance-continuity check result, and refuses to commit
if statement summary totals don't reconcile.

### 7.9 EmptyState
Direction, not mood. State the absence, state why it matters factually, give one action.

**Copy:** *"No automatic investment set up. Recurring contributions are what move the
projected date. Set one up →"*

Never use internal vocabulary in user-facing copy. "Pipe", "lane", "waterfall", and
"draw-off" are our words, not the interface's. The interface says "automatic investment",
"category", "money flow", "taken out first."

### 7.10 TodayState
Sits directly under the hero. Exactly three facts, no charts, no icons beyond a
confidence dot. Its only job is orientation in under three seconds.

Line 1 — reconciliation state · Line 2 — automation state · Line 3 — projected date.

**Copy:** *"Reconciled through 17 Jul. · No automatic investment. · Projected 2051."*

Never says "everything operating normally" or any reassurance not derived from data.
If there is nothing true to report on a line, the line states the gap: *"August not yet
reconciled."*

---

## 8. Features & components the app must have but hasn't been built

Prioritized. Each ties to a specific documented failure mode.

### MUST — the plan fails without these

| # | Component | Why it must exist |
|---|---|---|
| M1 | **PipeHealthMonitor** | The Bibit autodebit is the entire Year-0 plan and is >2 months stale. The dashboard must show pipe status as a first-class object with a "days since last contribution" counter. An unbuilt pipe should be *visible on every screen*, not buried in a backlog. |
| M2 | **Month-6 / At-Raise Switch flag** | The RDPU→equity switch is worth ~6.2 years. It is a date-triggered decision that will be silently forgotten. Needs a persistent countdown card with the trigger condition stated ("Senior PM raise lands, or Month 6 — whichever first") and a manual "mark done" that logs the date. |
| M3 | **CrashProtocol screen** | A read-only screen, reachable only from settings, that appears *instead of* any sell affordance during a drawdown. Contains the modeled numbers: keep funding = +0.7 yr, panic-sell = +7.0 yr. Its existence is the guardrail; it must be written before the first crash, not during it. |
| M4 | **ExternalPool isolation guard** | Retro-fund money passes through BCA and will corrupt savings rate if it leaks in. Needs a contributor allowlist, auto-tagging, and a visible "excluded: Rp X from N pass-through transactions" line on every cash-flow view so silent inclusion is impossible. |
| M5 | **ReconciliationLedger with coverage map** | You currently reconcile to arbitrary dates (last: 17 Jul, partial). The app needs a calendar strip showing which date ranges are reconciled, which are gaps, and which statements are missing — so "is this number trustworthy?" is answerable at a glance. |
| M6 | **RaiseCaptureCommitment** | The documented #1 behavioral risk is upgrading lifestyle at 25M. Needs a pre-commitment record: current lifestyle ceiling (~17,2 jt) stored as a hard line, and on any income increase the app shows the delta as *already allocated to the pipe* by default, requiring explicit action to divert to spending. Default = the right thing. |

### SHOULD — materially improves decision quality

| # | Component | Why |
|---|---|---|
| S1 | **BuyDecisionCalculator** | Your recurring question is buy/don't-buy. Input an amount, output: months of FI date shifted, expressed as a factual trade ("Rp 12 jt = ~5 weeks later, on current assumptions"). Presents facts, no verdict, with the not-a-financial-advisor line baked in. |
| S2 | **SinkingFundBoard** | Trip fund must never draw from investment contributions. Parallel funds need to be visibly separate from the pipe, each with target, date, and monthly required. |
| S3 | **AssumptionsPanel** | The trajectory rests on 6% RDPU / 10% equity / 3% inflation. These must be editable and every projection must link back to them, so a projection is never mistaken for a promise. |
| S4 | **NetWorthSnapshotLog** | Resolves your open PRD question. Recommendation: **monthly, auto-triggered on reconciliation completion**, with manual snapshot allowed. Monthly matches the "check rarely" principle; on-demand invites daily checking. |
| S5 | **GoldHoldingRow** | ~37g across bars and accessories is 90%+ of current net worth and is tracked nowhere structured. Needs grams, form, and a manual price-per-gram field with the date it was set. |
| S6 | **DecisionJournal** | Records the *reason* at the moment of a significant purchase or financial decision, plus the projected FI-date impact, then re-surfaces it at +6 months asking only "was it worth it?" — yes/no, no scoring, no judgment. People reconstruct their reasoning after the fact; this is the only component that captures it before hindsight edits it. Pairs directly with S1. |
| S7 | **AllowanceLedger (personal scope)** | Rp 2.500.000/mo, currently ~175.500 over. Amber-inform only, personal scope only, never touches household or Alina. |

### LATER — build only after M1–M6 ship
DPLK contribution-rate simulator · SEA-move comparator (SGD banked, not gross) ·
StoryForge cash-flow lane · multi-currency · partner-shared read-only view.

---

## 9. Governance constraints (machine-checkable)

An AI harness should treat each of these as a lint rule.

1. No `red`/crimson hex or hue 340–20° at sat >25% anywhere in the codebase.
2. No token, class, or variable named `danger`, `error-red`, `alert-red`, `critical`.
3. No component named or behaving as `Sell`, `Redeem`, `Withdraw`, `Liquidate`, `Exit` on an investment holding.
4. Any component that generates spending suggestions must import and apply the protected-category filter (mortgage, Alina, family trips). No exceptions, no override flag.
5. Any cash-flow or savings-rate computation must exclude `external_pool` before aggregating.
6. Savings must appear above living costs in every flow visualization and every waterfall ordering.
7. Every rupiah figure uses `--font-money` + `tabular-nums`.
8. Every displayed figure carries a source + date (`FigureCard.meta` is required, not optional).
9. Projections must render an inline link to AssumptionsPanel and the words "projection, not a promise."
10. Advice-shaped output must include: *not a licensed financial advisor.*
11. No count-up animation on any monetary value.
12. Focus ring visible on all interactive elements; contrast ≥ 4.5:1 for text, ≥ 3:1 for UI.
13. No spinner components. Loading is always a shape-matched skeleton.
14. No swipe-to-delete, and no destructive action reachable by gesture.
15. Every financial mutation dispatches an undoable action. No `confirm()` on an undoable operation.
16. `FigureCard.confidence` is required. A figure rendered without a confidence level is a build failure.
17. Aggregate confidence must be computed as the minimum of its inputs, never hardcoded.
18. No fixed-height container wraps a monetary figure (breaks 200% type scaling).
19. No audio asset in the bundle except the single optional import-complete tone.
20. No `spring`, `bounce`, `elastic`, or `cubic-bezier` with overshoot (any y-value > 1 or < 0).
21. User-facing strings must not contain internal vocabulary: `pipe`, `lane`, `waterfall`, `draw-off`, `external_pool`.
22. Every primary screen answers its one question above the fold at 390 × 844.

---

## 10. Voice

Facts over recommendations. Tracking separated from optimizing.
Sentence case. Active voice. Plain verbs. No exclamation marks. No "Great job!"
Never congratulatory, never scolding — the app is an instrument, and instruments don't have opinions about the reading.

**Good:** "Personal spend ran Rp 175.500 over the July allowance. No measurable effect on the FI date."
**Bad:** "Oops! You overspent this month. Let's get back on track! 💪"

---

## 11. Interaction Language

A component is not specified until it answers: **what happens when I touch it, what it
looks like before the data arrives, and what happens when the data is wrong.**
Visual spec without this section produces inconsistent screens when generated by an
AI harness. Treat every subsection here as required, not aspirational.

### 11.1 Additional tokens

```css
/* Opacity */
--opacity-disabled: .38;
--opacity-hover:    .06;   /* overlay strength on hover surfaces */
--opacity-pressed:  .10;
--opacity-skeleton: .55;

/* Stroke */
--stroke-hair:  1px;   /* default borders, rules */
--stroke-mark:  2px;   /* focus ring, active tab, selected row edge */

/* Timing */
--delay-short:  40ms;   /* stagger between list rows */
--delay-medium: 120ms;  /* stagger between cards on first paint */

/* Surfaces */
--blur-sheet:   16px;   /* backdrop behind bottom sheets */
--scrim:        rgba(20,24,28,.32);
```

### 11.2 Touch behavior — the universal rules

| Gesture | Behavior | Never |
|---|---|---|
| **Tap a figure** | Expands **in place** to show source, calculation, and last-updated date. Does not navigate. | Never opens a new page for an explanation. |
| **Tap a card header** | Navigates to that section's full view. | — |
| **Long press** | Reveals the raw calculation (the arithmetic, unrounded). Optional; nothing is only available via long press. | Never the only path to an action. |
| **Swipe on a row** | Reveals *edit category* and *re-tag* only. | **Never destructive.** No swipe-to-delete anywhere in this app. |
| **Pull to refresh** | Re-fetches; does not re-reconcile. | Never silently changes a reconciled figure. |
| **Back gesture** | Never discards an in-progress edit. Prompts, or auto-saves as draft. | — |
| **Double tap** | Unassigned. Reserved. | — |

**Undo is mandatory for every financial mutation.** Category change, lane re-tag,
manual balance edit, import commit, snapshot. Toast with *Undo*, 8-second window,
plus a permanent reversal path in the ledger. There is no confirmation dialog for
anything that is undoable — dialogs to prevent mistakes are a worse pattern than
letting the mistake happen reversibly.

### 11.3 Expand-in-place — the primary disclosure pattern

Three levels, each one tap deeper, each in place. The user never loses their position.

```
Net worth              Rp 82,4 jt   ▸
  └ tap
Net worth              Rp 82,4 jt   ▾
  Assets               Rp 82,4 jt
  Liabilities          Rp 0
  Updated              17 Jul 2026
  Confidence           Mixed — 1 estimated input   ▸
    └ tap
    Gold     37,0 g × Rp 2,08 jt/g   set 14 Jul   Manual
    DPLK                  Rp 3,9 jt   17 Jul      Estimated
    Liquid                Rp 1,5 jt   17 Jul      Reconciled
```

Expansion uses `--dur` with `--ease`, height only. Content fades in at `--dur-fast`.
Rows stagger by `--delay-short`. Chevron rotates 90°. State persists per session.

### 11.4 Required states — every component

No component ships without all seven defined. `Error` is the only one that may be absent,
and only where no fetch occurs.

| State | Rule |
|---|---|
| **Loading** | Skeleton that matches the final layout's shape and height. **No spinners anywhere in this app.** GapToGoal loads as an empty ruler with ticks and no marker. ThePipe loads as grey stages with no amounts. Tables load progressive rows, never a blank screen. |
| **Empty** | Direction, not mood. States the absence, why it matters factually, one action. |
| **Partial** | **First-class, not an edge case** — July is reconciled through the 17th. Partial data renders normally with a confidence marker and an explicit coverage note. Never hidden, never shown as complete. |
| **Offline** | PWA. Last-synced figures render at full opacity with a persistent bar: *"Offline. Showing data from 17 Jul 09:12."* Nothing greys out — cached truth is still truth. Mutations queue and state that they are queued. |
| **Error** | Says what failed and what to do. In the interface's voice, no apology. *"Statement could not be read. The file is image-based — try the BCA text export."* |
| **Stale** | Data older than its expected cadence. Amber dot + age. *"Gold price set 14 Jul — 13 days ago."* |
| **Success** | Toast, 4s, `--flow`. States what happened in the past tense using the same verb as the button. "Import" → "Imported." No celebration, no checkmark animation beyond a static glyph. |

### 11.5 Tactile feedback — machined, not animated

The interface should feel like a physical instrument, which means small, immediate,
mechanical responses — not springy or organic ones.

```
Button press:   translateY(1px), shadow → none, --dur-fast, no scale
Button release: returns, --dur-fast
Card hover:     border → --rule-strong. Shadow unchanged. No lift.
Row press:      background → --flow-tint at --opacity-pressed
Toggle:         travel only, --dur-fast, no bounce, no overshoot
```

**Forbidden motion, absolutely:** bounce, spring, overshoot, elastic easing, confetti,
shake, pulse, glow, celebration of any kind, and count-up on any monetary value.
Motion here communicates **structure** — what came from where, what is now open —
never emotion.

Haptics (PWA, where supported): a single 10ms tick on commit of a financial mutation
and on undo. Nothing else. No haptic on navigation, scroll, or success.

### 11.6 Accessibility floor

Non-negotiable. Every one is checkable.

- Dynamic Type / user font scaling to **200%** without loss of function. Money figures may wrap; they may never truncate or ellipsize. Fixed-height containers are banned around numbers.
- Touch targets ≥ 44 × 44px, including table row controls and chevrons.
- Contrast ≥ 4.5:1 text, ≥ 3:1 UI and graphical objects. Lane colors must be distinguishable **without color** — the LaneBar uses pattern plus a text legend, never color alone.
- VoiceOver: every figure reads as `label, value, confidence, source date` — *"Net worth, 82 million 400 thousand rupiah, mixed confidence, updated 17 July."* Never reads a raw numeral without its label.
- Focus order follows visual order. Focus ring `--stroke-mark` solid `--flow`, offset 2px, visible on every interactive element.
- Full keyboard operation on the desktop variant, including expand/collapse and table sort.
- `prefers-reduced-motion`: all transitions become instant; expansion still works.
- `prefers-contrast: more`: `--rule` → `--rule-strong`, `--ink-muted` → `--ink`.
- Reduced transparency: `--blur-sheet` → 0, `--scrim` → solid `--card-sunk`.

### 11.7 Sound

**The app is silent.** No sound on any financial action, navigation, success, or error.
No cash-register, coin, chime, or reward sound exists in this product or ever will —
those sounds train the dopamine response this entire system is built to avoid.

The single permitted exception: one subtle, non-musical confirmation tone on completion
of a **statement import**, because that is a long-running operation the user may have
navigated away from. Off by default.

### 11.8 The 10-second rule

Every primary screen answers exactly one question, above the fold, without scrolling,
in under ten seconds.

| Screen | Its one question |
|---|---|
| Today | Am I still on track? |
| Money flow | Where did it go? |
| Plan | What changes the date? |
| Import | Did this reconcile correctly? |

If a screen cannot answer its question above the fold at 390 × 844, it is doing too much.
Split it. This is a hard constraint on new feature placement, not a guideline.

---

## 12. Confidence System

The most consequential addition in v1.1. Today every figure renders at identical visual
weight, which quietly asserts that all of them are equally true. They are not: the gold
price is manually typed and 13 days old, the DPLK balance is unknown, July is reconciled
only through the 17th. A calm instrument that overstates its own precision is not calm,
it is wrong.

**Principle: an instrument displays its tolerance.** A product that admits what it does
not know is trusted more than one that renders every number with the same confidence.

### 12.1 The four levels

| Level | Meaning | Marker | Token |
|---|---|---|---|
| **Reconciled** | Matched against a bank statement, balance-continuity verified | Solid dot | `--flow` |
| **Imported** | From a statement, not yet balance-verified | Hollow dot, `--flow` ring | `--flow` |
| **Estimated** | Derived or projected from a model or assumption | Half dot | `--ink-faint` |
| **Manual** | Typed by the user, ages over time | Hollow dot, `--amber` ring | `--amber` |

```css
--conf-reconciled: var(--flow);
--conf-imported:   var(--flow);
--conf-estimated:  var(--ink-faint);
--conf-manual:     var(--amber);
--conf-dot: 7px;
```

The dot sits **after** the figure, baseline-aligned, `--sp-2` gap. Never before it —
the number leads, the caveat follows.

### 12.2 Rules

1. **Every figure carries a confidence level.** There is no unmarked number in this app. `FigureCard.confidence` is a required prop.
2. **Aggregates inherit the weakest input.** Net worth is 93% gold at `Manual`, so net worth reads `Manual`, not `Reconciled`. A composite figure is never more confident than its least confident component.
3. **Mixed aggregates are labeled as such**, and expansion shows which input dragged it down: *"Mixed — 1 manual input."*
4. **Manual figures age.** Show days since set once past 30 days. Past 90, add the amber stale marker. Aging is stated as fact, never as a nag.
5. **Projections are always `Estimated`**, always link to AssumptionsPanel, always carry the words *"projection, not a promise."*
6. **Confidence never uses red or the word "unreliable."** The vocabulary is descriptive — where the number came from — not evaluative.
7. **A confidence marker is tappable** and expands to the source: which account, which statement, which date, which assumption.
8. Confidence is stored per-figure in the database, not computed at render, so it survives export and is auditable.

### 12.3 Coverage confidence

Distinct from figure confidence and it applies to time, not values. The
ReconciliationLedger (M5) states coverage as a plain sentence above the calendar strip:

> *"Reconciled Jan–Jun. July partial through the 17th. August has no statement."*

Any figure derived from a partial period inherits `Imported` at best, never `Reconciled`,
and its expansion states the coverage gap.

---

## 13. Deferred — do not build yet

Reasoning recorded so a future session does not relitigate it.

- **Onboarding / first-run principles** — deferred until real beta users exist. Designing progressive disclosure for a hypothetical stranger is speculative work, and the current user needs none of it.
- **Multi-user information architecture, auth, tenancy, billing** — a public SaaS is a second business with its own time cost. Revisit only after the investment pipe is running and a beta cohort has actually asked.
- **Vocabulary translation layer** ("automatic investment" → "pipe" as the user matures) — the plain-language term is now the default in all UI copy, so the layer is unnecessary until there are users to graduate.
- **Dark mode** — v1.2.

Adding these sections has a cost. The design system is not the goal; the 4,5 M target is.
