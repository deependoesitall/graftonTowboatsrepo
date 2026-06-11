# Security — Admin Authentication

This document describes the admin authentication and authorization design
after the June 2026 security hardening pass.

## Overview

- **Sessions**: signed JWTs (HS256, `jsonwebtoken`), secret = `ADMIN_SECRET_KEY`.
- **Storage**: httpOnly, `Secure` (in production), `SameSite=Strict` cookie
  named `gts_admin_session`. Never readable or storable by client-side JS.
- **Expiry**: 10 hours. Expired/invalid tokens are rejected and treated as
  "not logged in".
- **Passwords**: bcrypt (`bcryptjs`, cost factor 12), per-password random
  salt baked into the hash automatically.
- **Authorization**: enforced **server-side, on every admin API route**, via
  `requireAdmin()` in `src/lib/admin-auth-server.ts`. Client-side role checks
  (`canAccess`/`canEdit` in `src/lib/admin-auth.ts`) are UI-only convenience
  and are not trusted for security decisions.

## Login flow

1. User submits username+password (or just password for the legacy
   single-admin login) to `POST /api/admin/auth`.
2. Server verifies the password against `admin_users.password_hash` (or
   `admin_settings.admin_password_hash` for legacy login).
3. On success, the server signs a JWT containing `{ sub, username, role,
   display_name }` and sets it as the `gts_admin_session` cookie. The token
   itself is **never included in the JSON response body**.
4. The client receives only `{ user: { username, role, display_name } }` and
   caches these (non-secret) values in `sessionStorage` for UI purposes
   (showing/hiding nav items, displaying the admin's name).

## Every subsequent request

- The browser automatically attaches the `gts_admin_session` cookie
  (`credentials: 'include'` is used by `adminFetch()` in
  `src/lib/admin-auth.ts`, though same-origin requests send cookies by
  default anyway).
- Each admin API route calls `requireAdmin(req, { area, editRequired,
  ownerOnly })`, which:
  1. Verifies the JWT signature and expiry.
  2. Returns `401 Unauthorized` if the cookie is missing or invalid.
  3. Checks the role against the requested area's permission matrix and
     returns `403 Forbidden` if the role doesn't have access.
  4. Otherwise returns the verified `{ sub, username, role, display_name }`
     for the route to use (e.g. for activity-log attribution).

## Role matrix (server-enforced)

| Area      | Owner | Manager | Staff |
|-----------|-------|---------|-------|
| orders (view) | ✅ | ✅ | ✅ |
| orders (edit) | ✅ | ✅ | ✅ (status only) |
| products (view/edit) | ✅ | ✅ | ❌ |
| settings | ✅ | ❌ | ❌ |
| reports | ✅ | ❌ | ❌ |
| logs | ✅ | ❌ | ❌ |
| user management | ✅ | ❌ | ❌ |
| order deletion | ✅ | ❌ | ❌ |

## Logout

`POST /api/admin/logout` clears the session cookie server-side
(`maxAge: 0`). The client also clears its cached UI hints
(`sessionStorage`).

## Session check

`GET /api/admin/me` returns `{ username, role, display_name }` if the
session cookie is valid, or `401` otherwise. The client calls this on page
load to determine whether to show the login form or the admin UI, and to
populate role-based UI state.

## Password storage & migration

- New/changed passwords are always hashed with bcrypt (`$2a$`/`$2b$`
  prefix, ~60 chars).
- Existing accounts created before this change have SHA-256 hashes (64 hex
  chars, `sha256(password + 'gts-salt-2024')`).
- `verifyPassword()` in `src/lib/password.ts` detects the hash format. If a
  legacy SHA-256 hash verifies successfully, the server **immediately
  re-hashes the password with bcrypt and saves it** — no user action or
  forced reset is required. This happens transparently on next login for
  every existing account.
- The hardcoded fallback password (`grafton2024`) has been **removed**.
  The legacy single-password login now only works if `ADMIN_PASSWORD` is
  set in the environment AND no `admin_password_hash` has been stored yet
  in `admin_settings`. Once any password is set (via env var on first
  login, or via the Settings page), it's the source of truth and
  `ADMIN_PASSWORD` is no longer consulted for that path.

## Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `ADMIN_SECRET_KEY` | **Yes** | Long random string (`openssl rand -hex 32`). Signs session JWTs. Server-side only — never sent to the client. |
| `ADMIN_PASSWORD` | First-run only | Used only if no password hash exists yet in `admin_settings`. Can be removed from env vars after first successful login (the password is then stored as a bcrypt hash and managed via the admin Settings page). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side only. |
| `RESEND_API_KEY` | For email | — |
| `EMAIL_FROM` | For email | — |
| `BUSINESS_EMAIL` | For email | — |
| `NEXT_PUBLIC_APP_URL` | Recommended | Used in emails and the admin Settings page; no hardcoded production URL fallback remains. |

## What changed from the previous design

| Before | After |
|---|---|
| `ADMIN_SECRET_KEY` returned in login response, stored in `sessionStorage`, sent as `x-admin-token` on every request | Never leaves the server. JWT session in httpOnly cookie. |
| Role enforcement only in client-side `canAccess`/`canEdit` | Enforced server-side via `requireAdmin()` on every admin route |
| SHA-256 + hardcoded salt (`'gts-salt-2024'`) | bcrypt, per-password salt |
| Hardcoded fallback password `grafton2024` | Removed — fails closed if `ADMIN_PASSWORD` unset and no hash stored |
| Hardcoded production URL fallback (`grafton-towboatsrepo.vercel.app`) | Requires `NEXT_PUBLIC_APP_URL`; falls back to `localhost:3000` for local dev only |
| No `.gitignore` | Added — blocks `.env*`, `node_modules/`, `.next/`, `.vercel/`, etc. |
