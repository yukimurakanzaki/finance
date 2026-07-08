-- RLS isolation test for the P0 schema (BACKEND.md §7).
-- Self-contained: seeds two real auth users + households, verifies tenant isolation,
-- then ROLLS BACK so nothing persists. Run against the live schema:
--   psql "$DATABASE_URL" -f supabase/tests/rls_isolation_test.sql
-- Every assertion below RAISEs on failure; a clean run prints 'RLS ISOLATION: PASS'.

begin;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-00000000000a','authenticated','authenticated','a@test','',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-00000000000b','authenticated','authenticated','b@test','',now(),now(),now());

create temp table t(k text, v text) on commit drop;
grant all on t to authenticated;

-- Alice creates Household A + data
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
insert into t select 'hh_a', create_household('A')::text;
with a as (
  insert into accounts (household_id,name,institution,account_type,lane)
  select v::uuid,'BCA','BCA','bank','protected_living' from t where k='hh_a' returning id
) insert into t select 'acct_a', id::text from a;
insert into transactions (household_id,date,amount,direction,account_id,lane,source)
select (select v::uuid from t where k='hh_a'), current_date, 50000,'out',
       (select v::uuid from t where k='acct_a'),'protected_living','manual';

-- Bob creates Household B
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into t select 'hh_b', create_household('B')::text;

-- Assertion 1: Bob sees zero of Alice's transactions
do $$ begin
  if (select count(*) from transactions) <> 0 then
    raise exception 'ISOLATION FAIL: Bob sees % transactions from Household A', (select count(*) from transactions);
  end if;
end $$;

-- Assertion 2: Bob cannot insert into Household A (with check)
do $$ begin
  begin
    insert into transactions (household_id,date,amount,direction,account_id,lane,source)
    values ((select v::uuid from t where k='hh_a'), current_date, 1,'out',
            (select v::uuid from t where k='acct_a'),'protected_living','manual');
    raise exception 'ISOLATION FAIL: cross-tenant insert was allowed';
  exception when insufficient_privilege then null;  -- expected: RLS blocks it
  end;
end $$;

-- Assertion 3: Alice sees exactly her 1 transaction
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from transactions) <> 1 then
    raise exception 'FAIL: Alice sees % transactions (expected 1)', (select count(*) from transactions);
  end if;
end $$;

-- Assertion 4: every public table has RLS enabled
reset role;
do $$
declare missing text;
begin
  select string_agg(relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false;
  if missing is not null then raise exception 'FAIL: tables without RLS: %', missing; end if;
end $$;

-- ===== Phase A additions =====

-- Assertion 5: audit trail exists for Alice's writes, and Bob can't see it
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from audit.audit_log where table_name = 'transactions') <> 0 then
    raise exception 'ISOLATION FAIL: Bob sees household A audit entries';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from audit.audit_log where table_name = 'transactions') < 1 then
    raise exception 'FAIL: Alice''s transaction insert was not audit-logged';
  end if;
end $$;

-- Assertion 6: audit log is immutable for API roles
do $$ begin
  begin
    update audit.audit_log set action = 'TAMPERED';
    raise exception 'FAIL: audit log UPDATE was allowed';
  exception when insufficient_privilege then null;  -- expected
  end;
  begin
    delete from audit.audit_log;
    raise exception 'FAIL: audit log DELETE was allowed';
  exception when insufficient_privilege then null;  -- expected
  end;
end $$;

-- Assertion 7: export works for a member, refuses a non-member
do $$ begin
  if (select export_household((select v::uuid from t where k='hh_a'))->>'format') <> 'fi-dashboard-household-export' then
    raise exception 'FAIL: Alice could not export her own household';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin
  begin
    perform export_household((select v::uuid from t where k='hh_a'));
    raise exception 'ISOLATION FAIL: Bob exported household A';
  exception when others then
    if sqlerrm like '%ISOLATION FAIL%' then raise; end if;  -- expected membership error
  end;
  begin
    perform delete_household((select v::uuid from t where k='hh_a'));
    raise exception 'ISOLATION FAIL: Bob deleted household A';
  exception when others then
    if sqlerrm like '%ISOLATION FAIL%' then raise; end if;  -- expected admin error
  end;
end $$;

-- Assertion 8: pass_through lane is a valid lane value
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into transactions (household_id,date,amount,direction,account_id,lane,source)
select (select v::uuid from t where k='hh_a'), current_date, 25000,'out',
       (select v::uuid from t where k='acct_a'),'pass_through','manual';

select 'RLS ISOLATION: PASS' as result;
rollback;
