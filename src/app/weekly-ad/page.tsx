'use client';
// src/app/weekly-ad/page.tsx
// Sinclair's weekly ad rendered as fast, lazy-loaded page images (mobile
// first). Tap a page → fullscreen lightbox with hi-res srcLarge + pinch/pan.
// The PDF is fetched only when the customer taps Print / Open ad.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft, Loader2, FileX, ZoomIn, ExternalLink } from 'lucide-react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { WeeklyAdLightbox, type WeeklyAdLightboxPage } from '@/components/weekly-ad/WeeklyAdLightbox';

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

const HINT_KEY = 'gts-weekly-ad-zoom-hint-seen';

export default function WeeklyAdPage() {
  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<WeeklyAdLightboxPage | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    fetch('/api/weekly-ad/pages')
      .then(r => r.json())
      .then((data: AdData) => setAd(data))
      .catch(() => setAd({ mode: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_KEY)) setShowHint(true);
    } catch {
      setShowHint(true);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function dismissHint() {
    setShowHint(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
  }

  function openPage(p: AdPage, index: number, total: number) {
    dismissHint();
    setLightbox({
      sequence: p.sequence,
      src: p.src,
      srcLarge: p.srcLarge,
      width: p.width,
      height: p.height,
      label: `Page ${index + 1} of ${total}`,
    });
  }

  function printAd() {
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

        {!loading && (hasPages || pdfFallback) && (
          <div className="bg-brand-sand/50 border border-brand-gold/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-brand-navy leading-relaxed">
              <span className="font-bold">Good to know:</span> these sale prices run <span className="font-bold">Wednesday through Tuesday</span> each week.
              Your final invoice reflects the prices in effect when your order was shopped — so if a new sale week
              starts between ordering and shopping, some prices may change.
            </p>
          </div>
        )}

        {/* First-visit hint — tap to zoom */}
        {!loading && hasPages && showHint && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-brand-river/10 border border-brand-river/25 px-3 py-2.5">
            <ZoomIn className="w-4 h-4 text-brand-river shrink-0 mt-0.5" />
            <p className="text-sm text-brand-navy flex-1">
              <span className="font-bold">Tap a page to zoom.</span> Pinch or double-tap to read the fine print.
            </p>
            <button
              type="button"
              onClick={dismissHint}
              className="text-xs text-brand-river font-semibold shrink-0 px-2 py-1"
              aria-label="Dismiss hint"
            >
              Got it
            </button>
          </div>
        )}

        {/* Fast path: lazy-loaded page images — tap opens lightbox */}
        {!loading && hasPages && (
          <>
            <div className="space-y-3">
              {ad!.pages!.map((p, i) => (
                <button
                  key={p.sequence}
                  type="button"
                  onClick={() => openPage(p, i, ad!.pages!.length)}
                  className="card-base overflow-hidden w-full text-left block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-river"
                  aria-label={`Zoom page ${i + 1} of ${ad!.pages!.length}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    srcSet={`${p.src} 900w, ${p.srcLarge} 1600w`}
                    sizes="(max-width: 768px) 100vw, 768px"
                    alt={`Weekly ad page ${i + 1} of ${ad!.pages!.length}`}
                    width={p.width}
                    height={p.height}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="w-full h-auto block pointer-events-none"
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  />
                  <p className="text-center text-[11px] text-gray-300 py-1.5 flex items-center justify-center gap-1">
                    <ZoomIn className="w-3 h-3" />
                    Page {i + 1} of {ad!.pages!.length} — tap to zoom
                  </p>
                </button>
              ))}
            </div>
            {ad!.disclaimer && (
              <p className="text-xs text-gray-400 italic mt-4">{ad!.disclaimer}</p>
            )}
          </>
        )}

        {/* PDF-only override: on mobile Safari iframes often won't pinch-zoom.
            Prefer a big Open ad button; keep iframe on wider screens. */}
        {!loading && pdfFallback && (
          <div className="card-base overflow-hidden flex-1 min-h-[50vh] flex flex-col">
            {isNarrow ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-brand-navy font-bold text-lg">This week&apos;s ad is a PDF</p>
                <p className="text-sm text-gray-500 max-w-sm">
                  Mobile browsers can&apos;t zoom inside an embedded PDF. Open it in Safari&apos;s PDF viewer to pinch-zoom deals.
                </p>
                <a
                  href="/api/weekly-ad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-base px-6 py-3.5 flex items-center gap-2 min-h-[48px]"
                >
                  <ExternalLink className="w-5 h-5" />
                  Open ad
                </a>
                <button
                  type="button"
                  onClick={printAd}
                  className="text-sm text-brand-river underline flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Print / save PDF
                </button>
              </div>
            ) : (
              <iframe
                src="/api/weekly-ad"
                title="Sinclair's Weekly Ad"
                className="w-full h-full min-h-[75vh] border-0"
              />
            )}
          </div>
        )}

        {(hasPages || pdfFallback) && (
          <p className="text-center text-xs text-gray-400 mt-4">
            See something you like? <Link href="/catalog" className="text-brand-river underline">Order it from the catalog</Link> and
            we&apos;ll bring it to your boat.
          </p>
        )}
      </main>

      {lightbox && (
        <WeeklyAdLightbox page={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
