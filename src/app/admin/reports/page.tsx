'use client';
// src/app/admin/reports/page.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, RefreshCw, Download, FileText, TrendingUp, ShoppingBag,
  DollarSign, Package,
  Calendar, Star, Repeat,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fetchAdminSession, getAdminRole, canAccess, adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';

interface Stats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalItemsSold: number;
  repeatCustomerRate: number;
  avgOrderSize: number;
}
interface TrendPoint { date: string; revenue: number; orders: number; }
interface TopProduct { rank: number; description: string; category: string; qty: number; revenue: number; pct: number; }
interface CategoryRevenue { category: string; revenue: number; pct: number; }
interface VesselOrder {
  id: string; order_number: string; subtotal: number; status: string; created_at: string;
  items: Array<{ description: string; category: string; quantity: number; unit_price: number; line_total: number }>;
}
interface Vessel {
  company_name: string; contact_name: string; phone: string;
  orderCount: number; totalSpent: number; avgOrderValue: number;
  mostOrdered: Array<{ description: string; qty: number }>;
  orders: VesselOrder[];
}
interface ReportData {
  stats: Stats;
  revenueTrend: TrendPoint[];
  topProducts: TopProduct[];
  revenueByCategory: CategoryRevenue[];
  vessels: Vessel[];
}

const PRESETS = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_30', label: 'Last 30 Days' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
] as const;

type PresetKey = typeof PRESETS[number]['key'];

const PIE_COLORS = ['#1E3D1E', '#E8640A', '#7B61FF', '#D9E84A', '#2196F3', '#C0392B', '#2ECC71', '#F4C2C2', '#34495E', '#F39C12'];

function getPresetRange(preset: PresetKey, customFrom?: string, customTo?: string): { from: string; to: string; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (preset) {
    case 'this_week': {
      const day = now.getDay();
      const diff = now.getDate() - day;
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Week' };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Month' };
    }
    case 'last_30': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'Last 30 Days' };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Year' };
    }
    case 'custom': {
      const from = customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const to = customTo ? new Date(customTo + 'T23:59:59').toISOString() : today.toISOString();
      return { from, to, label: 'Custom Range' };
    }
  }
}

export default function ReportsPage() {
  const router = useRouter();
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);

  const [preset, setPreset] = useState<PresetKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [productCategoryFilter, setProductCategoryFilter] = useState('All');

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'reports')) { setDenied(true); return; }
      setReady(true);
    })();
  }, [router]);

  const range = useMemo(() => getPresetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchReport = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const res = await adminFetch(`/api/admin/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [ready, range.from, range.to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function exportCsv(type: 'orders' | 'products') {
    adminFetch(`/api/admin/reports/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&type=${type}`).then(async res => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function exportPdf() {
    const params = new URLSearchParams({ from: range.from, to: range.to, label: range.label });
    adminFetch(`/api/admin/reports/pdf?${params}`).then(async res => {
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    });
  }

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Reports are only available to Owner accounts. Contact an owner if you need this data.
      </p>
    </div>
  );

  const filteredProducts = data?.topProducts.filter(p =>
    productCategoryFilter === 'All' || p.category === productCategoryFilter
  ) || [];

  const productCategories = ['All', ...Array.from(new Set(data?.topProducts.map(p => p.category) || []))];


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Reports</h1>
          <p className="text-gray-400 text-sm">Business performance &amp; analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchReport} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportPdf} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      <div className="card-base p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                preset === p.key ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="input-base text-xs py-1.5 w-36" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="input-base text-xs py-1.5 w-36" />
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {new Date(range.from).toLocaleDateString()} – {new Date(range.to).toLocaleDateString()}
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-river" />
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={DollarSign} label="Total Revenue" value={formatCurrency(data.stats.totalRevenue)} color="green" />
            <StatCard icon={ShoppingBag} label="Total Orders" value={data.stats.totalOrders.toString()} color="blue" />
            <StatCard icon={TrendingUp} label="Avg Order Value" value={formatCurrency(data.stats.avgOrderValue)} color="orange" />
            <StatCard icon={Package} label="Items Sold" value={data.stats.totalItemsSold.toString()} color="purple" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MiniStat icon={Repeat} label="Repeat Customer Rate" value={`${data.stats.repeatCustomerRate}%`}
              sub="Vessels with 2+ orders" />
            <MiniStat icon={Package} label="Avg Items / Order" value={data.stats.avgOrderSize.toString()}
              sub="Average order size" />
            <MiniStat icon={Star} label="Active Vessels" value={data.vessels.length.toString()}
              sub="Unique vessels/companies" />
          </div>

          <div className="card-base p-5">
            <h2 className="font-display font-bold text-brand-navy mb-4">Revenue Trend</h2>
            {data.revenueTrend.length === 0 ? (
              <EmptyState text="No orders in this date range" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }}
                    tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip
                    formatter={(value: number, name: string) => name === 'revenue' ? [formatCurrency(value), 'Revenue'] : [value, 'Orders']}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#1E3D1E" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-base p-5">
              <h2 className="font-display font-bold text-brand-navy mb-4">Revenue by Category</h2>
              {data.revenueByCategory.length === 0 ? (
                <EmptyState text="No data for this period" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.revenueByCategory} dataKey="revenue" nameKey="category"
                      cx="50%" cy="50%" outerRadius={90} label={({ pct }) => `${pct}%`}>
                      {data.revenueByCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-base p-5">
              <h2 className="font-display font-bold text-brand-navy mb-4">Top 10 Products by Revenue</h2>
              {data.topProducts.length === 0 ? (
                <EmptyState text="No data for this period" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.topProducts.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="description" width={140}
                      tick={{ fontSize: 10 }}
                      tickFormatter={d => d.length > 18 ? d.slice(0, 18) + '…' : d} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="revenue" fill="#E8640A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card-base overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display font-bold text-brand-navy">Top Products</h2>
              <div className="flex items-center gap-2">
                <select value={productCategoryFilter} onChange={e => setProductCategoryFilter(e.target.value)}
                  className="input-base text-xs py-1.5 w-44">
                  {productCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => exportCsv('products')} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
            {filteredProducts.length === 0 ? (
              <div className="p-10"><EmptyState text="No products match this filter" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Rank', 'Product', 'Category', 'Qty Sold', 'Revenue', '% of Total'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProducts.slice(0, 50).map(p => (
                      <tr key={p.rank} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.rank}</td>
                        <td className="px-4 py-2.5 font-semibold text-brand-navy">{p.description}</td>
                        <td className="px-4 py-2.5 text-xs text-brand-river">{p.category}</td>
                        <td className="px-4 py-2.5">{p.qty}</td>
                        <td className="px-4 py-2.5 font-bold text-brand-navy">{formatCurrency(p.revenue)}</td>
                        <td className="px-4 py-2.5 text-gray-400">{p.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card-base p-4 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">Export the full order list for this date range.</p>
            <button onClick={() => exportCsv('orders')} className="btn-primary text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Orders CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: 'green' | 'blue' | 'orange' | 'purple' }) {
  const colors = {
    green:  'bg-green-50 text-green-600',
    blue:   'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-brand-orange',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="card-base p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-brand-navy font-display">{value}</p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="card-base p-4 flex items-center gap-3">
      <div className="w-9 h-9 bg-brand-sand/40 rounded-full flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-brand-green" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-brand-navy font-display leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
      {text}
    </div>
  );
}
