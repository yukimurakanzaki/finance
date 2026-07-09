-- Transactions gain a user-facing title; note remains the optional description.
alter table public.transactions add column if not exists title text;
