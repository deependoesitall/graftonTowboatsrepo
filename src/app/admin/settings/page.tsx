'use client';
// src/app/admin/settings/page.tsx
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Eye, EyeOff, Plus, Trash2, UserPlus, ShieldCheck, User, Lock, ScrollText, Search, ArrowRight, ChevronLeft, ChevronRight, MessageSquarePlus, Check, X, Loader2, Send, Wrench, FlaskConical, RotateCcw } from 'lucide-react';
import { fetchAdminSession, getAdminRole, canAccess, adminFetch, AdminRole } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import PushDevices from '@/components/admin/PushDevices';
import { formatDate, formatDateOnly, formatTimeOnly, formatCalendarDate } from '@/lib/utils';
import { DEFAULT_ZONE_ORDER, AISLES_TOKEN } from '@/lib/store-layout';

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
  sinclair_order_emails: string;
  sinclair_email_test_mode: boolean;
  sinclair_test_emails: string;
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
  show_digital_coupons: boolean;
  /** Migration 075 — the two Sinclair's rails on /catalog. */
  show_sale_rail: boolean;
  show_best_sellers_rail: boolean;
  /* ── Written by the nightly rail cron, never by this page (089). ── */
  sale_rail_available?: boolean | null;
  best_sellers_rail_available?: boolean | null;
  sale_rail_upstream_count?: number | null;
  rails_checked_at?: string | null;
  show_boats_ordering_rail: boolean;
  cod_fee_enabled: boolean;
  cod_fee_percent: number;
  fleet_cta_enabled: boolean;
  store_zone_order: string[];
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

const ROLE_LABELS = {
  owner: 'Owner', gts_manager: 'GTS Manager', manager: "Sinclair's Manager", staff: 'Staff',
};
const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
  gts_manager: 'bg-brand-green/10 text-brand-green border-brand-green/20',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  staff: 'bg-gray-100 text-gray-600 border-gray-200',
};

function isSinclairStaff(u: { role: string; permissions?: string[] | null }) {
  // Match server isSinclairStaffAccount — never treat Owner / GTS Manager as Sinclair staff.
  if (u.role === 'owner' || u.role === 'gts_manager') return false;
  return u.role === 'manager' || (u.permissions || []).includes('sinclair');
}

function logActionLabel(log: ActivityLog) {
  if (log.action === 'order_deleted') {
    return (
      <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
        <Trash2 className="w-3 h-3" />
        Deleted
        {log.from_value && (
          <span className="text-gray-400 font-normal capitalize">
            (was {log.from_value.replace(/_/g, ' ')})
          </span>
        )}
      </span>
    );
  }
  if (log.action === 'status_change' && log.from_value && log.to_value) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="capitalize">{log.from_value.replace(/_/g, ' ')}</span>
        <ArrowRight className="w-3 h-3" />
        <span className="capitalize font-semibold text-brand-navy">{log.to_value.replace(/_/g, ' ')}</span>
      </span>
    );
  }
  if (log.action === 'order_placed') {
    const who = log.from_value === 'staff' ? 'staff' : 'online';
    return (
      <span className="font-semibold text-brand-navy">
        Placed ({who})
        {log.to_value ? <span className="font-normal text-gray-400"> · {log.to_value}</span> : null}
      </span>
    );
  }
  if (log.action === 'register_import') {
    return (
      <span className="font-semibold text-brand-navy">
        Imported register tape
        {log.to_value ? <span className="font-normal text-gray-400"> · {log.to_value}</span> : null}
      </span>
    );
  }
  if (log.action === 'confirmation_email_sent') {
    return (
      <span className="font-semibold text-brand-navy">
        Sent confirmation email
        {log.to_value ? <span className="font-normal text-gray-400"> → {log.to_value}</span> : null}
      </span>
    );
  }
  if (log.action === 'final_email_sent') {
    return (
      <span className="font-semibold text-brand-navy">
        Sent shopped email
        {log.to_value ? <span className="font-normal text-gray-400"> → {log.to_value}</span> : null}
      </span>
    );
  }
  if (log.from_value && log.to_value) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="capitalize">{log.from_value.replace(/_/g, ' ')}</span>
        <ArrowRight className="w-3 h-3" />
        <span className="capitalize font-semibold text-brand-navy">{log.to_value.replace(/_/g, ' ')}</span>
      </span>
    );
  }
  return <span className="capitalize">{log.action.replace(/_/g, ' ')}</span>;
}

export default function AdminSettingsPage() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  const router = useRouter();
  const [tab, setTab] = useState<'logs' | 'sinclair' | 'password' | 'users' | 'email' | 'features'>('logs');
  const [settings, setSettings] = useState<Settings>({
    business_email: 'GraftonTowboatServices@gmail.com',
    order_email_cc: '',
    sinclair_order_emails: 'sinclairfoods@jerseyville-il.net, dwittman@jerseyville-il.net',
    sinclair_email_test_mode: false,
    sinclair_test_emails: '',
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
    show_digital_coupons: true,
    show_sale_rail: false,
    show_best_sellers_rail: true,
    show_boats_ordering_rail: false,
    cod_fee_enabled: true,
    cod_fee_percent: 5,
    fleet_cta_enabled: false,
    store_zone_order: [...DEFAULT_ZONE_ORDER],
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sinclairTestBusy, setSinclairTestBusy] = useState(false);

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
  const [showNewUserPw, setShowNewUserPw] = useState(false);
  // Invoice numbering — read the live "next" value, let the owner correct it
  // Owner resetting another admin's forgotten password
  const [pwResetUser, setPwResetUser] = useState<string | null>(null);
  const [pwResetValue, setPwResetValue] = useState('');
  const [pwResetSaving, setPwResetSaving] = useState(false);
  const [pwResetDone, setPwResetDone] = useState<string | null>(null);
  const [pwResetError, setPwResetError] = useState('');
  const [pwResetCopied, setPwResetCopied] = useState(false);

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

  // Store layout — add-a-zone input
  const [newZone, setNewZone] = useState('');
  function addZone() {
    const z = newZone.trim();
    if (!z) return;
    setSettings(s => s.store_zone_order.some(x => x.toLowerCase() === z.toLowerCase())
      ? s
      : { ...s, store_zone_order: [...s.store_zone_order, z] });
    setNewZone('');
  }

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
      if (session.role === 'manager') { setTab('sinclair'); loadUsers(); }
      else if (session.role === 'owner') { setTab('email'); loadUsers(); }
      loadSettings();
    })();
  }, [router]);

  async function loadSettings() {
    setLoading(true);
    const res = await adminFetch('/api/admin/settings');
    if (res.ok) {
      const data = await res.json();
      // Keep defaults for anything the server doesn't return yet (e.g. a
      // column whose migration hasn't been applied returns null).
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
      setSettings(s => ({ ...s, ...clean }));
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

  const emailPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tab !== 'email' || denied) return;
    if (emailPreviewTimer.current) clearTimeout(emailPreviewTimer.current);
    emailPreviewTimer.current = setTimeout(() => { void loadEmailPreview(false); }, 500);
    return () => { if (emailPreviewTimer.current) clearTimeout(emailPreviewTimer.current); };
  }, [tab, denied, settings.order_email_subject, settings.email_header_tagline, settings.email_intro_message, settings.email_footer_text, settings.email_button_text, settings.email_button_url]);

  async function loadEmailPreview(openModal = false) {
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
      if (openModal) setShowPreview(true);
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
          show_digital_coupons: settings.show_digital_coupons,
          // Both sides can switch the rails off. Dave's team owns whether
          // Sinclair's pricing is advertised on someone else's storefront;
          // GTS owns what its customers see. Either alone is enough.
          show_sale_rail: settings.show_sale_rail,
          show_best_sellers_rail: settings.show_best_sellers_rail,
          show_boats_ordering_rail: settings.show_boats_ordering_rail,
          store_zone_order: settings.store_zone_order,
          cod_fee_enabled: settings.cod_fee_enabled,
          cod_fee_percent: settings.cod_fee_percent,
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

  async function patchSinclairTest(partial: {
    sinclair_email_test_mode: boolean;
    sinclair_test_emails?: string;
    /** On restore: re-assert held store inboxes if they were blank. */
    sinclair_order_emails?: string;
  }) {
    setSinclairTestBusy(true);
    setSaveMsg('');
    setSettings(s => ({ ...s, ...partial }));
    const res = await adminFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    setSinclairTestBusy(false);
    if (!res.ok) {
      let msg = 'Could not switch Sinclair test mode — run migration 085?';
      try {
        const err = await res.json();
        if (err?.error) msg = `Error: ${err.error}`;
      } catch {}
      setSaveMsg(msg);
      loadSettings();
      return;
    }
    // Prefer server row so Restore flips the UI off test mode even if a field
    // was stale in local state — Deepen will hit this during the live demo.
    try {
      const saved = await res.json();
      if (saved && typeof saved === 'object' && 'sinclair_email_test_mode' in saved) {
        setSettings(s => ({ ...s, ...saved }));
      }
    } catch {
      /* keep optimistic merge */
    }
    setSaveMsg(partial.sinclair_email_test_mode
      ? 'Test mode on — Sinclair copies come to you.'
      : "Sinclair's emails restored — next Shop-now goes to the store inboxes.");
    setTimeout(() => setSaveMsg(''), 4000);
  }

  function startSinclairTest() {
    const prefill = (settings.sinclair_test_emails || '').trim()
      || (settings.business_email || '').trim();
    return patchSinclairTest({
      sinclair_email_test_mode: true,
      sinclair_test_emails: prefill,
    });
  }

  function restoreSinclairEmails() {
    // Held addresses stay in sinclair_order_emails while test mode is on.
    // If that field was somehow empty, refill the known Sinclair desk so
    // Restore never leaves Shop-now with nowhere to go.
    const HELD_DEFAULT = 'sinclairfoods@jerseyville-il.net, dwittman@jerseyville-il.net';
    const held = (settings.sinclair_order_emails || '').trim() || HELD_DEFAULT;
    return patchSinclairTest({
      sinclair_email_test_mode: false,
      sinclair_order_emails: held,
    });
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
    const payload = sessionRole === 'manager'
      ? {
          username: newUser.username,
          password: newUser.password,
          display_name: newUser.display_name || newUser.username,
          role: newUser.role === 'manager' ? 'manager' : 'staff',
          permissions: ['sinclair'],
        }
      : { ...newUser, display_name: newUser.display_name || newUser.username };
    const res = await adminFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const u = await res.json();
      setUsers(us => [...us, u]);
      setNewUser({
        username: '', password: '', role: 'staff', display_name: '',
        permissions: sessionRole === 'manager' ? ['sinclair'] : [],
      });
      setShowAddUser(false);
    } else {
      try {
        const err = await res.json();
        setSaveMsg(err?.error || 'Could not add user');
        setTimeout(() => setSaveMsg(''), 4000);
      } catch { /* ignore */ }
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

  // Owner sets a NEW password for another admin who forgot theirs (no current
  // password needed — that's the whole point of an owner reset).
  async function resetUserPassword(id: string) {
    const next = pwResetValue.trim();
    if (next.length < 4) {
      setPwResetError('Password must be at least 4 characters.');
      return;
    }
    setPwResetSaving(true);
    setPwResetError('');
    setPwResetCopied(false);
    try {
      const res = await adminFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: next }),
      });
      if (!res.ok) {
        let msg = 'Could not set password.';
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch { /* ignore */ }
        if (res.status === 403) msg = sessionRole === 'manager'
          ? "You can only set passwords for Sinclair's staff."
          : 'Only Owners can reset team passwords.';
        if (res.status === 401) msg = 'Session expired — sign in again, then retry.';
        setPwResetError(msg);
        return;
      }
      setPwResetDone(id);
      try {
        await navigator.clipboard.writeText(next);
        setPwResetCopied(true);
      } catch {
        setPwResetCopied(false);
      }
      // Keep the row open briefly so Jen can still read/copy the password she set.
      setTimeout(() => {
        setPwResetDone(d => (d === id ? null : d));
        setPwResetUser(cur => {
          if (cur === id) {
            setPwResetValue('');
            setPwResetCopied(false);
            return null;
          }
          return cur;
        });
      }, 5000);
    } catch {
      setPwResetError('Network error — try again.');
    } finally {
      setPwResetSaving(false);
    }
  }

  async function deleteUser(id: string) {
    if (!(await confirmDialog({ title: 'Delete this admin user?', danger: true }))) return;
    await adminFetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setUsers(us => us.filter(u => u.id !== id));
  }

  const isSinclairManager = sessionRole === 'manager';
  const allTabs = [
    // Managers get the log too — server-side scoped to Sinclair-relevant
    // entries (order shopping / status changes, catalog activity).
    { key: 'logs',     label: 'Logs',         ownerOnly: false, managerOk: true },
    { key: 'sinclair', label: "Sinclair's",   ownerOnly: false, managerOk: true },
    { key: 'password', label: 'Password',     ownerOnly: false, managerOk: true },
    // Sinclair managers may onboard their own staff (server enforces Sinclair-only).
    { key: 'users',    label: isSinclairManager ? "Sinclair's staff" : 'Admin Users', ownerOnly: false, managerOk: true, ownerOrManager: true },
    { key: 'email',    label: 'Email',        ownerOnly: true,  managerOk: false },
    { key: 'features', label: 'Features',     ownerOnly: true,  managerOk: false },
  ] as const;
  // Owner sees everything. Sinclair manager sees Logs / Sinclair's / Password /
  // Sinclair's staff. gts_manager/staff keep the non-ownerOnly tabs except users.
  const tabs = sessionRole === 'owner'
    ? allTabs
    : sessionRole === 'manager'
      ? allTabs.filter(t => t.managerOk)
      : allTabs.filter(t => !t.ownerOnly && !('ownerOrManager' in t && t.ownerOrManager));

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
      {confirmDialogEl}
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
            className={`shrink-0 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
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
                  Imports, placements, status changes, emails, and deletions will appear here.
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
                          {log.order_number ? (
                            <>Order <span className="font-mono font-semibold text-gray-500">{log.order_number}</span></>
                          ) : (
                            <span className="font-semibold text-gray-500">System</span>
                          )}
                          <span className="ml-1.5 inline-flex items-center gap-1">
                            {logActionLabel(log)}
                          </span>
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
                        {formatTimeOnly(log.created_at)}
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
                        sessionRole === 'owner' ? (
                          <button
                            onClick={() => { setEditingNoteId(log.id); setNoteDraft(log.note || ''); }}
                            className="text-xs text-gray-500 bg-brand-sand/30 hover:bg-brand-sand/50 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5 max-w-full text-left transition-colors"
                          >
                            <MessageSquarePlus className="w-3 h-3 mt-0.5 shrink-0 text-brand-river" />
                            <span className="truncate">{log.note}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500 bg-brand-sand/30 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5 max-w-full">
                            <MessageSquarePlus className="w-3 h-3 mt-0.5 shrink-0 text-brand-river" />
                            <span className="truncate">{log.note}</span>
                          </span>
                        )
                      ) : sessionRole === 'owner' ? (
                        <button
                          onClick={() => { setEditingNoteId(log.id); setNoteDraft(''); }}
                          className="text-[11px] text-gray-300 hover:text-brand-river inline-flex items-center gap-1 transition-colors"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          Add note
                        </button>
                      ) : null}
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
              Imports, placements, status changes, emails, and deletions. Search by order #, vessel/company, contact, phone, PO, or staff name.
            </div>
          </div>
        </div>
      )}

      {/* ── SINCLAIR'S (weekly ad, coupons, walk order) ──
           The Order Cutoff Timer lived here and was removed: a towboat's ETA
           moves constantly and crews order when they get signal, so refusing a
           late order created more phone calls than it prevented. */}
      {tab === 'sinclair' && (
        <div className="space-y-6">
          <div className="card-base p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-brand-navy">Digital Coupons on the Catalog</h2>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Shows Sinclair&apos;s digital coupons (auto-pulled from your website) to boat crews on
                  the ordering catalog. <strong className="text-brand-navy">Only leave this on if your
                  staff will apply digital-coupon prices when shopping boat orders</strong> — crews
                  don&apos;t have loyalty accounts to clip with, so showing savings you won&apos;t honor
                  creates billing disputes.
                </p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, show_digital_coupons: !s.show_digital_coupons }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings.show_digital_coupons ? 'bg-brand-green' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.show_digital_coupons ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* ── The two Sinclair's rails on /catalog (migration 075) ──────
              Separate from digital coupons and deliberately so: these are
              SHELF prices that ring up for anyone, with clip/loyalty offers
              filtered out before they reach the page. That's the whole reason
              they're safe to show crews who have no Sinclair's account. */}
          <div className="card-base p-6 space-y-4">
            <div>
              <h2 className="font-bold text-brand-navy">Sinclair&apos;s Catalog Rails</h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Two optional rows on the ordering catalog, refreshed nightly.
                <strong className="text-brand-navy"> These are shelf sales, not digital
                coupons</strong> — clip-to-save and loyalty offers are filtered out, because crews
                have no Sinclair&apos;s account to clip with. Each night the sync checks
                whether Sinclair&apos;s is actually running a sale week and takes our row down
                with theirs if not &mdash; nobody has to notice and flip anything.
                These switches are the override: off here means off regardless.
              </p>
            </div>

            {([
              ['show_sale_rail', "What's on sale", 'Genuine shelf discounts from Sinclair’s own sale set. Comes down on its own when they are not running one.'],
              ['show_best_sellers_rail', 'Best sellers', 'The same items in the same order as Sinclair’s own storefront — their popularity ranking, refreshed nightly.'],
              ['show_boats_ordering_rail', 'See What Boats Are Buying', 'Our own frequency from grocery orders and matched register receipts. Off until it has enough boats — Best sellers stays. Catalog still hides the row under 8 items.'],
            ] as const).map(([key, label, hint]) => (
              <div key={key} className="flex items-start justify-between gap-4 border-t border-gray-100 pt-4 first:border-0 first:pt-0">
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{hint}</p>
                  {/* ⚠️ A DARK RAIL MUST STATE ITS REASON. Switched on but not on the
                      page is the confusing case — say which half said no. */}
                  <RailAutoStatus settingsKey={key} settings={settings} />
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings[key] ? 'bg-brand-green' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            ))}
            <BoatsOrderingPreview />
          </div>

          {/* ── COD handling fee — toggleable + configurable percent.
              Offsets Venmo / Cash App / credit-card processing on CODs.
              Snapshot at order time; toggling off only affects NEW orders. ── */}
          <div className="card-base p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-brand-navy">COD Handling Fee</h2>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Adds a percentage on top of each COD total to cover Venmo, Cash App, and
                  credit-card processing. Shown to the crew member at checkout and included in the
                  amount you request. Turning this off removes the fee from <strong className="text-brand-navy">new</strong> orders
                  only — orders already placed keep the fee they were quoted, and you can still
                  adjust the fee on any single order from its order details.
                </p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, cod_fee_enabled: !s.cod_fee_enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings.cod_fee_enabled ? 'bg-brand-green' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.cod_fee_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {settings.cod_fee_enabled && (
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fee percent</label>
                <input type="number" min="0" max="100" step="0.5" className="input-base w-24 text-center font-bold"
                  value={settings.cod_fee_percent}
                  onChange={e => setSettings(s => ({ ...s, cod_fee_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
                <span className="text-sm text-gray-500">% — default is 5</span>
              </div>
            )}
          </div>

          {/* ── Weekly Ad override — OWNER-ONLY safety valve. Hidden from
              Sinclair's managers: the ad auto-syncs and seeing an override
              field only invites "wait, do we have to update this?" ── */}
          {sessionRole === 'owner' && (
            <div className="card-base p-6 space-y-4">
              <h2 className="font-bold text-brand-navy">Weekly Ad <span className="text-xs font-normal text-gray-400">(owner-only safety valve)</span></h2>
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
          )}

          {/* ── Store Layout — walking order for shopping mode ── */}
          <div className="card-base p-6 space-y-4">
            <div>
              <h2 className="font-bold text-brand-navy">
                Store Layout — Shopping Walk Order
                <span className="ml-2 text-[11px] font-normal text-gray-400">(safety valve — normally automatic)</span>
              </h2>
              {/* HONEST COPY. This list is NOT what orders the walk. Every synced
                  item carries Sinclair's own walkpath sequence and that drives
                  the sort; this only catches items with no sequence at all.
                  The old wording implied otherwise, which invited Dave to
                  rearrange something that would have had no effect. */}
              <div className="mt-2 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-800 leading-relaxed">
                <strong>✓ Automatic.</strong> Shopping mode already walks the store in Sinclair&apos;s
                own order — every item carries its aisle and walk position from their website, so the
                list sorts itself. Nothing to set up here.
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                The order below is only used for items that arrive with <em>no</em> aisle yet —
                a hand-added product, or one the nightly sync hasn&apos;t reached.
                <strong className="text-brand-navy"> &ldquo;{AISLES_TOKEN}&rdquo;</strong> marks where the
                numbered aisles fall. It&apos;s already set to Sinclair&apos;s departments; you shouldn&apos;t
                need to touch it.
              </p>
            </div>
            <div className="space-y-1.5 max-w-md">
              {settings.store_zone_order.map((zone, idx) => {
                const isAisles = zone.toLowerCase() === AISLES_TOKEN.toLowerCase();
                const move = (from: number, to: number) => {
                  if (to < 0 || to >= settings.store_zone_order.length) return;
                  setSettings(s => {
                    const next = [...s.store_zone_order];
                    const [z] = next.splice(from, 1);
                    next.splice(to, 0, z);
                    return { ...s, store_zone_order: next };
                  });
                };
                return (
                  <div key={`${zone}-${idx}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      isAisles ? 'bg-brand-sand/50 border-brand-gold/40' : 'bg-white border-gray-200'
                    }`}>
                    <span className="text-xs text-gray-300 font-mono w-5">{idx + 1}</span>
                    <span className={`flex-1 text-sm font-semibold ${isAisles ? 'text-brand-navy' : 'text-gray-700'}`}>
                      {isAisles ? `Aisles 1, 2, 3… (numbered aisles)` : zone}
                    </span>
                    <button type="button" onClick={() => move(idx, idx - 1)} disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-brand-navy disabled:opacity-20" aria-label={`Move ${zone} up`}>
                      <ChevronLeft className="w-4 h-4 rotate-90" />
                    </button>
                    <button type="button" onClick={() => move(idx, idx + 1)} disabled={idx === settings.store_zone_order.length - 1}
                      className="p-1 text-gray-400 hover:text-brand-navy disabled:opacity-20" aria-label={`Move ${zone} down`}>
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </button>
                    {!isAisles && (
                      <button type="button"
                        onClick={() => setSettings(s => ({ ...s, store_zone_order: s.store_zone_order.filter((_, i) => i !== idx) }))}
                        className="p-1 text-gray-300 hover:text-red-500" aria-label={`Remove ${zone}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-1">
                <input type="text" className="input-base text-sm flex-1" placeholder="Add a department (e.g. Seafood)"
                  value={newZone} onChange={e => setNewZone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addZone(); }} />
                <button type="button" onClick={addZone}
                  className="btn-outline text-xs px-3 py-2 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
                <button type="button"
                  onClick={() => setSettings(s => ({ ...s, store_zone_order: [...DEFAULT_ZONE_ORDER] }))}
                  className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0">
                  Reset
                </button>
              </div>
            </div>
          </div>

          <CouponsManager />
        </div>
      )}

      {/* ── PASSWORD ── */}
      {/* Sits under the account tab, not a system-settings tab, because these
          rows belong to the signed-in person — their phones, nobody else's.
          The API scopes the list to session.sub for the same reason. */}
      {tab === 'password' && (
        <div className="mb-4">
          <PushDevices />
        </div>
      )}

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
              <div>
                <h2 className="text-white font-bold">
                  {sessionRole === 'manager' ? "Sinclair's staff logins" : 'Staff logins'}
                </h2>
                <p className="text-white/60 text-xs mt-0.5">
                  {sessionRole === 'manager'
                    ? 'Add shoppers and set passwords for your team only — typed passwords, no generate'
                    : "GTS team and Sinclair's team — set passwords without knowing the old one"}
                </p>
              </div>
              <button onClick={() => {
                setShowAddUser(s => !s);
                if (sessionRole === 'manager') {
                  setNewUser(u => ({ ...u, role: 'staff', permissions: ['sinclair'] }));
                }
              }}
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
                    <div className="relative">
                      <input type={showNewUserPw ? 'text' : 'password'} className="input-base pr-10"
                        placeholder="At least 4 characters"
                        value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                      <button type="button" onClick={() => setShowNewUserPw(s => !s)}
                        aria-label={showNewUserPw ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showNewUserPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label-base">Role</label>
                    <select className="input-base" value={newUser.role}
                      onChange={e => {
                        const role = e.target.value;
                        setNewUser(u => ({
                          ...u,
                          role,
                          permissions: sessionRole === 'manager' || role === 'manager'
                            ? (u.permissions.includes('sinclair') ? u.permissions : [...u.permissions, 'sinclair'])
                            : u.permissions,
                        }));
                      }}>
                      {sessionRole === 'owner' && (
                        <>
                          <option value="owner">Owner — Full access</option>
                          <option value="gts_manager">GTS Manager — GTS ops (no admin logs)</option>
                        </>
                      )}
                      <option value="manager">Sinclair&apos;s Manager — grocery orders, products, weekly ad, coupons</option>
                      <option value="staff">
                        {sessionRole === 'manager' ? "Sinclair's Staff — grocery orders / shopping" : 'Staff — Orders only'}
                      </option>
                    </select>
                    {newUser.role === 'manager' && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Managers see: Sinclair-filtered orders, the full product catalog + import,
                        weekly ad &amp; coupon management, and their own password. Nothing else.
                      </p>
                    )}
                  </div>
                </div>
                {/* Permissions — Owner can toggle; Sinclair managers always grant Sinclair access. */}
                {sessionRole === 'owner' ? (
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
                ) : (
                <p className="mt-3 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  New accounts are Sinclair Foods shoppers — grocery orders only. They cannot see GTS Owner tools.
                </p>
                )}
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
              <div className="space-y-0">
                {([
                  ...(sessionRole === 'owner' ? [{
                    key: 'gts' as const,
                    title: 'GTS staff',
                    hint: 'Owner, GTS Manager, and Staff without Sinclair scope',
                    list: users.filter(u => !isSinclairStaff(u)),
                  }] : []),
                  {
                    key: 'sinclair' as const,
                    title: "Sinclair's staff",
                    hint: "Sinclair's Manager role, or anyone with Sinclair permission",
                    list: users.filter(u => isSinclairStaff(u)),
                  },
                ]).map(group => (
                  <div key={group.key}>
                    <div className={`px-6 py-3 border-b border-gray-100 ${
                      group.key === 'gts' ? 'bg-brand-navy/5' : 'bg-emerald-50/80'
                    }`}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-brand-navy">
                        {group.title}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">{group.hint}</p>
                    </div>
                    {group.list.length === 0 ? (
                      <p className="px-6 py-4 text-xs text-gray-400">Nobody in this group yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {group.list.map(u => (
                  <div key={u.id} className={`px-6 py-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-brand-steel/10 rounded-full flex items-center justify-center font-bold text-brand-steel text-sm">
                          {(u.display_name || u.username)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-brand-navy text-sm">{u.display_name || u.username}</p>
                          <p className="text-xs text-gray-400">@{u.username} · {u.last_login ? `Last login ${formatDateOnly(u.last_login)}` : 'Never logged in'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_COLORS[u.role] || ROLE_COLORS.staff}`}>
                          {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}
                        </span>
                        {u.permissions?.includes('sinclair') && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Sinclair
                          </span>
                        )}
                        {sessionRole === 'owner' && (
                          <button
                            onClick={() => togglePermission(u, 'sinclair')}
                            title={u.permissions?.includes('sinclair') ? 'Remove Sinclair access' : 'Grant Sinclair access'}
                            className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
                          >
                            {u.permissions?.includes('sinclair') ? '− Sinclair' : '+ Sinclair'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const next = pwResetUser === u.id ? null : u.id;
                            setPwResetUser(next);
                            setPwResetValue('');
                            setPwResetError('');
                            setPwResetCopied(false);
                          }}
                          className="text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy transition-colors">
                          {pwResetDone === u.id ? <span className="text-green-600 font-semibold">✓ Password set</span> : 'Set password'}
                        </button>
                        <button onClick={() => toggleUser(u)}
                          className="text-xs text-gray-400 hover:text-brand-river transition-colors">
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {sessionRole === 'owner' && (
                          <button onClick={() => deleteUser(u.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {pwResetUser === u.id && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                          <input
                            type="text"
                            autoFocus
                            value={pwResetValue}
                            onChange={e => { setPwResetValue(e.target.value); setPwResetError(''); setPwResetCopied(false); }}
                            onKeyDown={e => e.key === 'Enter' && resetUserPassword(u.id)}
                            placeholder={`New password for @${u.username} (min 4 chars)`}
                            className="input-base text-sm flex-1 min-w-[12rem]" />
                          <button type="button" onClick={() => resetUserPassword(u.id)}
                            disabled={pwResetSaving || pwResetValue.trim().length < 4}
                            className="btn-primary text-xs px-3 py-2 disabled:opacity-50 whitespace-nowrap">
                            {pwResetSaving ? 'Saving…' : 'Set password'}
                          </button>
                          <button type="button" onClick={() => { setPwResetUser(null); setPwResetValue(''); setPwResetError(''); setPwResetCopied(false); }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                        </div>
                        {pwResetError && (
                          <p className="text-xs text-red-600 px-1">{pwResetError}</p>
                        )}
                        {pwResetDone === u.id && !pwResetError && (
                          <p className="text-xs text-green-700 px-1 font-semibold">
                            ✓ Password set{pwResetCopied ? ' — copied to clipboard' : ''}. Give it to them now.
                          </p>
                        )}
                        {pwResetDone !== u.id && (
                          <p className="text-[11px] text-gray-400 px-1">
                            Type the new password. Give it to them now. They can change it under Password later.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-gray-50 px-6 py-3 text-xs text-gray-400 border-t border-gray-100 space-y-1">
              {sessionRole === 'manager' ? (
                <p>
                  You can add Sinclair shoppers and set their passwords. GTS Owner / Jen / MK accounts stay with Grafton.
                </p>
              ) : (
                <>
              <p>
                <span className="font-semibold text-brand-navy">Roles:</span>{' '}
                Owner = all access · GTS Manager = everything except admin logs · Sinclair&apos;s Manager = grocery orders + products + weekly ad + coupons + own password · Staff = orders only
              </p>
              <p>
                <span className="text-emerald-600 font-semibold">Sinclair permission</span> scopes the order list to grocery items (crew-change / service-only hidden).
              </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL ── */}
      {tab === 'email' && (() => {
        const SAMPLE = {
          '{order_number}': 'GTS-260611-1234',
          '{company_name}': 'Ingram',
          '{vessel_name}': 'Scott Noble',
          '{contact_name}': 'Captain Smith',
          '{phone}': '(618) 555-0142',
          '{order_total}': '$34.24',
          '{item_count}': '6',
          '{order_date}': 'Jun 11, 2026',
        };
        const fillSample = (t: string) => Object.entries(SAMPLE).reduce((s, [k, v]) => s.replaceAll(k, v), t);
        const insert = (field: 'order_email_subject' | 'email_header_tagline' | 'email_intro_message' | 'email_footer_text' | 'email_button_text', token: string) => {
          setSettings(s => ({ ...s, [field]: `${s[field] || ''}${token}` }));
        };
        const TokenRow = ({ field }: { field: 'order_email_subject' | 'email_header_tagline' | 'email_intro_message' | 'email_footer_text' | 'email_button_text' }) => (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[
              ['{order_number}', 'Order #'],
              ['{company_name}', 'Company'],
              ['{vessel_name}', 'Boat'],
              ['{contact_name}', 'Contact'],
              ['{order_total}', 'Total'],
              ['{item_count}', '# items'],
            ].map(([token, label]) => (
              <button key={token} type="button" onClick={() => insert(field, token)}
                className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-brand-navy hover:border-brand-gold hover:bg-brand-sand/40">
                + {label}
              </button>
            ))}
          </div>
        );
        const btnUrl = settings.email_button_url || '/admin/orders';
        const dest = !btnUrl || btnUrl === '/admin/orders' ? 'list'
          : btnUrl.includes('{order_id}') ? 'order'
          : 'custom';
        return (
        <div className="space-y-5">
          <div className="card-base p-6 space-y-5">
            <div>
              <h2 className="font-bold text-brand-navy">Who gets which email</h2>
              <p className="text-xs text-gray-400 mt-1">
                Separate inboxes — same split as the admin dashboard. Customer confirmation still goes to the boat. Separate with commas.
              </p>
            </div>
            <div className="rounded-xl border-2 border-brand-navy/15 bg-brand-navy/[0.03] p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-navy">GTS — Grafton Towboat Services</p>
              <p className="text-[11px] text-gray-500">New orders (full GTS view) and the final delivery email with GTS charges.</p>
              <div>
                <label className="label-base">GTS inbox</label>
                <input type="email" className="input-base" value={settings.business_email}
                  onChange={e => setSettings(s => ({ ...s, business_email: e.target.value }))} />
              </div>
              <div>
                <label className="label-base">Also GTS <span className="font-normal text-gray-400 normal-case">(optional copies)</span></label>
                <input type="text" className="input-base" value={settings.order_email_cc}
                  onChange={e => setSettings(s => ({ ...s, order_email_cc: e.target.value }))}
                  placeholder="jen@…, second@…" />
              </div>
            </div>
            <div className={`rounded-xl border-2 p-4 space-y-3 ${settings.sinclair_email_test_mode ? 'border-amber-400 bg-amber-50' : 'border-red-200 bg-red-50/40'}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${settings.sinclair_email_test_mode ? 'text-amber-900' : 'text-red-800'}`}>
                Sinclair&apos;s Foods — shopping desk
                {settings.sinclair_email_test_mode ? ' · test mode' : ''}
              </p>
              <p className="text-[11px] text-gray-600">
                Only when there is grocery to shop. They get &ldquo;Shop now&rdquo; with a link into Shopping Mode — not GTS delivery charges, not crew-change-only jobs.
              </p>
              {settings.sinclair_email_test_mode && (
                <div className="rounded-lg bg-amber-100 border border-amber-300 px-3 py-2 text-xs text-amber-950 font-medium">
                  Test mode is on. The store inboxes below are held — Shop-now copies go to you until you restore.
                </div>
              )}
              {settings.sinclair_email_test_mode ? (
                <div>
                  <label className="label-base">Send Sinclair copies to <span className="font-normal text-gray-500 normal-case">(your inbox)</span></label>
                  <textarea className="input-base" rows={2} value={settings.sinclair_test_emails}
                    onChange={e => setSettings(s => ({ ...s, sinclair_test_emails: e.target.value }))}
                    placeholder={settings.business_email || 'you@…'} />
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Held for restore: {settings.sinclair_order_emails || 'sinclairfoods@jerseyville-il.net, dwittman@jerseyville-il.net'}
                    {' · '}Save Changes if you edit this address.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="label-base">Sinclair&apos;s emails</label>
                  <textarea className="input-base" rows={2} value={settings.sinclair_order_emails}
                    onChange={e => setSettings(s => ({ ...s, sinclair_order_emails: e.target.value }))}
                    placeholder="sinclairfoods@jerseyville-il.net, dwittman@jerseyville-il.net" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {settings.sinclair_email_test_mode ? (
                  <button type="button" onClick={restoreSinclairEmails} disabled={sinclairTestBusy}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-800 hover:bg-red-50 disabled:opacity-50">
                    {sinclairTestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Restore Sinclair&apos;s emails
                  </button>
                ) : (
                  <button type="button" onClick={startSinclairTest} disabled={sinclairTestBusy}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 disabled:opacity-50">
                    {sinclairTestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                    Test with my inbox
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="card-base p-6 space-y-5">
              <div>
                <h2 className="font-bold text-brand-navy">What the email says</h2>
                <p className="text-xs text-gray-400 mt-1">Tap a green chip to drop in the real order number, boat, or total. Save at the top of the page when you&apos;re happy.</p>
              </div>

              <div>
                <label className="label-base">Inbox title</label>
                <input type="text" className="input-base" value={settings.order_email_subject}
                  onChange={e => setSettings(s => ({ ...s, order_email_subject: e.target.value }))} />
                <TokenRow field="order_email_subject" />
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  In the inbox it looks like:{' '}
                  <span className="font-semibold text-brand-navy">{fillSample(settings.order_email_subject || '')}</span>
                </p>
              </div>

              <div>
                <label className="label-base">Green header line</label>
                <input type="text" className="input-base" value={settings.email_header_tagline}
                  onChange={e => setSettings(s => ({ ...s, email_header_tagline: e.target.value }))}
                  placeholder="New Order Received" />
                <TokenRow field="email_header_tagline" />
              </div>

              <div>
                <label className="label-base">Opening sentence <span className="font-normal text-gray-400 normal-case">(optional)</span></label>
                <textarea className="input-base" rows={3} value={settings.email_intro_message}
                  onChange={e => setSettings(s => ({ ...s, email_intro_message: e.target.value }))}
                  placeholder="A new grocery order is in — open it in the dashboard." />
                <TokenRow field="email_intro_message" />
              </div>

              <div>
                <label className="label-base">Green button</label>
                <input type="text" className="input-base mb-2" value={settings.email_button_text}
                  onChange={e => setSettings(s => ({ ...s, email_button_text: e.target.value }))}
                  placeholder="Open this order" />
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">When they tap it, go to</p>
                <div className="space-y-1.5">
                  {([
                    ['list', 'The orders list', '/admin/orders'],
                    ['order', 'That order, already open', '/admin/orders?order={order_id}'],
                  ] as const).map(([id, label, url]) => (
                    <label key={id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${dest === id ? 'border-brand-gold bg-brand-sand/30' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" name="email-btn-dest" className="accent-brand-navy"
                        checked={dest === id}
                        onChange={() => setSettings(s => ({ ...s, email_button_url: url }))} />
                      <span className="font-medium text-brand-navy">{label}</span>
                    </label>
                  ))}
                  <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${dest === 'custom' ? 'border-brand-gold bg-brand-sand/30' : 'border-gray-200 bg-white'}`}>
                    <input type="radio" name="email-btn-dest" className="accent-brand-navy mt-1"
                      checked={dest === 'custom'}
                      onChange={() => {
                        if (dest !== 'custom') setSettings(s => ({ ...s, email_button_url: 'https://' }));
                      }} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-brand-navy">A different page</span>
                      {dest === 'custom' && (
                        <input type="text" className="input-base text-xs mt-1.5" value={settings.email_button_url}
                          onChange={e => setSettings(s => ({ ...s, email_button_url: e.target.value }))}
                          placeholder="https://…" />
                      )}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="label-base">Fine print at the bottom</label>
                <input type="text" className="input-base" value={settings.email_footer_text}
                  onChange={e => setSettings(s => ({ ...s, email_footer_text: e.target.value }))} />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => void loadEmailPreview(true)} disabled={previewLoading}
                  className="btn-outline text-sm px-4 py-2 flex items-center gap-2">
                  {previewLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Open preview larger
                </button>
                <button type="button" onClick={sendTestEmail} disabled={testingEmail}
                  className="btn-outline text-sm px-4 py-2 flex items-center gap-2">
                  {testingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send me a test
                </button>
              </div>
              {testEmailResult && (
                <div className={`rounded-lg p-3 text-xs ${testEmailResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {testEmailResult.ok ? (
                    <p>Sent to <strong>{testEmailResult.to}</strong>. Check inbox and spam.</p>
                  ) : (
                    <>
                      <p className="font-semibold mb-1">{testEmailResult.error}</p>
                      {testEmailResult.hint && <p>{testEmailResult.hint}</p>}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="card-base overflow-hidden lg:sticky lg:top-20">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Live preview</p>
                {previewLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </div>
              <div className="bg-gray-100 min-h-[28rem]">
                {previewHtml ? (
                  <iframe srcDoc={previewHtml} className="w-full h-[32rem] border-0 bg-white" title="Email preview" />
                ) : (
                  <p className="text-xs text-gray-400 text-center py-16">Preview loads as you type.</p>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

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
          <div>
            <h2 className="font-bold text-brand-navy">Feature Toggles</h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Only switches that change live behavior. Dead toggles (tax, repeat-order gate)
              were removed from this screen — those columns may still exist in the database
              but nothing reads them at runtime.
            </p>
          </div>
          {[
            { key: 'fleet_cta_enabled' as const, label: 'Fleet Pricing Banner', desc: 'Show the B2B fleet-contract banner on the catalog ("sign your whole fleet up for special pricing — call us"). Leave off until the wording is final.' },
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
        </div>
      )}
    </div>
  );
}

function BoatsOrderingPreview() {
  const [data, setData] = useState<{
    stats: { grocery_orders: number; distinct_boats: number; matched_lines: number; distinct_skus: number; ready: boolean; window_days: number };
    thresholds: { grocery_orders: number; distinct_boats: number; cards: number };
    items: Array<{ product_id: string; description: string; order_count: number; last_purchased: string | null }>;
    error?: string;
  } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  async function loadPreview() {
    const res = await adminFetch('/api/admin/boats-ordering');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setData({ error: json.error || 'Could not load ranking', stats: { grocery_orders: 0, distinct_boats: 0, matched_lines: 0, distinct_skus: 0, ready: false, window_days: 90 }, thresholds: { grocery_orders: 25, distinct_boats: 3, cards: 8 }, items: [] });
    else setData(json);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch('/api/admin/boats-ordering');
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setData({ error: json.error || 'Could not load ranking', stats: { grocery_orders: 0, distinct_boats: 0, matched_lines: 0, distinct_skus: 0, ready: false, window_days: 90 }, thresholds: { grocery_orders: 25, distinct_boats: 3, cards: 8 }, items: [] });
      else setData(json);
    })();
    return () => { cancelled = true; };
  }, []);

  async function rebuild() {
    setRebuilding(true);
    await adminFetch('/api/admin/boats-ordering', { method: 'POST' });
    await loadPreview();
    setRebuilding(false);
  }

  if (!data) {
    return <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">Loading boat-order ranking…</p>;
  }
  const s = data.stats;
  return (
    <div className="border-t border-gray-100 pt-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-navy">Silent collection — last {s.window_days} days</p>
      {data.error ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{data.error}</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 leading-relaxed">
            {s.grocery_orders} grocery order{s.grocery_orders === 1 ? '' : 's'} · {s.distinct_boats} boat{s.distinct_boats === 1 ? '' : 's'} · {s.matched_lines} catalog-matched line{s.matched_lines === 1 ? '' : 's'} · {s.distinct_skus} SKUs.
            Suggested live bar: {data.thresholds.grocery_orders} orders, {data.thresholds.distinct_boats} boats, {data.thresholds.cards} cards.
            {s.ready ? ' Ready to turn on.' : ' Still collecting — leave the toggle off.'}
            {' '}Product-page “boats buying this also buy” uses these same baskets, then fills with Sinclair popularity if a pair is thin.
          </p>
          {data.items.length > 0 && (
            <ol className="text-xs text-brand-navy space-y-0.5">
              {data.items.slice(0, 8).map((it, i) => (
                <li key={it.product_id}>
                  <span className="text-gray-400 w-4 inline-block">{i + 1}.</span>
                  {it.description}
                  <span className="text-gray-400"> · {it.order_count} order{it.order_count === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={rebuild} disabled={rebuilding}
            className="text-[11px] font-bold text-brand-river hover:underline disabled:opacity-50">
            {rebuilding ? 'Rebuilding…' : 'Rebuild ranking now'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Coupons manager (Sinclair-owned, display-only coupons) ───
function CouponsManager() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
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
    if (!(await confirmDialog({ title: 'Delete this coupon?', danger: true }))) return;
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
      {confirmDialogEl}
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
                    {c.expires_at && <span> · expires {formatCalendarDate(c.expires_at)}</span>}
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

// ── Why a rail is or isn't on the catalog ────────────────────────────────────
//
// ⚠️ THE SWITCH ABOVE IS ONLY HALF THE ANSWER.
//
// A rail appears when BOTH the switch is on AND the nightly sync found that
// Sinclair's is running it (migration 089). "On but not on the page" is the
// state that generates support messages, so it says which half said no, and
// when the sync last managed to ask.
function RailAutoStatus({
  settingsKey, settings,
}: {
  settingsKey: string;
  settings: Settings;
}) {
  const isSale = settingsKey === 'show_sale_rail';
  const isBest = settingsKey === 'show_best_sellers_rail';
  if (!isSale && !isBest) return null;

  const on = (settings as unknown as Record<string, unknown>)[settingsKey] === true;
  // Undefined means a database without 089, or a cron that has not run yet.
  // Both behave as "available", so say nothing rather than inventing a state.
  const available = isSale ? settings.sale_rail_available : settings.best_sellers_rail_available;
  if (available === undefined || available === null) return null;

  const checked = settings.rails_checked_at
    ? new Date(settings.rails_checked_at).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  if (!available) {
    return (
      <p className="text-xs mt-1.5 leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        <strong>Not on the catalog right now.</strong>{' '}
        {isSale
          ? <>Sinclair&rsquo;s is not running a sale week
              {typeof settings.sale_rail_upstream_count === 'number'
                ? <> ({settings.sale_rail_upstream_count} items in their sale set)</>
                : null}
              , so ours is down too. It comes back on its own the night theirs does.</>
          : <>The last sync could not build this rail. It returns on its own once it can.</>}
        {checked ? <> Last checked {checked}.</> : null}
      </p>
    );
  }

  if (!on) {
    return (
      <p className="text-xs mt-1.5 text-gray-400">
        Sinclair&rsquo;s is running this &mdash; it is off because this switch is off.
        {checked ? <> Last checked {checked}.</> : null}
      </p>
    );
  }

  return (
    <p className="text-xs mt-1.5 text-brand-green/70">
      Live on the catalog.
      {isSale && typeof settings.sale_rail_upstream_count === 'number'
        ? <> {settings.sale_rail_upstream_count.toLocaleString()} items in Sinclair&rsquo;s sale set.</>
        : null}
      {checked ? <> Last checked {checked}.</> : null}
    </p>
  );
}
