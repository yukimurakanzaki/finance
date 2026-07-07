-- Phase B (PROPOSAL §1.9): invite creation + admin transfer, both admin-gated
-- and audit-logged. Complements the existing accept_invite RPC.

-- Generate a shareable join code for the household. 7-day expiry.
create or replace function create_invite(p_household uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not is_household_admin(p_household) then
    raise exception 'only a household admin can create invites';
  end if;
  -- 8-char uppercase code, collision-retried.
  loop
    v_code := upper(encode(gen_random_bytes(4), 'hex'));
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

-- Hand the admin role to another member; the caller becomes a regular member.
create or replace function transfer_admin(p_household uuid, p_to_user uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_household_admin(p_household) then
    raise exception 'only a household admin can transfer the admin role';
  end if;
  if not exists (select 1 from memberships
                 where household_id = p_household and user_id = p_to_user) then
    raise exception 'target user is not a member of this household';
  end if;
  update memberships set role = 'admin'
    where household_id = p_household and user_id = p_to_user;
  update memberships set role = 'member'
    where household_id = p_household and user_id = auth.uid();
  perform audit.log_event(p_household, 'transfer_admin',
    jsonb_build_object('to_user', p_to_user));
end $$;

revoke execute on function create_invite(uuid) from public, anon;
grant  execute on function create_invite(uuid) to authenticated;
revoke execute on function transfer_admin(uuid, uuid) from public, anon;
grant  execute on function transfer_admin(uuid, uuid) to authenticated;
