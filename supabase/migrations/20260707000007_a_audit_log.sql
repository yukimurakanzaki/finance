-- Phase A G2 (PROPOSAL §2.5): immutable append-only audit log.
-- Separate schema, NOT exposed via PostgREST. Writes happen only through a
-- SECURITY DEFINER trigger function; no API role holds INSERT/UPDATE/DELETE.
-- Retention policy (PROPOSAL §4 pt.12): 24 months online, then archive — enforced operationally.

create schema audit;

create table audit.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid not null,          -- no FK: entries must survive household deletion
  actor        uuid,                   -- auth.uid() of the writer; null for system
  action       text not null,          -- INSERT/UPDATE/DELETE or event name (export, delete_household, ...)
  table_name   text,
  row_id       text,
  diff         jsonb,                  -- new row for INSERT/UPDATE, old row for DELETE
  at           timestamptz not null default now()
);
create index on audit.audit_log (household_id, at);

alter table audit.audit_log enable row level security;
create policy al_member_read on audit.audit_log
  for select using (household_id in (select auth_household_ids()));

-- Row-change trigger. DEFINER so RLS on audit_log doesn't block the insert;
-- household_id is taken from the row being written, never from the caller.
create or replace function audit.log_change() returns trigger
language plpgsql security definer set search_path = audit, public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit.audit_log (household_id, actor, action, table_name, row_id, diff)
  values ((v_row->>'household_id')::uuid, auth.uid(), tg_op, tg_table_name, v_row->>'id', v_row);
  return null;  -- AFTER trigger
end $$;

-- Explicit event logger for RPCs (export, deletion, invites, role changes).
create or replace function audit.log_event(p_household uuid, p_action text, p_diff jsonb default null)
returns void language sql security definer set search_path = audit, public as $$
  insert into audit.audit_log (household_id, actor, action, diff)
  values (p_household, auth.uid(), p_action, p_diff)
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts','envelopes','categories','assets','transactions',
                           'recurring_items','net_worth_snapshots','income_events','milestones',
                           'allowances','assumptions','memberships','invites','households'] loop
    execute format(
      'create trigger t_%1$s_audit after insert or update or delete on %1$I for each row execute function audit.log_change()', t);
  end loop;
end $$;

-- Lockdown: nobody calls the trigger fn directly; members may call log_event only
-- indirectly (it is invoked from RPCs); schema stays out of the API.
revoke all on schema audit from public;
grant usage on schema audit to authenticated;   -- needed for RLS/select via future RPC
grant select on audit.audit_log to authenticated;
revoke execute on function audit.log_change() from public, anon, authenticated;
revoke execute on function audit.log_event(uuid, text, jsonb) from public, anon, authenticated;
