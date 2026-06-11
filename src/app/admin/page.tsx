'use client';
// src/app/admin/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, Clock, CheckCircle2, TrendingUp,
  ShoppingBag, Lock, Eye, EyeOff, Loader2
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { setAdminUiState, fetchAdminSession, adminFetch } from '@/lib/admin-auth';

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null = checking
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [logging, setLogging] = useState(false);
  const [stats, setStats] = useState<null | {
    total: number;
    new: number;
    in_progress: number;
    fulfilled: number;
    total_revenue: number;
    recent: Array<{ order_number: string; company_name: string; subtotal: number; status: string; created_at: string }>;
  }>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      setLoggedIn(!!session);
      if (session) fetchStats();
    })();
  }, []);

  async function handleLogin() {
    setLogging(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username.trim() ? { username: username.trim(), password } : { password }),
      });
      if (!res.ok) {
        setLoginError(username.trim() ? 'Invalid username or password.' : 'Incorrect password. Please try again.');
        return;
      }
      const { user } = await res.json();
      setAdminUiState(user?.role || 'owner', user?.display_name || user?.username || 'Admin', user?.username || 'admin');
      // Full reload so AdminNav (and everything else) re-initializes with the new session/role
      window.location.href = '/admin';
    } finally {
      setLogging(false);
    }
  }

  async function fetchStats() {
    const res = await adminFetch('/api/admin/stats');
    if (res.ok) setStats(await res.json());
    else setLoggedIn(false);
  }

  // Not logged in
  if (loggedIn === null) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="card-base w-full max-w-sm p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-brand-navy rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-brand-gold" />
            </div>
            <h1 className="font-display text-xl font-bold text-brand-navy">Admin Login</h1>
            <p className="text-gray-400 text-sm mt-1">Grafton Towboat Services</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label-base">Username <span className="text-gray-400 font-normal normal-case">(leave blank for default login)</span></label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. jennifer"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div>
              <label className="label-base">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-base pr-10"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginError && <p className="text-red-500 text-xs mt-1">{loginError}</p>}
            </div>
            <button
              onClick={handleLogin}
              disabled={logging || !password}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {logging ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-brand-navy">Dashboard</h1>
        <p className="text-gray-400 text-sm">Grafton Towboat Services · Order Management</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Orders"
              value={stats.total}
              icon={<ShoppingBag className="w-5 h-5 text-brand-steel" />}
              color="bg-blue-50"
            />
            <StatCard
              label="New"
              value={stats.new}
              icon={<Package className="w-5 h-5 text-blue-500" />}
              color="bg-blue-50"
              action={() => router.push('/admin/orders?status=new')}
            />
            <StatCard
              label="In Progress"
              value={stats.in_progress}
              icon={<Clock className="w-5 h-5 text-yellow-500" />}
              color="bg-yellow-50"
              action={() => router.push('/admin/orders?status=in_progress')}
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(stats.total_revenue)}
              icon={<TrendingUp className="w-5 h-5 text-green-500" />}
              color="bg-green-50"
              isString
            />
          </div>

          {/* Recent orders */}
          <div className="card-base overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-brand-navy">Recent Orders</h2>
              <button
                onClick={() => router.push('/admin/orders')}
                className="text-brand-river text-sm hover:underline"
              >
                View All →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Order</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Vessel</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recent.map(order => (
                    <tr
                      key={order.order_number}
                      className="admin-row cursor-pointer"
                      onClick={() => router.push(`/admin/orders?search=${order.order_number}`)}
                    >
                      <td className="px-4 py-3 font-mono text-sm font-bold text-brand-navy">
                        {order.order_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{order.company_name}</td>
                      <td className="px-4 py-3 text-sm font-bold">{formatCurrency(order.subtotal)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, color, action, isString,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  action?: () => void;
  isString?: boolean;
}) {
  return (
    <div
      className={`card-base p-4 ${action ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={action}
    >
      <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-display text-2xl font-bold text-brand-navy">
        {isString ? value : value.toLocaleString()}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    fulfilled: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    new: 'New',
    in_progress: 'In Progress',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
  };
  return (
    <span className={`status-badge ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}
