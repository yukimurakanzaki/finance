-- Transactions can tag the recurring item they pay (safe-to-spend T2):
-- tagged payments no longer draw the personal pool. No FK on purpose — sync
-- pushes tables independently, so a transaction may land before its
-- recurring item.
alter table public.transactions add column if not exists recurring_item_id uuid;
