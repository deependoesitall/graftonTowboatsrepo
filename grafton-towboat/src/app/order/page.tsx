'use client';
// src/app/order/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart, Trash2, Plus, Minus, ArrowLeft,
  ChevronRight, Loader2, AlertCircle, Package
} from 'lucide-react';
import { getCart, updateCartItem, removeFromCart, getCartTotal, getCartCount, getVesselInfo, saveVesselInfo } from '@/lib/cart';
import { formatCurrency } from '@/lib/utils';
import { CartItem, VesselInfo } from '@/types';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { useToast } from '@/hooks/use-toast';

export default function OrderPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [vessel, setVessel] = useState<VesselInfo>({
    company_name: '', contact_name: '', phone: '',
    po_number: '', notes: '', eta: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setItems(getCart());
    setVessel(getVesselInfo());
    const handler = () => setItems(getCart());
    window.addEventListener('cart-updated', handler);
    return () => window.removeEventListener('cart-updated', handler);
  }, []);

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
    if (items.length === 0) errs.items = 'Your cart is empty';
    return errs;
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
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vessel, items }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit order');
      }

      const { order_id, order_number } = await res.json();
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
                  onUpdate={(qty) => {
                    updateCartItem(item.product_id, qty);
                  }}
                  onRemove={() => {
                    removeFromCart(item.product_id);
                  }}
                />
              ))}
              <div className="p-4 bg-brand-sand/40">
                <div className="flex justify-between items-center">
                  <span className="font-body font-bold text-brand-navy">Order Total</span>
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
            <FormField
              label="Company / Vessel Name *"
              error={errors.company_name}
            >
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

            <FormField label="Special Instructions (optional)" className="sm:col-span-2">
              <textarea
                className="input-base resize-none"
                rows={3}
                placeholder="Any special requests, dietary notes, or delivery instructions…"
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
          Your order will be sent to Grafton Towboat Services immediately
        </p>
      </main>
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
          <span className="w-8 text-center text-sm font-bold text-brand-navy">
            {item.quantity}
          </span>
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
  children,
  className = '',
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-base">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
