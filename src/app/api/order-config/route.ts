// src/app/api/order-config/route.ts
// Public, non-sensitive order configuration for the checkout form:
// the cutoff buffers (hours before ETA) set by the Sinclair manager.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('grocery_cutoff_hours, service_cutoff_hours')
    .single();

  return NextResponse.json({
    grocery_cutoff_hours: Number(data?.grocery_cutoff_hours ?? 4),
    service_cutoff_hours: Number(data?.service_cutoff_hours ?? 2),
  });
}
