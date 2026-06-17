'use client';
// src/app/order/page.tsx
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart, Trash2, Plus, Minus, ArrowLeft,
  ChevronRight, Loader2, AlertCircle, Package, HelpCircle, X, LogIn
} from 'lucide-react';
import { getCart, updateCartItem, removeFromCart, getCartTotal, getCartCount, getVesselInfo, saveVesselInfo } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';
import { CartItem, VesselInfo } from '@/types';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AuthModal } from '@/components/auth/AuthModal';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';

const ESTIMATED_TOTAL_EXPLANATION =
  'Some orders may display an estimated total at checkout. This is because certain items are sold by weight, market prices may change, or substitutions may be necessary if an item is unavailable. Your final invoice will reflect the actual items delivered, including any approved substitutions, quantity adjustments, or weighted products. We make every effort to keep pricing accurate and will contact you if there are any significant changes to your order. At Grafton Towboat Services, our goal is to provide the products you need while making the ordering process as simple and convenient as possible. If you have any questions about your order or pricing, please contact us at (618) 556-0290 or GraftonTowboatServices@gmail.com.';

export default function OrderPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [vessel, setVessel] = useState<VesselInfo>({
    company_name: '', contact_name: '', phone: '',
    email: '', po_number: '', notes: '', eta: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [estimatedOpen, setEstimatedOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [emailHasAccount, setEmailHasAccount] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setItems(getCart());
    setVessel(getVesselInfo());
    const handler = () => setItems(getCart());
    window.addEventListener('cart-updated', handler);

    // Auto-fill from saved customer profile when logged in (only fills empty fields)
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsLoggedIn(true);
      const { data: profile } = await supabase.from('customer_profiles').select('*').single();
      if (profile) {
        setVessel(v => ({
          ...v,
          company_name: v.company_name || profile.company_name || '',
          contact_name: v.contact_name || profile.contact_name || '',
          phone: v.phone || profile.phone || '',
          email: v.email || user.email || '',
        }));
      } else {
        // No profile but logged in — pre-fill email from auth
        setVessel(v => ({ ...v, email: v.email || user.email || '' }));
      }
    })();

    return () => window.removeEventListener('cart-updated', handler);
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setEstimatedOpen(false);
      }
    }
    if (estimatedOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [estimatedOpen]);

  function handleVesselChange(field: keyof VesselInfo, value: string) {
    const updated = { ...vessel, [field]: value };
    setVessel(updated);
    saveVesselInfo(updated);
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!vessel.company_name.trim()) errs.company_name = 'Company / Vessel name is required';
    if (!vessel.contact_name.trim()) errs.contact_name = 'Contact person name is required';
    if (!vessel.phone.trim()) errs.phone = 'Phone number is required';
    if (!vessel.email.trim()) errs.email = 'Email address is required for order confirmation';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vessel.email.trim())) errs.email = 'Please enter a valid email address';
    if (items.length === 0) errs.items = 'Your cart is empty';
    return errs;
  }

  async function checkEmailForAccount(email: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || isLoggedIn) {
      setEmailHasAccount(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const { exists } = await res.json();
      setEmailHasAccount(exists);
    } catch {
      setEmailHasAccount(false);
    }
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const el = document.getElementById('error-top');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ vessel, items }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit order');
      }

      const { order_id, order_number, _emailDebug } = await res.json();

      if (_emailDebug) {
        if (_emailDebug.ok) {
          toast({ title: '✅ Email sent', description: `To: ${_emailDebug.to}`, duration: 6000 });
        } else {
          toast({ title: '❌ Email failed', description: _emailDebug.error, variant: 'destructive', duration: 10000 });
        }
      }

      router.push(`/confirm?order=${order_id}&num=${order_number}`);
    } catch (err) {
      toast({
        title: 'Error submitting order',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const total = getCartTotal(items);
  const count = getCartCount(items);

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-20">
        {/* Back */}
        <Link href="/catalog" className="inline-flex items-center gap-1.5 text-brand-river text-sm mb-6 hover:text-brand-steel">
          <ArrowLeft className="w-4 h-4" />
          Continue Shopping
        </Link>

        <h1 className="font-display text-2xl md:text-3xl text-brand-navy font-bold mb-1">
          Review &amp; Submit Order
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {count} item{count !== 1 ? 's' : ''} · {formatCurrency(total)}
        </p>

        {/* Error banner */}
        {Object.keys(errors).length > 0 && (
          <div id="error-top" className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 text-sm">Please fix the following:</p>
              <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                {Object.values(errors).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* Cart Items */}
        <section className="card-base mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-brand-gold" />
              Order Items
            </h2>
            {items.length > 0 && (
              <span className="text-sm text-gray-400">{count} items</span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Your cart is empty</p>
              <Link href="/catalog" className="btn-primary text-sm px-6 py-2">
                Browse Items
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <CartItemRow
                  key={item.product_id}
                  item={item}
                  onUpdate={(qty) => { updateCartItem(item.product_id, qty); }}
                  onRemove={() => { removeFromCart(item.product_id); }}
                />
              ))}
              <div className="p-4 bg-brand-sand/40">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-body font-bold text-brand-navy">Order Total</span>
                    {/* Estimated total disclaimer */}
                    <div className="relative" ref={tooltipRef}>
                      <button
                        type="button"
                        onClick={() => setEstimatedOpen(o => !o)}
                        onMouseEnter={() => setEstimatedOpen(true)}
                        onMouseLeave={() => !estimatedOpen && setEstimatedOpen(false)}
                        className="flex items-center gap-1 text-xs text-brand-river hover:text-brand-navy transition-colors focus:outline-none"
                        aria-label="Why is my total estimated?"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span className="underline underline-offset-2">Why is my total estimated?</span>
                      </button>
                      {estimatedOpen && (
                        <div className="absolute bottom-full left-0 mb-2 z-30 w-80 sm:w-96 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-xs text-gray-600 leading-relaxed">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-bold text-gray-800 text-sm">Why is my total estimated?</p>
                            <button
                              onClick={() => setEstimatedOpen(false)}
                              className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p>{ESTIMATED_TOTAL_EXPLANATION}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-display text-2xl font-bold text-brand-navy">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Vessel Info */}
        <section className="card-base mb-6">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-display text-lg font-bold text-brand-navy">
              Vessel &amp; Contact Information
            </h2>
            <p className="text-gray-400 text-xs mt-1">Your info is saved for next time</p>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Company / Vessel Name *" error={errors.company_name}>
              <input
                type="text"
                className={`input-base ${errors.company_name ? 'border-red-400' : ''}`}
                placeholder="e.g. M/V River Queen"
                value={vessel.company_name}
                onChange={e => handleVesselChange('company_name', e.target.value)}
              />
            </FormField>

            <FormField label="Contact Person Name *" error={errors.contact_name}>
              <input
                type="text"
                className={`input-base ${errors.contact_name ? 'border-red-400' : ''}`}
                placeholder="Your name"
                value={vessel.contact_name}
                onChange={e => handleVesselChange('contact_name', e.target.value)}
              />
            </FormField>

            <FormField label="Phone Number *" error={errors.phone}>
              <input
                type="tel"
                className={`input-base ${errors.phone ? 'border-red-400' : ''}`}
                placeholder="(555) 123-4567"
                value={vessel.phone}
                onChange={e => handleVesselChange('phone', e.target.value)}
              />
            </FormField>

            <FormField label="Email Address *" error={errors.email}>
              <input
                type="email"
                className={`input-base ${errors.email ? 'border-red-400' : ''}`}
                placeholder="captain@example.com"
                value={vessel.email}
                onChange={e => { handleVesselChange('email', e.target.value); setEmailHasAccount(false); }}
                onBlur={e => checkEmailForAccount(e.target.value)}
                autoComplete="email"
              />
              {emailHasAccount && !isLoggedIn && (
                <div className="mt-2 flex items-center justify-between gap-3 bg-brand-sand border border-brand-gold/40 rounded-lg px-3 py-2">
                  <p className="text-xs text-brand-navy leading-snug">
                    <span className="font-semibold">Account found.</span> Sign in to auto-fill your vessel info and track your order.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    className="shrink-0 flex items-center gap-1.5 bg-brand-navy text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-brand-steel transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </button>
                </div>
              )}
            </FormField>

            <FormField label="PO Number (optional)">
              <input
                type="text"
                className="input-base"
                placeholder="Optional PO#"
                value={vessel.po_number}
                onChange={e => handleVesselChange('po_number', e.target.value)}
              />
            </FormField>

            <FormField label="Vessel ETA (optional)">
              <input
                type="text"
                className="input-base"
                placeholder="e.g. Tomorrow 6 AM, June 15"
                value={vessel.eta}
                onChange={e => handleVesselChange('eta', e.target.value)}
              />
            </FormField>

            <FormField
              label="Special Instructions (optional)"
              className="sm:col-span-2"
              hint="For delivery notes or special requests only. Item substitutions are handled separately — do not use this field to request product substitutions."
            >
              <textarea
                className="input-base resize-none"
                rows={3}
                placeholder="Delivery notes, access instructions, special requests…"
                value={vessel.notes}
                onChange={e => handleVesselChange('notes', e.target.value)}
              />
            </FormField>
          </div>
        </section>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || items.length === 0}
          className="w-full btn-gold text-base py-4 flex items-center justify-center gap-2 rounded-lg"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting Order…
            </>
          ) : (
            <>
              Submit Order — {formatCurrency(total)}
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">
          A confirmation will be sent to the email address you provided
        </p>
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          // Re-check login state after modal closes
          createClient().auth.getUser().then(({ data: { user } }) => {
            if (user) {
              setIsLoggedIn(true);
              setEmailHasAccount(false);
              setVessel(v => ({ ...v, email: v.email || user.email || '' }));
            }
          });
        }}
        defaultMode="signin"
        defaultEmail={vessel.email}
        title="Sign In to Your Account"
      />
    </div>
  );
}

function CartItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: CartItem;
  onUpdate: (qty: number) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(String(item.quantity));

  useEffect(() => {
    setDraft(String(item.quantity));
  }, [item.quantity]);

  function commit() {
    const n = parseInt(draft, 10);
    if (!draft || isNaN(n) || n < 1) {
      setDraft(String(item.quantity));
      if (item.quantity < 1) onUpdate(1);
      return;
    }
    const clamped = Math.min(999, n);
    setDraft(String(clamped));
    if (clamped !== item.quantity) onUpdate(clamped);
  }

  return (
    <div className="p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-brand-river font-semibold mb-0.5">{item.category}</p>
        <p className="font-body font-semibold text-brand-navy text-sm leading-snug">
          {item.description}
        </p>
        {item.pkg_size && (
          <p className="text-xs text-gray-400 mt-0.5">
            {item.pkg_size}{item.uom ? ` / ${item.uom}` : ''}
          </p>
        )}
        <p className="text-sm font-bold text-brand-navy mt-1">
          {formatCurrency(item.price)} ea. ·{' '}
          <span className="text-brand-gold">{formatCurrency(item.price * item.quantity)}</span>
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <button
          onClick={onRemove}
          className="text-gray-300 hover:text-red-400 transition-colors p-1"
          aria-label="Remove item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex items-center border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => onUpdate(item.quantity - 1)}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onFocus={(e) => e.target.select()}
            className="w-8 text-center text-sm font-bold text-brand-navy bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-brand-steel rounded"
            aria-label="Quantity"
          />
          <button
            onClick={() => onUpdate(item.quantity + 1)}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-base">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1 leading-snug">{hint}</p>}
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
