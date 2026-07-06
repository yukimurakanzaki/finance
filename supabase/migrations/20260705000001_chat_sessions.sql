-- Chat session management: sessions, messages, memories, custom skills
-- All household-scoped with RLS via auth_household_ids() helper from 000002.

-- Chat sessions
create table chat_sessions (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  model text not null default 'gemini-2.5-flash',
  skills text[] not null default '{}',
  archived_at timestamptz,
  message_count int not null default 0,
  total_input_tokens int not null default 0,
  total_output_tokens int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_chat_sessions_updated before update on chat_sessions
  for each row execute function set_updated_at();
create index on chat_sessions (household_id);
create index on chat_sessions (member_id);

-- Chat messages
create table chat_messages (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_chat_messages_updated before update on chat_messages
  for each row execute function set_updated_at();
create index on chat_messages (session_id);
create index on chat_messages (household_id);

-- Persistent AI memory
create table chat_memories (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  content text not null,
  source_session_id uuid references chat_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_chat_memories_updated before update on chat_memories
  for each row execute function set_updated_at();
create index on chat_memories (household_id);

-- User-created custom skills
create table chat_custom_skills (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  description text not null default '',
  icon text not null default '⚡',
  prompt_injection text not null,
  source_session_id uuid references chat_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_chat_custom_skills_updated before update on chat_custom_skills
  for each row execute function set_updated_at();
create index on chat_custom_skills (household_id);

-- RLS
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table chat_memories enable row level security;
alter table chat_custom_skills enable row level security;

create policy cs_all on chat_sessions for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create policy cm_all on chat_messages for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create policy cmem_all on chat_memories for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create policy csk_all on chat_custom_skills for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
