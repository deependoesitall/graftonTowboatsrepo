// src/app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Total orders
  const { count: total } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  // By status
  const { data: statusData } = await supabase
    .from('orders')
    .select('status');

  const statusCounts = (statusData || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Total revenue
  const { data: revenueData } = await supabase
    .from('orders')
    .select('subtotal')
    .neq('status', 'cancelled');

  const totalRevenue = (revenueData || []).reduce((s, r) => s + r.subtotal, 0);

  // Recent orders (last 10)
  const { data: recent } = await supabase
    .from('orders')
    .select('order_number, company_name, subtotal, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    total: total || 0,
    new: statusCounts['new'] || 0,
    in_progress: statusCounts['in_progress'] || 0,
    fulfilled: statusCounts['fulfilled'] || 0,
    cancelled: statusCounts['cancelled'] || 0,
    total_revenue: totalRevenue,
    recent: recent || [],
  });
}
