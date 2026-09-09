# Jen — call document

**Everything in one place.** Supersedes `QUESTIONS_FOR_JEN.md` and `JEN_CALL_PREP.md`;
ignore those two.

Every question carries a **why it matters**, so if she asks "does that matter?"
you have a real answer instead of "my developer told me to ask."

Ordered so the things that block launch come first. Skip freely — nothing below
depends on the section above it except where it says so.

---

# PART 1 — QUESTIONS

## 🚨 ASK FIRST — this one gates everything else

### 1. DNS access — who receives the verification codes?

**Discovered Sept 8 by trying it:** adding a DNS record to the domain triggers a
verification code by email, and it goes to **Laura**. Not to you.

> *"Quick logistics thing. When I add a DNS record, Squarespace emails a
> verification code to Laura. Pointing the website at the new host needs a couple
> of those. Can we either get Laura on standby for ten minutes when I do it, or
> change the account email so the codes come to me?"*

**Why it matters:** this is the single biggest launch risk and it isn't
technical. If Laura is unreachable at the moment you flip the domain, the site
is half-moved and you're sitting waiting on someone else's inbox. **Any answer
works — Laura on a text thread, a screen share, changing the account contact —
but "we'll figure it out" is not an answer.**

**While you're on it:** the Squarespace account is under **Brad Rucker's** login
and the codes go to **Laura**. Neither is you, and GTS's website *and* ordering
system now both depend on that account. Worth asking whether that should change.

---

## 🆕 NEW — the Sinclair's questions

These came out of a copy error I found this morning. Both change what the website
is allowed to say, so they're worth real answers rather than a nod.

### 2. Who actually does the shopping — and who decides a substitution?

> *"I want to get the website wording exactly right. When an order comes in —
> does Sinclair's staff pull the items and pack it, and we collect it? Or do we
> walk the aisles ourselves?*
>
> *And the part I really need: when they're out of something, or the only ribeye
> left looks rough — who decides what happens? Does Sinclair's just swap in
> something close, or does somebody call the boat first?"*

**Why it matters — this is a correctness problem, not a wording preference.**
The site currently says, on the home page and the services page:

> *"We shop it the same way you would — checking dates, picking the good cuts,
> swapping sensibly when something's out."*

and

> *"We walk their aisles the same way you would."*

If Sinclair's does the shopping, **both sentences are false**, and they're false
in the most damaging possible way: they promise a service GTS doesn't perform, on
the front page, to customers who will notice the first time a substitution shows
up that nobody warned them about. A port captain who was told "we check the
dates" and receives milk expiring in two days has a legitimate complaint that the
website created.

**The three answers lead to three different sites:**

| If she says | The site should say |
|---|---|
| Sinclair's shops, packs, and decides swaps | GTS is the delivery and logistics arm. Lean hard on *"a real grocery store does the shopping — not a warehouse."* That's a genuine strength. |
| Sinclair's shops, but GTS calls the boat about swaps | **This is the version worth advertising.** "You'll hear from us before a substitution goes on the boat" is a concrete promise no competitor makes. |
| GTS genuinely shops the aisles | Current copy is right and I leave it alone. |

**Follow-up if there's time:** does the cook find out about a substitution before
the delivery arrives, or when they open the box? Because if it's "when they open
the box," that's a gap GTS could close cheaply and charge for.

### 3. Who is on the other end of an order?

> *"When an order comes through — who's actually placing it? The cook, the
> captain, or somebody in an office doing purchasing?"*

**Why it matters:** right now the copy is aimed at nobody in particular, which is
why it reads generically. These are three different readers who want three
different things:

- **A cook** cares about cuts, dates, quantities, and what got substituted. They
  want to know the meat is good.
- **A captain** cares about the window and whether it lands where the boat
  actually is. They want to know it won't be late.
- **A port captain or purchasing clerk** cares about the invoice, the PO number,
  and one document per boat. They want to know the paperwork is clean.

You can't write a single sentence that lands on all three. Knowing the primary
reader is what makes the difference between copy that sounds like a real
operator wrote it and copy that sounds like a template.

**Also worth asking:** does the same person always order for a given boat, or
does it rotate with the crew? That changes whether the site should teach the
system every time or assume familiarity.

### 4. Sinclair's imagery and the logo

> *"Would Dave be alright with a 'Partnered with Sinclair's Foods' badge using
> their logo, and maybe a photo of the store? Not stamping their logo on our
> stuff — just showing who the groceries actually come from."*

**Why it matters:** back on Aug 25 Dave asked for the **name but no logo**, and I
have honored that. But the Sinclair's connection is the strongest trust signal
GTS has and right now it's carried entirely by text on a dark green band. A
storefront photo or a "Partnered with" badge would do far more work.

**Your read, which I agree with:** a "Partnered with Sinclair's Foods" lockup
using their mark is a different thing from slapping their logo on GTS materials —
it's attribution, and it flatters them. But Dave asked for something specific and
it costs nothing to confirm before it goes live rather than after.

**Also ask:** does Sinclair's have any photos of the store, the meat counter, or
the van that GTS can use? Free, real, and better than anything stock.

---

## 🔴 BLOCKS LAUNCH

### 5. Hot food — can boats take it at all?

> *"Sinclair's deli sells hot ready-to-eat stuff — chicken tenders, burritos,
> tender meals. I've turned those off in the ordering system, because an ETA on
> the river moves by hours and hot food handed over on arrival is a complaint
> waiting to happen. Is that right, or do boats sometimes want it for a short
> run?"*

**Why it matters:** five items are disabled and the sync now blocks new ones
automatically. If hot food is fine for a quick run to MM 219, that's revenue
Sinclair's could be booking and I should reverse it. **Far easier to change now
than after crews have formed a habit either way.**

### 6. Is there anything else boats can't receive?

> *"Same question more broadly — anything else I should keep off the list? I've
> already excluded alcohol and the whole floral and garden department."*

**Why it matters:** cheaper to hear the whole list once than to discover it one
angry phone call at a time.

### 7. Payment terms on invoices

> *"The terms page says invoices are due within 30 days. Is that right?"*

**Why it matters:** it's written into the Terms of Service that goes live with
the site. **I guessed.**

### 8. Exact legal entity name

> *"Is the business exactly 'Grafton Towboat Services LLC'?"*

**Why it matters:** it appears in the Terms and the Privacy Policy. A wrong legal
name on published terms is worth fixing before they're published, not after.

*(Separately — I've taken "LLC" out of the site footer, which now reads
"© Grafton Towboat Services · Grafton, Illinois." A copyright line only has to
identify the owner. The entity name stays in the Terms, the Privacy Policy and
on invoices, which is where naming the LLC actually does legal work.)*

### 9. Which county?

> *"I put Jersey County in the governing-law section of the Terms. Correct?"*

**Why it matters:** Grafton sits near the county line and I inferred it.

---

## 💳 FOR MARY KAREN — billing

These decide how much of her QuickBooks work can be removed. **Ideally get her on
the phone for five minutes**, or have Jen relay.

### 10. Which QuickBooks Online plan — Simple Start, Essentials, Plus, or Advanced?

**Why it matters:** bulk invoice import requires Essentials or above. Simple
Start cannot do it at all, at any price, and that closes the whole path.

### 11. **Is sales tax set up in the QuickBooks account?**

**This is the most important question on this page.**

**Why it matters:** Intuit states plainly that if sales tax is configured, you
**cannot** import invoices from a spreadsheet. Not "it's harder" — it's blocked.
If GTS has sales tax on, the bulk path is closed permanently and there is no
point building toward it. If it's off, a month of invoicing could potentially
collapse into a single import.

### 12. How are the barge lines set up as customers?

Is Ingram one customer, or is each boat its own customer or sub-customer?

**Why it matters:** GTS invoices **per boat**, and Ingram alone runs 15+. How
they're structured in QuickBooks determines what the "Customer" field should say.
Getting it wrong files invoices against the wrong account.

### 13. Walk me through what you do now, step by step

**Why it matters:** she's done this dozens of times and will name a step neither
you nor Jen would think of — a class code, a job number, something she
cross-checks, a naming convention that matters downstream. **Far cheaper to hear
now than to rebuild around later.**

Best single question to ask her: **"What do you end up hunting for every single
time?"** That's where the tool should help.

### 14. What happens to a card number after a phone payment?

> *"When a crew member pays by card over the phone — where does that number go?
> Written on paper, straight into QuickBooks Payments, a card terminal?"*

**Why it matters:** the ordering system never touches card numbers and the
privacy policy says so in writing. But that phone step happens entirely outside
the app and isn't covered by anything I've built. Worth knowing what the real
handling is before the policy claims something broader than it should.

---

## 🌐 WEBSITE & HOSTING

### 15. Confirm the website move

**Show her `/about` before you explain anything.** She and her sisters are on it.

Full talking points in Part 2 below. The one thing she must actually hear and
acknowledge: **nobody at GTS will be able to log in and edit the site anymore.
Changes come through you.**

### 16. Is the Squarespace account meant to be under Brad Rucker?

**Why it matters:** that's the login every change is recorded under, on an
account two business-critical systems now depend on.

### 17. Card for hosting

**⚠️ Do not accept a card number by text.** Screen share, or have her enter it
herself.

---

## 📸 PHOTOS — the biggest visual upgrade available, and it's free

### 18. The shot list

> *"Any chance of a few photos on the next couple of deliveries?"*

- **The GTS boat alongside a towboat, mid-transfer** — the most valuable single
  image the site could have
- **The labelled Sinclair's van** — she asked for this herself back in August
- **Groceries going up to a deckhand** — people, not scenery
- **A loaded cart on the dock at MM 219**
- **Anything at dawn or dusk** — free production value
- **The Sinclair's storefront or meat counter** — see question 4

**How to shoot:** horizontal, phone is fine, **don't zoom.** Zooming is what
makes phone photos look soft — walk closer instead.

**Why it matters:** three of the site's photos are stock. For a business whose
entire pitch is "small town, family owned," stock photography quietly contradicts
the copy — and the one on the Services page has another company's livery visible
on the truck. This is the largest available improvement to the site and it costs
nothing but someone's attention for ten seconds during a delivery.

### 19. A better photo of the three sisters

**Why it matters:** the current one is 500 pixels wide. I've had to cap how large
it displays to stop it going soft. It's the emotional centre of the About page
and it deserves better — any decent phone photo of the three of them would beat
it outright.

---

## 📋 GOOD TO ASK, NOT URGENT

### 20. Is the `/appointments` page doing anything?

An orphaned Squarespace scheduling page — not in the nav, no path to it. Assuming
it dies with the migration unless she says otherwise.

### 21. Does anyone need admin access who doesn't have it?

**Why it matters:** roles are already split so Sinclair's staff can't see GTS's
delivery rates. Easier to add someone now than to explain the permission model
under pressure later.

### 22. Who should get a heads-up that ordering is going live?

**Why it matters:** barge lines that already use GTS should hear it from Jen
rather than discover it. A quiet launch to existing customers beats a surprise.

---

## ⛔ DON'T DO ON THIS CALL

- **Don't promise a launch date.** Not until the end-to-end test order passes.
  Say **"days, not weeks."**
- **Don't accept a card number by text.**
- **Don't say "the code is yours"** without qualifying it. Say she keeps her
  data, her site and her ordering system running, and that the underlying
  software stays yours the way it would with any software company. Otherwise you
  may hand away the thing you'd sell to your second client.
- **Don't cancel any Squarespace subscription today.** Especially not the Domains
  line — that's a separate subscription and it holds the domain itself.

---
---

# PART 2 — BACKGROUND, IF SHE ASKS

Audited against the actual code, not memory.

## Where the project stands

**Working and deployed:**

- Ordering site live at `order.graftontowboatservices.com`, **12,353 products**
  synced from Sinclair's
- Marketing site rebuilt as four pages (`/`, `/services`, `/about`, `/contact`)
  plus three legal pages
- Deliveries ledger with **171 imported 2026 rows**
- Web orders write themselves into the ledger automatically; deleting an order
  removes its row
- Rate cards resolve boat → company → default (Scott Noble and Mike Schmeng at
  $225 for Ingram)
- QuickBooks queue for Mary Karen
- Final email carries the signed delivery log **and** the Sinclair's receipt

**Not done — this is the launch gate:**

| | Status |
|---|---|
| Migrations **062–070** run in Supabase | ⬜ **Verify — several were written after your last run** |
| Email DNS (SPF / DKIM / DMARC) | ⬜ Blocked on the Laura verification codes |
| `EMAIL_FROM` set in Vercel + redeploy | ⬜ Still falls back to `onboarding@resend.dev` |
| One real end-to-end order on the live domain | ⬜ **Never done** |
| DNS moved to Vercel | ⬜ Deliberately last |

---

## The money — the number that matters is $12/year

| | Now | After |
|---|---|---|
| Squarespace website | $228/yr | $0 *(from May 2027)* |
| Domain | $20/yr | $20/yr — unchanged |
| Vercel | $0 | $240/yr |
| Supabase | $0 | $0 |
| **Total** | **$248/yr** | **$260/yr** |

**Vercel is not caused by the website move.** The ordering system needs it either
way — Vercel's free tier is for personal use only, and a business running on it
can be shut off without warning.

**Nothing gets cancelled now.** Squarespace is paid through **May 6, 2027** with
no refund, so it stays as a fallback you could switch back to in minutes.
Calendar note for April 2027 to not renew. **Her domain is a separate
subscription, paid through May 2028, and does not move.**

**Supabase stays free.** Current usage: database 9% of the limit, file storage
**0%**. Revisit in roughly eight months once receipts accumulate — and the reason
will be backups, not speed.

---

## What you found on the old site

- The main **Book Now** button under Grocery Delivery pointed at an empty
  scheduling page. **Anyone who found the site and tried to order was sent
  nowhere.**
- Mile markers read 218 / 0.7 instead of 219 / 0 — on every page, because the
  footer was typed out five separate times.
- "Towboat" was spelled three different ways.
- Every image had an empty alt attribute: 13 accessibility failures and 13
  wasted search-engine signals.

---

## Mary Karen's QuickBooks reality

**Corrected volume: ~21 invoices/month** (171 deliveries over ~8 months), not the
14 I said earlier — the first figure was measured over the wrong period. Call it
1.5 hours a month.

**The unit is the boat, not the delivery.** Ingram runs 15+ boats and each gets
its own invoice, so a week of deliveries becomes one invoice per boat. The queue
groups exactly that way.

**⚠️ Correction to what I told you earlier.** I had built a "copy all lines"
button on the assumption that QuickBooks Online accepts a multi-row paste into
the invoice line grid. **It does not** — Intuit's own support states there is no
way to copy and paste invoice lines from a spreadsheet into QBO. That button
would have silently done nothing on real invoices. It's gone, replaced by
click-to-copy on each individual cell, which matches how QBO actually behaves.

**Two actions per invoice now:**

1. **Packet** — **one PDF** containing the line summary, the signed delivery logs
   and the Sinclair's receipts.
2. **Entered** — replaces the "Updated QuickBooks" column on the spreadsheet.

**Why one PDF matters:** Ingram won't pay an invoice that's missing the signed
log. Two separate downloads means two trips through the file picker and one of
them eventually gets forgotten. **A single file cannot be half-attached.**

**What I deliberately did not build:** a QuickBooks API integration. Three days
of work plus an OAuth connection that breaks whenever Intuit changes something,
against 1.5 hours a month. Revisit if volume doubles or if Mary says it's still
painful — let evidence decide it, not a guess.

**Bug found and fixed during this work:** the ledger was reading the wrong column
name for the signed log (`ingram_slip_url` where the data lives in
`ingram_slip_image_url`). The effect was that the Slip link never appeared and
**every Ingram delivery was permanently stuck in "needs attention."** The queue
would have been unusable for the largest customer on day one.

---

## The invoicer question — the audit changed my answer

You asked whether to pull the invoice generator since they'll use QuickBooks.
**It was already effectively gone**, and two separate things kept getting
conflated:

**The per-order invoice generator — orphaned.** `/api/orders/[id]/invoice`
generates a GTS invoice numbered sequentially from 1084. **Nothing in the admin
UI calls it.** There is no button. It was dead code reachable only by typing the
URL. What remained was a "Next Invoice Number" field in Settings that advertised
a feature nobody could use — removed.

**The Reports billing packet — kept, and should be.** Entirely different thing,
and it *supports* QuickBooks rather than competing with it. It produces one
statement per vessel and says so on the page: *"This is the page to attach to the
QuickBooks invoice."*

---

## If she asks "what's left?"

> *"The system's built and the site's rebuilt. What's left is plumbing — the
> email records so order confirmations don't land in Ingram's spam folder, one
> full test order end to end, and pointing the domain. Days, not weeks."*
