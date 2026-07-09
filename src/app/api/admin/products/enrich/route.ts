// src/app/api/admin/products/enrich/route.ts
// Applies catalog enrichment computed CLIENT-SIDE (the admin's browser
// downloads Sinclair's catalog and does the UPC matching — see
// EnrichFromSinclair.tsx). Doing the download in the browser avoids Vercel's
// function timeout and NCR's datacenter rate-limiting entirely.
//
// This endpoint only validates and writes: a whitelist of cosmetic/shopping
// fields (details, image_url, billed_by_weight, location, location_seq) —
// never price, stock, or existence.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

const ALLOWED_FIELDS = new Set(['details', 'image_url', 'billed_by_weight', 'location', 'location_seq']);
const MAX_UPDATES = 3000;

interface UpdateItem {
  id: string;
  fields: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const updates: UpdateItem[] = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  if (updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: `Too many updates in one call (max ${MAX_UPDATES})` }, { status: 400 });
  }

  // Validate strictly — only cosmetic fields, correct types
  for (const u of updates) {
    if (!u || typeof u.id !== 'string' || !u.fields || typeof u.fields !== 'object') {
      return NextResponse.json({ error: 'Malformed update entry' }, { status: 400 });
    }
    for (const [key, value] of Object.entries(u.fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return NextResponse.json({ error: `Field not allowed: ${key}` }, { status: 400 });
      }
      if (key === 'billed_by_weight' && typeof value !== 'boolean') {
        return NextResponse.json({ error: 'billed_by_weight must be boolean' }, { status: 400 });
      }
      if ((key === 'details' || key === 'image_url') && typeof value !== 'string') {
        return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
      }
      if (key === 'image_url' && !/^https:\/\/(images|asset)\.freshop\./.test(value as string)) {
        return NextResponse.json({ error: 'image_url must be a Freshop CDN URL' }, { status: 400 });
      }
      if (key === 'location' && (typeof value !== 'string' || (value as string).length > 60)) {
        return NextResponse.json({ error: 'location must be a short string' }, { status: 400 });
      }
      if (key === 'location_seq' && value !== null
          && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 32767)) {
        return NextResponse.json({ error: 'location_seq must be a small integer or null' }, { status: 400 });
      }
    }
  }

  const supabase = createServiceClient();
  let applied = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    const results = await Promise.all(
      chunk.map(u => supabase.from('products').update(u.fields).eq('id', u.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      return NextResponse.json(
        { error: `Stopped after ${applied} updates: ${failed.error.message}`, applied },
        { status: 500 }
      );
    }
    applied += chunk.length;
  }

  // One activity-log entry per enrichment run (client sends totals on the
  // final batch only, so multi-batch runs log once).
  if (body.log) {
    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: null,
      action: 'catalog_enriched',
      from_value: "Sinclair's website (Freshop)",
      to_value: `${body.log.total_applied ?? applied} products updated — ${body.log.images ?? 0} images, ${body.log.details ?? 0} descriptions, ${body.log.weight_flags ?? 0} weight flags`,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      note: body.log.overwrite ? 'Overwrite mode' : 'Fill-missing-only mode',
    });
  }

  return NextResponse.json({ applied });
}
