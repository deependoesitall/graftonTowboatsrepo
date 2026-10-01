-- 098_order_handoff.sql
--
-- WHERE A SHOPPED ORDER PHYSICALLY IS.
--
-- Sinclair's finishing an order is not the same as Grafton Towboat having it.
-- Two things happen after the register: either Sinclair's runs the order down
-- to GTS's walk-in coolers in Grafton, or it is boxed at Sinclair's and a GTS
-- driver has to go get it. Nothing in the system said which, so an order could
-- sit at Sinclair's for a day with everyone assuming someone else had it.
--
-- ⚠️ INTERNAL ONLY. This is staff logistics between two businesses. It is not
-- on the customer order view, not in the confirmation email, and not in the
-- shopped email. A vessel is told its order is on the way by GTS, once.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handoff    TEXT,
  ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_by TEXT;

-- Idempotent: re-running this file must not error on the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_handoff_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_handoff_check
      CHECK (handoff IS NULL OR handoff IN ('delivered_to_gts', 'awaiting_gts_pickup'));
  END IF;
END $$;

-- "What is sitting at Sinclair's right now" is the query Jen will actually run.
CREATE INDEX IF NOT EXISTS orders_handoff_idx
  ON public.orders (handoff)
  WHERE handoff IS NOT NULL;

COMMENT ON COLUMN public.orders.handoff IS
  'Staff-only. delivered_to_gts = Sinclair''s brought it to GTS storage. awaiting_gts_pickup = boxed at Sinclair''s, GTS collects. Never shown to a vessel.';
