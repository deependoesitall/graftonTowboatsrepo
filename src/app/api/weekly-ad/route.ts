// src/app/api/weekly-ad/route.ts
// Serves Sinclair's weekly ad PDF inline on OUR site (never redirects the
// customer to shop.sinclairsfoods.com, where they might order direct).
//
// Resolution order:
//   1. Manual override — admin_settings.weekly_ad_url (set by the Sinclair
//      manager in Settings → Sinclair's). Use when auto-detection breaks.
//   2. Auto-detect — scrape Sinclair's weekly-ad page for the current
//      circular PDF (hosted on circulars.freshop.*), so the ad updates
//      itself every week with zero maintenance.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SINCLAIR_AD_PAGES = [
  'https://shop.sinclairsfoods.com/weekly-ad',
  'https://sinclairs-foods.freshop.ncrvoyix.com/weekly-ad',
];

// Matches e.g. https://circulars.freshop.ncrcloud.com/3928824785307450440-bd59….pdf
const CIRCULAR_PDF_RE = /https:\/\/circulars\.freshop\.[a-z0-9.-]+\/[^"'\s\\<>]+\.pdf/i;

// Cache the discovered PDF URL for an hour so we don't hit Sinclair's site
// on every page view. (Module-level cache — fine for a single lambda; worst
// case a cold start just re-scrapes.)
let cachedPdfUrl: string | null = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000;

async function discoverAdPdfUrl(): Promise<string | null> {
  if (cachedPdfUrl && Date.now() - cachedAt < CACHE_MS) return cachedPdfUrl;

  for (const page of SINCLAIR_AD_PAGES) {
    try {
      const res = await fetch(page, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GraftonTowboatServices/1.0)' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(CIRCULAR_PDF_RE);
      if (match) {
        cachedPdfUrl = match[0];
        cachedAt = Date.now();
        return cachedPdfUrl;
      }
    } catch {
      // try the next source
    }
  }
  return null;
}

export async function GET() {
  // 1. Manual override from settings
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('weekly_ad_url').single();
  const override = (data?.weekly_ad_url || '').trim();

  // 2. Auto-detect from Sinclair's site when no override is set
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
      // Discovered URL may be stale — bust the cache so next request re-scrapes
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
