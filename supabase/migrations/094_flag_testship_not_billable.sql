-- Numbered 094 (092 = profile vessel_name, 093 = vessel_members RLS). Already applied in prod.
-- Flag the TestShip junk row as not billable (hide via ledger filter).
-- Do NOT delete — keeps the order linkage for debugging.
UPDATE public.deliveries
SET not_billable = true,
    not_billable_reason = 'test order',
    updated_at = now()
WHERE vessel_name ILIKE 'TestShip'
  AND delivery_date = '2026-08-22'
  AND not_billable IS DISTINCT FROM true;
