-- Synced soft-delete for income events, mirroring recurring_items. Watermark
-- sync has no delete channel, so a delete becomes a normal row update carrying
-- deleted_at; other devices pull it and hide the row. Without this column the
-- push of a tombstoned row 400s on an unknown column. Nullable, no default:
-- existing rows stay live.
alter table public.income_events add column if not exists deleted_at timestamptz;
