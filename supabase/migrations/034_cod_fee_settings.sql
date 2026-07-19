-- 034_cod_fee_settings.sql
-- COD handling fee becomes a toggleable, configurable feature (Deepen July 19).
--
--   cod_fee_enabled  — master switch. OFF = no fee is added to any new COD
--                      order (existing orders keep their snapshot).
--   cod_fee_percent  — the default percent applied at checkout when enabled
--                      (Dave: "default 5%, but we can edit it ourselves").
--                      Per-order override still lives on orders.cod_fee_percent.
--
-- Manager-editable (Sinclair's collects most CODs, the fee offsets their
-- Venmo/Cash App/card processing).
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–033).

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS cod_fee_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cod_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 5;
