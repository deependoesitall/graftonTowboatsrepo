-- ============================================================
-- Migration 009: Add admin notes to activity_logs
-- Lets owners annotate why an action was taken (e.g. "deleted test orders")
-- Safe to re-run.
-- ============================================================

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS note TEXT;
