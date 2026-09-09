# Email DNS — do this tonight

**Roughly 20 minutes of work, then waiting.** Do it before the website DNS
change tomorrow, so if something breaks you know which change caused it.

**Why tonight and not after the call:** DMARC needs to sit at `p=none` for about
two weeks before you tighten it, and that clock only starts once the record
exists. Every day you wait is a day added at the far end.

**This is safe to do now even though the website moves tomorrow.** You're using
the A-record method, so Squarespace stays your DNS host. These email records
live in that same zone and are untouched by the website change. Different record
types entirely — they can't collide.

---

## Before you start

**Screenshot the DNS panel.** Squarespace → Settings → Domains →
graftontowboatservices.com → **DNS**. That's your undo.

⚠️ **Look for an existing TXT record starting `v=spf1`.** If one exists,
**do not add a second.** Two SPF records is a hard failure — worse than none.
You'd merge the new `include:` into the existing record instead. Tell me if you
find one and I'll write the merged version.

---

## Step 1 — Add the domain in Resend

1. Go to **resend.com → Domains → Add Domain**
2. Enter `graftontowboatservices.com`
3. Pick the region closest to you (US East)

Resend now shows you **three records with exact values.**

**Copy those from your own dashboard — not from this file.** The DKIM key is
generated uniquely per domain and the MX hostname varies by region. Anything I
wrote here would be wrong.

They'll be shaped like this:

| Type | Name / Host | What it does |
|---|---|---|
| TXT | `resend._domainkey` | **DKIM** — cryptographic signature. The most important one. |
| TXT | `send` | **SPF** — authorises Amazon SES (Resend sends through it) |
| MX | `send` | Where bounces go. Priority 10. |

---

## Step 2 — Paste them into Squarespace

Squarespace → **Settings → Domains → graftontowboatservices.com → DNS →
Add Record**, once for each of the three.

**Notes that trip people up:**

- Squarespace wants the **host only** — `resend._domainkey`, not
  `resend._domainkey.graftontowboatservices.com`. If it appends the domain
  automatically, you'd end up with it twice.
- The DKIM value is very long. **Paste it, don't retype it.** One wrong
  character and it silently fails.
- For the MX record, priority is a separate field. Put **10** in it.

---

## Step 3 — Add DMARC yourself

Resend doesn't give you this one, and it's the one most people skip. Google and
Microsoft both weight it heavily now — **having no DMARC record at all is itself
a negative signal.**

```
Type:  TXT
Name:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:GraftonTowboatServices@gmail.com; pct=100; adkim=r; aspf=r
```

**`p=none` means "don't reject anything, just send me reports."**

⚠️ **Do not start at `p=quarantine` or `p=reject`.** If anything is
misconfigured you'll silently bin your own order confirmations, and the failure
mode is a captain who never got his email and no bounce to tell you. Run
`p=none` for two weeks, watch the reports arrive at the Gmail address, then
tighten.

---

## Step 4 — Verify in Resend

Back in Resend, hit **Verify**. Usually minutes; occasionally up to an hour.

All three must show green before you go further. If DKIM stays pending after an
hour, it's almost always a paste error or the host name having the domain
appended twice.

---

## Step 5 — Set the sender in Vercel

Vercel → your project → **Settings → Environment Variables**:

```
EMAIL_FROM=Grafton Towboat Services <orders@graftontowboatservices.com>
```

**The display-name format matters more than it looks.** Inboxes show the name,
not the address — "Grafton Towboat Services" in a captain's inbox beats a bare
address every time.

⚠️ **Then redeploy.** Vercel bakes environment variables at build time. Changing
one without redeploying changes nothing.

**Why this step is not optional:** right now the code falls back to
`onboarding@resend.dev` — Resend's shared sandbox domain. Ingram runs Microsoft
365 and will filter it. This one line is the difference between arriving and
not.

---

## Step 6 — Prove it works

**Send a test to [mail-tester.com](https://www.mail-tester.com)** — it gives you
a score out of 10 and names every failing check. **Aim for 9+.**

Then send one to a Gmail address and one to an Outlook address. In Gmail, open
the message → **⋮ → Show original**, and confirm:

```
SPF:   PASS
DKIM:  PASS
DMARC: PASS
```

**All three passing on both providers is the finish line.**

---

## Then, in two weeks

Once the DMARC reports show legitimate mail passing, tighten:

```
v=DMARC1; p=quarantine; rua=mailto:GraftonTowboatServices@gmail.com; pct=100
```

---

## Checklist

- [ ] Screenshot the DNS panel first
- [ ] Check for an existing `v=spf1` record — **stop and ask me if there is one**
- [ ] Add domain in Resend, copy the three records
- [ ] Paste all three into Squarespace DNS
- [ ] Add the DMARC record
- [ ] Verify in Resend — all three green
- [ ] Set `EMAIL_FROM` in Vercel **and redeploy**
- [ ] mail-tester score 9+
- [ ] SPF / DKIM / DMARC all PASS in Gmail *and* Outlook
- [ ] Calendar note: tighten DMARC to `p=quarantine` in ~2 weeks
