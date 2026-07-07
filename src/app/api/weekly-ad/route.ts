// src/app/api/weekly-ad/route.ts
// Proxies Sinclair's weekly ad PDF so it renders inline on OUR site.
// Never redirects the customer off-site (they might order through
// Sinclair's directly otherwise), and sidesteps X-Frame-Options/CORS
// blocks on the source PDF.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('weekly_ad_url').single();
  const url = (data?.weekly_ad_url || '').trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'No weekly ad configured' }, { status: 404 });
  }

  try {
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Ad source returned ${upstream.status}` }, { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="sinclairs-weekly-ad.pdf"',
        // Cache for 15 minutes — the ad changes weekly
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch weekly ad' }, { status: 502 });
  }
}
