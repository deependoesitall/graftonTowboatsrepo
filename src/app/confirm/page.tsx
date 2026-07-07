'use client';
// src/app/confirm/page.tsx
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { clearCart } from '@/lib/cart';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Order } from '@/types';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CheckCircle2, Download, ShoppingCart, Anchor, Star, History } from 'lucide-react';
import { ContactPhones } from '@/components/layout/ContactPhones';
import { useAuth } from '@/lib/auth-context';
import { AuthModal } from '@/components/auth/AuthModal';
import { createClient } from '@/lib/supabase/client';

function ConfirmContent() {
  const { user, loading: authLoading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const prevUserRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const orderNumber = searchParams.get('num');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Claim guest orders when user signs up / signs in on this page
  useEffect(() => {
    if (authLoading) return;
    const wasLoggedOut = prevUserRef.current === null;
    const isNowLoggedIn = !!user;
    prevUserRef.current = user?.id ?? null;

    if (wasLoggedOut && isNowLoggedIn) {
      // Fire-and-forget — link all orders placed with this email to the new account
      createClient().auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        fetch('/api/customer/claim-orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      });
    }
  }, [user, authLoading]);

  function openPdf() {
    if (!orderId) return;
    window.open(`/api/orders/${orderId}/pdf`, '_blank');
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
                {orderNumber || 'Processing...'}
              </p>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-2">
              Your order has been sent to Grafton Towboat Services. We&apos;ll be in touch shortly.
            </p>
            {order && (
              <p className="text-gray-400 text-xs">
                Estimated Total: <span className="font-bold text-brand-navy">{formatCurrency(order.subtotal)}</span>
                {' · '}Placed {formatDate(order.created_at)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 mb-6">
            <button
              onClick={openPdf}
              disabled={!orderId}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Order PDF
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
                        {item.quantity}&times; {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-brand-navy shrink-0">
                      {formatCurrency(item.line_total)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-brand-sand/40 px-4 py-3 flex justify-between">
                <span className="font-bold text-brand-navy">Estimated Total</span>
                <span className="font-display text-lg font-bold text-brand-navy">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
            </div>
          )}

          {/* Logged-in: link to order history */}
          {!authLoading && user && (
            <div className="card-base p-5 mt-6 border-brand-green/20 bg-gradient-to-br from-white to-brand-yellow/10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-brand-green/10 rounded-full flex items-center justify-center shrink-0">
                  <History className="w-5 h-5 text-brand-green" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-brand-green text-sm mb-1">
                    Order saved to your account
                  </p>
                  <p className="text-brand-green/60 text-xs leading-relaxed mb-3">
                    You can view this order, reorder with one click, and track your full order history from your account page.
                  </p>
                  <Link href="/account"
                    className="inline-flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-full hover:bg-brand-gmed transition-colors">
                    <History className="w-3.5 h-3.5" /> View Order History
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Create account prompt -- only for confirmed guests (not loading) */}
          {!authLoading && !user && (
            <div className="card-base p-5 mt-6 border-brand-orange/30 bg-gradient-to-br from-white to-brand-yellow/10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-brand-orange/10 rounded-full flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-brand-orange" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-brand-green text-sm mb-1">
                    Order on the river often?
                  </p>
                  <p className="text-brand-green/60 text-xs leading-relaxed mb-3">
                    Create a free account to save favorites with one tap, see your past orders, and reorder everything in one click next time.
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAuthOpen(true)}
                      className="bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-full hover:bg-brand-ored transition-colors">
                      Create Free Account
                    </button>
                    <span className="text-brand-green/40 text-xs">Takes 10 seconds &middot; totally optional</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact */}
          <ContactPhones className="mt-6" />

          <div className="text-center mt-6">
            <div className="flex items-center justify-center gap-2 text-brand-navy/40">
              <Anchor className="w-4 h-4" />
              <span className="text-xs">Grafton Towboat Services &middot; Mile Marker 219 on the Mississippi River, Mile Marker 0 on the Illinois River</span>
            </div>
          </div>
        </div>
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultMode="signup"
        title="Create Free Account" />
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
