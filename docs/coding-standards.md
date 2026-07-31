# Coding Standards — FI Dashboard

**Last Updated:** 2026-07-27  
**Status:** Active conventions

---

## Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| Files | camelCase | `safeToSpend.ts`, `GaugeCard.tsx` |
| Components | PascalCase | `SafeToSpendScreen`, `GaugeCard` |
| Hooks | camelCase, `use` prefix | `useSafeToSpend`, `useNetWorth` |
| Repositories | camelCase, `.repo` suffix | `transactionsRepo`, `accountsRepo` |
| Types | PascalCase | `Transaction`, `SafeToSpendResult` |
| Constants | UPPER_SNAKE or camelCase | `SYNC_TABLES`, `formatRp` |
| CSS variables | kebab-case, `--` prefix | `--ink-1`, `--amber`, `--engine` |
| DB tables | snake_case (Postgres) | `net_worth_snapshots`, `recurring_items` |
| DB columns | snake_case | `household_id`, `updated_at` |

---

## Folder Conventions

```
src/
├── features/<domain>/    # Screen components by domain
│   ├── <Name>Screen.tsx  # Main screen component
│   └── <SubComponent>.tsx # Screen-specific components
├── components/           # Shared UI primitives
├── components/ui/        # Base UI kit (Card, Row, Icon, Amount, etc.)
├── hooks/                # Data hooks (liveQuery wrappers)
├── stores/               # Zustand slices (UI state only)
├── engine/               # Pure functions (no DB access)
├── db/
│   ├── types.ts          # All entity types (source of truth)
│   ├── db.ts             # Dexie singleton
│   └── repositories/     # One repo per entity group
├── lib/                  # Utilities (currency, dates, sync, etc.)
├── i18n/                 # types.ts + en.ts + id.ts
└── ai/                   # Chat tools, context, skills
```

**Rule:** New screen → `src/features/<domain>/<Name>Screen.tsx`. New shared component → `src/components/`. New utility → `src/lib/`.

---

## TypeScript Rules

1. **Strict mode** — `tsconfig.json` has `strict: true`
2. **No `any`** — Use proper types or `unknown` + type guards
3. **Explicit return types** on engine functions (public API)
4. **`interface` over `type`** for object shapes (except unions)
5. **Path aliases** — `@db/`, `@lib/`, `@stores/`, `@features/`, `@components/`, `@i18n/`, `@import/`, `@constants/`
6. **No enums** — Use string literal unions (`type Lane = 'income_producing' | ...`)

---

## React Patterns

### Component Structure
```tsx
// 1. Imports
import { useState } from 'react'
import { useSafeToSpend } from '@hooks/useSafeToSpend'

// 2. Props interface
interface GaugeCardProps {
  result: SafeToSpendResult
  lastLoggedDate?: string | null
}

// 3. Component
export function GaugeCard({ result, lastLoggedDate }: GaugeCardProps) {
  // Hooks first
  const [expanded, setExpanded] = useState(false)
  
  // Derived state
  const stale = lastLoggedDate ? daysSince(lastLoggedDate) > 3 : false
  
  // Render
  return <div>...</div>
}
```

### Rules
1. **Functional components only** — No class components
2. **Hooks at top** — No conditional hooks
3. **Destructure props** — Never `props.foo`
4. **Inline styles** — No CSS modules, no classnames
5. **CSS variables** — `var(--ink-1)`, `var(--amber)`, etc.
6. **No default exports** — Named exports only
7. **Screen components** — One per file, named `<Name>Screen`

---

## State Management

### Data State (Dexie + liveQuery)
```tsx
// Hook pattern
export function useSafeToSpend() {
  const result = useLiveQuery(async () => {
    const allowance = await db.allowance.get('local')
    const recurring = await db.recurringItems.filter(r => r.is_active).toArray()
    const spend = await transactionsRepo.getWeekSpend()
    return computeSafeToSpend({ allowance, recurring, spend, today: new Date() })
  })
  return { result }
}
```

### UI State (Zustand)
```tsx
// Store pattern — UI state only, no data
export const useAppStore = create<AppState>((set) => ({
  activeTab: 'budget',
  setTab: (t) => set({ activeTab: t }),
}))
```

### Rules
1. **No data in Zustand** — Data lives in Dexie, read via liveQuery
2. **No React Query** — Dexie liveQuery handles reactivity natively
3. **Repository writes only** — No component writes to Dexie directly
4. **Engine functions are pure** — Pass data in, get result out

---

## Error Handling

### Engine Layer
- Return `null` for null states (e.g., allowance not configured)
- Never throw — caller handles null
- Use `isNullState` flag in result type

### Repository Layer
- Wrap atomic operations in `db.transaction('rw', tables, async () => { ... })`
- Let Dexie errors propagate — caller logs + shows user-friendly message

### UI Layer
- Show loading state while `useLiveQuery` resolves
- Show empty state when data is null/empty
- Show error state with retry affordance
- Never show raw error messages — map to human copy

### AI Chat
- Map raw errors to friendly messages
- Provide retry button
- Never expose PostgREST/fetch internals to user

---

## Logging

- **No console.log in production code** — Use `console.error` for catch blocks only
- **No analytics/telemetry in v1** — Deferred to Phase D
- **Engine version logging** — `engine_version` on snapshots/exports (Phase A)
- **AI usage logging** — Per-household counters in proxy (Phase A)

---

## Testing Expectations

### Engine Tests (Golden Cases)
- **Location:** `src/engine/<name>.test.ts` or `src/engine/<name>.integration.test.ts`
- **Framework:** Vitest + fake-indexeddb
- **Coverage:** Every branch and boundary, not vanity count
- **Invariants:**
  - Integer rupiah rounding (no float anywhere in money path)
  - Pass-through & transfer exclusion from every aggregate
  - Negative pool handling
  - Week boundaries, month-end, leap year
  - Never-reaches-target case

### Integration Tests
- **Location:** `src/features/<name>/<name>.integration.test.ts`
- **Framework:** Vitest + fake-indexeddb
- **Scope:** Repository flows, import pipeline, sync mappers

### Component Tests
- **Location:** Co-located with component
- **Framework:** @testing-library/react
- **Scope:** Minimal — screen-level smoke tests

### RLS Isolation Tests
- **Location:** `supabase/tests/rls_isolation_test.sql`
- **Framework:** SQL assertions in CI
- **Scope:** Cross-tenant leakage = launch blocker

### Rules
1. **Engine tests are mandatory** — No engine change without test
2. **248 pre-existing biome errors** — Do not fix untouched files
3. **No new biome errors** in touched files
4. **Run `npx vitest run`** before claiming done

---

## Performance Practices

1. **Engine functions <100ms** — Asserted in tests
2. **Dashboard interactive <500ms** — On cached data
3. **Sync push+pull <2s** — On reconnect
4. **10k-row import <30s** — Validated in import pipeline
5. **Web Workers for heavy work** — Transfer detector is O(n²), off main thread
6. **No unnecessary re-renders** — Use `useMemo` for expensive computations
7. **Dexie indexes** — Query by indexed fields (date, account_id, lane)
8. **Rolling cache** — 24-month transaction window, older data server-fetched on demand

---

## Money Handling

### Rules
1. **Integer rupiah everywhere** — `number` in TS, `BIGINT` in Postgres
2. **No floats in money paths** — Use `Math.floor` / `Math.round` explicitly
3. **Format via `formatRp`** — `src/lib/currency.ts`
4. **`formatRpFull`** — Exact rupiah (panels where numbers must reconcile)
5. **`formatRp`** — Abbreviated M/B (headline numbers only)
6. **Never divide money** — Use `Math.floor(amount / divisor)` to avoid fractions
7. **Positive amounts** — `direction` field indicates sign ('in' | 'out')

### Example
```ts
// ✅ Correct
const weekly = Math.floor(monthly / weeks)
const today = Math.floor(remainingPool / remainingWorkdays)

// ❌ Wrong
const weekly = monthly / weeks  // Float!
const today = remainingPool / remainingWorkdays  // Float!
```

---

## i18n

### Structure
```ts
// src/i18n/types.ts — interface
export interface Translations {
  nav: { spend: string; assets: string; report: string; more: string }
  budget: { title: string; subtitle: string; ... }
  report: { title: string; subtitle: string; ... }
  // ...
}

// src/i18n/en.ts — English (source of truth)
export const en: Translations = { nav: { spend: 'Spend', ... }, ... }

// src/i18n/id.ts — Bahasa Indonesia (structurally complete)
export const id: Translations = { nav: { spend: 'Belanja', ... }, ... }
```

### Rules
1. **Add keys to all three files** — `types.ts`, `en.ts`, `id.ts` in lockstep
2. **English is source of truth** — Product copy in English
3. **Bahasa Indonesia must typecheck** — Translate naturally, no stubs
4. **Use `t.section.key`** — Via `useI18n()` hook
5. **No hardcoded strings** — Everything goes through i18n

---

## Git Conventions

### Commit Messages
```
feat(v2): T0 — resolve category names on seed import
fix(sync): handle null updated_at on pulled rows
refactor(engine): extract weeksInMonth to @lib/dates
docs: add architecture.md v2.0
test(engine): add golden case for negative pool boundary
```

### Rules
1. **One commit per task** — PLAN-V2-RESTRUCTURE.md tasks are atomic
2. **Prefix:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
3. **Scope in parens:** `(v2)`, `(sync)`, `(engine)`, `(ui)`
4. **English only** — Per CLAUDE.md project rules

---

## Do and Don't

### ✅ Do
- Use path aliases (`@db/`, `@lib/`, etc.)
- Write engine tests before merging
- Use `formatRp` / `formatRpFull` for all money display
- Handle null states explicitly (no crashes)
- Use CSS variables for theming
- Keep engine functions pure (no Dexie access)
- Write atomic repository operations

### ❌ Don't
- Write to Dexie from components (use repositories)
- Put business logic in components or SQL policies
- Use floats for money calculations
- Fix pre-existing biome errors in untouched files
- Add new dependencies without justification
- Use `any` type
- Hardcode strings (use i18n)
- Create default exports
- Use CSS frameworks (inline styles + CSS variables)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-27 | 1.0 | Initial documentation generated |
