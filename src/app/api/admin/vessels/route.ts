// src/app/api/admin/vessels/route.ts
// GET  — list vessels (optional ?company_id=)
// POST — upsert a vessel under a company (Link boat / Create boat); backfill orders.vessel_id
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselNameKey, orderMatchesVessel } from '@/lib/vessel-membership';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const companyId = req.nextUrl.searchParams.get('company_id') || '';
  const supabase = createServiceClient();
  let q = supabase
    .from('vessels')
    .select('*, company:companies(id, name), members:vessel_members(id, user_id, role, display_name, email, created_at)')
    .order('name');
  if (companyId) q = q.eq('company_id', companyId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vessels: data ?? [] });
}

async function backfillOrders(
  supabase: ReturnType<typeof createServiceClient>,
  vesselId: string,
  companyName: string,
  nameKey: string,
): Promise<number> {
  const { data: candidates } = await supabase
    .from('orders')
    .select('id, company_name, vessel_name')
    .is('vessel_id', null)
    .ilike('company_name', companyName)
    .limit(500);

  const ids = (candidates || [])
    .filter(o => orderMatchesVessel(o, companyName, nameKey))
    .map(o => o.id);

  if (!ids.length) return 0;

  const { error, count } = await supabase
    .from('orders')
    .update({ vessel_id: vesselId }, { count: 'exact' })
    .in('id', ids);
  if (error) return 0;
  return count || ids.length;
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const companyId = String(body.company_id || '').trim();
  const name = String(body.name || '').trim();
  const backfill = body.backfill_orders !== false; // default on
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Vessel name required' }, { status: 400 });

  const name_key = vesselNameKey(name);
  if (!name_key) return NextResponse.json({ error: 'Vessel name required' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single();
  if (cErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Already linked? Reuse — linking ledger boats must not feel like inventing them.
  const { data: existing } = await supabase
    .from('vessels')
    .select('*, company:companies(id, name), members:vessel_members(id, user_id, role, display_name, email, created_at)')
    .eq('company_id', companyId)
    .eq('name_key', name_key)
    .maybeSingle();

  if (existing) {
    let linked_orders = 0;
    if (backfill) {
      linked_orders = await backfillOrders(supabase, existing.id, company.name, name_key);
    }
    return NextResponse.json({
      vessel: existing,
      linked: true,
      created: false,
      linked_orders,
    });
  }

  const { data, error } = await supabase
    .from('vessels')
    .insert({ company_id: companyId, name, name_key })
    .select('*, company:companies(id, name), members:vessel_members(id, user_id, role, display_name, email, created_at)')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Race: fetch and return
      const { data: raced } = await supabase
        .from('vessels')
        .select('*, company:companies(id, name), members:vessel_members(id, user_id, role, display_name, email, created_at)')
        .eq('company_id', companyId)
        .eq('name_key', name_key)
        .single();
      if (raced) {
        let linked_orders = 0;
        if (backfill) {
          linked_orders = await backfillOrders(supabase, raced.id, company.name, name_key);
        }
        return NextResponse.json({ vessel: raced, linked: true, created: false, linked_orders });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let linked_orders = 0;
  if (backfill) {
    linked_orders = await backfillOrders(supabase, data.id, company.name, name_key);
  }

  return NextResponse.json({
    vessel: data,
    linked: false,
    created: true,
    linked_orders,
  });
}
