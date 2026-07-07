'use client';
// src/app/weekly-ad/page.tsx
// Sinclair's weekly ad, embedded inline (proxied through /api/weekly-ad so
// customers never leave the ordering site). Includes a print button.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft, Loader2, FileX } from 'lucide-react';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default function WeeklyAdPage() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    // HEAD-check the proxy so we can show a friendly message when no ad is set
    fetch('/api/weekly-ad', { method: 'GET', headers: { Range: 'bytes=0-0' } })
      .then(res => setStatus(res.ok ? 'ok' : 'missing'))
      .catch(() => setStatus('missing'));
  }, []);

  function printAd() {
    const frame = document.getElementById('weekly-ad-frame') as HTMLIFrameElement | null;
    try {
      frame?.contentWindow?.print();
    } catch {
      // Cross-origin fallback: open the proxied PDF in a new tab for printing
      window.open('/api/weekly-ad', '_blank');
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <Link href="/catalog" className="inline-flex items-center gap-1.5 text-brand-river text-sm hover:text-brand-steel mb-1">
              <ArrowLeft className="w-4 h-4" /> Back to Catalog
            </Link>
            <h1 className="font-display text-2xl font-bold text-brand-navy">Sinclair&apos;s Weekly Ad</h1>
            <p className="text-gray-500 text-sm">This week&apos;s specials at Sinclair&apos;s Foods — order right here and we&apos;ll deliver to your boat.</p>
          </div>
          {status === 'ok' && (
            <button onClick={printAd}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
              <Printer className="w-4 h-4" /> Print the Ad
            </button>
          )}
        </div>

        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
          </div>
        )}

        {status === 'missing' && (
          <div className="card-base p-12 text-center">
            <FileX className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-brand-navy mb-1">No weekly ad posted yet</p>
            <p className="text-sm text-gray-400">Check back soon — Sinclair&apos;s posts a new ad every week.</p>
            <Link href="/catalog" className="inline-block mt-4 text-brand-river text-sm underline">Browse the catalog instead</Link>
          </div>
        )}

        {status === 'ok' && (
          <div className="card-base overflow-hidden flex-1 min-h-[75vh]">
            <iframe
              id="weekly-ad-frame"
              src="/api/weekly-ad"
              title="Sinclair's Weekly Ad"
              className="w-full h-full min-h-[75vh] border-0"
            />
          </div>
        )}
      </main>
    </div>
  );
}
