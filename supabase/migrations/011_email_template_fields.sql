-- ============================================================
-- Migration 011: Editable email template fields
-- Lets owners customize the order notification email content
-- without touching code. Safe to re-run.
-- ============================================================

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS email_header_tagline TEXT DEFAULT 'New Order Received',
  ADD COLUMN IF NOT EXISTS email_intro_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_footer_text TEXT DEFAULT 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290',
  ADD COLUMN IF NOT EXISTS email_button_text TEXT DEFAULT 'Order Dashboard',
  ADD COLUMN IF NOT EXISTS email_button_url TEXT DEFAULT '/admin/orders';
