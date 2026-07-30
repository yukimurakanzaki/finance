-- T1a onboarding snooze (plan §7 / TR-1.1). Dexie version(12) backfills the
-- same field on the local row; this adds the matching column to the cloud
-- allowances table so the watermark push stays in sync (TR-X2).
--
-- Nullable, no default: existing rows stay unsnoozed, exactly like the
-- existing fields on this table.
alter table public.allowances
  add column if not exists onboarding_snoozed_until timestamptz;
