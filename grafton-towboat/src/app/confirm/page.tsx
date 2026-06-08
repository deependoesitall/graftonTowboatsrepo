'use client';
// src/app/confirm/page.tsx
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Download, ShoppingCart, Phone, Anchor, Loader2 } from 'lucide-react';
import { clearCart } from '@/lib/cart';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Order } from '@/types';
import { SiteHeader } from '@/components/layout/SiteHeader';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const orderNumber = searchParams.get('num');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    clearCart();
    if (orderId) {
      fetch(`/api/orders/${orderId}`)
        .then(r => r.json())
        .then(data => setOrder(data))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orderId]);

  async function downloadPdf() {
    if (!orderId) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/pdf`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${orderNumber || 'order'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Success card */}
          <div className="card-base p-8 text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-500" />
            </div>
            <h1 className="font-display text-2xl text-brand-navy font-bold mb-2">
              Order Submitted!
            </h1>
            <div className="inline-block bg-brand-sand px-4 py-2 rounded-lg mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Order Number</p>
              <p className="font-mono font-bold text-brand-navy text-xl">
                {orderNumber || 'Processing…'}
              </p>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              Your order has been sent to Grafton Towboat Services. We&apos;ll be in touch shortly.
            </p>
            {order && (
              <p className="text-gray-400 text-xs">
                Total: <span className="font-bold text-brand-navy">{formatCurrency(order.subtotal)}</span>
                {' · '}Placed {formatDate(order.created_at)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 mb-6">
            <button
              onClick={downloadPdf}
              disabled={downloadingPdf || !orderId}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {downloadingPdf ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
              ) : (
                <><Download className="w-4 h-4" /> Download Order PDF</>
              )}
            </button>
            <Link
              href="/catalog"
              className="btn-outline w-full py-3 flex items-center justify-center gap-2 text-center"
            >
              <ShoppingCart className="w-4 h-4" />
              Place Another Order
            </Link>
          </div>

          {/* Order summary */}
          {loading && (
            <div className="card-base p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river mx-auto" />
            </div>
          )}
          {!loading && order && (
            <div className="card-base overflow-hidden">
              <div className="bg-brand-navy px-4 py-3">
                <h2 className="text-white font-display font-bold text-sm">Order Summary</h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {order.items.map(item => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-navy truncate">
                        {item.description}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.quantity}× {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-brand-navy shrink-0">
                      {formatCurrency(item.line_total)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-brand-sand/40 px-4 py-3 flex justify-between">
                <span className="font-bold text-brand-navy">Total</span>
                <span className="font-display text-lg font-bold text-brand-navy">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
            </div>
          )}

          {/* Contact */}
          <div className="mt-6 p-4 bg-brand-steel/10 rounded-lg border border-brand-steel/20 flex items-start gap-3">
            <Phone className="w-5 h-5 text-brand-steel shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-brand-navy text-sm">Questions?</p>
              <p className="text-gray-500 text-sm">
                Call us at{' '}
                <a href="tel:6185560290" className="text-brand-river font-semibold">
                  (618) 556-0290
                </a>
                {' '}or monitor Channel 68 at Grafton Harbor.
              </p>
            </div>
          </div>

          <div className="text-center mt-6">
            <div className="flex items-center justify-center gap-2 text-brand-navy/40">
              <Anchor className="w-4 h-4" />
              <span className="text-xs">Grafton Towboat Services · Mile Marker 218</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  );
}
