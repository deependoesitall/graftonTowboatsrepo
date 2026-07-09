// src/app/api/order-config/route.ts
// Public, non-sensitive order configuration: the cutoff buffers (hours
// before ETA) for the checkout form, plus the store walking order used by
// shopping mode to group items by aisle/zone (set by the Sinclair manager).
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sanitizeZoneOrder, DEFAULT_ZONE_ORDER } from '@/lib/store-layout';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('grocery_cutoff_hours, service_cutoff_hours, store_zone_order')
    .single();

  return NextResponse.json({
    grocery_cutoff_hours: Number(data?.grocery_cutoff_hours ?? 4),
    service_cutoff_hours: Number(data?.service_cutoff_hours ?? 2),
    store_zone_order: data?.store_zone_order ? sanitizeZoneOrder(data.store_zone_order) : DEFAULT_ZONE_ORDER,
  });
}
