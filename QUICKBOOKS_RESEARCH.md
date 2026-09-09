# QuickBooks billing — research findings and what changed

Researched against Intuit's own documentation and community answers, Sept 2026.
**Two findings changed the build.** One of them means I shipped something that
didn't work.

---

## Finding 1 — QuickBooks Online does NOT accept a multi-line paste

**This is the important one, and it invalidated a button I built.**

I had added a **"Copy 2 lines"** button that put the whole invoice on the
clipboard tab-separated, on the assumption Mary could paste it straight down the
QuickBooks line grid in one action.

Intuit's own answer: *"Currently, there isn't a way to copy and paste bills and
invoices from a spreadsheet to QuickBooks Online… you'll need to do it one at a
time."*

**Why this mattered more than a normal bug.** The button looked like it worked.
Its failure mode is silent — a paste that appears to do something but drops
lines, discovered later on a real invoice sitting in Ingram's accounts payable.
A feature that fails loudly is a nuisance; one that fails quietly on billing
documents is a liability.

**What replaced it: per-cell click-to-copy.** Every value on every invoice line —
product/service, description, rate — is now its own click-to-copy cell. Click,
paste, move on. Nothing is retyped and nothing is transcribed by eye, which is
where transcription errors come from. It matches how the software actually
behaves rather than how I assumed it did.

---

## Finding 2 — CSV invoice import exists, but may be unavailable to GTS

Intuit *does* support bulk invoice import, and on paper it's the ideal path:
one file, up to **100 invoices / 1,000 rows** per import. A whole month in one
operation instead of 21 manual entries.

**Two conditions could rule it out, and both need checking with Mary:**

**⚠️ Sales tax is a hard blocker.** Intuit states plainly: *"If you have set up
sales tax in your account, you can't import invoices this way."* Illinois
grocery and delivery billing makes it entirely plausible GTS has sales tax
configured — in which case **CSV import is simply not available to them**, full
stop, regardless of what we build.

**Plan tier.** The feature is listed for **Plus, Essentials, Advanced** and
Enterprise Suite. **Not Simple Start.**

**Other limits worth knowing if it does turn out to be available:**

- Multi-line invoices repeat the same invoice number across rows to group them
- Required columns: invoice number, customer, invoice date, due date, item amount
- No negative lines — discounts and credit memos can't be imported
- Customers can be auto-created during import if you tick the box
- **Attachments cannot be imported.** The signed log and Sinclair's receipt
  still have to be attached by hand, whatever else happens.

**I did not build CSV export.** Building it before knowing whether sales tax
blocks it would risk delivering a feature that can't be used — the exact "what
is this and am I supposed to run it?" outcome we've been avoiding. Two questions
to Mary settle it.

---

## What Mary's process looks like now

**Volume: ~21 invoices/month** (171 deliveries over ~8 months), about 1.5 hours.

**The unit is the boat, not the delivery.** Ingram runs 15+ boats and each gets
its own invoice, so the queue groups company → vessel → that vessel's deliveries.
One box on screen = one invoice.

**Per invoice:**

1. **Copy the header fields** — customer and invoice date, one click each
2. **Copy each line cell** — product/service, description, rate
3. **Packet** — one PDF with the line summary, the signed logs and Sinclair's
   receipts, in that order
4. **Entered** — replaces the "Updated QuickBooks" spreadsheet column

**Why the packet is one file and not two links.** Ingram won't pay an invoice
missing the signed delivery log — their form says so in red. Two separate
downloads means two trips through the file picker and one eventually gets
forgotten. **A single file cannot be half-attached.** And since attachments are
manual under every import method, this saves work no matter which path they end
up on.

**Blockers are surfaced before she starts**, not discovered mid-entry: missing
Sinclair's total, missing signed log on an Ingram delivery, no company set.

---

## Why not the QuickBooks API

Three days of work plus an OAuth integration that breaks whenever Intuit
changes something, against **1.5 hours a month**. On a system maintained by one
person, for free, that trade is wrong today.

Revisit if volume roughly doubles, or if Mary says the current flow is still
painful — let evidence decide rather than a guess about her tolerance.

---

## Ask Mary these four things

1. **Which QuickBooks Online plan?** (Simple Start / Essentials / Plus / Advanced)
2. **Is sales tax set up in the account?** — this alone decides whether bulk
   import is even possible
3. **Are the barge lines set up as customers already**, and are the boats
   sub-customers or all under one company name? Affects how the customer field
   should be formatted.
4. **What does she do today, step by step?** She's done this dozens of times and
   will have a step neither you nor Jen would think of — a class or job code,
   something she cross-checks. Cheaper to hear now than to rebuild around later.

---

## What was removed to make this launch-ready

**The in-app invoice generator** (`/api/orders/[id]/invoice`) — produced a GTS
invoice with its own sequential number from 1084. **It was already orphaned:**
no screen ever called it. Now returns 410 Gone.

**The invoice-number allocator** (`/api/admin/invoice-number`) and its
**"Next Invoice Number" field in Settings.** The field was the only visible
trace, and it advertised a feature that didn't exist while inviting someone to
set a number that would later collide with QuickBooks' own sequence.

**Kept deliberately:** the monthly billing packet in Reports. It produces one
statement per vessel and says on the page *"This is the page to attach to the
QuickBooks invoice."* That supports QuickBooks rather than competing with it.

**Sources:**
- [Import multiple invoices at once — Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data-files/import-multiple-invoices/L7E9Xrd8l_US_en_US)
- [Copy and paste multi-line item invoices from Excel — QuickBooks Community](https://quickbooks.intuit.com/learn-support/en-us/other-questions/copy-and-paste-multi-line-item-invoices-from-excel-to-quickbooks/00/1286803)
- [Multiple items copy and paste into an invoice — QuickBooks Community](https://quickbooks.intuit.com/learn-support/en-us/other-questions/multiple-items-copy-and-paste-into-an-invoice/00/285857)
