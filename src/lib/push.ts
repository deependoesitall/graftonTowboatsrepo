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

/** Money first, then count, then optional signals; company on a second line. */
function orderPushBody(order: Order, itemCount: number): string {
  const moneyCount =
    `${formatCurrency(order.subtotal)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const signals = orderPushSignals(order);
  const head = signals.length
    ? `${moneyCount} · ${signals.join(' · ')}`
    : moneyCount;

  if (order.company_name && order.vessel_name) {
    return `${head}\n${truncateLabel(order.company_name)}`;
  }
  return head;
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

  // Build the audience filter. If neither flag is set there's nobody to tell.
  const wants: boolean[] = [];
  if (audience.gts) wants.push(false);       // is_sinclair = false → GTS staff
  if (audience.sinclair) wants.push(true);   // is_sinclair = true  → Sinclair's
  if (!wants.length) return { sent: 0, failed: 0, skipped: 'empty audience' };

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, is_sinclair')
    .in('is_sinclair', wants)
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
   * Sinclair's goes to the picking queue (they shop; there is no per-order
   * route in the shop app, and the queue is one tap from the right order).
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
          url: '/',                       // the shop queue, on the shop origin
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

  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payloadFor(s.is_sinclair),
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
      .in('id', subs.filter(s => !dead.includes(s.id)).map(s => s.id));
  }

  return { sent, failed };
}
