// src/app/api/weekly-ad/route.ts
// Serves Sinclair's weekly ad PDF inline on OUR site (never redirects the
// customer to shop.sinclairsfoods.com, where they might order direct).
//
// Resolution order:
//   1. Manual override — admin_settings.weekly_ad_url (set by the Sinclair
//      manager in Settings → Sinclair's). Use when auto-detection breaks.
//   2. Auto-detect — Sinclair's site runs on Freshop, whose public circulars
//      API returns the current ad's PDF key with no auth required:
//        GET https://api.freshop.ncrcloud.com/1/circulars?app_key=sinclair&store_id=4297
//        → items[0].pdf_s3_key → https://circulars.freshop.ncrcloud.com/{key}
//      (Verified against live network traffic on shop.sinclairsfoods.com/weekly-ad.)
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const FRESHOP_APP_KEY = 'sinclair';
const FRESHOP_STORE_IDS = ['4297', '4294']; // primary, fallback
const CIRCULARS_CDN = 'https://circulars.freshop.ncrcloud.com';

interface FreshopCircular {
  id: string;
  pdf_s3_key?: string;
  visible_start_date?: string;
  visible_finish_date?: string;
  sequence?: number;
  name?: string;
}

// Cache the discovered PDF URL for an hour so we don't hit Freshop's API on
// every page view. Module-level cache — worst case a cold start re-fetches.
let cachedPdfUrl: string | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000;

async function discoverAdPdfUrl(): Promise<string | null> {
  if (cachedPdfUrl && Date.now() - cachedAt < CACHE_MS) return cachedPdfUrl;

  for (const storeId of FRESHOP_STORE_IDS) {
    try {
      const res = await fetch(
        `https://api.freshop.ncrcloud.com/1/circulars?app_key=${FRESHOP_APP_KEY}&store_id=${storeId}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const items: FreshopCircular[] = data?.items || [];
      if (!items.length) continue;

      // Prefer the circular currently visible; fall back to the first item.
      const now = Date.now();
      const current = items.find(c =>
        c.pdf_s3_key &&
        (!c.visible_start_date || new Date(c.visible_start_date).getTime() <= now) &&
        (!c.visible_finish_date || new Date(c.visible_finish_date).getTime() >= now)
      ) || items.find(c => c.pdf_s3_key);

      if (current?.pdf_s3_key) {
        cachedPdfUrl = `${CIRCULARS_CDN}/${current.pdf_s3_key}`;
        cachedAt = Date.now();
        return cachedPdfUrl;
      }
    } catch {
      // try the next store id
    }
  }
  return null;
}

export async function GET() {
  // 1. Manual override from settings
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('weekly_ad_url').single();
  const override = (data?.weekly_ad_url || '').trim();

  // 2. Auto-detect via the Freshop circulars API when no override is set
  const url = /^https?:\/\//i.test(override) ? override : await discoverAdPdfUrl();

  if (!url) {
    return NextResponse.json(
      { error: 'No weekly ad found. Set a Weekly Ad PDF URL in Settings → Sinclair\'s as a fallback.' },
      { status: 404 }
    );
  }

  try {
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      // Discovered URL may be stale — bust the cache so next request re-detects
      cachedPdfUrl = null;
      return NextResponse.json({ error: `Ad source returned ${upstream.status}` }, { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="sinclairs-weekly-ad.pdf"',
        // Browser/CDN cache for 15 minutes — the ad changes weekly
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch {
    cachedPdfUrl = null;
    return NextResponse.json({ error: 'Failed to fetch weekly ad' }, { status: 502 });
  }
}
