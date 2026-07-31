# Architectural Decisions — FI Dashboard

**Last Updated:** 2026-07-27  
**Status:** Active record of significant decisions, trade-offs, and technical debt

---

## ADR-001: Vite+React PWA over Next.js

**Date:** 2026-07-07  
**Status:** Approved  
**Deciders:** PO + external staff-engineer review

### Context
The brief recommended Next.js + shadcn/ui. The existing codebase is Vite + React 19 PWA.

### Decision
Keep Vite + React 19 PWA. Do not rewrite.

### Justification
- **Zero SEO/SSR benefit** — entire app sits behind auth
- Domain engines are client-side pure functions (server stays scoped datastore per BACKEND.md §1)
- Sync is offline-first via Dexie cache + outbox
- PWA install path matters for daily phone use
- Next.js rewrite would cost weeks, discard working import pipeline and engine layer, buy nothing the product needs
- If marketing/landing site needed at launch (P2), *that* can be Next.js on Vercel, separate from app

### Trade-offs
- ❌ No SSR/SSG for marketing pages (acceptable — separate concern)
- ✅ Faster iteration, existing test suite preserved, no rewrite risk

---

## ADR-002: Dexie over React Query

**Date:** 2026-06 (original architecture)  
**Status:** Approved

### Context
Need reactive data layer for local-first PWA.

### Decision
Use Dexie 4 with `useLiveQuery` for all data queries. No React Query.

### Justification
- Data is local/synchronous — no network cache invalidation complexity
- `useLiveQuery` fires on any write to observed tables (zero-boilerplate reactive queries)
- IndexedDB persistence built-in
- Upgrade path to cloud sync via outbox/pusher/puller (Dexie becomes cache)

### Trade-offs
- ❌ No built-in optimistic updates for remote data (must implement manually in sync layer)
- ✅ Simpler mental model, no dual source of truth

---

## ADR-003: Zustand for UI State Only

**Date:** 2026-06  
**Status:** Approved

### Context
Need global state management for cross-component UI state (active tab, PIN lock, reconcile flow).

### Decision
Zustand for ephemeral UI state only. No data in Zustand.

### Justification
- Data lives in Dexie (single source of truth via liveQuery)
- Zustand stores: `appStore` (tab/modals), `pinStore` (lock state), `reconcileStore` (flow state), `chatStore` (turn state), `authStore` (session)
- Avoids dual source of truth (Dexie + Zustand both holding transactions)

### Trade-offs
- ❌ Can't use Zustand devtools for data inspection (use Dexie devtools instead)
- ✅ Clear separation: UI state vs data state

---

## ADR-004: Supabase for Backend

**Date:** 2026-07-04 (BACKEND.md v1.0)  
**Status:** Approved

### Context
Need multi-tenant backend with auth, data isolation, sync. BRD v2.0 §12 requires breaking "single user, no server" posture.

### Decision
Supabase (managed Postgres + Auth + Realtime + Edge Functions).

### Justification
- Provides three risky primitives (tenant isolation, auth, sync) without hand-rolling
- RLS is the isolation boundary (tested, not assumed)
- PostgREST for CRUD + Realtime for deltas (P1+)
- Edge Functions for atomic import RPC + billing webhooks
- Managed backups / PITR

### Trade-offs
- ❌ Vendor lock-in (mitigated — schema is plain Postgres, exit cost measured in days)
- ❌ Supabase Auth is proprietary (mitigated — email list exportable, passwords re-settable)
- ✅ Faster time-to-market, battle-tested isolation primitives

---

## ADR-005: LWW Sync over CRDTs

**Date:** 2026-07-07 (PROPOSAL.md §1.7)  
**Status:** Approved

### Context
Need conflict resolution strategy for multi-device sync.

### Decision
Row-level last-write-wins. Server stamps `updated_at` on every write. No conflict-resolution UI in v1.

### Justification
- Realistic concurrency is 2-person household
- Every conflict-prone entity (budget amount, balance override, assumption) is a small row where "the later edit is the intent" is correct
- Field-level merge and CRDTs deliberately rejected: over-engineered for the use case
- Worked example: Phone A sets budget 5M, Phone B offline sets 4M, B reconnects later → resolves to 4M
- Audit log preserves both writes (nothing silently lost)

### Trade-offs
- ❌ No field-level merge (acceptable — row-level sufficient)
- ❌ No conflict UI (revisit only if audit-log review shows real households hitting overwrites)
- ✅ Simple, predictable, server-authoritative

---

## ADR-006: Integer Rupiah Everywhere

**Date:** 2026-06 (original architecture)  
**Status:** Approved (standing rule)

### Context
Money representation.

### Decision
All money is integer rupiah (`BIGINT` in Postgres, `number` in TypeScript). No floats, no cents. Format via `formatRp` in `@lib/currency`.

### Justification
- IDR has no fractional unit in practice (sen obsolete)
- Avoids floating-point rounding errors
- Simplifies engine calculations (no `Math.round` noise)
- Consistent across client and server

### Trade-offs
- ❌ Can't represent sub-rupiah amounts (not needed for IDR)
- ✅ No rounding bugs, simpler math

---

## ADR-007: Pure Engine Functions

**Date:** 2026-06  
**Status:** Approved (standing rule)

### Context
Where should business logic live?

### Decision
Engine layer (`src/engine/`) contains pure functions. No Dexie access. No side effects. Consumers pass data in; engine returns result.

### Justification
- Testable in isolation (golden test suite)
- No hidden dependencies
- Clear separation: engines compute, repositories persist, components render
- Standing rule: **no business rule may live in a component or a SQL policy**

### Trade-offs
- ❌ Callers must fetch data before calling engine (minor overhead)
- ✅ Pure functions, trivially testable, no surprise side effects

---

## ADR-008: Inline Styles over CSS Framework

**Date:** 2026-06  
**Status:** Approved

### Context
Styling approach for mobile-first PWA.

### Decision
Inline styles + CSS variables (`src/index.css`). No CSS framework in production code (Tailwind in devDeps but unused).

### Justification
- Mobile-first, distinctive design system
- CSS variables for theming (`--ink-1`, `--amber`, `--engine`, `--debt`, `--bg-0`, etc.)
- Inline styles co-locate style with component (no CSS file hunting)
- No class-name collision risk
- Design tokens codified in `design-system.html`

### Trade-offs
- ❌ No utility-class shortcuts (more verbose)
- ❌ Harder to do responsive breakpoints (use JS `matchMedia` if needed)
- ✅ Self-contained components, no global CSS pollution

---

## ADR-009: AI Safety Policy

**Date:** 2026-07-07 (AI-MANAGER-UX-AUDIT.md §2)  
**Status:** Approved

### Context
AI chat feature uses Anthropic API. What can the AI do?

### Decision
**AI may:** explain/summarize household numbers, classify/extract transactions, surface trade-offs as numbers, look up published prices with cited sources, ask clarifying questions.

**AI may not:** recommend buying/selling investments, issue affordability verdicts, suggest cutting protected categories, give tax/legal advice, invent prices/figures not in data or cited source.

### Justification
- Product principle #4: facts over recommendations
- Product principle #5: protected categories are untouchable
- Regulatory risk: no financial advice
- Trust: users rely on the AI for accurate numbers, not opinions

### Enforcement Layers
1. Prompt rules (system prompt)
2. Tool surface (no sell/liquidate/reallocate tool exists)
3. Confirm card (every write is human-approved)
4. Periodic transcript spot-checks during dogfooding

---

## ADR-010: Phased Rollout with Validation Gates

**Date:** 2026-07-07 (PROPOSAL.md §3)  
**Status:** Approved

### Context
How to de-risk the multi-user, cloud, subscription product?

### Decision
Phased rollout: P0 (dogfood) → P1 (friend beta) → P2 (public launch). Each phase has explicit exit gates. Heavy investment follows validation, not the other way around.

### Phase Gates
- **P0 → P1:** 30 consecutive days of real use (transactions current, weekly reconcile done, safe-to-spend consulted)
- **P1 → P2:** Two unrelated households weekly-active for 8 weeks; import completion rate >90%; zero cross-tenant incidents
- **P2 go/no-go:** Friend household says they would pay; trial→paid conversion target set before launch

### Justification
- Avoid building billing subsystem for product nobody uses weekly
- De-risk: prove value in own household → friend → market
- Freemium + trial make progression frictionless

---

## Technical Debt Register

| ID | Description | Impact | Mitigation | Phase |
|----|-------------|--------|------------|-------|
| TD-001 | 248 pre-existing biome lint errors | Low (cosmetic) | Documented, do not fix untouched files | N/A |
| TD-002 | ARCHITECTURE.md v1.0 says "no server" but Supabase exists | Medium (confusing) | docs/architecture.md v2.0 supersedes it | Done |
| TD-003 | Sync layer partially implemented (outbox/pusher/puller incomplete) | High (blocks Phase B) | PLAN-V2-RESTRUCTURE.md focuses on UI; sync is separate Phase B work | Phase B |
| TD-004 | Gold-staleness dismiss bug (HomeScreen.tsx) | Low (cosmetic) | PLAN-V2-RESTRUCTURE.md Finding 9: preserve as-is, out of scope | Future |
| TD-005 | `category_id: null` on manual/QuickLog transactions | Medium (Report screen incomplete data) | PLAN-V2-RESTRUCTURE.md T0 back-fills seeded data; future UI for category assignment | Future |
| TD-006 | AI proxy accepts arbitrary model/max_tokens from client | High (cost blast radius) | AI-MANAGER-UX-AUDIT.md D1: server-side allowlist + budget + usage log | Phase A |
| TD-007 | No E2E tests | Medium (manual QA burden) | Deferred until Phase D (friend beta) | Phase D |

---

## Assumptions

1. **Household size:** 2–4 members typical (A-1 in BRD)
2. **Import stays human-in-the-loop:** No automated bank fetch (A-2)
3. **Asset prices entered manually:** Figures only as fresh as last update (A-3)
4. **FI projections are estimates:** User-set assumptions, directional not guarantees (A-4)
5. **IDR only at launch:** No multi-currency (C-1)
6. **Small-scale operation initially:** Architecture must be cheap for handful of households (C-2)
7. **Honest clients:** Dishonest-but-authenticated clients mitigated via AI proxy budget + import payload cap + auth rate limits (PROPOSAL §3.7)

---

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Cross-tenant data leak | Critical | Low | RLS + isolation tests in CI (launch blocker) |
| Security breach of financial data | Critical | Low | Encryption, hashed secrets, session hygiene, least-privilege backend |
| Scope explosion (auth+backend+sync+billing all at once) | High | Medium | Phased rollout, reuse existing engines/UI |
| Sync conflicts / data loss | High | Low | LWW, idempotent retries, server backups |
| Low willingness to pay | High | Medium | Validate pricing in P1 before building full billing |
| Ongoing server cost with few users | Medium | High | Keep infra cheap at small scale; subscription funds it |
| AI hallucinated advice | Medium | Medium | AI safety policy (ADR-009), enforcement layers, transcript spot-checks |
| Vendor lock-in (Supabase) | Medium | Low | Plain Postgres schema, exit cost measured in days |

---

## Unknowns

1. **Willingness to pay:** Price point, trial length, member cap N, feature paywall — validate in P1
2. **Real-world sync conflicts:** Will 2-person households actually hit LWW overwrites? Monitor audit log post-launch
3. **AI usage cost at scale:** ~Rp 300–800 per chat turn at Sonnet pricing → bounds pricing floor
4. **Indonesian PDP compliance depth:** Legal input before P2 (data protection obligations for stored financial data)
5. **Bank-specific import adapters:** Deferred until real users' banks are known (building adapters pre-PMF is premature)

---

## TODOs

- [ ] Complete sync layer (outbox/pusher/puller) — Phase B
- [ ] Implement MFA (TOTP opt-in, `aal2` on sensitive paths) — Phase D
- [ ] Build billing subsystem (Xendit integration) — Phase E
- [ ] Add E2E test suite — Phase D
- [ ] Codify design system tokens in `design-system.html` — Phase C
- [ ] Publish `IMPORT-CONTRACT.md` — Phase C
- [ ] Implement `pass_through` lane (G1) — Phase A
- [ ] Build audit log + triggers (G2) — Phase A
- [ ] Harden AI proxy (D1) — Phase A

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-27 | 1.0 | Initial documentation generated |
