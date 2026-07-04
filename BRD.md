# Business Requirements Document — FI Dashboard

**Product:** FI Dashboard (working name `fi-dashboard`)
**Document type:** Business Requirements Document (BRD)
**Version:** 2.0 · **Date:** 2026-07-04
**Status:** Product-direction pivot — from a single-user, on-device tool to a **commercial, multi-user household finance product** with cloud accounts, sold via subscription. v1.0 documented the shipped single-user app; v2.0 defines the product to be built.
**Related:** `ARCHITECTURE.md` (current technical contract — **local-first, single-user; will require a major revision to support this BRD**).

---

## 1. Executive Summary

FI Dashboard helps a **household** (a couple or family) run their shared money as one honest scoreboard: *what are we worth, what can we safely spend this week, and when do we reach financial independence (FI)?*

The existing app already delivers this for one person on one device. This BRD extends it into a **product people can buy**: multiple people, sharing a joint financial picture, syncing across devices via cloud accounts, sold on a subscription. Each rupiah is still classified into four "lanes" (grow / preserve / drain / maintain), pipes still enforce "pay yourself first," and spending is still reframed as opportunity cost — but now for a household, not an individual.

**The unit of the product is the household, not the user.** Household members share one net worth, one budget, and one FI goal, while keeping individual discretionary allowances. Data lives in the cloud, tied to authenticated accounts, isolated per household.

**Go-to-market is deliberately staged:** dogfood in the owner's own household → beta with one friend's household → public online launch. The monetization model (freemium + per-household subscription) is designed to make exactly this progression frictionless.

---

## 2. Business Objectives & Goals

| # | Objective | Why it matters |
|---|-----------|----------------|
| BO-1 | Give a **household** a single, trustworthy shared **net-worth scoreboard**. | Couples/families rarely see their combined position; that clarity is the core value. |
| BO-2 | Enforce **"pay yourself first"** at the household level. | Savings rate is the biggest lever on the shared FI date. |
| BO-3 | Turn a shared annual budget into an honest **weekly safe-to-spend** ceiling, with **per-member allowances**. | Joint budgeting fails without personal room; individual allowances prevent friction. |
| BO-4 | Project a credible **household FI date** and quantify the gap to goal. | A shared, dated target aligns partners. |
| BO-5 | Reframe discretionary spending as **opportunity cost**. | Better in-the-moment decisions for both partners. |
| BO-6 | Keep household data **secure, private, and isolated per household** in the cloud. | We now custody other people's financial data — trust is existential. |
| BO-7 | Make the product **sellable and self-serve**: sign up, invite a partner, subscribe, use across devices. | Required to move from a personal tool to a business. |
| BO-8 | Validate the product through a **staged rollout** before public launch. | De-risk: prove value in own household → friend → market. |

**Primary success definition (commercial):** households sign up, add a second member, keep their finances current weekly, convert from trial to paid, and stay.

---

## 3. Stakeholders & Users

| Role | Description | Interest |
|------|-------------|----------|
| **Household Owner / Admin** | The member who creates the household, invites others, and manages the subscription and billing. | Household setup, member management, billing, all data. |
| **Household Member** | An invited partner/family member who shares the joint financial picture and has their own allowance. | Shared views, own allowance, transaction capture. |
| **Prospective buyer** | Someone evaluating on the free tier or trial before subscribing. | Onboarding, free-tier value, trial, purchase. |
| **Product owner / operator (you)** | Runs the business: support, billing operations, server operations, roadmap. | Everything, plus operational NFRs and monetization. |
| **External assistant (Claude chat)** | Used out-of-band to parse bank statements into the import JSON schema. | Import contract (FR-IMP). |

Access is **role-based**: Owner/Admin (full control incl. billing & members) and Member (full financial access, no billing/member management). An optional **view-only** role is a candidate for later.

---

## 4. Scope

### 4.1 In Scope

**A. Product surfaces (existing, extended to households)**
- **Home — Shared Scoreboard:** household net worth, lane breakdown, trend, FI readout.
- **Budget — This workweek:** shared safe-to-spend with per-member allowances; monthly/yearly views; reconcile/import; transaction history.
- **Assets — Accounts & assets:** shared and member-tagged accounts and investment assets (incl. gold by grams × price).
- **Decide — What does this buy?:** spending lens, income/raise log, milestones.
- **More / Settings:** recurring register, allowance editors (per member), FI assumptions, categories, backup, **household & member management, subscription & billing, security**.

**B. New product capabilities (this BRD)**
- **Cloud accounts & authentication** (sign-up, sign-in, password reset, sessions).
- **Households as the tenant boundary** — create, invite/join, roles, remove/leave.
- **Shared joint finances** — combined net worth, budget, and FI goal across members.
- **Per-member allowances** within the shared budget.
- **Cloud sync & multi-device** — with offline capture and merge on reconnect.
- **Subscription & billing** — freemium free tier, paid household plan, trial, entitlement gating.
- **Staged rollout support** — the app must be usable by real, separate households (owner's, then a friend's) before public launch.

### 4.2 Out of Scope (for now)

- Direct bank / Open Banking integrations or automated statement fetch (import stays human-in-the-loop).
- Live market data / price feeds (asset values entered manually).
- Multi-currency (IDR only at launch).
- Public API, third-party integrations, or a web-admin back office beyond what operations require.
- Advisory / regulated financial advice — the app informs, it does not advise or execute.

---

## 5. Domain Concepts (shared language)

| Concept | Definition |
|---------|------------|
| **Household** | The tenant. One shared financial picture (net worth, budget, FI goal) owned by an Admin and shared with Members. All data is scoped to a household and isolated from every other household. |
| **Member** | An authenticated user who belongs to a household. Has full financial access and a personal allowance; may or may not manage billing/members depending on role. |
| **Lane** | Every account/asset/transaction is one of: **Income-Producing**, **Store of Value**, **Debt / Liability**, **Protected Living**. |
| **Pipe** | A "pay-yourself-first" recurring outflow into an income-producing asset (RDPU, DPLK), leaving the account before discretionary spend. |
| **Shared budget** | The household's monthly discretionary pool after pipes and bills. |
| **Personal allowance** | Each member's slice of the shared discretionary budget, with its own weekly safe-to-spend ceiling. |
| **Safe-to-spend** | A member's daily ceiling for the current workweek, derived from their allowance. |
| **FI target / Path A vs B** | The household's real-IDR FI goal band, and the two projection strategies (current blend held constant vs conservative→equity switch). |
| **Reconcile** | Periodic import + approval of transactions, which also snapshots household net worth for that month. |
| **Subscription / entitlement** | The household's paid status, which gates cloud/sharing features. |

---

## 6. Business Requirements (Functional)

### 6.1 Accounts & Authentication *(new)*
- **FR-ACC-1** — Users sign up and sign in with an authenticated account (email + password at minimum).
- **FR-ACC-2** — Support password reset, sign-out, and session management across devices.
- **FR-ACC-3** — A user may belong to a household; account identity is the basis for membership and billing.

### 6.2 Household & Membership *(new)*
- **FR-HH-1** — A user can create a household and becomes its Owner/Admin.
- **FR-HH-2** — An Admin can invite members (e.g. by email link/code); an invitee joins by accepting.
- **FR-HH-3** — Roles: **Admin** (full access + members + billing) and **Member** (full financial access, no billing/member management). View-only is a future candidate.
- **FR-HH-4** — An Admin can remove a member; a member can leave a household. Data authored within the household stays with the household.
- **FR-HH-5** — All financial data (accounts, assets, transactions, budgets, snapshots, milestones, assumptions) is scoped to exactly one household and never visible to another.

### 6.3 Shared Finances & Per-Member Allowance
- **FR-NW-1** — Household net worth = sum of all household accounts and assets, broken down by lane. Visible to all members.
- **FR-NW-2** — Net-worth trend from monthly household snapshots.
- **FR-NW-3** — Stale-valuation nudges (asset > 35 days; gold > 30 days).
- **FR-NW-4** — FI readout: projected household FI date, gap to target (low/high), household savings rate.
- **FR-AS-1** — Manage accounts (bank/wallet/cash), each with a lane; optionally attributable to a member or shared.
- **FR-AS-2** — Manage assets by type (RDPU, equity, gold by grams×price, DPLK, other).
- **FR-BU-1** — Compute the shared monthly discretionary budget (after pipes & bills), then each member's personal allowance and their own weekly safe-to-spend ceiling.
- **FR-BU-2** — Amber warning when a member is on pace to overspend their allowance, and when household committed items exceed income.
- **FR-BU-3** — Monthly and yearly household budget views (waterfall).
- **FR-BU-4** — Explicit "not configured" states; never a misleading number.
- **FR-BU-5** — All totals exclude internal transfers (incl. transfers between members' accounts) to avoid double counting.

### 6.4 Transaction Capture & Import
- **FR-TX-1** — Quick Log a single transaction (amount, direction, account, lane, note); attributed to the logging member.
- **FR-IMP-1..5** — Chat-assisted import: paste Claude-produced JSON; validate rows; detect duplicates (default not re-import); detect transfers across the household's own accounts; human review before an **atomic** commit (transactions + month snapshot + recurring due-date advances).
- **FR-TX-2** — Receipt override with preserved original amount + reason (audit trail).
- **FR-TX-3** — View household transaction history, filterable by member/account/lane.

### 6.5 Recurring, Income & FI Projection
- **FR-RC-1** — Household register of recurring items (pipes, bills, subs, other) with cadence, amount, lane, active/paused.
- **FR-IN-1** — Log income events per member (gross, take-home net, delta, routing to pipe vs lifestyle).
- **FR-IN-2** — Household savings rate = active pipe total ÷ household take-home net.
- **FR-FI-1..3** — Project years-to-FI and FI date for Path A and Path B from household FI-eligible assets, active pipes, and editable real-return/inflation/switch assumptions; report gap to target and Path B vs A savings.

### 6.6 Decision Support
- **FR-DE-1** — Spending lens: for an amount + lane, show % of take-home, days of budget, hours of life traded, and a lane verdict.
- **FR-DE-2** — Milestones surfaced by flag date, with status tracking.

### 6.7 Sync & Multi-Device *(new)*
- **FR-SY-1** — Household data syncs across all members' devices via the cloud backend.
- **FR-SY-2** — The app remains usable offline for capture (Quick Log) and read; changes sync and reconcile on reconnect.
- **FR-SY-3** — Concurrent edits by different members are merged predictably; conflicts resolve without silent data loss (last-writer-wins per field at minimum, with reconcile as the audited commit point for imports).

### 6.8 Subscription & Billing *(new)*
- **FR-BIL-1** — **Free tier:** single user, on-device/basic use, manual entry — no sharing, no cloud sync, no chat-assisted import.
- **FR-BIL-2** — **Paid Household plan:** cloud accounts + sync, multi-device, joint finances with up to *N* members, chat-assisted import, cloud backup. **Billed per household, not per seat.** Monthly and discounted annual options.
- **FR-BIL-3** — **Free trial** (14–30 days) of the Household plan on sign-up; converts to paid or downgrades to free on expiry.
- **FR-BIL-4** — Feature access is gated by household entitlement (trial / active / lapsed).
- **FR-BIL-5** — Admin can view plan, upgrade/downgrade, update payment method, and cancel; billing is Admin-only.
- **FR-BIL-6** — On cancellation/downgrade, household data is retained (read-only or export-only for a grace period) — never silently deleted.

### 6.9 Data Ownership & Portability
- **FR-BK-1** — Export a full JSON backup of the household's data on demand.
- **FR-BK-2** — Restore from a backup with version validation and a confirmation gate.

### 6.10 Security & Access *(elevated)*
- **FR-SE-1** — Account authentication is the primary access control; an optional device-local PIN adds a quick app lock on top.
- **FR-SE-2** — Data in the cloud is isolated per household and encrypted in transit and at rest; no household can read another's data.
- **FR-SE-3** — Sensitive credentials are never stored in plaintext; passwords are salted+hashed server-side.

---

## 7. Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NFR-1 **Data isolation & privacy** | Strict per-household tenancy; a member sees only their household. No cross-tenant leakage under any query. This is the top NFR now that we custody others' financial data. |
| NFR-2 **Security** | Auth, encryption in transit + at rest, hashed passwords, session expiry, and protection of the import/reconcile paths. Handle personal financial data responsibly (align with applicable Indonesian data-protection expectations, e.g. UU PDP). |
| NFR-3 **Offline-capable** | Capture and read work offline; sync reconciles on reconnect without data loss. |
| NFR-4 **Performance** | Reactive UI; sync and heavy matching (transfer detection) do not block interaction on a mid-range phone. |
| NFR-5 **Locale correctness** | Device-local (WIB, UTC+7) date handling; IDR formatting ("Rp 58.000 / Rp 2,5M / Rp 4,42B"). |
| NFR-6 **Integrity** | Atomic multi-part writes; imports never partially commit; sync merges are deterministic. |
| NFR-7 **Reliability & backups** | Server-side durability and backups so a household never loses its data; user-facing export as a secondary safeguard. |
| NFR-8 **Mobile-first UX** | Phone-first: bottom tabs, Quick Log FAB, bottom sheets, safe-area insets. |
| NFR-9 **Operability** | The operator can support users, run billing, and monitor the service at small scale (household test → friend → launch) without heavy ops burden. |

---

## 8. Go-to-Market / Phased Rollout

| Phase | Goal | Users | Gate to advance |
|-------|------|-------|-----------------|
| **P0 — Dogfood** | Prove the multi-user model works end-to-end. | The owner's own household (2+ real members, real money). | Two members share one picture, sync works across devices, weekly use sticks for several weeks. |
| **P1 — Friend beta** | Validate with a truly separate household + test data isolation, onboarding, and willingness to pay. | One friend's household (separate tenant). | Friend onboards themselves, finds real value, and would pay; no cross-tenant data issues; pricing hypothesis sharpened. |
| **P2 — Online launch** | Sell self-serve to the public. | Open sign-up. | Sign-up, invite, trial, subscribe, and support flows all self-serve; billing live; security/isolation hardened. |

The **free tier** and **trial** exist precisely to make P0→P1→P2 frictionless: the friend can start free, the owner isn't paywalled while dogfooding, and public users can try before buying.

---

## 9. Monetization (Recommended)

**Model: Freemium + per-household subscription.**

- **Free tier** — single user, on-device, manual entry. Mirrors today's app; the acquisition funnel and the friend's zero-friction entry point.
- **Paid "Household" plan** — cloud accounts + sync, multi-device, joint finances (up to *N* members), chat-assisted import, cloud backup. **Priced per household, not per seat.** Monthly + discounted annual. 14–30 day trial on sign-up.
- **Rationale:** a cloud backend and custody of real financial data are *recurring* costs → need *recurring* revenue (a one-time purchase can't sustain a server). Per-household pricing matches how couples budget and avoids double-charging partners. Freemium enables the staged rollout without paywalls in the way.
- **To validate in P1:** the price point, trial length, member cap *N*, and exactly which features sit above vs below the paywall.

*(Recommendation — confirm before it becomes a hard requirement.)*

---

## 10. Assumptions & Constraints

- **A-1** A household = a couple/family sharing one financial picture; the typical size is 2–4 members.
- **A-2** Import stays human-in-the-loop (paste statement into Claude chat, paste result back); no automated bank fetch.
- **A-3** Asset prices are entered manually; figures are only as fresh as the last update.
- **A-4** FI projections are estimates from user-set assumptions — directional, not guarantees.
- **A-5** The current codebase is **local-first with no server or auth**; delivering this BRD requires introducing a backend, authentication, multi-tenant storage, and sync (see § 12).
- **C-1** IDR only at launch.
- **C-2** Small-scale operation initially; the architecture and ops must be cheap to run for a handful of households before proving demand.
- **C-3** As custodian of others' financial data, we take on security, privacy, and support obligations we did not have as a single-user local app.

---

## 11. Success Metrics

| Metric | Intent |
|--------|--------|
| **Activation** | % of new households that add a 2nd member and reach a "live" state. |
| **Engagement** | Weekly-active households (reconcile + safe-to-spend checked). |
| **Data freshness** | Households with net worth/assets current (no lingering stale nudges). |
| **Trial → paid conversion** | % of trials that subscribe. |
| **Retention / churn** | Monthly retained households; churn rate. |
| **MRR** | Recurring revenue as the business signal. |
| **Behavioral (per household)** | Savings rate flat/rising after raises; FI date holding or moving earlier. |

---

## 12. Architecture Implications (for a future `ARCHITECTURE.md` revision)

This BRD breaks the two load-bearing assumptions of the current design — *single user* and *no server*. Realizing it requires:

- **Authentication & accounts** (currently only a device PIN).
- **A cloud backend** with **multi-tenant, per-household data isolation** (every entity gains a household scope; users↔households membership with roles).
- **Sync engine** between local storage and the server, with offline capture and deterministic conflict handling.
- **Billing/subscription** integration and entitlement gating.
- **Security & compliance** posture for custodied financial data (encryption, hashed secrets, isolation guarantees, data-protection alignment).

The existing lane model, engines (FI projection, safe-to-spend, savings rate), import/reconcile pipeline, and UI are **largely reusable** — they operate on data that can be re-scoped from "the device" to "the household." The net new work is auth, tenancy, sync, and billing. `ARCHITECTURE.md` must be revised before build.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Cross-tenant data leak** | Critical — trust-ending | Enforce household scoping at the data layer; test isolation explicitly in P1 (NFR-1). |
| **Security breach of financial data** | Critical | Encryption, hashed secrets, session hygiene, least-privilege backend (NFR-2). |
| **Scope explosion** (auth+backend+sync+billing all at once) | High — may never ship | Stage it: P0 can start with a thin backend for the owner's household; add billing before P2. Reuse existing engines/UI. |
| **Sync conflicts / data loss** | High | Deterministic merge, reconcile as audited commit point, server backups (NFR-6/7). |
| **Low willingness to pay** | High | Validate pricing in P1 before building full billing; freemium lowers entry. |
| **Ongoing server cost with few users** | Medium | Keep infra cheap at small scale; subscription funds it (C-2, § 9). |
| **Operator support/ops burden** | Medium | Keep flows self-serve; small-scale ops target (NFR-9). |
| **Import parsing errors** | Medium | Strict validation + human review before atomic commit (FR-IMP). |

---

*This BRD describes intended business behavior for the multi-user, cloud, subscription product. The current `ARCHITECTURE.md` reflects the single-user local app and must be revised (§ 12) before implementation. Monetization (§ 9) is a recommendation pending confirmation.*
