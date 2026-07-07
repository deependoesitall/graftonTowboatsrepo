'use client';
// src/app/admin/settings/page.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Eye, EyeOff, Plus, Trash2, UserPlus, ShieldCheck, User, Lock, ScrollText, Search, ArrowRight, ChevronLeft, ChevronRight, MessageSquarePlus, Check, X, Loader2, Send, Wrench } from 'lucide-react';
import { fetchAdminSession, getAdminRole, canAccess, adminFetch, AdminRole } from '@/lib/admin-auth';
import { formatDate } from '@/lib/utils';

interface AdminUser {
  id: string;
  username: string;
  role: 'owner' | 'manager' | 'staff';
  display_name: string;
  is_active: boolean;
  last_login: string | null;
  permissions: string[];
}

interface Settings {
  business_email: string;
  order_email_cc: string;
  order_email_subject: string;
  tax_rate: number;
  tax_enabled: boolean;
  draft_orders_enabled: boolean;
  repeat_orders_enabled: boolean;
  email_debug_enabled: boolean;
  email_header_tagline: string;
  email_intro_message: string;
  email_footer_text: string;
  email_button_text: string;
  email_button_url: string;
  weekly_ad_url: string;
  grocery_cutoff_hours: number;
  service_cutoff_hours: number;
}

interface Coupon {
  id: string;
  name: string;
  description: string | null;
  discount_type: 'amount' | 'percent' | 'other';
  discount_value: number | null;
  discount_text: string | null;
  applies_to: 'all' | 'category' | 'products';
  category: string | null;
  product_ids: string[];
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
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
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  po_number: string | null;
  note: string | null;
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
  const [tab, setTab] = useState<'logs' | 'general' | 'sinclair' | 'password' | 'users' | 'email' | 'features'>('general');
  const [settings, setSettings] = useState<Settings>({
    business_email: 'GraftonTowboatServices@gmail.com',
    order_email_cc: '',
    order_email_subject: 'New Order #{order_number} — {company_name}',
    tax_rate: 0, tax_enabled: false,
    draft_orders_enabled: false, repeat_orders_enabled: true,
    email_debug_enabled: false,
    email_header_tagline: 'New Order Received',
    email_intro_message: '',
    email_footer_text: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290',
    email_button_text: 'Order Dashboard',
    email_button_url: '/admin/orders',
    weekly_ad_url: '',
    grocery_cutoff_hours: 4,
    service_cutoff_hours: 2,
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
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'staff', display_name: '', permissions: [] as string[] });
  const [addingUser, setAddingUser] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  // Activity logs
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSearch, setLogsSearch] = useState('');
  const LOGS_PER_PAGE = 25;
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Test email
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; error?: string; hint?: string; from?: string; to?: string } | null>(null);

  // Email template preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [denied, setDenied] = useState(false);
  const [sessionRole, setSessionRole] = useState<AdminRole | null>(null);

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'settings')) { setDenied(true); return; }
      setSessionRole(session.role);
      // Managers only see the Sinclair tools + their own password.
      // The server scopes the settings API the same way.
      if (session.role === 'manager') setTab('sinclair');
      if (session.role === 'owner') loadUsers();
      loadSettings();
    })();
  }, [router]);

  async function loadSettings() {
    setLoading(true);
    const res = await adminFetch('/api/admin/settings');
    if (res.ok) {
      const data = await res.json();
      setSettings(s => ({ ...s, ...data }));
    }
    setLoading(false);
  }

  async function loadUsers() {
    const res = await adminFetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
  }

  async function loadLogs() {
    setLogsLoading(true);
    const params = new URLSearchParams({
      page: String(logsPage),
      per_page: String(LOGS_PER_PAGE),
      ...(logsSearch ? { search: logsSearch } : {}),
    });
    const res = await adminFetch(`/api/admin/logs?${params}`);
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

  async function loadEmailPreview() {
    setPreviewLoading(true);
    try {
      const res = await adminFetch('/api/admin/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_email_subject: settings.order_email_subject,
          email_header_tagline: settings.email_header_tagline,
          email_intro_message: settings.email_intro_message,
          email_footer_text: settings.email_footer_text,
          email_button_text: settings.email_button_text,
          email_button_url: settings.email_button_url,
        }),
      });
      setPreviewHtml(await res.text());
      setShowPreview(true);
    } catch {}
    setPreviewLoading(false);
  }

  async function sendTestEmail() {
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await adminFetch('/api/admin/test-email', {
        method: 'POST',
      });
      setTestEmailResult(await res.json());
    } catch (err: any) {
      setTestEmailResult({ ok: false, error: err?.message || 'Request failed' });
    }
    setTestingEmail(false);
  }

  async function saveLogNote(logId: string) {
    setSavingNoteId(logId);
    const res = await adminFetch('/api/admin/logs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logId, note: noteDraft }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, note: updated.note } : l));
      setEditingNoteId(null);
    }
    setSavingNoteId(null);
  }

  async function saveSettings() {
    setSaving(true); setSaveMsg('');
    // Managers may only save the Sinclair-owned fields — the server enforces
    // this too, but sending owner-only fields would 403 the whole request.
    const payload = sessionRole === 'manager'
      ? {
          weekly_ad_url: settings.weekly_ad_url,
          grocery_cutoff_hours: settings.grocery_cutoff_hours,
          service_cutoff_hours: settings.service_cutoff_hours,
        }
      : settings;
    const res = await adminFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 3000); }
    else {
      let msg = 'Error saving — try again';
      try {
        const err = await res.json();
        if (err?.error) msg = `Error: ${err.error}`;
      } catch {}
      setSaveMsg(msg);
      console.error('Settings save failed:', res.status, msg);
    }
  }

  async function changePassword() {
    setPwError(''); setPwMsg('');
    if (!currentPw) { setPwError('Enter your current password'); return; }
    if (newPw.length < 4) { setPwError('New password must be at least 4 characters'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    setSavingPw(true);
    const res = await adminFetch('/api/admin/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await adminFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, display_name: newUser.display_name || newUser.username }),
    });
    if (res.ok) {
      const u = await res.json();
      setUsers(us => [...us, u]);
      setNewUser({ username: '', password: '', role: 'staff', display_name: '', permissions: [] });
      setShowAddUser(false);
    }
    setAddingUser(false);
  }

  async function togglePermission(u: AdminUser, permission: string) {
    const next = u.permissions.includes(permission)
      ? u.permissions.filter(p => p !== permission)
      : [...u.permissions, permission];
    const res = await adminFetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, permissions: next }),
    });
    if (res.ok) setUsers(us => us.map(x => x.id === u.id ? { ...x, permissions: next } : x));
  }

  async function toggleUser(u: AdminUser) {
    const res = await adminFetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    if (res.ok) setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this admin user?')) return;
    await adminFetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setUsers(us => us.filter(u => u.id !== id));
  }

  const allTabs = [
    { key: 'logs',     label: 'Logs',         ownerOnly: true },
    { key: 'general',  label: 'General',      ownerOnly: true },
    { key: 'sinclair', label: "Sinclair's",   ownerOnly: false },
    { key: 'password', label: 'Password',     ownerOnly: false },
    { key: 'users',    label: 'Admin Users',  ownerOnly: true },
    { key: 'email',    label: 'Email',        ownerOnly: true },
    { key: 'features', label: 'Features',     ownerOnly: true },
  ] as const;
  const tabs = sessionRole === 'manager'
    ? allTabs.filter(t => !t.ownerOnly)
    : allTabs;

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Only Owners and Managers can access Settings. Contact an owner if you need changes made here.
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
                  placeholder="Search order #, vessel, contact, PO, user…"
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
                  <div key={log.id} className="px-6 py-3.5">
                    <div className="flex items-center justify-between gap-4">
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
                          {log.action === 'order_deleted' ? (
                            <span className="inline-flex items-center gap-1 ml-1.5 text-red-500 font-semibold">
                              <Trash2 className="w-3 h-3" />
                              Deleted
                              {log.from_value && (
                                <span className="text-gray-400 font-normal capitalize">
                                  (was {log.from_value.replace('_', ' ')})
                                </span>
                              )}
                            </span>
                          ) : log.from_value && log.to_value ? (
                            <span className="inline-flex items-center gap-1 ml-1.5">
                              <span className="capitalize">{log.from_value.replace('_', ' ')}</span>
                              <ArrowRight className="w-3 h-3" />
                              <span className="capitalize font-semibold text-brand-navy">{log.to_value.replace('_', ' ')}</span>
                            </span>
                          ) : (
                            <span className="ml-1.5 capitalize">{log.action.replace('_', ' ')}</span>
                          )}
                        </p>
                        {(log.company_name || log.contact_name || log.po_number) && (
                          <p className="text-[11px] text-gray-300 truncate mt-0.5">
                            {log.company_name && <span className="font-medium text-gray-400">{log.company_name}</span>}
                            {log.contact_name && <span> · {log.contact_name}</span>}
                            {log.phone && <span> · {log.phone}</span>}
                            {log.po_number && <span> · PO #{log.po_number}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">{formatDate(log.created_at)}</p>
                      <p className="text-[11px] text-gray-300">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    </div>

                    {/* Note */}
                    <div className="mt-2 pl-11">
                      {editingNoteId === log.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveLogNote(log.id);
                              if (e.key === 'Escape') setEditingNoteId(null);
                            }}
                            placeholder="Add a note (e.g. 'deleted test orders')"
                            className="input-base text-xs py-1.5 flex-1 max-w-md"
                          />
                          <button onClick={() => saveLogNote(log.id)} disabled={savingNoteId === log.id}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50">
                            {savingNoteId === log.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => setEditingNoteId(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : log.note ? (
                        <button
                          onClick={() => { setEditingNoteId(log.id); setNoteDraft(log.note || ''); }}
                          className="text-xs text-gray-500 bg-brand-sand/30 hover:bg-brand-sand/50 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5 max-w-full text-left transition-colors"
                        >
                          <MessageSquarePlus className="w-3 h-3 mt-0.5 shrink-0 text-brand-river" />
                          <span className="truncate">{log.note}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setEditingNoteId(log.id); setNoteDraft(''); }}
                          className="text-[11px] text-gray-300 hover:text-brand-river inline-flex items-center gap-1 transition-colors"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          Add note
                        </button>
                      )}
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
              Tracks order status changes and deletions made by admin users. Search by order #, vessel/company, contact name, phone, PO number, or staff name. Visible to Owners only.
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
              {process.env.NEXT_PUBLIC_APP_URL || '(set NEXT_PUBLIC_APP_URL in Vercel)'}/catalog
            </code>
          </div>
        </div>
      )}

      {/* ── SINCLAIR'S (weekly ad, order cutoff, coupons) ── */}
      {tab === 'sinclair' && (
        <div className="space-y-6">
          <div className="card-base p-6 space-y-4">
            <h2 className="font-bold text-brand-navy">Weekly Ad</h2>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
              <p className="font-semibold mb-0.5">✓ Automatic</p>
              The current ad is pulled from shop.sinclairsfoods.com/weekly-ad each week and shown
              inline on the ordering site — customers never leave the site. Nothing to update here
              unless auto-detection stops working.
            </div>
            <div>
              <label className="label-base">Manual Override — Weekly Ad PDF URL <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
              <input type="url" className="input-base" value={settings.weekly_ad_url}
                onChange={e => setSettings(s => ({ ...s, weekly_ad_url: e.target.value }))}
                placeholder="Leave blank to auto-pull from Sinclair's website" />
              <p className="text-xs text-gray-400 mt-1">
                Only needed if the automatic pull breaks: paste the direct PDF link (right-click the
                &quot;HERE&quot; print link on Sinclair&apos;s weekly ad page → Copy Link). Clear this field to
                go back to automatic.
              </p>
            </div>
            <a href="/weekly-ad" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-river underline">
              <Eye className="w-3.5 h-3.5" /> Preview how customers see it
            </a>
          </div>

          <div className="card-base p-6 space-y-4">
            <h2 className="font-bold text-brand-navy">Order Cutoff Timer</h2>
            <p className="text-xs text-gray-400 -mt-2">
              Blocks new orders placed too close to the vessel&apos;s ETA so there&apos;s time to shop and
              deliver. We recommend at least 4 hours for grocery orders. Set to 0 to disable.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-base">Grocery Orders — hours before ETA</label>
                <input type="number" min="0" step="0.5" className="input-base w-32"
                  value={settings.grocery_cutoff_hours}
                  onChange={e => setSettings(s => ({ ...s, grocery_cutoff_hours: parseFloat(e.target.value) || 0 }))} />
                {settings.grocery_cutoff_hours > 0 && settings.grocery_cutoff_hours < 4 && (
                  <p className="text-xs text-amber-600 mt-1">Below the recommended 4-hour minimum.</p>
                )}
              </div>
              <div>
                <label className="label-base">Crew Change / Services Only — hours before ETA</label>
                <input type="number" min="0" step="0.5" className="input-base w-32"
                  value={settings.service_cutoff_hours}
                  onChange={e => setSettings(s => ({ ...s, service_cutoff_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <CouponsManager />
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
                      onChange={e => {
                        const role = e.target.value;
                        setNewUser(u => ({
                          ...u,
                          role,
                          // Managers here are Sinclair's staff — pre-check their access flag
                          permissions: role === 'manager' && !u.permissions.includes('sinclair')
                            ? [...u.permissions, 'sinclair']
                            : u.permissions,
                        }));
                      }}>
                      <option value="owner">Owner — Full access</option>
                      <option value="manager">Sinclair&apos;s Manager — products, orders, weekly ad, coupons</option>
                      <option value="staff">Staff — Orders only</option>
                    </select>
                    {newUser.role === 'manager' && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Managers see: Sinclair-filtered orders, the full product catalog + import,
                        weekly ad &amp; coupon management, and their own password. Nothing else.
                      </p>
                    )}
                  </div>
                </div>
                {/* Permissions */}
                <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Permissions</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-0.5"
                      checked={newUser.permissions.includes('sinclair')}
                      onChange={e => setNewUser(u => ({
                        ...u,
                        permissions: e.target.checked
                          ? [...u.permissions, 'sinclair']
                          : u.permissions.filter(p => p !== 'sinclair'),
                      }))} />
                    <div>
                      <p className="text-sm font-semibold text-brand-navy">Sinclair Foods Access</p>
                      <p className="text-xs text-gray-400 mt-0.5">Scopes the order list and shopping to grocery items only — crew change and service-only orders are hidden. Combine with the Sinclair&apos;s Manager role for Dave&apos;s team.</p>
                    </div>
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
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
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      {u.permissions?.includes('sinclair') && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                          Sinclair
                        </span>
                      )}
                      <button
                        onClick={() => togglePermission(u, 'sinclair')}
                        title={u.permissions?.includes('sinclair') ? 'Remove Sinclair access' : 'Grant Sinclair access'}
                        className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                      >
                        {u.permissions?.includes('sinclair') ? '− Sinclair' : '+ Sinclair'}
                      </button>
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
              Roles: Owner = all access · Sinclair&apos;s Manager = orders + products + weekly ad + coupons + own password · Staff = orders only
              <span className="ml-3 text-emerald-600">Sinclair permission = scopes order view to grocery items only</span>
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

          <div className="border-t border-gray-100 pt-5">
            <h2 className="font-bold text-brand-navy mb-1">Email Template</h2>
            <p className="text-xs text-gray-400 mb-4">Customize the order notification email sent to staff and owners.</p>

            <div className="space-y-4">
              <div>
                <label className="label-base">Subject Line</label>
                <input type="text" className="input-base" value={settings.order_email_subject}
                  onChange={e => setSettings(s => ({ ...s, order_email_subject: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">What appears in the inbox before the email is opened.</p>
              </div>

              <div>
                <label className="label-base">Banner Text</label>
                <input type="text" className="input-base" value={settings.email_header_tagline}
                  onChange={e => setSettings(s => ({ ...s, email_header_tagline: e.target.value }))}
                  placeholder="New Order Received" />
                <p className="text-xs text-gray-400 mt-1">Shown inside the email, just below the company name in the green header.</p>
              </div>

              <div>
                <label className="label-base">Intro Message <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                <textarea className="input-base" rows={3} value={settings.email_intro_message}
                  onChange={e => setSettings(s => ({ ...s, email_intro_message: e.target.value }))}
                  placeholder="e.g. Thanks for your order! Our team will start preparing it shortly." />
                <p className="text-xs text-gray-400 mt-1">A short message shown above the order details. Leave blank to omit.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-base">Button Text</label>
                  <input type="text" className="input-base" value={settings.email_button_text}
                    onChange={e => setSettings(s => ({ ...s, email_button_text: e.target.value }))}
                    placeholder="Order Dashboard" />
                </div>
                <div>
                  <label className="label-base">Button Link</label>
                  <input type="text" className="input-base" value={settings.email_button_url}
                    onChange={e => setSettings(s => ({ ...s, email_button_url: e.target.value }))}
                    placeholder="/admin/orders" />
                  <p className="text-xs text-gray-400 mt-1">Use a path like <code className="bg-gray-100 px-1 rounded">/admin/orders</code> or a full URL.</p>
                </div>
              </div>

              <div>
                <label className="label-base">Footer Text</label>
                <input type="text" className="input-base" value={settings.email_footer_text}
                  onChange={e => setSettings(s => ({ ...s, email_footer_text: e.target.value }))} />
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Available Variables</p>
                <div className="flex flex-wrap gap-1.5">
                  {['{order_number}', '{company_name}', '{contact_name}', '{phone}', '{po_number}', '{eta}', '{order_total}', '{item_count}', '{order_date}'].map(v => (
                    <code key={v} className="bg-white border border-gray-200 px-1.5 py-0.5 rounded text-[11px] text-brand-navy">{v}</code>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Use these in the subject, header tagline, intro message, footer, button text, or button link — they'll be replaced with the order's actual details.
                </p>
              </div>

              <button onClick={loadEmailPreview} disabled={previewLoading}
                className="btn-outline text-sm px-4 py-2 flex items-center gap-2">
                {previewLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview Email
              </button>
            </div>
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

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-brand-navy text-sm">Test Email Delivery</p>
                <p className="text-xs text-gray-400">Sends a test email to the address above and shows the exact result.</p>
              </div>
              <button onClick={sendTestEmail} disabled={testingEmail}
                className="btn-outline text-sm px-4 py-2 flex items-center gap-2">
                {testingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Test Email
              </button>
            </div>
            {testEmailResult && (
              <div className={`mt-3 rounded-lg p-3 text-xs ${testEmailResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {testEmailResult.ok ? (
                  <p>✅ Sent successfully to <strong>{testEmailResult.to}</strong> from <strong>{testEmailResult.from}</strong>. Check your inbox (and spam folder).</p>
                ) : (
                  <>
                    <p className="font-semibold mb-1">❌ {testEmailResult.error}</p>
                    {testEmailResult.from && testEmailResult.to && (
                      <p className="text-red-600">From: {testEmailResult.from} → To: {testEmailResult.to}</p>
                    )}
                    {testEmailResult.hint && <p className="mt-1 text-red-600">{testEmailResult.hint}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-brand-navy text-sm">Email Preview <span className="font-normal text-gray-400">(sample order data)</span></h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100">
              <iframe srcDoc={previewHtml} className="w-full h-full min-h-[500px] border-0" title="Email preview" />
            </div>
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
            { key: 'tax_enabled' as const, label: 'Enable Tax', desc: 'Apply sales tax to orders based on the rate below' },
            { key: 'email_debug_enabled' as const, label: 'Email Debug Mode', desc: 'Show email send results as a toast notification after each order submission (dev/testing only)' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-semibold text-brand-navy">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings[key] ? 'bg-brand-green' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
          {settings.tax_enabled && (
            <div>
              <label className="label-base">Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="input-base w-32"
                value={settings.tax_rate}
                onChange={e => setSettings(s => ({ ...s, tax_rate: parseFloat(e.target.value) || 0 }))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Coupons manager (Sinclair-owned, display-only coupons) ───
function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', discount_type: 'amount' as Coupon['discount_type'],
    discount_value: '', discount_text: '', applies_to: 'all' as Coupon['applies_to'],
    category: '', expires_at: '',
  });

  useEffect(() => {
    (async () => {
      const res = await adminFetch('/api/admin/coupons');
      if (res.ok) setCoupons(await res.json());
      setLoading(false);
    })();
  }, []);

  function startNew() {
    setEditing(null);
    setForm({ name: '', description: '', discount_type: 'amount', discount_value: '', discount_text: '', applies_to: 'all', category: '', expires_at: '' });
    setShowForm(true);
  }
  function startEdit(c: Coupon) {
    setEditing(c);
    setForm({
      name: c.name, description: c.description || '',
      discount_type: c.discount_type, discount_value: c.discount_value != null ? String(c.discount_value) : '',
      discount_text: c.discount_text || '', applies_to: c.applies_to,
      category: c.category || '', expires_at: c.expires_at || '',
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: form.discount_type === 'other' ? null : (parseFloat(form.discount_value) || 0),
      discount_text: form.discount_type === 'other' ? form.discount_text : null,
      applies_to: form.applies_to,
      category: form.applies_to === 'category' ? form.category : null,
      expires_at: form.expires_at || null,
    };
    const res = editing
      ? await adminFetch('/api/admin/coupons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      : await adminFetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      const saved = await res.json();
      setCoupons(cs => editing ? cs.map(c => c.id === saved.id ? saved : c) : [saved, ...cs]);
      setShowForm(false);
      setEditing(null);
    }
    setSaving(false);
  }

  async function toggleActive(c: Coupon) {
    const res = await adminFetch('/api/admin/coupons', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
    });
    if (res.ok) {
      const saved = await res.json();
      setCoupons(cs => cs.map(x => x.id === saved.id ? saved : x));
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this coupon?')) return;
    await adminFetch('/api/admin/coupons', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setCoupons(cs => cs.filter(c => c.id !== id));
  }

  function couponLabel(c: Coupon): string {
    if (c.discount_type === 'amount') return `$${Number(c.discount_value || 0).toFixed(2)} off`;
    if (c.discount_type === 'percent') return `${Number(c.discount_value || 0)}% off`;
    return c.discount_text || 'Special deal';
  }
  function isExpired(c: Coupon): boolean {
    return !!c.expires_at && new Date(c.expires_at + 'T23:59:59') < new Date();
  }

  return (
    <div className="card-base overflow-hidden">
      <div className="bg-brand-navy px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold">Coupons</h2>
          <p className="text-brand-sky text-xs">Shown to customers in the catalog. Savings are applied at the register — not in the cart.</p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1.5 bg-brand-gold text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full hover:bg-brand-amber transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Coupon
        </button>
      </div>

      {showForm && (
        <div className="border-b border-gray-100 p-6 bg-green-50 space-y-4">
          <h3 className="font-bold text-brand-navy text-sm">{editing ? 'Edit Coupon' : 'New Coupon'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Coupon Name</label>
              <input className="input-base" placeholder="e.g. Summer Meat Sale" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label-base">Expires On</label>
              <input type="date" className="input-base" value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
            <div>
              <label className="label-base">Discount Type</label>
              <select className="input-base" value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as Coupon['discount_type'] }))}>
                <option value="amount">Dollars off</option>
                <option value="percent">Percent off</option>
                <option value="other">Other deal (free text)</option>
              </select>
            </div>
            {form.discount_type !== 'other' ? (
              <div>
                <label className="label-base">{form.discount_type === 'amount' ? 'Amount ($)' : 'Percent (%)'}</label>
                <input type="number" min="0" step="0.01" className="input-base" value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
              </div>
            ) : (
              <div>
                <label className="label-base">Deal Text</label>
                <input className="input-base" placeholder='e.g. "2 for $5"' value={form.discount_text}
                  onChange={e => setForm(f => ({ ...f, discount_text: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="label-base">Applies To</label>
              <select className="input-base" value={form.applies_to}
                onChange={e => setForm(f => ({ ...f, applies_to: e.target.value as Coupon['applies_to'] }))}>
                <option value="all">Whole store</option>
                <option value="category">A category</option>
              </select>
            </div>
            {form.applies_to === 'category' && (
              <div>
                <label className="label-base">Category</label>
                <input className="input-base" placeholder="e.g. Meat & Seafood" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label-base">Description (shown to customers)</label>
              <input className="input-base" placeholder="e.g. All hand-cut steaks while supplies last" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? 'Save Changes' : 'Create Coupon'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-outline text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-river" />
        </div>
      ) : coupons.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-400">No coupons yet. Create one to show it in the customer catalog.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {coupons.map(c => {
            const expired = isExpired(c);
            const inactive = !c.is_active || expired;
            return (
              <div key={c.id} className={`px-6 py-4 flex items-center justify-between gap-4 ${inactive ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-brand-navy text-sm">
                    {c.name}
                    <span className="ml-2 text-xs font-bold text-brand-orange">{couponLabel(c)}</span>
                    {c.applies_to === 'category' && c.category && (
                      <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.category}</span>
                    )}
                    {expired && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-500">Expired</span>}
                    {!c.is_active && !expired && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Inactive</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.description || 'No description'}
                    {c.expires_at && <span> · expires {new Date(c.expires_at + 'T00:00:00').toLocaleDateString()}</span>}
                    {c.created_by && <span> · by {c.created_by}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(c)} className="text-xs text-gray-400 hover:text-brand-river">Edit</button>
                  <button onClick={() => toggleActive(c)} className="text-xs text-gray-400 hover:text-brand-orange">
                    {c.is_active ? 'Expire now' : 'Reactivate'}
                  </button>
                  <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-gray-50 px-6 py-3 text-xs text-gray-400 border-t border-gray-100">
        Coupons are informational for customers — Sinclair&apos;s applies the savings when the order is
        shopped. All coupon changes are recorded in the activity log.
      </div>
    </div>
  );
}
