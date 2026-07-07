-- Fix: on the households table the audited row's household id lives in `id`,
-- not `household_id` — without this, any UPDATE to households violates the
-- audit_log.household_id NOT NULL and the write itself fails.

create or replace function audit.log_change() returns trigger
language plpgsql security definer set search_path = audit, public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_hid uuid := coalesce(
    (v_row->>'household_id')::uuid,
    case when tg_table_name = 'households' then (v_row->>'id')::uuid end
  );
begin
  insert into audit.audit_log (household_id, actor, action, table_name, row_id, diff)
  values (v_hid, auth.uid(), tg_op, tg_table_name, v_row->>'id', v_row);
  return null;
end $$;
