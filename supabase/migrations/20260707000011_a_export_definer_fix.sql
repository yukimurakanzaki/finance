-- Fix: export_household was SECURITY INVOKER but calls audit.log_event, whose
-- EXECUTE is revoked from authenticated — the call would fail at the logging
-- step. DEFINER instead; safe because the function's first statement gates on
-- household membership (auth_household_ids), same guarantee RLS gave.

create or replace function export_household(p_household uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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
