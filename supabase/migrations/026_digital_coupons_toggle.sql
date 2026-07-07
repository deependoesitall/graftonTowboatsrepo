-- 026_digital_coupons_toggle.sql
-- Sinclair-manager-controlled toggle for the auto-pulled digital coupons
-- strip on the catalog. Defaults ON (demo-friendly); Dave's team should
-- only leave it on if staff honor digital-coupon prices on shopped orders.
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS show_digital_coupons BOOLEAN NOT NULL DEFAULT TRUE;
