// Hydrate aisle + photo onto order_items from the live catalog.
// Display-only: older orders (and register-tape lines) often snapshot UPC
// without image_url. Shopping mode and the order editor both read this.

type ItemLike = {
  product_id?: string | null;
  location?: string | null;
  location_seq?: number | null;
  image_url?: string | null;
};

export async function hydrateOrderItemCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  items: ItemLike[],
): Promise<void> {
  const missing = items.filter(i => i.product_id && (!i.location || i.location_seq == null || !i.image_url));
  if (!missing.length) return;

  const ids = Array.from(new Set(missing.map(i => i.product_id))) as string[];
  const locMap = new Map<string, { location: string | null; location_seq: number | null; image_url: string | null }>();
  const PAGE = 200;
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE);
    const { data: prods } = await supabase
      .from('products')
      .select('id, location, location_seq, image_url')
      .in('id', chunk);
    for (const p of (prods || []) as Array<{
      id: string; location: string | null; location_seq: number | null; image_url: string | null;
    }>) {
      locMap.set(p.id, p);
    }
  }

  for (const item of missing) {
    const p = item.product_id ? locMap.get(item.product_id) : undefined;
    if (!p) continue;
    if (!item.location && p.location) item.location = p.location;
    if (item.location_seq == null && p.location_seq != null) item.location_seq = p.location_seq;
    if (!item.image_url && p.image_url) item.image_url = p.image_url;
  }
}
