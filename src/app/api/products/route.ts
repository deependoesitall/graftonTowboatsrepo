// src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminSession, requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const status = searchParams.get('status') || ''; // '', 'active', 'inactive', 'available', 'unavailable'
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '50');
  const offset = (page - 1) * perPage;
  const isAdmin = !!getAdminSession(req);

  const supabase = createServiceClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    // Paper order-form sequence first (barges shop the form top to bottom);
    // items not on the form sort after, alphabetically.
    .order('form_seq', { ascending: true, nullsFirst: false })
    .order('category')
    .order('description')
    .range(offset, offset + perPage - 1);

  // Public catalog only shows active + available products; admin sees all
  if (!isAdmin) {
    query = query.eq('is_active', true).eq('is_available', true);
  }

  if (search) {
    // Admin search: use search_text (covers description + category + tags) OR UPC exact match
    query = query.or(`search_text.ilike.%${search}%,upc.ilike.%${search}%`);
  }
  if (category && category !== 'All') query = query.eq('category', category);

  if (isAdmin) {
    if (status === 'active') query = query.eq('is_active', true);
    else if (status === 'inactive') query = query.eq('is_active', false);
    else if (status === 'available') query = query.eq('is_available', true);
    else if (status === 'unavailable') query = query.eq('is_available', false);
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data, total: count });
}

interface ImportRow {
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  is_active: boolean;
  is_available?: boolean;
  billed_by_weight?: boolean;
  details?: string | null;
  location?: string | null;
  tags?: string[];
}

// Admin: import products from CSV with duplicate detection
// mode: 'preview' | 'skip_duplicates' | 'update_duplicates' | 'add_anyway'
export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const products: ImportRow[] = body.products || [];
  const mode: string = body.mode || 'add_anyway';

  const supabase = createServiceClient();

  // ── PREVIEW MODE: classify rows without writing anything ──
  if (mode === 'preview') {
    const result = await classifyImportRows(supabase, products);
    return NextResponse.json(result);
  }

  // ── LOG MODE: record a completed wizard import in the activity log ──
  // Called once by the import wizard after all batches finish, so multi-batch
  // imports produce a single log entry with the aggregate counts.
  if (mode === 'log_import') {
    const meta = body.import_meta || {};
    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: null,
      action: 'catalog_import',
      from_value: meta.filename || 'unknown file',
      to_value: `${meta.added ?? 0} added / ${meta.updated ?? 0} updated / ${meta.skipped ?? 0} skipped`,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      note: meta.note || null,
    });
    return NextResponse.json({ success: true });
  }

  // ── COMMIT MODES ──
  const classified = await classifyImportRows(supabase, products);

  let inserted = 0, updated = 0, skipped = 0;

  const toInsert: ImportRow[] = [];
  const toUpdate: { id: string; row: ImportRow }[] = [];

  for (const item of classified.rows) {
    if (item.match) {
      if (mode === 'skip_duplicates') {
        skipped++;
        continue;
      }
      if (mode === 'update_duplicates') {
        toUpdate.push({ id: item.match.id, row: item.row });
        continue;
      }
      // add_anyway: insert as new row regardless of match
      toInsert.push(item.row);
    } else {
      toInsert.push(item.row);
    }
  }

  if (toInsert.length) {
    const { error } = await supabase.from('products').insert(
      toInsert.map(r => ({ ...r, is_available: r.is_available ?? true }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted += toInsert.length;
  }

  for (const { id, row } of toUpdate) {
    const { error } = await supabase
      .from('products')
      .update({
        category: row.category,
        sub_category: row.sub_category,
        upc: row.upc,
        description: row.description,
        pkg_size: row.pkg_size,
        uom: row.uom,
        price: row.price,
        ...(row.billed_by_weight !== undefined ? { billed_by_weight: row.billed_by_weight } : {}),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated++;
  }

  return NextResponse.json({ success: true, inserted, updated, skipped });
}

// Classify each import row as: no match (new), strong match (UPC+price), or
// weak match (description+pkg_size+price, different/missing UPC).
async function classifyImportRows(supabase: ReturnType<typeof createServiceClient>, products: ImportRow[]) {
  // Pull existing products that could plausibly match, keyed for fast lookup.
  const upcs = Array.from(new Set(products.map(p => p.upc).filter(Boolean))) as string[];
  const descKeys = products.map(p => `${(p.description || '').trim().toUpperCase()}|${(p.pkg_size || '').trim().toUpperCase()}`);

  const existingByUpc = new Map<string, any>();
  const existingByDescPkg = new Map<string, any[]>();

  // Fetch by UPC in chunks
  if (upcs.length) {
    const chunkSize = 200;
    for (let i = 0; i < upcs.length; i += chunkSize) {
      const chunk = upcs.slice(i, i + chunkSize);
      const { data } = await supabase.from('products').select('*').in('upc', chunk);
      for (const row of data || []) {
        if (row.upc) existingByUpc.set(row.upc, row);
      }
    }
  }

  // Fetch all active products' description/pkg_size/price for fallback matching.
  // Only fetch the columns we need to keep this light.
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, upc, description, pkg_size, price, category, sub_category, is_active, is_available');

  for (const row of allProducts || []) {
    const key = `${(row.description || '').trim().toUpperCase()}|${(row.pkg_size || '').trim().toUpperCase()}`;
    if (!existingByDescPkg.has(key)) existingByDescPkg.set(key, []);
    existingByDescPkg.get(key)!.push(row);
  }

  let newCount = 0, strongDupCount = 0, weakDupCount = 0;
  const rows: { row: ImportRow; match: any | null; matchType: 'upc_price' | 'name_pack_price' | null }[] = [];

  products.forEach((row, idx) => {
    let match: any | null = null;
    let matchType: 'upc_price' | 'name_pack_price' | null = null;

    if (row.upc) {
      const existing = existingByUpc.get(row.upc);
      if (existing && Number(existing.price) === Number(row.price)) {
        match = existing;
        matchType = 'upc_price';
      }
    }

    if (!match) {
      const key = descKeys[idx];
      const candidates = existingByDescPkg.get(key) || [];
      const priceMatch = candidates.find(c => Number(c.price) === Number(row.price));
      if (priceMatch) {
        match = priceMatch;
        matchType = 'name_pack_price';
      }
    }

    if (match) {
      if (matchType === 'upc_price') strongDupCount++;
      else weakDupCount++;
    } else {
      newCount++;
    }

    rows.push({ row, match, matchType });
  });

  return {
    summary: {
      total: products.length,
      new_items: newCount,
      strong_duplicates: strongDupCount, // UPC + price match
      weak_duplicates: weakDupCount,     // name + pack + price match, different/missing UPC
    },
    rows,
  };
}

// Admin: update a single product, or bulk-update multiple products
export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const supabase = createServiceClient();

  // Bulk update: { ids: string[], updates: {...} }
  if (Array.isArray(body.ids)) {
    const { ids, updates } = body as { ids: string[]; updates: Record<string, any> };
    if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    const { error, count } = await supabase
      .from('products')
      .update(updates, { count: 'exact' })
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: count ?? ids.length });
  }

  // Single update
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

// Admin: delete a single product, or bulk-delete multiple products
export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const supabase = createServiceClient();

  if (Array.isArray(body.ids)) {
    const ids: string[] = body.ids;
    if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: ids.length });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
