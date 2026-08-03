// src/app/api/admin/companies/route.ts
// Barge-line companies + their per-service rate cards.
// GET    — list companies (optionally ?with_rates=1 to include rate overrides)
// POST   — create a company
// PATCH  — rename / toggle active
// DELETE — remove a company (deliveries keep their row; company_id set null)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ companies: data });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: data });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: data });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createServiceClient();
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
