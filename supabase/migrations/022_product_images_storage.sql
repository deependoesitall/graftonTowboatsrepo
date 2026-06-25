-- Migration 022: Create product-images storage bucket
-- Public bucket — images are read by all visitors, written only by the service role (admin API).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public SELECT: anyone can read product images (displayed on the catalog page).
-- Drop first in case the policy already exists from a previous attempt.
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;

CREATE POLICY "product_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- INSERT / UPDATE / DELETE are handled server-side via the service role key (bypasses RLS),
-- so no additional policies are needed for admin writes.
