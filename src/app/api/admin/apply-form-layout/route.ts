// src/app/api/admin/apply-form-layout/route.ts
// Stamps the paper order form's layout onto the product catalog:
// form_section / form_subsection / form_seq from src/data/order-form-layout.json
// (parsed from Sinclair's marine order form spreadsheet, July 19, 2026).
//
// Matching, in confidence order — each product claims at most ONE form slot:
//   1. UPC (digits-only, leading zeros stripped)
//   2. normalized description + pack size
//   3. normalized description alone (only when it's unambiguous on both sides)
//
// Meat cuts on the form mostly have NO UPC (custom cuts) — those rely on
// description matching, so the response lists every unmatched form row for
// manual review. Re-running is safe (idempotent stamp, then bulk RPC).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import layout from '@/data/order-form-layout.json';

interface FormItem {
  seq: number;
  section: string;
  subsection: string | null;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
}

const normUpc = (u: string | null | undefined) =>
  (u || '').replace(/\D/g, '').replace(/^0+/, '');

// Uppercase, collapse punctuation/whitespace — "ROAST, BONELESS TOP ROUND ~5lb"
// and "ROAST BONELESS TOP ROUND ~5LB" become the same key.
const normDesc = (d: string | null | undefined) =>
  (d || '').toUpperCase().replace(/[^A-Z0-9%#~\/.]+/g, ' ').trim().replace(/\s+/g, ' ');

const normPkg = (p: string | null | undefined) =>
  (p || '').toUpperCase().replace(/\s+/g, '').replace(/POUND|LBS?\.?/g, '#');

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  // Pull the whole catalog once — matching happens in memory.
  const all: Array<{ id: string; upc: string | null; description: string; pkg_size: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, description, pkg_size')
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  // Index products
  const byUpc = new Map<string, string[]>();
  const byDescPkg = new Map<string, string[]>();
  const byDesc = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, id: string) => {
    if (!k) return;
    const arr = m.get(k); if (arr) arr.push(id); else m.set(k, [id]);
  };
  for (const p of all) {
    push(byUpc, normUpc(p.upc), p.id);
    push(byDescPkg, normDesc(p.description) + '|' + normPkg(p.pkg_size), p.id);
    push(byDesc, normDesc(p.description), p.id);
  }

  const items = (layout as { items: FormItem[] }).items;
  const claimed = new Set<string>();
  const matched: Array<{ id: string; section: string; subsection: string | null; seq: number; how: string }> = [];
  const unmatched: Array<{ seq: number; description: string; pkg_size: string | null; upc: string | null }> = [];

  const takeFirstFree = (ids: string[] | undefined): string | null => {
    if (!ids) return null;
    for (const id of ids) if (!claimed.has(id)) return id;
    return null;
  };

  for (const it of items) {
    let id: string | null = null; let how = '';
    if (it.upc) { id = takeFirstFree(byUpc.get(normUpc(it.upc))); if (id) how = 'upc'; }
    if (!id) {
      id = takeFirstFree(byDescPkg.get(normDesc(it.description) + '|' + normPkg(it.pkg_size)));
      if (id) how = 'desc+pkg';
    }
    if (!id) {
      const ids = byDesc.get(normDesc(it.description));
      // description-only: only when the catalog has exactly one candidate left
      if (ids && ids.filter(x => !claimed.has(x)).length === 1) {
        id = takeFirstFree(ids); if (id) how = 'desc';
      }
    }
    if (id) {
      claimed.add(id);
      matched.push({ id, section: it.section, subsection: it.subsection, seq: it.seq, how });
    } else {
      unmatched.push({ seq: it.seq, description: it.description, pkg_size: it.pkg_size, upc: it.upc });
    }
  }

  // Clear old stamps first (form rows can move between runs), then bulk apply.
  const { error: clearErr } = await supabase
    .from('products')
    .update({ form_section: null, form_subsection: null, form_seq: null })
    .not('form_seq', 'is', null);
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });

  const { data: updatedCount, error: rpcErr } = await supabase.rpc('apply_form_layout', {
    items: matched.map(m => ({ id: m.id, section: m.section, subsection: m.subsection, seq: m.seq })),
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  await supabase.from('activity_logs').insert({
    order_id: null,
    order_number: null,
    action: 'catalog_import',
    from_value: 'order-form layout',
    to_value: `${matched.length} matched / ${unmatched.length} unmatched`,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
  });

  return NextResponse.json({
    form_rows: items.length,
    matched: matched.length,
    updated: updatedCount,
    matched_by: {
      upc: matched.filter(m => m.how === 'upc').length,
      desc_pkg: matched.filter(m => m.how === 'desc+pkg').length,
      desc: matched.filter(m => m.how === 'desc').length,
    },
    unmatched_count: unmatched.length,
    unmatched,
  });
}
