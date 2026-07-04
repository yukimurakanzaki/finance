# Backend Architecture — FI Dashboard (Cloud / Multi-Tenant)

**Version:** 1.0 · **Date:** 2026-07-04
**Status:** Design. Implements BRD v2.0 §12. Complements `ARCHITECTURE.md` (which documents the current single-user local client — still accurate for the free tier).
**Scope:** The backend stores household-scoped data, isolates it, syncs it, and gates it by subscription. **Nothing else.** Domain engines (FI projection, safe-to-spend, savings rate, import parsing/transfer detection) stay client-side pure functions and are out of scope here.

### Assumptions (from BRD §7 open decisions — confirm/override)
| # | Decision | Chosen default |
|---|----------|----------------|
| D-1 | Payment provider | **Xendit** (IDR + GoPay/OVO/VA/bank transfer) |
| D-2 | Account attribution | **Shared by default**, nullable `owner_member_id` |
| D-3 | Allowance / Assumptions scope | Allowance = **per-member**; Assumptions = **per-household** |
| D-4 | P0 sync depth | **Pull-on-open** only; realtime deferred to P1 |

---

## 1. Stack

**Supabase** (managed Postgres + Auth + Realtime + Edge Functions). Chosen because it provides the three risky primitives — tenant isolation, auth, sync — without hand-rolling them.

| BRD need | Supabase primitive |
|---|---|
| FR-ACC (auth) | GoTrue auth (`auth.users`, `auth.uid()`) |
| NFR-1 (per-household isolation) | Postgres **Row-Level Security** |
| FR-SY (sync) | PostgREST for CRUD + Realtime for deltas (P1+) |
| FR-IMP-5 (atomic import) | Postgres RPC (plpgsql, single transaction) |
| FR-BIL (billing) | Edge Function webhook + `households` entitlement columns |
| NFR-7 (durability) | Managed backups / PITR + existing client JSON export |

Engines run on the client against a local Dexie cache. The server is a scoped datastore + two RPCs.

---

## 2. Data Model

Conventions: all money is **`BIGINT` (integer rupiah, no cents)** — never float. All timestamps `TIMESTAMPTZ`. All PKs `UUID DEFAULT gen_random_uuid()` (client can also generate UUIDs offline for the outbox). Every domain row carries `household_id` and `updated_at` (for LWW sync).

### 2.1 Tenancy core (new)

```sql
-- users are auth.users (managed). We mirror a lightweight profile.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now()
);

create table households (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_by          uuid not null references auth.users(id),
  -- entitlement (FR-BIL)
  subscription_status text not null default 'trialing'
                      check (subscription_status in ('trialing','active','past_due','canceled','free')),
  plan                text not null default 'household',
  trial_ends_at       timestamptz,
  provider_customer_id text,           -- Xendit customer id
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table memberships (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('admin','member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on memberships (user_id);

create table invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email        text,
  code         text unique not null,          -- shareable join code
  status       text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by   uuid not null references auth.users(id),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
```

### 2.2 Domain tables (ported from `src/db/types.ts`, + `household_id`)

The Dexie types map 1:1; changes are annotated. Enums become `text` + `check` (matching the TS unions) or Postgres enums.

```sql
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  owner_member_id uuid references auth.users(id),      -- NEW: null = shared (D-2)
  name          text not null,
  institution   text not null,
  account_type  text not null check (account_type in ('bank','digital_wallet','cash')),
  lane          text not null check (lane in ('income_producing','store_of_value','debt_liability','protected_living')),
  currency      text not null default 'IDR',
  is_protected  boolean not null default false,
  is_active     boolean not null default true,
  manual_balance_override bigint,
  last_balance_updated_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table assets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  lane          text not null,
  asset_type    text not null check (asset_type in ('investment_rdpu','investment_equity','gold','dplk','storyforge','other')),
  value         bigint not null,
  quantity_grams numeric,          -- gold: grams (fractional allowed)
  price_per_gram bigint,
  last_valued_at timestamptz not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  created_by    uuid references auth.users(id),          -- NEW: attribution (FR-TX-1)
  date          date not null,
  amount        bigint not null check (amount > 0),
  direction     text not null check (direction in ('in','out')),
  account_id    uuid not null references accounts(id),
  category_id   uuid references categories(id),
  lane          text not null,
  source        text not null check (source in ('manual','claude_import','csv_import')),
  note          text,
  original_amount   bigint,
  overridden_amount bigint,
  override_note     text,
  overridden_at     timestamptz,
  is_transfer       boolean not null default false,
  transfer_pair_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on transactions (household_id, date);
create index on transactions (household_id, account_id);
create index on transactions (household_id, updated_at);   -- sync delta pull

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null, lane text not null,
  is_protected boolean not null default false,
  envelope_id uuid references envelopes(id),
  updated_at timestamptz not null default now()
);

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  horizon text not null check (horizon in ('yearly','monthly','weekly')),
  target_amount bigint not null,
  period text not null,
  parent_envelope_id uuid references envelopes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recurring_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null, amount bigint not null,
  cadence text not null check (cadence in ('monthly','weekly','yearly','one_off')),
  kind text not null check (kind in ('pay_yourself_first','household_bill','personal_sub','other')),
  lane text not null,
  is_protected boolean not null default false,
  is_active boolean not null default true,
  next_due date not null, end_date date, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recurring_items (household_id, is_active, next_due);

-- CHANGED: was single-row per device → per-member (D-3)
create table allowances (
  household_id uuid not null references households(id) on delete cascade,
  member_id    uuid not null references auth.users(id),
  monthly_amount     bigint not null,
  weekend_allocation bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (household_id, member_id)
);

create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  year_month text not null,          -- "2026-06"
  total bigint not null,
  by_lane jsonb not null,
  taken_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, year_month)  -- was &year_month; now per household
);

create table income_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid references auth.users(id),    -- NEW: per member (FR-IN-1)
  date date not null, gross bigint not null, take_home_net bigint not null,
  delta_vs_prev bigint, routed_to_pipe bigint not null, routed_to_lifestyle bigint not null,
  note text, source text not null check (source in ('manual','seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null, description text, flag_date date,
  status text not null check (status in ('pending','triggered','done','skipped')),
  source text, income_event_id uuid references income_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CHANGED: single-row → one row per household (D-3)
create table assumptions (
  household_id uuid primary key references households(id) on delete cascade,
  target_low bigint not null default 4500000000,
  target_high bigint not null default 6000000000,
  return_rdpu numeric not null default 0.03,
  return_equity numeric not null default 0.07,
  return_dplk numeric not null default 0.04,
  return_gold numeric not null default 0.01,
  inflation_rate numeric not null default 0.03,
  equity_switch_month int not null default 6,
  lifestyle_ceiling_monthly bigint,
  updated_at timestamptz not null default now()
);
```

**`AppSettings` split:** device-only keys (`ios_install_banner_dismissed`, `gold_staleness_dismissed_at`, and the **PIN** — SHA-256 hash + salt) **stay in the client (localStorage/Dexie); never sent to the server.** Household-level keys (`setup_complete`, `onboarding_step`, `reconcile_in_progress`) live on the household. The PIN is a local device convenience lock on top of real auth — not a server credential.

---

## 3. Isolation — RLS (NFR-1, the whole game)

Recursion-safe helpers (SECURITY DEFINER bypasses RLS to read membership), then one reusable policy per domain table.

```sql
create or replace function auth_household_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
    select household_id from memberships where user_id = auth.uid()
$$;

create or replace function is_household_admin(hid uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from memberships
                   where user_id = auth.uid() and household_id = hid and role = 'admin')
$$;

-- Applied to EVERY domain table (accounts, assets, transactions, ...):
alter table accounts enable row level security;
create policy hh_rw on accounts
  for all
  using      (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
-- ...repeat verbatim for every domain table (same policy body).

-- households: members read their own; only admins update; billing columns
alter table households enable row level security;
create policy hh_read   on households for select using (id in (select auth_household_ids()));
create policy hh_update on households for update using (is_household_admin(id));

-- memberships: see co-members; only admins mutate
alter table memberships enable row level security;
create policy m_read on memberships for select using (household_id in (select auth_household_ids()));
create policy m_admin on memberships for all using (is_household_admin(household_id))
                                          with check (is_household_admin(household_id));

-- allowances: everyone in household reads all; you edit only your own
create policy a_read  on allowances for select using (household_id in (select auth_household_ids()));
create policy a_write on allowances for all
  using (member_id = auth.uid()) with check (member_id = auth.uid() and household_id in (select auth_household_ids()));
```

**The single biggest breach risk is forgetting the policy on one table.** Mitigation: a migration test that asserts `rowsecurity = true` for every table in `public`, plus the isolation tests in §7.

---

## 4. Atomic import RPC (FR-IMP-5)

Preserves the "commit together or not at all" guarantee from the current `importBatch`. One plpgsql function, one transaction. Runs as the caller (RLS enforced).

```sql
create or replace function import_batch(
  p_household_id uuid,
  p_rows jsonb,               -- validated+transfer-flagged rows (client did parsing/detection)
  p_year_month text,
  p_snapshot_total bigint,
  p_snapshot_by_lane jsonb
) returns jsonb
language plpgsql as $$
declare v_count int;
begin
  -- 1. transactions
  insert into transactions (household_id, created_by, date, amount, direction, account_id,
                            category_id, lane, source, note, is_transfer, transfer_pair_id)
  select p_household_id, auth.uid(),
         (r->>'date')::date, (r->>'amount')::bigint, r->>'direction', (r->>'account_id')::uuid,
         nullif(r->>'category_id','')::uuid, r->>'lane', 'claude_import', r->>'note',
         coalesce((r->>'is_transfer')::boolean,false), nullif(r->>'transfer_pair_id','')::uuid
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;

  -- 2. upsert month snapshot
  insert into net_worth_snapshots (household_id, year_month, total, by_lane)
  values (p_household_id, p_year_month, p_snapshot_total, p_snapshot_by_lane)
  on conflict (household_id, year_month)
  do update set total = excluded.total, by_lane = excluded.by_lane, taken_at = now(), updated_at = now();

  -- 3. advance recurring next_due for matched items (client passes matched ids in rows if needed)
  --    left as a follow-up call or folded in via p_rows metadata.

  return jsonb_build_object('imported_count', v_count, 'snapshot_year_month', p_year_month);
end $$;
```

The **transfer detector and validator stay on the client** (they already exist in `src/import/` and `src/workers/`); the RPC only commits the reviewed result atomically.

---

## 5. Sync + offline (FR-SY)

Keep Dexie as the local cache so the existing `liveQuery` UI barely changes. Add two client-side pieces:

- **Outbox** — a Dexie `_outbox` table of pending mutations `{ id, op:'upsert'|'delete', table, row, local_updated_at }`. All repository writes enqueue here and optimistically update the local cache.
- **Pusher** — on reconnect, replay outbox in order via PostgREST/RPC. Server is authoritative; **LWW per field via `updated_at`** (FR-SY-3). Imports go through `import_batch` (never row-by-row).
- **Puller** — on app-open (P0) and via Realtime subscription (P1+): `select * from <table> where household_id = $hh and updated_at > $last_pulled_at`, upsert into Dexie, advance the per-table `last_pulled_at` watermark. Indexes `(household_id, updated_at)` exist for this.

No CRDTs, no bespoke protocol. Delete tombstones: soft-delete domain rows (`is_active`/status) where the model already supports it; for hard deletes use a small `deletions(household_id, table, row_id, deleted_at)` log pulled the same way.

---

## 6. Billing & entitlement (FR-BIL, Xendit)

- **Provider:** Xendit recurring plans / invoices. On payment events, an **Edge Function webhook** verifies the signature and updates `households.subscription_status` / `trial_ends_at` / `provider_customer_id`.
- **Entitlement gates *features*, not data.** A lapsed household keeps **read + export** of its own data (FR-BIL-6). Gating targets: inviting a 2nd member, chat-assisted import, and multi-device sync. Enforce in the client + a server check (RPC guard or a write policy that requires `subscription_status in ('trialing','active')` for `memberships` inserts beyond the first).
- **Per-household, not per-seat:** billing keys off `households`, independent of member count (D-1).
- Admin-only billing (FR-BIL-5): billing mutations require `is_household_admin`.

---

## 7. Isolation test plan (do this in P1 before any real 2nd tenant)

Automated, run in CI against a seeded DB with two households A and B:

1. As user in A, every domain table: `select` returns only A's rows; count of B's rows visible = **0**.
2. As A, attempt `insert`/`update` with `household_id = B` → **rejected** by `with check`.
3. As A (member, not admin): cannot insert into `memberships`, cannot update `households` billing columns.
4. Meta-assert: `select tablename from pg_tables where schemaname='public' and rowsecurity=false` returns **empty** (no table missed RLS).
5. Lapsed entitlement: A can still `select`/export; cannot invite a 2nd member or call `import_batch`.

A single failing row here is a launch blocker.

---

## 8. Migration: local single-user → first cloud household

Reuse the existing client `BackupEnvelope` export (`ARCHITECTURE.md` §6):
1. User signs up (FR-ACC) → creates a household → becomes admin.
2. Client reads local Dexie, remaps each row: assign `household_id`, `created_by = self`, convert numeric ids → UUIDs (keep a local id→uuid map for FKs), amounts → integer rupiah.
3. Push via outbox / a one-shot `import` (bypassing dedupe, since it's a fresh tenant).
4. Existing free-tier local data is thus lifted into the cloud household intact.

---

## 9. Backend deliverables by phase (maps BRD §8)

| Phase | Backend deliverables |
|---|---|
| **P0 — own household** | Supabase project; auth; `households`+`memberships`+`invites`; RLS + helpers; port all domain tables; `import_batch` RPC; client outbox + pull-on-open; local→cloud migration. **No billing.** |
| **P1 — friend beta** | Real 2nd tenant; §7 isolation tests in CI; invite/accept flow hardened; Realtime pull; **manual** entitlement flag (no payments); pricing validation. |
| **P2 — launch** | Xendit integration + webhook Edge Function; self-serve subscribe/cancel/downgrade; entitlement gating; PITR/backups verified; basic ops/support. |

---

## 10. Open items to confirm
1. **D-1 Xendit** vs Midtrans vs Stripe — affects the billing Edge Function only.
2. **D-2 account attribution** — shared-default assumed; confirm members ever need private accounts hidden from a partner (would change RLS on `accounts`).
3. **D-4 realtime timing** — P0 pull-only assumed; pull to P0 if two phones in one house need live updates immediately.
4. **Deletions** — confirm soft-delete-everywhere vs the `deletions` tombstone log.
5. **PDP compliance** — depth of Indonesian data-protection obligations for stored financial data (NFR-2) — legal input before P2.

---

*This document is the backend build spec. Client contracts remain in `ARCHITECTURE.md`; business intent in `BRD.md`. Money is integer rupiah everywhere. RLS is the isolation boundary and must be tested, not assumed.*
