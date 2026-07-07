// src/app/api/admin/products/enrich/route.ts
// Enriches OUR catalog with descriptions + images from Sinclair's own website
// (Freshop public API — no auth; pagination via limit/skip, verified live).
//
// Matching is UPC-only (no fuzzy name matching) to avoid wrong pairings:
// both sides are normalized (digits only, leading zeros stripped) and we also
// try the variant with the UPC-A check digit dropped, since price-file UPCs
// and Freshop's item codes differ exactly that way.
//
//   POST { mode: 'preview' }                    → counts only, writes nothing
//   POST { mode: 'apply', overwrite: boolean }  → fills details/image_url
//        overwrite=false (default): only fills empty fields
//        overwrite=true: replaces existing details/images with Sinclair's
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const maxDuration = 60;

const APP_KEY = 'sinclair';
const STORE_ID = '4297';
const PAGE_SIZE = 100;
const IMAGE_BASE = 'https://images.freshop.ncrcloud.com';

interface FreshopProduct {
  upc?: string;
  barcode_upc_a?: string;
  barcode_ean13?: string;
  name?: string;
  size?: string;
  cover_image?: string;
  is_weight_required?: boolean;
}

/**
 * digits only, leading zeros stripped — '00070038364405' → '70038364405'.
 * Also strips the Excel float artifact first ('7003862792.0' → '7003862792'),
 * since Jen's original spreadsheet stored UPCs as numbers.
 */
function norm(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '');
  return s.replace(/\D/g, '').replace(/^0+/, '');
}

/** All normalized keys a Freshop product can be found under. */
function freshopKeys(p: FreshopProduct): string[] {
  const keys = new Set<string>();
  for (const raw of [p.upc, p.barcode_upc_a, p.barcode_ean13]) {
    const n = norm(raw);
    if (n.length >= 4) keys.add(n);
  }
  // UPC-A minus its check digit (matches Freshop's bare item code format)
  const upcA = norm(p.barcode_upc_a);
  if (upcA.length >= 5) keys.add(upcA.slice(0, -1));
  return Array.from(keys);
}

/** Keys to look up one of OUR products by. */
function ourKeys(upc: string): string[] {
  const n = norm(upc);
  if (n.length < 4) return [];
  const keys = [n];
  if (n.length >= 5) keys.push(n.slice(0, -1)); // in case ours carries a check digit theirs lacks
  return keys;
}

// Cache the Freshop index between preview → apply (same warm lambda).
let freshopCache: Map<string, FreshopProduct> | null = null;
let freshopCacheAt = 0;
const CACHE_MS = 10 * 60 * 1000;

async function buildFreshopIndex(): Promise<Map<string, FreshopProduct>> {
  if (freshopCache && Date.now() - freshopCacheAt < CACHE_MS) return freshopCache;

  // Total first, then fetch pages in parallel batches of 10
  const head = await fetch(
    `https://api.freshop.ncrcloud.com/1/products?app_key=${APP_KEY}&store_id=${STORE_ID}&limit=1`,
    { cache: 'no-store' }
  ).then(r => r.json());
  const total: number = head?.total ?? 0;
  if (!total) throw new Error('Sinclair product API returned no products');

  const pages = Math.ceil(total / PAGE_SIZE);
  const index = new Map<string, FreshopProduct>();

  for (let batchStart = 0; batchStart < pages; batchStart += 10) {
    const batch = [];
    for (let p = batchStart; p < Math.min(batchStart + 10, pages); p++) {
      batch.push(
        fetch(
          `https://api.freshop.ncrcloud.com/1/products?app_key=${APP_KEY}&store_id=${STORE_ID}&limit=${PAGE_SIZE}&skip=${p * PAGE_SIZE}&sort=name&name_sort=asc`,
          { cache: 'no-store' }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      );
    }
    const results = await Promise.all(batch);
    for (const data of results) {
      for (const item of (data?.items || []) as FreshopProduct[]) {
        for (const key of freshopKeys(item)) {
          // First occurrence wins; identical products may repeat across pages
          if (!index.has(key)) index.set(key, item);
        }
      }
    }
  }

  freshopCache = index;
  freshopCacheAt = Date.now();
  return index;
}

function detailsFrom(p: FreshopProduct): string | null {
  const name = (p.name || '').trim();
  if (!name) return null;
  const size = (p.size || '').trim();
  if (size && !name.toLowerCase().includes(size.toLowerCase())) {
    return `${name} (${size})`;
  }
  return name;
}

function imageFrom(p: FreshopProduct): string | null {
  return p.cover_image ? `${IMAGE_BASE}/${p.cover_image}_large.png` : null;
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const mode: 'preview' | 'apply' = body.mode === 'apply' ? 'apply' : 'preview';
  const overwrite: boolean = !!body.overwrite;

  const supabase = createServiceClient();

  // 1. Load OUR full catalog (paginated at 1000)
  const ours: { id: string; upc: string | null; details: string | null; image_url: string | null; billed_by_weight: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, details, image_url, billed_by_weight')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ours.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // 2. Build Sinclair index
  let index: Map<string, FreshopProduct>;
  try {
    index = await buildFreshopIndex();
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't reach Sinclair's product catalog: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    );
  }

  // 3. Match + compute updates
  const updates: { id: string; fields: Record<string, unknown> }[] = [];
  let matched = 0, imagesToSet = 0, detailsToSet = 0, weightFlags = 0, noUpc = 0;

  for (const product of ours) {
    if (!product.upc || !norm(product.upc)) { noUpc++; continue; }
    let hit: FreshopProduct | undefined;
    for (const key of ourKeys(product.upc)) {
      hit = index.get(key);
      if (hit) break;
    }
    if (!hit) continue;
    matched++;

    const fields: Record<string, unknown> = {};
    const newDetails = detailsFrom(hit);
    const newImage = imageFrom(hit);

    if (newDetails && (overwrite || !product.details)) {
      if (newDetails !== product.details) { fields.details = newDetails; detailsToSet++; }
    }
    if (newImage && (overwrite || !product.image_url)) {
      if (newImage !== product.image_url) { fields.image_url = newImage; imagesToSet++; }
    }
    // Bonus: Sinclair marks weighed items — set the flag (never unset)
    if (hit.is_weight_required && !product.billed_by_weight) {
      fields.billed_by_weight = true;
      weightFlags++;
    }
    if (Object.keys(fields).length) updates.push({ id: product.id, fields });
  }

  const summary = {
    our_products: ours.length,
    without_upc: noUpc,
    matched,
    products_to_update: updates.length,
    images_to_set: imagesToSet,
    details_to_set: detailsToSet,
    weight_flags_to_set: weightFlags,
    sinclair_products_indexed: index.size,
  };

  if (mode === 'preview') {
    return NextResponse.json({ mode: 'preview', summary });
  }

  // 4. Apply in chunks
  let updated = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    const results = await Promise.all(
      chunk.map(u => supabase.from('products').update(u.fields).eq('id', u.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      return NextResponse.json({
        error: `Stopped after ${updated} updates: ${failed.error.message}`,
        summary: { ...summary, applied: updated },
      }, { status: 500 });
    }
    updated += chunk.length;
  }

  // 5. Activity log
  await supabase.from('activity_logs').insert({
    order_id: null,
    order_number: null,
    action: 'catalog_enriched',
    from_value: "Sinclair's website (Freshop)",
    to_value: `${updated} products updated — ${imagesToSet} images, ${detailsToSet} descriptions, ${weightFlags} weight flags`,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
    note: overwrite ? 'Overwrite mode' : 'Fill-missing-only mode',
  });

  return NextResponse.json({ mode: 'apply', summary: { ...summary, applied: updated } });
}
