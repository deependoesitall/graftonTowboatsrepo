'use client';
// src/app/account/page.tsx
import { effectiveCatalogPrice } from '@/lib/catalog-price';
import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star, History, User, LogOut, Loader2, ShoppingCart,
  RotateCcw, ChevronRight, Save, Package
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { AuthModal } from '@/components/auth/AuthModal';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartBar } from '@/components/cart/CartBar';
import { createClient } from '@/lib/supabase/client';
import { getFavoriteProducts, removeFavorite } from '@/lib/favorites';
import { addToCart, saveCart, getCart, saveVesselInfo, getVesselInfo, saveCodPayments, clearCodPayments, type StoredCodPay } from '@/lib/cart';
import { formatCurrency, formatDate, productDisplayName } from '@/lib/utils';
import { Product, Order, VESSEL_TYPES } from '@/types';
import { readCodPayments } from '@/lib/cod-payments';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  fulfilled: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

function AccountContent() {
  const { user, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  const [tab, setTab] = useState<'orders' | 'favorites' | 'profile'>('orders');
  const [authOpen, setAuthOpen] = useState(false);

  // Past orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favsLoading, setFavsLoading] = useState(false);

  // Profile
  const [profile, setProfile] = useState({ first_name: '', last_name: '', company_name: '', contact_name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  // Boats this login is a member of (company · boat)
  const [boatLinks, setBoatLinks] = useState<Array<{ company: string; boat: string; role: string }>>([]);

  // Only trigger data loading once we're sure user is logged in
  useEffect(() => {
    if (loading) return;
    if (!user) return; // just show the sign-in prompt — don't auto-open modal
    loadOrders();
    loadFavorites();
    loadProfile();
    loadBoatLinks();
  }, [user, loading]);

  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .order('created_at', { ascending: false })
        .limit(50);
      setOrders((data as Order[]) || []);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadFavorites() {
    setFavsLoading(true);
    try {
      setFavorites(await getFavoriteProducts());
    } catch {
      setFavorites([]);
    } finally {
      setFavsLoading(false);
    }
  }


  async function loadBoatLinks() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('vessel_members')
        .select('role, vessel:vessels(name, company:companies(name))');
      const rows = (data || []).map((row: any) => ({
        role: row.role || 'cook',
        boat: row.vessel?.name || '',
        company: row.vessel?.company?.name || '',
      })).filter((r: any) => r.boat);
      setBoatLinks(rows);
    } catch {
      setBoatLinks([]);
    }
  }
  async function loadProfile() {
    try {
      const supabase = createClient();
      const { data } = await supabase.from('customer_profiles').select('*').maybeSingle();
      if (data) setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        company_name: data.company_name || '',
        contact_name: data.contact_name || '',
        phone: data.phone || '',
      });
    } catch {
      // no profile yet â" leave defaults
    }
  }

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('customer_profiles').upsert({ user_id: user.id, ...profile });
      if (error) throw error;
      // Also save to localStorage so order form auto-fills
      const existing = getVesselInfo();
      saveVesselInfo({ ...existing, company_name: profile.company_name, contact_name: profile.contact_name, phone: profile.phone });
      await refreshProfile();
      toast({ title: 'Profile saved', variant: 'success', duration: 2000 });
    } catch (err: any) {
      toast({ title: 'Could not save profile', description: err?.message || 'Please try again', variant: 'destructive', duration: 3000 });
    } finally {
      setSavingProfile(false);
    }
  }

  /**
   * REPEAT ORDER â" brings back the LINES AND THE HEADER.
   *
   * It used to copy line items and nothing else, so the one button whose whole
   * promise is "same as last time" still made a returning captain retype the
   * company, vessel, captain, captain's mobile, vessel email, terminal and
   * delivery method. Every one of those is already snapshotted on the order
   * being repeated â" the data was sitting right there, unused.
   *
   * Three other things it got wrong:
   *
   *   Â· paid_by was HARDCODED to 'vessel', so repeating an order silently
   *     moved every COD line onto the company invoice. A crew member's
   *     personal Tylenol became the boat's, and nothing said so.
   *   Â· cod_name went with it, losing even the record of whose item it was.
   *   Â· The toast counted order.items â" including the service lines it had
   *     just filtered out â" so it reported adding more than it added.
   */
  async function repeatOrder(order: Order) {
    // Services are deliberately not repeated: a parts pickup or a package
    // delivery is a one-off errand, not a standing order.
    const lines = order.items.filter(i => i.item_type !== 'service');
    const droppedServices = order.items.length - lines.length;

    if (lines.length === 0) {
      toast({
        title: 'Nothing to repeat',
        description: `Order ${order.order_number} has no grocery or supply lines.`,
      });
      return;
    }

    // REPLACE, DON'T MERGE. addToCart() adds quantities for a product already
    // in the cart, so repeating on top of an existing cart silently doubled
    // everything. And now that paid_by is preserved, a merge could also fold a
    // COD line into a vessel line and move it onto the company bill.
    const existing = getCart();
    if (existing.length > 0) {
      const ok = await confirmDialog({
        title: 'Replace your current cart?',
        message: `Repeating ${order.order_number} brings back ${lines.length} item${lines.length !== 1 ? 's' : ''}. `
          + `Your cart has ${existing.length} right now â" ${existing.length === 1 ? 'it' : 'they'} will be removed.`,
        danger: true,
      });
      if (!ok) return;
    }

    // Live catalog prices — past-order unit_price is a snapshot and goes stale.
    // Batch-fetch products by id; active+available lines get current price/desc/
    // image/pkg/uom/category. Missing / inactive / unavailable / write-ins keep
    // the last known description + unit_price so the line doesn't vanish.
    const ids = Array.from(
      new Set(
        lines
          .map(i => i.product_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    type LiveProduct = {
      id: string;
      price: number;
      description: string;
      details?: string | null;
      category: string;
      pkg_size: string | null;
      uom: string | null;
      image_url: string | null;
      is_active: boolean | null;
      is_available: boolean | null;
    };
    const liveById = new Map<string, LiveProduct>();

    if (ids.length > 0) {
      const supabase = createClient();
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('products')
          .select('id, price, regular_price, sale_start_date, sale_finish_date, description, details, category, pkg_size, uom, image_url, is_active, is_available')
          .in('id', chunk);
        for (const row of (data || []) as LiveProduct[]) {
          liveById.set(row.id, row);
        }
      }
    }

    let staleCount = 0;
    saveCart(lines.map(item => {
      const live = item.product_id ? liveById.get(item.product_id) : undefined;
      const usable =
        !!live &&
        live.is_active !== false &&
        live.is_available !== false;

      if (usable && live) {
        return {
          product_id: item.product_id,
          description: productDisplayName(live),
          category: live.category,
          pkg_size: live.pkg_size,
          uom: live.uom,
          price: effectiveCatalogPrice(live).price,
          quantity: item.quantity,
          image_url: live.image_url,
          // Who was paying stays who was paying.
          paid_by: item.paid_by ?? 'vessel',
          cod_name: item.cod_name ?? '',
        };
      }

      if (item.product_id) staleCount += 1;
      return {
        product_id: item.product_id,
        description: item.description,
        category: item.category,
        pkg_size: item.pkg_size,
        uom: item.uom,
        price: item.unit_price,
        quantity: item.quantity,
        image_url: item.image_url,
        // Who was paying stays who was paying.
        paid_by: item.paid_by ?? 'vessel',
        cod_name: item.cod_name ?? '',
      };
    }));

    // â"â" The header â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
    //
    // Restored from the order's own snapshot. The API stores vessel_type
    // resolved to a plain string, so a custom type has to be unpacked back into
    // Other + the free-text field or the select lands on nothing.
    const ext = (order.extended_info || {}) as Record<string, string>;
    const knownType = (VESSEL_TYPES as readonly string[]).includes(order.vessel_type || '');

    saveVesselInfo({
      ...getVesselInfo(),
      company_name:  order.company_name   || '',
      po_number:     order.po_number      || '',
      contact_name:  order.contact_name   || '',
      phone:         order.phone          || '',
      email:         order.customer_email || '',
      vessel_name:   order.vessel_name    || '',
      vessel_type:       knownType ? (order.vessel_type || '') : (order.vessel_type ? 'Other' : ''),
      vessel_type_other: knownType ? '' : (order.vessel_type || ''),
      captain_name:  order.captain_name   || '',
      captain_phone: order.captain_phone  || '',
      vessel_email:  order.vessel_email   || '',
      order_contact_name:  ext.order_contact_name  || '',
      order_contact_title: ext.order_contact_title || '',
      order_contact_phone: ext.order_contact_phone || '',
      order_contact_email: ext.order_contact_email || '',
      terminal_name:   order.terminal_name   || '',
      delivery_method: order.delivery_method || '',
      approach_side:   order.approach_side   || '',
      vhf_channel:     order.vhf_channel     || '',

      // â ï¸ EVERYTHING BELOW IS PER-TRIP AND MUST COME BACK BLANK.
      //
      // A stale arrival date is worse than an empty one: an empty field is
      // caught by validation, while a plausible-looking old date gets submitted
      // and the van turns up for a boat that left last week. Same for a crew
      // change that already happened, and notes about a different run.
      arrival_date: '', arrival_time: '',
      secondary_terminal_name: '', secondary_arrival_date: '',
      secondary_arrival_time: '', secondary_delivery_method: '',
      crew_change: 'no', crew_change_notes: '', crew_arriving: '', crew_departing: '',
      notes: '', eta: '',
    });

    // â"â" Who pays, per person â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
    //
    // Restored from the same snapshot. A boat's crew settle the same way most
    // weeks â" Amber by Venmo, Andy by card â" so asking again, including for the
    // Venmo handle, is exactly the retyping this button is supposed to remove.
    // The form still shows each choice and still validates it; nothing is
    // submitted on their behalf.
    const storedPay = readCodPayments(order.extended_info);
    if (storedPay.length > 0) {
      const map: Record<string, StoredCodPay> = {};
      storedPay.forEach(p => {
        if (p.method === 'venmo' || p.method === 'cashapp' || p.method === 'credit_card') {
          map[p.name] = { method: p.method, handle: p.handle, phone: p.phone, time: p.contact_time };
        }
      });
      saveCodPayments(map);
    } else {
      // An older order carries no per-person record. Better an empty form than
      // one quietly prefilled from whoever ordered last.
      clearCodPayments();
    }

    const staleNote = staleCount > 0
      ? ` ${staleCount} item${staleCount !== 1 ? 's' : ''} kept last-known price (missing or unavailable in catalog).`
      : '';
    toast({
      title: `${lines.length} item${lines.length !== 1 ? 's' : ''} added to cart`,
      description: (droppedServices > 0
        ? `From ${order.order_number}. ${droppedServices} service line${droppedServices !== 1 ? 's' : ''} not repeated â" add those again if you need them.`
        : `From ${order.order_number}. Vessel and delivery details are filled in â" just set the date and time.`) + staleNote,
      variant: 'success',
    });
    router.push('/order');
  }

  function favToCart(p: Product) {
    addToCart({
      product_id: p.id, description: productDisplayName(p), category: p.category,
      pkg_size: p.pkg_size, uom: p.uom, price: p.price, quantity: 1,
      image_url: p.image_url, paid_by: 'vessel',
    });
    toast({ title: 'Added to cart', description: productDisplayName(p), variant: 'success', duration: 1500 });
  }

  // Show loading screen while auth resolves
  if (loading) return (
    <div className="min-h-screen">
      <SiteHeader />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <User className="w-7 h-7 text-brand-green" />
        </div>
        <h1 className="gts-heading text-2xl mb-2">My Account</h1>
        <p className="text-brand-green/60 text-sm mb-6">
          Sign in to view your past orders, favorites, and saved vessel info.
        </p>
        <button onClick={() => setAuthOpen(true)} className="btn-primary">Sign In / Create Account</button>
        <p className="mt-4">
          <Link href="/catalog" className="text-brand-orange text-sm font-bold hover:underline">
            Continue as guest â'
          </Link>
        </p>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );

  const tabs = [
    { key: 'orders' as const, label: 'Past Orders', icon: History },
    { key: 'favorites' as const, label: 'Favorites', icon: Star },
    { key: 'profile' as const, label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen pb-28">
      <SiteHeader />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="gts-heading text-2xl">My Account</h1>
            <p className="text-brand-green/60 text-sm">{user.email}</p>
          </div>
          <button onClick={async () => { await signOut(); router.push('/catalog'); }}
            className="flex items-center gap-1.5 text-sm text-brand-green/60 hover:text-brand-green font-semibold transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>

        {boatLinks.length > 0 && (
          <div className="mb-4 rounded-xl border border-brand-gold/30 bg-brand-sand/50 px-4 py-3 text-sm">
            {boatLinks.map((b, i) => (
              <div key={i} className="font-semibold text-brand-navy">
                {b.company || 'Company'} · {b.boat}
                <span className="ml-2 text-xs font-normal text-brand-green/50 capitalize">{b.role}</span>
              </div>
            ))}
            <p className="text-xs text-brand-green/50 mt-1">Past orders for this boat are shared with the other logins on it.</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white/70 rounded-xl p-1 mb-6 border border-brand-green/10">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                tab === key ? 'bg-brand-green text-white' : 'text-brand-green/60 hover:bg-brand-green/5'}`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* â"â" PAST ORDERS â"â" */}
        {tab === 'orders' && (
          ordersLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-green" /></div>
          ) : orders.length === 0 ? (
            <div className="card-base p-10 text-center">
              <div className="w-16 h-16 bg-brand-green/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-brand-green/20" />
              </div>
              <p className="font-bold text-brand-green text-base mb-2">No past orders yet</p>
              <p className="text-brand-green/50 text-sm leading-relaxed mb-5 max-w-xs mx-auto">
                Orders you place while signed in will appear here. You can view order details, check delivery status, and reorder everything in one tap.
              </p>
              <Link href="/catalog" className="btn-primary inline-flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Browse Items
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.id} className="card-base p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-brand-green">{order.order_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${STATUS_STYLES[order.status] || ''}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-brand-green/70 truncate">
                      {order.company_name} Â· {formatDate(order.created_at)}
                    </p>
                    <p className="text-xs text-brand-green/40 mt-0.5">
                      {order.items?.length || 0} line items Â· <span className="font-bold text-brand-green">{formatCurrency(order.subtotal)}</span>
                      {(Number(order.discount_total) || 0) > 0 && (
                        <span className="ml-1.5 text-green-600 font-semibold">ð· â'{formatCurrency(Number(order.discount_total))} coupons</span>
                      )}
                    </p>
                    {/* Product thumbnails â" the little dopamine strip */}
                    {(order.items || []).some(i => i.image_url) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {(order.items || []).filter(i => i.image_url).slice(0, 8).map(i => (
                          <div key={i.id} className="w-8 h-8 bg-gray-50 border border-gray-100 rounded overflow-hidden shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={i.image_url!} alt="" loading="lazy" decoding="async"
                              className="w-full h-full object-contain p-0.5" />
                          </div>
                        ))}
                        {(order.items || []).filter(i => i.image_url).length > 8 && (
                          <span className="text-[10px] text-brand-green/40 font-bold">
                            +{(order.items || []).filter(i => i.image_url).length - 8}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { void repeatOrder(order); }}
                      className="flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-full hover:bg-brand-ored transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Repeat Order
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      className="flex items-center gap-1 text-xs text-brand-green/50 hover:text-brand-green font-semibold transition-colors"
                    >
                      {expandedOrderId === order.id ? 'Hide lines' : 'View lines'} <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedOrderId === order.id ? 'rotate-90' : ''}`} />
                    </button>
                    <a href={`/api/orders/${order.id}/pdf`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-brand-green/50 hover:text-brand-green font-semibold transition-colors">
                      PDF
                    </a>
                  </div>
                  {expandedOrderId === order.id && (
                    <div className="w-full basis-full mt-3 border-t border-brand-green/10 pt-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-green/50 mb-1">Full substitution record</p>
                      {(() => {
                        const lines = (order.items || []).filter(i => i.item_type !== 'service');
                        const byParent = lines
                          .filter(i => i.is_substitution && i.substitutes_item_id)
                          .reduce((acc, i) => {
                            const k = i.substitutes_item_id as string;
                            (acc[k] ||= []).push(i);
                            return acc;
                          }, {} as Record<string, typeof lines>);
                        const ids = new Set(lines.map(i => i.id));
                        const primaries = lines.filter(i => {
                          if (!i.is_substitution || !i.substitutes_item_id) return true;
                          return !ids.has(i.substitutes_item_id);
                        });
                        if (!primaries.length) {
                          return <p className="text-xs text-brand-green/50">No grocery lines on this order.</p>;
                        }
                        return primaries.map(item => {
                          const oos = item.shopping_status === 'out_of_stock';
                          const kids = byParent[item.id] || [];
                          return (
                            <div key={item.id} className="text-sm">
                              <div className={`flex gap-2 items-start ${oos ? 'opacity-70' : ''}`}>
                                <span className="text-xs font-bold text-brand-green/60 w-8 shrink-0">{item.quantity}×</span>
                                <div className="min-w-0 flex-1">
                                  <p className={`font-semibold text-brand-navy text-xs leading-snug ${oos ? 'line-through' : ''}`}>
                                    {item.description}
                                  </p>
                                  {oos && (
                                    <p className="text-[10px] font-bold text-gray-500 uppercase">Out of stock — not billed</p>
                                  )}
                                  {item.preferred_sub_mode === 'product' && (
                                    <p className="text-[10px] font-bold text-amber-800">Preferred if OOS: {item.preferred_sub_description || 'selected product'}</p>
                                  )}
                                  {item.preferred_sub_mode === 'none' && (
                                    <p className="text-[10px] font-bold text-amber-800">Do not substitute</p>
                                  )}
                                  {item.preferred_sub_mode === 'store_choice' && (
                                    <p className="text-[10px] font-bold text-amber-800">Store chooses substitute</p>
                                  )}
                                  {!oos && (
                                    <p className="text-[11px] text-brand-green/50">{formatCurrency(Number(item.actual_total ?? item.line_total))}</p>
                                  )}
                                </div>
                              </div>
                              {kids.map(sub => {
                                const matched = item.preferred_sub_mode === 'product'
                                  && item.preferred_sub_product_id
                                  && sub.product_id === item.preferred_sub_product_id;
                                return (
                                  <div key={sub.id} className="flex gap-2 items-start ml-6 mt-1 border-l-2 border-amber-400 pl-2">
                                    <span className="text-xs font-bold text-amber-700 w-8 shrink-0">{sub.quantity}×</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-amber-800 text-xs leading-snug">{sub.description}</p>
                                      <p className="text-[10px] font-bold text-amber-700 uppercase">
                                        Substituted for original{matched ? ' · Customer preferred' : ''}
                                      </p>
                                      <p className="text-[11px] text-brand-green/50">{formatCurrency(Number(sub.actual_total ?? sub.line_total))}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* â"â" FAVORITES â"â" */}
        {tab === 'favorites' && (
          favsLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-green" /></div>
          ) : favorites.length === 0 ? (
            <div className="card-base p-10 text-center">
              <div className="w-16 h-16 bg-brand-orange/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-brand-orange/20" />
              </div>
              <p className="font-bold text-brand-green text-base mb-2">No saved favorites yet</p>
              <p className="text-brand-green/50 text-sm leading-relaxed mb-5 max-w-xs mx-auto">
                Tap the â... icon on any item in the catalog to save it here. Your favorites are always one tap away from being added to your next order.
              </p>
              <Link href="/catalog" className="btn-primary inline-flex items-center gap-2">
                <Star className="w-4 h-4" /> Browse Catalog
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {favorites.map(p => (
                <div key={p.id} className="card-base p-3.5 flex items-center gap-3">
                  <button onClick={async () => { await removeFavorite(p.id); loadFavorites(); }}
                    className="text-brand-orange shrink-0" aria-label="Remove from favorites">
                    <Star className="w-5 h-5 fill-brand-orange" />
                  </button>
                  {p.image_url && (
                    <div className="w-11 h-11 bg-gray-50 border border-gray-100 rounded-lg overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image_url} alt="" loading="lazy" decoding="async"
                        className="w-full h-full object-contain p-0.5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-green text-sm truncate">{p.description}</p>
                    <p className="text-xs text-brand-green/40">
                      {p.category}{p.pkg_size ? ` Â· ${p.pkg_size}` : ''} Â· <span className="font-bold text-brand-green">{formatCurrency(p.price)}</span>
                    </p>
                  </div>
                  <button onClick={() => favToCart(p)}
                    className="flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold px-3.5 py-2 rounded-full hover:bg-brand-gmed transition-colors shrink-0">
                    <ShoppingCart className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* â"â" PROFILE â"â" */}
        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="card-base p-6 space-y-4">
              <div>
                <h2 className="font-bold text-brand-green mb-1">Your Info</h2>
                <p className="text-xs text-brand-green/50">Shown in the account menu.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-base">First Name</label>
                  <input className="input-base" placeholder="Jennifer" value={profile.first_name}
                    onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label-base">Last Name <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                  <input className="input-base" placeholder="Smith" value={profile.last_name}
                    onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="card-base p-6 space-y-4">
              <div>
                <h2 className="font-bold text-brand-green mb-1">Saved Vessel Info</h2>
                <p className="text-xs text-brand-green/50">This auto-fills your checkout form on future orders.</p>
              </div>
              <div>
                <label className="label-base">Company / Vessel Name</label>
                <input className="input-base" placeholder="M/V River Hawk" value={profile.company_name}
                  onChange={e => setProfile(p => ({ ...p, company_name: e.target.value }))} />
              </div>
              <div>
                <label className="label-base">Contact Name</label>
                <input className="input-base" placeholder="Captain Smith" value={profile.contact_name}
                  onChange={e => setProfile(p => ({ ...p, contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="label-base">Phone</label>
                <input className="input-base" type="tel" placeholder="(618) 555-0000" value={profile.phone}
                  onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>

            <button onClick={saveProfile} disabled={savingProfile}
              className="btn-primary flex items-center gap-2">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </button>
          </div>
        )}
      </div>
      {confirmDialogEl}
      <CartBar />
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountContent />
    </Suspense>
  );
}
