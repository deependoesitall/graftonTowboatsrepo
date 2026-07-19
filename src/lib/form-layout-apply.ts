// src/lib/form-layout-apply.ts
// Shared engine that stamps the paper order form's layout (form_section /
// form_subsection / form_seq) onto the product catalog. Called from:
//   - the admin "Apply Order-Form Layout" button (manual)
//   - the nightly catalog sync cron (automatic, after enrichment finishes)
//
// Matching, in confidence order — each product claims at most ONE form slot:
//   1. UPC (digits-only, leading zeros stripped)
//   2. normalized description + pack size
//   3. normalized description alone (only when unambiguous)

import type { SupabaseClient } from '@supabase/supabase-js';
import layout from '@/data/order-form-layout.json';

export interface FormLayoutItem {
  seq: number;
  section: string;
  subsection: string | null;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
}

export interface FormLayoutResult {
  form_rows: number;
  matched: number;
  updated: number;
  matched_by: { upc: number; desc_pkg: number; desc: number };
  unmatched_count: number;
  unmatched: Array<{ seq: number; description: string; pkg_size: string | null; upc: string | null }>;
}

const normUpc = (u: string | null | undefined) =>
  (u || '').replace(/\D/g, '').replace(/^0+/, '');

const normDesc = (d: string | null | undefined) =>
  (d || '').toUpperCase().replace(/[^A-Z0-9%#~\/.]+/g, ' ').trim().replace(/\s+/g, ' ');

const normPkg = (p: string | null | undefined) =>
  (p || '').toUpperCase().replace(/\s+/g, '').replace(/POUND|LBS?\.?/g, '#');

/** Match the form layout against the catalog and bulk-apply via the RPC. */
export async function applyFormLayout(supabase: SupabaseClient): Promise<FormLayoutResult> {
  // Pull the BARGE catalog once — matching happens in memory. Full-store
  // imports (store_only) are excluded: the paper form maps onto the curated
  // catalog, and desc-only matching against 20k store items would misfire.
  const all: Array<{ id: string; upc: string | null; description: string; pkg_size: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, description, pkg_size')
      .eq('store_only', false)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

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

  const items = (layout as { items: FormLayoutItem[] }).items;
  const claimed = new Set<string>();
  const matched: Array<{ id: string; section: string; subsection: string | null; seq: number; how: string }> = [];
  const unmatched: FormLayoutResult['unmatched'] = [];

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
  if (clearErr) throw new Error(clearErr.message);

  const { data: updatedCount, error: rpcErr } = await supabase.rpc('apply_form_layout', {
    items: matched.map(m => ({ id: m.id, section: m.section, subsection: m.subsection, seq: m.seq })),
  });
  if (rpcErr) throw new Error(rpcErr.message);

  return {
    form_rows: items.length,
    matched: matched.length,
    updated: Number(updatedCount) || 0,
    matched_by: {
      upc: matched.filter(m => m.how === 'upc').length,
      desc_pkg: matched.filter(m => m.how === 'desc+pkg').length,
      desc: matched.filter(m => m.how === 'desc').length,
    },
    unmatched_count: unmatched.length,
    unmatched,
  };
}
