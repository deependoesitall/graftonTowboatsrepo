'use client';
// src/app/account/page.tsx
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
import { addToCart, saveVesselInfo, getVesselInfo } from '@/lib/cart';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Product, Order } from '@/types';
import { useToast } from '@/hooks/use-toast';

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
  const [tab, setTab] = useState<'orders' | 'favorites' | 'profile'>('orders');
  const [authOpen, setAuthOpen] = useState(false);

  // Past orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Favorites
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favsLoading, setFavsLoading] = useState(true);

  // Profile
  const [profile, setProfile] = useState({ first_name: '', last_name: '', company_name: '', contact_name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAuthOpen(true); return; }
    loadOrders();
    loadFavorites();
    loadProfile();
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
      // no profile yet — leave defaults
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

  function repeatOrder(order: Order) {
    order.items.forEach(item => {
      addToCart({
        product_id: item.product_id,
        description: item.description,
        category: item.category,
        pkg_size: item.pkg_size,
        uom: item.uom,
        price: item.unit_price,
        quantity: item.quantity,
      });
    });
    toast({
      title: `${order.items.length} items added to cart`,
      description: `From order ${order.order_number}`,
      variant: 'success',
    });
    router.push('/order');
  }

  function favToCart(p: Product) {
    addToCart({
      product_id: p.id, description: p.description, category: p.category,
      pkg_size: p.pkg_size, uom: p.uom, price: p.price, quantity: 1,
    });
    toast({ title: 'Added to cart', description: p.description, variant: 'success', duration: 1500 });
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-brand-green" />
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
            Continue as guest →
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

        {/* ── PAST ORDERS ── */}
        {tab === 'orders' && (
          ordersLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-green" /></div>
          ) : orders.length === 0 ? (
            <div className="card-base p-10 text-center">
              <Package className="w-10 h-10 text-brand-green/20 mx-auto mb-3" />
              <p className="text-brand-green/60 font-semibold mb-1">No orders yet</p>
              <p className="text-brand-green/40 text-sm mb-4">Orders placed while signed in will appear here.</p>
              <Link href="/catalog" className="btn-primary inline-flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Start Shopping
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.id} className="card-base p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-brand-green">{order.order_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${STATUS_STYLES[order.status] || ''}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-brand-green/70 truncate">
                      {order.company_name} · {formatDate(order.created_at)}
                    </p>
                    <p className="text-xs text-brand-green/40 mt-0.5">
                      {order.items?.length || 0} line items · <span className="font-bold text-brand-green">{formatCurrency(order.subtotal)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => repeatOrder(order)}
                      className="flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-3.5 py-2 rounded-full hover:bg-brand-ored transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Repeat Order
                    </button>
                    <a href={`/api/orders/${order.id}/pdf`} target="_blank"
                      className="flex items-center gap-1 text-xs text-brand-green/50 hover:text-brand-green font-semibold transition-colors">
                      Details <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── FAVORITES ── */}
        {tab === 'favorites' && (
          favsLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-green" /></div>
          ) : favorites.length === 0 ? (
            <div className="card-base p-10 text-center">
              <Star className="w-10 h-10 text-brand-green/20 mx-auto mb-3" />
              <p className="text-brand-green/60 font-semibold mb-1">No favorites yet</p>
              <p className="text-brand-green/40 text-sm mb-4">
                Tap the ★ on any product in the catalog to save it here for quick reordering.
              </p>
              <Link href="/catalog" className="btn-primary inline-flex items-center gap-2">Browse Catalog</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {favorites.map(p => (
                <div key={p.id} className="card-base p-3.5 flex items-center gap-3">
                  <button onClick={async () => { await removeFavorite(p.id); loadFavorites(); }}
                    className="text-brand-orange shrink-0" aria-label="Remove from favorites">
                    <Star className="w-5 h-5 fill-brand-orange" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-green text-sm truncate">{p.description}</p>
                    <p className="text-xs text-brand-green/40">
                      {p.category}{p.pkg_size ? ` · ${p.pkg_size}` : ''} · <span className="font-bold text-brand-green">{formatCurrency(p.price)}</span>
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

        {/* ── PROFILE ── */}
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
