// src/app/api/admin/vessels/route.ts
// GET  — list vessels (optional ?company_id=)
// POST — create a vessel under a company
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselNameKey } from '@/lib/vessel-membership';

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

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const companyId = String(body.company_id || '').trim();
  const name = String(body.name || '').trim();
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Vessel name required' }, { status: 400 });

  const name_key = vesselNameKey(name);
  if (!name_key) return NextResponse.json({ error: 'Vessel name required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vessels')
    .insert({ company_id: companyId, name, name_key })
    .select('*, company:companies(id, name)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That boat already exists under this company.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ vessel: data });
}
