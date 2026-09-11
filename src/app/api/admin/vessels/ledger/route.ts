// src/app/api/admin/vessels/ledger/route.ts
// Distinct boats seen on the deliveries ledger for a company — for Link boat UX.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselNameKey } from '@/lib/vessel-membership';
import { canonicalVesselName } from '@/lib/vessel';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const companyId = (req.nextUrl.searchParams.get('company_id') || '').trim();
  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single();
  if (cErr || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Cap rows — enough history for suggestions without dumping the whole ledger.
  const { data: rows, error } = await supabase
    .from('deliveries')
    .select('vessel_name')
    .eq('company_id', companyId)
    .not('vessel_name', 'is', null)
    .order('delivery_date', { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: linked } = await supabase
    .from('vessels')
    .select('id, name, name_key')
    .eq('company_id', companyId);

  const linkedByKey = new Map((linked || []).map(v => [v.name_key, v]));

  type Bucket = { names: string[]; count: number };
  const buckets = new Map<string, Bucket>();
  for (const r of rows || []) {
    const raw = String(r.vessel_name || '').trim();
    if (!raw) continue;
    const key = vesselNameKey(raw);
    if (!key) continue;
    const b = buckets.get(key) || { names: [], count: 0 };
    b.names.push(raw);
    b.count += 1;
    buckets.set(key, b);
  }

  const boats = [...buckets.entries()]
    .map(([name_key, b]) => {
      const existing = linkedByKey.get(name_key);
      return {
        name_key,
        name: existing?.name || canonicalVesselName(b.names),
        delivery_count: b.count,
        vessel_id: existing?.id || null,
        already_linked: !!existing,
      };
    })
    .sort((a, b) => b.delivery_count - a.delivery_count || a.name.localeCompare(b.name));

  return NextResponse.json({ company, boats });
}
