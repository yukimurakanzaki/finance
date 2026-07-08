-- Phase A (PROPOSAL §1.3, §1.8, §1.10):
--  1. pass_through as 5th lane; lane CHECKs on every lane column (only accounts had one).
--  2. engine_version on net_worth_snapshots for reproducible reports.
--  3. households.timezone — civil-date boundary computation.
--  4. assets drift vs client types: auto_price / fx_code / fx_amount, 'currency' asset_type.

-- 1. Lanes ------------------------------------------------------------------
alter table accounts drop constraint accounts_lane_check;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','assets','transactions','recurring_items'] loop
    execute format(
      $c$alter table %1$I add constraint %1$s_lane_check
         check (lane in ('income_producing','store_of_value','debt_liability','protected_living','pass_through'))$c$, t);
  end loop;
end $$;

-- 2. Engine versioning ------------------------------------------------------
alter table net_worth_snapshots add column engine_version text not null default '1.0.0';

-- 3. Household timezone -----------------------------------------------------
alter table households add column timezone text not null default 'Asia/Jakarta';

-- 4. Assets: columns the client already has ---------------------------------
alter table assets
  add column auto_price text check (auto_price in ('gold_spot','fx')),
  add column fx_code text,
  add column fx_amount numeric;
alter table assets drop constraint assets_asset_type_check;
alter table assets add constraint assets_asset_type_check
  check (asset_type in ('investment_rdpu','investment_equity','gold','dplk','storyforge','currency','other'));
