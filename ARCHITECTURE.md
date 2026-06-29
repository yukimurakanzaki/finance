# FI Dashboard — Architecture, Schema & API Contract
**Version:** 1.0 · **Date:** June 2026  
**Stack:** React 19 + Vite + Tailwind + Dexie 4 · PWA · Local-first · No server

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  UI LAYER  (React components / screens)                         │
│  src/features/*/  +  src/components/                            │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Home    │ │  Budget  │ │ Reconcile│ │  Decide  │  …        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │  liveQuery  │  liveQuery  │             │ liveQuery
┌───────▼─────────────▼─────────────▼─────────────▼──────────────┐
│  HOOKS LAYER  src/hooks/  +  Zustand stores  src/stores/        │
│                                                                 │
│  useNetWorth()  useWorkweek()  useSafeToSpend()  usePinLock()   │
│  useReconcile() useDecisionLens() useRaiseTracker()             │
└───────┬──────────────────────────────────┬───────────────────────┘
        │ read (liveQuery)                  │ write (repository fns)
┌───────▼──────────────────────────────────▼───────────────────────┐
│  REPOSITORY LAYER  src/db/repositories/                          │
│                                                                  │
│  accounts.repo  assets.repo  transactions.repo  recurring.repo   │
│  envelopes.repo  snapshots.repo  income.repo  settings.repo      │
│                                                                  │
│  All writes go through repositories. No component writes to      │
│  Dexie directly. Repositories own atomic transaction boundaries. │
└───────┬──────────────────────────────────┬───────────────────────┘
        │                                  │
┌───────▼───────────────┐   ┌──────────────▼───────────────────────┐
│  ENGINE LAYER         │   │  IMPORT PIPELINE                     │
│  src/engine/          │   │  src/import/                         │
│                       │   │                                      │
│  fiProjection.ts      │   │  parser.ts → validator.ts            │
│  safeToSpend.ts       │   │       ↓                              │
│  savingsRate.ts       │   │  [Web Worker] transferDetector.ts    │
│  returnRates.ts       │   │       ↓                              │
│                       │   │  transactions.repo.importBatch()     │
│  Pure functions.      │   │  (atomic: txns + snapshot + dues)    │
│  No Dexie access.     │   │                                      │
│  No side effects.     │   │                                      │
└───────────────────────┘   └──────────────────────────────────────┘
        │                                  │
┌───────▼──────────────────────────────────▼───────────────────────┐
│  DEXIE LAYER  src/db/                                            │
│                                                                  │
│  schema.ts  (version map + upgrade callbacks)                    │
│  db.ts      (singleton Dexie instance)                           │
│  types.ts   (all TypeScript entity types)                        │
│                                                                  │
│  IndexedDB  ·  Local device  ·  No network                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  ZUSTAND  (ephemeral UI state only — never data)                 │
│                                                                  │
│  pinStore        — locked / unlocked / attempt count             │
│  reconcileStore  — in-progress flag, parsed rows, step           │
│  appStore        — active tab, modal stack, install banner       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  WEB WORKERS  src/workers/                                       │
│                                                                  │
│  transferDetector.worker.ts   — O(n²) matching, off main thread  │
│  (fiProjection runs sync — dataset too small to need a worker)   │
└──────────────────────────────────────────────────────────────────┘
```

### Key architectural decisions

| Decision | Choice | Reason |
|---|---|---|
| Data reactivity | Dexie `liveQuery` | Zero-boilerplate reactive queries; fires on any write to observed tables |
| Global state | Zustand (thin slices) | UI state only. No data in Zustand — avoids dual source of truth |
| No React Query | — | Data is local/synchronous. RQ adds cache invalidation complexity that Dexie liveQuery handles natively |
| Engine functions | Pure functions, no Dexie | Testable in isolation. Consumers pass data in; engine returns result |
| Repositories | One file per entity group | Clear write boundary. Atomic Dexie transactions live here, nowhere else |
| Workers | Inline blob URL | No extra bundler config. `transferDetector` is the only heavy computation |
| No server | — | No auth, no sync, no network dependency. Backup = JSON export |

---

## 2. Module Structure

```
src/
├── constants/
│   ├── lanes.ts          # Lane enum + label map
│   ├── accountTypes.ts   # AccountType enum
│   └── recurringKinds.ts # RecurringKind enum
│
├── db/
│   ├── db.ts             # Dexie singleton (export default db)
│   ├── schema.ts         # Version declarations + upgrade callbacks
│   ├── types.ts          # All entity TypeScript types (source of truth)
│   └── repositories/
│       ├── accounts.repo.ts
│       ├── assets.repo.ts
│       ├── transactions.repo.ts
│       ├── categories.repo.ts
│       ├── envelopes.repo.ts
│       ├── recurringItems.repo.ts
│       ├── allowance.repo.ts
│       ├── snapshots.repo.ts
│       ├── incomeEvents.repo.ts
│       ├── milestones.repo.ts
│       ├── assumptions.repo.ts
│       └── settings.repo.ts
│
├── engine/
│   ├── fiProjection.ts   # FI date, gap-to-goal, savings rate
│   ├── safeToSpend.ts    # Waterfall + daily ceiling
│   ├── savingsRate.ts    # Monthly savings rate
│   └── returnRates.ts    # Asset type → real return constant map
│
├── import/
│   ├── parser.ts         # Raw JSON/CSV → ParseResult
│   ├── validator.ts      # Per-row field validation
│   ├── schema.ts         # ImportRow type + field contracts
│   └── transferDetector.worker.ts  # Web Worker
│
├── stores/
│   ├── pinStore.ts       # PIN lock state
│   ├── reconcileStore.ts # Reconcile flow state
│   └── appStore.ts       # Tab, modals, install banner
│
├── hooks/
│   ├── useNetWorth.ts
│   ├── useWorkweek.ts
│   ├── useSafeToSpend.ts
│   ├── useSavingsRate.ts
│   ├── useFIProjection.ts
│   ├── useStoragePersist.ts
│   └── useGoldStaleness.ts
│
├── workers/
│   └── transferDetector.ts  # Worker logic (imported by parser via blob)
│
├── features/
│   ├── home/
│   │   ├── HomeScreen.tsx
│   │   ├── NetWorthHero.tsx
│   │   ├── LaneBreakdown.tsx
│   │   └── FIReadout.tsx
│   ├── budget/
│   │   ├── BudgetScreen.tsx       # Segment control router
│   │   ├── weekly/
│   │   │   ├── SafeToSpendScreen.tsx
│   │   │   ├── GaugeCard.tsx
│   │   │   ├── DayDots.tsx
│   │   │   └── Waterfall.tsx
│   │   ├── monthly/
│   │   │   ├── MonthlyScreen.tsx
│   │   │   └── EnvelopeList.tsx
│   │   └── yearly/
│   │       └── YearlyScreen.tsx
│   ├── reconcile/
│   │   ├── ReconcileEntryScreen.tsx
│   │   ├── ReconcileConfirmScreen.tsx
│   │   ├── ReconcileRow.tsx
│   │   └── ReconcileToolbar.tsx
│   ├── assets/
│   │   ├── AssetsScreen.tsx
│   │   ├── AccountList.tsx
│   │   └── AssetList.tsx
│   ├── decide/
│   │   ├── DecideScreen.tsx
│   │   └── SpendingLens.tsx
│   ├── more/
│   │   ├── MoreScreen.tsx
│   │   ├── RaiseTracker.tsx
│   │   ├── Milestones.tsx
│   │   ├── RecurringRegister.tsx
│   │   └── BackupRestore.tsx
│   └── onboarding/
│       ├── OnboardingWizard.tsx
│       ├── TakeHomeStep.tsx
│       ├── AssetsStep.tsx
│       ├── PipesStep.tsx
│       └── AllowanceStep.tsx
│
├── components/
│   ├── QuickLogFAB.tsx
│   ├── QuickLogSheet.tsx
│   ├── PinLockScreen.tsx
│   ├── PinSetupScreen.tsx
│   ├── TabBar.tsx
│   ├── AmberBanner.tsx
│   ├── LanePill.tsx
│   ├── Toast.tsx
│   └── BottomSheet.tsx
│
├── lib/
│   ├── currency.ts       # IDR formatting: formatRp(n) → "Rp 58.000"
│   ├── dates.ts          # ISO week arithmetic, workday count
│   ├── crypto.ts         # PIN hashing (SHA-256 + salt)
│   └── storage.ts        # navigator.storage.persist() wrapper
│
├── App.tsx               # Router + tab shell
├── main.tsx              # Entry: PWA register, storage persist, PIN guard
└── vite-env.d.ts
```

---

## 3. Database Schema

### 3.1 TypeScript Entity Types (`src/db/types.ts`)

```typescript
// ─── Enums ──────────────────────────────────────────────────────────────────

export type Lane =
  | 'income_producing'
  | 'store_of_value'
  | 'debt_liability'
  | 'protected_living';

export type AccountType = 'bank' | 'digital_wallet' | 'cash';

export type RecurringKind =
  | 'pay_yourself_first'
  | 'household_bill'
  | 'personal_sub'
  | 'other';

export type TransactionSource = 'manual' | 'claude_import' | 'csv_import';

export type AssetType =
  | 'investment_rdpu'
  | 'investment_equity'
  | 'gold'
  | 'dplk'
  | 'storyforge'
  | 'other';

export type EnvelopeHorizon = 'yearly' | 'monthly' | 'weekly';

export type MilestoneStatus = 'pending' | 'triggered' | 'done' | 'skipped';

export type Cadence = 'monthly' | 'weekly' | 'yearly' | 'one_off';

// ─── Account ─────────────────────────────────────────────────────────────────

export interface Account {
  id?: number;                  // auto-increment primary key
  name: string;                 // e.g. "BCA Tabungan"
  institution: string;          // e.g. "BCA", "blu", "GoPay"
  account_type: AccountType;
  lane: Lane;
  currency: string;             // default 'IDR'
  is_protected: boolean;
  is_active: boolean;
  // Cash / wallet: stored balance when no transaction history exists
  manual_balance_override: number | null;
  // Timestamp of last manual_balance_override update
  last_balance_updated_at: string | null; // ISO 8601
  created_at: string;           // ISO 8601
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export interface Asset {
  id?: number;
  name: string;                 // e.g. "Reksadana RDPU", "Gold 37g"
  lane: Lane;
  asset_type: AssetType;
  // Computed value stored for display (derived from qty × price for gold)
  value: number;                // IDR
  // Gold-specific fields
  quantity_grams: number | null;
  price_per_gram: number | null;
  last_valued_at: string;       // ISO 8601 — triggers staleness indicator > 30 days
  note: string | null;
  created_at: string;
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export interface Transaction {
  id?: number;
  date: string;                 // ISO date YYYY-MM-DD (device local, no UTC conversion)
  amount: number;               // always positive; direction indicates sign
  direction: 'in' | 'out';
  account_id: number;           // FK → Account.id
  category_id: number | null;   // FK → Category.id (nullable pre-Phase 2)
  lane: Lane;
  source: TransactionSource;
  note: string | null;
  // Receipt override audit trail (US-14)
  original_amount: number | null;
  overridden_amount: number | null;
  override_note: string | null;
  overridden_at: string | null;  // ISO 8601
  // Transfer auto-collapse (US-15)
  is_transfer: boolean;
  transfer_pair_id: string | null; // shared UUID between matched pair
  created_at: string;
}

// ─── Category ────────────────────────────────────────────────────────────────

export interface Category {
  id?: number;
  name: string;
  lane: Lane;
  is_protected: boolean;
  envelope_id: number | null;   // FK → Envelope.id (null pre-Phase 2 envelopes)
}

// ─── Envelope (Budget) ───────────────────────────────────────────────────────

export interface Envelope {
  id?: number;
  name: string;
  horizon: EnvelopeHorizon;
  target_amount: number;
  period: string;               // "2026-06" for monthly, "2026-W25" for weekly, "2026" for yearly
  parent_envelope_id: number | null; // FK → Envelope.id (rollup hierarchy)
  created_at: string;
}

// ─── RecurringItem ───────────────────────────────────────────────────────────

export interface RecurringItem {
  id?: number;
  name: string;
  amount: number;               // IDR per cadence
  cadence: Cadence;
  kind: RecurringKind;
  lane: Lane;
  is_protected: boolean;
  is_active: boolean;           // soft-delete / pause
  next_due: string;             // ISO date YYYY-MM-DD
  end_date: string | null;      // null = ongoing
  note: string | null;
  created_at: string;
}

// ─── Allowance ───────────────────────────────────────────────────────────────
// Single-row table (id = 1, always upserted)

export interface Allowance {
  id?: number;
  monthly_amount: number;       // IDR — personal discretionary pool
  weekend_allocation: number;   // IDR — one monthly chunk, carved before workweek
  updated_at: string;
}

// ─── NetWorthSnapshot ────────────────────────────────────────────────────────

export interface NetWorthSnapshot {
  id?: number;
  year_month: string;           // "2026-06" — unique, upserted on reconcile complete
  total: number;                // IDR
  by_lane: Record<Lane, number>;
  taken_at: string;             // ISO 8601 full timestamp
}

// ─── IncomeEvent ─────────────────────────────────────────────────────────────

export interface IncomeEvent {
  id?: number;
  date: string;                 // ISO date — effective date of income change
  gross: number;                // IDR
  take_home_net: number;        // IDR — what lands in account (waterfall start)
  delta_vs_prev: number | null; // IDR — null for first event
  routed_to_pipe: number;       // IDR
  routed_to_lifestyle: number;  // IDR
  note: string | null;
  source: 'manual' | 'seed';
  created_at: string;
}

// ─── Milestone ───────────────────────────────────────────────────────────────

export interface Milestone {
  id?: number;
  title: string;
  description: string | null;
  flag_date: string | null;     // ISO date — when to surface this milestone
  status: MilestoneStatus;
  source: string | null;        // e.g. "roadmap", "manual"
  income_event_id: number | null; // FK → IncomeEvent.id (for raise milestones)
  created_at: string;
}

// ─── Assumptions ─────────────────────────────────────────────────────────────
// Single-row table (id = 1, always upserted)

export interface Assumptions {
  id?: number;
  // FI targets (real IDR)
  target_low: number;           // default 4_500_000_000
  target_high: number;          // default 6_000_000_000
  // Real return rates (decimal, net of inflation)
  return_rdpu: number;          // default 0.03
  return_equity: number;        // default 0.07
  return_dplk: number;          // default 0.04  (7% nominal − 3% inflation)
  return_gold: number;          // default 0.01
  // Inflation assumption used to deflate nominals
  inflation_rate: number;       // default 0.03
  // Path B equity switch month (months from first pipe contribution)
  equity_switch_month: number;  // default 6
  // Lifestyle ceiling — used by raise tracker drift alert
  lifestyle_ceiling_monthly: number | null; // null until first raise logged
  updated_at: string;
}

// ─── AppSettings (key-value singleton table) ─────────────────────────────────

export interface AppSetting {
  key: string;                  // primary key
  value: string;                // JSON-serialised value
  updated_at: string;
}

// Known AppSetting keys
export type AppSettingKey =
  | 'last_exported_at'          // ISO 8601 — persisted in Dexie (not localStorage)
  | 'setup_complete'            // 'true' | 'false'
  | 'onboarding_step'           // '1' | '2' | '3' | '4' | 'done'
  | 'reconcile_in_progress'     // 'true' | 'false'
  | 'ios_install_banner_dismissed' // 'true'
  | 'gold_staleness_dismissed_at'; // ISO date
```

### 3.2 Dexie Schema Declaration (`src/db/schema.ts`)

```typescript
import Dexie, { type Table } from 'dexie';
import type {
  Account, Asset, Transaction, Category, Envelope,
  RecurringItem, Allowance, NetWorthSnapshot, IncomeEvent,
  Milestone, Assumptions, AppSetting,
} from './types';

export class FIDatabase extends Dexie {
  accounts!:          Table<Account,          number>;
  assets!:            Table<Asset,            number>;
  transactions!:      Table<Transaction,      number>;
  categories!:        Table<Category,         number>;
  envelopes!:         Table<Envelope,         number>;
  recurringItems!:    Table<RecurringItem,     number>;
  allowance!:         Table<Allowance,         number>;
  netWorthSnapshots!: Table<NetWorthSnapshot,  number>;
  incomeEvents!:      Table<IncomeEvent,       number>;
  milestones!:        Table<Milestone,         number>;
  assumptions!:       Table<Assumptions,       number>;
  appSettings!:       Table<AppSetting,        string>; // PK = key (string)

  constructor() {
    super('fi-dashboard');
    this._defineSchema();
  }

  private _defineSchema() {
    // ── v1: Phase 1 — Skeleton + Visibility ─────────────────────────────────
    this.version(1).stores({
      accounts:          '++id, account_type, lane, is_active',
      assets:            '++id, lane, asset_type, last_valued_at',
      transactions:      '++id, date, account_id, lane, direction, is_transfer, [date+account_id]',
      categories:        '++id, lane, envelope_id',
      envelopes:         '++id, horizon, period, parent_envelope_id',
      recurringItems:    '++id, kind, lane, is_active, next_due',
      allowance:         '++id',
      netWorthSnapshots: '++id, &year_month',       // unique index on year_month
      incomeEvents:      '++id, date',
      milestones:        '++id, flag_date, status',
      assumptions:       '++id',
      appSettings:       '&key',                    // string PK
    });

    // ── v2: Phase 2 additions ────────────────────────────────────────────────
    // RecurringItem gains is_active + end_date (backfilled in upgrade)
    // Transaction gains override fields + transfer fields (backfilled)
    this.version(2).stores({
      // No new tables; only field additions (Dexie handles via upgrade callback)
      // Re-declare indexes for tables gaining new compound indexes
      transactions: '++id, date, account_id, lane, direction, is_transfer, transfer_pair_id, [date+account_id+direction]',
    }).upgrade(tx =>
      Promise.all([
        tx.table<RecurringItem>('recurringItems').toCollection().modify(item => {
          item.is_active  ??= true;
          item.end_date   ??= null;
          item.note       ??= null;
        }),
        tx.table<Transaction>('transactions').toCollection().modify(t => {
          t.original_amount   ??= null;
          t.overridden_amount ??= null;
          t.override_note     ??= null;
          t.overridden_at     ??= null;
          t.is_transfer       ??= false;
          t.transfer_pair_id  ??= null;
        }),
      ])
    );

    // ── v3: Phase 3 — Import & Reconcile ────────────────────────────────────
    // No schema changes; import pipeline uses existing tables.

    // ── v4: Phase 4 — Decision & Discipline ─────────────────────────────────
    // Milestone gains income_event_id FK (backfilled as null)
    this.version(4).stores({}).upgrade(tx =>
      tx.table<Milestone>('milestones').toCollection().modify(m => {
        m.income_event_id ??= null;
      })
    );
  }
}

export const db = new FIDatabase();
```

### 3.3 Index Design Rationale

| Table | Index | Why |
|---|---|---|
| `transactions` | `date` | Range queries for workweek spend, monthly totals |
| `transactions` | `account_id` | Filter by account for reconcile per-account view |
| `transactions` | `is_transfer` | Fast exclusion of transfers from all totals |
| `transactions` | `[date+account_id]` | Duplicate detection during import |
| `transactions` | `[date+account_id+direction]` | Transfer matcher: same date, same account, opposite direction |
| `transactions` | `transfer_pair_id` | Unflag both legs of a transfer by shared UUID |
| `netWorthSnapshots` | `&year_month` | Unique constraint + fast upsert by month key |
| `recurringItems` | `is_active, next_due` | Waterfall query: active items only, ordered by next_due |
| `appSettings` | `&key` | String PK for O(1) key-value lookups |

---

## 4. Import Contract

### 4.1 External Contract — Claude Chat Output Schema

This is the schema Claude must emit. It is the interface between the external parsing step and the app.

```typescript
// src/import/schema.ts

export interface ImportRow {
  date: string;                  // YYYY-MM-DD (required)
  amount: number;                // positive number, IDR (required)
  direction: 'in' | 'out';      // (required)
  account_id: string;            // matches Account.id as string (required)
  category: string;              // free text suggestion (required, can be empty string)
  suggested_lane: Lane;          // one of the 4 Lane values (required)
  note: string;                  // merchant / description (optional, can be empty string)
}

// Claude prompt instruction (canonical):
// Return an array of JSON objects matching ImportRow exactly.
// account_id must be one of: [list account ids from the app].
// suggested_lane must be one of: income_producing | store_of_value | debt_liability | protected_living
// amount is always positive. direction 'out' means money left the account.
// date is YYYY-MM-DD in the account holder's local timezone (WIB, UTC+7).

export interface ParseResult {
  valid:      ValidImportRow[];
  invalid:    InvalidImportRow[];
  duplicates: DuplicateImportRow[];
}

export interface ValidImportRow extends ImportRow {
  _row_index: number;
  _resolved_account: Account;    // hydrated after account_id lookup
  _resolved_category: Category | null;
}

export interface InvalidImportRow {
  _row_index: number;
  _raw: Partial<ImportRow>;
  errors: FieldError[];
}

export interface DuplicateImportRow {
  _row_index: number;
  incoming: ImportRow;
  existing_transaction_id: number;  // FK → Transaction.id
  import_anyway: boolean;           // user decision, default false
}

export interface FieldError {
  field: keyof ImportRow | '_row';
  message: string;
  // e.g. { field: 'direction', message: 'Must be "in" or "out"' }
  // e.g. { field: 'account_id', message: 'No account found with id "acc_999"' }
  // e.g. { field: 'amount', message: 'Must be a positive number' }
  // e.g. { field: '_row', message: 'Row is not a valid JSON object' }
}
```

### 4.2 Validation Rules (`src/import/validator.ts`)

```typescript
// Full rule set applied per-row during parsing

const VALIDATION_RULES: ValidationRule[] = [
  // date: required, YYYY-MM-DD format, not in the future
  { field: 'date',      required: true,  pattern: /^\d{4}-\d{2}-\d{2}$/ },
  // amount: required, number, > 0
  { field: 'amount',    required: true,  check: v => typeof v === 'number' && v > 0 },
  // direction: required, enum
  { field: 'direction', required: true,  enum: ['in', 'out'] },
  // account_id: required, must resolve to an active Account in Dexie
  { field: 'account_id',required: true,  asyncCheck: accountExistsAndActive },
  // category: required field but can be empty string
  { field: 'category',  required: true,  allowEmpty: true },
  // suggested_lane: required, must be valid Lane value
  { field: 'suggested_lane', required: true, enum: LANE_VALUES },
  // note: optional
  { field: 'note',      required: false },
];

// Duplicate detection query (run per-row after field validation):
// SELECT id FROM transactions
// WHERE date = row.date
//   AND amount = row.amount
//   AND direction = row.direction
//   AND account_id = row.account_id
// LIMIT 1
// → If hit: row becomes DuplicateImportRow, not ValidImportRow
```

### 4.3 Web Worker Protocol (`src/workers/transferDetector.ts`)

```typescript
// Messages sent TO the worker
export interface DetectTransfersRequest {
  type: 'DETECT_TRANSFERS';
  rows: ValidImportRow[];
  own_account_ids: number[];     // all active account IDs to constrain matching
}

// Messages received FROM the worker
export interface DetectTransfersResponse {
  type: 'DETECT_TRANSFERS_RESULT';
  rows: ValidImportRow[];        // same array, is_transfer + transfer_pair_id mutated
  transfer_count: number;
  duration_ms: number;           // perf telemetry
}

// Matching algorithm (O(n log n) with sort — not O(n²)):
// 1. Separate rows into out_rows[] and in_rows[]
// 2. Sort each by [amount, date]
// 3. For each out_row, binary search in_rows for same amount within ±1 calendar day
//    and different account_id (both must be in own_account_ids)
// 4. First match wins (greedy one-to-one). Mark both consumed.
// 5. Assign shared UUID to transfer_pair_id on both rows.
//
// Complexity: O(n log n) sort + O(n log n) binary search = O(n log n) total
// At 150 rows: ~1000 comparisons vs naive O(n²) = 22,500
```

---

## 5. Internal API Contracts

### 5.1 Engine Functions (`src/engine/`)

All engine functions are **pure** — no Dexie access, no side effects, easy to unit test.

```typescript
// ── src/engine/safeToSpend.ts ───────────────────────────────────────────────

export interface SafeToSpendInput {
  allowance: Allowance;
  activeRecurringItems: RecurringItem[];
  spendThisWeek: number;              // sum of out transactions in current ISO week, non-transfer
  today: Date;                        // injected for testability
}

export interface SafeToSpendResult {
  // Waterfall rows (in display order)
  payYourselfFirstTotal: number;      // sum of pay_yourself_first items (for display only)
  householdBillTotal: number;         // sum of household_bill items (for display only)
  personalPool: number;               // allowance.monthly_amount
  personalSubTotal: number;           // sum of personal_sub items
  weekendAllocation: number;          // allowance.weekend_allocation
  weekPool: number;                   // personalPool − personalSubTotal − weekendAllocation, ÷ weeksInMonth
  spentThisWeek: number;              // passed in
  remainingPool: number;              // weekPool − spentThisWeek, clamped ≥ 0
  remainingWorkdays: number;          // Mon–Fri count from today inclusive
  todayCeiling: number;               // remainingPool ÷ remainingWorkdays, clamped ≥ 0
  // State flags
  isNullState: boolean;               // allowance not configured — return null display
  isNegativePool: boolean;            // committed items > allowance
  isAmber: boolean;                   // > 60% of ceiling spent before 12:00, OR remainingPool < todayCeiling
}

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult | null
// Returns null when allowance.monthly_amount === 0 (not configured)
// Never throws. Clamps all values ≥ 0.

// ── src/engine/fiProjection.ts ──────────────────────────────────────────────

export interface FIProjectionInput {
  assumptions: Assumptions;
  currentAssets: Record<AssetType, number>; // current value per asset type in IDR
  pipeMonthlyActive: number;                // sum of active pay_yourself_first RecurringItems
  currentDate: Date;                        // injected for testability
}

export interface FIProjectionResult {
  fi_date_path_b: Date | null;             // null if projection doesn't converge
  fi_date_path_a: Date | null;
  gap_to_low: number;                      // IDR gap to target_low
  gap_to_high: number;                     // IDR gap to target_high
  total_current: number;                   // sum of all income-producing assets in real terms
  years_to_fi_path_b: number | null;
  years_to_fi_path_a: number | null;
  path_b_vs_a_savings_years: number | null; // how many years Path B saves vs Path A
}

export function computeFIProjection(input: FIProjectionInput): FIProjectionResult

// ── src/engine/savingsRate.ts ────────────────────────────────────────────────

export interface SavingsRateInput {
  takeHomeNet: number;                     // from latest IncomeEvent.take_home_net
  pipeMonthlyActive: number;               // from active pay_yourself_first RecurringItems
}

export interface SavingsRateResult {
  rate: number;                            // 0–1 decimal
  pipe_total: number;
  take_home_net: number;
  is_null: boolean;                        // true if takeHomeNet === 0
}

export function computeSavingsRate(input: SavingsRateInput): SavingsRateResult

// ── src/engine/returnRates.ts ────────────────────────────────────────────────

export const REAL_RETURN_RATES: Record<AssetType, number> = {
  investment_rdpu:   0.03,
  investment_equity: 0.07,
  gold:              0.01,
  dplk:              0.04,  // 7% nominal − 3% inflation
  storyforge:        0.00,  // speculative, excluded from FI projection
  other:             0.00,
};
```

### 5.2 Repository Contracts (`src/db/repositories/`)

Each repository owns its Dexie atomic transaction boundary. No component calls `db.table.add()` directly.

```typescript
// ── accounts.repo.ts ────────────────────────────────────────────────────────

export const accountsRepo = {
  getAll:            ()                        => db.accounts.where('is_active').equals(1).toArray(),
  getById:           (id: number)              => db.accounts.get(id),
  getActive:         ()                        => db.accounts.filter(a => a.is_active).toArray(),
  create:            (data: Omit<Account,'id' | 'created_at'>) => db.accounts.add({ ...data, created_at: now() }),
  update:            (id: number, patch: Partial<Account>)     => db.accounts.update(id, patch),
  deactivate:        (id: number)              => db.accounts.update(id, { is_active: false }),
  updateManualBalance: (id: number, balance: number) =>
    db.accounts.update(id, { manual_balance_override: balance, last_balance_updated_at: now() }),
};

// ── transactions.repo.ts ────────────────────────────────────────────────────

export const transactionsRepo = {
  // Read
  getByWeek: (isoWeekStart: string, isoWeekEnd: string, excludeTransfers = true) =>
    db.transactions
      .where('date').between(isoWeekStart, isoWeekEnd, true, true)
      .filter(t => !excludeTransfers || !t.is_transfer)
      .toArray(),

  getByMonth: (yearMonth: string, excludeTransfers = true) =>
    db.transactions
      .where('date').startsWith(yearMonth)
      .filter(t => !excludeTransfers || !t.is_transfer)
      .toArray(),

  getDuplicateCandidate: (date: string, amount: number, direction: 'in' | 'out', account_id: number) =>
    db.transactions
      .where('[date+account_id]').equals([date, account_id])
      .filter(t => t.amount === amount && t.direction === direction)
      .first(),

  // Write
  add: (data: Omit<Transaction, 'id' | 'created_at'>) =>
    db.transactions.add({ ...data, created_at: now() }),

  override: (id: number, overrideAmount: number, note: string | null) =>
    db.transaction('rw', db.transactions, async () => {
      const existing = await db.transactions.get(id);
      if (!existing) throw new Error(`Transaction ${id} not found`);
      await db.transactions.update(id, {
        original_amount:   existing.amount,
        overridden_amount: overrideAmount,
        override_note:     note,
        overridden_at:     now(),
        amount:            overrideAmount,
      });
    }),

  unflagTransfer: (id: number) =>
    db.transactions.update(id, { is_transfer: false, transfer_pair_id: null }),

  flagTransfer: (idA: number, idB: number) => {
    const pairId = crypto.randomUUID();
    return db.transaction('rw', db.transactions, async () => {
      await db.transactions.update(idA, { is_transfer: true, transfer_pair_id: pairId });
      await db.transactions.update(idB, { is_transfer: true, transfer_pair_id: pairId });
    });
  },

  // ── THE ATOMIC IMPORT WRITE ──────────────────────────────────────────────
  // All three operations commit together or none commit.
  importBatch: async (
    rows: ValidImportRow[],
    yearMonth: string,
    currentAssets: Record<AssetType, number>,
    currentLaneTotals: Record<Lane, number>,
    netWorthTotal: number,
  ): Promise<{ imported_count: number; snapshot_year_month: string }> => {
    return db.transaction('rw',
      db.transactions,
      db.netWorthSnapshots,
      db.recurringItems,
      async () => {
        // 1. Write transactions
        const txnRecords: Omit<Transaction, 'id'>[] = rows.map(row => ({
          date:              row.date,
          amount:            row.amount,
          direction:         row.direction,
          account_id:        row._resolved_account.id!,
          category_id:       row._resolved_category?.id ?? null,
          lane:              row.suggested_lane,
          source:            'claude_import',
          note:              row.note || null,
          original_amount:   null,
          overridden_amount: null,
          override_note:     null,
          overridden_at:     null,
          is_transfer:       row.is_transfer ?? false,
          transfer_pair_id:  row.transfer_pair_id ?? null,
          created_at:        now(),
        }));
        await db.transactions.bulkAdd(txnRecords);

        // 2. Upsert net worth snapshot
        const existing = await db.netWorthSnapshots.where('year_month').equals(yearMonth).first();
        const snapshot: Omit<NetWorthSnapshot, 'id'> = {
          year_month: yearMonth,
          total:      netWorthTotal,
          by_lane:    currentLaneTotals,
          taken_at:   now(),
        };
        if (existing?.id) {
          await db.netWorthSnapshots.update(existing.id, snapshot);
        } else {
          await db.netWorthSnapshots.add(snapshot);
        }

        // 3. Advance next_due on recurring items whose payment appears in the batch
        await advanceNextDueFromBatch(rows);

        return { imported_count: rows.length, snapshot_year_month: yearMonth };
      }
    );
  },
};

// ── snapshots.repo.ts ────────────────────────────────────────────────────────

export const snapshotsRepo = {
  getAll:      ()                   => db.netWorthSnapshots.orderBy('year_month').toArray(),
  getByMonth:  (ym: string)         => db.netWorthSnapshots.where('year_month').equals(ym).first(),
  // Called manually (non-import snapshot — e.g. first-run after onboarding)
  upsert:      (snapshot: Omit<NetWorthSnapshot,'id'>) =>
    db.transaction('rw', db.netWorthSnapshots, async () => {
      const existing = await db.netWorthSnapshots.where('year_month').equals(snapshot.year_month).first();
      if (existing?.id) return db.netWorthSnapshots.update(existing.id, snapshot);
      return db.netWorthSnapshots.add(snapshot);
    }),
};

// ── settings.repo.ts ────────────────────────────────────────────────────────

export const settingsRepo = {
  get:    (key: AppSettingKey)               => db.appSettings.get(key).then(r => r?.value ?? null),
  set:    (key: AppSettingKey, value: string) =>
    db.appSettings.put({ key, value, updated_at: now() }),
  getAll: ()                                 => db.appSettings.toArray(),
};

// ── recurringItems.repo.ts ───────────────────────────────────────────────────

export const recurringRepo = {
  getActive:   ()                          => db.recurringItems.filter(r => r.is_active).toArray(),
  getByKind:   (kind: RecurringKind)       => db.recurringItems.where('kind').equals(kind).filter(r => r.is_active).toArray(),
  create:      (data: Omit<RecurringItem,'id'|'created_at'>) => db.recurringItems.add({ ...data, created_at: now() }),
  update:      (id: number, patch: Partial<RecurringItem>)   => db.recurringItems.update(id, patch),
  deactivate:  (id: number)               => db.recurringItems.update(id, { is_active: false }),
  advanceDue:  (id: number, nextDue: string) => db.recurringItems.update(id, { next_due: nextDue }),
};
```

### 5.3 Zustand Store Slices (`src/stores/`)

```typescript
// ── pinStore.ts ──────────────────────────────────────────────────────────────

interface PinState {
  isLocked:       boolean;
  attemptCount:   number;
  lockoutUntil:   number | null;   // timestamp ms
  biometricEnrolled: boolean;

  unlock:         ()              => void;
  lock:           ()              => void;
  recordFailedAttempt: ()         => void;
  resetAttempts:  ()              => void;
  enrollBiometric: ()             => void;
}

// ── reconcileStore.ts ────────────────────────────────────────────────────────

interface ReconcileState {
  isInProgress:   boolean;
  step:           'idle' | 'entry' | 'parsing' | 'detecting' | 'confirm' | 'committing';
  rawInput:       string;
  parseResult:    ParseResult | null;
  flaggedRows:    ValidImportRow[];   // after transfer detection
  error:          string | null;

  start:          ()              => void;
  setRawInput:    (raw: string)   => void;
  setParseResult: (r: ParseResult) => void;
  setFlaggedRows: (rows: ValidImportRow[]) => void;
  setStep:        (s: ReconcileState['step']) => void;
  setError:       (e: string)     => void;
  cancel:         ()              => void;
  complete:       ()              => void;
}

// ── appStore.ts ──────────────────────────────────────────────────────────────

interface AppState {
  activeTab:      'home' | 'budget' | 'assets' | 'decide' | 'more';
  budgetHorizon:  'yearly' | 'monthly' | 'weekly';
  modalStack:     ModalName[];
  showIOSBanner:  boolean;
  showGoldNudge:  boolean;

  setTab:         (t: AppState['activeTab'])        => void;
  setBudgetHorizon: (h: AppState['budgetHorizon'])  => void;
  pushModal:      (m: ModalName)                    => void;
  popModal:       ()                                => void;
  dismissIOSBanner: ()                              => void;
  dismissGoldNudge: ()                              => void;
}
```

### 5.4 Hook Contracts (`src/hooks/`)

```typescript
// Hooks return liveQuery subscriptions — components re-render on data change.

// useNetWorth.ts
export function useNetWorth(): {
  total: number | null;
  byLane: Record<Lane, number> | null;
  latestSnapshot: NetWorthSnapshot | null;
  isStale: boolean;              // any asset.last_valued_at > 35 days
  isGoldStale: boolean;          // gold asset.last_valued_at > 30 days
  isLoading: boolean;
}

// useSafeToSpend.ts
export function useSafeToSpend(): {
  result: SafeToSpendResult | null;   // null = not configured
  isLoading: boolean;
}

// useWorkweek.ts
export function useWorkweek(): {
  weekStart: string;   // ISO date — Monday of current week
  weekEnd:   string;   // ISO date — Friday of current week
  today:     string;   // ISO date
  remaining: number;   // Mon–Fri days left including today
  dayLabels: Array<{ key: string; label: string; state: 'spent' | 'today' | 'future' }>;
}

// useFIProjection.ts
export function useFIProjection(): {
  result: FIProjectionResult | null;
  savingsRate: SavingsRateResult | null;
  isLoading: boolean;
}

// useStoragePersist.ts
export function useStoragePersist(): {
  isPersisted: boolean | null;
  request: () => Promise<boolean>;
}
```

---

## 6. Backup / Export Contract

```typescript
// src/lib/backup.ts

export interface BackupEnvelope {
  schema_version: number;        // current: 1; increment on breaking schema change
  app_version:    string;        // semver from package.json
  exported_at:    string;        // ISO 8601
  data: {
    accounts:          Account[];
    assets:            Asset[];
    transactions:      Transaction[];
    categories:        Category[];
    envelopes:         Envelope[];
    recurringItems:    RecurringItem[];
    allowance:         Allowance[];
    netWorthSnapshots: NetWorthSnapshot[];
    incomeEvents:      IncomeEvent[];
    milestones:        Milestone[];
    assumptions:       Assumptions[];
    appSettings:       AppSetting[];
  };
}

// Migration map (for restore validation):
// schema_version 1 → current: no migration needed, pass through
// schema_version 0 (pre-release): reject with "Backup too old — cannot restore"

export const SUPPORTED_BACKUP_VERSIONS = [1];

export async function exportBackup(): Promise<void>
// Queries all tables → assembles BackupEnvelope → triggers download
// Side effect: updates AppSetting 'last_exported_at'

export async function restoreBackup(file: File): Promise<RestoreResult>
// 1. Parse + validate schema_version
// 2. If unsupported version → return { ok: false, error: 'version_unsupported' }
// 3. Confirm modal gate (caller responsibility)
// 4. db.transaction('rw', all tables, () => clear + bulkAdd each table)
// 5. Returns { ok: true, counts: Record<TableName, number> }

export type RestoreResult =
  | { ok: true;  counts: Record<string, number> }
  | { ok: false; error: 'version_unsupported' | 'parse_error' | 'db_error'; message: string };
```

---

## 7. Security Contracts

```typescript
// src/lib/crypto.ts

// PIN hashing: SHA-256(raw_pin + device_salt)
// device_salt: 32 random bytes, hex-encoded, stored in localStorage key 'fi_device_salt'
// pin_hash: stored in localStorage key 'fi_pin_hash'

export async function setPin(rawPin: string): Promise<void>
// 1. Ensure device_salt exists; if not, generate via crypto.getRandomValues()
// 2. Compute SHA-256(rawPin + device_salt) using SubtleCrypto
// 3. Store hex-encoded hash in localStorage('fi_pin_hash')

export async function verifyPin(rawPin: string): Promise<boolean>
// 1. Load device_salt from localStorage
// 2. If device_salt missing → throw PinSaltMissingError (caller shows reset flow)
// 3. Compute hash; compare to stored hash
// 4. Returns boolean (timing-safe compare via constant-time SubtleCrypto)

export class PinSaltMissingError extends Error {}
// Caught in PinLockScreen → trigger PIN reset (not lockout)
```

---

## 8. Date / Calendar Contracts

```typescript
// src/lib/dates.ts
// All date handling is YYYY-MM-DD strings in device-local time (WIB UTC+7).
// No UTC conversion. No timezone-aware Date construction from ISO strings with Z suffix.

export function todayISO(): string
// new Date() → format as YYYY-MM-DD using local getFullYear/getMonth/getDate
// Never: new Date().toISOString().slice(0,10) — this is UTC, wrong for WIB after 17:00 UTC

export function isoWeekStart(date: Date): string
// Monday of the ISO week containing `date`
// Monday = (date.getDay() + 6) % 7 === 0
// Returns YYYY-MM-DD

export function isoWeekEnd(date: Date): string
// Friday of the same ISO week (weekStart + 4 days)

export function workdaysRemaining(today: Date): number
// Count of Mon–Fri days from today (inclusive) through Friday of this ISO week
// Min return: 1 (even on Friday)
// Returns 0 only when today is Saturday or Sunday (weekend — caller shows weekend state)

export function weeksInMonth(yearMonth: string): number
// Approximate: count Mon–Fri workdays in month ÷ 5
// Used for workweek pool = monthly_pool ÷ weeksInMonth(currentMonth)
// Conservative: floor not ceil

export function advanceByOneMonth(isoDate: string): string
// Used by advanceNextDue() for monthly RecurringItems
```

---

## 9. Currency Formatting Contract

```typescript
// src/lib/currency.ts
// Canonical IDR display format: "Rp 58.000" (dot as thousand separator, no decimal)
// For millions: "Rp 2,5M" (comma as decimal in short form)
// For billions: "Rp 4,42B"

export function formatRp(value: number): string
// 0–999_999       → "Rp 58.000"        (full with dot separators)
// 1_000_000+      → "Rp 2,5M"          (millions shorthand)
// 1_000_000_000+  → "Rp 4,42B"         (billions shorthand)

export function formatRpFull(value: number): string
// Always full with dot separators: "Rp 2.500.000"
// Used in waterfall breakdown rows

export function parseRpInput(raw: string): number | null
// Parses user-typed input from QuickLogSheet: "25000", "25.000", "25,000" → 25000
// Returns null if not a valid positive number

// Numeric keyboard input rule:
// QuickLogSheet stores raw digits only (no formatting during typing)
// Formats only on display (monospace output)
// On blur / confirm: parseRpInput → validate > 0
```

---

## 10. Build & Toolchain Decisions

| Tool | Choice | Reason |
|---|---|---|
| Bundler | Vite 5 | First-class PWA plugin, fast HMR, Rollup output |
| PWA | vite-plugin-pwa | generateSW strategy, Workbox precaching |
| UI | React 19 | Stable, concurrent features for sheet animations |
| Styling | Tailwind v4 | Design token CSS vars map cleanly |
| DB | Dexie 4 | Best-in-class IndexedDB wrapper; liveQuery is the reactive primitive |
| State | Zustand 5 | Minimal, no boilerplate; no Redux needed for a local-first app |
| Types | TypeScript 5.5 strict | `strict: true`, `noUncheckedIndexedAccess: true` |
| Testing | Vitest + Testing Library | Co-located with Vite; engine functions are pure and trivial to test |
| Formatting | Biome | Replaces ESLint + Prettier in one tool, fast |
| Worker | Inline blob URL | No extra bundler config; worker code lives in `src/workers/` |

### `tsconfig.json` key flags
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "paths": {
      "@db/*":     ["./src/db/*"],
      "@engine/*": ["./src/engine/*"],
      "@lib/*":    ["./src/lib/*"],
      "@stores/*": ["./src/stores/*"],
      "@features/*": ["./src/features/*"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

---

## 11. What This Architecture Deliberately Does Not Include

| Not included | Why |
|---|---|
| REST API / backend | Local-first. No network dependency. No server to maintain. |
| Authentication / JWT | Single-user, device-local PIN is the auth model. |
| React Query / SWR | Data is synchronous IndexedDB. Dexie liveQuery is the reactive layer. |
| Redux | Zustand handles the thin UI state slice. No global reducer needed. |
| ORM beyond Dexie | Dexie IS the ORM for IndexedDB. No abstraction layer above it. |
| Real-time sync | Multi-device sync is post-MVP (requires auth + server). |
| Error boundary beyond app shell | Local data reads don't fail. Only writes can fail (atomic rollback). |
| Service worker push notifications | No market data, no push needed. |
| Analytics / telemetry | Solo user. Data stays on device. |

---

*This document is the single source of truth for types, contracts, and boundaries.  
Update it before changing any entity field, engine signature, or import schema.*
