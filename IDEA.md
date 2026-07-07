# FI Dashboard — Idea Backlog
*Beyond PRD v1.1. Nothing here is committed — this is a parking lot for things worth building later, ranked by leverage against the FI roadmap.*

---

## How to use this doc
- PRD v1.1 = what's locked and being built now (import contract, wireframes, lane classification, net-worth snapshot, weekly spending governor).
- This file = candidate ideas that surfaced but aren't scoped yet.
- When one gets promoted, move it into the PRD and delete it from here (don't let the same idea live in two places).

---

## Tier 1 — High leverage, directly serves the roadmap

**1. Gap-to-FI calculator**
Input current net worth + monthly pipe rate → output: years to 4.5B / years to 6B, using the same real-return assumptions as the trajectory model (RDPU 3% real, equity 7% real). Every time a transaction batch is imported, this number updates automatically instead of requiring a manual re-run of the model.
*Why it matters:* turns "where am I now" into a single number instead of a re-derivation each session.

**2. Month-6 / raise-trigger switch reminder**
A standing flag (not a notification system, just a persistent dashboard banner) that stays "ON — RDPU phase" until either (a) 6 months from Bibit onboarding pass, or (b) the Senior PM raise is confirmed on payslip. Then flips to "SWITCH DUE — route new contributions to equity fund" and stays visible until acknowledged.
*Why it matters:* this is the single lever worth ~6 years per the trajectory model. It's too important to rely on memory.

**3. Buy/don't-buy impact preview**
User enters a one-off expense amount → dashboard shows the FI-date impact (e.g., "this pushes your 4.5B date back ~11 days" or "negligible, <2 days"), sourced from the same gap-to-FI engine as Idea 1. Never a verdict, just the number — matches how you want financial questions answered (facts, not confident recommendations).
*Why it matters:* replaces a manual Claude-chat calculation with something instant.

**4. Allowance-gap resolver widget**
Tracks the Rp 2,500,000/month personal allowance against actual spend, flags the running overage (currently ~Rp 175,500/month), and shows the two concrete levers side by side: reduce daily coffee budget (~Rp 18,000/day math) vs. negotiate allowance increase with Shinta. Presents the trade-off, doesn't pick for you.

**5. Loan-clearance capture tracker**
One-time checklist item: when the loan-deduction clearance is confirmed via payslip, prompt to route the *full* freed amount to Bibit autodebit — with a visible "before/after" of what happens if only part of it gets redirected (lifestyle creep quantified in years-to-FI, not just rupiah).

---

## Tier 2 — Useful, not urgent

**6. Crash-mode banner**
If a linked/manually-entered market index drops meaningfully, show a single calm reminder: "Do nothing. Keep the pipe running." No red, no charts of the drop itself — this is the one screen state designed to *reduce* checking behavior, not increase it. Ties to the existing no-panic-UI principle already in the PRD; this extends it to a specific triggerable state rather than a passive absence of a sell button.

**7. SEA-move scenario comparator**
Side-by-side: current Jakarta take-home/savings-rate vs. a hypothetical Singapore offer, using "SGD banked per month" as the only number that matters (per the roadmap's own test). Manual entry only — no live FX/cost-of-living feed needed for v1.

**8. StoryForge P&L mini-tracker**
Separate ledger (not blended into personal net worth) for StoryForge revenue/cost, with a single toggle: "cash-flowing asset" vs. "not yet" — reinforcing the Year 4–5 framing that StoryForge is a means, not an identity.

**9. DPLK contribution-rate what-if**
Slider: current 2% vs. hypothetical 3–5%, showing rupiah impact on take-home and the resulting change to years-to-FI. Directly answers the open roadmap item ("can DPLK % be raised?") without a fresh calculation each time it's asked.

**10. Subscription/recurring-charge tracker**
Lightweight list of recurring debits (e.g. confirming whether Minimax M3 got added and whether it came from freed loan money or lifestyle creep). Flags any *new* recurring charge that appears in an import batch for a one-line "new subscription detected" note — not a lecture, just a flag.

---

## Tier 3 — Nice-to-have / needs more thought before scoping

**11. Retro-fund reconciliation helper**
Since BOSS team retro contributions pass through BCA and must be excluded from personal totals, a small matcher that auto-tags likely retro-fund transactions (matching known contributor names) for a one-tap confirm/reject, instead of manual `external_pool` tagging every import.

**12. Alina education/activity cost forecaster**
Separate protected-category ledger for daughter's costs with a simple trendline — purely informational, never a candidate for cut suggestions (this stays true to the "don't cut the fruit" non-negotiable, it's tracking, not optimizing).

**13. BCA scanned-PDF quick-capture**
Since BCA statements are image PDFs (not machine-readable), explore whether a photo/OCR quick-add flow for individual transactions would beat waiting for monthly statement parsing. Needs a spike before committing — OCR accuracy on Indonesian bank statement formatting is unproven.

**14. Mortgage payoff tracker**
Simple remaining-balance and payoff-date display. Explicitly not paired with any "pay it off faster" nudge — mortgage is a protected, non-negotiable item, so this is visibility only.

---

## Explicitly rejected / out of scope
- Any "sell" button or portfolio rebalancing action inside the app — conflicts with the no-panic-UI, automation-first design principle.
- Red/shaming UI states for overspending — amber-inform only, already a hard rule.
- Live brokerage/bank API integration — statements are manually imported by design (local-first, no mandatory network dependency).

---

## Open questions before promoting anything from here
1. Which Tier 1 idea should get scoped into the PRD next — the gap-to-FI calculator (Idea 1) is the dependency for three other ideas (3, 4, 9), so it's likely first.
2. Does the Month-6/raise-trigger reminder (Idea 2) need push notifications, or is a persistent dashboard banner enough for a local-first PWA with no mandatory network dependency?
