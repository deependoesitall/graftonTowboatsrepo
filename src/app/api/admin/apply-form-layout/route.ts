// src/app/api/admin/apply-form-layout/route.ts
// Manual trigger for the order-form layout stamp — the actual matching engine
// lives in src/lib/form-layout-apply.ts (shared with the nightly sync cron).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { applyFormLayout } from '@/lib/form-layout-apply';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  try {
    const result = await applyFormLayout(supabase);

    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: null,
      action: 'catalog_import',
      from_value: 'order-form layout',
      to_value: `${result.matched} matched / ${result.unmatched_count} unmatched`,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Apply failed' }, { status: 500 });
  }
}
