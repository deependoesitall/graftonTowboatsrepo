// src/app/api/order-config/route.ts
// Public, non-sensitive order configuration: the store walking order used by
// shopping mode and the pick sheet to group items by aisle/zone (set by the
// Sinclair's manager), plus the effective COD handling-fee percentage so
// checkout can quote it. Nothing here identifies a customer or an order.
// The order-cutoff buffers used to live here and were removed with the timer.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sanitizeZoneOrder, DEFAULT_ZONE_ORDER } from '@/lib/store-layout';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('store_zone_order, cod_fee_enabled, cod_fee_percent')
    .single();

  // Effective COD fee — 0 when the feature is toggled off. Checkout only
  // needs the effective number, never the raw toggle.
  const codFeeEnabled = data?.cod_fee_enabled ?? true;
  const codFeePercent = codFeeEnabled ? Number(data?.cod_fee_percent ?? 5) : 0;

  return NextResponse.json({
    store_zone_order: data?.store_zone_order ? sanitizeZoneOrder(data.store_zone_order) : DEFAULT_ZONE_ORDER,
    cod_fee_percent: codFeePercent,
  });
}
