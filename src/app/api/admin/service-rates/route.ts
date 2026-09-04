// src/app/api/admin/service-rates/route.ts
// Service types (shared default rate) + per-company overrides + per-BOAT overrides.
//
// Rates resolve in three tiers, most specific first:
//
//     boat rate  →  company rate  →  shared default
//
// The boat tier exists because of the note at the top of Jen's spreadsheet —
// "Ingram $225 rate is for Mike Schmeng and Scott Noble Only". See migration
// 062 for the full history behind it.
//
// GET  — everything the rate editor needs: service types + company overrides +
//        vessel overrides. Also serves the auto-fill lookup:
//        ?company_id=&service_type_id=[&vessel=] → effective rate + which tier
//        it came from.
// PATCH— mode 'default'  : edit/create a service type's shared rate
//        mode 'override' : set/clear a company rate
//        mode 'vessel'   : set/clear one boat's rate (null rate clears)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselKey } from '@/lib/vessel';

export type RateSource = 'vessel' | 'company' | 'default';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('company_id');
  const serviceTypeId = searchParams.get('service_type_id');
  const vessel = searchParams.get('vessel');

  // ── Auto-fill lookup for one (company, service[, boat]) ────────────
  if (companyId && serviceTypeId) {
    // The boat's key, not its raw name: "W Scott Noble" must find the rate set
    // against "Scott Noble" or the $225 rule silently misses a quarter of
    // Ingram's deliveries.
    const vKey = vessel ? vesselKey(vessel) : '';

    const [{ data: st }, { data: companyRate }, { data: vesselRate }] = await Promise.all([
      supabase.from('service_types').select('default_rate').eq('id', serviceTypeId).single(),
      supabase.from('company_service_rates').select('rate')
        .eq('company_id', companyId).eq('service_type_id', serviceTypeId).maybeSingle(),
      vKey
        ? supabase.from('vessel_service_rates').select('rate, vessel_label')
            .eq('company_id', companyId).eq('service_type_id', serviceTypeId)
            .eq('vessel_key', vKey).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let rate: number | null = null;
    let source: RateSource = 'default';
    if (vesselRate?.rate != null) { rate = Number(vesselRate.rate); source = 'vessel'; }
    else if (companyRate?.rate != null) { rate = Number(companyRate.rate); source = 'company'; }
    else if (st?.default_rate != null) { rate = Number(st.default_rate); source = 'default'; }

    return NextResponse.json({
      rate,
      source,
      vessel_label: (vesselRate as { vessel_label?: string } | null)?.vessel_label ?? null,
      // Kept for older callers that only asked "is this a company override?"
      is_override: source !== 'default',
    });
  }

  // ── Everything, for the rate editor ────────────────────────────────
  const [{ data: types }, { data: overrides }, { data: vesselRates }] = await Promise.all([
    supabase.from('service_types').select('*').order('sort').order('name'),
    supabase.from('company_service_rates').select('*'),
    supabase.from('vessel_service_rates').select('*'),
  ]);
  return NextResponse.json({
    service_types: types || [],
    overrides: overrides || [],
    vessel_rates: vesselRates || [],
  });
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

  // Set / clear ONE BOAT's rate
  if (body.mode === 'vessel') {
    const { company_id, service_type_id, vessel, rate } = body;
    if (!company_id || !service_type_id || !vessel) {
      return NextResponse.json({ error: 'company_id, service_type_id and vessel required' }, { status: 400 });
    }
    const key = vesselKey(vessel);
    if (!key) return NextResponse.json({ error: 'That boat name is empty once normalized.' }, { status: 400 });

    if (rate == null || rate === '') {
      const { error } = await supabase.from('vessel_service_rates').delete()
        .eq('company_id', company_id).eq('service_type_id', service_type_id).eq('vessel_key', key);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, cleared: true });
    }
    const { data, error } = await supabase.from('vessel_service_rates')
      .upsert({
        company_id, service_type_id, vessel_key: key,
        vessel_label: String(vessel).trim(),
        rate, updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,vessel_key,service_type_id' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ vessel_rate: data });
  }

  return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
}
