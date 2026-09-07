-- 065_sync_orders_to_ledger.sql
--
-- Web orders write themselves into the deliveries ledger.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE.
--
-- Several paths can fulfil an order — the order detail modal, the orders list,
-- a bulk action, a hand-run SQL fix — and every one of them would need to
-- remember to call a helper. One of them eventually wouldn't, and the failure
-- would be silent: the ledger would simply be short a delivery, which nobody
-- notices until month-end invoicing comes up light. A trigger cannot be
-- forgotten by a code path that doesn't know it exists.
--
-- WHAT FIRES IT
--   · an order reaching status 'fulfilled'  → the delivery happened
--   · delivery billing saved on a fulfilled order → the fee is now known
--   · an order leaving 'fulfilled' (cancelled, reopened) → its row is withdrawn
--
-- WHAT IT NEVER TOUCHES
--   Hand-typed rows. Those have order_id NULL and this only ever addresses
--   rows by order_id, so Jen's manual entries and the 171 imported historical
--   rows are invisible to it.
--
-- Deleting an order removes its row automatically — that's the ON DELETE
-- CASCADE on order_id from migration 064, not this trigger.

CREATE OR REPLACE FUNCTION public.sync_order_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
BEGIN
  -- Order is no longer a completed delivery → withdraw the auto row.
  -- Only ever deletes a row this trigger could have created.
  IF NEW.status IS DISTINCT FROM 'fulfilled' THEN
    DELETE FROM deliveries WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Prefer the barge line chosen during delivery billing. Fall back to matching
  -- the company name the boat typed at checkout, so a row still lands in the
  -- right place before anyone opens the billing dialog.
  v_company := NEW.delivery_company_id;
  IF v_company IS NULL AND coalesce(btrim(NEW.company_name), '') <> '' THEN
    SELECT c.id INTO v_company
      FROM companies c
     WHERE lower(btrim(c.name)) = lower(btrim(NEW.company_name))
     LIMIT 1;
  END IF;

  INSERT INTO deliveries (
    order_id, delivery_date, vessel_name, company_id, service_type,
    location_delivered, delivery_fee, bill_for_groceries,
    sinclairs_grocery_total, phone_number_used, issues_comments
  ) VALUES (
    NEW.id,
    -- The day of the delivery, not the day the order was placed. Boats often
    -- order days ahead, and the ledger is a record of when we went out.
    coalesce(NEW.arrival_date::date, current_date),
    NEW.vessel_name,
    v_company,
    NEW.delivery_service_type,
    NEW.terminal_name,
    NEW.delivery_fee,
    coalesce(NEW.bill_for_groceries, true),
    NEW.register_total,
    coalesce(NEW.captain_phone, NEW.phone),
    'Order ' || NEW.order_number || ' — placed on the ordering site'
  )
  -- The predicate is REQUIRED: uniq_deliveries_order is a PARTIAL index
  -- (WHERE order_id IS NOT NULL), and Postgres will not infer a partial index
  -- as the conflict arbiter unless the same predicate appears here. Without it
  -- this raises 42P10 "no unique or exclusion constraint matching the ON
  -- CONFLICT specification" the first time an order is fulfilled.
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO UPDATE SET
    -- Refresh the facts that can still change after fulfilment (the fee and
    -- grocery total arrive later, when the final email is prepared)…
    delivery_date           = excluded.delivery_date,
    vessel_name             = excluded.vessel_name,
    company_id              = coalesce(excluded.company_id, deliveries.company_id),
    service_type            = coalesce(excluded.service_type, deliveries.service_type),
    location_delivered      = coalesce(excluded.location_delivered, deliveries.location_delivered),
    delivery_fee            = coalesce(excluded.delivery_fee, deliveries.delivery_fee),
    bill_for_groceries      = excluded.bill_for_groceries,
    sinclairs_grocery_total = coalesce(excluded.sinclairs_grocery_total, deliveries.sinclairs_grocery_total),
    updated_at              = now();
    -- …and deliberately NOT driver, hours, pay, incentive, QuickBooks or
    -- invoice_sent. Those are Jen's to fill in on the ledger, and the app has
    -- no idea who drove. Overwriting them on every billing save would erase
    -- her work.

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_order_to_ledger ON orders;
CREATE TRIGGER trg_sync_order_to_ledger
  AFTER INSERT OR UPDATE OF status, delivery_fee, delivery_service_type,
                            delivery_company_id, bill_for_groceries,
                            register_total, arrival_date, terminal_name,
                            vessel_name
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_to_ledger();

COMMENT ON FUNCTION public.sync_order_to_ledger() IS
  'Keeps the deliveries ledger in step with fulfilled web orders. Never touches hand-typed rows (order_id NULL).';


-- Backfill any orders already fulfilled before this existed.
UPDATE orders SET updated_at = updated_at WHERE status = 'fulfilled';

-- Check:
-- SELECT count(*) FILTER (WHERE order_id IS NOT NULL) AS from_the_site,
--        count(*) FILTER (WHERE order_id IS NULL)     AS typed_by_hand
--   FROM deliveries;
