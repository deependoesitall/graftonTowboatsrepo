// src/app/api/admin/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '50');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * perPage;

  const supabase = createServiceClient();

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (search) {
    const term = search.replace(/[%_]/g, ''); // strip wildcard chars from user input
    query = query.or(
      [
        `order_number.ilike.%${term}%`,
        `admin_username.ilike.%${term}%`,
        `admin_display_name.ilike.%${term}%`,
        `company_name.ilike.%${term}%`,
        `contact_name.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
        `po_number.ilike.%${term}%`,
      ].join(',')
    );
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data, total: count });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id, note } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing log id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('activity_logs')
    .update({ note: note?.trim() || null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
