-- Last Google → ledger sync stamp. Safe to run more than once.
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS google_ledger_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_ledger_sync_note text,
  ADD COLUMN IF NOT EXISTS google_ledger_sync_ok boolean;

COMMENT ON COLUMN admin_settings.google_ledger_synced_at IS
  'When the Google delivery spreadsheet was last pulled into the admin ledger.';
COMMENT ON COLUMN admin_settings.google_ledger_sync_note IS
  'Short last-run summary (tabs, counts, first error).';
COMMENT ON COLUMN admin_settings.google_ledger_sync_ok IS
  'True when the last Google ledger pull finished without tab or apply errors.';
