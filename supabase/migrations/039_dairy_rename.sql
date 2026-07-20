-- 039_dairy_rename.sql
-- "Dairy & Eggs" → "Dairy" (Deepen, July 20 — simpler, matches Sinclair's own
-- department naming). Data-side rename; the code constants changed in the
-- same deploy. Historical order_items renamed too so old orders group cleanly.
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–038).

UPDATE products    SET category = 'Dairy' WHERE category = 'Dairy & Eggs';
UPDATE order_items SET category = 'Dairy' WHERE category = 'Dairy & Eggs';
