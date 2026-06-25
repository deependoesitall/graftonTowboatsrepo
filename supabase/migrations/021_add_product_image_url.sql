-- Migration 021: Add image_url to products table
-- Allows each product to store a URL pointing to its image in Supabase Storage.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

COMMENT ON COLUMN products.image_url IS 'Public URL of the product image stored in Supabase Storage (product-images bucket).';
