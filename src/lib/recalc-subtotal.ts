// src/lib/recalc-subtotal.ts
// Shared helper — recalculate and persist an order's subtotal from its current items.
// Kept outside any route file so Next.js route exports stay clean.

import { createServiceClient } from '@/lib/supabase/server';

export async function recalcSubtotal(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
) {
  const { data: items } = await supabase
    .from('order_items')
    .select('shopping_status, line_total, actual_total')
    .eq('order_id', orderId);

  if (!items) return;

  const subtotal = items
    .filter((i: { shopping_status: string }) => i.shopping_status !== 'out_of_stock')
    .reduce(
      (sum: number, i: { line_total: number; actual_total: number | null }) =>
        sum + (i.actual_total ?? i.line_total),
      0,
    );

  await supabase
    .from('orders')
    .update({ subtotal, updated_at: new Date().toISOString() })
    .eq('id', orderId);
}
