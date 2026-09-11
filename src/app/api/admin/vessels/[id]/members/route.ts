// src/app/api/admin/vessels/[id]/members/route.ts
// GET  — list members for a vessel
// POST — create a cook/captain login and link them to the vessel
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vessel_members')
    .select('*')
    .eq('vessel_id', id)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const { id: vesselId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.first_name || '').trim();
  const lastName = String(body.last_name || '').trim();
  const roleRaw = String(body.role || 'cook').trim().toLowerCase();
  const role = (['cook', 'captain', 'other'].includes(roleRaw) ? roleRaw : 'cook') as
    'cook' | 'captain' | 'other';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (password.trim().length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }
  if (!firstName) {
    return NextResponse.json({ error: 'First name required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: vessel, error: vErr } = await supabase
    .from('vessels')
    .select('id, name, company:companies(id, name)')
    .eq('id', vesselId)
    .single();
  if (vErr || !vessel) {
    return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
  }

  const companyRel = (vessel as { company?: { name?: string } | { name?: string }[] | null }).company;
  const companyName = Array.isArray(companyRel) ? companyRel[0]?.name : companyRel?.name;

  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: password.trim(),
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      vessel_id: vesselId,
      company_name: companyName || null,
    },
  });

  if (authErr || !created.user) {
    const msg = authErr?.message || 'Failed to create login';
    const status = /already|registered|exists/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  const userId = created.user.id;
  const displayName = [firstName, lastName].filter(Boolean).join(' ');

  await supabase.from('customer_profiles').upsert({
    user_id: userId,
    first_name: firstName,
    last_name: lastName || null,
    contact_name: displayName,
    company_name: companyName || null,
  }, { onConflict: 'user_id' });

  const { data: member, error: mErr } = await supabase
    .from('vessel_members')
    .insert({
      vessel_id: vesselId,
      user_id: userId,
      role,
      display_name: displayName,
      email,
    })
    .select('*')
    .single();

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({
    member,
    vessel: { id: vessel.id, name: vessel.name, company_name: companyName },
  });
}
