'use client';
// src/lib/favorites.ts — direct Supabase client calls, protected by RLS
import { createClient } from '@/lib/supabase/client';
import { Product } from '@/types';

export async function getFavoriteIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase.from('user_favorites').select('product_id');
  return new Set((data || []).map(f => f.product_id));
}

export async function getFavoriteProducts(): Promise<Product[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('user_favorites')
    .select('product_id, products(*)')
    .order('created_at', { ascending: false });
  return (data || []).map((f: any) => f.products).filter(Boolean);
}

export async function addFavorite(productId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  await supabase.from('user_favorites').upsert(
    { user_id: user.id, product_id: productId },
    { onConflict: 'user_id,product_id' }
  );
  window.dispatchEvent(new CustomEvent('favorites-updated'));
  return true;
}

export async function removeFavorite(productId: string) {
  const supabase = createClient();
  await supabase.from('user_favorites').delete().eq('product_id', productId);
  window.dispatchEvent(new CustomEvent('favorites-updated'));
}
