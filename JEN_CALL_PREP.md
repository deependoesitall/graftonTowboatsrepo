# Call prep — Jen, Sept 2026

Audited against the actual code, not memory. Everything below was verified.

---

## 1. Where the project actually stands

**Working and deployed:**

- Ordering site live at `order.graftontowboatservices.com`, 12,353 products synced from Sinclair's
- Marketing site rebuilt as four pages (`/`, `/services`, `/about`, `/contact`) plus three legal pages
- Deliveries ledger with 171 imported 2026 rows
- Web orders now write themselves into the ledger automatically; deleting an order removes its row
- Rate cards resolve boat → company → default (Scott Noble and Mike Schmeng at $225 for Ingram)
- QuickBooks queue for Mary Karen
- Final email carries the signed delivery log **and** Sinclair's receipt

**Not done, and these are the launch gate:**

| | Status |
|---|---|
| Migrations 062–068 run in Supabase | ⬜ **Verify — several were written after your last run** |
| Email DNS (SPF / DKIM / DMARC) | ⬜ Not started |
| `EMAIL_FROM` set in Vercel + redeploy | ⬜ Still falls back to `onboarding@resend.dev` |
| One real end-to-end order on the live domain | ⬜ **Never done** |
| DNS moved to Vercel | ⬜ Deliberately last |

**Don't give her a date on this call.** Say "days, not weeks," and confirm once the test order passes.

---

## 2. The invoicer question — the audit changed my answer

You asked whether to pull the invoice generator since they'll use QuickBooks. **It's already effectively gone, and there are two separate things people keep conflating.**

### The per-order invoice generator — already orphaned

`/api/orders/[id]/invoice` generates a GTS invoice with a sequential number starting from 1084. **Nothing in the admin UI calls it.** There is no button. It's dead code reachable only by typing the URL.

So the decision is smaller than it sounded. What's left:

- **A "Next Invoice Number" field in Settings.** Jen or Mary *will* find this, and it advertises an invoicing feature that doesn't exist. That's the confusion you've been trying to avoid — same category as handing Dave a script and prompting "what is this and am I supposed to run it?"
- **The orphaned endpoint.** Harmless (owner-gated, unreachable) but it's the thing that could collide with QuickBooks numbering if anyone ever wired it up.

**Recommendation: remove the Settings field, delete the endpoint.** Confirm with Jen first, but the bar is low — she'd be agreeing to remove something nobody can currently use.

### The Reports billing packet — KEEP THIS

Different thing entirely, and it's *supporting* QuickBooks, not competing with it. The monthly packet produces one statement per vessel and says so on the page: *"This is the page to attach to the QuickBooks invoice."* Plus order detail sheets with a spot to staple Sinclair's receipt.

**Don't touch it.** If anything it's the most QuickBooks-friendly thing in the build.

---

## 3. Mary Karen's QuickBooks process — what exists now

This is the part worth showing on the call, because it's the daily reality for whoever does the billing.

**Corrected volume:** ~**21 invoices/month** (171 deliveries over ~8 months), not the 14 I said earlier. Roughly 1.5 hours a month.

**The unit is the boat, not the delivery.** Ingram runs 15+ boats and each gets its own invoice, so a week of work is one invoice per boat. The queue groups that way.

**Three actions per invoice:**

1. **Copy lines** — every line for that boat, tab-separated, pastes straight down the QuickBooks line grid. Nothing retyped.
2. **Packet** — **one PDF** containing the line summary, the signed delivery logs and Sinclair's receipts. One attachment, not two.
3. **Entered** — replaces the "Updated QuickBooks" column on the spreadsheet.

**Why one PDF matters:** Ingram won't pay an invoice missing the signed log. Two separate downloads means two file-picker trips and one eventually gets forgotten. **A single file can't be half-attached.**

**What I did NOT build, and why:** a QuickBooks API integration. It's three days plus an OAuth connection that breaks when Intuit changes something, against ~1.5 hours a month. Revisit if volume doubles or Mary says it's still painful — let evidence decide, not a guess.

**Bug found and fixed during this work:** the ledger was reading the wrong column name for the signed log (`ingram_slip_url` vs `ingram_slip_image_url`). Effect: the Slip link never appeared and **every Ingram delivery was permanently stuck in "needs attention."** The queue would have been unusable for the biggest customer on day one.

---

## 4. The website / Squarespace conversation

**Show her `/about` before you explain anything.** Her and her sisters are on it.

**What you found:** the main **Book Now** button under Grocery Delivery pointed at an empty scheduling page — anyone who found the site and tried to order was sent nowhere. Also: mile markers said 218 / 0.7 instead of 219 / 0 on every page, and "Towboat" was spelled three different ways.

**Money — the number that matters is $12/year:**

| | Now | After |
|---|---|---|
| Squarespace website | $228/yr | $0 *(from May 2027)* |
| Domain | $20/yr | $20/yr — unchanged |
| Vercel | $0 | $240/yr |
| Supabase | $0 | $0 |
| **Total** | **$248/yr** | **$260/yr** |

**Vercel isn't caused by the website move.** The ordering system needs it either way — their free tier is for personal use only and a business on it can be shut off without warning.

**Nothing gets cancelled now.** Squarespace is paid through **May 6, 2027** with no refund, so it stays as a fallback we can switch back to in minutes. Calendar note for April 2027 to not renew. **Her domain is separate, paid through May 2028, and doesn't move.**

**Supabase stays free.** Current usage: database 9% of the limit, file storage **0%**. Revisit in ~8 months when receipts accumulate — the reason will be backups, not speed.

**Say the trade-off out loud:** nobody at GTS can log in and edit the site anymore; changes come through you. And say what happens if you part ways — she keeps her data, her site and her ordering system running, and you hand over what the next person needs.

---

## 5. Get answers to these

- **Payment terms** — the Terms say 30 days. Confirm.
- **Legal entity** — is it exactly "Grafton Towboat Services LLC"?
- **County** — I put Jersey County in the Terms. Verify.
- **The Squarespace account is under Brad Rucker's login.** Is that intended? It's whose name every change is logged under.
- **Card handling for COD** — when Mary takes a card over the phone, where does it go? Paper, QuickBooks Payments, a terminal? The app never touches card numbers, but that step isn't covered by anything I've seen.
- **Photos** — the shot list: GTS boat alongside a towboat mid-transfer, the labelled Sinclair's van, groceries going up to a deckhand, a loaded cart at MM 219. Horizontal, phone is fine, **don't zoom**, get closer instead.

---

## 6. Do not do these on the call

- **Don't accept a card number by text.** Screen share, or have her enter it herself.
- **Don't promise a launch date** before the test order passes.
- **Don't say "the code is yours"** without qualifying it — say she keeps her data, her site and her system running, and that the underlying software stays yours the way it would with any software company. Otherwise you may give away the thing you'd sell to your second client.
- **Don't cancel any Squarespace subscription today.** Especially not the Domains line.

---

## 7. If she asks "what's left?"

*"The system's built and the site's rebuilt. What's left is plumbing — the email records so order confirmations don't land in Ingram's spam folder, one full test order end to end, and pointing the domain. Days, not weeks."*
