// src/lib/sinclair-coupons.ts
// Sinclair's digital coupons — auto-pulled from Freshop's public API
// (same platform behind shop.sinclairsfoods.com/digital-coupons; no auth
// required, verified against live traffic). Server-side only.

export interface SinclairCoupon {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  department: string | null;
  offer_value: string | null;
  cover_image_url: string | null;
  finish_date: string | null;
  popularity: number;
}

export interface SinclairCouponsResult {
  items: SinclairCoupon[];
  total: number;
}

export async function fetchSinclairCoupons(limit = 300): Promise<SinclairCouponsResult> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/offers?app_key=sinclair&is_clippable=true&limit=${limit}&store_id=4297`,
      { next: { revalidate: 900 }, headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return { items: [], total: 0 };
    const data = await res.json();
    const items: any[] = data?.items || [];
    return {
      total: Number(data?.total ?? items.length),
      items: items.map(o => ({
        id: String(o.id),
        name: o.name || '',
        description: o.description || null,
        brand: o.brand || null,
        department: o.department || null,
        offer_value: o.offer_value || null,
        cover_image_url: o.cover_image_url || null,
        finish_date: o.finish_date || null,
        popularity: Number(o.popularity ?? 0),
      })),
    };
  } catch {
    return { items: [], total: 0 };
  }
}
