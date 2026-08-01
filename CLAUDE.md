# FI Dashboard — Project Context

Personal project (household finance app), NOT BAF work. Overrides from the vault CLAUDE.md:

- **Language: everything in English** — docs, plans, specs, commit messages. BAF language rules (Bahasa for FSD/user stories/emails) do not apply here.
- BAF terminology (BE, BRD sign-off, Jira workflows, BOSS) does not apply.
- Workflow is unchanged: Claude thinks (plans, specs, critique), Cline/Hermes build from plan .md files.

## Product

One job: answer "how much can I safely spend today / this week / this month?" from the spending bucket, plus assets position and category spend report. Decision filter for any new feature: does it make Safe To Spend more accurate, more trustworthy, or more useful?

Design invariants (never violate):
- Savings-first waterfall; safe-to-spend computed after savings/bills/protected pools
- Facts, not advice — show consequences, never "don't buy"
- Amber informs, never red-alarms (exception: over-bucket bars in reports)
- Protected categories are untouchable; no sell UI
- Money = integer rupiah (BIGINT); format via `formatRp` in `@lib/currency`

## Stack

Vite + React 19 + Dexie (local-first) syncing to Supabase (project `lanvhaliejwuazqerbvp`, RLS everywhere, LWW sync in `src/lib/sync.ts`). Engine in `src/engine/` with golden tests (`npx vitest run` — 256 passing, 0 failing as of 2026-07-31). Inline styles + CSS variables, no CSS framework. ~220 pre-existing biome lint errors — do not fix untouched files.

Key docs: PROPOSAL.md (architecture decisions), `docs/plans/2026-07-25-sprint-1-builder-brief.md` (current work), AI-MANAGER-UX-AUDIT.md, Vision.txt. `PLAN-V2-RESTRUCTURE.md` and `BACKLOG.md` are historical — the phases they describe have all shipped.

## Architecture Summary

**Local-first PWA. Client-side pure-function engines → Repository layer (Dexie) → React hooks (liveQuery) → UI components.**

Supabase provides multi-tenant backend with RLS-based household isolation. Sync via outbox/pusher/puller (LWW, server-stamped).

See `docs/architecture.md` for full system overview, Mermaid diagrams, module details, and extension points.

### Layer Stack (top → bottom)
1. **UI Layer** — `src/features/*/` + `src/components/`
2. **Hooks Layer** — `src/hooks/` (liveQuery wrappers)
3. **Store Layer** — `src/stores/` (Zustand, UI state only)
4. **Repository Layer** — `src/db/repositories/` (atomic Dexie writes)
5. **Engine Layer** — `src/engine/` (pure functions, no DB access)
6. **Dexie Layer** — `src/db/db.ts` (IndexedDB singleton)
7. **Sync Layer** — `src/lib/sync.ts` (outbox/pusher/puller to Supabase)
8. **Backend** — `supabase/migrations/` (Postgres + RLS + Edge Functions)

### Key Rule
**No business rule may live in a component or a SQL policy.** Engines compute, repositories persist, components render.

## Folder Responsibilities

| Folder | What goes here |
|--------|----------------|
| `src/features/<domain>/` | Screen components by domain |
| `src/components/` | Shared UI primitives |
| `src/components/ui/` | Base UI kit (Card, Row, Icon, Amount) |
| `src/hooks/` | Data hooks (liveQuery wrappers) |
| `src/stores/` | Zustand slices (UI state only) |
| `src/engine/` | Pure functions (no DB, no side effects) |
| `src/db/types.ts` | All entity TypeScript types (source of truth) |
| `src/db/db.ts` | Dexie singleton + schema versions |
| `src/db/repositories/` | One repo per entity group (atomic writes) |
| `src/lib/` | Utilities (currency, dates, sync, crypto) |
| `src/i18n/` | types.ts + en.ts + id.ts (lockstep updates) |
| `src/ai/` | Chat tools, context, skills, models |
| `src/import/` | Import pipeline (parser, validator, seeder) |
| `src/workers/` | Web Workers (transferDetector) |
| `supabase/migrations/` | SQL schema migrations (applied to live project) |
| `supabase/functions/` | Edge Functions (anthropic-proxy) |
| `docs/` | Project documentation (architecture, decisions, standards) |

## Commands

```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # tsc -b && vite build
npm run preview      # Preview production build

# Testing
npx vitest run       # Run all tests (engine golden suite + integration)
npx vitest run --reporter=verbose  # Verbose output

# Linting
npx biome lint src   # Lint only (~220 pre-existing — don't fix untouched files)
npx biome check src  # Lint + format. Reports ~408 on a Windows checkout: the extra
                     # ~188 are CRLF line endings from core.autocrlf=true with no
                     # .gitattributes, not code problems. Prefer `biome lint` for signal.
npx tsc --noEmit     # Type check (use during development for faster feedback)

# Supabase
# Migrations applied via Supabase CLI or dashboard
# RLS isolation tests: supabase/tests/rls_isolation_test.sql
```

## Development Workflow

1. **Read context:** `CLAUDE.md` → `docs/architecture.md` → `docs/coding-standards.md` → relevant plan doc
2. **Check current state:** `git status` + `git branch` → read `docs/session.md` for latest handoff
3. **Understand task:** Read referenced Findings in plan docs before writing code
4. **Implement:** Make changes through `patch`/`write_file`. Match existing style.
5. **Verify:**
   - `npx tsc --noEmit` clean
   - `npx vitest run` green
   - `npx biome lint src` — no NEW errors in touched files
6. **Commit:** One commit per task. Message: `feat(v2): T{n} — {summary}` (or `fix`, `refactor`, `docs`, `test`)
7. **Update session:** Update `docs/session.md` with what changed, why, what remains

## Testing Workflow

### Engine Tests (Golden Cases)
- Location: `src/engine/<name>.test.ts` or `.integration.test.ts`
- Framework: Vitest + fake-indexeddb
- Coverage: Every branch and boundary (not vanity count)
- Invariants: integer rupiah rounding, pass-through/transfer exclusion, negative pool, week/month boundaries, never-reaches-target

### Run Tests
```bash
npx vitest run                              # All tests
npx vitest run src/engine                   # Engine tests only
npx vitest run src/engine/safeToSpend       # Specific engine
```

### RLS Isolation Tests
- Location: `supabase/tests/rls_isolation_test.sql`
- Run in CI against seeded DB with two households
- **A failing RLS isolation test is a hard stop** (launch blocker)

## Review Checklist

Before claiming work is done:

- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` green (existing tests untouched, new tests pass)
- [ ] `npx biome lint src` — no NEW errors in touched files (~220 pre-existing are out of scope)
- [ ] No floats in money paths (integer rupiah everywhere)
- [ ] No business logic in components or SQL policies
- [ ] No hardcoded strings (use i18n — add to `types.ts`, `en.ts`, `id.ts` in lockstep)
- [ ] No default exports
- [ ] No `any` type
- [ ] No writes to Dexie from components (use repositories)
- [ ] Null states handled (no crashes on missing data)
- [ ] CSS variables used for colors (no hardcoded hex except in `index.css` definitions)
- [ ] Design invariants preserved (savings-first, facts-not-advice, amber-inform, protected untouchable)
- [ ] Commit message follows convention: `feat(v2): T{n} — {summary}`
- [ ] `docs/session.md` updated

## Definition of Done

A task is done when:
1. Code compiles (`npx tsc --noEmit` clean)
2. Tests pass (`npx vitest run` green)
3. No new lint errors (`npx biome lint src` — touched files only)
4. Task verification steps pass (from plan doc)
5. Commit is clean (one commit per task, conventional message)
6. `docs/session.md` is updated

## Do Rules

- Use path aliases (`@db/`, `@lib/`, `@stores/`, `@features/`, `@components/`, `@i18n/`, `@import/`, `@constants/`)
- Write engine tests before merging engine changes
- Use `formatRp` / `formatRpFull` for all money display
- Handle null states explicitly (no crashes)
- Use CSS variables for theming (`var(--ink-1)`, `var(--amber)`, `var(--engine)`, `var(--debt)`)
- Keep engine functions pure (no Dexie access, no side effects)
- Write atomic repository operations (`db.transaction('rw', tables, async () => { ... })`)
- Match existing inline-style idiom; reuse existing components
- Add i18n keys to all three files (`types.ts`, `en.ts`, `id.ts`) in lockstep
- One commit per task

## Don't Rules

- Don't write to Dexie from components — use repositories
- Don't put business logic in components or SQL policies
- Don't use floats for money calculations — integer rupiah everywhere
- Don't fix pre-existing biome errors in untouched files (~220 known)
- Don't add new dependencies without justification
- Don't use `any` type — use proper types or `unknown` + type guards
- Don't hardcode strings — use i18n
- Don't create default exports — named exports only
- Don't use CSS frameworks — inline styles + CSS variables
- Don't use React Query — Dexie liveQuery handles reactivity
- Don't put data in Zustand — data lives in Dexie
- Don't fix the gold-staleness dismiss bug (PLAN-V2-RESTRUCTURE.md Finding 9 — preserve as-is)
- Don't touch `src/engine/*`, sync, Supabase, migrations, AI proxy unless task explicitly requires it

## Key Documentation

| Document | Purpose | When to read |
|----------|---------|--------------|
| `CLAUDE.md` (this file) | Project context, commands, rules | Every session start |
| `docs/architecture.md` | System overview, modules, data flow | Before architecture changes |
| `docs/decisions.md` | ADRs, trade-offs, technical debt | Before changing architectural decisions |
| `docs/coding-standards.md` | Naming, patterns, testing, money handling | Before writing code |
| `docs/product.md` | Vision, workflows, business rules | Before product/feature decisions |
| `docs/session.md` | Latest session handoff | Every session start |
| `docs/project-health.md` | Quality scores, risks, improvements | Before refactoring |
| `docs/ai-workflow.md` | Hermes/Claude Code collaboration | Before cross-agent work |
| `PROPOSAL.md` | Architecture proposal + threat model + phased plan | Before Phase A-E work |
| `docs/plans/2026-07-25-sprint-1-builder-brief.md` | Current work (Sprint 1, tasks 2-5 open) | Before starting a task |
| `PLAN-V2-RESTRUCTURE.md` | Historical — the T0-T8 restructure has shipped | Context only |
| `AI-MANAGER-UX-AUDIT.md` | AI chat audit findings | Before AI chat changes |
| `BACKEND.md` | Backend architecture spec | Before backend/Supabase work |
| `BRD.md` | Business requirements | Before product decisions |
| `Vision.txt` | Product vision, philosophy, principles | Before feature design |
