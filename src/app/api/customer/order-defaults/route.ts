// src/app/api/customer/order-defaults/route.ts
//
// The boats and terminals this account has ordered for before, so the order
// form can offer them instead of an empty text field.
//
// ── WHY THERE IS NO `vessels` TABLE ─────────────────────────────────────
//
// Every submitted order already snapshots its whole header — company, vessel,
// type, captain, captain's phone, vessel email, terminal, delivery method. That
// snapshot is the record of "this boat, as it was last time", and it is written
// on every order for free. A separate vessels table would be a second copy of
// the same facts with a sync problem attached: someone edits the boat, past
// orders keep the old values, and the two disagree with no rule about which
// wins.
//
// A real table earns its place the day a vessel needs to be edited without
// placing an order, or shared between two people at one company. Until then
// this derives the same answer from data that is already correct by
// construction.
//
// ⚠️ SCOPED TO THE CALLER, ALWAYS. Everything here is keyed on the user_id from
// a verified bearer token — never on an email or a company name from the
// request. Vessel emails and captains' mobile numbers are exactly the kind of
// thing that must not be enumerable by guessing a company name.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface VesselDefault {
  vessel_name: string;
  vessel_type: string | null;
  captain_name: string | null;
  captain_phone: string | null;
  vessel_email: string | null;
  company_name: string | null;
  terminal_name: string | null;
  delivery_method: 'boat' | 'van' | null;
  approach_side: string | null;
  vhf_channel: string | null;
  last_ordered: string;
}

/**
 * ⚠️ ONE STRING LITERAL. DO NOT SPLIT THIS ACROSS A `+`.
 *
 * supabase-js infers the row type by parsing the select string AS A TYPE, so it
 * needs a literal. Written as `'a, b, ' + 'c'` the value is just `string` at the
 * type level, inference gives up, and every column access fails to compile with
 * `Property 'vessel_name' does not exist on type 'GenericStringError'` — which
 * names the symptom and not the cause, and is what broke the build the first
 * time this shipped.
 */
const ORDER_DEFAULT_COLUMNS =
  'vessel_name, vessel_type, captain_name, captain_phone, vessel_email, company_name, terminal_name, delivery_method, approach_side, vhf_channel, created_at';

/** The shape those columns come back in. Nothing here trusts the inference. */
interface DefaultsRow {
  vessel_name: string | null;
  vessel_type: string | null;
  captain_name: string | null;
  captain_phone: string | null;
  vessel_email: string | null;
  company_name: string | null;
  terminal_name: string | null;
  delivery_method: 'boat' | 'van' | null;
  approach_side: string | null;
  vhf_channel: string | null;
  created_at: string;
}

async function loadRows(userId: string): Promise<DefaultsRow[]> {
  const supabase = createServiceClient();
  // Newest first, then de-duplicated in memory. 60 rows is far more history
  // than anyone needs to see their own boats and is one cheap indexed read.
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DEFAULT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    console.error('order-defaults error:', error);
    // Degrade to "no history" rather than failing the order form. This endpoint
    // is a convenience; nothing downstream should break because it had a bad day.
    return [];
  }
  // The column list is fixed and hand-written directly above, so the shape is
  // known here in a way the generic cannot express.
  return (data ?? []) as unknown as DefaultsRow[];
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    // Not signed in is not an error — a guest simply has no history to offer.
    return NextResponse.json({ vessels: [], terminals: [] });
  }

  const anonClient = createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: auth, error: authError } = await anonClient.auth.getUser(authHeader.slice(7));
  if (authError || !auth.user) {
    return NextResponse.json({ vessels: [], terminals: [] });
  }
  const rows = await loadRows(auth.user.id);

  const vessels: VesselDefault[] = [];
  const seenVessel = new Set<string>();
  const terminals: string[] = [];
  const seenTerminal = new Set<string>();

  for (const row of rows) {
    const name = (row.vessel_name || '').trim();
    if (name && !seenVessel.has(name.toLowerCase())) {
      seenVessel.add(name.toLowerCase());
      vessels.push({
        vessel_name: name,
        vessel_type: row.vessel_type,
        captain_name: row.captain_name,
        captain_phone: row.captain_phone,
        vessel_email: row.vessel_email,
        company_name: row.company_name,
        terminal_name: row.terminal_name,
        delivery_method: row.delivery_method,
        approach_side: row.approach_side,
        vhf_channel: row.vhf_channel,
        last_ordered: row.created_at,
      });
    }
    const term = (row.terminal_name || '').trim();
    if (term && !seenTerminal.has(term.toLowerCase())) {
      seenTerminal.add(term.toLowerCase());
      terminals.push(term);
    }
  }

  // Enough to be useful, few enough to stay a glance rather than a list.
  return NextResponse.json({
    vessels: vessels.slice(0, 8),
    terminals: terminals.slice(0, 12),
  });
}
