# Squarespace edit script

Everything Jen approved on **Aug 25** ("anything that you think needs to be
changed, change it, Deepen — I trust you 100%"), written so you can execute it
without deciding anything. **Every word you need to type is in this file.**

Ordered by risk: the reversible text edits first, the structural ones last. If
you get interrupted halfway through, the site is in a better state than when you
started, not a worse one.

> **Why I didn't do these while you slept:** Squarespace 7.1 has no page version
> history. A layout change I misjudge at 3am has no undo — someone rebuilds it by
> hand. Text edits you can revert in ten seconds; a broken section you can't.
> Twenty minutes of your attention beats an hour of my guessing.

**Working time: about 30 minutes.**

---

## Phase 1 — Two-minute fixes, zero risk

### 1.1 Kill the placeholder link

Somewhere on the site there's a link to `gerbil-lily-pyjz.squarespace.com` —
Squarespace's auto-generated temporary domain. It screams unfinished.

Find it: **Pages → search, or just Ctrl-F on the live site.** Delete the link or
point it at the real page.

### 1.2 Fix the two capitalization typos

| Wrong | Right |
|---|---|
| Crew C**H**ange | Crew Change |
| Tow Boat S**U**pplies | Towboat Supplies |

Note "Towboat" is **one word** — that's the industry spelling and it's in your
own company name.

### 1.3 Remove "Coming Soon!" from Towboat Supplies

It's orderable now. Leaving it up tells customers not to try.

### 1.4 Fix the mile markers in the footer

The footer says **218 / 0.7**. That's wrong. Replace with exactly what the
ordering site shows:

```
Mile Marker 219 (Mississippi River) · Mile Marker 0 (Illinois River)
```

*(Ignore the "219 and 0.9" from the Aug 25 call — Jen was misremembering, and
she confirmed on Sept 2 to use what the app already shows.)*

---

## Phase 2 — SEO. The highest-value thing on this list.

Jen explicitly approved this. It's also the part with the longest payback: a
barge line's port captain googling *"grocery delivery Grafton Illinois barge"*
should find you, and right now nothing on the site is written to be found.

**Where:** Squarespace → **Pages** → click a page → **⚙ (gear)** → **SEO** tab.

Each page gets an **SEO Title** and an **SEO Description**. Paste these exactly.

---

### Home

**SEO Title**
```
Grafton Towboat Services | Marine Grocery & Supply Delivery on the Mississippi
```

**SEO Description**
```
Family-owned marine delivery at the Grafton, Illinois harbor. Groceries from Sinclair's Foods, towboat supplies, parts and crew changes delivered to your vessel — Mile Marker 219 Mississippi, Mile Marker 0 Illinois River. Order online or call.
```

---

### Grocery Delivery

**SEO Title**
```
Towboat Grocery Delivery | Sinclair's Foods to Your Vessel | Grafton, IL
```

**SEO Description**
```
Order groceries online and we deliver straight to your boat at Grafton. Full grocery selection from Sinclair's Foods, shopped fresh and delivered by boat or van. Company billing or personal payment. Serving the Mississippi and Illinois rivers.
```

---

### Crew Change

**SEO Title**
```
Crew Change Transportation | Grafton, Illinois | Grafton Towboat Services
```

**SEO Description**
```
Crew change transport at the Grafton harbor — vessel to shore, airport runs and local transfers on the Mississippi and Illinois rivers. Family-owned, available around your vessel's schedule. Call to arrange.
```

---

### Towboat Supplies

**SEO Title**
```
Towboat Supplies & Parts Delivery | Grafton, IL | Delivered to Your Vessel
```

**SEO Description**
```
Deck supplies, parts and hardware delivered to your towboat at Grafton, Illinois. Tell us what you need and we source and deliver it — no waiting for the next port. Order online or call Grafton Towboat Services.
```

---

### About

**SEO Title**
```
About Us | Family-Owned Marine Services in Grafton, Illinois
```

**SEO Description**
```
Grafton Towboat Services is a family-owned marine delivery business at the confluence of the Mississippi and Illinois rivers, serving towboat crews with groceries, supplies and crew transport.
```

---

### Contact

**SEO Title**
```
Contact Grafton Towboat Services | Grafton, Illinois Marine Delivery
```

**SEO Description**
```
Reach Grafton Towboat Services for grocery delivery, towboat supplies and crew changes at Mile Marker 219 on the Mississippi. Call, email, or place an order online.
```

---

**Two rules while you do this:**

- **Keep descriptions between 140 and 160 characters.** Google truncates past
  that. All of the above are in range.
- **Don't reuse a description across pages.** Duplicate descriptions actively
  hurt — search engines read it as thin content.

---

## Phase 3 — The Order Now button

**Jen's instruction was specific and she rejected the alternative**, so this one
matters: keep **"Order Now"** and **"Call or Email"** side by side at
**equal weight**. Same size, same style — not a primary button and a ghost
button.

Her reasoning, worth remembering: customers call about crew change, parts and
other services, not just groceries. Demoting the call button costs her the
business that isn't grocery.

**Where it points:**
```
https://order.graftontowboatservices.com
```

*(`order.` not `shop.` — Jen's call. "Order" covers crew changes and parts;
Sinclair's already uses `shop.` for theirs.)*

**Put it in the site header** so it's on every page, not just the home page.
**Design → Site Header → Edit Site Header → Add a button.**

---

## Phase 4 — Sinclair's attribution

Jen wants the Sinclair's name **prominent**, and Dave wants **no Sinclair's
logos**. Both are satisfied by one line of text. Put it on the Home page and the
Grocery Delivery page:

```
Groceries from Sinclair's Foods. Ordered and delivered by Grafton Towboat Services.
```

Why it's worth real estate: barge companies care about two things — that you're
family-owned, and that the groceries come from a real grocery store rather than a
gas-station cooler. That sentence answers both.

---

## Phase 5 — Photos

### 5.1 Take down the marina drone photo

Decided live on the call by Jen's mother: **they no longer own the marina.**
Leaving it implies otherwise.

### 5.2 Put up, in priority order

1. **The three sisters** — this is the family-owned signal, and it does the work
   the "woman-owned" badge would have done. *(No badge: Dad is an owner through
   the marina, so it isn't accurate.)*
2. **The labeled Sinclair's van** — Jen specifically asked for this. It's proof
   the grocery partnership is real.
3. **Family photo.**
4. **Scenic Grafton** — the confluence, the harbor. Sells the location.

Jen was uploading these to the shared folder. If they're not there yet, do
everything else and come back — **don't hold the other 90% of this list for
photos.**

### 5.3 While you're in there

Give every image a real **alt text** description. It's an accessibility
requirement and it's also SEO — image alt text is indexed.

- Bad: `IMG_4471`
- Good: `Grafton Towboat Services delivery boat alongside a towboat at Grafton harbor`

---

## Phase 6 — Turn off e-commerce (do this LAST)

Squarespace's built-in shopping cart is switched on and empty. It:

- adds a cart icon that goes nowhere, which looks broken
- slows every page load
- **conflicts conceptually with your real ordering cart** — two carts, one site

**Where:** Commerce → or **Settings → Site Availability / Commerce**, and disable
the store. If Squarespace won't let you fully disable it, at minimum remove the
cart icon from the header.

**Last for a reason:** it's the only change here that touches site
configuration rather than content, and it's the one most likely to shift a
layout. Do it when you can look at every page afterward.

---

## Phase 7 — Publish the legal pages

From `LEGAL_PAGES.html` (open it in a browser, copy each section):

1. Create **Privacy Policy** and **Terms of Service** as pages.
2. **Put them in the footer, not the main nav.** Nobody navigates to a privacy
   policy on purpose, and it clutters the nav.
3. Add the line above the order form's submit button:
   > By placing this order you agree to our Terms of Service and Privacy Policy.
4. Set both pages' SEO to **noindex** (page ⚙ → SEO → hide from search results).
   You don't want a legal page outranking your grocery delivery page.

**Fill in every `[BRACKET]` before publishing.** You'll need Jen's mailing
address, the business phone and email, the payment terms (30 days?), and the
county for the governing-law clause — Jersey County, if the business is
registered in Grafton.

---

## Final check

Walk the site on a **phone**, not a laptop. A captain is ordering from a
handset in bad light on a moving boat, and that's the only test that matters.

- [ ] Order Now button visible on every page, no scrolling to find it
- [ ] Both buttons the same size
- [ ] No cart icon
- [ ] No "Coming Soon"
- [ ] Mile markers say 219 / 0
- [ ] No `gerbil-lily-pyjz` anywhere
- [ ] Footer has address, phone, email, and both policy links
- [ ] Every page has a unique SEO title and description

---

## Two things worth doing that aren't on Jen's list

**Google Business Profile.** Free, and for a business whose customers search
*"grocery delivery near Grafton IL"* it's worth more than everything in Phase 2
combined. If GTS doesn't have one, claim it: name, category, phone, hours,
photos. Half an hour, permanent payoff.

**A phone number in the header.** Not just the Contact page. A captain with a
problem at 5am should not have to navigate. Squarespace headers support a plain
text/phone element next to the buttons.
