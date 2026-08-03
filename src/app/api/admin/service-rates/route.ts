// src/app/api/admin/service-rates/route.ts
// Service types (shared default rate) + per-company overrides.
//
// GET  — everything the rate editor needs: all service types with their
//        default rate, plus each company's overrides. Also serves the
//        auto-fill lookup: ?company_id=&service_type_id= → effective rate.
// PATCH— edit a service type's default rate / name (mode: 'default'),
//        or set a company override (mode: 'override', rate; null clears it).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('company_id');
  const serviceTypeId = searchParams.get('service_type_id');

  // Auto-fill lookup: effective rate for one (company, service) pair.
  if (companyId && serviceTypeId) {
    const [{ data: st }, { data: override }] = await Promise.all([
      supabase.from('service_types').select('default_rate').eq('id', serviceTypeId).single(),
      supabase.from('company_service_rates').select('rate').eq('company_id', companyId).eq('service_type_id', serviceTypeId).maybeSingle(),
    ]);
    const rate = override?.rate ?? st?.default_rate ?? null;
    return NextResponse.json({ rate, is_override: override?.rate != null });
  }

  const [{ data: types }, { data: overrides }] = await Promise.all([
    supabase.from('service_types').select('*').order('sort').order('name'),
    supabase.from('company_service_rates').select('*'),
  ]);
  return NextResponse.json({ service_types: types || [], overrides: overrides || [] });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const body = await req.json();
  const supabase = createServiceClient();

  // Edit a shared default rate (or rename / add a service type)
  if (body.mode === 'default') {
    const { id, name, default_rate } = body;
    if (id) {
      const { data, error } = await supabase
        .from('service_types')
        .update({ ...(name != null ? { name } : {}), ...(default_rate != null ? { default_rate } : {}) })
        .eq('id', id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ service_type: data });
    }
    const { data, error } = await supabase
      .from('service_types').insert({ name, default_rate: default_rate ?? 0 }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ service_type: data });
  }

  // Set / clear a per-company override
  if (body.mode === 'override') {
    const { company_id, service_type_id, rate } = body;
    if (!company_id || !service_type_id) return NextResponse.json({ error: 'company_id and service_type_id required' }, { status: 400 });
    if (rate == null || rate === '') {
      const { error } = await supabase.from('company_service_rates')
        .delete().eq('company_id', company_id).eq('service_type_id', service_type_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, cleared: true });
    }
    const { data, error } = await supabase.from('company_service_rates')
      .upsert({ company_id, service_type_id, rate, updated_at: new Date().toISOString() },
              { onConflict: 'company_id,service_type_id' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ override: data });
  }

  return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
}
