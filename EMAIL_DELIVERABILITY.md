# Email deliverability — stop landing in barge-line spam folders

Short answer to your question: **yes, you need DNS records, and no, a subdomain
isn't strictly required — but there's a decision to make and I'd make it a
specific way.** Details below.

Two things are true about your situation right now, and the second one is worse
than the first:

1. `EMAIL_FROM` falls back to `onboarding@resend.dev` if the variable is unset.
   Mail from that address is Resend's shared sandbox domain and **will** be
   filtered by any corporate mail system. Ingram runs Microsoft 365. This alone
   would sink you.
2. `BUSINESS_EMAIL` is `GraftonTowboatServices@gmail.com`. That's fine as a
   destination, but it tells me GTS has no mail on their own domain — which
   matters for the DMARC step below.

---

## The decision: root domain or subdomain?

Both work. The tradeoff is real and it's not the one most guides describe.

**Subdomain** (`orders@mail.graftontowboat.com`) isolates reputation. If your
transactional mail ever gets flagged, Jen's regular business email is untouched.
This is genuinely best practice — **at volume**. It's the right answer for
someone sending 50,000 marketing emails a month.

**Root domain** (`orders@graftontowboat.com`) gives you the address a human
actually wants to see arrive. It couples transactional reputation to the
business domain.

**My recommendation: root domain.** Here's the reasoning, because it goes
against the generic advice:

- You'll send maybe 30–60 emails a month, every one of them transactional, to
  named business contacts who are expecting them. The reputation risk that
  subdomain isolation protects against essentially doesn't exist at that volume.
- The From address is read by a captain on a boat and by accounts payable at
  Ingram. `orders@graftontowboat.com` reads as the company.
  `orders@mail.graftontowboat.com` reads as a system, and a fraction of people
  treat that as less trustworthy.
- GTS has no other mail on the domain to protect — they're on Gmail. The main
  argument for isolation doesn't apply.

**Switch to a subdomain if** you ever start sending marketing blasts (your media
rollout, a monthly newsletter, "we're now delivering at MM 0"). Marketing and
transactional mail should never share a sending reputation. When that day comes,
use the subdomain for marketing and keep transactional on the root.

---

## The DNS records

All of these go in wherever `graftontowboat.com`'s DNS lives — if the domain was
bought through Squarespace, that's **Squarespace → Settings → Domains → your
domain → DNS Settings**.

**Resend gives you the exact values** when you add the domain (Resend →
Domains → Add Domain). Don't copy values out of this file — copy the structure
and paste Resend's actual values. What follows is what each one does, so you can
tell when something's wrong.

### 1. DKIM — cryptographic signature (Resend gives you this)

```
Type: TXT
Name: resend._domainkey
Value: p=MIGfMA0GCSqGSIb3DQ... (long key, from Resend)
```

Signs every message so the recipient can prove it wasn't altered and really came
from something authorised by your domain. **The single most important record.**

### 2. SPF — who's allowed to send as you

```
Type: TXT
Name: send        (or @ — Resend will tell you)
Value: v=spf1 include:amazonses.com ~all
```

Resend sends through Amazon SES, so this authorises SES to send as your domain.

⚠️ **If a TXT record starting `v=spf1` already exists, do not add a second one.**
Two SPF records is a hard failure — worse than having none. Merge them into one
by adding the `include:` to the existing record.

### 3. MX for the return path (Resend gives you this)

```
Type: MX
Name: send
Value: feedback-smtp.us-east-1.amazonses.com
Priority: 10
```

Where bounces go. Without it, you never learn that Ingram's AP address is dead —
the mail just vanishes.

### 4. DMARC — the one nobody sets up, and the one that decides your fate

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:GraftonTowboatServices@gmail.com; pct=100; adkim=r; aspf=r
```

DMARC tells receiving servers what to do when SPF or DKIM fails, and — crucially
— **asks them to send you reports**. Microsoft 365 and Google both weight DMARC
heavily now. Having no DMARC record at all is itself a negative signal.

**Start at `p=none`.** That means "don't reject anything, just tell me what's
happening." Run it for two weeks, watch the reports arrive at the Gmail address,
confirm every legitimate message is passing, *then* tighten to:

```
v=DMARC1; p=quarantine; rua=mailto:GraftonTowboatServices@gmail.com; pct=100
```

**Do not start at `p=quarantine` or `p=reject`.** If anything is misconfigured
you'll silently bin your own order confirmations, and the failure mode is a
captain who never got his delivery email and no bounce to tell you.

---

## Then set the env var

In **Vercel → Project → Settings → Environment Variables**:

```
EMAIL_FROM=Grafton Towboat Services <orders@graftontowboat.com>
```

The display-name form matters more than it looks. Inboxes show the display name,
not the address — "Grafton Towboat Services" in a crew member's inbox beats a
bare address every time.

**Redeploy after setting it.** Vercel env vars are baked at build time; changing
one without redeploying changes nothing.

---

## ⚠️ The thing that will actually bite you: attachment size

This isn't in any deliverability checklist, and it's the most likely way your
email breaks in production.

The final email now attaches Sinclair's register receipt — which on a real order
runs 23 pages — plus the signed delivery log photo. iPhone photos are commonly
3–5 MB each.

- **Resend caps a message at 40 MB total.**
- **Most corporate mail systems reject anything over 10 MB**, and Microsoft 365
  defaults to 25 MB but is frequently tightened to 10 by admins.
- A 23-page scanned PDF plus a 5 MB photo is comfortably in the danger zone.

Right now `attachDoc()` in `src/lib/email.ts` fetches and attaches whatever it
finds, with no size check. If the total goes over, Resend returns an error and
**the whole email fails to send** — not just the attachment. The captain gets
nothing.

**Two ways to handle it, and I'd do the first:**

1. **Cap it and degrade gracefully.** If total attachments exceed ~8 MB, attach
   the signed log (small, and the one AP requires) and *link* to the register
   receipt instead of attaching it. The email always sends. This is maybe 20
   lines in `email.ts`.
2. Link to both and attach nothing. Cleaner, but AP departments genuinely
   prefer attachments, and Ingram's process expects them.

I didn't build this because it changes what the customer receives, and that's
your call rather than mine. But **test it before launch with a real 23-page
receipt** — this is exactly the kind of thing that works in every test and
fails on the first real order.

---

## How to verify it all worked

Before you trust it, send one real email to **https://www.mail-tester.com** —
it gives you a score out of 10 and names every failing check. Aim for 9+.

Then send one to a Gmail address and one to an Outlook address, and in Gmail use
**Show original** to confirm you see:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

All three passing on both providers is the finish line.

---

## Order of operations

1. Add the domain in Resend, add its four DNS records, wait for verification
   (usually minutes, occasionally an hour).
2. Add the DMARC record at `p=none`.
3. Set `EMAIL_FROM` in Vercel with the display name. **Redeploy.**
4. Send a test through mail-tester. Fix whatever it names.
5. Test one real order end-to-end with a genuine multi-page receipt attached.
6. Two weeks later, if reports are clean, move DMARC to `p=quarantine`.
