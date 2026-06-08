// src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '60');
  const offset = (page - 1) * perPage;

  const supabase = createServiceClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('category')
    .order('description')
    .range(offset, offset + perPage - 1);

  if (search) query = query.ilike('description', `%${search}%`);
  if (category && category !== 'All') query = query.eq('category', category);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data, total: count });
}

// Admin: bulk import products from CSV/JSON
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { products } = await req.json();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'upc' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, count: products.length });
}
