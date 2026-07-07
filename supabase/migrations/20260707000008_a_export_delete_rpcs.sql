-- Phase A G4 (UU PDP): data portability + right to deletion.

-- Full-household JSON export. INVOKER: RLS guarantees the caller only ever
-- exports a household they belong to (each subquery returns 0 rows otherwise).
create or replace function export_household(p_household uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  if p_household not in (select auth_household_ids()) then
    raise exception 'not a member of this household';
  end if;

  select jsonb_build_object(
    'format', 'fi-dashboard-household-export',
    'version', 1,
    'exported_at', now(),
    'household',    (select to_jsonb(h) - 'provider_customer_id' from households h where h.id = p_household),
    'memberships',  (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from memberships m where m.household_id = p_household),
    'accounts',     (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from accounts a where a.household_id = p_household),
    'assets',       (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from assets a where a.household_id = p_household),
    'categories',   (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from categories c where c.household_id = p_household),
    'envelopes',    (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from envelopes e where e.household_id = p_household),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from transactions t where t.household_id = p_household),
    'recurring_items',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from recurring_items r where r.household_id = p_household),
    'allowances',          (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from allowances a where a.household_id = p_household),
    'net_worth_snapshots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from net_worth_snapshots s where s.household_id = p_household),
    'income_events',       (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from income_events i where i.household_id = p_household),
    'milestones',          (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from milestones m where m.household_id = p_household),
    'assumptions',         (select to_jsonb(a) from assumptions a where a.household_id = p_household)
  ) into v;

  perform audit.log_event(p_household, 'export_household');
  return v;
end $$;

-- Household deletion. DEFINER (households has no DELETE policy — deletion is
-- only possible through this admin-gated, audit-logged path). Cascades wipe
-- every domain table; the audit entry survives (no FK) for breach/PDP records.
create or replace function delete_household(p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_household_admin(p_household) then
    raise exception 'only a household admin can delete the household';
  end if;
  perform audit.log_event(p_household, 'delete_household',
    jsonb_build_object('deleted_by', auth.uid()));
  delete from households where id = p_household;
end $$;

revoke execute on function export_household(uuid) from public, anon;
grant  execute on function export_household(uuid) to authenticated;
revoke execute on function delete_household(uuid) from public, anon;
grant  execute on function delete_household(uuid) to authenticated;
