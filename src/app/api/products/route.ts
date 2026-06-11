// src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminSession, requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '50');
  const offset = (page - 1) * perPage;
  const isAdmin = !!getAdminSession(req);

  const supabase = createServiceClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .order('category')
    .order('description')
    .range(offset, offset + perPage - 1);

  // Public catalog only shows active products; admin sees all
  if (!isAdmin) query = query.eq('is_active', true);

  if (search) query = query.ilike('description', `%${search}%`);
  if (category && category !== 'All') query = query.eq('category', category);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data, total: count });
}

// Admin: bulk import products from CSV
export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { products } = await req.json();
  const supabase = createServiceClient();

  // Upsert by description if no UPC, otherwise by UPC
  const withUpc = products.filter((p: any) => p.upc);
  const withoutUpc = products.filter((p: any) => !p.upc);

  let count = 0;
  if (withUpc.length) {
    const { error } = await supabase.from('products').upsert(withUpc, { onConflict: 'upc' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    count += withUpc.length;
  }
  if (withoutUpc.length) {
    const { error } = await supabase.from('products').insert(withoutUpc);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    count += withoutUpc.length;
  }

  return NextResponse.json({ success: true, count });
}

// Admin: update a single product
export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

// Admin: delete a product
export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
