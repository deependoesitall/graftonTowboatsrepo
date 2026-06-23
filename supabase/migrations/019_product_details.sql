-- Migration 019: add details column to products
-- Stores a freeform text description shown to customers in the catalog.
-- The existing "description" column is the item name and stays unchanged.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS details text;
