-- 084: hide Sinclair's "Hot Food and Prepared" deli from the vessel catalog.
--
-- WHY: a boat's ETA moves by hours. Fried chicken, rotisserie, pizza-by-the-
-- slice and the rest of that case cannot be handed over hot. Cold deli
-- (sliced meat, cheese, lunch meat) is a SIBLING department and stays.
--
-- THE SIGNAL is products.sub_category, pretty-printed from the Freshop URL
-- slug `/shop/deli/hot_food_and_prepared/…` → "Hot Food And Prepared".
-- Location cannot be used: every one of these rows reads "Cold Deli".
--
-- is_active = false, NOT delete:
--   · a deleted row is re-inserted by the next sweep
--   · disabled rows stay findable in admin substitution search
--
-- THIS STICKS. computeFields used to revive any is_active=false row the
-- moment Freshop still listed it (077). That path now refuses to revive
-- alcohol / floral / hot-prepared, and deactivates them on contact.

UPDATE products
   SET is_active = false
 WHERE is_active
   AND sub_category ILIKE 'Hot Food%';
