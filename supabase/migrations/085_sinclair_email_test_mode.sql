-- 085: Sinclair shopping-desk test mode.
--
-- Production inboxes stay in sinclair_order_emails. Test mode routes the
-- Shop-now copy to sinclair_test_emails instead, so Deepen can catch a
-- real grocery email without writing over Dave's addresses.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS sinclair_email_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sinclair_test_emails TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN admin_settings.sinclair_email_test_mode IS
  'When true, new grocery Shop-now emails go to sinclair_test_emails, not the Sinclair desk.';
COMMENT ON COLUMN admin_settings.sinclair_test_emails IS
  'Comma-separated override inboxes used while sinclair_email_test_mode is on.';
