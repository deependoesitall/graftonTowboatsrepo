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
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('orders')
    .select(HEADER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(600);

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

  // Whole list, not a top-8 slice like the customer route: staff are looking
  // for one specific boat by name and the browser filters it instantly.
  return NextResponse.json({ vessels, terminals });
}
