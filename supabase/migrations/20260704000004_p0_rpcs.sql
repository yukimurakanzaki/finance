-- P0 RPCs: household bootstrap, invite accept, atomic import. See BACKEND.md §4.

-- Create a household and make the caller its admin (bootstraps the first membership).
create or replace function create_household(p_name text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into households (name, created_by) values (p_name, v_uid) returning id into v_hh;
  insert into memberships (household_id, user_id, role) values (v_hh, v_uid, 'admin');
  insert into assumptions (household_id) values (v_hh);
  return v_hh;
end $$;

-- Join a household via an invite code.
create or replace function accept_invite(p_code text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invites; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from invites where code = p_code;
  if v_inv is null then raise exception 'invite not found'; end if;
  if v_inv.status <> 'pending' or v_inv.expires_at < now() then
    raise exception 'invite is not valid';
  end if;
  insert into memberships (household_id, user_id, role) values (v_inv.household_id, v_uid, 'member')
    on conflict do nothing;
  update invites set status = 'accepted' where id = v_inv.id;
  return v_inv.household_id;
end $$;

-- Atomic reconcile/import (FR-IMP-5): transactions + month snapshot commit together.
-- SECURITY INVOKER (default): RLS enforces the caller belongs to p_household_id.
create or replace function import_batch(
  p_household_id uuid, p_rows jsonb, p_year_month text,
  p_snapshot_total bigint, p_snapshot_by_lane jsonb
) returns jsonb language plpgsql set search_path = public as $$
declare v_count int;
begin
  insert into transactions (household_id, created_by, date, amount, direction, account_id,
                            category_id, lane, source, note, is_transfer, transfer_pair_id)
  select p_household_id, auth.uid(),
         (r->>'date')::date, (r->>'amount')::bigint, r->>'direction', (r->>'account_id')::uuid,
         nullif(r->>'category_id','')::uuid, r->>'lane', 'claude_import', r->>'note',
         coalesce((r->>'is_transfer')::boolean,false), nullif(r->>'transfer_pair_id','')::uuid
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;

  insert into net_worth_snapshots (household_id, year_month, total, by_lane)
  values (p_household_id, p_year_month, p_snapshot_total, p_snapshot_by_lane)
  on conflict (household_id, year_month)
  do update set total = excluded.total, by_lane = excluded.by_lane, taken_at = now(), updated_at = now();

  return jsonb_build_object('imported_count', v_count, 'snapshot_year_month', p_year_month);
end $$;
