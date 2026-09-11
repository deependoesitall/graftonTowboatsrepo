// src/app/api/admin/order-defaults/route.ts
//
// Every boat this business has delivered to, with its header as it was last
// time: captain, phone, vessel email, terminal, how it gets there.
//
// The customer-facing /api/customer/order-defaults answers the same question
// for ONE account, scoped to a bearer token, because a captain may only ever
// see their own boats. This is the staff view: Jen is rebuilding a paper order
// for a boat that has never had an account, and the only place that boat's
// details exist is the header of the last order someone typed for it.
//
// Same reasoning as the customer route on why there is no `vessels` table:
// every order already snapshots its whole header, so this derives the answer
// from data that is correct by construction rather than keeping a second copy
// with a sync problem attached.
//
// ⚠️ STAFF ONLY, AND THAT MATTERS MORE HERE. This returns EVERY vessel's
// captain name, mobile number and email across all customers. It is exactly
// the list a competitor would want. requireAdmin is the whole control.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

/** ⚠️ ONE STRING LITERAL — see the note in catalog-sheet/route.ts. */
const HEADER_COLUMNS =
  'company_name, vessel_name, vessel_type, captain_name, captain_phone, vessel_email, email, contact_name, phone, terminal_name, delivery_method, approach_side, vhf_channel, po_number, created_at';

interface HeaderRow {
  company_name: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  captain_name: string | null;
  captain_phone: string | null;
  vessel_email: string | null;
  email: string | null;
  contact_name: string | null;
  phone: string | null;
  terminal_name: string | null;
  delivery_method: 'boat' | 'van' | null;
  approach_side: string | null;
  vhf_channel: string | null;
  po_number: string | null;
  created_at: string;
}

export interface VesselHeader {
  vessel_name: string;
  company_name: string;
  vessel_type: string;
  captain_name: string;
  captain_phone: string;
  vessel_email: string;
  billing_email: string;
  contact_name: string;
  phone: string;
  terminal_name: string;
  delivery_method: 'boat' | 'van' | '';
  approach_side: string;
  vhf_channel: string;
  po_number: string;
  last_ordered: string;
  order_count: number;
  /** True when this boat is known only from the delivery ledger, never an order. */
  from_ledger?: boolean;
}

/**
 * PostgREST's `or=` filter is a comma-separated mini-language, so a comma,
 * parenthesis or wildcard typed into the search box would be read as syntax
 * rather than as text. Strip them: nobody searches for a boat called "R(1,2)%".
 */
function safeTerm(raw: string): string {
  return raw.replace(/[,()%*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  // ── SEARCH AT THE DATABASE, NOT IN THE BROWSER ─────────────────────────
  //
  // This used to hand the whole history down and filter it on the phone. That
  // works today — the ledger is 132 seeded rows — and stops working quietly:
  // every order placed makes the payload bigger, and the screen it slows down
  // is the one someone is using with a captain on the phone. Postgres indexes
  // this; a phone re-filtering an ever-growing array does not.
  //
  // With no query the request is just "show me something to start from", so it
  // returns the most recent boats and stays small.
  const q = safeTerm(req.nextUrl.searchParams.get('q') || '');
  const searching = q.length >= 2;

  let ordersQuery = supabase
    .from('orders')
    .select(HEADER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(searching ? 120 : 120);
  if (searching) {
    ordersQuery = ordersQuery.or(`vessel_name.ilike.%${q}%,company_name.ilike.%${q}%`);
  }
  const { data, error } = await ordersQuery;

  if (error) {
    console.error('admin order-defaults error:', error);
    // Degrade to "no history" rather than failing the builder. Typing a header
    // by hand is slower, not impossible; a 500 here would stop the order.
    return NextResponse.json({ vessels: [], terminals: [] });
  }

  const rows = (data ?? []) as unknown as HeaderRow[];

  const vessels: VesselHeader[] = [];
  const byKey = new Map<string, VesselHeader>();
  const terminals: string[] = [];
  const seenTerminal = new Set<string>();

  for (const row of rows) {
    const name = (row.vessel_name || '').trim();
    if (name) {
      // Keyed on vessel + company: two lines can run boats with the same name,
      // and merging them would put one company's captain on the other's order.
      const key = `${name.toLowerCase()}|${(row.company_name || '').toLowerCase().trim()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.order_count += 1;
      } else {
        // Rows arrive newest-first, so the FIRST one wins every field — that is
        // deliberately "as it was last time", not a merge of the best-looking
        // values from different years. A captain who changed boats last month
        // should not be resurrected because an older order still names him.
        const v: VesselHeader = {
          vessel_name: name,
          company_name: (row.company_name || '').trim(),
          vessel_type: (row.vessel_type || '').trim(),
          captain_name: (row.captain_name || '').trim(),
          captain_phone: (row.captain_phone || '').trim(),
          vessel_email: (row.vessel_email || '').trim(),
          billing_email: (row.email || '').trim(),
          contact_name: (row.contact_name || '').trim(),
          phone: (row.phone || '').trim(),
          terminal_name: (row.terminal_name || '').trim(),
          delivery_method: (row.delivery_method as 'boat' | 'van' | null) || '',
          approach_side: (row.approach_side || '').trim(),
          vhf_channel: (row.vhf_channel || '').trim(),
          po_number: (row.po_number || '').trim(),
          last_ordered: row.created_at,
          order_count: 1,
        };
        byKey.set(key, v);
        vessels.push(v);
      }
    }

    const term = (row.terminal_name || '').trim();
    if (term && !seenTerminal.has(term.toLowerCase())) {
      seenTerminal.add(term.toLowerCase());
      terminals.push(term);
    }
  }

  // ── THE DELIVERY LEDGER IS THE OTHER HALF OF THE ANSWER ────────────────
  //
  // Orders only know boats that have ordered THROUGH THIS SITE. Most of GTS's
  // boats never have: they phone, they fax, they send a scanned form — which is
  // the entire reason the order builder exists. Scott Noble has years of runs in
  // the deliveries ledger and had never once appeared in this picker, so the
  // screen told Jen "no boat by that name has ordered before" about a vessel
  // she delivers to every week.
  //
  // Ledger rows carry less: a name, a company, where it was delivered, the
  // number that was called. That is still most of a header and far better than
  // an empty form — and an order placed for that boat backfills the rest, so
  // the entry improves itself the first time it is used.
  let ledgerQuery = supabase
    .from('deliveries')
    .select('vessel_name, location_delivered, phone_number_used, delivery_date, company:companies(name)')
    .not('vessel_name', 'is', null)
    .order('delivery_date', { ascending: false })
    .limit(searching ? 200 : 200);
  if (searching) ledgerQuery = ledgerQuery.ilike('vessel_name', `%${q}%`);
  const { data: ledger } = await ledgerQuery;

  for (const row of (ledger ?? []) as unknown as Array<{
    vessel_name: string | null;
    location_delivered: string | null;
    phone_number_used: string | null;
    delivery_date: string | null;
    company: { name: string } | { name: string }[] | null;
  }>) {
    const name = (row.vessel_name || '').trim();
    if (!name) continue;
    const companyRaw = Array.isArray(row.company) ? row.company[0] : row.company;
    const company = (companyRaw?.name || '').trim();
    const key = `${name.toLowerCase()}|${company.toLowerCase()}`;

    const existing = byKey.get(key);
    if (existing) {
      // An order row already described this boat properly. Only fill the gaps —
      // never overwrite a captain's name with a ledger row that hasn't got one.
      if (!existing.terminal_name && row.location_delivered) {
        existing.terminal_name = row.location_delivered.trim();
      }
      if (!existing.phone && row.phone_number_used) {
        existing.phone = row.phone_number_used.trim();
      }
      existing.order_count += 1;
      continue;
    }

    const v: VesselHeader = {
      vessel_name: name,
      company_name: company,
      vessel_type: '',
      captain_name: '',
      captain_phone: '',
      vessel_email: '',
      billing_email: '',
      contact_name: '',
      phone: (row.phone_number_used || '').trim(),
      terminal_name: (row.location_delivered || '').trim(),
      delivery_method: '',
      approach_side: '',
      vhf_channel: '',
      po_number: '',
      last_ordered: row.delivery_date || '',
      order_count: 1,
      from_ledger: true,
    };
    byKey.set(key, v);
    vessels.push(v);

    const term = (row.location_delivered || '').trim();
    if (term && !seenTerminal.has(term.toLowerCase())) {
      seenTerminal.add(term.toLowerCase());
      terminals.push(term);
    }
  }

  // Boats that have ordered online first — their entries fill the whole header
  // — then everyone else, newest delivery first.
  vessels.sort((a, b) => {
    if (!!a.from_ledger !== !!b.from_ledger) return a.from_ledger ? 1 : -1;
    return (b.last_ordered || '').localeCompare(a.last_ordered || '');
  });

  // Enough to choose from without scrolling past the answer.
  return NextResponse.json({
    vessels: vessels.slice(0, searching ? 20 : 10),
    terminals: terminals.slice(0, 40),
    query: q,
  });
}
