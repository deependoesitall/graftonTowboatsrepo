// src/app/api/admin/vessel-header/route.ts
//
// Fix spelling / capitalization on a boat's saved header.
//
// Order Builder fills Terminal, company, boat, contact from the LAST order
// for that boat. There is no separate "terminal" table — so a typo like
// "East CHarondelet" comes back every time until the snapshots are rewritten.
// This rewrites matching orders (and the companies / vessels rows if those
// names changed) so the next pick is clean.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselNameKey } from '@/lib/vessel-membership';

const HEADER_KEYS = [
  'company_name',
  'vessel_name',
  'contact_name',
  'phone',
  'terminal_name',
  'customer_email',
  'vessel_email',
] as const;

type HeaderKey = (typeof HEADER_KEYS)[number];

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const fromCompany = String(body.from?.company_name || '').trim();
  const fromVessel = String(body.from?.vessel_name || '').trim();
  const fromPhone = String(body.from?.phone || '').trim();
  if (!fromCompany) {
    return NextResponse.json({ error: 'company_name required' }, { status: 400 });
  }

  const to = (body.to && typeof body.to === 'object') ? body.to as Record<string, unknown> : {};
  const updates: Partial<Record<HeaderKey, string>> = {};
  for (const key of HEADER_KEYS) {
    if (typeof to[key] === 'string') updates[key] = to[key].trim();
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const idsFromBody = Array.isArray(body.ids)
    ? (body.ids as unknown[]).map(x => String(x || '').trim()).filter(Boolean)
    : [];

  let ids = idsFromBody.slice(0, 2000);
  if (!ids.length) {
    let q = supabase
      .from('orders')
      .select('id')
      .ilike('company_name', fromCompany);
    if (fromVessel) q = q.ilike('vessel_name', fromVessel);
    if (fromPhone) q = q.eq('phone', fromPhone);

    const { data: rows, error: findErr } = await q.limit(2000);
    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }
    ids = (rows || []).map(r => String(r.id));
  }
  if (!ids.length) {
    return NextResponse.json({ error: 'No matching orders for that boat.' }, { status: 404 });
  }

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error: upErr } = await supabase.from('orders').update(updates).in('id', chunk);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  if (updates.company_name && updates.company_name !== fromCompany) {
    await supabase
      .from('companies')
      .update({ name: updates.company_name })
      .ilike('name', fromCompany);
  }

  if (updates.vessel_name && fromVessel) {
    const oldKey = vesselNameKey(fromVessel);
    const newKey = vesselNameKey(updates.vessel_name);
    if (oldKey && newKey && oldKey !== newKey) {
      await supabase
        .from('vessels')
        .update({ name: updates.vessel_name, name_key: newKey })
        .eq('name_key', oldKey);
    } else if (oldKey && updates.vessel_name) {
      await supabase
        .from('vessels')
        .update({ name: updates.vessel_name })
        .eq('name_key', oldKey);
    }
  }

  return NextResponse.json({
    updated: ids.length,
    fields: Object.keys(updates),
  });
}
