-- Pull the shared Google delivery sheet into the admin ledger every 15 minutes.
-- The header secret lives in Supabase Vault as 'ledger_sync_secret' (same value
-- as the LEDGER_SYNC_SECRET env var on Vercel); it is never stored here.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('delivery-ledger-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-ledger-sync');

SELECT cron.schedule(
  'delivery-ledger-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://graftontowboatservices.com/api/cron/delivery-ledger-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ledger-sync-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ledger_sync_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
