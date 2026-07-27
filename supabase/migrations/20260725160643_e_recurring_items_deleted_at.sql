-- Synced soft-delete for recurring items. Watermark sync has no delete
-- channel, so a delete becomes a normal row update carrying deleted_at; other
-- devices pull it and hide the row. Nullable, no default: existing rows stay live.
alter table public.recurring_items add column if not exists deleted_at timestamptz;
