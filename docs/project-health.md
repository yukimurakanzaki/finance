# Project Health Audit — FI Dashboard

**Last Audit Date:** 2026-07-27  
**Auditor:** Hermes Agent

---

## 1. Architecture Quality — **8/10**

### Strengths
- **Clear separation of concerns:** Engine (pure logic) → Repositories (persistence) → Hooks (reactivity) → Components (UI).
- **Engine purity:** Business logic is isolated from UI and DB, enabling rigorous testing.
- **Robust data model:** `src/db/types.ts` is strongly typed and Maps cleanly to Postgres.
- **Thoughtful sync design:** Outbox/pusher/puller with LWW is right-sized for a 2-person household.

### Weaknesses / Risks
- **Sync layer is incomplete:** The jump from single-user local to cloud sync is large and partially built (`src/lib/sync.ts`).
- **AI proxy vulnerability:** Currently accepts arbitrary model/tokens from client, posing a cost/abuse risk. (Phase A fix planned).

---

## 2. Documentation Quality — **9/10**

### Strengths
- **Comprehensive:** Complete suite covering architecture, product vision, decisions, and coding standards.
- **Business context:** `Vision.txt` and `BRD.md` provide exceptional "why" context.
- **Agent-ready:** `CLAUDE.md`, `HERMES.md`, and `docs/session.md` explicitly support multi-agent workflows.

### Weaknesses / Risks
- **Maintenance burden:** Multiple docs need updating when architecture shifts. The single-source-of-truth must be rigorously maintained.

---

## 3. Maintainability — **7/10**

### Strengths
- **Type safety:** Strict TypeScript across the stack.
- **Design system:** UI uses a limited set of tokens and components (no wild CSS).
- **No magic frameworks:** React + Vite + Dexie is a stable, easily understood stack.

### Weaknesses / Risks
- **248 Biome errors:** Pre-existing lint errors in untouched files reduce signal-to-noise ratio during development. (Mitigation: only check touched files).
- **Complex UI components:** Files like `PLAN-V2-RESTRUCTURE.md` show that screens like `ReportScreen` have complex derived state.

---

## 4. Testing Maturity — **8/10**

### Strengths
- **Golden tests:** 23 pure-function engine tests cover critical money-math boundaries.
- **RLS isolation tests:** SQL tests exist for the most critical backend risk.

### Weaknesses / Risks
- **Zero E2E tests:** High reliance on manual testing for critical paths like import and reconcile.
- **Integration coverage:** Sync mappers have some tests, but outbox/puller flows lack automated coverage.

---

## 5. Security & Safety — **7/10**

### Strengths
- **Integer rupiah:** Eliminates rounding/floating-point risks.
- **RLS enforcement:** Tenant isolation pushed to the database level.
- **AI Safety policy:** Strong guardrails against financial advice and protected category modification.

### Weaknesses / Risks
- **Import validation gaps:** Chat-assisted import needs deduplication protection and strict schema validation before atomic commit.
- **Proxy cost boundary:** Needs immediate hardening (Phase A) before any real usage.

---

## Technical Debt & Code Smells

| Smell | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| `category_id: null` on manual logging | `QuickLogFAB.tsx` | Report screen data gaps | T0 backfill helps; needs permanent UI fix |
| Gold-staleness dismiss bug | `AssetsScreen.tsx` | Nudge won't dismiss | Keep as low-priority known issue |
| Biome lint errors (248) | Cross-repo | Noise | Dedicate a `chore` sprint or continue ignoring |
| Duplicate `Tab` type (fixed in T2) | `appStore.ts` / `TabBar.tsx` | State bugs | Ensure T2 in `PLAN-V2-RESTRUCTURE.md` is complete |

---

## Recommended Improvements (Next 30 Days)

1. **Execute Phase A:** Immediately harden the AI proxy (allowlist, budget, logging) and implement `pass_through` lane.
2. **Complete Sync Cutover (Phase B):** Finish the outbox/puller logic and execute the local-to-cloud migration script.
3. **Finish Restructure:** Complete `PLAN-V2-RESTRUCTURE.md` T0-T8 to simplify the app to 4 tabs.
4. **Harden Import:** Add dedupe hashing to chat import (Phase C) to protect the ledger.
