-- Migration 059: a separate DECK register total
--
-- Dave, August demo:
--   "when we print out a receipt to send to that vessel, he needs to have a
--    grocery order and a deck order."
--   "the boat really needs to see, this is how much the deck order was, and
--    this is how much the grocery order was."
--
-- Deck supplies are company-billed but invoiced SEPARATELY — they don't count
-- against the boat's grocery allowance ("grocery goes against the boat
-- allowance, deck does not"). Most vessels don't penalise the boat for deck
-- items, so the two figures have to arrive as two numbers, not one.
--
-- register_total keeps its existing meaning: the GROCERY total rung at the
-- register. This adds the deck one alongside it. NULL means the order had no
-- deck lines, or the deck total hasn't been keyed yet — which is different from
-- zero, and the difference matters when reconciling a receipt.
--
-- Asked whether two totals to type was too much: "No. Only in the event we have
-- grocery versus deck. Yeah, we have to do that."

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deck_register_total NUMERIC(10, 2);

COMMENT ON COLUMN orders.register_total IS
  'GROCERY total actually rung at Sinclair''s register. Overrides the system estimate for billing.';
COMMENT ON COLUMN orders.deck_register_total IS
  'DECK total actually rung at Sinclair''s register — invoiced separately from the grocery allowance. NULL = no deck lines, or not yet keyed.';

SELECT count(*) FILTER (WHERE register_total IS NOT NULL)      AS with_grocery_total,
       count(*) FILTER (WHERE deck_register_total IS NOT NULL) AS with_deck_total
  FROM orders;
