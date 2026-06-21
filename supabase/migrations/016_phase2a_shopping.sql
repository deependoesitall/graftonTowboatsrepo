-- supabase/migrations/016_phase2a_shopping.sql
-- Phase 2a: Staff Shopping Tools
-- Adds per-item shopping state to order_items so staff can track what
-- has been shopped, what was out-of-stock, and any actual weights.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS shopping_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (shopping_status IN ('pending', 'shopped', 'out_of_stock')),

  -- Actual weight entered by staff for by-weight items (e.g. LB)
  ADD COLUMN IF NOT EXISTS actual_weight NUMERIC,

  -- Recalculated line total when actual_weight is provided
  ADD COLUMN IF NOT EXISTS actual_total NUMERIC,

  -- True for items that were created as substitutions for an out-of-stock item
  ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN NOT NULL DEFAULT false,

  -- Points back to the original order_item this substitutes
  ADD COLUMN IF NOT EXISTS substitutes_item_id UUID REFERENCES order_items(id);
