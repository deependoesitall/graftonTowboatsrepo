'use client';
// src/app/order/page.tsx — Phase 2b: 3-step checkout

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart, Trash2, Plus, Minus, ArrowLeft, ChevronRight,
  Loader2, AlertCircle, Package, HelpCircle, X, LogIn,
  Ship, MapPin, Users, Wrench, Check, ClipboardList,
} from 'lucide-react';
import {
  getCart, updateCartItem, removeFromCart, clearCart, getCartTotal, getCartCount,
  getVesselInfo, saveVesselInfo, getAdditionalServices, clearAdditionalServices,
  updateCartItemFields, getVesselSubtotal, getCodSubtotal,
} from '@/lib/cart';
import { formatCurrency, formatLb, formatQty, WEIGHT_PRESETS } from '@/lib/utils';
import { CartItem, VesselInfo, AdditionalServices, VESSEL_TYPES } from '@/types';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ContactPhones } from '@/components/layout/ContactPhones';
import { AuthModal } from '@/components/auth/AuthModal';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

const ESTIMATED_EXPLANATION =
  'Some orders may display an estimated total at checkout. This is because certain items are sold by weight, market prices may change, or substitutions may be necessary if an item is unavailable. Your final invoice will reflect the actual items delivered, including any approved substitutions, quantity adjustments, or weighted products. We make every effort to keep pricing accurate and will contact you if there are any significant changes to your order. If you have any questions, please contact us at (618) 556-0290 or GraftonTowboatServices@gmail.com.';

// ─── Step indicator ────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Review Items', 'Vessel & Delivery', 'Confirm & Submit'];
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3;
        const done = num < step;
        const active = num === step;
        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                done ? 'bg-brand-green text-white' : active ? 'bg-brand-navy text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                {done ? <Check className="w-4 h-4" /> : num}
              </div>
              <span className={`text-xs mt-1 font-medium whitespace-nowrap ${
                active ? 'text-brand-navy' : done ? 'text-brand-green' : 'text-gray-400'
              }`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${done ? 'bg-brand-green' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared form helpers ───────────────────────────────────────
function Field({
  label, required, error, hint, children, col2,
}: {
  label: string; required?: boolean; error?: string;
  hint?: string; children: React.ReactNode; col2?: boolean;
}) {
  return (
    <div className={col2 ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-bold text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-gray-100 mb-4">
      <div className="w-8 h-8 bg-brand-navy/10 rounded-lg flex items-center justify-center text-brand-navy shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-display font-bold text-brand-navy text-sm">{title}</h3>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-brand-navy">{value}</span>
    </div>
  );
}

// ─── Cart item row (step 1) ────────────────────────────────────
function CartItemRow({ item, onUpdate, onRemove, onPatch, codNameError }: {
  item: CartItem; onUpdate: (qty: number) => void; onRemove: () => void;
  onPatch: (patch: Partial<CartItem>) => void; codNameError?: boolean;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  useEffect(() => { setDraft(String(item.quantity)); }, [item.quantity]);

  function commit() {
    const n = parseInt(draft, 10);
    if (!draft || isNaN(n) || n < 1) { setDraft(String(item.quantity)); return; }
    const clamped = Math.min(999, n);
    setDraft(String(clamped));
    if (clamped !== item.quantity) onUpdate(clamped);
  }

  const isCod = item.paid_by === 'cod';

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        {item.image_url && (
          <div className="w-14 h-14 shrink-0 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt={item.description} loading="lazy" decoding="async"
              className="w-full h-full object-contain p-1" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-brand-river font-semibold mb-0.5">{item.category}</p>
          <p className="font-body font-semibold text-brand-navy text-sm leading-snug">{item.description}</p>
          {item.pkg_size && <p className="text-xs text-gray-400 mt-0.5">{item.pkg_size}{item.uom ? ` / ${item.uom}` : ''}</p>}
          {item.billed_by_weight ? (
            <p className="text-sm font-bold text-brand-navy mt-1">
              {formatCurrency(item.price)} /lb &nbsp;&middot;&nbsp;
              <span className="text-brand-gold">{formatLb(item.quantity)} · ~{formatCurrency(item.price * item.quantity)} est.</span>
              <span className="block text-[10px] font-normal text-amber-700">Sold by weight — billed at actual weight</span>
            </p>
          ) : (
            <p className="text-sm font-bold text-brand-navy mt-1">
              {formatCurrency(item.price)} ea. &nbsp;&middot;&nbsp;
              <span className="text-brand-gold">{formatCurrency(item.price * item.quantity)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={onRemove} className="text-gray-300 hover:text-red-400 transition-colors p-1">
            <Trash2 className="w-4 h-4" />
          </button>
          {item.billed_by_weight ? (
            /* By-the-pound items pick from the same preset amounts Sinclair's offers */
            <select
              value={String(item.quantity)}
              onChange={e => onUpdate(parseFloat(e.target.value))}
              className="border border-gray-200 rounded-lg text-sm font-bold text-brand-navy py-1.5 px-2 bg-white"
              aria-label="Pounds"
            >
              {Array.from(new Set([...WEIGHT_PRESETS, item.quantity])).sort((a, b) => a - b).map(w => (
                <option key={w} value={String(w)}>{formatLb(w)}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center border border-gray-200 rounded overflow-hidden">
              <button onClick={() => onUpdate(item.quantity - 1)}
                className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100">
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" value={draft}
                onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onFocus={e => e.target.select()}
                className="w-8 text-center text-sm font-bold text-brand-navy bg-transparent border-0 focus:outline-none"
              />
              <button onClick={() => onUpdate(item.quantity + 1)}
                className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Paid By — vessel account (invoiced monthly) vs COD (crew member pays at delivery) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Paid by</span>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button type="button"
            onClick={() => onPatch({ paid_by: 'vessel', cod_name: '' })}
            className={`px-3 py-1 text-xs font-bold transition-colors ${
              !isCod ? 'bg-brand-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            Vessel Account
          </button>
          <button type="button"
            onClick={() => onPatch({ paid_by: 'cod' })}
            className={`px-3 py-1 text-xs font-bold transition-colors border-l border-gray-200 ${
              isCod ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            COD
          </button>
        </div>
        {isCod && (
          <input
            type="text"
            value={item.cod_name || ''}
            onChange={e => onPatch({ cod_name: e.target.value })}
            placeholder="Crew member's name *"
            className={`input-base text-xs py-1 px-2 flex-1 min-w-[140px] max-w-[220px] ${
              codNameError ? 'border-red-400' : 'border-purple-300'
            }`}
          />
        )}
      </div>
      {isCod && codNameError && (
        <p className="text-[11px] text-red-500 mt-1">Whose COD is this? Add the crew member&apos;s name.</p>
      )}
    </div>
  );
}

// ─── Main page component ───────────────────────────────────────
export default function OrderPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<CartItem[]>([]);
  const [services, setServices] = useState<AdditionalServices>({
    parts_pickup:     { enabled: false, pickup_location: '', order_number: '', contact_name: '', contact_phone: '' },
    package_delivery: { enabled: false, description: '', origin: '', contact_name: '', contact_phone: '' },
    other_pickup:     { enabled: false, items: [{ url: '', notes: '' }] },
  });
  const [vessel, setVessel] = useState<VesselInfo>(getVesselInfo());
  const [showOrderContact, setShowOrderContact] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [emailHasAccount, setEmailHasAccount] = useState(false);
  const [cutoffs, setCutoffs] = useState({ grocery_cutoff_hours: 4, service_cutoff_hours: 2 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const isLoggedIn = !!authUser;

  useEffect(() => {
    setServices(getAdditionalServices());
    setItems(getCart());
    const v = getVesselInfo();
    setVessel(v);
    if (v.order_contact_name || v.order_contact_phone) setShowOrderContact(true);
    if (v.secondary_terminal_name) setShowSecondary(true);

    const sync = () => setItems(getCart());
    window.addEventListener('cart-updated', sync);

    // Order cutoff buffers (manager-configured)
    fetch('/api/order-config')
      .then(r => r.ok ? r.json() : null)
      .then(cfg => { if (cfg) setCutoffs(cfg); })
      .catch(() => {});

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('customer_profiles').select('*').single();
      setVessel(prev => ({
        ...prev,
        company_name: prev.company_name || (profile?.company_name ?? ''),
        contact_name: prev.contact_name || (profile?.contact_name ?? ''),
        phone:        prev.phone        || (profile?.phone        ?? ''),
        email:        prev.email        || user.email             || '',
      }));
    })();

    return () => window.removeEventListener('cart-updated', sync);
  }, []);

  useEffect(() => {
    if (!tooltipOpen) return;
    function outside(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setTooltipOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [tooltipOpen]);

  function setV(field: keyof VesselInfo, value: string | boolean) {
    setVessel(prev => {
      const next = { ...prev, [field]: value };
      saveVesselInfo(next);
      return next;
    });
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  }

  function clearOptionalContact() {
    (['order_contact_name', 'order_contact_title', 'order_contact_phone', 'order_contact_email'] as const)
      .forEach(f => setV(f, ''));
    setShowOrderContact(false);
  }

  function clearSecondary() {
    (['secondary_terminal_name', 'secondary_arrival_date', 'secondary_arrival_time', 'secondary_delivery_method'] as const)
      .forEach(f => setV(f, ''));
    setShowSecondary(false);
  }

  // ── Validation ──
  function validateStep1() {
    const errs: Record<string, string> = {};
    const hasItems = items.length > 0;
    const hasSvc = services.parts_pickup.enabled || services.package_delivery.enabled || services.other_pickup?.enabled;
    if (!hasItems && !hasSvc) errs.items = 'Please add groceries or at least one additional service before continuing.';

    const codItems = items.filter(i => i.paid_by === 'cod');
    if (codItems.length > 0) {
      // COD-only orders are blocked — CODs ride along with a real delivery.
      const codOnly = codItems.length === items.length && !hasSvc && vessel.crew_change === 'no';
      if (codOnly) {
        errs.items = 'COD items are delivered free alongside a regular order. Add vessel-account groceries, an additional service, or a crew change to continue.';
      }
      if (codItems.some(i => !(i.cod_name || '').trim())) {
        errs.cod_name = 'Add the crew member’s name to each COD item.';
      }
      if (!vessel.cod_payment_method) {
        errs.cod_payment_method = 'Choose how the COD items will be paid (cash, Venmo, or credit card).';
      }
      if (vessel.cod_payment_method === 'credit_card' && !vessel.cod_preferred_phone.trim()) {
        errs.cod_preferred_phone = 'Add the best phone number to call for card payment.';
      }
    }
    return errs;
  }

  // Parse structured ETA (date + time pickers). Null when incomplete/legacy.
  function parseEta(date: string, time: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const t = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '23:59';
    const d = new Date(`${date}T${t}:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  function validateStep2() {
    const errs: Record<string, string> = {};
    if (!vessel.company_name.trim())   errs.company_name    = 'Company name is required';
    if (!vessel.contact_name.trim())   errs.contact_name    = 'Billing contact name is required';
    if (!vessel.phone.trim())          errs.phone           = 'Billing phone is required';
    if (!vessel.email.trim())          errs.email           = 'Billing email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vessel.email.trim())) errs.email = 'Please enter a valid email address';
    if (!vessel.vessel_name.trim())    errs.vessel_name     = 'Vessel name is required';
    if (!vessel.vessel_type)           errs.vessel_type     = 'Vessel type is required';
    if (vessel.vessel_type === 'Other' && !vessel.vessel_type_other.trim()) errs.vessel_type_other = 'Please specify vessel type';
    if (!vessel.captain_name.trim())   errs.captain_name    = 'Captain name is required';
    if (!vessel.captain_phone.trim())  errs.captain_phone   = 'Captain cell phone is required';
    if (!vessel.terminal_name.trim())  errs.terminal_name   = 'Terminal / location name is required';
    if (!vessel.arrival_date.trim())   errs.arrival_date    = 'Estimated arrival date is required';
    if (!vessel.arrival_time.trim())   errs.arrival_time    = 'Estimated arrival time is required';
    // Cutoff timer: block ETAs inside the manager-configured buffer
    const eta = parseEta(vessel.arrival_date, vessel.arrival_time);
    if (eta) {
      const bufferHours = items.length > 0 ? cutoffs.grocery_cutoff_hours : cutoffs.service_cutoff_hours;
      if (bufferHours > 0) {
        if (eta.getTime() < Date.now()) {
          errs.arrival_date = 'Arrival time is in the past — please pick a future date and time';
        } else if ((eta.getTime() - Date.now()) / 3_600_000 < bufferHours) {
          errs.arrival_date = `Orders need at least ${bufferHours} hour${bufferHours === 1 ? '' : 's'} before your arrival so we can shop and deliver. Pick a later ETA, or call us at (618) 556-0290 for rush requests.`;
        }
      }
    }
    if (!vessel.delivery_method)       errs.delivery_method = 'Delivery method is required';
    if (vessel.delivery_method === 'boat' && !vessel.approach_side) errs.approach_side = 'Please select an approach side';
    if (vessel.crew_change === 'yes') {
      if (!vessel.crew_arriving.trim())  errs.crew_arriving  = 'Number arriving is required';
      if (!vessel.crew_departing.trim()) errs.crew_departing = 'Number departing is required';
    }
    return errs;
  }

  function goStep2() {
    const errs = validateStep1();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goStep3() {
    const errs = validateStep2();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTimeout(() => document.getElementById('errbanner')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setErrors({});
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function checkEmailAccount(email: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || isLoggedIn) {
      setEmailHasAccount(false); return;
    }
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const { exists } = await res.json();
      setEmailHasAccount(!!exists);
    } catch { setEmailHasAccount(false); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/orders', {
        method: 'POST', headers,
        body: JSON.stringify({ vessel, items, services }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to submit'); }
      const { order_id, order_number, _emailDebug } = await res.json();
      if (_emailDebug) {
        toast(_emailDebug.ok
          ? { title: 'Email sent', description: `To: ${_emailDebug.to}`, duration: 6000 }
          : { title: 'Email failed', description: _emailDebug.error, variant: 'destructive', duration: 10000 });
      }
      clearAdditionalServices();
      router.push(`/confirm?order=${order_id}&num=${order_number}`);
    } catch (err) {
      toast({ title: 'Error submitting order', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const groceryTotal   = getCartTotal(items);
  const groceryCount   = getCartCount(items);
  const vesselSubtotal = getVesselSubtotal(items);
  const codSubtotal    = getCodSubtotal(items);
  const codItems       = items.filter(i => i.paid_by === 'cod');
  const hasCod         = codItems.length > 0;
  const activeSvcs = [
    services.parts_pickup.enabled      && 'parts_pickup',
    services.package_delivery.enabled  && 'package_delivery',
    services.other_pickup?.enabled     && 'other_pickup',
  ].filter(Boolean) as string[];

  // ════════════════════════════════════════════════════════════
  // STEP 1 — Review Items
  // ════════════════════════════════════════════════════════════
  if (step === 1) return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-20">
        <Link href="/catalog" className="inline-flex items-center gap-1.5 text-brand-river text-sm mb-6 hover:text-brand-steel">
          <ArrowLeft className="w-4 h-4" /> Continue Shopping
        </Link>
        <StepIndicator step={1} />

        {errors.items && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{errors.items}</p>
          </div>
        )}

        {/* Groceries */}
        <section className="card-base mb-4">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-brand-gold" /> Sinclair&apos;s Groceries
            </h2>
            {items.length > 0 && (
              <span className="flex items-center gap-3">
                <span className="text-sm text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Clear your whole cart? This removes all ${items.length} item${items.length !== 1 ? 's' : ''}.`)) {
                      clearCart();
                      setItems(getCart());
                    }
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Cart
                </button>
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm mb-3">No groceries added yet</p>
              <Link href="/catalog?tab=groceries" className="text-brand-river text-sm hover:underline">
                Browse Sinclair&apos;s catalog &rarr;
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <CartItemRow
                  key={item.product_id}
                  item={item}
                  onUpdate={qty => { updateCartItem(item.product_id, qty); setItems(getCart()); }}
                  onRemove={() => { removeFromCart(item.product_id); setItems(getCart()); }}
                  onPatch={patch => {
                    updateCartItemFields(item.product_id, patch);
                    setItems(getCart());
                    if (errors.cod_name || errors.cod_payment_method || errors.items) {
                      setErrors(e => { const n = { ...e }; delete n.cod_name; return n; });
                    }
                  }}
                  codNameError={!!errors.cod_name && item.paid_by === 'cod' && !(item.cod_name || '').trim()}
                />
              ))}
              <div className="p-4 bg-brand-sand/40 space-y-1.5">
                {hasCod && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 font-semibold">Vessel Account subtotal</span>
                      <span className="font-bold text-brand-navy">{formatCurrency(vesselSubtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-purple-700 font-semibold">COD subtotal <span className="font-normal text-purple-500">— due on delivery</span></span>
                      <span className="font-bold text-purple-700">{formatCurrency(codSubtotal)}</span>
                    </div>
                    <div className="border-t border-brand-gold/30 pt-1.5" />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-body font-bold text-brand-navy">Estimated Total</span>
                    <div className="relative" ref={tooltipRef}>
                      <button type="button" onClick={() => setTooltipOpen(o => !o)}
                        className="flex items-center gap-1 text-xs text-brand-river hover:text-brand-navy focus:outline-none">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span className="underline underline-offset-2">Why estimated?</span>
                      </button>
                      {tooltipOpen && (
                        <div className="absolute bottom-full left-0 mb-2 z-30 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4">
                          <div className="flex justify-between gap-2 mb-2">
                            <p className="font-bold text-gray-800 text-sm">Why is my total estimated?</p>
                            <button onClick={() => setTooltipOpen(false)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">{ESTIMATED_EXPLANATION}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-display text-2xl font-bold text-brand-navy">{formatCurrency(groceryTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* COD payment method — shown only when the cart has COD lines */}
        {hasCod && (
          <section className="card-base mb-4 p-5 border-2 border-purple-200">
            <SectionHead icon={<ClipboardList className="w-4 h-4" />} title="COD Payment — due on delivery"
              sub={`${codItems.length} item${codItems.length !== 1 ? 's' : ''} · ${formatCurrency(codSubtotal)} — paid by the crew member, separate from the company invoice`} />
            {errors.cod_payment_method && <p className="text-xs text-red-500 mb-2">{errors.cod_payment_method}</p>}
            <div className="flex gap-3 mb-3">
              {([['cash', '💵 Cash'], ['venmo', 'Venmo'], ['credit_card', '💳 Credit Card']] as const).map(([val, lbl]) => (
                <button key={val} type="button"
                  onClick={() => { setV('cod_payment_method', val); }}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    vessel.cod_payment_method === val
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>{lbl}</button>
              ))}
            </div>
            {vessel.cod_payment_method === 'credit_card' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
                <p className="text-xs text-purple-900">
                  <strong>We&apos;ll call you to collect payment.</strong> Card numbers are never entered on this
                  site — Sinclair&apos;s (or our team) will call the number below to take payment over the phone.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Best Phone Number to Call" required error={errors.cod_preferred_phone}>
                    <input type="tel" className={`input-base w-full ${errors.cod_preferred_phone ? 'border-red-400' : ''}`}
                      placeholder="(555) 123-4567"
                      value={vessel.cod_preferred_phone}
                      onChange={e => setV('cod_preferred_phone', e.target.value)} />
                  </Field>
                  <Field label="Best Time to Call" hint="Crews run 12 on / 12 off — when are you awake?">
                    <input type="text" className="input-base w-full"
                      placeholder="e.g. 6 AM – 6 PM"
                      value={vessel.cod_contact_time}
                      onChange={e => setV('cod_contact_time', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Additional Services */}
        {activeSvcs.length > 0 && (
          <section className="card-base mb-6">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-orange" /> Additional Services
              </h2>
            </div>
            <div className="p-4 space-y-2">
              {services.parts_pickup.enabled && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Wrench className="w-4 h-4 text-brand-navy mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-brand-navy">Parts Pickup</p>
                    <p className="text-gray-500 text-xs">
                      {services.parts_pickup.pickup_location}
                      {services.parts_pickup.order_number ? ` · #${services.parts_pickup.order_number}` : ''}
                    </p>
                  </div>
                  <Link href="/catalog?tab=services" className="text-xs text-brand-river hover:underline shrink-0">Edit</Link>
                </div>
              )}
              {services.package_delivery.enabled && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Package className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-brand-navy">Package Delivery</p>
                    <p className="text-gray-500 text-xs">{services.package_delivery.description} &middot; from {services.package_delivery.origin}</p>
                  </div>
                  <Link href="/catalog?tab=services" className="text-xs text-brand-river hover:underline shrink-0">Edit</Link>
                </div>
              )}
              {services.other_pickup?.enabled && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <ShoppingCart className="w-4 h-4 text-brand-green mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-brand-navy">
                      Other Third-Party Item{(services.other_pickup.items?.length ?? 0) > 1 ? `s (${services.other_pickup.items.length})` : ''}{' '}
                      <span className="text-[10px] font-normal text-gray-400">(handled by Sinclair&apos;s)</span>
                    </p>
                    {(services.other_pickup.items || []).map((entry, i) => (
                      (entry.url || entry.notes) ? (
                        <div key={i} className={i > 0 ? 'mt-1 pt-1 border-t border-gray-100' : ''}>
                          {entry.url && <p className="text-gray-500 text-xs break-all">{entry.url}</p>}
                          {entry.notes && <p className="text-gray-500 text-xs">{entry.notes}</p>}
                        </div>
                      ) : null
                    ))}
                  </div>
                  <Link href="/catalog?tab=groceries" className="text-xs text-brand-river hover:underline shrink-0">Edit</Link>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Per-line COD hint (replaces the old free-text Personal / COD box) */}
        {items.length > 0 && !hasCod && (
          <p className="text-center text-xs text-gray-400 mb-6">
            Crew member paying for something personally? Set that item&apos;s{' '}
            <span className="font-bold text-purple-600">Paid by</span> to <span className="font-bold text-purple-600">COD</span> above —
            it&apos;s kept separate from the company invoice.
          </p>
        )}

        {activeSvcs.length === 0 && items.length > 0 && (
          <p className="text-center text-xs text-gray-400 mb-6">
            Need parts pickup or a package delivered?{' '}
            <Link href="/catalog?tab=services" className="text-brand-river hover:underline">Add additional services &rarr;</Link>
          </p>
        )}

        <button onClick={goStep2}
          className="w-full btn-gold text-base py-4 flex items-center justify-center gap-2 rounded-lg">
          Next: Vessel &amp; Delivery Info <ChevronRight className="w-5 h-5" />
        </button>
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultMode="signin" defaultEmail={vessel.email} title="Sign In" />
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // STEP 2 — Vessel & Delivery Info
  // ════════════════════════════════════════════════════════════
  if (step === 2) return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-20">
        <button onClick={() => setStep(1)}
          className="inline-flex items-center gap-1.5 text-brand-river text-sm mb-6 hover:text-brand-steel">
          <ArrowLeft className="w-4 h-4" /> Back to Items
        </button>
        <StepIndicator step={2} />

        {Object.keys(errors).length > 0 && (
          <div id="errbanner" className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 text-sm mb-1">Please fix the following:</p>
              <ul className="text-sm text-red-600 list-disc list-inside space-y-0.5">
                {Object.values(errors).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* ── Company Information ── */}
        <section className="card-base mb-4 p-5">
          <SectionHead icon={<ClipboardList className="w-4 h-4" />} title="Company Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company Name" required error={errors.company_name}>
              <input type="text" className={`input-base w-full ${errors.company_name ? 'border-red-400' : ''}`}
                placeholder="e.g. River Queen LLC" value={vessel.company_name}
                onChange={e => setV('company_name', e.target.value)} />
            </Field>
            <Field label="PO Number">
              <input type="text" className="input-base w-full" placeholder="Optional"
                value={vessel.po_number} onChange={e => setV('po_number', e.target.value)} />
            </Field>
            <Field label="Billing Contact Name" required error={errors.contact_name}>
              <input type="text" className={`input-base w-full ${errors.contact_name ? 'border-red-400' : ''}`}
                placeholder="Full name" value={vessel.contact_name}
                onChange={e => setV('contact_name', e.target.value)} />
            </Field>
            <Field label="Billing Phone" required error={errors.phone}>
              <input type="tel" className={`input-base w-full ${errors.phone ? 'border-red-400' : ''}`}
                placeholder="(555) 123-4567" value={vessel.phone}
                onChange={e => setV('phone', e.target.value)} />
            </Field>
            <Field label="Billing Email" required error={errors.email} col2>
              <input type="email" className={`input-base w-full ${errors.email ? 'border-red-400' : ''}`}
                placeholder="billing@example.com" value={vessel.email}
                onChange={e => { setV('email', e.target.value); setEmailHasAccount(false); }}
                onBlur={e => checkEmailAccount(e.target.value)} autoComplete="email" />
              {emailHasAccount && !isLoggedIn && (
                <div className="mt-2 flex items-center justify-between gap-3 bg-brand-sand border border-brand-gold/40 rounded-lg px-3 py-2">
                  <p className="text-xs text-brand-navy">
                    <span className="font-semibold">Account found.</span> Sign in to auto-fill vessel info.
                  </p>
                  <button type="button" onClick={() => setAuthOpen(true)}
                    className="shrink-0 flex items-center gap-1.5 bg-brand-navy text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-brand-steel transition-colors">
                    <LogIn className="w-3.5 h-3.5" /> Sign In
                  </button>
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* ── Vessel Information ── */}
        <section className="card-base mb-4 p-5">
          <SectionHead icon={<Ship className="w-4 h-4" />} title="Vessel Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Vessel Name" required error={errors.vessel_name}>
              <input type="text" className={`input-base w-full ${errors.vessel_name ? 'border-red-400' : ''}`}
                placeholder="e.g. M/V River Queen" value={vessel.vessel_name}
                onChange={e => setV('vessel_name', e.target.value)} />
            </Field>
            <Field label="Vessel Type" required error={errors.vessel_type}>
              <select className={`input-base w-full ${errors.vessel_type ? 'border-red-400' : ''}`}
                value={vessel.vessel_type} onChange={e => setV('vessel_type', e.target.value)}>
                <option value="">Select type…</option>
                {VESSEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            {vessel.vessel_type === 'Other' && (
              <Field label="Specify Vessel Type" required error={errors.vessel_type_other} col2>
                <input type="text" className={`input-base w-full ${errors.vessel_type_other ? 'border-red-400' : ''}`}
                  placeholder="Describe the vessel type" value={vessel.vessel_type_other}
                  onChange={e => setV('vessel_type_other', e.target.value)} />
              </Field>
            )}
            <Field label="Captain Name" required error={errors.captain_name}>
              <input type="text" className={`input-base w-full ${errors.captain_name ? 'border-red-400' : ''}`}
                placeholder="Captain's full name" value={vessel.captain_name}
                onChange={e => setV('captain_name', e.target.value)} />
            </Field>
            <Field label="Captain Cell Phone" required error={errors.captain_phone}>
              <input type="tel" className={`input-base w-full ${errors.captain_phone ? 'border-red-400' : ''}`}
                placeholder="(555) 123-4567" value={vessel.captain_phone}
                onChange={e => setV('captain_phone', e.target.value)} />
            </Field>
            <Field label="Vessel Email Address">
              <input type="email" className="input-base w-full" placeholder="Optional"
                value={vessel.vessel_email} onChange={e => setV('vessel_email', e.target.value)} />
            </Field>
          </div>

          {/* Optional order contact */}
          {!showOrderContact ? (
            <button type="button" onClick={() => setShowOrderContact(true)}
              className="mt-4 text-xs text-brand-river hover:text-brand-steel flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add order contact (cook, crew member, etc.)
            </button>
          ) : (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Order Contact <span className="font-normal text-gray-400">(optional)</span></p>
                <button type="button" onClick={clearOptionalContact} className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name">
                  <input type="text" className="input-base w-full" placeholder="e.g. John Smith"
                    value={vessel.order_contact_name} onChange={e => setV('order_contact_name', e.target.value)} />
                </Field>
                <Field label="Position / Title">
                  <input type="text" className="input-base w-full" placeholder="e.g. Cook"
                    value={vessel.order_contact_title} onChange={e => setV('order_contact_title', e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input type="tel" className="input-base w-full" placeholder="(555) 123-4567"
                    value={vessel.order_contact_phone} onChange={e => setV('order_contact_phone', e.target.value)} />
                </Field>
                <Field label="Email">
                  <input type="email" className="input-base w-full" placeholder="Optional"
                    value={vessel.order_contact_email} onChange={e => setV('order_contact_email', e.target.value)} />
                </Field>
              </div>
            </div>
          )}
        </section>

        {/* ── Delivery Information ── */}
        <section className="card-base mb-4 p-5">
          <SectionHead icon={<MapPin className="w-4 h-4" />} title="Delivery Information" sub="Primary delivery location" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Location / Terminal Name" required error={errors.terminal_name} col2>
              <input type="text" className={`input-base w-full ${errors.terminal_name ? 'border-red-400' : ''}`}
                placeholder="e.g. Mel Price Locks, Alton IL" value={vessel.terminal_name}
                onChange={e => setV('terminal_name', e.target.value)} />
            </Field>
            <Field label="Estimated Arrival Date" required error={errors.arrival_date}>
              <input type="date" className={`input-base w-full ${errors.arrival_date ? 'border-red-400' : ''}`}
                min={new Date().toISOString().slice(0, 10)}
                value={vessel.arrival_date}
                onChange={e => setV('arrival_date', e.target.value)} />
            </Field>
            <Field label="Estimated Arrival Time" required error={errors.arrival_time}
              hint={items.length > 0 && cutoffs.grocery_cutoff_hours > 0
                ? `Grocery orders need at least ${cutoffs.grocery_cutoff_hours} hours before arrival`
                : undefined}>
              <input type="time" className={`input-base w-full ${errors.arrival_time ? 'border-red-400' : ''}`}
                value={vessel.arrival_time}
                onChange={e => setV('arrival_time', e.target.value)} />
            </Field>

            {/* Delivery method */}
            <Field label="Delivery Method" required error={errors.delivery_method} col2>
              <div className="flex gap-3 mt-1">
                {(['boat', 'van'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => { setV('delivery_method', m); if (m === 'van') setV('approach_side', ''); }}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      vessel.delivery_method === m
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {m === 'boat' ? '⛵ Boat Delivery' : '🚐 Van Delivery'}
                  </button>
                ))}
              </div>
            </Field>

            {vessel.delivery_method === 'boat' && (<>
              <Field label="Approach Side" required error={errors.approach_side} col2>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {([
                    ['port',      '⬅ Port (Left)'],
                    ['starboard', 'Starboard (Right) ➡'],
                    ['either',    'Either Side'],
                  ] as const).map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setV('approach_side', val)}
                      className={`px-4 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                        vessel.approach_side === val
                          ? 'border-brand-navy bg-brand-navy text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>{lbl}</button>
                  ))}
                </div>
              </Field>
              <Field label="Best VHF Radio Channel">
                <input type="text" className="input-base w-full" placeholder="e.g. Channel 16 (optional)"
                  value={vessel.vhf_channel} onChange={e => setV('vhf_channel', e.target.value)} />
              </Field>
            </>)}
          </div>

          {/* Secondary delivery */}
          {!showSecondary ? (
            <button type="button" onClick={() => setShowSecondary(true)}
              className="mt-4 text-xs text-brand-river hover:text-brand-steel flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add secondary delivery location
            </button>
          ) : (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Secondary Delivery <span className="font-normal text-gray-400">(optional)</span></p>
                <button type="button" onClick={clearSecondary} className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Location / Terminal Name" col2>
                  <input type="text" className="input-base w-full" placeholder="e.g. Grafton Ferry Landing"
                    value={vessel.secondary_terminal_name} onChange={e => setV('secondary_terminal_name', e.target.value)} />
                </Field>
                <Field label="Est. Arrival Date">
                  <input type="date" className="input-base w-full"
                    min={new Date().toISOString().slice(0, 10)}
                    value={vessel.secondary_arrival_date} onChange={e => setV('secondary_arrival_date', e.target.value)} />
                </Field>
                <Field label="Est. Arrival Time">
                  <input type="time" className="input-base w-full"
                    value={vessel.secondary_arrival_time} onChange={e => setV('secondary_arrival_time', e.target.value)} />
                </Field>
                <Field label="Delivery Method" col2>
                  <div className="flex gap-3 mt-1">
                    {(['boat', 'van'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setV('secondary_delivery_method', m)}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                          vessel.secondary_delivery_method === m
                            ? 'border-brand-navy bg-brand-navy text-white'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>{m === 'boat' ? '⛵ Boat' : '🚐 Van'}</button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          )}
        </section>

        {/* ── Crew Change ── */}
        <section className="card-base mb-4 p-5">
          <SectionHead icon={<Users className="w-4 h-4" />} title="Crew Change" sub="Not sure yet? Choose Maybe and we'll follow up." />
          <div className="flex gap-3 mb-4">
            {([['no', 'No'], ['maybe', 'Maybe'], ['yes', 'Yes']] as const).map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => setV('crew_change', val)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  vessel.crew_change === val
                    ? val === 'maybe'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-brand-navy bg-brand-navy text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>{lbl}</button>
            ))}
          </div>
          {vessel.crew_change === 'yes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="# Crew Members Arriving" required error={errors.crew_arriving}>
                  <input type="number" min="0" className={`input-base w-full ${errors.crew_arriving ? 'border-red-400' : ''}`}
                    placeholder="0" value={vessel.crew_arriving}
                    onChange={e => setV('crew_arriving', e.target.value)} />
                </Field>
                <Field label="# Crew Members Departing" required error={errors.crew_departing}>
                  <input type="number" min="0" className={`input-base w-full ${errors.crew_departing ? 'border-red-400' : ''}`}
                    placeholder="0" value={vessel.crew_departing}
                    onChange={e => setV('crew_departing', e.target.value)} />
                </Field>
              </div>
              <Field label="Crew Change Notes" hint="Optional — anything that helps us plan (flight times, ride arrangements, etc.)">
                <textarea className="input-base resize-none w-full" rows={2}
                  placeholder="e.g. New deckhand lands at 11:40 AM — may run late…"
                  value={vessel.crew_change_notes}
                  onChange={e => setV('crew_change_notes', e.target.value)} />
              </Field>
            </div>
          )}
          {vessel.crew_change === 'maybe' && (
            <Field label="Crew Change Notes" hint="Optional — anything that helps us plan (possible timing, headcount, etc.)">
              <textarea className="input-base resize-none w-full" rows={2}
                placeholder="e.g. Might swap 2 crew depending on schedule…"
                value={vessel.crew_change_notes}
                onChange={e => setV('crew_change_notes', e.target.value)} />
            </Field>
          )}
        </section>

        {/* ── Notes ── */}
        <section className="card-base mb-6 p-5">
          <SectionHead icon={<ClipboardList className="w-4 h-4" />} title="Additional Notes" sub="Docking access, security, special instructions" />
          <textarea className="input-base resize-none w-full" rows={3}
            placeholder="Docking notes, security requirements, access instructions, special requests…"
            value={vessel.notes} onChange={e => setV('notes', e.target.value)} />
        </section>

        <div className="flex gap-3">
          <button onClick={() => setStep(1)} className="btn-outline flex-1 py-4">&larr; Back</button>
          <button onClick={goStep3} className="btn-gold flex-[2] py-4 flex items-center justify-center gap-2">
            Review &amp; Submit <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultMode="signin" defaultEmail={vessel.email} title="Sign In" />
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // STEP 3 — Review & Submit
  // ════════════════════════════════════════════════════════════
  const vesselTypeDisplay = vessel.vessel_type === 'Other' ? vessel.vessel_type_other : vessel.vessel_type;

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-20">
        <button onClick={() => setStep(2)}
          className="inline-flex items-center gap-1.5 text-brand-river text-sm mb-6 hover:text-brand-steel">
          <ArrowLeft className="w-4 h-4" /> Edit Info
        </button>
        <StepIndicator step={3} />
        <h2 className="font-display text-xl font-bold text-brand-navy mb-4">Review Your Order</h2>

        {/* Grocery summary */}
        {items.length > 0 && (
          <section className="card-base mb-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-brand-navy flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-brand-gold" />
                Groceries ({groceryCount} item{groceryCount !== 1 ? 's' : ''})
              </h3>
              <button onClick={() => setStep(1)} className="text-xs text-brand-river hover:underline">Edit</button>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <div key={item.product_id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.image_url && (
                      <div className="w-9 h-9 shrink-0 bg-gray-50 rounded border border-gray-100 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt="" loading="lazy" decoding="async"
                          className="w-full h-full object-contain p-0.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-semibold text-brand-navy">{item.description}</span>
                      {item.pkg_size && <span className="text-gray-400 text-xs ml-1.5">{item.pkg_size}</span>}
                      {item.paid_by === 'cod' && (
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-purple-700">
                          COD — {item.cod_name || 'crew member'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-gray-500 text-xs">{formatQty(item.quantity, item.billed_by_weight)}</span>
                    <span className="font-bold text-brand-navy ml-2">
                      {item.billed_by_weight ? '~' : ''}{formatCurrency(item.price * item.quantity)}{item.billed_by_weight ? ' est.' : ''}
                    </span>
                  </div>
                </div>
              ))}
              {hasCod && (
                <div className="px-4 py-2.5 space-y-1 text-sm bg-white">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Vessel Account subtotal</span>
                    <span className="font-bold text-brand-navy">{formatCurrency(vesselSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-700">COD subtotal — due on delivery
                      {vessel.cod_payment_method && (
                        <span className="text-purple-500"> · {vessel.cod_payment_method === 'credit_card' ? 'credit card (we’ll call)' : vessel.cod_payment_method}</span>
                      )}
                    </span>
                    <span className="font-bold text-purple-700">{formatCurrency(codSubtotal)}</span>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 flex justify-between items-center font-bold bg-brand-sand/30">
                <span className="flex items-center gap-2">
                  <span className="text-brand-navy">Estimated Total</span>
                  <span className="relative" ref={tooltipRef}>
                    <button type="button" onClick={() => setTooltipOpen(o => !o)}
                      className="flex items-center gap-1 text-xs font-normal text-brand-river hover:text-brand-navy focus:outline-none">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span className="underline underline-offset-2">Why estimated?</span>
                    </button>
                    {tooltipOpen && (
                      <span className="absolute bottom-full left-0 mb-2 z-30 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4 block font-normal">
                        <span className="flex justify-between gap-2 mb-2">
                          <span className="font-bold text-gray-800 text-sm">Why is my total estimated?</span>
                          <button type="button" onClick={() => setTooltipOpen(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                        <span className="text-xs text-gray-600 leading-relaxed block">{ESTIMATED_EXPLANATION}</span>
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-brand-navy text-lg">{formatCurrency(groceryTotal)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Services summary */}
        {activeSvcs.length > 0 && (
          <section className="card-base mb-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-display font-bold text-brand-navy flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-orange" /> Additional Services
              </h3>
              <Link href="/catalog?tab=services" className="text-xs text-brand-river hover:underline">Edit</Link>
            </div>
            {services.parts_pickup.enabled && (
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-bold text-brand-navy mb-1">Parts Pickup</p>
                <div className="grid grid-cols-2 gap-1">
                  <ReviewRow label="Location" value={services.parts_pickup.pickup_location} />
                  {services.parts_pickup.order_number && <ReviewRow label="Order #" value={services.parts_pickup.order_number} />}
                  <ReviewRow label="Contact" value={`${services.parts_pickup.contact_name} · ${services.parts_pickup.contact_phone}`} />
                </div>
              </div>
            )}
            {services.package_delivery.enabled && (
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-bold text-brand-navy mb-1">Package Delivery</p>
                <div className="grid grid-cols-2 gap-1">
                  <ReviewRow label="Description" value={services.package_delivery.description} />
                  <ReviewRow label="From" value={services.package_delivery.origin} />
                  <ReviewRow label="Contact" value={`${services.package_delivery.contact_name} · ${services.package_delivery.contact_phone}`} />
                </div>
              </div>
            )}
            {services.other_pickup?.enabled && (
              <div className="px-4 py-3">
                <p className="text-sm font-bold text-brand-navy mb-1">
                  Other Third-Party Item{(services.other_pickup.items?.length ?? 0) > 1 ? 's' : ''}{' '}
                  <span className="text-xs font-normal text-gray-400">(handled by Sinclair&apos;s)</span>
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {(services.other_pickup.items || []).map((entry, i) => (
                    (entry.url || entry.notes) ? (
                      <div key={i} className="grid grid-cols-1 gap-1">
                        {entry.url && <ReviewRow label={`Item ${i + 1} Link`} value={entry.url} />}
                        {entry.notes && <ReviewRow label="Details" value={entry.notes} />}
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Vessel info summary */}
        <section className="card-base mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-display font-bold text-brand-navy">Vessel &amp; Delivery Info</h3>
            <button onClick={() => setStep(2)} className="text-xs text-brand-river hover:underline">Edit</button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Company</p>
              <div className="grid grid-cols-2 gap-1">
                <ReviewRow label="Company" value={vessel.company_name} />
                {vessel.po_number && <ReviewRow label="PO #" value={vessel.po_number} />}
                <ReviewRow label="Billing Contact" value={vessel.contact_name} />
                <ReviewRow label="Billing Phone" value={vessel.phone} />
                <ReviewRow label="Billing Email" value={vessel.email} />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Vessel</p>
              <div className="grid grid-cols-2 gap-1">
                <ReviewRow label="Vessel Name" value={vessel.vessel_name} />
                <ReviewRow label="Type" value={vesselTypeDisplay} />
                <ReviewRow label="Captain" value={vessel.captain_name} />
                <ReviewRow label="Captain Phone" value={vessel.captain_phone} />
                {vessel.vessel_email && <ReviewRow label="Vessel Email" value={vessel.vessel_email} />}
              </div>
            </div>
            {vessel.order_contact_name && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Order Contact</p>
                <div className="grid grid-cols-2 gap-1">
                  <ReviewRow label="Name" value={vessel.order_contact_name} />
                  {vessel.order_contact_title && <ReviewRow label="Title" value={vessel.order_contact_title} />}
                  {vessel.order_contact_phone && <ReviewRow label="Phone" value={vessel.order_contact_phone} />}
                  {vessel.order_contact_email && <ReviewRow label="Email" value={vessel.order_contact_email} />}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Primary Delivery</p>
              <div className="grid grid-cols-2 gap-1">
                <ReviewRow label="Terminal" value={vessel.terminal_name} />
                <ReviewRow label="Arrival" value={[vessel.arrival_date, vessel.arrival_time].filter(Boolean).join(', ')} />
                <ReviewRow label="Method" value={vessel.delivery_method === 'boat' ? 'Boat Delivery' : vessel.delivery_method === 'van' ? 'Van Delivery' : ''} />
                {vessel.delivery_method === 'boat' && vessel.approach_side && (
                  <ReviewRow label="Approach" value={vessel.approach_side.charAt(0).toUpperCase() + vessel.approach_side.slice(1)} />
                )}
                {vessel.vhf_channel && <ReviewRow label="VHF Channel" value={vessel.vhf_channel} />}
              </div>
            </div>
            {vessel.secondary_terminal_name && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Secondary Delivery</p>
                <div className="grid grid-cols-2 gap-1">
                  <ReviewRow label="Terminal" value={vessel.secondary_terminal_name} />
                  <ReviewRow label="Arrival" value={[vessel.secondary_arrival_date, vessel.secondary_arrival_time].filter(Boolean).join(', ')} />
                  {vessel.secondary_delivery_method && (
                    <ReviewRow label="Method" value={vessel.secondary_delivery_method === 'boat' ? 'Boat' : 'Van'} />
                  )}
                </div>
              </div>
            )}
            {vessel.crew_change !== 'no' && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Crew Change</p>
                {vessel.crew_change === 'yes' ? (
                  <div>
                    <div className="grid grid-cols-2 gap-1">
                      <ReviewRow label="Arriving" value={vessel.crew_arriving} />
                      <ReviewRow label="Departing" value={vessel.crew_departing} />
                    </div>
                    {vessel.crew_change_notes && (
                      <p className="text-sm text-gray-700 mt-1">{vessel.crew_change_notes}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="inline-block text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Maybe</span>
                    {vessel.crew_change_notes && (
                      <p className="text-sm text-gray-700 mt-1">{vessel.crew_change_notes}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {hasCod && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">COD Payment</p>
                <div className="text-sm text-gray-700 bg-purple-50 border border-purple-200 rounded p-2">
                  <p>
                    {codItems.length} item{codItems.length !== 1 ? 's' : ''} · {formatCurrency(codSubtotal)} due on delivery
                    {vessel.cod_payment_method && <> — <strong>{vessel.cod_payment_method === 'credit_card' ? 'Credit Card' : vessel.cod_payment_method === 'venmo' ? 'Venmo' : 'Cash'}</strong></>}
                  </p>
                  {vessel.cod_payment_method === 'credit_card' && (
                    <p className="text-xs text-purple-700 mt-0.5">
                      We&apos;ll call {vessel.cod_preferred_phone || 'you'}{vessel.cod_contact_time ? ` (${vessel.cod_contact_time})` : ''} to collect payment.
                    </p>
                  )}
                </div>
              </div>
            )}
            {vessel.notes && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 bg-amber-50 rounded p-2">{vessel.notes}</p>
              </div>
            )}
          </div>
        </section>

        <div className="flex gap-3">
          <button onClick={() => setStep(2)} className="btn-outline flex-1 py-4">&larr; Edit</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="btn-gold flex-[2] py-4 flex items-center justify-center gap-2 disabled:opacity-60">
            {submitting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting&hellip;</>
              : <>Submit Order <ChevronRight className="w-5 h-5" /></>}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          A confirmation will be sent to {vessel.email || 'your billing email'}
        </p>

        <ContactPhones className="mt-8" />
      </main>
    </div>
  );
}
