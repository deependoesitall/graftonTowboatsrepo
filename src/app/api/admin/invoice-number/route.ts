// src/app/api/admin/invoice-number/route.ts
// The next GTS invoice number — readable and settable from the admin panel.
// Nobody knew where QuickBooks actually left off, so this can't be a constant
// in code; Mary Karen sets it to the real next number and it counts on from
// there. Owner-only.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('peek_invoice_number');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ next_invoice_number: Number(data) });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { next_invoice_number } = await req.json().catch(() => ({}));
  const n = Number(next_invoice_number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: 'Enter a whole number of 1 or more.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('set_invoice_number', { n: Math.floor(n) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('activity_logs').insert({
    order_id: null, order_number: null,
    action: 'settings_change',
    from_value: 'invoice number',
    to_value: `next invoice set to ${Math.floor(n)}`,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
  });

  return NextResponse.json({ next_invoice_number: Number(data) });
}
