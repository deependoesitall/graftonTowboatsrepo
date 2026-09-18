// src/app/api/customer/orders/route.ts
//
// THE CUSTOMER'S OWN ORDER HISTORY — ONE DEFINITION, SERVER SIDE.
//
// ⚠️ WHY THIS ROUTE EXISTS AT ALL.
//
// The account page used to read `orders` straight from the browser and let RLS
// decide what came back. That worked right up until it didn't: when a row was
// filtered out — because `user_id` never got stamped, because the boat was not
// linked yet, because a policy migration had not been run — the query returned
// an empty list and the page said "No past orders yet". A customer who had just
// placed an order was told, in a friendly voice, that they had never ordered.
// There was no error to see, because a policy filtering a row out is not an
// error.
//
// So order history is resolved here instead, where we can say out loud what
// "yours" means, and where a real failure comes back as a real failure.
//
// An order is yours if ANY of these hold:
//   1. orders.user_id is you.
//   2. orders.vessel_id is a boat you are a crew member of.  (Shared history —
//      the cooks on Scott Noble see Scott Noble's orders, not Ingram's whole
//      fleet.)
//   3. the order's free-text company + vessel name resolve to a boat you are a
//      member of. (Orders placed before that boat was onboarded have no
//      vessel_id to match on.)
//   4. the order was placed with YOUR email address — the one on the verified
//      token, never one supplied by the caller. This is the guest-checkout
//      case, and it is also the safety net for (1).
//
// ⚠️ THE EMAIL MATCH IS ALSO A REPAIR. Any order found by email that has no
// user_id gets one, so the row becomes visible to plain RLS everywhere else in
// the app (the PDF route, the reorder flow) and not just through here.
//
// ⚠️ EMAIL COMES FROM THE TOKEN. Nothing in the request body or query string
// influences whose orders are returned. The service client is used *because*
// the matching rules above are wider than RLS can express cheaply — which means
// the identity check at the top of this file is the only thing standing between
// a caller and someone else's order. It does not get relaxed.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';
import { orderMatchesVessel, vesselNameKey } from '@/lib/vessel-membership';
import type { Order } from '@/types';

export const dynamic = 'force-dynamic';

const SELECT = '*, items:order_items(*)';
const LIMIT = 50;

/** Rows scanned when matching orders that predate the boat being onboarded. */
const LEGACY_SCAN = 300;

type Row = Order & { id: string; created_at: string; user_id: string | null; vessel_id?: string | null };

async function identify(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const anon = createSupabaseJs(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: (data.user.email || '').trim().toLowerCase() };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const me = await identify(req);
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { userId, email } = me;

  // ── 0. Repair before reading ────────────────────────────────────────────────
  // An order placed with this email but no user_id is this person's order that
  // simply never got stamped. Claim it now so it is visible to RLS from here on
  // — this is what makes "I just placed it and it isn't there" self-heal on the
  // next page load instead of needing a support request.
  let claimed = 0;
  if (email) {
    const { data: fixed, error: claimErr } = await supabase
      .from('orders')
      .update({ user_id: userId })
      .is('user_id', null)
      .or(`customer_email.eq."${email}",vessel_email.eq."${email}"`)
      .select('id');
    if (claimErr) console.error('[customer/orders] claim failed:', claimErr.message);
    claimed = fixed?.length ?? 0;
  }

  // ── 1. Boats this login crews ──────────────────────────────────────────────
  const { data: memberRows } = await supabase
    .from('vessel_members')
    .select('vessel_id, vessel:vessels(id, name, company:companies(name))')
    .eq('user_id', userId);

  const vesselIds: string[] = [];
  const boats: Array<{ company: string; key: string }> = [];
  for (const m of (memberRows || []) as Array<Record<string, unknown>>) {
    if (m.vessel_id) vesselIds.push(String(m.vessel_id));
    const v = Array.isArray(m.vessel) ? m.vessel[0] : m.vessel;
    const vv = v as { name?: string; company?: { name?: string } | { name?: string }[] } | undefined;
    if (!vv?.name) continue;
    const co = Array.isArray(vv.company) ? vv.company[0]?.name : vv.company?.name;
    boats.push({ company: co || '', key: vesselNameKey(vv.name) });
  }

  // ── 2. The direct matches — mine, or my boat's ─────────────────────────────
  const clauses = [`user_id.eq.${userId}`];
  if (vesselIds.length) clauses.push(`vessel_id.in.(${vesselIds.join(',')})`);
  if (email) {
    clauses.push(`customer_email.eq."${email}"`);
    clauses.push(`vessel_email.eq."${email}"`);
  }

  const { data: direct, error: directErr } = await supabase
    .from('orders')
    .select(SELECT)
    .or(clauses.join(','))
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  // ⚠️ A failure here is reported, not swallowed. "No past orders yet" must
  // only ever mean no past orders.
  if (directErr) {
    console.error('[customer/orders] query failed:', directErr.message);
    return NextResponse.json({ error: 'Could not load your orders.' }, { status: 500 });
  }

  const byId = new Map<string, Row>();
  for (const o of (direct || []) as Row[]) byId.set(o.id, o);

  // ── 3. The pre-onboarding tail ─────────────────────────────────────────────
  // Orders from before this boat existed as a row carry no vessel_id, so they
  // can only be found by name. Scoped to the companies this login actually
  // crews for, so it is a bounded scan and never a fishing expedition.
  const companies = [...new Set(boats.map(b => b.company).filter(Boolean))];
  if (companies.length) {
    const { data: legacy } = await supabase
      .from('orders')
      .select(SELECT)
      .is('vessel_id', null)
      .in('company_name', companies)
      .order('created_at', { ascending: false })
      .limit(LEGACY_SCAN);

    for (const o of (legacy || []) as Row[]) {
      if (byId.has(o.id)) continue;
      if (boats.some(b => b.company && orderMatchesVessel(o, b.company, b.key))) {
        byId.set(o.id, o);
      }
    }
  }

  let orders = [...byId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, LIMIT);

  // Optional boat scope (multi-boat switcher). Never widens access — only
  // narrows within the membership-safe set already loaded above.
  const vesselIdQ = (req.nextUrl.searchParams.get('vessel_id') || '').trim();
  const companyQ = (req.nextUrl.searchParams.get('company') || '').trim();
  const boatQ = (req.nextUrl.searchParams.get('boat') || '').trim();
  if (vesselIdQ || (companyQ && boatQ)) {
    const boatKey = boatQ ? vesselNameKey(boatQ) : '';
    // Must be a boat this login crews — refuse fishing other Ingram boats.
    const allowed = vesselIdQ
      ? vesselIds.includes(vesselIdQ)
      : boats.some(b => b.company === companyQ && b.key === boatKey);
    if (!allowed) {
      return NextResponse.json({ error: 'Not a boat on your account.' }, { status: 403 });
    }
    orders = orders.filter(o => {
      if (vesselIdQ && o.vessel_id && String(o.vessel_id) === vesselIdQ) return true;
      if (companyQ && boatKey) return orderMatchesVessel(o, companyQ, boatKey);
      return false;
    });
  }

  return NextResponse.json({ orders, claimed });
}
