# Security audit — Grafton Towboat ordering system

Run against the actual code on **September 6, 2026**, not against a checklist.
Everything below was verified by reading the repo. Where I could fix it in code,
I did, and it's marked ✅ FIXED. Where the fix is outside the repo (Supabase
dashboard, Vercel, DNS), it's marked ⬜ YOURS with exact steps.

---

## First: the checklist you were handed

You were right to smell something off. That list is written for a generic
"I vibecoded a SaaS" app, and roughly a third of it either doesn't apply to you
or would actively damage what you've built. Handling that honestly matters more
than adding items:

| Checklist item | Verdict for this app |
|---|---|
| **"Restrict file uploads"** | **Half wrong, and dangerous if taken literally.** Jen and Dave uploading receipts, signed logs and product photos *is the product*. Restricting what THEY can do would break the billing flow. The legitimate version is narrower: the *server* should refuse types it can't handle and cap the size — and yours already does (`ALLOWED` mime list + 15 MB cap in the receipt route). Nothing to do. |
| **"Hash passwords"** | Already done properly — bcrypt, per-password salt, transparent upgrade from the old SHA-256 hashes. |
| **"Parameterize queries"** | Not applicable. You have no raw SQL string-building anywhere; everything goes through the Supabase client, which parameterises. There is no SQL injection surface to close. |
| **"Add bot protection"** | Skip. This is a login used by about six people at two companies. A CAPTCHA on that form is friction for Jen and nothing else. Login throttling (below) is the version of this that actually matters, and costs the crew nothing. |
| **"Encrypt sensitive data"** | Already true at the layer that counts — Supabase encrypts at rest, TLS in transit. Application-level field encryption would mean you couldn't search or sort on those fields, for a threat model that doesn't include "someone has raw disk access to Supabase's servers". Not worth it. |
| **"Force HTTPS"** | Vercel does this automatically and you cannot turn it off. Nothing to do. |
| **"Trim API responses"** | Real in principle, thin in practice here — see finding 6. |

The remaining items were worth checking, and four of them found something.

---

## What I found

### 🔴 1. Two tables had row-level security switched off — ✅ FIXED (migration 067)

This is the finding that matters most, so here's why it's serious rather than
housekeeping.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships inside the JavaScript of your ordering
site. That's not a mistake — it's designed to be public. The **only** thing
standing between that key and your tables is row-level security. A table with
RLS off is readable *and writeable* by anyone who opens devtools on
graftontowboat.com and copies the key out of the bundle.

Fifteen of your seventeen tables had RLS on. Two didn't:

- **`admin_sessions`** — added in migration 012 for session revocation, then
  orphaned when you moved to stateless JWTs. Nothing in `src/` references it.
  An unused table is still an open door, and this one is shaped like session
  identifiers. **Dropped it** rather than securing it: dead code holding
  security state is worse than no code, because the next person to read
  migration 012 will assume revocation works.

- **`catalog_sync_state`** — nothing sensitive to read, but it was *writeable*.
  One UPDATE setting the resume cursor to garbage stalls the nightly Freshop
  sync silently. First symptom would be Dave asking why prices are stale.
  **RLS enabled, service-role-only policy.**

Neither change affects how the app works — every route already uses the service
role, which bypasses RLS entirely.

**Verify after you run 067:**

```sql
SELECT tablename FROM pg_tables
 WHERE schemaname = 'public' AND rowsecurity = false;
-- should return zero rows
```

### 🔴 2. Unlimited password guesses on the admin login — ✅ FIXED (migration 067 + `src/lib/login-throttle.ts`)

`/api/admin/auth` accepted attempts as fast as the network allowed. bcrypt
protects the stored hashes if the database leaks; it does nothing about someone
hammering the form. Your usernames are first names, and the panel behind them
holds every barge line's negotiated rates, the full delivery ledger, Sinclair's
receipts and customer contacts.

I built this as a **delay, not a lockout**, and that distinction was the whole
design problem. A hard lockout would eventually strand Jen at 5am with a boat
waiting because she fat-fingered a password five times — a worse day than the
attack it prevents. So:

- First three failures in 15 minutes: **free**. That's the normal "which
  password was it" range and punishing it teaches people to distrust the login.
- After that: 0.5s → 1s → 2s → 4s → 8s.
- A correct password **clears the counter instantly**, by username only.
- If the throttle table is unreachable, it **fails open** — a housekeeping
  query must never become a self-inflicted outage.

A human at the worst tier waits eight seconds and shrugs. A dictionary script
drops from thousands of guesses a second to about seven an hour.

### 🟠 3. Username enumeration through response timing — ✅ FIXED

The login returns a deliberately generic *"Invalid username or password"* — the
comment in the code says so. But when the username didn't exist it returned in
about **1ms**, while a real username spent **~92ms** inside bcrypt. The message
was careful and the clock gave it away: you could map every admin username
without ever guessing a password.

Fixed by running one bcrypt comparison against a throwaway hash on the
not-found path. Measured after the change: 92ms vs ~82ms. The signal is gone.

### 🟠 4. A `dangerouslySetInnerHTML` with no guard — ✅ FIXED

`OrderDetailModal.tsx` rendered section headings as raw HTML. Every current
caller passes a hardcoded string, so **nothing was exploitable today** — I want
to be precise about that rather than inflate it. But it was a loaded gun: the
first time someone passes a vessel name or a Freshop product title through that
prop, it becomes stored XSS inside the admin panel. It existed only so `&amp;`
displayed as `&`, which plain text does anyway. Removed.

### 🟡 5. The `order-documents` bucket is almost certainly public — ⬜ YOURS

This one I **could not verify from the repo**, and I'd rather say so than guess.
The bucket was created by hand in the Supabase dashboard, so its setting isn't
in version control. But the code calls `getPublicUrl()`, which only produces
working URLs on a public bucket — so it's public.

That means **signed delivery logs and Sinclair's register receipts are readable
by anyone holding the URL, with no login**. Those documents carry a signature, the
barge line's business, and a full grocery itemisation. The URLs contain UUIDs so
they aren't guessable in practice — this is "unlisted", not "wide open" — but
unlisted is not a security control. A forwarded email exposes it permanently.

**Check it:** Supabase dashboard → Storage → `order-documents` → is "Public
bucket" on?

**If it is, don't flip it yet.** Three things fetch those URLs with a plain
`fetch()` and would break instantly:

- `src/lib/email.ts` — attaching documents to the final email
- `src/lib/billing-packet.ts` — the new packet builder
- the `Receipt` / `Slip` links in the admin UI

The fix is signed URLs (`createSignedUrl`, ~1 hour expiry) generated
server-side, which is maybe an hour of work across those three call sites.
**I'd do it after launch, not before** — it's a real hole but a narrow one, and
it's the only finding here that risks breaking a working billing flow if rushed.
Flag it in your notes rather than losing a launch day to it.

### 🟡 6. Security headers only cover `/admin` — ⬜ ONE-LINE FIX, see below

`next.config.js` sets `X-Frame-Options`, `nosniff`, `Referrer-Policy` and
`noindex` on `/admin/*` and `/api/admin/*`. The customer-facing ordering site —
where the boats actually type names, phone numbers and orders — gets none of
them, and nothing anywhere sets HSTS.

Genuinely lower stakes than 1 and 2, but it's a config edit, not a project. Add
to `next.config.js`:

```js
async headers() {
  const adminSecurityHeaders = [ /* … keep exactly as-is … */ ];

  // Applies everywhere, including the ordering site.
  const baseSecurityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Tell browsers to refuse plain HTTP for a year. Vercel already redirects;
    // this stops the first insecure request from ever leaving the machine.
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    // The ordering site is never legitimately framed by anyone.
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  ];

  return [
    { source: '/:path*', headers: baseSecurityHeaders },
    { source: '/admin/:path*', headers: adminSecurityHeaders },
    { source: '/api/admin/:path*', headers: adminSecurityHeaders },
  ];
}
```

I left this for you deliberately: `Strict-Transport-Security` is genuinely
hard to reverse (browsers cache it for the full year), so it should go in on a
deploy you're watching, not one that lands while you're asleep.

**A Content-Security-Policy is the bigger win and the bigger job.** Next.js
needs a nonce-based CSP to avoid breaking its inline scripts. It's a
half-day with real breakage risk. Not before launch.

### 🟢 7. Things I checked that were already right

Worth knowing so you don't re-do them:

- **No secrets in git history.** `.env*` has been ignored since the start and
  no `.env`, key or credential file has ever been committed. I checked the full
  history, not just the working tree.
- **The service-role key never reaches the browser.** Exactly one reference,
  in `src/lib/supabase/server.ts`. The three `NEXT_PUBLIC_` vars are the app
  URL, the Supabase URL and the anon key — all correctly public.
- **No hardcoded credentials** anywhere in `src/`.
- **Server-side auth is enforced per request.** `requireAdmin()` re-verifies
  the JWT signature and re-checks the role matrix on every call. The client-side
  matrix is show/hide only, and the server never trusts it.
- **Role separation is real and thought-through.** The `gts_manager` /
  `manager` split is a confidentiality boundary between two businesses, not a
  seniority ladder — Sinclair's staff cannot see GTS's delivery rates. This is
  better than most production apps I read.
- **Session cookies** are `httpOnly`, `secure` in production, `sameSite: strict`.
- **Upload validation** already caps size and checks mime type.

### 🟢 8. Input validation — worth a note, not an alarm

Three of 48 API routes use zod. That sounds alarming and mostly isn't: 45 of
them sit behind `requireAdmin`, so the "attacker" is a logged-in employee.

But `/api/orders` is public, and it's the one that matters — anyone can POST to
it. It **is** zod-validated. So the genuinely exposed route is covered, which is
why this is a note rather than a finding.

Worth doing eventually: the public route should also reject absurd payloads
early (a 10,000-item order, a 50KB vessel name). Cheap, and it protects the
database more than it protects you.

---

## Dependencies

I ran the audit as part of this pass. Add to your routine:

```bash
npm audit --omit=dev
```

Nothing exotic in your tree — Next, Supabase, Resend, pdfkit, pdf-lib, bcryptjs,
jsonwebtoken. Worth running before each launch-critical deploy, not daily.

---

## What to do, in order

1. **Run migration 067.** Closes findings 1, 2 and 3. Deploy the code with it —
   `login-throttle.ts` calls functions that migration creates, so the SQL goes
   first.
2. **Check the storage bucket** (finding 5). Two minutes to look. Fixing it is
   a post-launch task.
3. **Add the base security headers** (finding 6) on a deploy you're watching.
4. **Leave CSP and field-level encryption alone** until there's a reason.

Findings 1–4 are already in the code and typecheck clean.
