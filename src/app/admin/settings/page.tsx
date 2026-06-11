'use client';
// src/app/admin/settings/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Eye, EyeOff, Plus, Trash2, UserPlus, ShieldCheck, User, Lock, ScrollText, Search, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { ADMIN_TOKEN_KEY, getAdminRole, canAccess, adminHeaders } from '@/lib/admin-auth';
import { formatDate } from '@/lib/utils';

interface AdminUser {
  id: string;
  username: string;
  role: 'owner' | 'manager' | 'staff';
  display_name: string;
  is_active: boolean;
  last_login: string | null;
}

interface Settings {
  business_email: string;
  order_email_cc: string;
  order_email_subject: string;
  tax_rate: number;
  tax_enabled: boolean;
  draft_orders_enabled: boolean;
  repeat_orders_enabled: boolean;
}

interface ActivityLog {
  id: string;
  order_id: string | null;
  order_number: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  admin_username: string | null;
  admin_display_name: string | null;
  admin_role: string | null;
  created_at: string;
}

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };
const ROLE_COLORS = {
  owner: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  staff: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'logs' | 'general' | 'password' | 'users' | 'email' | 'features'>('general');
  const [settings, setSettings] = useState<Settings>({
    business_email: 'GraftonTowboatServices@gmail.com',
    order_email_cc: '',
    order_email_subject: 'New Order #{order_number} — {company_name}',
    tax_rate: 0, tax_enabled: false,
    draft_orders_enabled: false, repeat_orders_enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Admin users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'staff', display_name: '' });
  const [addingUser, setAddingUser] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  // Activity logs
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSearch, setLogsSearch] = useState('');
  const LOGS_PER_PAGE = 25;

  const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' : '';
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) { router.push('/admin'); return; }
    const role = getAdminRole();
    if (!canAccess(role, 'settings')) { setDenied(true); return; }
    loadSettings();
    loadUsers();
  }, [router]);

  async function loadSettings() {
    setLoading(true);
    const res = await fetch('/api/admin/settings', { headers: { 'x-admin-token': adminToken } });
    if (res.ok) {
      const data = await res.json();
      setSettings(s => ({ ...s, ...data }));
    }
    setLoading(false);
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users', { headers: { 'x-admin-token': adminToken } });
    if (res.ok) setUsers(await res.json());
  }

  async function loadLogs() {
    setLogsLoading(true);
    const params = new URLSearchParams({
      page: String(logsPage),
      per_page: String(LOGS_PER_PAGE),
      ...(logsSearch ? { search: logsSearch } : {}),
    });
    const res = await fetch(`/api/admin/logs?${params}`, { headers: adminHeaders() });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsTotal(data.total || 0);
    }
    setLogsLoading(false);
  }

  useEffect(() => {
    if (tab === 'logs' && !denied) loadLogs();
  }, [tab, logsPage, logsSearch]);

  async function saveSettings() {
    setSaving(true); setSaveMsg('');
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) { setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 3000); }
    else { setSaveMsg('Error saving — try again'); }
  }

  async function changePassword() {
    setPwError(''); setPwMsg('');
    if (!currentPw) { setPwError('Enter your current password'); return; }
    if (newPw.length < 4) { setPwError('New password must be at least 4 characters'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    setSavingPw(true);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    });
    setSavingPw(false);
    if (res.ok) {
      setPwMsg('✓ Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else {
      const err = await res.json();
      setPwError(err.error || 'Failed to change password');
    }
  }

  async function addUser() {
    if (!newUser.username || !newUser.password) return;
    setAddingUser(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ ...newUser, display_name: newUser.display_name || newUser.username }),
    });
    if (res.ok) {
      const u = await res.json();
      setUsers(us => [...us, u]);
      setNewUser({ username: '', password: '', role: 'staff', display_name: '' });
      setShowAddUser(false);
    }
    setAddingUser(false);
  }

  async function toggleUser(u: AdminUser) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    if (res.ok) setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this admin user?')) return;
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ id }),
    });
    setUsers(us => us.filter(u => u.id !== id));
  }

  const tabs = [
    { key: 'logs', label: 'Logs' },
    { key: 'general', label: 'General' },
    { key: 'password', label: 'Password' },
    { key: 'users', label: 'Admin Users' },
    { key: 'email', label: 'Email' },
    { key: 'features', label: 'Features' },
  ] as const;

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Only Owners can access Settings. Contact an owner if you need changes made here.
      </p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <RefreshCw className="w-6 h-6 animate-spin text-brand-river" />
    </div>
  );

  return (
    <div className={`mx-auto px-4 py-8 ${tab === 'logs' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy font-display">Settings</h1>
          <p className="text-gray-400 text-sm mt-0.5">Configure your ordering system</p>
        </div>
        {tab !== 'password' && tab !== 'users' && tab !== 'logs' && (
          <button onClick={saveSettings} disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saveMsg || (saving ? 'Saving…' : 'Save Changes')}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-xl p-1 mb-6 shadow-sm border border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-brand-navy text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LOGS ── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="card-base overflow-hidden">
            <div className="bg-brand-navy px-6 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-brand-yellow" />
                <h2 className="text-white font-bold">Activity Log</h2>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                <input
                  type="search"
                  placeholder="Search order #, user…"
                  value={logsSearch}
                  onChange={e => { setLogsPage(1); setLogsSearch(e.target.value); }}
                  className="bg-white/10 text-white placeholder:text-white/40 text-xs rounded-full pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-brand-yellow"
                />
              </div>
            </div>

            {logsLoading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-5 h-5 animate-spin text-brand-river" />
              </div>
            ) : logs.length === 0 ? (
              <div className="p-10 text-center">
                <ScrollText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">No activity yet</p>
                <p className="text-xs text-gray-300 mt-1">
                  Order status changes made by admin users will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {logs.map(log => (
                  <div key={log.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-brand-steel/10 rounded-full flex items-center justify-center font-bold text-brand-steel text-xs shrink-0">
                        {(log.admin_display_name || log.admin_username || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-brand-navy">
                          <span className="font-semibold">{log.admin_display_name || log.admin_username || 'Unknown'}</span>
                          {log.admin_role && (
                            <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase ${ROLE_COLORS[log.admin_role as keyof typeof ROLE_COLORS] || ''}`}>
                              {ROLE_LABELS[log.admin_role as keyof typeof ROLE_LABELS] || log.admin_role}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          Order <span className="font-mono font-semibold text-gray-500">{log.order_number}</span>
                          {log.from_value && log.to_value && (
                            <span className="inline-flex items-center gap-1 ml-1.5">
                              <span className="capitalize">{log.from_value.replace('_', ' ')}</span>
                              <ArrowRight className="w-3 h-3" />
                              <span className="capitalize font-semibold text-brand-navy">{log.to_value.replace('_', ' ')}</span>
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">{formatDate(log.created_at)}</p>
                      <p className="text-[11px] text-gray-300">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {logsTotal > LOGS_PER_PAGE && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">
                  Showing {((logsPage - 1) * LOGS_PER_PAGE) + 1}–{Math.min(logsPage * LOGS_PER_PAGE, logsTotal)} of {logsTotal}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLogsPage(p => Math.max(1, p - 1))} disabled={logsPage <= 1}
                    className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-white">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {logsPage} of {Math.ceil(logsTotal / LOGS_PER_PAGE)}
                  </span>
                  <button onClick={() => setLogsPage(p => p + 1)} disabled={logsPage * LOGS_PER_PAGE >= logsTotal}
                    className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-white">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="bg-gray-50 px-6 py-3 text-xs text-gray-400 border-t border-gray-100">
              Tracks order status changes made by admin users. Visible to Owners only.
            </div>
          </div>
        </div>
      )}

      {/* ── GENERAL ── */}
      {tab === 'general' && (
        <div className="card-base p-6 space-y-5">
          <h2 className="font-bold text-brand-navy">Business Information</h2>
          <div>
            <label className="label-base">Business Email (receives all orders)</label>
            <input type="email" className="input-base" value={settings.business_email}
              onChange={e => setSettings(s => ({ ...s, business_email: e.target.value }))} />
          </div>
          <div className="bg-brand-sand/40 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-semibold text-brand-navy mb-1">📋 Squarespace Button for your website</p>
            <p className="mb-2">Add this button to your Squarespace site to link customers to the ordering app:</p>
            <p className="font-semibold mb-1">Button text:</p>
            <code className="bg-white rounded px-2 py-1 text-xs block mb-2">Order Groceries & Supplies</code>
            <p className="font-semibold mb-1">Button URL:</p>
            <code className="bg-white rounded px-2 py-1 text-xs block break-all">
              {process.env.NEXT_PUBLIC_APP_URL || 'https://grafton-towboatsrepo.vercel.app'}/catalog
            </code>
          </div>
        </div>
      )}

      {/* ── PASSWORD ── */}
      {tab === 'password' && (
        <div className="card-base p-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-6 h-6 text-brand-river" />
            <div>
              <h2 className="font-bold text-brand-navy">Change Admin Password</h2>
              <p className="text-xs text-gray-400">No redeployment required — change takes effect immediately</p>
            </div>
          </div>
          <div>
            <label className="label-base">Current Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="input-base pr-10"
                value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                placeholder="Enter your current password" />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label-base">New Password</label>
            <input type={showPw ? 'text' : 'password'} className="input-base"
              value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="At least 4 characters" />
          </div>
          <div>
            <label className="label-base">Confirm New Password</label>
            <input type={showPw ? 'text' : 'password'} className="input-base"
              value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              placeholder="Repeat new password" />
          </div>
          {pwError && <p className="text-red-500 text-sm bg-red-50 rounded p-3">{pwError}</p>}
          {pwMsg && <p className="text-green-600 text-sm bg-green-50 rounded p-3 font-semibold">{pwMsg}</p>}
          <button onClick={changePassword} disabled={savingPw}
            className="btn-primary flex items-center gap-2">
            {savingPw ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      )}

      {/* ── ADMIN USERS ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="card-base overflow-hidden">
            <div className="bg-brand-navy px-6 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold">Admin Users</h2>
              <button onClick={() => setShowAddUser(s => !s)}
                className="flex items-center gap-1.5 bg-brand-gold text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full hover:bg-brand-amber transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Add User
              </button>
            </div>

            {/* Add user form */}
            {showAddUser && (
              <div className="border-b border-gray-100 p-6 bg-green-50">
                <h3 className="font-bold text-brand-navy text-sm mb-4">New Admin User</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="label-base">Username</label>
                    <input className="input-base" placeholder="e.g. jennifer" value={newUser.username}
                      onChange={e => setNewUser(u => ({ ...u, username: e.target.value.toLowerCase() }))} />
                  </div>
                  <div>
                    <label className="label-base">Display Name</label>
                    <input className="input-base" placeholder="e.g. Jennifer" value={newUser.display_name}
                      onChange={e => setNewUser(u => ({ ...u, display_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label-base">Password</label>
                    <input type="password" className="input-base" placeholder="At least 4 characters"
                      value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label-base">Role</label>
                    <select className="input-base" value={newUser.role}
                      onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                      <option value="owner">Owner — Full access</option>
                      <option value="manager">Manager — Orders + Products</option>
                      <option value="staff">Staff — Orders only</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addUser} disabled={addingUser || !newUser.username || !newUser.password}
                    className="btn-primary text-sm flex items-center gap-2">
                    {addingUser ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add User
                  </button>
                  <button onClick={() => setShowAddUser(false)} className="btn-outline text-sm">Cancel</button>
                </div>
              </div>
            )}

            {users.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No admin users yet. Add one above.</p>
                <p className="text-xs mt-1">The default owner login uses your ADMIN_PASSWORD env var.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {users.map(u => (
                  <div key={u.id} className={`px-6 py-4 flex items-center justify-between gap-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-brand-steel/10 rounded-full flex items-center justify-center font-bold text-brand-steel text-sm">
                        {(u.display_name || u.username)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-brand-navy text-sm">{u.display_name || u.username}</p>
                        <p className="text-xs text-gray-400">@{u.username} · {u.last_login ? `Last login ${new Date(u.last_login).toLocaleDateString()}` : 'Never logged in'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      <button onClick={() => toggleUser(u)}
                        className="text-xs text-gray-400 hover:text-brand-river transition-colors">
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteUser(u.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-gray-50 px-6 py-3 text-xs text-gray-400 border-t border-gray-100">
              Role permissions: Owner = all access · Manager = orders + products · Staff = orders only (read)
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL ── */}
      {tab === 'email' && (
        <div className="card-base p-6 space-y-5">
          <h2 className="font-bold text-brand-navy">Email Notifications</h2>
          <div>
            <label className="label-base">Order Notification Email</label>
            <input type="email" className="input-base" value={settings.business_email}
              onChange={e => setSettings(s => ({ ...s, business_email: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">All orders will be sent to this address</p>
          </div>
          <div>
            <label className="label-base">CC Email (optional)</label>
            <input type="text" className="input-base" value={settings.order_email_cc}
              onChange={e => setSettings(s => ({ ...s, order_email_cc: e.target.value }))}
              placeholder="second@email.com, third@email.com" />
          </div>
          <div>
            <label className="label-base">Email Subject Template</label>
            <input type="text" className="input-base" value={settings.order_email_subject}
              onChange={e => setSettings(s => ({ ...s, order_email_subject: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">
              Variables: <code className="bg-gray-100 px-1 rounded">{'{order_number}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{company_name}'}</code>
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-sm">
            <p className="font-semibold text-blue-800 mb-2">📧 Email Setup (Resend + Gmail)</p>
            <p className="text-blue-700 text-xs leading-relaxed">
              To send order emails directly to <strong>GraftonTowboatServices@gmail.com</strong>:
              <br />1. In Resend dashboard → Domains → Add Domain
              <br />2. Add your domain (or use a subdomain of your Squarespace site)
              <br />3. Resend provides DNS records — add them in Squarespace: Settings → Domains → DNS
              <br />4. Update EMAIL_FROM in Vercel environment variables
              <br />5. Update BUSINESS_EMAIL to GraftonTowboatServices@gmail.com
            </p>
          </div>
        </div>
      )}

      {/* ── FEATURES ── */}
      {tab === 'features' && (
        <div className="card-base p-6 space-y-4">
          <h2 className="font-bold text-brand-navy">Feature Toggles</h2>
          {[
            { key: 'repeat_orders_enabled' as const, label: 'Repeat Last Order', desc: 'Let customers quickly re-add all items from their previous order' },
            { key: 'draft_orders_enabled' as const, label: 'Save Draft Orders', desc: 'Allow customers to save and resume orders later' },
            { key: 'tax_enabled' as const, label: 'Enable Tax', desc: 'Apply tax rate to order totals' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
              <div>
                <p className="font-semibold text-brand-navy text-sm">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <button onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  settings[key] ? 'bg-brand-river' : 'bg-gray-200'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                  settings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
          {settings.tax_enabled && (
            <div>
              <label className="label-base">Tax Rate (%)</label>
              <input type="number" min="0" max="30" step="0.1" className="input-base w-32"
                value={settings.tax_rate}
                onChange={e => setSettings(s => ({ ...s, tax_rate: parseFloat(e.target.value) || 0 }))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
