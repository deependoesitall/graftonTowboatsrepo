-- 074_quickbooks_handoff.sql
--
-- Everything the QuickBooks pack needs that the ledger couldn't express.
--
-- ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
--
-- QuickBooks Online Plus is the system of record. We never create an invoice,
-- an invoice number, or an email to AP. What we do is remove the part Mary
-- Karen currently does by hand: opening the Google Sheet, finding the fee,
-- finding the grocery total, and remembering which of the two gets sales tax.
--
-- That last one is the whole reason this migration exists. `bill_for_groceries`
-- was a boolean, and a boolean cannot tell the difference between:
--
--   · SINCLAIR COURTESY — GTS fronts a Sinclair's grocery bill and passes it
--     through at cost. The register total ALREADY CONTAINS SINCLAIR'S SALES
--     TAX. If QBO taxes that line again, the barge line is charged tax twice
--     and GTS remits tax it never collected.
--
--   · GTS PURCHASED — GTS bought something separately on its own exemption
--     (Ruler Foods, Walmart, ice melt, a fridge, lumber). No tax has been paid
--     yet, so QBO SHOULD tax it.
--
-- Both used to be "bill_for_groceries = true". Getting it wrong is a tax
-- error, not a cosmetic one, which is why it becomes an explicit three-way
-- choice rather than something inferred at invoice time.

-- ── grocery_mode ─────────────────────────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS grocery_mode text
    NOT NULL DEFAULT 'none'
    CHECK (grocery_mode IN ('none', 'sinclair_courtesy', 'gts_purchased'));

COMMENT ON COLUMN deliveries.grocery_mode IS
  'none | sinclair_courtesy (register total already includes Sinclair tax — QBO must NOT tax it) | gts_purchased (bought on GTS exemption — QBO SHOULD tax it). See migration 074.';

-- Backfill from the boolean it replaces. Every existing true becomes
-- sinclair_courtesy, which is what it always meant in practice — GTS was
-- passing through a Sinclair's register total. Nothing historic was a
-- separately-purchased taxable buy; those were typed into comments.
UPDATE deliveries
   SET grocery_mode = 'sinclair_courtesy'
 WHERE bill_for_groceries IS TRUE
   AND grocery_mode = 'none';

-- ⚠️ bill_for_groceries IS NOW DERIVED, NOT AUTHORITATIVE. It stays because
-- the ledger UI and the older handoff still read it. New code must read
-- grocery_mode. This trigger keeps the old column honest so nothing that
-- hasn't been migrated yet starts quietly disagreeing with the new one.
CREATE OR REPLACE FUNCTION sync_bill_for_groceries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.bill_for_groceries := (NEW.grocery_mode <> 'none');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bill_for_groceries ON deliveries;
CREATE TRIGGER trg_sync_bill_for_groceries
  BEFORE INSERT OR UPDATE OF grocery_mode ON deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_bill_for_groceries();


-- ── side_purchases ───────────────────────────────────────────────────────
-- Taxable items GTS bought separately. Free-form on purpose: this is "two bags
-- of ice melt from Walmart, $23.80", not a catalogue. Each entry is
-- {description, amount} and each becomes its own TAXABLE line in QBO.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS side_purchases jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN deliveries.side_purchases IS
  'Array of {description, amount} — items GTS bought on its own exemption. These ARE taxable in QBO, unlike Sinclair courtesy. See migration 074.';


-- ── Two independent "done in QuickBooks" flags ───────────────────────────
--
-- DELIBERATELY SEPARATE. `updated_quickbooks` conflated "I invoiced the barge
-- line" with "I paid the driver" — two different transactions, entered on
-- different days, often by different people. One flag meant marking a row done
-- for one of them hid it from the queue for the other.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS customer_invoiced_in_qb boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_invoiced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS driver_paid_in_qb       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_paid_at          timestamptz;

-- The old flag was used for customer invoicing, so that's where it lands.
UPDATE deliveries
   SET customer_invoiced_in_qb = true,
       customer_invoiced_at    = COALESCE(invoice_sent::timestamptz, updated_at)
 WHERE updated_quickbooks IS TRUE
   AND customer_invoiced_in_qb IS FALSE;


-- ── Not billable ─────────────────────────────────────────────────────────
-- Training runs, helper-only rows, waived fees. These are real deliveries that
-- must stay in the ledger for the record but must never sit in Mary's queue
-- looking like unfinished work.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS not_billable        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_billable_reason text;


-- ── Which customers demand a signed slip ─────────────────────────────────
--
-- Ingram will not pay without one. Reliant, ARTCO and Kirby do not ask.
-- Treating "slip missing" as an error on every row trained everyone to ignore
-- the warning, which is how it gets missed on the one customer that cares.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS requires_signed_receipt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.requires_signed_receipt IS
  'True when this barge line will not pay an invoice without a photographed signed delivery log. Drives the "need slip" warning on the QuickBooks pack.';

-- Ingram is the known case. Matching on name because company ids differ per
-- environment; safe to re-run and a no-op if the name never matches.
UPDATE companies
   SET requires_signed_receipt = true
 WHERE requires_signed_receipt IS FALSE
   AND name ILIKE '%ingram%';


-- ── The queue's index ────────────────────────────────────────────────────
-- Mary's screen is "not yet invoiced, not written off, newest first". Partial
-- so it stays small as years of invoiced rows accumulate behind it.
CREATE INDEX IF NOT EXISTS idx_deliveries_qb_queue
  ON deliveries (delivery_date DESC)
  WHERE customer_invoiced_in_qb IS FALSE AND not_billable IS FALSE;


-- ── Verify ───────────────────────────────────────────────────────────────
-- SELECT grocery_mode, count(*) FROM deliveries GROUP BY 1;
--
-- Should equal the old boolean exactly:
-- SELECT count(*) FROM deliveries
--  WHERE bill_for_groceries <> (grocery_mode <> 'none');   -- expect 0
--
-- The queue Mary will actually see:
-- SELECT count(*) FROM deliveries
--  WHERE customer_invoiced_in_qb IS FALSE AND not_billable IS FALSE;
