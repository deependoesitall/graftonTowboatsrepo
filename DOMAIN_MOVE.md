# Moving graftontowboatservices.com to Vercel — and turning on email

**Runbook. Do the parts in order; the order is the safety.**

DNS verified live Sept 9, 2026. Vercel values read off the project's own domain
card the same day — these are correct for **this** project, not generic.

---

## Contents

- **Part A** — point the website at Vercel *(30 min, needs Laura for codes)*
- **Part B** — receive email at `@graftontowboatservices.com` *(new; pick an option first)*
- **Part C** — finish the sending side (DMARC, `EMAIL_FROM`)
- **Part D** — verification checklist and rollback

---
---

# PART A — Move the website

## Already done in Vercel ✅

Both domains are added to the `grafton-towboatsrepo` project and set to serve
**Production**:

- `graftontowboatservices.com`
- `www.graftontowboatservices.com`

Both currently read **Invalid Configuration**. That is expected and correct —
it just means DNS doesn't point at Vercel yet. It clears on its own once you do
Step A2.

> **One thing I had to correct:** Vercel ships with *"Redirect apex domains to
> www (recommended)"* switched on, and it applied that even after I unchecked
> it — it had the apex 308-redirecting to `www`. I reversed it, so the **apex is
> primary** and serves the site directly. That matches how you say the domain
> out loud, and it matches `sitemap.ts`, `robots.ts` and `StructuredData.tsx`,
> which now all declare the apex canonical. **If you ever re-add these domains,
> check that box's behaviour again** — the two halves disagreeing would put a
> redirect in front of every page Google crawls.

## Step A1 — Lower the TTL first

In Squarespace DNS, edit the `@` A record and the `www` CNAME and set
**TTL = 300**. Change *only* the TTL. Leave the values alone.

**Why:** the TTL is currently 14400 — four hours. That's how long the world
caches the old answer, and therefore how long a rollback takes to reach
everybody. At 300 seconds, rollback is five minutes.

Ideally wait a few hours before Step A2 so the old long-TTL answers expire. If
you'd rather push on, that's a judgement call, not a rule — just know the
rollback window stays up to four hours until the old cache drains.

## Step A2 — Change the two records

| Host | Type | Old value | **New value** |
|---|---|---|---|
| `@` | A | `198.49.23.144` | **`216.198.79.1`** |
| `www` | CNAME | `ext-sq.squarespace.com` | **`437075a394aa5588.vercel-dns-017.com.`** |

That `www` target is the same one `order.` already uses — that's expected, it's
your project's address.

**Each edit emails a verification code to Laura.** Have her on the phone.

### ⛔ Do not touch anything else in that zone

| Record | Why it must survive |
|---|---|
| `order` CNAME | The live ordering system |
| `resend._domainkey.send` TXT | **Signs every order confirmation email.** Delete it and confirmations start landing in spam with no visible error. |
| NS records | The zone stays at Squarespace. This is not a nameserver move. |

Resist the urge to tidy up records you don't recognise.

## Step A3 — Redirect `order.*` to the apex

**Only after Part D passes.** In Vercel → Domains → `order.graftontowboatservices.com`
→ Edit → **Redirect to Another Domain** → `graftontowboatservices.com`, 308,
path preserved.

**Why it's gated:** `order.*` *is* the live ordering system. Pointing it at an
apex that isn't working yet takes the product down, not just the brochure.

## Step A4 — Unlink the domain from the Squarespace *site*

Detach the domain so Squarespace stops asserting ownership.

> 🚨 **Do not cancel either subscription.**
>
> - **Website** (paid to May 6, 2027) — this is your rollback. Let it lapse;
>   calendar note for April 2027.
> - **Domain** (paid to May 2028) — a *separate line item* that **hosts the DNS
>   zone**, including the Resend key. Cancelling it takes everything down.

---
---

# PART B — Receiving email at the domain

## First, the thing that's easy to conflate

These are two different systems and only one of them exists today.

| | Status |
|---|---|
| **Sending** — order confirmations going out | ✅ Working. Resend, signed on `send.graftontowboatservices.com`. |
| **Receiving** — mail arriving at `you@graftontowboatservices.com` | ❌ **Does not exist.** There are no MX records. |

Right now GTS's address is `GraftonTowboatServices@gmail.com` — a plain Gmail
account. The domain has never received mail in its life.

**This is why Part A is low-risk**, incidentally: there's no mail to break. Once
you add MX records that stops being true, so do Part A first and Part B second.

## Pick an option before touching DNS

| | Cost | Real mailboxes? | Can reply *from* the domain? |
|---|---|---|---|
| **1. Forwarding only** *(ImprovMX, Forward Email)* | **$0** | No — mail lands in the existing Gmail | Not on the free tier |
| **2. Google Workspace** | **$7/user/mo** annual, $8.40 monthly | Yes | Yes, natively |
| **3. Zoho Mail** | Free for a few users, then ~$1/user/mo | Yes | Yes |
| **4. Cloudflare Email Routing** | $0 | No, forwarding | No |

### My recommendation: start with option 1

**Forwarding gets you what you asked for — mail received at
`@graftontowboatservices.com` — for nothing, in about ten minutes, and it's
completely reversible.** `orders@graftontowboatservices.com` and
`info@graftontowboatservices.com` land in the Gmail inbox they already check all
day. Nobody has to learn a new mailbox or remember to look in two places, which
is the failure mode that kills small-business email migrations.

**The honest limitation:** on the free tier they'd still *reply* from the Gmail
address. If someone emails `orders@graftontowboatservices.com` and Jen replies,
the customer sees `@gmail.com` on the way back. For a business trying to look
established to barge lines, that may matter enough to pay for.

**If it does, go to Google Workspace.** They're already Gmail natives, so the
interface doesn't change at all — the address does. At $7/user/month annually
that's **$84/year for one user, $168 for two.**

> ⚠️ **Say this to Jen before you commit to it.** You told her the migration was
> **+$12/year**. Workspace makes it +$96 or +$180. That's still a defensible
> number, but she should hear it from you as a choice with a reason, not
> discover it on a card statement.

### ⚠️ Cloudflare's free option has a catch

Cloudflare Email Routing is free and good, but it **requires the domain's
nameservers to point at Cloudflare**. That means moving the whole zone off
Squarespace — including the Resend key and the `order` CNAME — which is a much
bigger operation than the two-record change in Part A. Not worth it just to save
nothing over ImprovMX. **Don't let a "free" label pull you into a nameserver
migration mid-launch.**

## Step B1 — Add the MX records

Whichever provider you choose gives you MX records. Add them at the **root
(`@`)** in Squarespace DNS.

**These are provider-specific — use theirs, not any example.** Google
Workspace's are `smtp.google.com` style; ImprovMX's are `mx1.improvmx.com` and
`mx2.improvmx.com`. Copy them from your provider's setup screen.

## Step B2 — Add an SPF record at the root

Once mail is *arriving* at the domain, the root also needs to say who's allowed
to *send* as it, or spoofing gets easy.

```
Host: @    Type: TXT    Value: v=spf1 include:<your provider> ~all
```

> **Don't put Resend in the root SPF.** Resend sends from
> `send.graftontowboatservices.com`, which is a separate name with its own
> records. Mixing them is how people end up with two SPF records at the root,
> which is invalid — **a domain may have exactly one SPF record**, and having
> two fails every check rather than combining.

## Step B3 — Point replies at the new inbox

The app currently sends from `send.graftontowboatservices.com`. Once a real
inbox exists, set the **Reply-To** on order emails to
`orders@graftontowboatservices.com`.

**Why this and not changing the From address:** Resend is verified on the `send.`
subdomain and working. Sending *from* the root would mean verifying the root
domain in Resend and adding another DKIM record — churning working email
infrastructure during launch week, for a cosmetic gain. Reply-To gets the
benefit with none of the risk: the confirmation still sends from the address
that's proven to deliver, and when a cook hits reply it goes to a human at the
company domain.

---
---

# PART C — Finish the sending side

These have been outstanding since before the domain move and are worth doing in
the same sitting, while Laura is available for codes.

### C1 — `_dmarc` record

```
Host: _dmarc    Type: TXT
Value: v=DMARC1; p=none; rua=mailto:GraftonTowboatServices@gmail.com
```

`p=none` means "monitor, don't reject" — it reports on what's happening without
risking a single legitimate email being dropped. **Tighten to `p=quarantine`
after about two weeks**, once the reports show only Resend sending.

*Attempting this record is what discovered the whole Laura verification-code
problem in the first place.*

### C2 — `EMAIL_FROM` in Vercel

Still falls back to `onboarding@resend.dev`, which is Resend's shared sandbox
address. Set it to:

```
Grafton Towboat Services <orders@send.graftontowboatservices.com>
```

**Then redeploy.** An environment variable change alone does nothing until the
next deployment — this is the single most commonly missed step on this list.

---
---

# PART D — Verify, and how to undo

## Don't proceed past this until all of it passes

- [ ] `graftontowboatservices.com` loads the **marketing home** — nav bar,
      "GROCERIES, SUPPLIES & CREW CHANGE" — not the bare ordering app
- [ ] `www.graftontowboatservices.com` redirects to the apex
- [ ] Valid padlock on both, no certificate warning *(Vercel issues the cert
      automatically once DNS resolves; a warning in the first few minutes means
      wait, not panic)*
- [ ] `/about`, `/services`, `/contact`, `/privacy`, `/terms` all load
- [ ] `order.graftontowboatservices.com` **still works** (not yet redirected)
- [ ] **A real test order end to end** — and the confirmation email arrives.
      This is the one that proves the Resend key survived, and it has still
      never been done on the live domain.
- [ ] *(After Part B)* An email sent to `orders@graftontowboatservices.com`
      arrives

## Rollback

Set `@` back to `198.49.23.144` and `www` back to `ext-sq.squarespace.com`. The
Squarespace site is paid through May 6, 2027 and is sitting there untouched.
**Nothing in Part A is one-way.**

Part B is equally reversible — deleting the MX records returns the domain to
receiving no mail, which is where it is today.

---

## Already handled in code

- `BUSINESS.orderUrl` is now `/catalog` instead of an absolute `order.*` URL, so
  buttons don't bounce through a redirect on a phone with one bar of signal
- `sitemap.ts`, `robots.ts`, `StructuredData.tsx` declare the **apex** canonical
  (they said `www`)
- Sitemap's catalog entry points at the apex
- Vessel report PDF footer says `graftontowboatservices.com`
- Footer reads `© Grafton Towboat Services` — no "LLC", no year *(a static year
  would freeze at the last deploy and read as a dead business by 2028)*

**These are pushed and safe either side of the DNS change** — `/catalog`
resolves on both hosts, because it's the same Vercel project.
