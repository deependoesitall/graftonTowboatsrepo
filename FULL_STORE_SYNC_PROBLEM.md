# Full-Store Catalog Sync — Problem Statement

*Written Sept 5–6, 2026 for outside review. Everything below was measured
against the live Freshop API tonight, not inferred from code.*

Read `GTS_PROJECT_BRIEF.md` first for what the system is.

---

## 1. The goal

Mirror Sinclair's Foods' online grocery catalog into our Postgres so boat crews
can browse "everything Sinclair's carries" beyond our curated 1,125-item barge
order form.

**Sinclair's runs on Freshop (an NCR product).** Their public API needs no auth:

```
https://api.freshop.ncrcloud.com/1/products
  ?app_key=sinclair&store_id=4297&department_id=<id>&limit=100&skip=<n>
```

---

## 2. What the data actually is

This was the first thing I got wrong, and it matters.

| Measure | Value | How measured |
|---|---|---|
| Listings under the storefront root (`department_id=21585437`) | **21,040** | API `total` |
| Of those, `status == "available"` | **~21.8%** | sampled 2,000 items across 20 evenly-spaced pages |
| **Estimated real, live catalog** | **~4,600 items** | 21,040 × 21.8% |
| Currently in our database | **1,813** (1,125 barge + 688 store-only) | live site |
| **Actual coverage** | **~40% of the live store** | — |

**21,040 is not their store.** Freshop retains delisted/dead SKUs and serves
them through the same endpoint. The discriminator is `status`:

- `available` (`status_id: 1`) — live on their storefront
- `no_movement` (`status_id: 3`) — dead stock, not shown on their site

Bakery is the extreme case, and this is a **full census, not a sample**:

```
Bakery (dept 1595058) — API total 1,824, fetched all 1,824
    no_movement   1,740   95.4%
    available        84    4.6%
```

Pantry (dept 1595065), first 200 of 500: 22 available (11%).

So the target is roughly **4,600 items, not 21,000** — a ~4.5× smaller problem
than assumed.

---

## 3. Confirmed defects in the current sync

### 3a. Only 8 parent departments are fetched; children are never visited

`src/lib/freshop-sync.ts` hardcodes:

```ts
FRESHOP_DEPARTMENTS = [Meat 1595064, Seafood 1595067, Dairy 1595060,
  Produce 1595066, Frozen 1595062, Bakery 1595058, Deli 1595061, Pantry 1595065]
// Home & Floral and Beer/Wine/Spirits deliberately excluded
```

**Querying a department returns only items pinned directly to it — not its
subtree.** Measured:

| Department | direct items | child departments |
|---|---|---|
| Bakery | 1,824 | 11 |
| Produce | 3,533 | 17 |
| Meat | 167 | 17 |
| Pantry | 500 | 16 |
| Frozen Foods | 530 | 13 |
| Dairy | 241 | 11 |
| Deli | 131 | 11 |
| Home & Floral | 824 | 2 |
| Beer/Wine/Spirits | 665 | 7 |

Sum of all 10 second-level departments ≈ **8,415 direct items** versus **21,040**
under the root. There are **1,342 departments total** in the tree. So roughly
12,600 listings live in child departments the sync never asks for.

### 3b. Dead listings are imported rather than skipped

`buildStoreProduct()` line ~452:

```ts
is_available: (p.status || 'available') === 'available',
```

`no_movement` rows are **inserted** with `is_available = false`, not discarded.
Since ~78% of listings are dead, the sync spends roughly four-fifths of a
constrained nightly budget writing rows that can never appear on the site.

**Filtering these out at fetch time is the single highest-leverage change** —
it cuts the write volume ~4.5× at zero cost to coverage.

### 3c. (Retracted) "Empty page looks like end-of-data"

I initially believed this. **It is not true.** `fetchFreshopPage` returns `null`
on `!res.ok`, and `fetchFreshopPages` aborts the batch so the caller
checkpoints and retries. Rate-limited pages are handled correctly. Noted here so
a reviewer doesn't chase it.

---

## 4. What is actually blocking this: rate limiting

### The rate limit is disguised

```
HTTP/2 400
content-type: application/json;charset=utf-8
content-length: 18

{"error_code":429}
```

**It returns HTTP 400 with `error_code: 429` in the body.** Any client checking
`status === 429` will classify a temporary throttle as a permanent malformed
request. Our code survives only because it checks `!res.ok` broadly.

### How quickly it triggers

Tonight, serially, one request every 0.2s, `limit=100`:

| Requests made | Result |
|---|---|
| ~0–40 | all fine |
| ~40–65 | 11 of 49 pages throttled (22%) |
| ~65–80 | **15 of 15 throttled (100%)** |

Then, probing a **single** request every 20 seconds: **still throttled after
140 seconds.** The cooldown is long and I never saw it clear. Total mirrored
before lockout: **3,900 of 21,040 listings.**

### Other measured API constraints

- `limit` is **capped at 100** regardless of what you request (tested 250, 500,
  1000 — all return 100).
- `skip` works to at least 15,000; no low ceiling.
- **Status filtering is ignored.** `&status=available`, `&status_id=1`,
  `&statuses=available` all return the identical unfiltered `total`. Filtering
  must happen client-side, so **the API cost cannot be reduced by asking only
  for live items** — you must page everything and discard.

That last point is the crux: **~211 page requests minimum** for a full sweep,
and the throttle bites well before that.

---

## 5. Environment constraints

- **Vercel Hobby** (moving to Pro): serverless functions, `maxDuration` 60s.
- Sync is already chunked and checkpointed (`catalog_sync_state`), driven by a
  daily Vercel cron plus a GitHub Actions workflow that pokes the endpoint every
  15 minutes in a window to chain chunks.
- **One developer**, no local build step — Vercel is the build gate.
- Supabase Postgres. Bulk writes via a `SECURITY DEFINER` RPC to avoid
  thousands of individual REST calls.
- Business is ~$75k/yr revenue. Paid data services are not realistic.

---

## 6. Is it possible? My honest assessment

**Yes — but the current strategy is the wrong shape, and the fix is mostly about
doing far less work, not doing it faster.**

Three things make it tractable that weren't understood before tonight:

1. **The target is ~4,600 items, not 21,000.** Most of the perceived problem is
   dead SKUs.
2. **Skipping `no_movement` at fetch time cuts write volume ~4.5×.**
3. **We are already at ~40% coverage, not 8%.** The gap is ~2,800 items.

What remains genuinely hard: **the API will not filter server-side**, so
reaching those 4,600 live items still requires paging ~21,000 listings, and the
throttle makes a single-session full sweep impossible. It has to be spread
across many short sessions with generous pacing — which the existing chunked
architecture is already built for.

**Recommended shape:**

- Page the **root department** (21585437) rather than 8 parents — one flat walk,
  no department-tree traversal, no missed children.
- **Discard `no_movement` before writing.**
- Pace conservatively: **serial, ~1 request/sec, no concurrency.** The current
  `fetchFreshopPages` uses `Promise.all`; its comment claims NCR tolerates
  parallel reads better than serial pacing. Tonight's evidence contradicts that,
  and concurrency is the most likely trigger for the burst throttle.
- Treat throttling as **expected**, not exceptional: checkpoint, back off long
  (minutes, not milliseconds), resume next invocation.
- Accept the first full sweep taking **several nights**. Steady state should be
  far cheaper.

---

## 7. Open questions I could not answer (rate-limited out)

These are the highest-value things for a reviewer to dig into:

1. **Is there an incremental/delta endpoint?** A `modified_since` or
   `updated_at` filter would change everything — a nightly full 21k sweep is the
   wrong shape if only a few hundred items change per day. I could not probe
   this before lockout. **This is the most important question.**
2. **What is the actual quota?** Requests per minute/hour/day, and does it key on
   IP, `app_key`, or both? Vercel's egress IPs differ from a home connection —
   earlier work in this project found NCR "answers datacenter IPs differently."
3. **Is there a bulk/feed export?** Freshop powers a WordPress plugin
   (`freshop-so-layout-blocks`); the storefront is server-rendered, so their own
   pages don't reveal an XHR pattern to imitate. Is there a documented feed?
4. **Does `sort` order affect throttling or allow cursor pagination?** We use
   `sort=name&name_sort=asc`. A stable cursor would make resumption safer than
   `skip`, which can drift if the catalog changes mid-sweep.
5. **Would fetching the ~96 leaf departments be cheaper than the root?** Each is
   small, but that's 96+ sizing calls plus pages. Probably worse, but unverified.
6. **Is `no_movement` genuinely equivalent to "not on their website"?** Verified
   for Bakery by spot-checking their storefront, but not proven store-wide. If
   some `no_movement` items are actually orderable, the whole model is wrong.

---

## 8. What this does NOT block

Worth stating plainly, because it has been conflated with launch readiness:

The **1,125-item barge order form is complete and correct.** That is what boat
crews actually order from — it mirrors the paper form they have used for years.
The full-store browse is an extra.

The immediate risk is **not** the missing items — it's that the UI currently
labels the toggle **"FULL SINCLAIR'S STORE — everything Sinclair's carries,"**
which is untrue at 40% coverage. That is a copy fix measured in minutes, and it
should happen before any boat sees the site.
