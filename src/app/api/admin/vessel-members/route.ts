// src/app/api/admin/vessel-members/route.ts
// GET — companies → vessels → members for Jen's Accounts / Logins UI
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('vessel_members')
    .select(`
      id,
      user_id,
      email,
      display_name,
      role,
      created_at,
      vessel:vessels(
        id,
        name,
        company:companies(id, name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    user_id: string;
    email: string | null;
    display_name: string | null;
    role: string;
    created_at: string;
    vessel?: {
      id?: string;
      name?: string;
      company?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    } | {
      id?: string;
      name?: string;
      company?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    }[] | null;
  };

  const members = ((data || []) as Row[]).map((row) => {
    const vesselRel = Array.isArray(row.vessel) ? row.vessel[0] : row.vessel;
    const companyRel = vesselRel?.company;
    const company = Array.isArray(companyRel) ? companyRel[0] : companyRel;
    return {
      id: row.id,
      user_id: row.user_id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
      created_at: row.created_at,
      vessel_id: vesselRel?.id || null,
      vessel_name: vesselRel?.name || null,
      company_id: company?.id || null,
      company_name: company?.name || null,
    };
  }).filter((m) => {
    if (!q) return true;
    const hay = [m.display_name, m.email, m.vessel_name, m.company_name, m.role]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  // Group for UI convenience: company → vessel → members
  const companiesMap = new Map<string, {
    id: string;
    name: string;
    vessels: Map<string, {
      id: string;
      name: string;
      members: typeof members;
    }>;
  }>();

  for (const m of members) {
    const cKey = m.company_id || '_none';
    const cName = m.company_name || 'Unassigned company';
    if (!companiesMap.has(cKey)) {
      companiesMap.set(cKey, { id: cKey, name: cName, vessels: new Map() });
    }
    const company = companiesMap.get(cKey)!;
    const vKey = m.vessel_id || '_none';
    const vName = m.vessel_name || 'Unassigned boat';
    if (!company.vessels.has(vKey)) {
      company.vessels.set(vKey, { id: vKey, name: vName, members: [] });
    }
    company.vessels.get(vKey)!.members.push(m);
  }

  const companies = [...companiesMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      vessels: [...c.vessels.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((v) => ({
          id: v.id,
          name: v.name,
          members: v.members,
        })),
    }));

  return NextResponse.json({ members, companies });
}
