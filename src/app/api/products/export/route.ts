// src/app/api/products/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: false });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  const PAGE_SIZE = 1000;
  let from = 0;
  const rows: any[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('products')
      .select('category, sub_category, upc, description, pkg_size, uom, price, is_active, is_available')
      .order('category')
      .order('description')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const headers = ['category', 'sub_category', 'upc', 'description', 'pkg_size', 'uom', 'price', 'is_active', 'is_available'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => csvEscape(r[h])).join(','));
  }
  const csv = lines.join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="grafton-towboat-catalog-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
