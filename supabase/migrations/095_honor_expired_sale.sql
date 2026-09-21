-- Dave: honor or refuse a lapsed shelf sale per line on Order Details / pick sheet.
-- regular_price + sale_finish_date already snapshot the quote (migration 060).
-- sale_unit_price keeps the quoted sale when unit_price is flipped to regular.
-- honor_expired_sale: null = undecided, true = keep sale, false = charge regular.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS honor_expired_sale boolean,
  ADD COLUMN IF NOT EXISTS sale_unit_price numeric(10,2);

COMMENT ON COLUMN public.order_items.honor_expired_sale IS
  'null=undecided; true=Sinclair honored lapsed sale price; false=charge regular_price';
COMMENT ON COLUMN public.order_items.sale_unit_price IS
  'Quoted sale unit price (snapshot). Used to restore unit_price when honoring after a refuse.';

-- Backfill sale_unit_price while unit_price is still the sale quote.
UPDATE public.order_items
SET sale_unit_price = unit_price
WHERE regular_price IS NOT NULL
  AND sale_finish_date IS NOT NULL
  AND sale_unit_price IS NULL
  AND unit_price IS NOT NULL
  AND unit_price < regular_price;
