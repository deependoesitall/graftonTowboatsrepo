// src/lib/push.ts — server-side Web Push fan-out. STAFF ONLY.
//
// Email is the system of record for a new order and is not changing. This is a
// second, faster nudge: a phone that buzzes gets a boat shopped sooner than a
// Gmail tab someone opens at eight.
//
// ⚠️ NOTHING HERE MAY EVER SEND TO A CUSTOMER. Recipients come exclusively
// from push_subscriptions, and rows only land there through an admin-session
// route (migration 073). There is no vessel-facing path and there must not be.

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils';
import { isGtsRole, type AdminRole } from '@/lib/admin-auth-server';
import type { Order } from '@/types';

/** Soft cap so the $amount stays on-screen when the company name is long. */
const COMPANY_MAX = 40;

function truncateLabel(text: string, max = COMPANY_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Scannable flags staff already triage in admin. Empty when nothing noteworthy
 * — never invent services that aren't on the order.
 */
function orderPushSignals(order: Order): string[] {
  const items = order.items || [];
  const signals: string[] = [];

  if (items.some(i => i.service_type === 'parts_pickup')) {
    signals.push('Parts Pickup');
  }

  const hasPackage = items.some(i => i.service_type === 'package_delivery');
  const hasOther = items.some(i => i.service_type === 'other_pickup');
  if (hasPackage || hasOther) {
    signals.push('Package / Other Delivery');
  }

  if (order.crew_change === 'yes' || order.crew_change === 'maybe') {
    signals.push(`Crew Change (${order.crew_change})`);
  }

  const hasCod =
    !!order.cod_payment_method ||
    items.some(i => i.paid_by === 'cod');
  if (hasCod) signals.push('COD');

  return signals;
}

/**
 * "Sat Sep 13, 6:00 AM · Van" — when it's due and how it goes out.
 *
 * Jen asked for both, twice, and the reason is operational: the alert is what
 * she decides off. Knowing an order is $80 and ten items tells her nothing
 * about whether she can run it with the one she already has scheduled; the day
 * and whether it's the boat or the van is the entire question.
 *
 * ⚠️ THE DATE IS FORMATTED BY HAND, NOT THROUGH `new Date(...)`.
 * `arrival_date` is a bare 'YYYY-MM-DD'. Passing that to the Date constructor
 * parses it as midnight UTC, and rendering that back in America/Chicago lands
 * on the PREVIOUS DAY — a Saturday delivery announced as Friday, on the one
 * message someone schedules their morning around. Splitting the string keeps
 * the date the customer picked exactly as they picked it.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function deliveryLine(order: Order): string {
  const o = order as unknown as {
    arrival_date?: string | null;
    arrival_time?: string | null;
    delivery_method?: string | null;
  };
  const parts: string[] = [];

  const raw = (o.arrival_date || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const [, y, mo, d] = m;
    // Date.UTC + getUTCDay: arithmetic only, no local-timezone shift.
    const weekday = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
    parts.push(`${weekday} ${MONTHS[+mo - 1]} ${+d}`);
  } else if (raw) {
    // Something we don't recognise — show it rather than silently dropping the
    // one field she asked for.
    parts.push(raw);
  }

  const time = (o.arrival_time || '').trim();
  if (time) {
    const t = /^(\d{1,2}):(\d{2})/.exec(time);
    if (t) {
      const h = +t[1];
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      parts.push(`${h12}:${t[2]} ${suffix}`);
    } else {
      parts.push(time);
    }
  }

  const method = (o.delivery_method || '').trim();
  const dated = parts.join(', ');
  if (method === 'boat') return dated ? `${dated} · By boat` : 'By boat';
  if (method === 'van') return dated ? `${dated} · By van` : 'By van';
  return dated;
}

/** Money first, then count, then optional signals; company on a second line. */
function orderPushBody(order: Order, itemCount: number): string {
  const moneyCount =
    `${formatCurrency(order.subtotal)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const signals = orderPushSignals(order);
  const head = signals.length
    ? `${moneyCount} · ${signals.join(' · ')}`
    : moneyCount;

  // Second line: when and how. Company name only if there's room left — the
  // vessel is already in the title, and the delivery window is what gets acted
  // on. iOS shows about two lines on the lock screen and silently drops the
  // rest, so the order of these matters more than it looks.
  const lines = [head];
  const when = deliveryLine(order);
  if (when) lines.push(when);
  else if (order.company_name && order.vessel_name) {
    lines.push(truncateLabel(order.company_name));
  }
  return lines.join('\n');
}

/**
 * VAPID keys identify this server to the push services.
 *
 * Generate once:  npx web-push generate-vapid-keys
 * Then set in Vercel:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   (public — shipped to the browser, that's fine)
 *   VAPID_PRIVATE_KEY              (secret)
 *   VAPID_SUBJECT                  (mailto: or https: — required by spec)
 *
 * ⚠️ ROTATING THE PUBLIC KEY INVALIDATES EVERY EXISTING SUBSCRIPTION. Staff
 * would have to re-enable notifications on each device, and nothing would tell
 * them to. Generate once, keep them.
 */
function configured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
}

let ready = false;
function init() {
  if (ready || !configured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:GraftonTowboatServices@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
}

export interface PushAudience {
  /** GTS staff — owner and gts_manager. */
  gts?: boolean;
  /** Sinclair's-scoped accounts (they do the shopping). */
  sinclair?: boolean;
}

/**
 * Send one notification to every live subscription in the audience.
 *
 * NEVER THROWS. This is called inline from the order POST, and a push failure
 * must not turn a successfully placed order into a 500 for the captain. Every
 * outcome is swallowed and summarised in the return value for logging.
 */
export async function sendOrderPush(
  order: Order,
  audience: PushAudience = { gts: true, sinclair: true },
): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!configured()) {
    // Not an outage — just unconfigured. Named explicitly so it shows up in
    // logs as a setup gap rather than looking like everyone unsubscribed.
    return { sent: 0, failed: 0, skipped: 'VAPID keys not set' };
  }
  init();

  const supabase = createServiceClient();

  if (!audience.gts && !audience.sinclair) {
    return { sent: 0, failed: 0, skipped: 'empty audience' };
  }

  /**
   * ⚠️ ROUTE BY THE PERSON'S ROLE, NOT BY THE ROW'S is_sinclair FLAG.
   *
   * THE BUG THIS FIXES — "notifications work sometimes":
   *
   * A push endpoint belongs to a BROWSER ON AN ORIGIN, not to an app. Now that
   * the Sinclair's app and the GTS app are both served from the apex, a phone
   * with both installed has ONE service worker registration and therefore ONE
   * endpoint. This table upserts on endpoint, so whichever app most recently
   * enabled notifications overwrote is_sinclair for the whole device.
   *
   * The old filter then selected rows by that single flag. A phone stamped
   * is_sinclair = true was excluded from `wants = [false]` — the audience for
   * an order with nothing to shop — so crew-change and service-only orders
   * silently never arrived. It was never random: the same order content always
   * behaved the same way. Placing a mix of orders in testing is exactly what
   * makes that look like a coin flip.
   *
   * It also hit the owner hardest. isSinclairScoped() is true for any account
   * carrying the 'sinclair' permission — Jen's does — so her own device gets
   * stamped is_sinclair = true and she stops being told about the GTS-only work
   * she is the one who schedules.
   *
   * Roles don't move when someone installs a second app, so routing on the
   * stored role is stable no matter how many icons are on the phone. This
   * DELIBERATELY differs from isSinclairScoped(), which answers a different
   * question — "which orders may this person SEE" — and correctly treats Jen
   * as Sinclair-scoped for the grocery view while she remains GTS for alerts.
   */
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, is_sinclair, role')
    .is('expired_at', null);

  if (error || !subs?.length) {
    return { sent: 0, failed: 0, skipped: error ? error.message : 'no subscribers' };
  }

  // Item count excludes service lines so it reads as "things to shop", which
  // is what the number is for.
  const itemCount = (order.items || [])
    .filter(i => i.item_type !== 'service')
    .reduce((s, i) => s + i.quantity, 0);

  const vessel = order.vessel_name || order.company_name || 'vessel';
  const line = orderPushBody(order, itemCount);

  /**
   * ONE PAYLOAD PER AUDIENCE — the `url` is origin-relative and the two apps
   * live on different origins.
   *
   * A single shared payload pointing at /admin/orders/<id> looked fine and was
   * broken for exactly the people it mattered most to: a Sinclair's shopper
   * taps the notification, their service worker opens /admin/orders/<id> on
   * shop.graftontowboatservices.com, middleware redirects them to the apex
   * admin, and they land in an app they can't use — thrown out of the one they
   * were working in, mid-shop.
   *
   * GTS goes to the order detail (they triage and schedule).
   * Sinclair's goes to the same Orders list with &shop=1 so Shopping Mode
   * opens — one admin app, not the retired thin shop.* portal.
   *
   * ⚠️ /admin/orders?order=<id>, NOT /admin/orders/<id>.
   *
   * This pointed at /admin/orders/<id> for weeks and there has never been an
   * [id] route under admin/orders — every staff notification opened a Vercel
   * 404. It looked right in code review because the comment above says "the
   * order detail", and the detail view is a MODAL on the list page, not a
   * route of its own.
   *
   * A query string cannot 404: the list page renders whatever happens, and an
   * id that no longer matches an order (deleted, or filtered out) just leaves
   * the list showing. A path segment has no such floor.
   */
  const payloadFor = (isSinclair: boolean) => JSON.stringify(
    isSinclair
      ? {
          title: `Order to shop — ${vessel}`,
          body: line,
          // Full admin Orders + open Shopping Mode — not the retired thin /shop queue.
          url: `/admin/orders?order=${order.id}&shop=1`,
          tag: `shop-order-${order.order_number}`,
        }
      : {
          title: `New order — ${vessel}`,
          body: line,
          url: `/admin/orders?order=${order.id}`,
          tag: `order-${order.order_number}`,
        },
  );

  const dead: string[] = [];
  let sent = 0, failed = 0;

  /**
   * Which side of the house is this device? `role` is stamped on the row at
   * subscribe time from the signed session, so it survives the shared-endpoint
   * problem above. A row written before `role` existed falls back to the old
   * flag rather than being dropped — an existing device must not go quiet
   * because we changed how routing works.
   */
  function isGtsDevice(row: { role?: string | null; is_sinclair?: boolean }): boolean {
    if (row.role) return isGtsRole(row.role as AdminRole);
    return !row.is_sinclair;
  }

  const recipients = subs.filter(s =>
    isGtsDevice(s) ? !!audience.gts : !!audience.sinclair,
  );
  if (!recipients.length) return { sent: 0, failed: 0, skipped: 'no subscribers in audience' };

  await Promise.all(recipients.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        // One notification per device, addressed to whoever holds it: GTS gets
        // "New order", Sinclair's gets "Order to shop" and lands in Shopping
        // Mode. A phone with both apps gets ONE alert, which is right — it is
        // one phone and one person.
        payloadFor(!isGtsDevice(s)),
        { TTL: 60 * 60 }, // An hour. A "new order" alert delivered tomorrow is noise.
      );
      sent++;
    } catch (e: unknown) {
      failed++;
      // 404/410 mean the subscription is permanently gone — app deleted,
      // permission revoked, endpoint rotated. Anything else (a 500 from the
      // push service, a timeout) is transient and must NOT expire a device
      // that's still perfectly good.
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }));

  if (dead.length) {
    await supabase
      .from('push_subscriptions')
      .update({ expired_at: new Date().toISOString() })
      .in('id', dead);
  }
  if (sent) {
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString() })
      .in('id', recipients.filter(s => !dead.includes(s.id)).map(s => s.id));
  }

  return { sent, failed };
}
