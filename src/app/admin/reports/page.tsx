'use client';
// src/app/admin/reports/page.tsx
// Two tabs:
//   Billing   (default) — end-of-month workflow for Mary: fulfilled orders for
//                         the month, grouped by company, checkbox selection,
//                         per-company CSV export + combined export.
//   Analytics           — charts, top products, revenue trend (unchanged).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, RefreshCw, Download, FileText, TrendingUp, ShoppingBag,
  DollarSign, Package, Calendar, Star, Repeat, ChevronDown, ChevronRight,
  Receipt, BarChart3, CheckSquare, Square,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fetchAdminSession, canAccess, adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';

// ─── Analytics types ──────────────────────────────────────────
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

// ─── Billing types ────────────────────────────────────────────
interface BillingItem {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  uom: string | null;
  upc: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  shopping_status: 'pending' | 'shopped' | 'out_of_stock';
  actual_total: number | null;
  actual_weight: number | null;
  is_substitution: boolean;
  substitutes_item_id: string | null;
  item_type: 'grocery' | 'service';
  service_type: string | null;
  paid_by: 'vessel' | 'cod';
  cod_name: string | null;
}
interface BillingOrder {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string;
  customer_email: string | null;
  po_number: string | null;
  vessel_name: string | null;
  subtotal: number;
  status: string;
  created_at: string;
  extended_info: { personal_cod_notes?: string } | null;
  items: BillingItem[];
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

// ─── Billing helpers ──────────────────────────────────────────
// Bill by company + vessel: Ingram has 15+ boats, each invoiced separately
// ("Ingram — Jenny Kay", "Ingram — [next boat]"). Falls back to the company
// name alone when the order has no vessel name.
function billingGroupLabel(o: BillingOrder): string {
  return o.vessel_name ? `${o.company_name} — ${o.vessel_name}` : o.company_name;
}

function groupOrders(orders: BillingOrder[]): [string, BillingOrder[]][] {
  const map = new Map<string, BillingOrder[]>();
  for (const o of orders) {
    const key = billingGroupLabel(o);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// Grocery lines the company actually gets invoiced for — COD lines are
// settled at delivery and NEVER appear on the monthly invoice.
function billableItems(o: BillingOrder): BillingItem[] {
  return o.items.filter(i => i.item_type !== 'service' && i.paid_by !== 'cod');
}
function codLines(o: BillingOrder): BillingItem[] {
  return o.items.filter(i => i.item_type !== 'service' && i.paid_by === 'cod');
}
// Invoiceable estimate for an order: delivered vessel-account lines at actual
// (weighed) totals when available, estimated otherwise.
function vesselTotal(o: BillingOrder): number {
  return billableItems(o)
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + Number(i.actual_total ?? i.line_total), 0);
}

// ─── CSV helpers (client-side, per-vessel billing export) ────
function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Item-level export: one row per grocery line so Mary Karen can cross-reference
// every item, quantity, and estimated-vs-actual price against Sinclair's
// receipts before an invoice goes out. COD lines are excluded (noted per order).
function billingCsv(orders: BillingOrder[]): string {
  const header = [
    'Bill To (Company — Vessel)', 'Order #', 'Order Date', 'Order Status', 'PO #', 'Contact', 'Billing Email',
    'Item', 'UPC', 'Category', 'Pack', 'Qty', 'Unit Price', 'Estimated Line Total',
    'Shopped Status', 'Substitution', 'Actual Weight (lb)', 'Actual Line Total',
  ].map(csvEscape).join(',') + '\n';

  const rows: string[] = [];
  for (const o of orders) {
    const group = billingGroupLabel(o);
    const grocery = billableItems(o);
    const cods = codLines(o);
    const services = o.items.filter(i => i.item_type === 'service');
    const outOfStockMap = new Map(
      o.items.filter(i => i.item_type !== 'service' && i.shopping_status === 'out_of_stock').map(i => [i.id, i.description])
    );

    for (const i of grocery) {
      rows.push([
        group, o.order_number, new Date(o.created_at).toLocaleDateString(), o.status.replace('_', ' '),
        o.po_number || '', o.contact_name, o.customer_email || '',
        i.description, i.upc || '', i.category || '', i.pkg_size || '', i.quantity,
        Number(i.unit_price).toFixed(2), Number(i.line_total).toFixed(2),
        i.shopping_status.replace('_', ' '),
        i.is_substitution ? `sub for ${i.substitutes_item_id ? outOfStockMap.get(i.substitutes_item_id) || 'original item' : 'original item'}` : '',
        i.actual_weight ?? '',
        i.actual_total != null ? Number(i.actual_total).toFixed(2) : '',
      ].map(csvEscape).join(','));
    }

    // Per-service note rows (no fixed price — confirmed at fulfillment)
    for (const s of services) {
      rows.push([
        group, o.order_number, new Date(o.created_at).toLocaleDateString(), o.status.replace('_', ' '),
        o.po_number || '', o.contact_name, o.customer_email || '',
        `${s.description} — additional service, confirm charge`, '', 'Additional Services', '', 1,
        '', '', '', '', '', '',
      ].map(csvEscape).join(','));
    }

    // Order summary row
    rows.push([
      group, o.order_number, new Date(o.created_at).toLocaleDateString(), o.status.replace('_', ' '),
      o.po_number || '', o.contact_name, o.customer_email || '',
      `ORDER TOTAL${cods.length ? ` (${cods.length} COD item${cods.length > 1 ? 's' : ''} excluded — settled at delivery)` : ''}`,
      '', '', '', grocery.reduce((s, i) => s + i.quantity, 0),
      '', vesselTotal(o).toFixed(2), '', '', '', '',
    ].map(csvEscape).join(','));
  }
  return header + rows.join('\n') + '\n';
}

// ─── Branded billing statement (print-ready HTML, one page per company) ───
const GREEN = '#1E3D1E', LIME = '#D9E84A', ORANGE = '#E8640A';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(n: number): string {
  return `$${Number(n).toFixed(2)}`;
}

function statementHtml(companies: [string, BillingOrder[]][], monthLabel: string): string {
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const companyBlocks = companies.map(([company, orders], ci) => {
    const first = orders[0];
    const estTotal = orders.reduce((s, o) => s + vesselTotal(o), 0);

    const orderRows = orders.map(o => {
      const grocery = billableItems(o);
      const services = o.items.filter(i => i.item_type === 'service');
      const oos = new Map(o.items.filter(i => i.item_type !== 'service' && i.shopping_status === 'out_of_stock').map(i => [i.id, i.description]));
      const delivered = grocery.filter(i => i.shopping_status !== 'out_of_stock');
      const orderedQty = grocery.filter(i => !i.is_substitution).reduce((s, i) => s + i.quantity, 0);
      const deliveredQty = delivered.reduce((s, i) => s + i.quantity, 0);
      const subs = delivered.filter(i => i.is_substitution)
        .map(i => `${esc(i.description)} <span style="color:${ORANGE};">(sub for ${esc(i.substitutes_item_id ? oos.get(i.substitutes_item_id) || 'original item' : 'original item')})</span>`);
      const weightItems = delivered.filter(i => i.actual_weight)
        .map(i => `${esc(i.description)} — ${i.actual_weight} lb actual (${money(i.actual_total ?? i.line_total)})`);
      const svcList = services.map(i => esc(i.description));
      const cod = o.extended_info?.personal_cod_notes;
      const codItems = codLines(o);

      const notes: string[] = [];
      if (subs.length) notes.push(`<strong>Substitutions:</strong> ${subs.join('; ')}`);
      if (weightItems.length) notes.push(`<strong>Weighed items:</strong> ${weightItems.join('; ')}`);
      if (svcList.length) notes.push(`<strong>Additional services (confirm charges):</strong> ${svcList.join('; ')}`);
      if (codItems.length) notes.push(`<strong style="color:#9333ea;">COD — settled at delivery, do NOT invoice:</strong> ${codItems.map(i => `${i.quantity}× ${esc(i.description)} (${esc(i.cod_name || 'crew member')})`).join('; ')}`);
      if (cod) notes.push(`<strong style="color:#9333ea;">Personal / COD — do NOT invoice:</strong> ${esc(cod)}`);

      return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">
          <div style="font-family:monospace;font-weight:800;color:${GREEN};font-size:12px;">${esc(o.order_number)}</div>
          ${o.vessel_name ? `<div style="font-size:10px;color:#666;">${esc(o.vessel_name)}</div>` : ''}
          ${o.po_number ? `<div style="font-size:10px;color:#666;">PO #${esc(o.po_number)}</div>` : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:11px;color:#555;white-space:nowrap;">
          ${new Date(o.created_at).toLocaleDateString()}
          ${o.status !== 'fulfilled' ? `<div style="font-size:9px;font-weight:800;color:#b45309;text-transform:uppercase;">${esc(o.status.replace('_', ' '))}</div>` : ''}
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">${orderedQty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">${o.status === 'fulfilled' ? deliveredQty : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;font-weight:700;text-align:right;color:${GREEN};">${money(vesselTotal(o))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">
          <div style="border:1.5px solid #bbb;border-radius:3px;height:22px;width:90px;margin-left:auto;"></div>
        </td>
      </tr>
      ${notes.length ? `<tr><td colspan="6" style="padding:2px 10px 10px 22px;border-bottom:1px solid #eee;font-size:10px;color:#555;line-height:1.6;background:#fafaf5;">${notes.join('<br>')}</td></tr>` : ''}`;
    }).join('');

    return `
<div style="${ci > 0 ? 'page-break-before:always;' : ''}max-width:760px;margin:0 auto;padding:8px 0 32px;">
  <!-- Brand header -->
  <table width="100%" style="border-collapse:collapse;background:${GREEN};border-radius:6px 6px 0 0;">
    <tr>
      <td style="padding:18px 22px;">
        <div style="font-size:19px;font-weight:900;color:${LIME};text-transform:uppercase;letter-spacing:-0.5px;">Grafton Towboat Services</div>
        <div style="font-size:9px;font-weight:700;color:${ORANGE};letter-spacing:1px;">GROCERIES, SUPPLIES &amp; CREW CHANGE</div>
        <div style="font-size:9px;color:#a8c86a;margin-top:5px;line-height:1.6;">
          25 Dagget Hollow · Grafton, IL 62037 · Mile Marker 219 Mississippi River / Mile Marker 0 Illinois River<br>
          (618) 556-0290 · GraftonTowboatServices@gmail.com
        </div>
      </td>
      <td style="padding:18px 22px;text-align:right;vertical-align:top;">
        <div style="font-size:13px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:1.5px;">Monthly Billing<br>Statement</div>
        <div style="font-size:10px;color:#a8c86a;margin-top:5px;">${esc(monthLabel)}<br>Generated ${generated}</div>
      </td>
    </tr>
  </table>

  <!-- Bill to -->
  <table width="100%" style="border-collapse:collapse;background:#f8fde8;border-left:4px solid ${GREEN};">
    <tr>
      <td style="padding:12px 22px;">
        <div style="font-size:8px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1px;">Bill To</div>
        <div style="font-size:16px;font-weight:900;color:${GREEN};">${esc(company)}</div>
        <div style="font-size:10px;color:#555;">${esc(first.contact_name)}${first.phone ? ` · ${esc(first.phone)}` : ''}${first.customer_email ? ` · ${esc(first.customer_email)}` : ''}</div>
      </td>
      <td style="padding:12px 22px;text-align:right;">
        <div style="font-size:8px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1px;">Orders This Period</div>
        <div style="font-size:16px;font-weight:900;color:${GREEN};">${orders.length}</div>
      </td>
    </tr>
  </table>

  <!-- Orders table -->
  <table width="100%" style="border-collapse:collapse;margin-top:14px;">
    <thead>
      <tr style="background:${GREEN};">
        <th style="padding:7px 10px;text-align:left;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Order / Vessel / PO</th>
        <th style="padding:7px 10px;text-align:left;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Date</th>
        <th style="padding:7px 10px;text-align:center;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Ordered</th>
        <th style="padding:7px 10px;text-align:center;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Delivered</th>
        <th style="padding:7px 10px;text-align:right;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Estimated Total</th>
        <th style="padding:7px 10px;text-align:right;color:${LIME};font-size:8px;text-transform:uppercase;letter-spacing:0.8px;">Final Total</th>
      </tr>
    </thead>
    <tbody>${orderRows}</tbody>
  </table>

  <!-- Totals -->
  <table width="100%" style="border-collapse:collapse;margin-top:14px;">
    <tr>
      <td width="55%"></td>
      <td>
        <table width="100%" style="border-collapse:collapse;border-top:3px solid ${GREEN};">
          <tr>
            <td style="padding:7px 10px;font-size:11px;color:#555;">Estimated Total (${orders.length} order${orders.length === 1 ? '' : 's'})</td>
            <td style="padding:7px 10px;text-align:right;font-weight:800;font-size:13px;color:${GREEN};">${money(estTotal)}</td>
          </tr>
          <tr style="background:${LIME};">
            <td style="padding:9px 10px;font-size:12px;font-weight:900;color:${GREEN};text-transform:uppercase;">Final Invoice Total</td>
            <td style="padding:9px 10px;text-align:right;"><div style="border:1.5px solid ${GREEN};border-radius:3px;height:24px;width:110px;margin-left:auto;background:#fff;"></div></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Notes -->
  <div style="margin-top:14px;border-left:3px solid ${ORANGE};background:#fffbf0;padding:9px 14px;font-size:9px;color:#555;line-height:1.7;">
    <strong style="color:${ORANGE};">Final Total notes:</strong> estimated totals reflect catalog prices at order time.
    Enter the final amount after confirming weighed items (billed at actual weight), substitutions,
    and any additional service or delivery charges. Personal / COD items were paid by the crew on
    delivery and must not be invoiced.
  </div>

  <div style="text-align:center;font-size:8px;color:#aaa;border-top:1px solid #eee;margin-top:18px;padding-top:8px;">
    Grafton Towboat Services · ${esc(monthLabel)} Billing Statement · ${esc(company)} · Generated ${generated}
  </div>
</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Billing Statements — ${esc(monthLabel)} — Grafton Towboat Services</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#222; background:#fff; padding:24px 16px; }
  @page { size:letter; margin:0.5in; }
  @media print { .no-print { display:none !important; } body { padding:0; print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
  .print-btn { position:fixed; top:16px; right:16px; background:${GREEN}; color:${LIME}; border:none; padding:10px 22px; border-radius:24px; font-size:13px; font-weight:800; cursor:pointer; text-transform:uppercase; letter-spacing:1px; box-shadow:0 4px 12px rgba(0,0,0,0.2); z-index:10; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">&#128424; Print / Save PDF</button>
${companyBlocks}
</body>
</html>`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company';
}

// ══════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const router = useRouter();
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'billing' | 'analytics'>('billing');

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'reports')) { setDenied(true); return; }
      setReady(true);
    })();
  }, [router]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Reports</h1>
          <p className="text-gray-400 text-sm">
            {tab === 'billing' ? 'Monthly billing exports for QuickBooks invoicing' : 'Business performance & analytics'}
          </p>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setTab('billing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === 'billing' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-brand-navy'
            }`}>
            <Receipt className="w-4 h-4" /> Billing
          </button>
          <button onClick={() => setTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === 'analytics' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-brand-navy'
            }`}>
            <BarChart3 className="w-4 h-4" /> Analytics
          </button>
        </div>
      </div>

      {ready && (tab === 'billing' ? <BillingTab /> : <AnalyticsTab />)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BILLING TAB
// ══════════════════════════════════════════════════════════════
function BillingTab() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPending, setShowPending] = useState(false);
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());

  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const from = new Date(y, m - 1, 1, 0, 0, 0).toISOString();
    const to = new Date(y, m, 0, 23, 59, 59).toISOString(); // last day of month
    return { from, to };
  }, [month]);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const res = await adminFetch(`/api/admin/reports/billing?${params}`);
      if (res.ok) {
        const { orders: data } = await res.json();
        setOrders(data || []);
        // Default selection: all fulfilled orders
        setSelected(new Set((data || []).filter((o: BillingOrder) => o.status === 'fulfilled').map((o: BillingOrder) => o.id)));
      }
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  const fulfilled = orders.filter(o => o.status === 'fulfilled');
  const pending = orders.filter(o => o.status === 'new' || o.status === 'in_progress');

  // Group fulfilled orders by company + vessel (Ingram bills per boat)
  const byCompany = useMemo(() => groupOrders(fulfilled), [fulfilled]);

  function toggleOrder(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleCompany(companyOrders: BillingOrder[]) {
    const allSelected = companyOrders.every(o => selected.has(o.id));
    setSelected(prev => {
      const next = new Set(prev);
      companyOrders.forEach(o => allSelected ? next.delete(o.id) : next.add(o.id));
      return next;
    });
  }
  function toggleCollapse(company: string) {
    setCollapsedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company); else next.add(company);
      return next;
    });
  }

  const selectedOrders = orders.filter(o => selected.has(o.id));

  // Export: one CSV per company+vessel (sequential downloads), plus combined option
  async function exportPerCompany() {
    let delay = 0;
    for (const [group, groupOrdersList] of groupOrders(selectedOrders)) {
      const filename = `billing_${month}_${slug(group)}.csv`;
      const csv = billingCsv(groupOrdersList);
      // Stagger downloads slightly so browsers don't drop them
      setTimeout(() => downloadCsv(filename, csv), delay);
      delay += 350;
    }
  }
  function exportCombined() {
    downloadCsv(`billing_${month}_all-vessels.csv`, billingCsv(selectedOrders));
  }

  // Branded print-ready statements — one page per company+vessel, Final Total
  // boxes left blank for Mary to fill after confirming weights/services.
  function openStatements() {
    const monthLabel = new Date(month + '-01T00:00:00')
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const html = statementHtml(groupOrders(selectedOrders), monthLabel);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  const selCompanyCount = new Set(selectedOrders.map(o => billingGroupLabel(o))).size;

  return (
    <>
      {/* Month picker + export actions */}
      <div className="card-base p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="input-base text-sm py-1.5 w-44" />
        </div>
        <button onClick={fetchBilling} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">
            {selected.size} order{selected.size !== 1 ? 's' : ''} · {selCompanyCount} compan{selCompanyCount === 1 ? 'y' : 'ies'} selected
          </span>
          <button onClick={openStatements} disabled={selected.size === 0}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50">
            <FileText className="w-4 h-4" /> Billing Statements (PDF)
          </button>
          <button onClick={exportPerCompany} disabled={selected.size === 0}
            className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-4 h-4" /> CSVs (per company)
          </button>
          <button onClick={exportCombined} disabled={selected.size === 0}
            className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
            <FileText className="w-4 h-4" /> All in one CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-river" />
        </div>
      ) : (
        <>
          {/* Fulfilled orders grouped by company */}
          {byCompany.length === 0 ? (
            <div className="card-base p-10 text-center text-gray-400 text-sm">
              No fulfilled orders in this month yet.
            </div>
          ) : (
            <div className="space-y-3">
              {byCompany.map(([company, companyOrders]) => {
                const collapsed = collapsedCompanies.has(company);
                const allSelected = companyOrders.every(o => selected.has(o.id));
                const companyTotal = companyOrders.filter(o => selected.has(o.id)).reduce((s, o) => s + vesselTotal(o), 0);
                const codCount = companyOrders.reduce((s, o) => s + codLines(o).length, 0);
                return (
                  <div key={company} className="card-base overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-brand-sand/30 border-b border-gray-100">
                      <button onClick={() => toggleCompany(companyOrders)} aria-label="Select all for company"
                        className="text-brand-navy">
                        {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button onClick={() => toggleCollapse(company)}
                        className="flex-1 flex items-center gap-2 text-left">
                        {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        <span className="font-bold text-brand-navy text-sm">{company}</span>
                        <span className="text-xs text-gray-400">{companyOrders.length} fulfilled order{companyOrders.length !== 1 ? 's' : ''}</span>
                        {codCount > 0 && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                            {codCount} COD line{codCount > 1 ? 's' : ''} excluded
                          </span>
                        )}
                      </button>
                      <span className="text-sm font-bold text-brand-navy">{formatCurrency(companyTotal)}</span>
                    </div>
                    {!collapsed && (
                      <BillingOrderTable orders={companyOrders} selected={selected} onToggle={toggleOrder} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Collapsible pending orders panel */}
          <div className="card-base overflow-hidden">
            <button onClick={() => setShowPending(s => !s)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              {showPending ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className="font-bold text-brand-navy text-sm">Include pending orders</span>
              <span className="text-xs text-gray-400">
                {pending.length} open / in-progress order{pending.length !== 1 ? 's' : ''} this month — check any to add them to the export
              </span>
            </button>
            {showPending && (
              pending.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-gray-400">No pending orders in this month.</p>
              ) : (
                <div className="border-t border-gray-100">
                  <BillingOrderTable orders={pending} selected={selected} onToggle={toggleOrder} showCompany showStatus />
                </div>
              )
            )}
          </div>

          <p className="text-xs text-gray-400">
            Statements and CSVs group by <strong>company + vessel</strong> (e.g. &ldquo;Ingram — Jenny Kay&rdquo;), one
            invoice per boat. Exports list <strong>every grocery line</strong> — item, qty, estimated vs. actual — so you
            can cross-reference against Sinclair&apos;s receipts before invoicing. <strong>COD items are excluded</strong>:
            they&apos;re settled at delivery and never invoiced. The statement&apos;s Final Total box stays blank on purpose —
            fill it in after confirming weighed items and service charges.
          </p>
        </>
      )}
    </>
  );
}

function BillingOrderTable({ orders, selected, onToggle, showCompany = false, showStatus = false }: {
  orders: BillingOrder[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  showCompany?: boolean;
  showStatus?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="px-4 py-2 w-8"></th>
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Order #</th>
            {showCompany && <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Company</th>}
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Contact</th>
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Ordered</th>
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Delivered</th>
            {showStatus && <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>}
            <th className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Est. Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map(o => {
            const grocery = billableItems(o);
            const codCount = codLines(o).length;
            const orderedQty = grocery.filter(i => !i.is_substitution).reduce((s, i) => s + i.quantity, 0);
            const delivered = grocery.filter(i => i.shopping_status !== 'out_of_stock');
            const deliveredQty = delivered.reduce((s, i) => s + i.quantity, 0);
            const subCount = delivered.filter(i => i.is_substitution).length;
            const svcCount = o.items.filter(i => i.item_type === 'service').length;
            return (
              <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onToggle(o.id)}>
                <td className="px-4 py-2.5">
                  {selected.has(o.id)
                    ? <CheckSquare className="w-4 h-4 text-brand-green" />
                    : <Square className="w-4 h-4 text-gray-300" />}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs font-bold text-brand-navy">{o.order_number}</td>
                {showCompany && <td className="px-4 py-2.5 text-xs text-brand-navy font-semibold">{o.company_name}</td>}
                <td className="px-4 py-2.5 text-xs text-gray-600">
                  {o.contact_name}
                  <span className="block text-[10px] text-gray-400">
                    {[o.phone, o.customer_email].filter(Boolean).join(' · ')}
                  </span>
                  {(o.vessel_name || o.po_number) && (
                    <span className="block text-[10px] text-gray-400">
                      {[o.vessel_name, o.po_number ? `PO #${o.po_number}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-xs">
                  {orderedQty} items{svcCount > 0 && <span className="text-gray-400"> +{svcCount} svc</span>}
                  {codCount > 0 && <span className="text-purple-600 font-semibold"> +{codCount} COD</span>}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {o.status === 'fulfilled'
                    ? <>{deliveredQty} items{subCount > 0 && <span className="text-brand-orange font-semibold"> ({subCount} sub{subCount > 1 ? 's' : ''})</span>}</>
                    : <span className="text-gray-400 italic">—</span>}
                </td>
                {showStatus && (
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      o.status === 'new' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                    }`}>{o.status.replace('_', ' ')}</span>
                  </td>
                )}
                <td className="px-4 py-2.5 text-right font-bold text-brand-navy whitespace-nowrap">{formatCurrency(vesselTotal(o))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS TAB (previously the whole Reports page)
// ══════════════════════════════════════════════════════════════
function AnalyticsTab() {
  const [preset, setPreset] = useState<PresetKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [productCategoryFilter, setProductCategoryFilter] = useState('All');

  const range = useMemo(() => getPresetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const res = await adminFetch(`/api/admin/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [range.from, range.to]);

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

  const filteredProducts = data?.topProducts.filter(p =>
    productCategoryFilter === 'All' || p.category === productCategoryFilter
  ) || [];

  const productCategories = ['All', ...Array.from(new Set(data?.topProducts.map(p => p.category) || []))];

  return (
    <>
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {new Date(range.from).toLocaleDateString()} – {new Date(range.to).toLocaleDateString()}
            </span>
            <button onClick={fetchReport} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={exportPdf} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
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
    </>
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
