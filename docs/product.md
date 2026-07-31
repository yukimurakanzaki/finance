# Product — FI Dashboard

**Last Updated:** 2026-07-27  
**Status:** Active product definition

---

## Product Vision

**One job:** Answer "how much can I safely spend today / this week / this month?" from the spending bucket, plus assets position and category spend report.

**Decision filter for any new feature:** Does it make Safe To Spend more accurate, more trustworthy, or more useful?

---

## Target Users

**Primary:** Households (couples/families) managing shared finances  
**Secondary:** Individuals tracking personal finances with FI goals

**User personas:**
1. **Household Admin** — Creates household, invites members, manages subscription, full access
2. **Household Member** — Shared financial view, personal allowance, transaction capture
3. **Individual User** — Single-user mode (free tier), personal finance tracking

---

## Core Workflows

### 1. Safe-to-Spend Calculation (Primary)
**Goal:** Answer "can I afford this today?"

**Flow:**
1. User opens app → lands on Budget tab (Safe-to-Spend gauge)
2. Engine computes: income → pay-yourself-first → bills → personal pool → weekly → daily ceiling
3. Gauge shows today's spending ceiling
4. User logs expense via QuickLogFAB → gauge updates reactively
5. User consults gauge before discretionary purchase

**Design invariants:**
- Savings-first waterfall (never "leftover → savings")
- Facts, not advice (show consequences, never "don't buy")
- Amber informs, never red-alarms (exception: over-bucket bars)
- Protected categories untouchable

### 2. Weekly Reconcile
**Goal:** Keep data current, snapshot net worth

**Flow:**
1. User imports transactions (chat-assisted or CSV)
2. Validator checks rows, detects transfers
3. User reviews batch
4. Atomic commit: transactions + net worth snapshot + recurring advances
5. Reports update with fresh data

### 3. FI Projection
**Goal:** Track progress toward financial independence

**Flow:**
1. User sets assumptions (target range, return rates, inflation)
2. Engine projects Path A (constant blend) vs Path B (RDPU → equity switch)
3. Dashboard shows FI date, gap to target, years to FI
4. User adjusts assumptions → projection updates

### 4. Asset Management
**Goal:** Track net worth by lane

**Flow:**
1. User adds accounts (bank/wallet/cash) and assets (RDPU/equity/gold/DPLK)
2. Each assigned to lane (income_producing, store_of_value, debt_liability, protected_living, pass_through)
3. Net worth computed: sum of all accounts + assets
4. Gold assets auto-price via XAU/USD spot × USD/IDR (future)
5. Staleness indicator nudges user to update values >30 days old

### 5. Category Spend Report
**Goal:** See where money goes by category

**Flow:**
1. User navigates to Report tab
2. Selects month (‹ Month Year ›)
3. Category bars show spent vs budget (envelope target)
4. Over-budget categories highlighted (amber-inform)
5. Tap category → filtered transaction list below

---

## Major Features

### Tier 1: Core (Must Have)
- **Safe-to-Spend gauge** — Daily spending ceiling
- **Budget waterfall** — Income → PYF → bills → personal pool → weekly → daily
- **Quick Log** — Fast transaction entry
- **Net worth dashboard** — Accounts + assets by lane
- **FI projection** — Path A vs Path B
- **Import pipeline** — Chat-assisted + CSV
- **Reconcile flow** — Atomic batch commit

### Tier 2: Product Completeness (Should Have)
- **Category spend report** — Budget vs actual by category
- **Recurring register** — Pipes, bills, subs, other
- **Allowance editor** — Per-member personal pool
- **FI assumptions editor** — Target range, return rates, inflation
- **Category manager** — CRUD categories, assign envelopes
- **Staleness indicators** — Nudge to update asset values
- **Budget alerts** — Amber-inform when over budget

### Tier 3: Multi-User (Phase B+)
- **Cloud accounts + auth** — Supabase Auth
- **Household tenancy** — Create, invite, join
- **Multi-device sync** — Outbox/pusher/puller
- **Per-member allowances** — Shared budget, personal slices
- **Household switcher** — (future, if user belongs to multiple households)

### Tier 4: Commercial (Phase E)
- **Subscription billing** — Xendit integration
- **Free tier** — Single user, on-device, no sync
- **Paid Household plan** — Cloud sync, multi-device, multi-member
- **Trial** — 14–30 days, converts to paid or downgrades
- **Entitlement gating** — Features gated by subscription status

---

## Business Rules

### Financial Logic
1. **Savings-first waterfall:** Income → pay-yourself-first → household bills → personal sub → personal pool → weekly pool → daily ceiling
2. **Protected categories:** Never suggested for cutting, never optimized away
3. **Pass-through lane:** Excluded from net worth, savings rate, safe-to-spend, FI projection
4. **Integer rupiah:** All money is integer, no floats, no cents
5. **Transfers excluded:** Internal transfers don't count as income/expense
6. **Amber-inform:** Over-budget is amber, not red (except over-bucket bars use `--debt` slate-gray)

### Sync & Data
7. **Server-authoritative:** Server stamps `updated_at`, client clocks never decide ordering
8. **LWW per row:** Field-level merge rejected (over-engineered for 2-person household)
9. **Idempotent retries:** Client-generated UUIDs + upsert semantics
10. **Delete-beats-update:** Tombstone log wins over concurrent edit
11. **Atomic imports:** Transactions + snapshot + recurring advances commit together or not at all

### AI Safety
12. **No advice:** AI explains/summarizes, never recommends
13. **No verdicts:** No "you should/shouldn't"
14. **No protected cuts:** AI never suggests cutting protected categories
15. **No sell UI:** Assets are valued snapshots only, no disposal/sell mutation
16. **Facts only:** Show consequences (FI-date delta, safe-to-spend impact), not opinions

### Privacy & Security
17. **Household isolation:** RLS on every table, tested in CI
18. **Chat privacy:** Conversations stay device-local, never synced
19. **PIN is local:** Device convenience lock, not server credential
20. **Data minimization:** No bank account numbers, no ID numbers, no contacts access

---

## Future Opportunities

### Short-term (Phase C)
- **Allocation pie-chart report** — Spending by category (weekly/monthly/yearly)
- **FI tracker "show the math"** — Render projection formula + assumptions used
- **Empty/loading/error states pass** — Polish across all screens
- **Design system codification** — `design-system.html` with all tokens

### Medium-term (Phase D)
- **Realtime sync** — Supabase Realtime subscription for live updates
- **MFA opt-in** — TOTP for sensitive operations
- **Dependency audit** — Document update cadence
- **Client error reporting** — Sentry integration
- **Backup restore drill** — Verify restore works end-to-end

### Long-term (Phase E+)
- **Public launch** — Open sign-up, self-serve billing
- **Marketing site** — Separate Next.js app on Vercel
- **Bank-specific import adapters** — After real users' banks are known
- **View-only role** — Candidate for later (not v1)
- **Multi-currency** — Deferred (IDR only at launch)
- **Open Banking integration** — Deferred (import stays human-in-the-loop)

### Backlogged Ideas
- **AI memory scope** — Per-household, member-attributed, visible/editable preferences
- **Personalization** — Learned category mappings from user corrections
- **Automated bank fetch** — Deferred (regulatory + complexity)
- **Live market data** — Deferred (asset values entered manually)
- **Public API** — Deferred (no third-party integrations in v1)

---

## Success Metrics

### Activation
- % of new households that add 2nd member and reach "live" state

### Engagement
- Weekly-active households (reconcile + safe-to-spend checked)
- Data freshness (households with net worth/assets current, no lingering stale nudges)

### Commercial
- Trial → paid conversion rate
- Retention / churn (monthly retained households)
- MRR (recurring revenue)

### Behavioral
- Savings rate flat/rising after raises
- FI date holding or moving earlier
- Safe-to-spend consulted before discretionary purchases (qualitative)

---

## Product Hierarchy (from Vision.txt)

**Tier 1:** Safe To Spend — Without this, nothing else matters  
**Tier 2:** Financial Position — Net worth, cash position, upcoming obligations (explain why today's Safe To Spend has that value)  
**Tier 3:** Financial Direction — FI projection, savings rate, raise allocation, opportunity cost (explain where household is heading)  
**Tier 4:** Bookkeeping — Transactions, categories, imports, reports, assets (necessary infrastructure, not the product)

---

## Go-to-Market Strategy

### Phase 0: Dogfood (Current)
- **Goal:** Prove multi-user model works end-to-end
- **Users:** Owner's own household (2+ real members, real money)
- **Gate:** Two members share one picture, sync works across devices, weekly use sticks for several weeks

### Phase 1: Friend Beta
- **Goal:** Validate with truly separate household + test data isolation
- **Users:** One friend's household (separate tenant)
- **Gate:** Friend onboards themselves, finds real value, would pay; no cross-tenant data issues

### Phase 2: Public Launch
- **Goal:** Sell self-serve to public
- **Users:** Open sign-up
- **Gate:** Sign-up, invite, trial, subscribe, support flows all self-serve; billing live; security hardened

---

## Monetization Model

**Freemium + per-household subscription**

- **Free tier:** Single user, on-device, manual entry (mirrors today's app)
- **Paid Household plan:** Cloud sync, multi-device, multi-member, chat-assisted import, cloud backup
- **Pricing:** Per household, not per seat. Monthly + discounted annual. 14–30 day trial on sign-up.
- **Rationale:** Cloud backend + custody of financial data = recurring costs → need recurring revenue. Per-household pricing matches how couples budget.

**To validate in P1:** Price point, trial length, member cap N, feature paywall placement.

---

## Design Principles (from Vision.txt)

Every feature must satisfy at least one:
- ✓ Helps users make a decision
- ✓ Reduces uncertainty
- ✓ Protects long-term wealth
- ✓ Saves time
- ✓ Prevents expensive mistakes

If a feature satisfies none, it should not exist.

---

## Competitive Positioning

**Most personal finance apps answer questions about the past:**
- Where did my money go?
- How much did I spend?
- What's my balance?

**FI Dashboard answers the question people ask before making a purchase:**
> "Can I afford this today?"

**Differentiation:**
- Safe-to-spend is the core metric (not balance, not budget)
- Savings-first waterfall (not "leftover → savings")
- Facts, not advice (no recommendations, no verdicts)
- Protected categories (never optimized away)
- FI as destination (not budgeting, not tracking)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-27 | 1.0 | Initial documentation generated |
