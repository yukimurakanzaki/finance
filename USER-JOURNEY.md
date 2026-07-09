# FI Dashboard — End-to-End User Journey Map

*Purpose: drive build prioritization. Each stage maps the intended journey against what is actually built (verified against `src/` on 2026-07-09, branch `claude/fi-dashboard-safe-to-spend-ot3w4b` merged with `main`), then ranks the gaps.*

*Status legend: ✅ built and reachable · 🟡 partially built or hard to find · ❌ missing.*

---

## Reported pain points (2026-07-09)

Direct user feedback after real use. Each is cross-referenced to a journey stage and resolved in the ranked gap list at the bottom.

| # | Pain point | Stage | Status |
|---|-----------|-------|--------|
| P1 | Hard to know the sum of **today's expenses** | Daily glance | ✅ **Shipped 2026-07-09** (daily transaction log). Today tab is now the default screen with a date navigator and per-day Income/Expenses/Balance chips. |
| P2 | Can't see **balance of wallet / bank accounts** | Daily glance, Maintenance | ✅ **Shipped 2026-07-09.** `useAccountBalances` derives every account's balance from a manual-override anchor + the transaction ledger (transfer-aware); shown on every Assets row including banks. |
| P3 | Can't see **how much my assets are** | Daily glance | ✅ **Shipped 2026-07-09.** Assets screen now shows a Total balance header over the per-account balances. (Net-worth-by-lane still on the Report tab.) |
| P4 | Can't see **spend per category** | Weekly loop, Monthly review | ❌ Still open — deferred to a later round. Categories now capture on every entry, so the data exists for a future breakdown report. |
| P5 | **Adding a category** is hard | Maintenance | ✅ **Shipped 2026-07-09.** The Add-expense/income form has a category field with create-on-save (typing a new name creates the category inline). |
| P6 | **Adding a transaction** is hard | Weekly loop | ✅ **Shipped 2026-07-09.** Speed-dial FAB → Expense / Income / Transfer opens a bottom-sheet form (wallet, amount, title, category, note). Plus AI logging via the Ask AI action. |
| P7 | **Updating salary** is hard | Event-driven | 🟡 Decide (with the income log) is now reachable from More → Plan → Decide. Salary entry still lives there; a Home/settings shortcut is a future polish. |
| P8 | Can't see **total expense / income / balance per month** | Monthly review | ✅ **Shipped 2026-07-09.** The new Report tab shows a "This month — actuals" card (Income / Expenses / Net) above the net-worth scoreboard. |
| P9 | Can't see **list of wallets and balance on each** | Daily glance | ✅ **Shipped 2026-07-09.** Assets screen lists every wallet with its derived balance; the wallet picker in the add form shows balances too (same root fix as P2). |

**The theme:** the app was strong on *planning and trajectory* (net worth, waterfall, safe-to-spend model) and weak on *bookkeeping basics* (balances, today's spend, category totals, manual entry). The 2026-07-09 daily-transaction-log work closed most of that gap: Today is now the app's front door, wallets carry derived balances, and manual + AI-assisted logging both work. Remaining: category spend breakdown (P4) and a more discoverable salary-entry point (P7).

> **Update 2026-07-09:** Implemented per [docs/superpowers/plans/2026-07-09-daily-transaction-log.md](docs/superpowers/plans/2026-07-09-daily-transaction-log.md). 7 of 9 pain points resolved. tsc + 48 unit tests green; live click-through pending (app is behind a Supabase sign-in).

---

## Stage 1 — First-run setup

**Goal:** from sign-up to a meaningful scoreboard in under 5 minutes.

| Step | Screens | Status |
|------|---------|--------|
| Sign up / sign in | `AuthScreen` | ✅ |
| Onboarding wizard | `OnboardingWizard` | ✅ Gated in `App.tsx` before main UI |
| Demo data auto-seed (Jan–Jun 2026, 688 txns) | `seedTransactionsIfNeeded` on launch | ✅ |
| PIN setup | `PinSetup` (More), `PinLockScreen` | ✅ Optional, re-lock works |
| First Home view | `HomeScreen` | ✅ Net worth hero + chart render from seed |

**Friction:** none blocking. Seeded data makes the first view meaningful. Onboarding doesn't create accounts with starting balances — which is where P2 begins: accounts exist without a balance concept.

---

## Stage 2 — Daily glance

**Goal:** 10-second answer to "where do I stand today?" — today's spend, wallet balances, total assets.

| Need | Screens | Status |
|------|---------|--------|
| Net worth total + trend | `HomeScreen`, `NWChart`, `useNetWorth` | ✅ |
| Today's expense sum (P1) | — | ❌ Nothing shows "today" |
| Wallet/bank balances (P2, P9) | `AssetsScreen` | 🟡 Bank accounts show no balance |
| Total assets breakdown (P3) | `HomeScreen` (by lane) | 🟡 Lane totals only, no drill-down |
| Crash-mode calm state | — | ❌ Backlog (IDEA #6), by design not urgent |

**Friction:** this is the weakest stage relative to how often it runs (daily). Three of the nine pain points live here. The Home scoreboard answers the *FI trajectory* question but not the *"can I buy lunch and from which account"* question.

---

## Stage 3 — Weekly spend loop

**Goal:** stay inside the discretionary pool; know what's safe to spend and log spending as it happens.

| Need | Screens | Status |
|------|---------|--------|
| Safe-to-spend gauge | `SafeToSpendScreen`, `GaugeCard` | ✅ |
| Day-by-day pacing | `DayDots` | ✅ |
| Waterfall context | `Waterfall` | ✅ |
| Allowance vs. Rp 2.5M cap | `AllowanceEditor` + gauge | ✅ Editor in More |
| Log a transaction on the spot (P6) | — | ❌ No manual add — the loop can't be fed |
| Spend by category this week (P4) | — | ❌ |

**Friction:** the gauge is only as good as its inputs, and there is no way to input. Until statements are imported (monthly), the weekly loop runs on stale data. P6 is the single biggest hole in the app's core loop.

---

## Stage 4 — Monthly import & reconcile

**Goal:** statement in → transactions categorized → month closed → actuals reviewed.

| Step | Screens | Status |
|------|---------|--------|
| Import via AI chat (statement image) | `ChatScreen` + image upload | 🟡 Upload path exists, but AI write tools **cannot save transactions** — extraction has nowhere to go |
| Import prompt (manual paste flow) | `ImportPromptSheet` (More) | ✅ |
| Reconcile entry/confirm | `ReconcileEntryScreen`, `ReconcileConfirmScreen` | ✅ Wired into Budget tab flow |
| Monthly actuals: income / expense / net (P8) | `TransactionHistory` chips | 🟡 Exists but buried; `MonthlyScreen` shows plan, not actuals |
| Category totals for the month (P4) | — | ❌ |
| Yearly view | `YearlyScreen` | ✅ |

**Friction:** the reconcile machinery is solid, but the review payoff is weak — after closing a month you can't see the month's actual totals or category breakdown without digging into history filters.

---

## Stage 5 — Event-driven decisions

**Goal:** answer one-off questions with numbers, not verdicts.

| Need | Screens | Status |
|------|---------|--------|
| Buy/don't-buy impact | `DecideScreen`, `SpendingLens` | ✅ |
| Milestones | `Milestones` | ✅ |
| Income log / salary update (P7) | `IncomeLog` + `AddIncomeForm` | 🟡 Built, discoverability problem |
| Gap-to-FI calculator | — | ❌ Backlog (IDEA #1, dependency for 3 others) |
| Raise-trigger switch banner | — | ❌ Backlog (IDEA #2) |

**Friction:** salary lives under "Decide", which reads as a what-if tab, not a data-entry place. A settings-adjacent or Home-adjacent entry point would resolve P7 without new functionality.

---

## Stage 6 — Maintenance

**Goal:** keep reference data current with minimal ceremony.

| Need | Screens | Status |
|------|---------|--------|
| Category manager (P5) | `CategoryManager` (More) | 🟡 Built, buried |
| Recurring register | `RecurringRegister` | ✅ |
| Household / members | `HouseholdSheet` | ✅ |
| Backup / restore | `RestoreBackup` | ✅ |
| Assumptions | `AssumptionsEditor` | ✅ |
| Account & asset CRUD | `AccountForm`, `AssetForm` | ✅ (minus balances, P2) |

**Friction:** everything exists; the pain is that maintenance actions aren't reachable from the moment they're needed (add category while categorizing, fix balance while looking at an account).

---

## Stage 7 — Cross-cutting: AI Manager

**Goal:** accelerate every stage above through chat.

| Capability | Status |
|-----------|--------|
| Multi-session chat, model picker, skills, memory | ✅ (Phase A–C) |
| Read tools (query transactions, etc.) | ✅ |
| Write tools: recurring, asset value, account balance, memory, skills | ✅ with confirm gate |
| Write tool: **save transactions** | ❌ The statement-import promise (image → transactions) dead-ends here |
| Daily budget / usage ledger / prompt versioning | ✅ (merged from main) |

---

## Ranked gap list → build priorities

Ranked by (frequency of the journey stage it blocks) × (severity). Pain-point references in parentheses.

1. **Manual transaction entry** (P6) — a quick-add form (amount, direction, account, category, note, date defaulting to today). Unblocks the daily and weekly loops entirely. Highest leverage, smallest scope.
2. **AI `save_transactions` write tool** (P6, Stage 4/7) — completes the statement-image import loop that the chat already promises. Reuses the same confirm gate as other writes.
3. **Account balances** (P2, P3, P9) — derive bank balances from a starting balance + transaction ledger (or extend `manual_balance_override` to bank accounts as an interim), show on `AssetsScreen` rows and a total.
4. **Today's spend** (P1) — a "Today" chip/card; smallest version is a fourth period option ("Today") in `TransactionHistory` plus a today-sum card on Home or Budget.
5. **Category spend breakdown** (P4) — per-category totals for a selected month; belongs on `MonthlyScreen` (turning it from plan-only into plan-vs-actual) or as a grouping in `TransactionHistory`.
6. **Monthly actuals summary** (P8) — income/expense/net for the month, surfaced on `MonthlyScreen` rather than buried in history chips. Falls out of #5 almost for free.
7. **Discoverability fixes** (P5, P7) — entry points, not features: "＋ category" inside the categorize/import flows; salary/income entry linked from More or Home. Cheap, do alongside adjacent work.
8. **Backlog (IDEA.md Tier 1)** — gap-to-FI calculator, raise-trigger banner. Real value, but the bookkeeping basics above block daily use and come first.

---

## Appendix — Scenario vignettes (stress tests)

**A. Lunch decision (daily).** "Can I buy this Rp 85k lunch?" Needs: today's spend so far (❌ P1), wallet balance (❌ P2), safe-to-spend gauge (✅). Today: user opens Budget, sees the weekly gauge, but can't confirm today's total or the account balance — decision made on gut. After gaps #1, #3, #4: open app → Home shows today's spend + account balance → tap quick-add to log the lunch.

**B. Payday (monthly).** Salary lands. Needs: update income if changed (🟡 P7), import statement (🟡 chat dead-end), reconcile (✅), review the closed month (🟡 P8, ❌ P4). Today: reconcile works but the month-in-review is a shrug. After gaps #2, #5, #6: photo of statement → AI extracts → confirm writes → MonthlyScreen shows actual vs. plan by category.

**C. Overspend week.** Gauge is amber by Wednesday. Needs: which category is bleeding (❌ P4), what's committed vs. discretionary (✅ waterfall). Today: user knows *that* they overspent, not *where*. After gap #5: category breakdown names the leak; amber-inform stays lecture-free per the design rules.
