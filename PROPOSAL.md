# FI Dashboard — Production Rebuild Proposal
**Version:** 1.1 · **Date:** 2026-07-07 · **Status:** Approved (§5); v1.1 incorporates external staff-engineer review (triage in §4)
**Contains:** (1) Architecture proposal · (2) Threat model · (3) Phased build plan · (4) Review triage · (5) Sign-off record

---

## 0. Ground truth: what already exists

This is not a greenfield start. The repo already contains:

| Artifact | State |
|---|---|
| `BRD.md` v2.0 | Multi-tenant household product direction — matches this rebuild's mission |
| `BACKEND.md` v1.0 | Backend design: Supabase, household tenancy, RLS, sync, billing |
| `supabase/migrations/` (5 files) | **Applied to live project** `lanvhaliejwuazqerbvp` — tenancy core, RLS policies, all domain tables, `import_batch` + household RPCs, function hardening |
| `tests/rls_isolation_test.sql` | Passing — cross-tenant isolation verified with real queries |
| `src/` (Vite + React + Dexie) | Working client: engines (FI projection, safe-to-spend, savings rate), import pipeline, screens |

**Decision this proposal makes:** keep and extend this foundation rather than rewrite. The "retired" design is the *no-server, single-user* posture — that is already retired by the P0 backend. What remains is closing the gaps between the current state and this brief's requirements (listed in §1.6).

---

## 1. Architecture proposal

### 1.1 Stack — one justified deviation from the brief

| Layer | Brief recommends | Proposal | Justification |
|---|---|---|---|
| Backend/data | Supabase, RLS-first | **Supabase (as built)** | Already live, RLS tested |
| Frontend | Next.js + shadcn/ui | **Vite + React 19 PWA (as built)** + Tailwind | See below |
| Hosting | Vercel, staging/prod | **Vercel static hosting**, separate staging + prod Supabase projects | Same operational result |

**Why not Next.js:** the entire app sits behind auth — there is zero SEO/SSR benefit. The domain engines are client-side pure functions by design (server stays a scoped datastore, per `BACKEND.md` §1), sync is offline-first via a Dexie cache + outbox, and the PWA install path matters for daily phone use. A Next.js rewrite would cost weeks, discard a working import pipeline and engine layer, and buy nothing the product needs. The brief's real requirements — mobile-first, distinctive design system, production quality — are framework-independent. If a marketing/landing site is needed at launch (P2), *that* can be Next.js on Vercel, separate from the app.

### 1.2 Tenancy & auth flow

- **Unit of tenancy = household.** `households` / `memberships` (admin|member) / `invites` (code-based, expiring) — implemented.
- Every domain row carries `household_id`; RLS via recursion-safe `SECURITY DEFINER` helpers `auth_household_ids()` / `is_household_admin()` — implemented and tested.
- **Auth:** Supabase Auth. Email/password + Google OAuth. **MFA: enable Supabase TOTP MFA as an opt-in setting; enforce via an `aal2` check in RLS for billing-mutation and member-management paths** (new work).
- Sign-up flow: register → `create_household()` RPC (creator becomes admin) → optional invite partner by code → member `accept_invite()`. Both RPCs exist.
- A single user may belong to multiple households (schema supports it); UI exposes a household switcher only if ever needed — not v1 surface.

### 1.3 Lanes — mapping the four-lane framework (principle #7)

Existing lanes: `income_producing` (asset), `store_of_value` (asset/preserve), `debt_liability` (liability), `protected_living` (expense/maintain). Income and expense are captured by transaction `direction` + category lane.

**Gap: no pass-through lane.** Fix (migration): add lane value **`pass_through`** to the lane check constraints on `accounts`, `categories`, `transactions`. Engine rules:
- Pass-through flows are **excluded from net worth, savings rate, safe-to-spend, and FI projection**.
- Reports show them in a separate "Titipan / pass-through" section so the money is still trackable and reconcilable.
- Lane assignment is user-configurable per category and per account, as the brief requires.

### 1.4 Protected categories (principle #5) & the seven principles in the data model

- `is_protected boolean` already exists on `accounts`, `categories`, `recurring_items`.
- **Hard rule, enforced in the engine layer, not just UI:** no computation that produces a "reduce/cut" suggestion may take protected categories as input. Since v1 has no recommendation engine at all (principle #4 — facts only), the enforcement point is: reports may *display* protected spending but every trade-off calculation (FI-date delta, safe-to-spend) treats protected outflows as fixed constants.
- **Savings-first waterfall (#1):** `recurring_items.kind = 'pay_yourself_first'` sits at the top of the monthly outflow order; safe-to-spend = income − PYF − protected/recurring − envelopes, never "leftover → savings".
- **No sell UI (#2):** `assets` are valued snapshots only; there is no disposal/sell mutation in any RPC or screen. Enforced by omission + code-review rule.
- **Amber-inform (#3):** design-token level — the semantic "over budget / low balance" color is amber (`design-system.html` to codify); no red alarm token exists for money states. Copy guidelines: state the fact + percentage, never imperative verbs.
- **Tracking vs optimizing separation (#6):** navigation keeps Reconcile/Reports (what happened) and Decide/FI (planning) as separate top-level surfaces — already the screen structure.

### 1.5 Budgets, reports, FI tracker, import — schema fit

- **Budgets:** `envelopes` (weekly/monthly/yearly horizon, `target_amount`, per `period`) + category→envelope link. Covers "per category, per period". Alert thresholds computed client-side from transactions.
- **Reports & net worth:** `transactions` indexed on `(household_id, date)`; `net_worth_snapshots` per household-month with `by_lane` breakdown. Custom ranges, category breakdown, MoM trend are client queries over the Dexie cache.
- **FI tracker:** `assumptions` (per household): target range, per-asset-class real return rates, inflation. Projection engine already exists client-side; **the assumptions screen must render the math** (contribution schedule, compounding formula, rates used) — principle "show the math" becomes an acceptance criterion, not a new table.
- **Import contract (documented):** JSON/CSV rows `{date, amount (integer IDR), direction (in|out), account, category, note}` → client validator → transfer detector → reviewed batch → `import_batch` RPC (single transaction, RLS-enforced). Contract doc to be published as `IMPORT-CONTRACT.md`.
- **Allocation report (approved 2026-07-07):** a **Reports menu entry showing a pie/donut of spending allocation by category**, with a **weekly / monthly / yearly** period filter and prev/next period navigation. Rules: outflows only; transfers and `pass_through` excluded; protected categories shown with a badge (displayed, never singled out for cutting — principle #5); over-budget slices use the amber-inform token, never red; small slices collapse into "Other" with drill-down list beneath the chart; empty state designed ("no spending recorded this period"). Pure client-side query over the transactions cache — no schema change needed.

### 1.6 Gap list — the actual new build (delta vs. what's live)

| # | Gap vs. this brief | Type |
|---|---|---|
| G1 | `pass_through` lane (§1.3) | Migration + engine |
| G2 | **Audit log** — immutable append-only `audit_log` table (see §2.5) | Migration + triggers |
| G3 | **MFA** (TOTP opt-in, `aal2` on sensitive paths) | Auth config + RLS |
| G4 | **UU PDP surface:** server-side export RPC (full household JSON) + `delete_household()` / account-deletion RPC with cascade, plus privacy notice | Migration + client |
| G5 | Client cutover: Dexie becomes cache; outbox/pusher/puller sync (`BACKEND.md` §5) | Client, biggest chunk |
| G6 | Auth UI, household onboarding, invite flow screens | Client |
| G7 | Staging environment (2nd Supabase project + Vercel preview env) | Ops |
| G8 | CI: RLS isolation tests + `rowsecurity=true` meta-assert on every migration | Ops |
| G9 | Budget alert UX (amber-inform), empty/loading/error states pass | Client/design |
| G10 | Dependency audit + documented update cadence | Ops |
| G11 | **Allocation pie-chart report** (§1.5) — weekly/monthly/yearly filter by spending category | Client |
| G12 | **AI Manager remediation** — findings from `AI-MANAGER-UX-AUDIT.md` (verdict-prompt fix, protected-category guardrail, proxy hardening, confirm-flow gaps, account-filter bug) | Prompt + client + Edge Function |

### 1.7 Sync conflict resolution (v1.1)

`BACKEND.md` §5 named LWW; this pins it down fully:

- **Server is authoritative and stamps `updated_at`** on every write (trigger, already in migration 0005) — client clocks never decide ordering, so clock drift is irrelevant to conflicts.
- **Granularity: row-level last-write-wins.** Field-level merge and CRDTs are deliberately rejected: the realistic concurrency is a 2-person household, and every conflict-prone entity (budget amount, balance override, assumption) is a small row where "the later edit is the intent" is correct. The worked example — Phone A sets budget 5M, Phone B offline sets 4M, B reconnects later — resolves to **4M**, and the audit log (G2) preserves both writes so nothing is silently lost.
- **Idempotent retries:** client-generated UUIDs + upsert semantics; replaying the outbox after a dropped connection cannot duplicate rows. `import_batch` is atomic per call and safe to retry only after checking its returned count (client keeps a per-batch idempotency key).
- **Deletes:** soft-delete where the model supports it; otherwise the `deletions` tombstone log wins over a concurrent edit (delete-beats-update).
- **No conflict-resolution UI in v1** — a deliberate scope cut, revisit only if audit-log review shows real households hitting overwrites.

### 1.8 Financial engine: correctness & versioning (v1.1)

- **Versioning:** add `engine_version` (semver of `src/engine/`) to `net_worth_snapshots` and to every export envelope; FI projection outputs displayed in-app carry the version + assumption values used, so an old screenshot can always be explained by "computed under v1.2 with 3% inflation". Migration in Phase A.
- **Test suite:** the engines are already pure functions — Phase A adds a golden-case suite as an exit criterion: savings-rate, FI projection (incl. never-reaches-target, switch-month boundaries), safe-to-spend (negative pool, week boundaries), recurring cadence advancement (month-end, leap year), pass-through & transfer exclusion from every aggregate, and integer-rupiah rounding invariants (no float anywhere in a money path). Target is *coverage of every branch and boundary*, not a vanity count.

### 1.9 Household lifecycle (v1.1)

The schema already supports the mechanics (role transfer via `memberships.role`, admin-revocable membership); this defines the policy:

| Event | Handling |
|---|---|
| Member leaves / is removed (incl. divorce/breakup) | Admin revokes membership → RLS cutoff is immediate. **Household data stays with the household** (it's the household's ledger); the departing member may take a personal data export first. Documented in ToS. |
| Household split | Export + create new household + selective re-import. No automated ledger-split in v1 — genuinely hard, genuinely rare. |
| Admin transfer | `transfer_admin` RPC (admin-only, audit-logged) — Phase B. |
| Admin dies / disappears | Support-assisted promotion of a remaining member after identity verification; documented runbook, not self-serve. |
| Last member deletes account | Equivalent to household deletion (G4 cascade). |

### 1.10 Timezone, data classification, client-side limits (v1.1)

- **Timezone policy:** all business dates are **civil dates** (`DATE` columns — already true for transactions/recurring). Week/month boundaries and "today" are computed in the **household timezone** (new `households.timezone`, default `Asia/Jakarta`); `TIMESTAMPTZ` is for audit/ordering only. A member traveling abroad still sees the household's month-end, not their hotel's.
- **Data classification:** `financial` (amounts, balances) · `personal` (category names, notes — can reveal medical/religious/political spending) · `credential` (none stored beyond auth). Classification is documented in the privacy notice and drives any future field-encryption decision; v1 mitigation stays minimization + RLS.
- **PWA storage quota:** local Dexie cache keeps a rolling window (24 months of transactions); older data is server-fetched on demand. Chat images are never persisted into history (audit C3). Cache eviction failure degrades to online-only, never to data loss — server is the source of truth after Phase B.

### 1.11 Vendor exit strategy (v1.1)

The schema is plain Postgres (`pg_dump` portable); RLS policies and RPCs are standard SQL; the only Supabase-proprietary surfaces are Auth (mitigated: email list exportable, passwords re-set on a new provider — standard practice) and two small Edge Functions (portable Deno). Realtime is unused until Phase D. Exit cost is measured in days, not months; acceptable, documented, revisited only if Supabase pricing/terms shift.

---

## 2. Threat model

### 2.1 Assets at risk
Complete household financial positions (net worth, income, spending patterns, FI goals), auth credentials, invite codes, (P2) billing/customer identifiers. No bank credentials, card numbers, or account numbers are stored — data minimization by design.

### 2.2 Realistic attackers & blast radius

| Attacker | Vector | Blast radius | Primary mitigations |
|---|---|---|---|
| **Curious/malicious other tenant** | Crafted PostgREST queries, ID guessing, RPC abuse | One household's data → all households if RLS fails | RLS on every table (meta-asserted), `with check` on writes, UUIDv4 ids, isolation tests in CI as launch blocker |
| **Credential stuffer / phisher** | Reused passwords on login | One household (full read/write) | Supabase Auth rate limiting, breached-password protection, opt-in TOTP MFA (G3), audit log of auth events |
| **Malicious or estranged ex-member** | Still-valid session/membership after household breakup | Their former household | Admin-revocable memberships (immediate RLS cutoff — no cached server authz), audit log of reads-by-RPC and all mutations, invite expiry |
| **Device thief / shoulder-surfer** | Unlocked phone with PWA session | One household | Local PIN lock (device-only, never a server credential), Supabase session refresh-token rotation, remote sign-out via password change |
| **Attacker with leaked anon key** | Anon key is public by design | Nothing beyond what RLS grants an unauthenticated user: **zero rows** (no `anon` policies exist) | Verified by advisor scan; keep zero-anon-access invariant in CI test |
| **Attacker with leaked service-role key** | Key in client bundle / repo / CI logs | **Everything, every household** | Service key never in client or repo; server-side only (Edge Functions env); secret scanning; rotation runbook |
| **Supply chain (npm)** | Malicious dependency exfiltrating from client | Sessions/data of users who load the compromised build | Lockfile + `npm audit`/Dependabot cadence (G10), minimal dependency surface, no third-party scripts/analytics in v1 |
| **Operator error (me)** | Bad migration, dropped RLS, wrong project | Up to everything | Staging project first (G7), PITR/backups, migration CI gate (G8), MCP/CLI applies only via migration files |
| **Insider at Supabase / infra subpoena** | Direct DB access | Everything | Accepted residual risk for v1; documented in privacy notice. Field-level encryption of notes is a possible P2+ hardening, deliberately not v1 (kills reporting queries) |
| **Authenticated user abusing the AI proxy** | `anthropic-proxy` forwards client-chosen `model`/`max_tokens`/payload verbatim on the shared Anthropic key | Entire API budget; key usable for unrelated workloads | Server-side pin of model + system prompt + tools, clamp `max_tokens`, per-user daily budget counter, per-household usage logging (audit §2.5) — see `AI-MANAGER-UX-AUDIT.md` D1 |

### 2.3 What a breach costs
This is sensitive-but-not-catastrophic data: no money can be moved (no bank APIs, no execution — non-goals), no identity documents are held. The realistic worst case is **privacy harm** (a household's full financial position exposed) and **trust destruction** for the product. That calibrates spend: RLS correctness and key hygiene get maximal effort; exotic hardening (client-side field encryption, HSMs) is not v1.

### 2.4 UU PDP alignment (Indonesia PDP Law)

| Obligation | Implementation |
|---|---|
| Lawful basis | Contractual necessity (the service *is* storing your finance data) + consent at sign-up; documented in privacy notice (G4) |
| Data subject access/portability | Existing client `BackupEnvelope` export + server-side full-household JSON export RPC (G4) |
| Right to deletion | `delete_household()` cascade + Supabase auth user deletion; hard-delete, documented retention: backups age out ≤30 days (PITR window) |
| Breach notification capability | Audit log (§2.5) + Supabase auth/API logs give who/what/when to reconstruct scope within the 3×24-hour notification window |
| Data minimization | No bank account numbers, no ID numbers, no contacts access; email + display name are the only PII |

### 2.5 Audit log design (G2)
`audit_log(id, household_id, actor uuid, action text, table_name text, row_id uuid, diff jsonb, at timestamptz)` in a separate schema (`audit`), **insert-only**: no UPDATE/DELETE grants to any API role, populated by `AFTER` triggers on domain tables + explicit inserts from auth-sensitive RPCs (invite, accept, role change, billing change, export, deletion request). Members can read their own household's log (transparency doubles as the couple-trust feature); nobody can rewrite it.

---

## 3. Phased build plan

Honest sizing. "Weekend" = 1–2 focused days; "week+" = multi-session, needs testing discipline. Phases map to BRD §8 / BACKEND.md §9.

**v1.1 gating rule (review §5, point 1):** heavy investment follows validation, not the other way around. Phases 0–C serve the dogfooding household and cost little beyond what data-safety demands; Phases D and E are **gated on the KPIs in §3.7** — no billing subsystem gets built for a product nobody uses weekly.

### Phase 0 — Validation baseline *(running now, zero build)*
The current app, used daily by my own household. **Exit (gates Phase D):** 30 consecutive days of real use — transactions current, weekly reconcile done, safe-to-spend consulted before discretionary purchases. If the four-lane workflow doesn't survive 30 days of my own usage, the roadmap stops and the product question reopens before any compliance/billing investment.

### Phase A — Security & compliance hardening *(≈1 weekend + review)*
Backend-only, before any new UI. G1 pass-through lane (incl. AI tool `LANE_ENUM` + prompt update) · G2 audit log + triggers · G4 export/delete RPCs · G8 CI gate (isolation test + rowsecurity meta-assert on every migration) · G7 staging Supabase project · G12 proxy hardening (model/token allowlist, budget, usage log — audit D1). *Pre-Phase-A quick fixes from the audit: verdict-prompt rewrite (A1), protected-category guardrail (A2), account-filter bug (C1).* v1.1 additions: `engine_version` on snapshots/exports (§1.8) · `households.timezone` (§1.10) · **engine golden-case test suite in CI** (§1.8). **Exit:** advisor clean, isolation tests green in CI, engine suite green, threat-model mitigations for tenant-isolation and operator-error rows all in place.

### Phase B — Client cutover to cloud (the big one) *(2–3 weeks)*
G5 sync layer: outbox, pusher, pull-on-open puller, deletion tombstones — per the conflict rules in §1.7 · G6 auth screens, household creation/invite/join onboarding · `transfer_admin` RPC (§1.9) · local→cloud migration of existing single-user data (BACKEND.md §8). *(G3 MFA moved to Phase D — protects strangers' data, not needed for my own household — review §5 point 1.)* **Exit:** my own household (2 users, 2 phones) runs entirely on cloud data; offline entry still works; no Dexie-only writes remain.

### Phase C — Product completeness *(1–2 weeks)*
G9 budget alerts with amber-inform pattern · reports polish (custom ranges, MoM, category breakdown) · **G11 allocation pie-chart report (weekly/monthly/yearly by spending category)** · FI tracker "show the math" screen · `IMPORT-CONTRACT.md` + CSV path hardening · G12 AI Manager UX fixes (partial approval, discarded-pending notice, stop button, HEIC/size handling, chat dedupe, error styling — audit §5 list) · empty/loading/error states pass across all screens · design-system codification.

### Phase D — Friend beta *(gated on Phase 0 exit; ~1–2 weeks build)*
Real second tenant onboards · Realtime pull (P1 sync) · G3 MFA opt-in · manual entitlement flag (no payments yet) · dependency audit + update cadence doc (G10) · privacy notice published · client error reporting (Sentry) + sync-failure/import-success counters (§3.7) · backup **restore drill** performed once. **Exit:** two unrelated households, zero cross-tenant incidents, KPI gate in §3.7 met.

### Phase E — Public launch *(gated on Phase D KPIs; honest estimate **3–4 weeks**, billing is a subsystem)*
Xendit billing: recurring invoices, **idempotent webhook handling** (duplicate/replayed events), failed-payment retry + **grace period** (14 days, then read+export mode — never data loss), cancellation timing (paid-through end of period), refund runbook (manual, not self-serve, v1), proration deliberately avoided (single plan) · entitlement gating with race-safe checks (entitlement read inside the RPC, not client-cached) · VAT/invoice fields per Indonesian requirements — tax advice sought before launch, not improvised · support/ops runbook · rate/payload limits on public endpoints (§3.7) · optional marketing site.

### §3.7 Ops & measurement (v1.1)

- **Disaster recovery:** RPO = 24h minimum (daily backups; PITR on paid tier tightens this to minutes at Phase E). RTO = 4h, drilled: restore to a scratch project, run the engine test suite + row-count/balance checksums against the restore, documented as a runbook. Covers "developer drops prod" and "migration corrupts balances" (pre-migration snapshot + checksum diff is part of the migration runbook from Phase A).
- **Observability (right-sized per phase):** Phase 0–C: Supabase dashboard logs + advisor. Phase D: Sentry on the client, counters for sync-failure rate, import success rate, AI turn failures, RPC p95. Phase E: alerting on webhook failures and error-rate spikes. No tracing stack for <1k users.
- **Performance budgets (regression guards in CI where testable):** dashboard interactive <500ms on cached data · sync push+pull <2s on reconnect · 10k-row import <30s · FI projection <100ms (pure function — asserted in the engine suite).
- **Cost model (order of magnitude at 100 households):** Supabase Pro $25/mo · Vercel hobby/pro $0–20 · dominant variable is **AI usage**: ~Rp 300–800 per chat turn at Sonnet pricing → the per-user daily budget (audit D1) is also the cost ceiling; at 100 households ≈ **$75–150/mo total**, which bounds the floor of viable subscription pricing (≥Rp 30–50k/household/mo before margin).
- **KPIs (phase gates):** Phase 0 → 30-day continuous own-household use. Phase D → both households weekly-active for 8 weeks; import completion rate >90%; zero cross-tenant incidents; median sync <2s. Phase E go/no-go → friend household says they would pay; trial→paid conversion target set before launch, not after.
- **Abuse controls (dishonest-but-authenticated clients):** AI proxy budget (audit D1) · `import_batch` payload cap (rows + JSON size, enforced in the RPC) · Supabase auth rate limits on sign-in/sign-up · CAPTCHA deferred unless abuse observed.

### Standing rules for every phase
1. Schema changes only via migration files; applied to staging first.
2. A failing RLS isolation test is a hard stop.
3. Money is integer rupiah `BIGINT`, everywhere, forever.
4. The seven design principles are acceptance criteria in every UI review.

---

## 4. External review triage (v1.1, 2026-07-07)

A staff-engineer-level review raised 20 points. Disposition of each; ✅ = accepted (where it landed), ◐ = partially accepted, ✗ = rejected/deferred with rationale.

| # | Point | Disposition |
|---|---|---|
| 1 | Scale before PMF | ✅ Phase 0 validation gate added; MFA moved B→D; Phases D/E gated on KPIs (§3.7). Note: the review's own points 4/10/13/19 pull the other way — resolved by phase-gating them. |
| 2 | Sync conflicts unspecified | ◐ LWW was specified in `BACKEND.md` §5, but underspecified — now pinned down in §1.7 (server-stamped LWW, idempotent retries, delete-beats-update, no merge UI by design). |
| 3 | Calculation versioning | ✅ §1.8 — `engine_version` on snapshots + exports, Phase A migration. Genuinely missing before. |
| 4 | Finance engine tests | ◐ Accepted as Phase A exit criterion (§1.8 golden-case suite over pure functions). "500+ tests" rejected as a vanity metric — branch/boundary coverage is the bar. |
| 5 | DR beyond backups | ✅ §3.7 — RPO/RTO, restore drill, migration checksum runbook. |
| 6 | Import assumes clean data | ◐ Deliberate v1 posture: the **AI chat path is the messy-statement adapter** (screenshots → extraction → review), the CSV contract is normalized-input by design. Dedupe hashing accepted (audit C4). Bank-specific adapters deferred until real users' banks are known — building adapters pre-PMF is point 1's mistake. |
| 7 | AI hallucinated advice | ✅ Explicit AI safety policy (can/cannot) added to `AI-MANAGER-UX-AUDIT.md` §2 and folded into the A1 prompt rewrite. |
| 8 | Household lifecycle | ✅ §1.9 — genuinely missing. Divorce/death/split/admin-transfer policies defined; automated ledger split explicitly out of scope. |
| 9 | Timezones | ✅ §1.10 — civil dates + household timezone (`Asia/Jakarta` default). |
| 10 | Observability | ◐ Right-sized per phase (§3.7): Sentry + 4 counters at Phase D, alerting at E. Full metrics/tracing rejected for <1k users. |
| 11 | Billing underestimated | ✅ Phase E re-scoped to 3–4 weeks with webhook idempotency, grace period, cancellation timing, VAT; refunds manual, proration avoided via single plan. Still gated on beta validation. |
| 12 | Audit log growth | ◐ Retention added (24-month online, then archive to storage). Partitioning rejected: at 100 households this is ~10⁵ rows/yr, not 10⁷. |
| 13 | Performance targets | ✅ §3.7 budgets, engine latency asserted in tests. |
| 14 | Accessibility | ✅ Added to UI bar: WCAG AA contrast, keyboard nav, screen-reader labels; charts (incl. G11 pie) never encode meaning by color alone — pairs with the amber-inform principle. |
| 15 | Sensitive-data classification | ✅ §1.10 classification tiers; drives future encryption decisions; v1 stays minimization + RLS. |
| 16 | PWA storage limits | ✅ §1.10 rolling 24-month cache window, server as source of truth. |
| 17 | Vendor lock-in | ✅ §1.11 exit paragraph. |
| 18 | Product KPIs | ✅ §3.7 phase-gate KPIs. |
| 19 | Cost model | ✅ §3.7 — AI usage is the dominant variable and bounds pricing floor. |
| 20 | Honest-client assumption | ✅ §3.7 abuse controls; proxy budget was already audit D1. |
| — | Domain-layer recommendation | ✗ Already the architecture: `src/engine/` is exactly the proposed Financial Domain Engine (pure functions, no DB access), with repositories between it and persistence (`ARCHITECTURE.md` §1). Affirmed as a standing rule: **no business rule may live in a component or a SQL policy.** |

---

## 5. Sign-off record — **all four decisions approved 2026-07-07**
1. **Stack:** accept keeping Vite+React PWA (§1.1) instead of Next.js rewrite? yes
2. **Pass-through lane** as a 5th lane value vs. a boolean flag on categories? *(Recommended: lane value — it flows through every engine exclusion consistently)* yes
3. **Audit-log visibility:** household members can read their own household's audit trail? *(Recommended: yes — transparency feature)* yes
4. **Deletion retention:** hard delete + ≤30-day backup age-out acceptable as the documented UU PDP answer? *(Recommended: yes for v1)* yes
