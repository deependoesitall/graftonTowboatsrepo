// src/app/api/admin/catalog-sheet/route.ts
//
// The paper order form, as data.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// Boats still send orders on paper: Sinclair's printed form, quantities
// pencilled in the QNTY column, scanned and emailed. Someone at GTS then has
// to turn 20 scanned pages into an order in this system, and until now the
// only way to do that was to shop the customer storefront pretending to be the
// boat — searching for each item by name, one at a time, with a picture and a
// card and an add-to-cart animation standing between every line and the next.
//
// That is the wrong shape of tool for the job. The job is transcription: eyes
// on a printed row, fingers on a number, move down. So this returns the
// catalogue in the EXACT order of the paper form (migration 035's form_seq,
// which is what the barges asked for in the first place — "it is very key that
// the barges see the order as they see it on paper now"), and the builder
// renders it as the same list with a quantity box on each row.
//
// The transcriber's eye never has to leave the line it is on.
//
// ⚠️ ONE REQUEST, WHOLE FORM. ~1,200 rows is a few hundred KB and it is
// fetched once when the page opens. Paging this would be a mistake: the person
// using it is flipping between page 7 of a scan and the matching stretch of the
// list, and a network round trip in the middle of that is exactly the
// interruption the page exists to remove. Filtering happens in the browser.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

/**
 * ⚠️ ONE STRING LITERAL, NOT A CONCATENATION.
 *
 * supabase-js parses the select string AS A TYPE to infer the row shape. Split
 * across a `+` it degrades to plain `string`, inference gives up, and every
 * column access fails to compile as `GenericStringError` — which names the
 * symptom and not the cause. This broke a production build once already.
 */
const SHEET_COLUMNS =
  'id, upc, description, category, sub_category, pkg_size, uom, price, quantity_step, billed_by_weight, form_section, form_subsection, form_seq, image_url, is_available';

export async function GET(req: NextRequest) {
  // Any signed-in staff member. Sinclair's shoppers rebuild paper orders too —
  // Dave's team takes them over the counter — and gating this to GTS would send
  // them back to the phone.
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('products')
    .select(SHEET_COLUMNS)
    .eq('is_active', true)
    // NOT store_only: the full-store import is ~40,000 items and none of them
    // are on the paper form. Including them would bury the 1,200 rows that are.
    .eq('store_only', false)
    .order('form_seq', { ascending: true, nullsFirst: false })
    .order('description', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('catalog-sheet error:', error);
    return NextResponse.json({ error: 'Could not load the order form.' }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
