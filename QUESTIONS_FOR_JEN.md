# Questions for Jen — call notes

Read from this. Grouped so you can skip anything that doesn't come up, and
ordered so the ones that block launch come first.

Each has a note on **why it matters** — so if she asks "does it matter?", you
have an answer better than "Claude told me to ask."

---

## 🚨 ASK THIS FIRST — it gates everything else

### 0. DNS access — who gets the verification codes?

**Discovered Sept 8:** adding a DNS record to the domain sends a verification
code by email, and it goes to **Laura** — not to you. Confirmed by trying it.

*"Quick logistics thing — when I add a DNS record, Squarespace emails a code to
Laura. Pointing the website at the new host needs a couple of those. Can we
either get Laura on standby for ten minutes when I do it, or change the account
email so the codes come to me?"*

**Why it matters:** this is now the single biggest launch risk, and it's not
technical. If Laura is unreachable when you flip the domain, the site is
half-moved and you're waiting on someone else's inbox. **Every option is fine —
Laura on a text thread, a screen share, or changing the account contact — but
"we'll figure it out" is not.**

**Also worth clarifying while you're there:** the Squarespace account is under
**Brad Rucker's** login and the codes go to **Laura**. Neither is you. Worth
knowing who actually controls this asset — and whether that should change now
that GTS's website and ordering system both depend on it.

---

## 🔴 BLOCKS LAUNCH — get these answered

### 1. Hot food — can boats take it at all?

*"Sinclair's deli sells hot ready-to-eat stuff — chicken tenders, burritos,
tender meals. I've turned those off in the ordering system because an ETA on the
river moves by hours and hot food handed over on arrival is a complaint waiting
to happen. Is that right, or do boats sometimes want it for a short run?"*

**Why it matters:** I've disabled five items and the sync now blocks new ones
automatically. If she says hot food is fine for a quick run to MM 219, that's
revenue Sinclair's could be selling and I should undo it. **Easier to reverse
now than after crews get used to it either way.**

### 2. Is there anything else boats can't receive?

*"Same question more broadly — anything else I should keep off the list? I've
already excluded alcohol and the whole floral/garden department."*

**Why it matters:** Cheaper to hear the whole list once than discover it item by
item after launch.

### 3. Payment terms on invoices

*"The terms page says invoices are due within 30 days. Is that right?"*

**Why it matters:** It's written into the Terms of Service that goes live with
the site. I guessed.

### 4. Exact legal entity name

*"Is the business exactly 'Grafton Towboat Services LLC'?"*

**Why it matters:** It appears in the Terms, the Privacy Policy and the site
footer. Wrong legal name on published terms is worth fixing before, not after.

### 5. Which county?

*"I put Jersey County in the governing-law section. Correct?"*

**Why it matters:** Grafton sits near the county line and I inferred it.

---

## 💳 FOR MARY KAREN — the billing questions

These decide how much of her QuickBooks work I can remove. **Ideally get her on
the phone for five minutes**, or have Jen relay.

### 6. Which QuickBooks Online plan?

Simple Start / Essentials / Plus / Advanced?

**Why it matters:** Bulk invoice import needs Essentials or above. Simple Start
can't do it at all.

### 7. **Is sales tax set up in the QuickBooks account?**

**This is the single most important question on the list.**

**Why it matters:** Intuit states plainly that if sales tax is configured, you
**cannot** import invoices from a spreadsheet. If GTS has it on, the bulk path
is closed permanently and there's no point building toward it. If it's off, I
can potentially collapse a month of invoicing into one import.

### 8. How are the barge lines set up as customers?

Is Ingram one customer, or is each boat its own customer / sub-customer?

**Why it matters:** GTS invoices per boat — Ingram alone runs 15+. How they're
structured in QuickBooks changes what the "Customer" field should say, and
getting it wrong means invoices filed against the wrong account.

### 9. Walk me through what you do now, step by step

**Why it matters:** She's done this dozens of times and will have a step neither
you nor Jen would think of — a class or job code, something she cross-checks,
a naming convention. **Far cheaper to hear now than to rebuild around later.**
Ask what she ends up hunting for every single time.

### 10. What happens to a card number after a phone payment?

*"When a crew member pays by card over the phone, where does that number go —
written down, straight into QuickBooks Payments, a card terminal?"*

**Why it matters:** The ordering system never touches card numbers, and the
privacy policy says so. But that step happens outside the app and isn't covered
by anything I've built. Worth knowing what the actual handling is.

---

## 🌐 WEBSITE & HOSTING

### 11. Confirm the website move

*Show her `/about` first — her and her sisters are on it.*

Covered in the call-prep doc. The one thing she must actually hear:
**nobody at GTS will be able to log in and edit the site anymore — changes come
through you.**

### 12. Is the Squarespace account meant to be under Brad Rucker?

**Why it matters:** That's the login every change is recorded under. Fine if
intentional; worth knowing if not.

### 13. Card for hosting

**⚠️ Do not accept a card number by text.** Screen share, or have her enter it
herself.

---

## 📸 PHOTOS — the biggest visual upgrade available

### 14. The shot list

*"Any chance of a few photos on the next couple of deliveries?"*

- **The GTS boat alongside a towboat, mid-transfer** — most valuable shot on the site
- **The labelled Sinclair's van** — she asked for this herself back in August
- **Groceries going up to a deckhand** — people, not scenery
- **A loaded cart on the dock at MM 219**
- **Anything at dawn or dusk** — free production value

**How to shoot:** horizontal, phone is fine, **don't zoom** (that's what makes
photos soft — get closer instead).

**Why it matters:** Three of the site's photos are stock. For a business whose
whole pitch is "small town, family owned," stock photography quietly contradicts
the copy. This is the single biggest improvement available and it costs nothing.

### 15. A better photo of the three sisters

**Why it matters:** The current one is 500px wide — I've had to cap its display
size to keep it sharp. It's the emotional centre of the About page and deserves
better. Any decent phone photo of the three of them would beat it.

---

## 📋 GOOD TO ASK, NOT URGENT

### 16. Is the `/appointments` page doing anything?

It's an orphaned Squarespace scheduling page — not in the nav, no traffic path.
Assuming it dies with the migration unless she says otherwise.

### 17. Does anyone need access to the admin system who doesn't have it?

**Why it matters:** Roles are already split so Sinclair's staff can't see GTS's
delivery rates. Easier to add someone now than to explain the permission model
later.

### 18. Who should get a heads-up that ordering is going live?

**Why it matters:** Barge lines that already use GTS should hear from Jen before
they discover it. A quiet launch to existing customers beats a surprise.

---

## ⛔ DON'T DO ON THIS CALL

- **Don't promise a launch date.** Not until the end-to-end test order passes.
  "Days, not weeks."
- **Don't accept a card number by text.**
- **Don't say "the code is yours"** without qualifying it — she keeps her data,
  her site and her system running; the underlying software stays yours, as it
  would with any software company.
- **Don't cancel any Squarespace subscription.** Especially not the Domains line.
