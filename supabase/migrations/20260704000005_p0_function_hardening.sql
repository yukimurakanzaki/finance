-- P0 function hardening: pin search_path, lock EXECUTE grants.
-- Advisor: 0011 (mutable search_path), 0028 (anon can execute definer fns).

alter function set_updated_at() set search_path = public;
alter function import_batch(uuid, jsonb, text, bigint, jsonb) set search_path = public;

-- Internal RLS helpers: authenticated needs EXECUTE for policy evaluation; nobody else.
revoke execute on function auth_household_ids() from public, anon;
grant  execute on function auth_household_ids() to authenticated;
revoke execute on function is_household_admin(uuid) from public, anon;
grant  execute on function is_household_admin(uuid) to authenticated;

-- Trigger-only function: no role should call it via RPC (triggers fire regardless).
revoke execute on function handle_new_user() from public, anon, authenticated;

-- User-facing RPCs: signed-in users only, never anon.
revoke execute on function create_household(text) from public, anon;
grant  execute on function create_household(text) to authenticated;
revoke execute on function accept_invite(text) from public, anon;
grant  execute on function accept_invite(text) to authenticated;
revoke execute on function import_batch(uuid, jsonb, text, bigint, jsonb) from public, anon;
grant  execute on function import_batch(uuid, jsonb, text, bigint, jsonb) to authenticated;
