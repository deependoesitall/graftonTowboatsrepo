# Tonight's test — what "working" looks like

## Staff builder (the path you're actually on)

Paper / register-tape orders typed in **Admin → New order**. After you place one, the order should **open itself** with a green banner: confirmation sent or skipped.

1. **Run `078_confirmation_email.sql`** in Supabase if skip/sent stamps don't save.
2. Pick Scott Noble → past orders should appear on the Boat step.
3. Register tape → **Add to order draft** (not only Save as past). Review should unlock.
4. Check step: leave **Send confirmation email** off unless you want the boat notified.
5. Order opens → **Emails** panel shows skipped vs sent. **Finish shopping** asks register total, then Shopped.
6. **Cancelled** now asks before it sticks. **Remove IMP tests** clears register-tape imports on the current page.

---

# Emails / live domain (earlier script)

Based on exactly two env vars being set: `EMAIL_FROM` and `SINCLAIRS_ORDER_EMAILS`.
`PUBLIC_CONTACT_EMAIL` and `BUSINESS_EMAIL` are deliberately **not** set yet, so
customer-facing addresses still show the Gmail. That's expected tonight.

---

## Before you start — 2 minutes

- [ ] **The push landed.** Vercel → Deployments → newest one says **Ready**, and
      its commit message is the email/copy one. If the newest deployment is
      older than your env var change, **the env vars are not live.**
- [ ] **Migrations 062–070 are run** in Supabase. If you're unsure, run them —
      they're written to be safe to re-run.
- [ ] Open **resend.com/emails** in a tab. This is your source of truth when an
      email doesn't show up: it tells you whether Resend accepted it, and
      whether the recipient's server bounced it. Guessing without this wastes
      the evening.

---

## TEST 1 — A grocery order (the main path)

Place a real order through the live site with **at least one grocery item**.

### Email A — the GTS notification

**Arrives at:** `GraftonTowboatServices@gmail.com`

| Check | Expected |
|---|---|
| From | **Grafton Towboat Services `<orders@send.graftontowboatservices.com>`** |
| **NOT** | ~~`onboarding@resend.dev`~~ |
| Subject | 🚢 New Order #xxxx — Company (total) |
| **CC** | **`deepanotrades@gmail.com`** ← this is the Sinclair's copy, redirected to you |
| Attachment | `order-xxxx.pdf` |

> ⚠️ **If the From still says `onboarding@resend.dev`**, the env var didn't take
> effect. Almost always because the deployment predates the variable. Redeploy
> and test again — don't debug anything else until this is right.

### Email B — the customer confirmation

**Arrives at:** the vessel email on the order (falls back to customer email).

| Check | Expected |
|---|---|
| Subject | ✅ Order Confirmed — xxxx — Grafton Towboat Services |
| Reply-To | `GraftonTowboatServices@gmail.com` |
| Attachment | the order PDF |

**Hit reply on this one.** It should address to the Gmail. That proves the reply
path works even before ImprovMX exists.

### Read the CC'd copy as if you were Dave

This is the one worth slowing down on. That email is what Sinclair's will
receive, and it's their first impression of the system. Ask:

- Can they tell **which boat** and **when it's needed** without hunting?
- Is the item list something a person can actually shop from?
- Is there anything on it that shouldn't go to a grocery store?

Anything that reads wrong, tell me — it's copy, it's cheap to change, and it's
much cheaper before Dave sees it than after.

---

## TEST 2 — A crew-change-only order (the boundary)

Place a second order with **only service items — no groceries at all.**

| Check | Expected |
|---|---|
| GTS notification | ✅ Arrives |
| **CC to `deepanotrades@gmail.com`** | ❌ **Must be absent** |

**This is the test that matters most**, and it's the one people skip. It proves
Sinclair's won't be shown orders they have no business seeing. If the CC appears
here, stop and tell me — the condition is wrong, and shipping it would leak
every crew-change job to a grocery store.

---

## TEST 3 — The contact form

Submit the form at **graftontowboatservices.com/contact** with a real message.

| Check | Expected |
|---|---|
| Page says | Message sent |
| Email arrives at | `GraftonTowboatServices@gmail.com` |
| Subject | Website enquiry — [name] |
| Reply-To | **the address you typed into the form**, not GTS's own |

**This one was silently broken until today.** The form saved enquiries to the
database and emailed nobody, because the route needs `EMAIL_FROM` and it wasn't
set. If this email arrives, that bug is fixed. If it doesn't, `EMAIL_FROM` isn't
live — same root cause as Test 1.

---

## When something doesn't arrive

Work in this order. Don't skip to the end.

1. **Spam folder.** First send from a new sending address, it happens.
2. **resend.com/emails.** Did Resend accept it?
   - **Not listed** → the app never called Resend. Code or env var problem.
   - **Listed as delivered** → it's on the receiving side. Spam, or a filter.
   - **Listed as bounced** → read the bounce reason, it'll say exactly why.
3. **Vercel → Logs**, filtered to the time of the order. Look for
   `Resend business email error` or `Contact form email failed`.

---

## What is NOT being tested tonight, and why that's fine

- **ImprovMX / `orders@graftontowboatservices.com` receiving.** Needs the MX
  records, which need Laura. Not required for any test above — order emails go
  out through Resend regardless.
- **The real Sinclair's addresses.** Deliberately overridden to you. Dave's first
  experience of this system should not be a fake order.
- **Replies showing the domain instead of Gmail.** Needs `PUBLIC_CONTACT_EMAIL`,
  which shouldn't be set until ImprovMX can actually receive.

---

## After the tests pass

In this order, none of it before:

1. Delete `SINCLAIRS_ORDER_EMAILS` → redeploy. Real Sinclair's addresses go live.
2. MX records with Laura → test `orders@graftontowboatservices.com` receives.
3. Set `PUBLIC_CONTACT_EMAIL` and `BUSINESS_EMAIL` → redeploy.
4. Redirect `order.*` to the apex.
5. `_dmarc` record.
