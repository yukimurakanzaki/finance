-- P0 tenancy RLS: recursion-safe helpers + policies. See BACKEND.md §3.

create or replace function auth_household_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
    select household_id from memberships where user_id = auth.uid()
$$;
create or replace function is_household_admin(hid uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (select 1 from memberships
                   where user_id = auth.uid() and household_id = hid and role = 'admin')
$$;

alter table profiles    enable row level security;
alter table households  enable row level security;
alter table memberships enable row level security;
alter table invites     enable row level security;

create policy p_read on profiles for select
  using (id = auth.uid() or id in (select user_id from memberships where household_id in (select auth_household_ids())));
create policy p_write on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy hh_read   on households for select using (id in (select auth_household_ids()));
create policy hh_update on households for update using (is_household_admin(id));

create policy m_read  on memberships for select using (household_id in (select auth_household_ids()));
create policy m_admin on memberships for all
  using (is_household_admin(household_id)) with check (is_household_admin(household_id));

create policy i_admin on invites for all
  using (is_household_admin(household_id)) with check (is_household_admin(household_id));
