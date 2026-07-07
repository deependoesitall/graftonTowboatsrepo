// src/app/api/admin/coupons/route.ts
// Coupon management — owned by the Sinclair manager role (area: products,
// which managers can edit). Coupons are DISPLAY-ONLY to customers; savings
// are applied by Sinclair's at fulfillment, never in the cart.
// All lifecycle events are recorded in the activity log.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, AdminSessionPayload } from '@/lib/admin-auth-server';

const FIELDS = 'id, name, description, discount_type, discount_value, discount_text, applies_to, category, product_ids, starts_at, expires_at, is_active, created_by, created_at, updated_at';

async function logCoupon(session: AdminSessionPayload, action: string, couponName: string, note?: string) {
  const supabase = createServiceClient();
  await supabase.from('activity_logs').insert({
    order_id: null,
    order_number: null,
    action,
    from_value: null,
    to_value: couponName,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
    note: note || null,
  });
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products' });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('coupons')
    .select(FIELDS)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Coupon name required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('coupons').insert({
    name: body.name.trim(),
    description: body.description || null,
    discount_type: body.discount_type || 'amount',
    discount_value: body.discount_value ?? null,
    discount_text: body.discount_text || null,
    applies_to: body.applies_to || 'all',
    category: body.category || null,
    product_ids: Array.isArray(body.product_ids) ? body.product_ids : [],
    starts_at: body.starts_at || null,
    expires_at: body.expires_at || null,
    is_active: body.is_active ?? true,
    created_by: session.username,
  }).select(FIELDS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logCoupon(session, 'coupon_created', data.name, `Coupon created${data.expires_at ? `, expires ${data.expires_at}` : ''}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id, ...body } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['name', 'description', 'discount_type', 'discount_value', 'discount_text', 'applies_to', 'category', 'product_ids', 'starts_at', 'expires_at', 'is_active'] as const) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', id)
    .select(FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const action = body.is_active === false ? 'coupon_expired' : 'coupon_updated';
  await logCoupon(session, action, data.name);
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: coupon } = await supabase.from('coupons').select('name').eq('id', id).single();
  await supabase.from('coupons').delete().eq('id', id);
  if (coupon) await logCoupon(session, 'coupon_deleted', coupon.name);
  return NextResponse.json({ success: true });
}
