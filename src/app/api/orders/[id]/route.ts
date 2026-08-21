// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Backfill missing item locations AND images from the CURRENT catalog
  // (display only — not persisted). Orders placed before the location/image
  // snapshots still get aisle grouping and product photos in shopping mode.
  const items = (data.items || []) as Array<{ product_id: string | null; location: string | null; location_seq: number | null; image_url: string | null }>;
  const missing = items.filter(i => i.product_id && (!i.location || i.location_seq == null || !i.image_url));
  if (missing.length > 0) {
    const ids = Array.from(new Set(missing.map(i => i.product_id))) as string[];
    const { data: prods } = await supabase
      .from('products')
      .select('id, location, location_seq, image_url')
      .in('id', ids);
    const locMap = new Map((prods || []).map((p: { id: string; location: string | null; location_seq: number | null; image_url: string | null }) => [p.id, p]));
    for (const item of missing) {
      const p = item.product_id ? locMap.get(item.product_id) : undefined;
      if (!p) continue;
      if (!item.location && p.location) item.location = p.location;
      if (item.location_seq == null && p.location_seq != null) item.location_seq = p.location_seq;
      if (!item.image_url && p.image_url) item.image_url = p.image_url;
    }
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  // Fetch current order so we can log the status transition and trigger emails
  const { data: existing } = await supabase
    .from('orders')
    .select('status, order_number, company_name, contact_name, phone, po_number')
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

  // Write activity log for status changes
  if (body.status && existing && body.status !== existing.status) {
    await supabase.from('activity_logs').insert({
      order_id: id,
      order_number: existing.order_number,
      action: 'status_change',
      from_value: existing.status,
      to_value: body.status,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      company_name: existing.company_name,
      contact_name: existing.contact_name,
      phone: existing.phone,
      po_number: existing.po_number,
    });

    // When order is marked fulfilled, recalculate the subtotal from final
    // shopping state (exclude out_of_stock items, use actual_total for weight
    // items). The final "Order Shopped" email is NOT sent here — fulfillment
    // by Sinclair's often isn't the end of the job (CODs, crew changes,
    // pickups). A GTS owner fires the final email manually from the dashboard
    // (POST /api/orders/[id]/send-shopped-email) after everything checks out.
    // Recalculate at SHOPPED as well as fulfilled. Shopping is when
    // out-of-stock lines and actual weights become known, so that is when
    // the subtotal stops being an estimate. Running it again on delivery is
    // harmless — the sum is idempotent.
    if (body.status === 'shopped' || body.status === 'fulfilled') {
      const { data: finalItems } = await supabase
        .from('order_items')
        .select('shopping_status, line_total, actual_total')
        .eq('order_id', id);

      if (finalItems) {
        const newSubtotal = finalItems
          .filter((i: { shopping_status: string }) => i.shopping_status !== 'out_of_stock')
          .reduce((sum: number, i: { line_total: number; actual_total: number | null }) =>
            sum + (i.actual_total ?? i.line_total), 0);

        await supabase
          .from('orders')
          .update({ subtotal: newSubtotal })
          .eq('id', id);
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;
  const role = session.role;

  const { id } = await params;
  const supabase = createServiceClient();


  const { data: existing } = await supabase
    .from('orders')
    .select('order_number, status, company_name, contact_name, phone, po_number')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: existing.order_number,
      action: 'order_deleted',
      from_value: existing.status,
      to_value: null,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: role,
      company_name: existing.company_name,
      contact_name: existing.contact_name,
      phone: existing.phone,
      po_number: existing.po_number,
    });
  }

  return NextResponse.json({ success: true });
}
