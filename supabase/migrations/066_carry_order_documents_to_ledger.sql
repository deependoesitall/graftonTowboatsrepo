-- 066_carry_order_documents_to_ledger.sql
--
-- CARRY THE SIGNED LOG AND THE RECEIPT INTO THE LEDGER ROW.
--
-- THE GAP THIS CLOSES.
-- Migration 065 taught fulfilled orders to write themselves into the deliveries
-- ledger, but it copied only the money and the logistics — never the two
-- documents. So an order that had Sinclair's receipt and the signed delivery
-- log sitting on it produced a ledger row with neither, and that row then
-- arrived in the QuickBooks queue looking like paperwork nobody had done.
--
-- For Ingram that is not cosmetic: their accounts payable rejects a delivery
-- invoice that arrives without the signed log, so the queue would have been
-- telling Mary Karen to chase a document the app was already holding.
--
-- MIND THE COLUMN NAMES — THEY DIFFER BY TABLE.
--     orders.ingram_slip_url          (migration 047)
--     deliveries.ingram_slip_image_url (migration 044)
-- Same document, two names, and reading the wrong one fails silently: you get
-- NULL rather than an error, and every Ingram row quietly looks unpaperworked.
-- Sinclair's receipt happens to be spelled the same on both tables.
--
-- WHY coalesce(excluded.…, deliveries.…) ON UPDATE.
-- Documents are uploaded AFTER the delivery is fulfilled, so this has to keep
-- refreshing. But a document can also be attached on the ledger side, to a row
-- whose order never got one. `excluded` wins when the order has a document;
-- otherwise whatever is already on the ledger row survives. Nothing that was
-- uploaded by hand is ever erased by an order that lacks it.

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
    sinclairs_grocery_total, phone_number_used, issues_comments,
    sinclairs_receipt_url, ingram_slip_image_url
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
    'Order ' || NEW.order_number || ' — placed on the ordering site',
    NEW.sinclairs_receipt_url,
    NEW.ingram_slip_url          -- note the rename across tables
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
    -- …including the paperwork, which is nearly always uploaded after the fact.
    sinclairs_receipt_url   = coalesce(excluded.sinclairs_receipt_url, deliveries.sinclairs_receipt_url),
    ingram_slip_image_url   = coalesce(excluded.ingram_slip_image_url, deliveries.ingram_slip_image_url),
    updated_at              = now();
    -- …and deliberately NOT driver, hours, pay, incentive, QuickBooks or
    -- invoice_sent. Those are Jen's to fill in on the ledger, and the app has
    -- no idea who drove. Overwriting them on every billing save would erase
    -- her work.

  RETURN NEW;
END;
$fn$;

-- The trigger must also FIRE when a document is uploaded. Without the two new
-- columns in this list, attaching Sinclair's receipt to an already-fulfilled
-- order would update `orders` and never reach the ledger — the exact silent
-- failure this migration exists to fix.
DROP TRIGGER IF EXISTS trg_sync_order_to_ledger ON orders;
CREATE TRIGGER trg_sync_order_to_ledger
  AFTER INSERT OR UPDATE OF status, delivery_fee, delivery_service_type,
                            delivery_company_id, bill_for_groceries,
                            register_total, arrival_date, terminal_name,
                            vessel_name, sinclairs_receipt_url, ingram_slip_url
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_to_ledger();

COMMENT ON FUNCTION public.sync_order_to_ledger() IS
  'Keeps the deliveries ledger in step with fulfilled web orders, documents included. Never touches hand-typed rows (order_id NULL).';

-- Backfill: replay every already-fulfilled order so existing ledger rows pick
-- up the documents they should have had. Safe to re-run — the upsert updates
-- in place and leaves Jen's hand-entered columns alone.
UPDATE orders SET updated_at = updated_at WHERE status = 'fulfilled';

-- Check — every ledger row that came from an order, and whether it has its
-- paperwork:
-- SELECT d.delivery_date, d.vessel_name,
--        (d.sinclairs_receipt_url IS NOT NULL) AS has_receipt,
--        (d.ingram_slip_image_url IS NOT NULL) AS has_signed_log
--   FROM deliveries d
--  WHERE d.order_id IS NOT NULL
--  ORDER BY d.delivery_date DESC;
