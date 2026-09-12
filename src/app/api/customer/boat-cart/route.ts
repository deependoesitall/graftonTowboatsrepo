// src/app/api/customer/boat-cart/route.ts
//
// Shared grocery cart for everyone on a boat. Two cooks, one list.
// Auth is the crew login; the cart is keyed on vessel_id, not user_id.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';
import { vesselNameKey } from '@/lib/vessel-membership';

export const dynamic = 'force-dynamic';

async function crewUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const anon = createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function vesselIdForUser(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  hintedName?: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('vessel_members')
    .select('vessel_id, vessel:vessels(id, name, name_key)')
    .eq('user_id', userId);
  const boats = (data || []).map((m: {
    vessel_id: string;
    vessel?: { id: string; name: string; name_key: string } | { id: string; name: string; name_key: string }[] | null;
  }) => {
    const v = Array.isArray(m.vessel) ? m.vessel[0] : m.vessel;
    return v ? { id: v.id, name: v.name, name_key: v.name_key } : { id: m.vessel_id, name: '', name_key: '' };
  });
  if (!boats.length) return null;
  if (boats.length === 1) return boats[0].id;
  const want = vesselNameKey(hintedName || '');
  const hit = boats.find(b => b.name_key === want || vesselNameKey(b.name) === want);
  return hit?.id || boats[0].id;
}

export async function GET(req: NextRequest) {
  const user = await crewUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const hinted = req.nextUrl.searchParams.get('vessel') || '';
  const vesselId = await vesselIdForUser(supabase, user.id, hinted);
  if (!vesselId) return NextResponse.json({ vessel_id: null, items: [], services: null, vessel_info: null });

  const { data } = await supabase
    .from('vessel_carts')
    .select('items, services, vessel_info, updated_at, updated_by')
    .eq('vessel_id', vesselId)
    .maybeSingle();

  return NextResponse.json({
    vessel_id: vesselId,
    items: data?.items || [],
    services: data?.services ?? null,
    vessel_info: data?.vessel_info ?? null,
    updated_at: data?.updated_at ?? null,
    updated_by: data?.updated_by ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const user = await crewUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const replace = body.replace === true;
  const incoming = Array.isArray(body.items) ? body.items : [];
  const supabase = createServiceClient();
  const vesselId = await vesselIdForUser(supabase, user.id, body.vessel_name);
  if (!vesselId) {
    return NextResponse.json({ error: 'This login is not linked to a boat yet.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('vessel_carts')
    .select('items, services, vessel_info')
    .eq('vessel_id', vesselId)
    .maybeSingle();

  const serverItems: Array<{ product_id?: string }> = Array.isArray(existing?.items) ? existing.items : [];
  let items = incoming;
  if (!replace) {
    const byId = new Map<string, unknown>();
    for (const it of serverItems) {
      const id = String(it?.product_id || '');
      if (id) byId.set(id, it);
    }
    for (const it of incoming) {
      const id = String(it?.product_id || '');
      if (id) byId.set(id, it);
    }
    items = Array.from(byId.values());
  }

  const row = {
    vessel_id: vesselId,
    items,
    services: body.services === undefined ? existing?.services ?? null : body.services,
    vessel_info: body.vessel_info === undefined ? null : body.vessel_info,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  const { error } = await supabase.from('vessel_carts').upsert(row, { onConflict: 'vessel_id' });
  if (error) {
    // Table missing until 081 is run — don't fail checkout.
    console.error('boat-cart:', error.message);
    return NextResponse.json({ error: error.message, vessel_id: vesselId, items }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vessel_id: vesselId, items });
}
