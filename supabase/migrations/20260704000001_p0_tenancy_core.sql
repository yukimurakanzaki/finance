-- P0 tenancy core: profiles, households, memberships, invites + auto-profile trigger
-- Applied to project lanvhaliejwuazqerbvp (fi-dashboard). See BACKEND.md §2.

create or replace function set_updated_at() returns trigger
  language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','free')),
  plan text not null default 'household',
  trial_ends_at timestamptz,
  provider_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_households_updated before update on households
  for each row execute function set_updated_at();

create table memberships (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on memberships (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email text,
  code text unique not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on invites (household_id);

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
