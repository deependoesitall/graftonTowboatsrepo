-- 070_fix_view_security_invoker.sql
--
-- FIXES A REAL LEAK INTRODUCED BY MIGRATION 069.
--
-- Supabase's linter flagged `public.products_catalog` as CRITICAL:
-- "Security Definer View". It is right, and this is worth understanding
-- properly because the same mistake is easy to repeat.
--
-- ── WHAT WENT WRONG ──────────────────────────────────────────────────────
--
-- In Postgres a view runs, by default, with the permissions of the user who
-- CREATED it — not the user querying it. That means a view over an
-- RLS-protected table quietly bypasses that table's row-level security.
--
-- `products` has this policy (migration 001):
--
--     CREATE POLICY products_public_read ON products
--       FOR SELECT USING (is_active = TRUE);
--
-- So the public anon key — which ships in the browser bundle and is meant to
-- be public — can normally read ONLY active products. My view had no such
-- restriction, so anyone could have queried `products_catalog` with that key
-- and read every INACTIVE row too:
--
--   · the hot ready-to-eat deli items we're about to disable
--   · anything Jen or Dave deactivated for any reason
--   · dead stock that was pulled from sale
--
-- Not catastrophic — it's product data, not customer data — but it is exactly
-- the class of mistake that ends up exposing something that matters, and the
-- linter was right to shout.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────
--
-- `security_invoker = true` (Postgres 15+) makes the view run with the
-- QUERYING user's permissions, so the underlying RLS policies apply normally:
--
--   · anon querying the view  → only is_active = TRUE rows, as intended
--   · service role (our API)  → full access via products_service_all
--
-- Nothing in the app changes. Every server route already uses the service
-- role, which the existing policy grants full access to.

DROP VIEW IF EXISTS products_catalog;

CREATE VIEW products_catalog
WITH (security_invoker = true)
AS
SELECT
  p.*,
  (
    -- Its own photo…
    (p.image_url IS NOT NULL AND btrim(p.image_url) <> '')
    -- …or one it will visibly borrow from a size sibling.
    OR (
      p.variant_group IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM products s
         WHERE s.variant_group = p.variant_group
           AND s.image_url IS NOT NULL
           AND btrim(s.image_url) <> ''
      )
    )
  ) AS has_visible_image
FROM products p;

COMMENT ON VIEW products_catalog IS
  'products plus has_visible_image — true when the card will render a photo, including one borrowed from a variant-group sibling. security_invoker=true so the caller''s RLS applies (see migration 070).';


-- ══════════════════════════════════════════════════════════════════════════
-- SEPARATE, LOWER-PRIORITY: the two "Auth RLS Initialization Plan" warnings.
--
-- These are PERFORMANCE, not security, and they predate this work. Supabase
-- notices that `auth.role() = 'service_role'` is re-evaluated for EVERY ROW
-- scanned, rather than once per query. On a 12,000-row product sweep that is
-- 12,000 redundant function calls.
--
-- Wrapping the call in a scalar subquery lets Postgres evaluate it once and
-- reuse the result. The policies are otherwise IDENTICAL in meaning — same
-- role, same access, no behavioural change.
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS products_service_all ON products;
CREATE POLICY products_service_all ON products
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS orders_service_all ON orders;
CREATE POLICY orders_service_all ON orders
  FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- Check — the view should now report security_invoker:
-- SELECT c.relname, c.reloptions
--   FROM pg_class c
--  WHERE c.relname = 'products_catalog';
-- -- expect reloptions to contain: security_invoker=true
--
-- And confirm the public key can't see disabled stock through it:
-- SET ROLE anon;
-- SELECT count(*) FROM products_catalog WHERE NOT is_active;  -- expect 0
-- RESET ROLE;
