-- 091: one boat, one trip, several charges
--
-- WHAT THE LEDGER ACTUALLY SHOWS
-- ------------------------------
-- A year of GTS deliveries (205 rows, Oct 2025 – Sep 2026) says two things
-- about how a delivery gets billed, and the app only implemented one of them.
--
--   1. A second delivery at the same time for a DIFFERENT boat is its own
--      charge at the full rate. 47 of 140 days have more than one delivery;
--      6/23/2026 has five on one driver at $350 / $225 / $350 / $450 / $350.
--      No discount for already being out.
--
--      This already works: a different boat is a different order, and one
--      order makes one ledger row with its own fee. Nothing here changes it.
--
--   2. The SAME boat on ONE trip can take more than one service, each its own
--      charge. 5/8/2026, Coop Vanguard (Artco), one driver, one trip:
--
--          Daytime Grocery Delivery    Grafton   $350.00
--          Daytime Crew Change 1/2 off Grafton   $150.00
--
--      Two lines, two prices, the second hand-discounted. The order could only
--      ever carry ONE delivery_fee and ONE delivery_service_type, so a boat
--      that ordered groceries and a crew change could be charged for one of
--      them and the final email could only name one.
--
-- This migration is (2).
--
-- ⚠️ THE ARRAY IS THE TRUTH; THE TWO SCALAR COLUMNS ARE DERIVED.
--
-- delivery_fee and delivery_service_type are read by the deliveries ledger
-- trigger (065), the QuickBooks pack, the billing report, the CSV export and
-- the final email's grand total. Rather than chase all of those, the trigger
-- below keeps them correct: with charges present, delivery_fee IS their sum
-- and delivery_service_type IS the first one's label. Every existing reader
-- keeps working and keeps getting the right number.
--
-- With the array empty — every order placed before today — nothing changes at
-- all. The scalars behave exactly as they always have.

-- ── The charges ──────────────────────────────────────────────────────────────
-- [{ "service_type": "Daytime Crew Change", "amount": 150.00, "note": "1/2 off" }]
--
-- service_type is the LABEL, snapshotted, not a foreign key to service_types.
-- Rate cards get renamed and retired; an invoice sent in May must still say
-- what it said in May. Same reasoning as the price snapshot on catalog_rails.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_charges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN orders.service_charges IS
  'GTS service charges on this order: [{service_type, amount, note}]. One boat, one trip, several services (e.g. a grocery delivery and a crew change). When non-empty this is the source of truth and delivery_fee / delivery_service_type are derived from it by trigger (091).';

-- Carried onto the ledger row so QuickBooks can invoice a line per service
-- instead of one lump. Mirrors deliveries.side_purchases from 074.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS service_charges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN deliveries.service_charges IS
  'Copy of the order''s service charges, so the QuickBooks pack can bill one line per service. Empty on hand-typed rows and on orders with a single charge (091).';

-- ── Keep the derived columns honest ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_order_service_charges()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  IF NEW.service_charges IS NULL
     OR jsonb_typeof(NEW.service_charges) <> 'array' THEN
    NEW.service_charges := '[]'::jsonb;
  END IF;

  SELECT jsonb_array_length(NEW.service_charges) INTO n;

  -- No charges recorded: leave delivery_fee and delivery_service_type exactly
  -- as the caller set them. This is every order placed before 091 and every
  -- ordinary single-service order, and it must behave as it always did.
  IF n = 0 THEN
    RETURN NEW;
  END IF;

  -- ⚠️ SUM, NOT FIRST. A boat billed for a grocery delivery AND a crew change
  -- owes both. Taking the first would silently halve the invoice, and nothing
  -- downstream would catch it because the number would look perfectly normal.
  --
  -- ⚠️ THE REGEX IS NOT DECORATION. ::numeric on a value that is not a number
  -- raises, and because this trigger now runs on EVERY update to an order, one
  -- hand-edited row with amount:"350.00 " would make that order impossible to
  -- save at all — including impossible to fulfil. Anything that is not plainly
  -- a number is skipped and the rest still totals.
  SELECT coalesce(sum(btrim(c->>'amount')::numeric), 0)
    INTO NEW.delivery_fee
    FROM jsonb_array_elements(NEW.service_charges) AS c
   WHERE btrim(c->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$';

  -- The label is for the one-line displays that predate this (the ledger's
  -- service_type column, the reports strip). Several services get a name that
  -- says so rather than one that quietly hides the rest.
  IF n = 1 THEN
    NEW.delivery_service_type := NEW.service_charges->0->>'service_type';
  ELSE
    NEW.delivery_service_type := coalesce(NEW.service_charges->0->>'service_type', 'Delivery')
      || ' +' || (n - 1) || ' more';
  END IF;

  RETURN NEW;
END;
$$;

-- ⚠️ EVERY UPDATE, NOT JUST UPDATE OF service_charges.
--
-- Narrowing it to the one column looks tidier and quietly breaks the
-- invariant: an update that writes delivery_fee alone would not fire this, so
-- a hand-set fee could sit on an order whose charges say something different,
-- and the ledger and the invoice would then disagree with the customer's
-- email. The work is a length check and a sum over two or three elements —
-- cheap enough to do unconditionally, and correctness is not negotiable on a
-- column that becomes an invoice.
DROP TRIGGER IF EXISTS trg_sync_order_service_charges ON orders;
CREATE TRIGGER trg_sync_order_service_charges
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_service_charges();

-- Check:
-- UPDATE orders SET service_charges = '[{"service_type":"Daytime Grocery Delivery","amount":350},
--                                       {"service_type":"Daytime Crew Change","amount":150,"note":"1/2 off"}]'
--  WHERE order_number = 'GTS-…';
-- SELECT delivery_fee, delivery_service_type FROM orders WHERE order_number = 'GTS-…';
--   -> 500.00 | 'Daytime Grocery Delivery +1 more'


-- ── Carry the breakdown onto the ledger row ──────────────────────────────────
--
-- 065's trigger writes one ledger row per fulfilled order. That stays exactly
-- as it is — one boat, one trip, one row — because that is what the ledger has
-- always been and what the month's totals are built on.
--
-- What changes is that the row now also carries the breakdown, so the
-- QuickBooks pack can invoice a line per service ("Daytime Grocery Delivery
-- $350", "Daytime Crew Change $150") instead of one $500 lump that nobody in
-- accounts payable can reconcile against anything.
--
-- Redefined whole rather than patched, the same way 060 and 077 redefine
-- apply_enrich_updates: a trigger function that exists in two half-versions
-- across two migrations is a trigger function nobody can read.
CREATE OR REPLACE FUNCTION public.sync_order_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'fulfilled' THEN
    DELETE FROM deliveries WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

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
    service_charges
  ) VALUES (
    NEW.id,
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
    coalesce(NEW.service_charges, '[]'::jsonb)
  )
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO UPDATE SET
    delivery_date           = excluded.delivery_date,
    vessel_name             = excluded.vessel_name,
    company_id              = coalesce(excluded.company_id, deliveries.company_id),
    service_type            = coalesce(excluded.service_type, deliveries.service_type),
    location_delivered      = coalesce(excluded.location_delivered, deliveries.location_delivered),
    delivery_fee            = coalesce(excluded.delivery_fee, deliveries.delivery_fee),
    bill_for_groceries      = excluded.bill_for_groceries,
    sinclairs_grocery_total = coalesce(excluded.sinclairs_grocery_total, deliveries.sinclairs_grocery_total),
    -- ⚠️ NOT coalesce. Clearing the charges on the order has to clear them
    -- here too, or a service someone deliberately removed keeps invoicing.
    service_charges         = excluded.service_charges,
    updated_at              = now();
    -- …and deliberately NOT driver, hours, pay, incentive, QuickBooks or
    -- invoice_sent. Those are Jen's to fill in on the ledger.

  RETURN NEW;
END;
$fn$;

-- service_charges added to the watch list: editing the charges on a fulfilled
-- order has to reach the ledger. delivery_fee is in the list already and 091's
-- other trigger rewrites it whenever the charges change, so this is belt and
-- braces — but a fee that happens not to move (swapping a $350 service for a
-- different $350 one) would otherwise never sync.
DROP TRIGGER IF EXISTS trg_sync_order_to_ledger ON orders;
CREATE TRIGGER trg_sync_order_to_ledger
  AFTER INSERT OR UPDATE OF status, delivery_fee, delivery_service_type,
                            delivery_company_id, bill_for_groceries,
                            register_total, arrival_date, terminal_name,
                            vessel_name, service_charges
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_to_ledger();
