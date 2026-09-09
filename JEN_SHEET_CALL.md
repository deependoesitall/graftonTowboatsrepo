# Call with Jen — the delivery spreadsheet

Everything to get in one call so you never have to go back to her for this.

---

## 🎯 THE ONE ASK THAT MATTERS

**Get Editor access, not Viewer.**

> *"Can you bump me up to Editor on the delivery spreadsheet? Right now I'm
> view-only. I need to connect it to the system so your deliveries flow into the
> ledger automatically, and that takes a couple of setup steps on the sheet
> itself. I won't be touching your data — I'll tell you before I change anything."*

**Why this is the whole call.** The sync needs a Google service account to read
the sheet, and that account has an address like
`gts-sync@something.iam.gserviceaccount.com`. Somebody has to share the sheet
with it. **The service account doesn't exist yet** — you'd have to build it
first, then call her again.

As an Editor you can do that yourself, later, without her. Same for adding the
ID column below. **One ask now instead of two calls and a delay.**

If she hesitates: she keeps ownership, she can revoke it any time, and you'll
never delete or overwrite a row.

---

## ✅ Grab the URL while you're on

Have her paste the link in a text or email, or read you the ID from the address
bar — the long string between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/  1AbC...XyZ  /edit#gid=0
                                         ^^^^^^^^^^
```

---

## 📋 Questions about the sheet itself

These decide whether the sync works or quietly imports garbage. All quick.

### 1. Is this the only sheet, and is there more than one tab?

> *"Is that one file the whole delivery log, or are there other tabs — a 2025
> one, or a separate tab per month?"*

**Why it matters:** if it's one tab per year, the sync has to know which tab is
live, and it has to keep working in January when somebody makes a new one.
That's a real design difference and it's cheaper to know now.

### 2. Does anyone add or move columns?

> *"Does anybody ever add a column or shuffle them around?"*

**Why it matters:** the sync maps columns by position or by header name. If
headers get renamed or reordered mid-year, a column-position mapping silently
imports the wrong data into the wrong field — the delivery fee landing in the
hours-worked column, and nobody noticing for a month. If they *do* rearrange
things, I'll match on header text and fail loudly instead.

### 3. Are all the rows real deliveries?

> *"Is every row a real delivery, or are there total rows, notes, blank
> separators — anything that isn't a job?"*

**Why it matters:** a "TOTALS" row at the bottom would import as a phantom
delivery for a boat called TOTALS. Easy to skip once I know it's there.

### 4. Can two deliveries share a boat and a date?

> *"Could the same boat get two separate deliveries on the same day?"*

**Why it matters — this is the technical crux.** A spreadsheet row has no
permanent ID, so the sync identifies a delivery by date + vessel. If that pair
can repeat, I need something more to tell them apart or one will overwrite the
other.

### 5. Permission to add one column

> *"Can I add one narrow column at the far right? You'd never type in it — it's
> just so the system can tell rows apart reliably. It won't change how you use
> the sheet at all."*

**Why it matters:** this permanently solves problem 4. Without it, if someone
corrects a typo in a date or a boat name, the sync sees an unfamiliar row and
adds a duplicate. With it, rows keep their identity through any edit. **This is
the single thing that makes the sync trustworthy rather than fiddly.**

### 6. How long will they keep using the sheet?

> *"After launch, do you think the team will keep using the sheet for phone
> orders for a while, or move into the new ledger?"*

**Why it matters:** honest scoping. If it's a few weeks of transition, I build
something deliberately simple. If it's the permanent system of record, it earns
more care.

---

## ⚠️ Set expectations on one thing

Tell her now so it doesn't surprise her:

> *"One heads-up — orders that come in through the website will land in the new
> ledger automatically, but they won't appear on your spreadsheet. So during the
> changeover the ledger has everything and the sheet only has what you type. If
> you're checking one place, check the ledger."*

**This is the part that will cause confusion if unsaid.** Her team will look at
the sheet, not see the Ingram web order, and conclude the system lost it.

---

## 🎁 While you have her — quick wins

Only if there's time. None of these are worth losing the sheet access over.

- **Sinclair's logo** — is Dave alright with a "Partnered with Sinclair's Foods"
  badge using their mark, and a photo of the store? *(He asked for name-only back
  in August; you want to use imagery now.)*
- **Photos** — the shot list: GTS boat alongside a towboat mid-transfer, the
  labelled Sinclair's van, groceries going up to a deckhand. Horizontal, phone is
  fine, **don't zoom.**
- **A better photo of the three sisters** — the current one is 500px and has to
  be displayed small to stay sharp.
- **Payment terms** — the Terms page says 30 days. Confirm.
- **Legal entity** — exactly "Grafton Towboat Services LLC"?
- **County** — Jersey County is in the Terms' governing-law section. Right?

---

## After the call — your 20 minutes

1. Create the Google Cloud service account, enable the Sheets API, download the
   JSON key
2. Share the sheet with the service account address *(you can do this yourself
   now that you're an Editor)*
3. Add the ID column
4. Send me the sheet ID and I'll read the structure and build it
