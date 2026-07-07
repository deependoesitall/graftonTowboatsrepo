'use client';
// src/app/weekly-ad/page.tsx
// Sinclair's weekly ad rendered as fast, lazy-loaded page images (mobile
// first — no PDF iframe lag or iPhone zoom issues). The PDF is fetched only
// when the customer taps Print.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft, Loader2, FileX } from 'lucide-react';
import { SiteHeader } from '@/components/layout/SiteHeader';

interface AdPage {
  sequence: number;
  src: string;
  srcLarge: string;
  width: number;
  height: number;
}
interface AdData {
  mode: 'pages' | 'pdf' | 'none';
  name?: string | null;
  description?: string | null;
  disclaimer?: string | null;
  pages?: AdPage[];
}

export default function WeeklyAdPage() {
  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/weekly-ad/pages')
      .then(r => r.json())
      .then((data: AdData) => setAd(data))
      .catch(() => setAd({ mode: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  function printAd() {
    // The PDF proxy is only touched here — never for on-screen viewing
    window.open('/api/weekly-ad', '_blank');
  }

  const hasPages = ad?.mode === 'pages' && (ad.pages?.length ?? 0) > 0;
  const pdfFallback = ad?.mode === 'pdf';

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <Link href="/catalog" className="inline-flex items-center gap-1.5 text-brand-river text-sm hover:text-brand-steel mb-1">
              <ArrowLeft className="w-4 h-4" /> Back to Catalog
            </Link>
            <h1 className="font-display text-2xl font-bold text-brand-navy">Sinclair&apos;s Weekly Ad</h1>
            <p className="text-gray-500 text-sm">
              {ad?.description || "This week's specials at Sinclair's Foods — order right here and we'll deliver to your boat."}
            </p>
          </div>
          {(hasPages || pdfFallback) && (
            <button onClick={printAd}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2 shrink-0">
              <Printer className="w-4 h-4" /> Print the Ad
            </button>
          )}
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
          </div>
        )}

        {!loading && !hasPages && !pdfFallback && (
          <div className="card-base p-12 text-center">
            <FileX className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-brand-navy mb-1">No weekly ad posted yet</p>
            <p className="text-sm text-gray-400">Check back soon — Sinclair&apos;s posts a new ad every week.</p>
            <Link href="/catalog" className="inline-block mt-4 text-brand-river text-sm underline">Browse the catalog instead</Link>
          </div>
        )}

        {/* Fast path: lazy-loaded page images */}
        {!loading && hasPages && (
          <>
            <div className="space-y-3">
              {ad!.pages!.map((p, i) => (
                <div key={p.sequence} className="card-base overflow-hidden">
                  {/* aspect-ratio reserves space so lazy pages don't cause layout jumps */}
                  <img
                    src={p.src}
                    srcSet={`${p.src} 900w, ${p.srcLarge} 1600w`}
                    sizes="(max-width: 768px) 100vw, 768px"
                    alt={`Weekly ad page ${i + 1} of ${ad!.pages!.length}`}
                    width={p.width}
                    height={p.height}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="w-full h-auto block"
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  />
                  <p className="text-center text-[11px] text-gray-300 py-1.5">
                    Page {i + 1} of {ad!.pages!.length}
                  </p>
                </div>
              ))}
            </div>
            {ad!.disclaimer && (
              <p className="text-xs text-gray-400 italic mt-4">{ad!.disclaimer}</p>
            )}
          </>
        )}

        {/* Fallback: manual PDF override is set — embed the proxied PDF */}
        {!loading && pdfFallback && (
          <div className="card-base overflow-hidden flex-1 min-h-[75vh]">
            <iframe
              src="/api/weekly-ad"
              title="Sinclair's Weekly Ad"
              className="w-full h-full min-h-[75vh] border-0"
            />
          </div>
        )}

        {(hasPages || pdfFallback) && (
          <p className="text-center text-xs text-gray-400 mt-4">
            See something you like? <Link href="/catalog" className="text-brand-river underline">Order it from the catalog</Link> and
            we&apos;ll bring it to your boat.
          </p>
        )}
      </main>
    </div>
  );
}
