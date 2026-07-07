-- Fix: gen_random_bytes lives in the `extensions` schema on Supabase; with
-- search_path pinned to public the call failed at runtime (caught by the invite
-- smoke test). Use md5(random) instead — no extension dependency.

create or replace function create_invite(p_household uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not is_household_admin(p_household) then
    raise exception 'only a household admin can create invites';
  end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    begin
      insert into invites (household_id, code, invited_by, expires_at)
      values (p_household, v_code, auth.uid(), now() + interval '7 days');
      exit;
    exception when unique_violation then null;  -- regenerate
    end;
  end loop;
  perform audit.log_event(p_household, 'create_invite');
  return v_code;
end $$;
