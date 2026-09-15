-- 082_addon_after_shopped.sql
--
-- After Sinclair shops Part A, the boat sometimes calls with extras
-- (20 cases of water) and GTS grabs them on the way to deliver — usually
-- COD. Those lines must stay visible as Part B, with their own pick list.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS added_after_shopped boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN order_items.added_after_shopped IS
  'True when the line was added after the order was already Shopped (Part B extra run).';
