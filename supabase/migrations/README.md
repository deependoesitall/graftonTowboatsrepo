# Migrations

**Grant Data API access explicitly.** From Oct 30, 2026 Supabase no longer grants
the Data API roles access to new tables in `public`. Every migration that creates
a public table must add its own `GRANT` statements:

- Grant only what the app uses. Most tables here are server-only: `ENABLE ROW
  LEVEL SECURITY` with no policies, and
  `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<t> TO service_role;`
- For a `serial`/`bigserial`/identity column, also
  `GRANT USAGE, SELECT ON SEQUENCE public.<t>_<col>_seq TO service_role;`
- Grant to `anon` or `authenticated` only when the browser really queries the
  table, and only together with RLS policies that limit what it can see.
- New functions follow the same rule (`GRANT EXECUTE ... TO service_role`).

See `106_email_builder.sql` for an example.
