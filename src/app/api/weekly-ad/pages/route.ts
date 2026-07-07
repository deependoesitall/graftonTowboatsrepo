// src/app/api/weekly-ad/pages/route.ts
// Returns the current Sinclair's weekly ad as a list of per-page IMAGE urls
// (lightweight WebP via Freshop's public image resizer) instead of the heavy
// multi-page PDF. This is what makes the ad fast and mobile-friendly — the
// PDF is only used for the Print button.
//
// Freshop public API (no auth required — verified against live traffic):
//   /1/circulars?app_key=sinclair&store_id=4297        → current circular
//   /1/circular_pages?app_key=sinclair&circular_id=…   → pages w/ reference_id
//   page image:  https://circulars.freshop.ncrcloud.com/{reference_id}_original.jpg
//   resizer:     https://ip.prod.freshop.retail.ncrcloud.com/resize?url=…&width=…&type=webp
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const APP_KEY = 'sinclair';
const STORE_IDS = ['4297', '4294'];
const CIRCULARS_CDN = 'https://circulars.freshop.ncrcloud.com';
const RESIZER = 'https://ip.prod.freshop.retail.ncrcloud.com/resize';

interface AdPage {
  sequence: number;
  src: string;      // ~900px WebP — fast on mobile
  srcLarge: string; // ~1600px WebP — desktop / pinch-zoom
  width: number;
  height: number;
}
interface AdPayload {
  name: string | null;
  description: string | null;
  disclaimer: string | null;
  pages: AdPage[];
}

function resized(referenceId: string, width: number): string {
  const source = `${CIRCULARS_CDN}/${referenceId}_original.jpg`;
  return `${RESIZER}?url=${encodeURIComponent(source)}&width=${width}&type=webp&quality=60`;
}

// Module-level cache (1 hour) — the ad changes weekly.
let cached: AdPayload | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000;

async function fetchAdPages(): Promise<AdPayload | null> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  for (const storeId of STORE_IDS) {
    try {
      const circRes = await fetch(
        `https://api.freshop.ncrcloud.com/1/circulars?app_key=${APP_KEY}&store_id=${storeId}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (!circRes.ok) continue;
      const circData = await circRes.json();
      const circulars: any[] = circData?.items || [];
      if (!circulars.length) continue;

      const now = Date.now();
      const current = circulars.find(c =>
        (!c.visible_start_date || new Date(c.visible_start_date).getTime() <= now) &&
        (!c.visible_finish_date || new Date(c.visible_finish_date).getTime() >= now)
      ) || circulars[0];
      if (!current?.id) continue;

      const pagesRes = await fetch(
        `https://api.freshop.ncrcloud.com/1/circular_pages?app_key=${APP_KEY}&circular_id=${current.id}&store_id=${storeId}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (!pagesRes.ok) continue;
      const pagesData = await pagesRes.json();
      const items: any[] = pagesData?.items || [];
      if (!items.length) continue;

      const pages: AdPage[] = items
        .filter(p => p.reference_id)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map(p => ({
          sequence: p.sequence ?? 0,
          src: resized(p.reference_id, 900),
          srcLarge: resized(p.reference_id, 1600),
          width: p.other_attributes?.width ?? 1020,
          height: p.other_attributes?.height ?? 2000,
        }));

      if (!pages.length) continue;

      cached = {
        name: current.name || null,
        description: current.description || null,
        disclaimer: current.price_disclaimer || null,
        pages,
      };
      cachedAt = Date.now();
      return cached;
    } catch {
      // try next store id
    }
  }
  return null;
}

export async function GET() {
  // Manual override set? Tell the client to fall back to the PDF viewer,
  // since we can't derive page images from an arbitrary PDF URL.
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('weekly_ad_url').single();
  const override = (data?.weekly_ad_url || '').trim();
  if (/^https?:\/\//i.test(override)) {
    return NextResponse.json({ mode: 'pdf' });
  }

  const ad = await fetchAdPages();
  if (!ad) {
    return NextResponse.json({ mode: 'none' }, { status: 404 });
  }
  return NextResponse.json(
    { mode: 'pages', ...ad },
    { headers: { 'Cache-Control': 'public, max-age=900' } }
  );
}
