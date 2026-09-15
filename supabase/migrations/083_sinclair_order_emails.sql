-- 083_sinclair_order_emails.sql
-- GTS staff set Sinclair's shopping-desk inboxes in Settings — no Vercel env.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS sinclair_order_emails TEXT NOT NULL
    DEFAULT 'sinclairfoods@jerseyville-il.net, dwittman@jerseyville-il.net';

COMMENT ON COLUMN admin_settings.sinclair_order_emails IS
  'Comma-separated Sinclair''s inboxes for new grocery / shop-now emails. GTS-editable in Settings.';
