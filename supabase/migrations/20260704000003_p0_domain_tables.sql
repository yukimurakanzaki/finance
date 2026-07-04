-- P0 domain tables ported from src/db/types.ts, scoped by household_id.
-- Money is BIGINT (integer rupiah, no cents). See BACKEND.md §2.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_member_id uuid references auth.users(id),
  name text not null, institution text not null,
  account_type text not null check (account_type in ('bank','digital_wallet','cash')),
  lane text not null check (lane in ('income_producing','store_of_value','debt_liability','protected_living')),
  currency text not null default 'IDR',
  is_protected boolean not null default false,
  is_active boolean not null default true,
  manual_balance_override bigint,
  last_balance_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table envelopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  horizon text not null check (horizon in ('yearly','monthly','weekly')),
  target_amount bigint not null, period text not null,
  parent_envelope_id uuid references envelopes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null, lane text not null,
  is_protected boolean not null default false,
  envelope_id uuid references envelopes(id),
  updated_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null, lane text not null,
  asset_type text not null check (asset_type in ('investment_rdpu','investment_equity','gold','dplk','storyforge','other')),
  value bigint not null, quantity_grams numeric, price_per_gram bigint,
  last_valued_at timestamptz not null, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid references auth.users(id),
  date date not null,
  amount bigint not null check (amount > 0),
  direction text not null check (direction in ('in','out')),
  account_id uuid not null references accounts(id),
  category_id uuid references categories(id),
  lane text not null,
  source text not null check (source in ('manual','claude_import','csv_import')),
  note text,
  original_amount bigint, overridden_amount bigint, override_note text, overridden_at timestamptz,
  is_transfer boolean not null default false, transfer_pair_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on transactions (household_id, date);
create index on transactions (household_id, account_id);
create index on transactions (household_id, updated_at);

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

create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  year_month text not null, total bigint not null, by_lane jsonb not null,
  taken_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, year_month)
);

create table income_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid references auth.users(id),
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

-- per-member allowance
create table allowances (
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid not null references auth.users(id),
  monthly_amount bigint not null, weekend_allocation bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, member_id)
);

-- per-household assumptions
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

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['accounts','envelopes','categories','assets','transactions',
                           'recurring_items','net_worth_snapshots','income_events','milestones',
                           'allowances','assumptions'] loop
    execute format('create trigger t_%1$s_updated before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- RLS: standard per-household policy on household-scoped tables
do $$
declare t text;
begin
  foreach t in array array['accounts','envelopes','categories','assets','transactions',
                           'recurring_items','net_worth_snapshots','income_events','milestones','assumptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy hh_rw on %I for all using (household_id in (select auth_household_ids())) with check (household_id in (select auth_household_ids()))', t);
  end loop;
end $$;

-- allowances: read all in household, write only your own
alter table allowances enable row level security;
create policy a_read  on allowances for select using (household_id in (select auth_household_ids()));
create policy a_write on allowances for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and household_id in (select auth_household_ids()));
