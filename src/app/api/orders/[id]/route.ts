// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin auth check
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  // Fetch current order first so we can log the status transition
  const { data: existing } = await supabase
    .from('orders')
    .select('status, order_number')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('orders')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write an activity log entry for status changes.
  // Admin identity comes from headers set by the admin client (see admin-auth.ts / fetch helper).
  if (body.status && existing && body.status !== existing.status) {
    const adminUsername = req.headers.get('x-admin-username') || null;
    const adminDisplayName = req.headers.get('x-admin-name') || null;
    const adminRole = req.headers.get('x-admin-role') || null;

    await supabase.from('activity_logs').insert({
      order_id: id,
      order_number: existing.order_number,
      action: 'status_change',
      from_value: existing.status,
      to_value: body.status,
      admin_username: adminUsername,
      admin_display_name: adminDisplayName,
      admin_role: adminRole,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only Owners may permanently delete orders
  const role = req.headers.get('x-admin-role');
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('orders')
    .select('order_number, status')
    .eq('id', id)
    .single();

  // order_items has ON DELETE CASCADE from orders, so deleting the order removes its items too
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log the deletion for accountability
  if (existing) {
    const adminUsername = req.headers.get('x-admin-username') || null;
    const adminDisplayName = req.headers.get('x-admin-name') || null;
    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: existing.order_number,
      action: 'order_deleted',
      from_value: existing.status,
      to_value: null,
      admin_username: adminUsername,
      admin_display_name: adminDisplayName,
      admin_role: role,
    });
  }

  return NextResponse.json({ success: true });
}
