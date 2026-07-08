-- Phase A D1: AI proxy usage ledger — per-user budget enforcement + PROMPT_VERSION
-- telemetry (audit E6/E9). Written exclusively by the service role (the Edge
-- Function); users can read their own rows.

create table ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null,
  model          text not null,
  prompt_version int,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  status         text not null default 'ok',   -- ok | api_error | over_budget
  created_at     timestamptz not null default now()
);
create index on ai_usage (user_id, created_at);

alter table ai_usage enable row level security;
create policy au_own_read on ai_usage for select using (user_id = auth.uid());
-- no insert/update/delete policies: only service_role (bypasses RLS) writes.
