// src/app/api/admin/signups/route.ts
//
// Accounts people made themselves on the site that aren't on a boat yet.
// GET  → newest first, with the company / boat they typed in their profile.
// POST { user_id, vessel_id, role? } → put that account on the boat, same
//      as a login made from Customers → Logins, minus touching its password.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { listAuthUsers } from '@/lib/auth-user-dates';
import { vesselNameKey, orderMatchesVessel, normalizeCrewRole } from '@/lib/vessel-membership';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  let users;
  try {
    users = await listAuthUsers(supabase);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not list accounts' }, { status: 500 });
  }

  const [{ data: members, error: mErr }, { data: profiles, error: pErr }] = await Promise.all([
    supabase.from('vessel_members').select('user_id'),
    supabase.from('customer_profiles').select('user_id, first_name, last_name, company_name, vessel_name'),
  ]);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const onBoat = new Set((members || []).map((m: { user_id: string }) => m.user_id));
  type P = { user_id: string; first_name: string | null; last_name: string | null; company_name: string | null; vessel_name: string | null };
  const byUser = new Map((profiles || []).map((p: P) => [p.user_id, p]));

  const signups = users
    .filter(u => !onBoat.has(u.id))
    .map(u => {
      const p = byUser.get(u.id);
      return {
        user_id: u.id,
        email: u.email,
        signed_up_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        provider: u.provider,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null,
        company_name: p?.company_name?.trim() || null,
        vessel_name: p?.vessel_name?.trim() || null,
      };
    })
    .sort((a, b) => Date.parse(b.signed_up_at || '0') - Date.parse(a.signed_up_at || '0'));

  return NextResponse.json({ signups });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || '').trim();
  const vesselId = String(body.vessel_id || '').trim();
  const role = normalizeCrewRole(body.role);
  if (!userId || !vesselId) return NextResponse.json({ error: 'user_id and vessel_id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: got, error: uErr } = await supabase.auth.admin.getUserById(userId);
  if (uErr || !got?.user) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data: vessel, error: vErr } = await supabase
    .from('vessels')
    .select('id, name, company:companies(id, name)')
    .eq('id', vesselId)
    .single();
  if (vErr || !vessel) return NextResponse.json({ error: 'Boat not found' }, { status: 404 });
  const companyRel = (vessel as { company?: { name?: string } | { name?: string }[] | null }).company;
  const companyName = Array.isArray(companyRel) ? companyRel[0]?.name : companyRel?.name;

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('first_name, last_name, contact_name')
    .eq('user_id', userId)
    .maybeSingle();
  const email = (got.user.email || '').toLowerCase();
  const displayName = profile?.contact_name
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    || email;

  const { data: member, error: mErr } = await supabase
    .from('vessel_members')
    .upsert({ vessel_id: vesselId, user_id: userId, role, display_name: displayName, email }, { onConflict: 'vessel_id,user_id' })
    .select('*')
    .single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // Same as a new login: link this boat's earlier orders so they see history.
  if (companyName) {
    const key = vesselNameKey(vessel.name);
    const { data: hist } = await supabase
      .from('orders')
      .select('id, company_name, vessel_name, vessel_id')
      .is('vessel_id', null)
      .ilike('company_name', companyName);
    const ids = (hist || [])
      .filter((o: { vessel_name: string | null; company_name: string | null }) => orderMatchesVessel(o, companyName, key))
      .map((o: { id: string }) => o.id);
    if (ids.length) await supabase.from('orders').update({ vessel_id: vesselId }).in('id', ids);
  }

  return NextResponse.json({ member, vessel: { id: vessel.id, name: vessel.name, company_name: companyName || null } });
}
