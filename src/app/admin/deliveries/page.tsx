'use client';
// src/app/admin/deliveries/page.tsx
// The delivery ledger — Mary/Jen's "DELIVERIES" spreadsheet, in the app.
// Monthly view, add/edit a delivery with rate auto-fill from the company's
// rate card, and an editable rate-card manager. No more Google Drive.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Plus, Pencil, Trash2, X, Loader2, DollarSign, Check, SlidersHorizontal, FileText, Search, Download, Receipt } from 'lucide-react';
import QbPackPanel from '@/components/admin/QbPackPanel';
import { formatCurrency } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { vesselKey, canonicalVesselName, vesselSuggestions } from '@/lib/vessel';
import { buildQbHandoff } from '@/lib/quickbooks-handoff';

interface Company { id: string; name: string; is_active: boolean; }
interface ServiceType { id: string; name: string; default_rate: number; sort: number; }
interface Override { company_id: string; service_type_id: string; rate: number; }
/** One boat's own rate — beats the company rate. See migration 062. */
interface VesselRate {
  company_id: string; service_type_id: string;
  vessel_key: string; vessel_label: string; rate: number;
}
interface Delivery {
  id: string;
  delivery_date: string | null;
  delivery_driver: string | null;
  hours_worked: number | null;
  amount_paid_driver: number | null;
  vessel_name: string | null;
  company_id: string | null;
  company?: { id: string; name: string; requires_signed_receipt?: boolean } | null;
  service_type: string | null;
  location_delivered: string | null;
  delivery_fee: number | null;
  bill_for_groceries: boolean | null;
  sinclairs_grocery_total: number | null;
  updated_quickbooks: boolean | null;
  // Migration 074 — the QuickBooks handoff.
  grocery_mode: 'none' | 'sinclair_courtesy' | 'gts_purchased';
  side_purchases: Array<{ description: string; amount: number }> | null;
  customer_invoiced_in_qb: boolean | null;
  driver_paid_in_qb: boolean | null;
  not_billable: boolean | null;
  not_billable_reason: string | null;
  po_number: string | null;
  phone_number_used: string | null;
  issues_comments: string | null;
  gts_correspondent: string | null;
  invoice_sent: string | null;
  incentive: string | null;
  sinclairs_receipt_url: string | null;
  /** The signed delivery log photo. NOTE THE NAME — the ledger column is
   *  `ingram_slip_image_url` (migration 044); only `orders` calls it
   *  `ingram_slip_url` (047). This was typed as the orders spelling, which
   *  reads undefined against a ledger row, so the Slip link never rendered
   *  and every Ingram delivery was permanently stuck in "need attention". */
  ingram_slip_image_url: string | null;
  /** Set when this row came from a web order (migration 064). NULL = typed in
   *  by hand — a phone or paper order. */
  order_id: string | null;
}

// Deliveries began January 2026 — never offer a month before that.
const LEDGER_YEAR = 2026;

export default function DeliveriesPage() {
  // 'all' = whole-year list (default); otherwise a specific 'YYYY-MM'.
  const [month, setMonth] = useState<string>('all');
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [editing, setEditing] = useState<Delivery | 'new' | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [showQb, setShowQb] = useState(false);
  const [search, setSearch] = useState('');
  // Badge count comes from the SAME query the queue opens with (all months,
  // not just the view on screen) — otherwise the badge promises rows the queue
  // doesn't show.
  const [pendingQbCount, setPendingQbCount] = useState(0);
  const loadPendingCount = useCallback(async () => {
    const res = await adminFetch('/api/admin/deliveries?pending=1');
    if (!res.ok) return;
    const ds = ((await res.json()).deliveries || []) as Delivery[];
    setPendingQbCount(ds.filter(d => Number(d.delivery_fee) > 0 || d.bill_for_groceries).length);
  }, []);
  useEffect(() => { loadPendingCount(); }, [loadPendingCount]);

  // "Which delivery was that?" — vessel first, since a company can run 15+
  // boats and the boat is how everyone actually refers to a delivery.
  //
  // Three of the searched fields aren't columns in the table (location, GTS
  // contact, notes). A Reliant row surfacing in an "ingram" search is CORRECT
  // when the Ingram fleet is the delivery location — but it reads as a broken
  // filter, so rows matched only on a hidden field say which one.
  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return rows.map(d => ({ d, via: null as string | null }));
    const hidden: [keyof Delivery, string][] = [
      ['location_delivered', 'location'],
      ['gts_correspondent', 'GTS contact'],
      ['issues_comments', 'notes'],
    ];
    const out: { d: Delivery; via: string | null }[] = [];
    for (const d of rows) {
      const onScreen = [d.vessel_name, d.company?.name, d.service_type, d.delivery_driver, d.delivery_date]
        .some(v => (v || '').toString().toLowerCase().includes(q));
      const hit = hidden.find(([f]) => (d[f] || '').toString().toLowerCase().includes(q));
      if (onScreen) out.push({ d, via: null });
      else if (hit) out.push({ d, via: hit[1] });
    }
    return out;
  }, [rows, q]);
  const visibleRows = useMemo(() => matches.map(m => m.d), [matches]);

  // TOTALS ARE DERIVED FROM WHAT'S ON SCREEN — never fetched separately.
  //
  // They used to come straight from the API, which only knows about the month
  // filter. Searching "Ingram" filtered the table but left the cards showing
  // the whole year: 132 deliveries for every search term, which is how this got
  // caught in front of Jen. The API returns every row for the period (no
  // pagination), so summing the visible rows is exactly the same arithmetic —
  // with one source of truth instead of two that can disagree.
  const totals = useMemo(() => ({
    count: visibleRows.length,
    delivery_fees: visibleRows.reduce((s, r) => s + Number(r.delivery_fee || 0), 0),
    groceries: visibleRows.reduce((s, r) => s + Number(r.sinclairs_grocery_total || 0), 0),
    driver_pay: visibleRows.reduce((s, r) => s + Number(r.amount_paid_driver || 0), 0),
  }), [visibleRows]);

  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const q = month === 'all' ? `year=${LEDGER_YEAR}` : `month=${month}`;
    const res = await adminFetch(`/api/admin/deliveries?${q}`);
    if (res.ok) { const d = await res.json(); setRows(d.deliveries); }
    setLoading(false);
  }, [month]);

  const loadMeta = useCallback(async () => {
    const [c, s] = await Promise.all([
      adminFetch('/api/admin/companies'),
      adminFetch('/api/admin/service-rates'),
    ]);
    if (c.ok) setCompanies((await c.json()).companies);
    if (s.ok) setServiceTypes((await s.json()).service_types);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  async function remove(d: Delivery) {
    if (!(await confirm({ title: `Delete this delivery?`, message: `${d.delivery_date || ''} · ${d.vessel_name || ''} — this can't be undone.`, danger: true }))) return;
    await adminFetch('/api/admin/deliveries', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) });
    load();
  }

  // Filter options: "All of 2026" first, then Jan 2026 up to the current month
  // (never before the ledger's Jan-2026 start, never into empty future months).
  const now = new Date();
  const lastMonth = now.getFullYear() > LEDGER_YEAR ? 12 : now.getMonth() + 1;
  const monthOpts = [
    { v: 'all', label: `All of ${LEDGER_YEAR}` },
    ...Array.from({ length: lastMonth }, (_, i) => {
      const m = i + 1;
      const v = `${LEDGER_YEAR}-${String(m).padStart(2, '0')}`;
      return { v, label: new Date(LEDGER_YEAR, i, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
    }).reverse(),
  ];

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-green" /> Delivery Ledger
          </h1>
          <p className="text-gray-400 text-sm">Your deliveries spreadsheet — logged and billed here, no Google Drive.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search boat, company, driver…"
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm w-56" />
          </div>
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-brand-navy">
            {monthOpts.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
          <button onClick={() => setShowRates(true)} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4" /> Rate Cards
          </button>
          <button onClick={() => setShowQb(true)}
            title="Everything still waiting to be entered into QuickBooks"
            className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 border-brand-gold/60">
            <FileText className="w-4 h-4" /> QuickBooks Queue
            {pendingQbCount > 0 && (
              <span className="text-[10px] font-bold bg-brand-gold text-brand-navy rounded-full px-1.5">{pendingQbCount}</span>
            )}
          </button>
          <button onClick={() => setEditing('new')} className="bg-brand-green text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-brand-gmed">
            <Plus className="w-4 h-4" /> Add Delivery
          </button>
        </div>
      </div>

      {/* Summary — always reflects the rows below, search included. The label
          says so out loud, so nobody has to wonder which number is real. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Deliveries', val: totals.count, money: false },
          { label: 'Delivery Fees', val: totals.delivery_fees, money: true },
          { label: "Sinclair's Groceries", val: totals.groceries, money: true },
          { label: 'Driver Pay', val: totals.driver_pay, money: true },
        ].map(s => (
          <div key={s.label} className={`card-base p-4 ${q ? 'border-brand-gold/50 bg-brand-sand/20' : ''}`}>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
              {s.label}
              {q && (
                <span className="text-[9px] font-bold text-brand-navy bg-brand-gold/40 rounded px-1 py-0.5 normal-case tracking-normal">
                  filtered
                </span>
              )}
            </p>
            <p className="text-xl font-bold text-brand-navy mt-1">{s.money ? formatCurrency(s.val) : s.val}</p>
          </div>
        ))}
      </div>
      {q && (
        <p className="-mt-3 mb-4 text-xs text-gray-500">
          Showing <span className="font-bold text-brand-navy">{totals.count}</span> of{' '}
          <span className="font-semibold">{rows.length}</span> deliveries matching{' '}
          &ldquo;<span className="font-semibold text-brand-navy">{search}</span>&rdquo;
          {month === 'all' ? ` in ${LEDGER_YEAR}` : ''}.{' '}
          <button onClick={() => setSearch('')} className="text-brand-river font-semibold hover:underline">
            Clear search
          </button>
        </p>
      )}

      {/* Ledger table */}
      <div className="card-base overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : visibleRows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {search
              ? <>No deliveries match &ldquo;{search}&rdquo; in this view. Try &ldquo;All of {LEDGER_YEAR}&rdquo;.</>
              : 'No deliveries logged for this month yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-green/95 text-white text-left text-xs uppercase tracking-wide">
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Vessel</th>
                <th className="px-3 py-2.5">Service</th>
                <th className="px-3 py-2.5 text-right">Fee</th>
                <th className="px-3 py-2.5 text-right">Groceries</th>
                <th className="px-3 py-2.5">Billed?</th>
                <th className="px-3 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Invoice</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {matches.map(({ d, via }) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {d.delivery_date || '—'}
                    {/* Provenance. Jen needs to know at a glance which rows she
                        still has to fill in a driver for, and which arrived on
                        their own — and that editing an auto row is safe, because
                        the sync never overwrites her driver/pay/hours columns. */}
                    {d.order_id && (
                      <span className="block text-[10px] font-semibold text-brand-river mt-0.5"
                        title="Created automatically from a web order. Deleting the order removes this row. Your driver, hours and pay entries are never overwritten.">
                        from an online order
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-brand-navy">{d.company?.name || '—'}</td>
                  <td className="px-3 py-2.5">
                    {d.vessel_name || '—'}
                    {/* Why this row is here when nothing on screen says so. */}
                    {via && (
                      <span className="block text-[10px] text-amber-700 font-semibold mt-0.5"
                        title={`This row matched your search in its ${via} field, which isn't shown as a column.`}>
                        matched in {via}
                      </span>
                    )}
                  </td>
                  {/* Missing service or fee = this row can't be invoiced. It's
                      not an error — a delivery gets logged before the fee is
                      known — but it must be findable later. Amber, not red:
                      it's unfinished, not wrong. */}
                  <td className={`px-3 py-2.5 ${d.service_type ? 'text-gray-600' : 'bg-amber-50 text-amber-700 font-semibold'}`}>
                    {d.service_type || 'no service'}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${d.delivery_fee == null ? 'bg-amber-50 text-amber-700' : ''}`}>
                    {d.delivery_fee != null ? formatCurrency(d.delivery_fee) : 'no fee'}
                  </td>
                  {/* GROCERIES: em dash when GTS isn't billing them.
                      A figure here on a not-billed row read as money owed and
                      invited double-charging a boat that pays Sinclair's
                      direct. If we're not billing it, the number is Sinclair's
                      business and doesn't belong in a GTS money column. */}
                  <td className="px-3 py-2.5 text-right">
                    {d.bill_for_groceries
                      ? (d.sinclairs_grocery_total != null
                          ? formatCurrency(d.sinclairs_grocery_total)
                          : <span className="text-red-600 font-semibold text-xs">missing</span>)
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">{d.bill_for_groceries ? <span className="text-green-700 font-bold text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.delivery_driver || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{d.invoice_sent ? <span className="text-green-700">Sent {d.invoice_sent}</span> : <span className="text-amber-600 font-semibold">Not sent</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(d)} className="p-1 text-gray-400 hover:text-brand-navy"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(d)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <DeliveryEditor
          delivery={editing === 'new' ? null : editing}
          companies={companies}
          serviceTypes={serviceTypes}
          vesselRecords={rows}
          onClose={() => setEditing(null)}
          // loadMeta too: saving may have created a new barge line, and it has
          // to appear in the pick list and rate cards straight away.
          onSaved={() => { setEditing(null); load(); loadMeta(); }}
        />
      )}
      {showQb && (
        <QuickBooksQueue
          onClose={() => setShowQb(false)}
          onEntered={() => { load(); loadPendingCount(); }}
        />
      )}
      {showRates && (
        <RateCardEditor companies={companies} serviceTypes={serviceTypes} deliveries={rows}
          onClose={() => setShowRates(false)} onChanged={loadMeta} />
      )}
    </div>
  );
}

// ── QuickBooks entry queue ───────────────────────────────────────────────
// QuickBooks stays the invoice system of record (it owns the numbering and the
// hosted pay link). What actually costs Mary Karen time is re-deriving each
// delivery's numbers from three places, hunting down two documents, and then
// tracking what's keyed in with coloured spreadsheet cells.
//
// THE UNIT ON SCREEN IS THE INVOICE, NOT THE DELIVERY.
// GTS bills one invoice per boat, so a boat's whole week is one invoice — and
// therefore one row of work here. Everything is grouped that way, which is what
// gets this to three actions per invoice instead of three per delivery:
//
//   1. Copy lines     → every line for that boat, tab-separated, straight down
//                       the QuickBooks line grid. Nothing is retyped.
//   2. Packet         → ONE PDF: the line summary, the signed logs and
//                       Sinclair's receipts. One attachment, not two, because
//                       a single file cannot be half-attached — and Ingram
//                       rejects an invoice that arrives missing the signed log.
//   3. Mark entered   → replaces the "Updated QuickBooks" spreadsheet column.
function QuickBooksQueue({ onClose, onEntered }: {
  onClose: () => void; onEntered: () => void;
}) {
  const [all, setAll] = useState<Delivery[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string>('');
  // Download failures are shown in place, next to the button that failed —
  // never as a browser dialog, and never swallowed.
  const [downloadError, setDownloadError] = useState<Record<string, string>>({});
  /** The delivery whose "For QuickBooks" pack is open, if any. */
  const [packFor, setPackFor] = useState<Delivery | null>(null);

  // Loads EVERY unentered delivery, not just the month on screen — being a
  // week behind at a month boundary must never hide work.
  const loadPending = useCallback(async () => {
    const res = await adminFetch('/api/admin/deliveries?pending=1');
    if (res.ok) setAll((await res.json()).deliveries as Delivery[]);
  }, []);
  useEffect(() => { loadPending(); }, [loadPending]);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(k => (k === key ? '' : k)), 1200);
  }

  /**
   * Mark rows invoiced in QuickBooks.
   *
   * ONE REQUEST FOR THE WHOLE BATCH. This used to loop and PATCH each row
   * individually, which meant a month-end batch of thirty was thirty round
   * trips — and a failure halfway through left half the batch marked with no
   * way to tell which half. The qb-status route takes an array and updates
   * them together.
   *
   * It also writes `customer_invoiced_in_qb`, not the old `updated_quickbooks`,
   * which conflated invoicing the barge line with paying the driver.
   */
  async function markEntered(ids: string[], key: string) {
    if (!ids.length) return;
    setBusy(key);
    try {
      await adminFetch('/api/admin/deliveries/qb-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, customer_invoiced_in_qb: true }),
      });
      await loadPending();
      onEntered();
    } finally { setBusy(null); }
  }

  /** Training runs, waived fees, helper-only rows — off the queue, still in the ledger. */
  async function markNotBillable(ids: string[], key: string, reason: string) {
    if (!ids.length) return;
    setBusy(key);
    try {
      await adminFetch('/api/admin/deliveries/qb-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, not_billable: true, not_billable_reason: reason }),
      });
      await loadPending();
      onEntered();
    } finally { setBusy(null); }
  }

  /** One boat's deliveries → the invoice lines and document set for them. */
  function handoffFor(ds: Delivery[], company: string, vessel: string) {
    return buildQbHandoff(
      ds.map(d => ({
        id: d.id,
        deliveryDate: d.delivery_date,
        vesselName: d.vessel_name,
        companyName: d.company?.name || null,
        serviceType: d.service_type,
        deliveryFee: d.delivery_fee,
        billForGroceries: d.bill_for_groceries,
        groceryTotal: d.sinclairs_grocery_total,
        poNumber: null,             // lives on the order; the packet fetches it
        locationDelivered: d.location_delivered,
        receiptUrl: d.sinclairs_receipt_url,
        slipUrl: d.ingram_slip_image_url,
      })),
      { companyLabel: company, vesselLabel: vessel },
    );
  }

  /**
   * The packet download has to go through adminFetch, not a plain link: the
   * session token lives in sessionStorage and a bare <a href> would arrive
   * unauthenticated. Fetch → blob → click a synthetic link keeps it one click
   * for her and zero new windows.
   */
  async function downloadPacket(ds: Delivery[], filenameHint: string, key: string) {
    setBusy(key);
    setDownloadError(e => { const n = { ...e }; delete n[key]; return n; });
    try {
      const res = await adminFetch(`/api/admin/deliveries/packet?ids=${ds.map(d => d.id).join(',')}`);
      if (!res.ok) {
        const msg = await res.json().then(j => j.error).catch(() => null);
        setDownloadError(e => ({ ...e, [key]: msg || `Could not build the packet (${res.status}).` }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Prefer the filename the server chose; fall back to the boat's name.
      const cd = res.headers.get('Content-Disposition') || '';
      a.download = /filename="([^"]+)"/.exec(cd)?.[1] || `${filenameHint}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick — revoking synchronously can cancel the
      // download in Safari before it starts.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError(e => ({ ...e, [key]: 'Could not reach the server. Check the connection and try again.' }));
    } finally {
      setBusy(null);
    }
  }

  // Ingram won't accept an invoice without the signed log, and a grocery-billed
  // line can't be keyed without Sinclair's total. Surface both as blockers up
  // front instead of letting her discover them mid-entry.
  function blockersFor(d: Delivery): string[] {
    const b: string[] = [];
    if (!d.company?.name) b.push('no company set');

    // Courtesy without a total under-bills by the largest number on the
    // invoice, and nothing downstream would catch it.
    if (d.grocery_mode === 'sinclair_courtesy') {
      if (!(Number(d.sinclairs_grocery_total) > 0)) b.push("Sinclair's total missing");
      if (!d.sinclairs_receipt_url) b.push("Sinclair's tape missing");
    }

    if (d.grocery_mode === 'gts_purchased' && !(d.side_purchases?.length)) {
      b.push('GTS-purchased but nothing itemised');
    }

    // PER COMPANY, not a hardcoded name test.
    //
    // This used to be /ingram/i, which flagged a missing slip on every row for
    // every customer whose name happened to match, and — worse — would have
    // gone on demanding one from Reliant, ARTCO and Kirby, who never ask for
    // it. A warning that fires when it shouldn't is a warning people learn to
    // click past, which is exactly how it gets missed on Ingram.
    if (d.company?.requires_signed_receipt && !d.ingram_slip_image_url) {
      b.push('signed delivery log missing');
    }
    return b;
  }

  // THE QUEUE: not yet invoiced, not written off, and actually worth billing.
  //
  // `customer_invoiced_in_qb` — not the old `updated_quickbooks`, which also
  // meant "driver paid" and so hid rows from the wrong job.
  // `not_billable` — training runs and helper-only rows stay in the ledger for
  // the record but must never look like unfinished work here.
  const billable = (all || []).filter(d =>
    !d.customer_invoiced_in_qb
    && !d.not_billable
    && (Number(d.delivery_fee) > 0
        || d.grocery_mode !== 'none'
        || (d.side_purchases?.length ?? 0) > 0),
  );
  const ready = billable.filter(d => blockersFor(d).length === 0);
  const blocked = billable.filter(d => blockersFor(d).length > 0);

  // Billing is per COMPANY **and VESSEL** — Ingram has 15+ boats and each one
  // gets its own invoice ("Ingram — Jenny Kay"). Grouping by company alone
  // would lump eight boats into one bulk action and produce the wrong invoice.
  // Nested: company → vessel → that vessel's deliveries.
  // Grouped by vessel IDENTITY (spelling-insensitive) so "W. Scott Noble" and
  // "Scott Noble" stay one boat — and one invoice. The label shown is the
  // fullest spelling actually used on those records.
  const byCompanyVessel = Array.from(
    ready.reduce((m, d) => {
      const co = d.company?.name || 'Unassigned';
      const vk = vesselKey(d.vessel_name) || 'no-vessel';
      if (!m.has(co)) m.set(co, new Map<string, Delivery[]>());
      const vm = m.get(co)!;
      if (!vm.has(vk)) vm.set(vk, []);
      vm.get(vk)!.push(d);
      return m;
    }, new Map<string, Map<string, Delivery[]>>()).entries(),
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([co, vm]) => [
      co,
      Array.from(vm.values())
        .map(ds => [canonicalVesselName(ds.map(d => d.vessel_name)) || 'No vessel', ds] as [string, Delivery[]])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ] as const);

  // Pre-tax total of everything that will go on the QBO invoice.
  //
  // Grocery only counts under `sinclair_courtesy` — a `gts_purchased` row's
  // money lives in side_purchases, and counting both would double it.
  const lineTotal = (d: Delivery) =>
    (Number(d.delivery_fee) || 0)
    + (d.grocery_mode === 'sinclair_courtesy' ? (Number(d.sinclairs_grocery_total) || 0) : 0)
    + (d.side_purchases || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const Field = ({ label, value, k }: { label: string; value: string; k: string }) => (
    <button onClick={() => copy(value, k)}
      className="text-left group flex items-start gap-1.5 hover:bg-white rounded px-1.5 py-1 -mx-1.5 transition-colors"
      title="Click to copy">
      <span className="min-w-[92px] text-[11px] text-gray-400 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-brand-navy flex-1">{value}</span>
      <span className={`text-[10px] shrink-0 pt-1 ${copied === k ? 'text-green-600 font-bold' : 'text-gray-300 group-hover:text-gray-500'}`}>
        {copied === k ? 'copied' : 'copy'}
      </span>
    </button>
  );

  /**
   * One click-to-copy cell of an invoice line.
   *
   * Deliberately granular. An earlier version offered a single button that put
   * all the lines on the clipboard tab-separated, on the assumption they could
   * be pasted into the QuickBooks line grid in one go. THEY CANNOT — Intuit
   * states there is no way to paste a spreadsheet's rows into an invoice, and a
   * button that looks like it works but doesn't is worse than no button, since
   * the failure surfaces as silently missing lines on a real invoice.
   */
  const Cell = ({ v, k, cls }: { v: string; k: string; cls: string }) => (
    <button onClick={() => copy(v, k)} title="Click to copy"
      className={`text-left truncate rounded px-1.5 py-1 transition-colors ${cls} ${
        copied === k ? 'bg-green-100 text-green-800' : 'hover:bg-gray-100'}`}>
      {copied === k ? 'copied' : v}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      {/* The pack renders its own portal above this one. Clicking a Pack
          button must not also close the queue behind it, so it sits outside
          the stopPropagation wrapper and closes back to this list. */}
      {packFor && (
        <QbPackPanel
          delivery={packFor as unknown as Parameters<typeof QbPackPanel>[0]['delivery']}
          onClose={() => setPackFor(null)}
          onMarked={() => { loadPending(); onEntered(); }}
        />
      )}
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-gold" /> QuickBooks entry queue
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {all === null ? 'Loading…'
                : billable.length === 0 ? 'Everything is entered — nothing waiting.'
                : `${ready.length} ready to key in${blocked.length ? ` · ${blocked.length} need attention` : ''} · all months`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {all !== null && billable.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              Nothing waiting — every billable delivery is marked entered.
            </p>
          )}

          {/* Blocked first — she can't key these until something's fixed */}
          {blocked.length > 0 && (
            <div className="border border-amber-300 bg-amber-50/60 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">
                Need attention before entering ({blocked.length})
              </p>
              <div className="space-y-1.5">
                {blocked.map(d => (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-semibold text-brand-navy min-w-[150px]">
                      {d.company?.name || 'No company'} · {d.delivery_date}
                    </span>
                    <span className="text-gray-500">{d.vessel_name}</span>
                    <span className="text-amber-800 font-semibold">{blockersFor(d).join(' · ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready, grouped by company — one company, one sitting, one bulk mark */}
          {byCompanyVessel.map(([company, vessels]) => {
            const coCount = vessels.reduce((s, [, ds]) => s + ds.length, 0);
            const coTotal = vessels.reduce((s, [, ds]) => s + ds.reduce((t, d) => t + lineTotal(d), 0), 0);
            return (
              <div key={company}>
                {/* Company header — context only. The invoice unit is the vessel. */}
                <div className="flex items-baseline justify-between gap-3 pb-1.5 mb-2 border-b-2 border-brand-navy/15">
                  <p className="text-sm font-bold text-brand-navy">{company}</p>
                  <p className="text-[11px] text-gray-400">
                    {vessels.length} boat{vessels.length === 1 ? '' : 's'} · {coCount} deliver{coCount === 1 ? 'y' : 'ies'} · {formatCurrency(coTotal)}
                  </p>
                </div>

                <div className="space-y-4 pl-1">
                {vessels.map(([vessel, ds]) => {
                  const groupTotal = ds.reduce((s, d) => s + lineTotal(d), 0);
                  const key = `grp-${company}-${vessel}`;
                  const h = handoffFor(ds, company, vessel);
                  const receipts = ds.filter(d => d.sinclairs_receipt_url).length;
                  const logs = ds.filter(d => d.ingram_slip_image_url).length;
                  const groceryRows = ds.filter(d => d.bill_for_groceries).length;
                  const dateSpan = ds.length === 1
                    ? (ds[0].delivery_date || '')
                    : `${ds[ds.length - 1].delivery_date} → ${ds[0].delivery_date}`;
                  return (
                    <div key={key} className="border border-gray-200 rounded-xl bg-gray-50/60 p-3">
                      {/* ── The invoice ───────────────────────────────── */}
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-brand-navy">{company} — {vessel}</p>
                          <p className="text-[11px] text-gray-400">
                            {ds.length} deliver{ds.length === 1 ? 'y' : 'ies'} · {dateSpan}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-brand-navy shrink-0">{formatCurrency(groupTotal)}</p>
                      </div>

                      {/* ── The three actions, in the order she does them ── */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <button onClick={() => downloadPacket(ds, `${company}-${vessel}`, `${key}-pdf`)}
                          disabled={busy === `${key}-pdf`}
                          className="flex items-center gap-1.5 bg-white border border-gray-300 text-brand-navy text-[11px] font-bold px-3 py-1.5 rounded-lg hover:border-brand-navy disabled:opacity-50"
                          title="One PDF: the invoice lines, the signed logs and Sinclair's receipts">
                          {busy === `${key}-pdf`
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          {busy === `${key}-pdf` ? 'Building…' : 'Packet'}
                        </button>

                        {/* OPEN PACK — one delivery, one QBO invoice.
                            Shown per delivery rather than per group because
                            the tax flags are decided per row: a boat can have
                            a courtesy grocery run on Tuesday and a taxable
                            Walmart buy on Thursday, and those are two
                            different invoices with two different tax answers. */}
                        {ds.map((d, i) => (
                          <button key={d.id} onClick={() => setPackFor(d)}
                            className="flex items-center gap-1.5 bg-brand-navy text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-steel"
                            title="The lines, memo, tax flags and attachments for this delivery">
                            <Receipt className="w-3.5 h-3.5" />
                            {ds.length > 1 ? `Pack ${i + 1}` : 'Open pack'}
                          </button>
                        ))}

                        <button onClick={() => markEntered(ds.map(d => d.id), key)} disabled={busy === key}
                          className="flex items-center gap-1.5 bg-brand-green text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gmed disabled:opacity-50 ml-auto">
                          {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Entered
                        </button>

                        <button onClick={() => markNotBillable(ds.map(d => d.id), `${key}-nb`, 'Skipped from the QuickBooks queue')}
                          disabled={busy === `${key}-nb`}
                          className="flex items-center gap-1.5 border border-gray-300 text-gray-500 text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          title="Training run, waived fee or helper-only — keep it in the ledger, drop it from this queue">
                          {busy === `${key}-nb` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Not billable
                        </button>
                      </div>

                      {downloadError[`${key}-pdf`] && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3">
                          {downloadError[`${key}-pdf`]}
                        </p>
                      )}

                      {/* ── Invoice header fields QuickBooks asks for before
                             the lines. Same for the whole boat, so they sit
                             once here rather than on every delivery. ── */}
                      <div className="grid sm:grid-cols-2 gap-x-4 mb-2">
                        <Field label="Customer" value={company} k={`${key}-c`} />
                        <Field label="Invoice date" value={h.invoiceDate || ''} k={`${key}-d`} />
                      </div>

                      {/* ── The invoice lines, EVERY CELL CLICK-TO-COPY. ──
                             QuickBooks Online does not accept a multi-row paste
                             into the line grid — Intuit's own answer is that you
                             enter them "one at a time". So this is built for the
                             way the software actually works: click a cell, paste
                             it, move on. Nothing is retyped and nothing is
                             transcribed by eye, which is where the errors come
                             from. */}
                      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                        {h.lines.map((l, i) => (
                          <div key={i} className="flex items-stretch gap-1 px-1.5 py-1 text-[11px] border-b border-gray-100 last:border-0">
                            <Cell v={l.item} k={`${key}-i${i}`} cls="font-semibold text-brand-navy min-w-[124px]" />
                            <Cell v={l.description} k={`${key}-d${i}`} cls="text-gray-500 flex-1 min-w-0" />
                            <Cell v={l.rate.toFixed(2)} k={`${key}-r${i}`} cls="font-semibold text-brand-navy w-[76px] text-right" />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Click any value to copy it, then paste into QuickBooks.
                      </p>

                      {/* ── Paperwork state, stated rather than hidden. ── */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]">
                        <span className={receipts === groceryRows ? 'text-gray-400' : 'text-amber-700 font-semibold'}>
                          Receipts {receipts}/{groceryRows}
                        </span>
                        <span className={logs === ds.length ? 'text-gray-400' : 'text-amber-700 font-semibold'}>
                          Signed logs {logs}/{ds.length}
                        </span>
                        {groceryRows < ds.length && (
                          <span className="text-gray-400">
                            {ds.length - groceryRows} delivery-only — pays Sinclair&apos;s direct
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
          One box is one invoice. Copy the lines, download the packet, attach it, mark it entered — this replaces the &ldquo;Updated QuickBooks&rdquo; column on the spreadsheet.
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Who at GTS took the job. Free text let four spellings of one person in. */
const CORRESPONDENTS = ['Jen', 'Laura', 'MK', 'LS'];

/**
 * MONEY INPUTS ARE TEXT, NOT type="number".
 *
 * `<input type="number">` looked right and behaved badly on a fee field:
 *   · spinner arrows — one stray scroll over a focused field silently changes
 *     an invoice amount, and nobody notices until a barge line queries it
 *   · step=0.01 arrow-keys through pennies, which is never what anyone wants
 *   · accepts negatives, so a delivery could be logged at -$0.08
 *   · browsers accept "1e5" and hand back 100000
 *
 * Text + a strict filter gives a plain box that only takes money.
 */
const moneyChars = (s: string) => {
  // Digits and at most one decimal point. No minus — a delivery fee is never
  // negative, and silently dropping the sign beats a confusing rejection.
  const cleaned = String(s).replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('').slice(0, 2)}` : head;
};

/** Tidy to 2dp on blur. Empty stays empty — that's meaningfully different
 *  from zero, and a fee of $0.00 is a real thing we shouldn't invent. */
const moneyBlur = (s: string) => {
  const v = moneyChars(s);
  if (v === '' || v === '.') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '';
};

// ── Add / edit a delivery ────────────────────────────────────────────────
function DeliveryEditor({ delivery, companies, serviceTypes, vesselRecords = [], onClose, onSaved }: {
  delivery: Delivery | null; companies: Company[]; serviceTypes: ServiceType[];
  vesselRecords?: Array<{ vessel_name?: string | null; company_id?: string | null }>;
  onClose: () => void; onSaved: () => void;
}) {
  // `dialog` MUST be rendered or the promise never settles and the UI hangs
  // with no visible dialog — see the render below.
  const { confirm, dialog } = useConfirm();
  const isEdit = !!delivery;
  const [showOptional, setShowOptional] = useState(false);

  const [f, setF] = useState<Record<string, any>>(() => ({
    delivery_date: delivery?.delivery_date || new Date().toISOString().slice(0, 10),
    delivery_driver: delivery?.delivery_driver || '',
    hours_worked: delivery?.hours_worked ?? '',
    amount_paid_driver: delivery?.amount_paid_driver ?? '',
    vessel_name: delivery?.vessel_name || '',
    company_id: delivery?.company_id || '',
    // Typed company text, kept alongside the id. The ledger has to be able to
    // log a barge line that has never used the ordering site — the old
    // spreadsheet way still runs in parallel, so a new company can show up on
    // the dock before it exists anywhere in this system.
    company_name: delivery?.company?.name || '',
    service_type: delivery?.service_type || '',
    location_delivered: delivery?.location_delivered || '',
    // STRING, always. Held as text so the field can be genuinely empty rather
    // than 0, and so nothing seeds a value the user didn't choose. The only
    // thing that ever fills this is the rate-card lookup below.
    delivery_fee: delivery?.delivery_fee != null ? Number(delivery.delivery_fee).toFixed(2) : '',
    bill_for_groceries: delivery?.bill_for_groceries ?? false,
    // 2dp string, same as delivery_fee — both go through moneyChars/moneyBlur.
    sinclairs_grocery_total: delivery?.sinclairs_grocery_total != null
      ? Number(delivery.sinclairs_grocery_total).toFixed(2) : '',
    // Migration 074. Derived from the old boolean for rows predating it, so an
    // existing grocery delivery opens showing courtesy rather than "None" —
    // which would silently drop the grocery line on the next save.
    grocery_mode: (delivery as any)?.grocery_mode
      ?? (delivery?.bill_for_groceries ? 'sinclair_courtesy' : 'none'),
    side_purchases: (delivery as any)?.side_purchases ?? [],
    updated_quickbooks: delivery?.updated_quickbooks ?? false,
    customer_invoiced_in_qb: delivery?.customer_invoiced_in_qb ?? false,
    driver_paid_in_qb: delivery?.driver_paid_in_qb ?? false,
    phone_number_used: delivery?.phone_number_used || '',
    issues_comments: delivery?.issues_comments || '',
    gts_correspondent: delivery?.gts_correspondent || '',
    invoice_sent: delivery?.invoice_sent || '',
    incentive: delivery?.incentive || '',
    // Migration 072. Optional, collapsed by default.
    po_number: (delivery as any)?.po_number || '',
    helper_name: (delivery as any)?.helper_name || '',
    helper_hours: (delivery as any)?.helper_hours ?? '',
    helper_pay: (delivery as any)?.helper_pay ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [rateHint, setRateHint] = useState<string>('');
  const [cardRate, setCardRate] = useState<number | null>(null);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  // DIRTY TRACKING — snapshot the initial state once, compare against it.
  //
  // This exists so an accidental dismissal can't bin a half-typed delivery.
  // Someone logging a job at 5am has the date, boat, fee and driver in their
  // head and nowhere else; losing it means asking the driver again.
  const [initial] = useState(() => JSON.stringify(f));
  const dirty = JSON.stringify(f) !== initial;

  /** The only way out. Clean form leaves silently; dirty form asks first. */
  const attemptClose = useCallback(async () => {
    if (!dirty) { onClose(); return; }
    // confirm() resolves to the ACTION ID (or null if dismissed), not a
    // boolean — so this must compare to 'ok'. A truthy check would treat
    // "Keep editing" as consent and throw the form away, which is precisely
    // the bug this whole dialog exists to prevent.
    const choice = await confirm({
      title: 'Discard this delivery?',
      message: 'What you have typed here will be lost.',
      danger: true,
      actions: [
        { id: 'ok', label: 'Discard', variant: 'danger' },
        { id: 'cancel', label: 'Keep editing', variant: 'neutral' },
      ],
    });
    if (choice === 'ok') onClose();
  }, [dirty, onClose, confirm]);

  // Escape routes through the same guard as Cancel. Capture phase so this runs
  // before anything else that might listen for Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      attemptClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [attemptClose]);

  // Sinclair's receipt on this delivery (only when billing groceries)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(delivery?.sinclairs_receipt_url ?? null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  async function uploadReceipt(file: File) {
    if (!delivery?.id) return;
    setUploadingReceipt(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('delivery_id', delivery.id);
      const res = await adminFetch('/api/admin/deliveries/receipt', { method: 'POST', body: fd });
      if (res.ok) setReceiptUrl((await res.json()).url);
    } finally {
      setUploadingReceipt(false);
    }
  }

  // Auto-fill the fee from the rate card once company + service are chosen,
  // and re-check when the BOAT changes.
  //
  // The boat matters: Ingram's Daytime Van Delivery is $350 for most of the
  // fleet but $225 for Scott Noble and Mike Schmeng (migration 062). Before
  // this, auto-fill offered $350 on nearly every Ingram order and someone
  // corrected it by hand — the red note at the top of Jen's spreadsheet was
  // the only place that rule existed.
  //
  // The hint says WHICH rate was used, so an unexpected number is explainable
  // instead of just wrong-looking.
  const svcId = serviceTypes.find(s => s.name === f.service_type)?.id;
  useEffect(() => {
    if (!f.company_id || !svcId) { setRateHint(''); return; }
    let cancelled = false;
    const params = new URLSearchParams({ company_id: f.company_id, service_type_id: svcId });
    if (f.vessel_name?.trim()) params.set('vessel', f.vessel_name.trim());
    adminFetch(`/api/admin/service-rates?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || d.rate == null) return;
        const label =
          d.source === 'vessel' ? `${d.vessel_label || f.vessel_name}’s rate`
          : d.source === 'company' ? "this company’s rate"
          : 'default rate';
        setRateHint(`${label}: ${formatCurrency(d.rate)}`);
        setCardRate(Number(d.rate));
        // Only prefill when the fee is still empty (don't clobber an edit).
        // Stored as a 2dp STRING so it matches everything else the field holds
        // — a raw number here made the override check below fire spuriously.
        setF(p => (p.delivery_fee === '' || p.delivery_fee == null)
          ? { ...p, delivery_fee: Number(d.rate).toFixed(2) }
          : p);
      });
    return () => { cancelled = true; };
  }, [f.company_id, svcId, f.vessel_name]);

  // Fee differs from what the rate card says — worth flagging, never blocking.
  // Overrides are legitimate and routine (a long run, a favour, a split job);
  // the point is that it's visibly deliberate rather than a typo nobody caught.
  const feeIsOverride =
    cardRate != null && f.delivery_fee !== '' && Number(f.delivery_fee) !== cardRate;

  // Boats already seen for this company. Falls back to every known boat before
  // a company is picked, so the list is never uselessly empty.
  const vesselOptions = useMemo(
    () => vesselSuggestions(vesselRecords, f.company_id || undefined),
    [vesselRecords, f.company_id],
  );

  // Typed company → existing row (case-insensitive), or a brand-new one.
  const typedCompany = (f.company_name || '').trim();
  const matchedCompany = companies.find(
    c => c.name.trim().toLowerCase() === typedCompany.toLowerCase(),
  );
  const isNewCompany = typedCompany.length > 0 && !matchedCompany;

  // HARD BLOCK: billing for groceries with no amount produces an invoice line
  // that says "groceries" and charges nothing. It's the one combination that
  // silently loses GTS money, so it's the one thing that can't be saved.
  const groceriesMissingTotal =
    !!f.bill_for_groceries &&
    (f.sinclairs_grocery_total === '' || f.sinclairs_grocery_total == null);

  async function save() {
    // SOFT WARNING: a service with no fee is usually an oversight, but not
    // always — a comped run is real. Ask, don't forbid.
    if (f.service_type && (f.delivery_fee === '' || f.delivery_fee == null)) {
      const choice = await confirm({
        title: 'Save with no delivery fee?',
        message: `This is logged as “${f.service_type}” but the fee is blank. It won't appear on the QuickBooks queue as billable.`,
        actions: [
          { id: 'ok', label: 'Save anyway', variant: 'primary' },
          { id: 'cancel', label: 'Go back', variant: 'neutral' },
        ],
      });
      if (choice !== 'ok') return;
    }

    setSaving(true);
    setSaveError('');

    // Resolve the company BEFORE writing the delivery. A name nobody has used
    // yet gets created here, so it's immediately available for rate cards,
    // filters and next month's deliveries instead of being a dead string.
    let companyId: string | null = matchedCompany?.id ?? null;
    if (isNewCompany) {
      const res = await adminFetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: typedCompany }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Could not add that company' }));
        setSaveError(err.error || 'Could not add that company');
        setSaving(false);
        return;
      }
      companyId = (await res.json()).company?.id ?? null;
    }

    // company_name is UI-only — the deliveries table stores company_id.
    const { company_name: _omit, ...rest } = f;
    // Money and hours travel as text in the form so the boxes can be genuinely
    // empty. Empty must reach the API as null, not 0 — "no fee recorded" and
    // "we charged nothing" are different facts and the ledger distinguishes them.
    const num = (v: any) => (v === '' || v == null ? null : Number(v));
    const payload = {
      ...rest,
      company_id: companyId,
      delivery_fee: num(rest.delivery_fee),
      sinclairs_grocery_total: num(rest.sinclairs_grocery_total),
      hours_worked: num(rest.hours_worked),
      amount_paid_driver: num(rest.amount_paid_driver),
      helper_hours: num(rest.helper_hours),
      helper_pay: num(rest.helper_pay),
      // Amounts are text in the form so the boxes can be genuinely empty.
      // Postgres needs real numbers in the jsonb, and a row with no
      // description AND no amount is a half-added line nobody finished — drop
      // it rather than storing an empty object that renders as a blank
      // taxable line on the invoice pack.
      side_purchases: (rest.side_purchases || [])
        .map((p: { description?: string; amount?: unknown }) => ({
          description: (p.description || '').trim(),
          amount: Number(p.amount) || 0,
        }))
        .filter((p: { description: string; amount: number }) => p.description || p.amount > 0),
    };
    const method = delivery ? 'PATCH' : 'POST';
    const body = delivery ? { id: delivery.id, ...payload } : payload;
    const res = await adminFetch('/api/admin/deliveries', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) onSaved();
    else {
      const err = await res.json().catch(() => ({ error: 'Could not save this delivery' }));
      setSaveError(err.error || 'Could not save this delivery');
    }
  }

  const field = (label: string, k: string, type = 'text') => (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <input type={type} value={f[k] ?? ''} onChange={e => set(k, e.target.value)}
        className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30" />
    </label>
  );

  return createPortal(
    // NO onClick ON THE BACKDROP.
    //
    // It used to close the dialog, which meant a mis-aimed click anywhere
    // outside the panel destroyed a part-typed delivery with no warning and no
    // undo. A click-outside shortcut is not worth losing a job someone is
    // halfway through recording. Cancel, the X, and Escape are the ways out,
    // and all three run the dirty check.
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4">
      {/* The discard / no-fee prompts.
          MUST be rendered somewhere or confirm()'s promise never settles and
          the form silently hangs. Position in this tree doesn't matter — it
          portals to document.body at z-[110], above this editor's z-[95]. */}
      {dialog}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-navy">{delivery ? 'Edit delivery' : 'Add delivery'}</h3>
          <button onClick={attemptClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto grid grid-cols-2 gap-3">
          {field('Date', 'delivery_date', 'date')}
          {/* Free text, same as Vessel. Not every barge line will move onto the
              ordering site at once — the spreadsheet way keeps running beside
              it — so a company that has never touched this system still has to
              be loggable the day it shows up. Picking an existing name from the
              list keeps the rate-card autofill working; a new name is created
              on save so it's a real company from then on. */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Company (barge line)</span>
            <input
              list="known-companies"
              value={f.company_name ?? ''}
              onChange={e => {
                const v = e.target.value;
                const hit = companies.find(c => c.name.trim().toLowerCase() === v.trim().toLowerCase());
                // Keep the id in step as they type, so choosing a known company
                // still triggers the rate-card lookup below.
                setF(p => ({ ...p, company_name: v, company_id: hit?.id || '' }));
              }}
              placeholder="Type any company — new ones welcome"
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30" />
            <datalist id="known-companies">
              {companies.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
            {isNewCompany && (
              <span className="block mt-1 text-[11px] font-semibold text-amber-700">
                New company — &ldquo;{typedCompany}&rdquo; will be added on save. No rate card yet, so enter the fee manually.
              </span>
            )}
          </label>
          {/* Free text on purpose — a brand-new boat must be able to order and
              be logged the same day. The datalist just offers spellings already
              in use so we don't accidentally create a second "Scott Noble". */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Vessel</span>
            <input list="known-vessels" value={f.vessel_name ?? ''} onChange={e => set('vessel_name', e.target.value)}
              placeholder="Type any boat — new ones welcome"
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30" />
            {/* Filtered to the chosen company. Ingram alone runs 15+ boats, so
                an unfiltered list of every vessel GTS has ever served made the
                right one hard to find and near-duplicates easy to create. */}
            <datalist id="known-vessels">
              {vesselOptions.map(v => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Service type</span>
            <select value={f.service_type} onChange={e => set('service_type', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
              <option value="">—</option>
              {serviceTypes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          {field('Location delivered', 'location_delivered')}

          {/* ── Money ─────────────────────────────────────────────────── */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">
              Delivery fee {rateHint && <span className="text-brand-green font-normal">· {rateHint}</span>}
            </span>
            <div className="mt-0.5 relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
              {/* inputMode="decimal" gives phones a number pad without any of
                  type="number"'s behaviour. See moneyChars/moneyBlur above. */}
              <input
                type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                value={f.delivery_fee ?? ''}
                onChange={e => set('delivery_fee', moneyChars(e.target.value))}
                onBlur={e => set('delivery_fee', moneyBlur(e.target.value))}
                className={`w-full border rounded-lg pl-6 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 ${
                  feeIsOverride ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                }`} />
            </div>
            {feeIsOverride && (
              <span className="block mt-1 text-[11px] font-semibold text-amber-700">
                Override — differs from the rate card ({formatCurrency(cardRate!)}).
              </span>
            )}
          </label>

          {/* GROCERIES: A THREE-WAY CHOICE, NOT A CHECKBOX.
              This decides whether QuickBooks adds sales tax, which is a tax
              question rather than a billing preference — see migration 074.
              A boolean could not tell "Sinclair's register total, tax already
              inside it" apart from "we bought this at Walmart on our
              exemption", and getting it wrong either double-taxes the barge
              line or leaves GTS owing tax it never collected. */}
          <label className="block col-span-2">
            <span className="text-xs font-semibold text-gray-500">Groceries on this delivery</span>
            <select value={f.grocery_mode} onChange={e => set('grocery_mode', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
              <option value="none">None</option>
              <option value="sinclair_courtesy">Sinclair&apos;s courtesy — pass through their register total (no QBO tax)</option>
              <option value="gts_purchased">GTS purchased elsewhere — Ruler, Walmart, etc. (QBO taxes it)</option>
            </select>
            <span className="block mt-1 text-[11px] text-gray-400 leading-snug">
              {f.grocery_mode === 'sinclair_courtesy'
                ? "Sinclair's tax is already in the register total, so QuickBooks must not tax this line again."
                : f.grocery_mode === 'gts_purchased'
                  ? 'Bought on the GTS exemption, so QuickBooks should charge tax. Itemise the items below.'
                  : 'No grocery line on the invoice.'}
            </span>
          </label>

          {/* Only exists under courtesy — an always-visible box invited a
              total on deliveries where Sinclair's bills the boat direct, which
              then showed up on a GTS invoice as a double charge. */}
          {f.grocery_mode === 'sinclair_courtesy' && (
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">
                Sinclair&apos;s grocery total <span className="text-red-500">*</span>
              </span>
              <div className="mt-0.5 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
                <input
                  type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                  value={f.sinclairs_grocery_total ?? ''}
                  onChange={e => set('sinclairs_grocery_total', moneyChars(e.target.value))}
                  onBlur={e => set('sinclairs_grocery_total', moneyBlur(e.target.value))}
                  className={`w-full border rounded-lg pl-6 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 ${
                    groceriesMissingTotal ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`} />
              </div>
              {groceriesMissingTotal && (
                <span className="block mt-1 text-[11px] font-semibold text-red-600">
                  Required while &ldquo;Bill for groceries&rdquo; is on.
                </span>
              )}
            </label>
          )}

          {/* ── Taxable items GTS bought elsewhere ────────────────────────
              Shown whenever there's something to show, or when the mode says
              there should be. These become TAXABLE lines in QuickBooks, which
              is the opposite of the courtesy line directly above — the two
              sitting next to each other is deliberate, so the difference is
              visible at the moment someone is deciding. */}
          {(f.grocery_mode === 'gts_purchased' || (f.side_purchases?.length ?? 0) > 0) && (
            <div className="col-span-2 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-0.5">
                Items GTS bought — Ruler, Walmart, ice melt, hardware
              </p>
              <p className="text-[11px] text-gray-400 mb-2.5 leading-snug">
                Bought on the GTS exemption, so <strong>QuickBooks charges tax on these</strong>.
              </p>

              <div className="space-y-2">
                {(f.side_purchases || []).map((p: { description: string; amount: number | string }, i: number) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      value={p.description ?? ''} placeholder="What it was"
                      onChange={e => {
                        const next = [...(f.side_purchases || [])];
                        next[i] = { ...next[i], description: e.target.value };
                        set('side_purchases', next);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
                      <input
                        type="text" inputMode="decimal" placeholder="0.00"
                        value={p.amount ?? ''}
                        onChange={e => {
                          const next = [...(f.side_purchases || [])];
                          next[i] = { ...next[i], amount: moneyChars(e.target.value) };
                          set('side_purchases', next);
                        }}
                        onBlur={e => {
                          const next = [...(f.side_purchases || [])];
                          next[i] = { ...next[i], amount: moneyBlur(e.target.value) };
                          set('side_purchases', next);
                        }}
                        className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm" />
                    </div>
                    <button type="button"
                      onClick={() => set('side_purchases', (f.side_purchases || []).filter((_: unknown, j: number) => j !== i))}
                      className="p-2 text-gray-300 hover:text-red-500 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button"
                onClick={() => set('side_purchases', [...(f.side_purchases || []), { description: '', amount: '' }])}
                className="mt-2 text-xs font-bold text-brand-navy hover:text-brand-green flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add an item
              </button>
            </div>
          )}

          {/* ── Who did it ────────────────────────────────────────────── */}
          {field('Driver', 'delivery_driver')}
          {field('Hours worked', 'hours_worked', 'number')}
          {field('Driver pay', 'amount_paid_driver', 'number')}
          {field('Phone number used', 'phone_number_used')}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">GTS correspondent</span>
            {/* Was free text, which produced "MK", "Mary K", "marykaren" and
                "MaryKaren" as four different people in the ledger. */}
            <select value={f.gts_correspondent} onChange={e => set('gts_correspondent', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
              <option value="">—</option>
              {CORRESPONDENTS.map(c => <option key={c} value={c}>{c}</option>)}
              {/* Keeps an existing odd value visible instead of blanking it. */}
              {f.gts_correspondent && !CORRESPONDENTS.includes(f.gts_correspondent) && (
                <option value={f.gts_correspondent}>{f.gts_correspondent}</option>
              )}
            </select>
          </label>

          {/* ── Everything else, folded away ──────────────────────────────
              Logging a delivery is a 5am job on a phone. The nine fields
              above are the ones that always get filled; these are occasional,
              and having them all on screen made the common case look like
              paperwork. Invoice date, incentive and Updated QuickBooks are
              gone from Add entirely — they're states a delivery reaches later,
              not facts you know at the dock. */}
          <div className="col-span-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={() => setShowOptional(v => !v)}
              className="text-xs font-bold text-brand-navy hover:text-brand-green flex items-center gap-1.5">
              <Plus className={`w-3.5 h-3.5 transition-transform ${showOptional ? 'rotate-45' : ''}`} />
              {showOptional ? 'Hide' : 'Add'} PO number, helper and attachments
            </button>
          </div>

          {showOptional && (
            <>
              {field('PO number', 'po_number')}
              {field('Helper', 'helper_name')}
              {field('Helper hours', 'helper_hours', 'number')}
              {field('Helper pay', 'helper_pay', 'number')}
            </>
          )}

          {/* INVOICE STATE — EDIT ONLY, NEVER ON ADD.
              These are states a delivery reaches later, at month end, not facts
              anyone knows standing on a dock. Putting them on the Add form
              invited someone to tick "invoiced" on a delivery that hadn't
              happened yet.

              The two QuickBooks flags are separate on purpose (migration 074):
              invoicing the barge line and paying the driver happen on different
              days, sometimes by different people, and one shared checkbox meant
              finishing either job hid the row from the other. */}
          {isEdit && (
            <>
              {field('Invoice sent (date)', 'invoice_sent', 'date')}
              {field('Incentive', 'incentive')}
              <label className="flex items-center gap-2 text-sm mt-1">
                <input type="checkbox" checked={!!f.customer_invoiced_in_qb}
                  onChange={e => set('customer_invoiced_in_qb', e.target.checked)}
                  className="w-4 h-4 accent-brand-green" />
                Customer invoiced in QuickBooks
              </label>
              <label className="flex items-center gap-2 text-sm mt-1">
                <input type="checkbox" checked={!!f.driver_paid_in_qb}
                  onChange={e => set('driver_paid_in_qb', e.target.checked)}
                  className="w-4 h-4 accent-brand-green" />
                Driver paid in QuickBooks
              </label>
            </>
          )}

          {/* Sinclair's receipt — only when billing for groceries */}
          {f.bill_for_groceries && (
            <div className="col-span-2 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Sinclair&apos;s receipt</p>
              {delivery?.id ? (
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    receiptUrl ? 'border-green-300 bg-green-50 text-green-700' : 'border-brand-navy/30 text-brand-navy hover:bg-gray-50'
                  }`}>
                    {uploadingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {receiptUrl ? 'Replace receipt' : 'Attach receipt'}
                    <input type="file" accept="application/pdf,image/*" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) uploadReceipt(file); }} />
                  </label>
                  {receiptUrl && <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-river underline">View</a>}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Save the delivery first, then reopen it to attach the receipt.</p>
              )}
            </div>
          )}

          <label className="block col-span-2">
            <span className="text-xs font-semibold text-gray-500">Issues / comments</span>
            <textarea value={f.issues_comments} onChange={e => set('issues_comments', e.target.value)} rows={2}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
        </div>
        {/* Save failures used to be silent — the modal just sat there. */}
        {saveError && (
          <div className="px-5 pt-3">
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          </div>
        )}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={attemptClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || groceriesMissingTotal}
            title={groceriesMissingTotal ? "Enter the Sinclair's grocery total first" : undefined}
            className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-brand-gmed disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Rate card editor: default rates + per-company overrides ───────────────
// ── Rate cards: shared default → company → boat ───────────────────────────
//
// The third tier exists because of the red note at the top of Jen's
// spreadsheet: "Ingram $225 rate is for Mike Schmeng and Scott Noble Only".
// Until now that rule lived only in her head, so auto-fill offered $350 on
// nearly every Ingram order and someone corrected it by hand every time.
//
// The whole design goal is that you can never be unsure WHICH rate you're
// editing. You pick a scope at the top — everyone / one company / one boat —
// and the list below belongs to exactly that scope, with each row saying what
// it would fall back to if you cleared it.
function RateCardEditor({ companies, serviceTypes, deliveries, onClose, onChanged }: {
  companies: Company[]; serviceTypes: ServiceType[]; deliveries: Delivery[];
  onClose: () => void; onChanged: () => void;
}) {
  const [companyId, setCompanyId] = useState<string>('');   // '' = shared defaults
  const [vessel, setVessel] = useState<string>('');         // '' = all boats at this company
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [vesselRates, setVesselRates] = useState<VesselRate[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/service-rates');
    if (res.ok) {
      const d = await res.json();
      setOverrides(d.overrides || []);
      setVesselRates(d.vessel_rates || []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Switching company drops you back to that company's own rates — carrying a
  // boat name across companies would be meaningless.
  useEffect(() => { setVessel(''); }, [companyId]);

  const vKey = vessel.trim() ? vesselKey(vessel) : '';
  const scope: 'default' | 'company' | 'vessel' = !companyId ? 'default' : vKey ? 'vessel' : 'company';
  const companyName = companies.find(c => c.id === companyId)?.name || '';

  const companyRate = (stId: string) =>
    overrides.find(o => o.company_id === companyId && o.service_type_id === stId)?.rate;
  const boatRate = (stId: string) =>
    vesselRates.find(v => v.company_id === companyId && v.vessel_key === vKey && v.service_type_id === stId)?.rate;

  // Boats at this company that already carry their own price — the answer to
  // "who's on the $225 rate?" without reading a red note.
  const boatsWithRates = Array.from(
    new Map(vesselRates.filter(v => v.company_id === companyId).map(v => [v.vessel_key, v])).values(),
  ).sort((a, b) => a.vessel_label.localeCompare(b.vessel_label));

  // Every boat this company has actually had a delivery for, so the picker
  // suggests real spellings instead of inviting a new one.
  const knownBoats = vesselSuggestions(
    deliveries.filter(d => d.company_id === companyId), companyId,
  );

  function flagSaved(id: string) {
    setSavedId(id);
    setTimeout(() => setSavedId(s => (s === id ? null : s)), 2000);
  }

  async function save(st: ServiceType, val: string) {
    const next = val === '' ? null : parseFloat(val);
    const current = scope === 'default' ? st.default_rate : scope === 'company' ? companyRate(st.id) : boatRate(st.id);
    if (String(current ?? '') === String(next ?? '')) return;   // nothing changed
    setSaving(st.id);
    const payload =
      scope === 'default'
        ? { mode: 'default', id: st.id, default_rate: next ?? 0 }
        : scope === 'company'
        ? { mode: 'override', company_id: companyId, service_type_id: st.id, rate: next }
        : { mode: 'vessel', company_id: companyId, service_type_id: st.id, vessel: vessel.trim(), rate: next };
    const res = await adminFetch('/api/admin/service-rates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    await load();
    setSaving(null);
    if (res.ok) { flagSaved(st.id); onChanged(); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-green" /> Delivery Rate Cards
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* ── Scope ─────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2.5">
          <div>
            <label className="text-xs font-semibold text-gray-500">Barge line</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white">
              <option value="">Everyone — shared default rates</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {companyId && (
            <div>
              <label className="text-xs font-semibold text-gray-500">
                Boat <span className="font-normal text-gray-400">— leave blank for all {companyName} boats</span>
              </label>
              <input list="rate-boats" value={vessel} onChange={e => setVessel(e.target.value)}
                placeholder={`All ${companyName} boats`}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white" />
              <datalist id="rate-boats">
                {knownBoats.map(b => <option key={b} value={b} />)}
              </datalist>
              {vessel.trim() && (
                <button type="button" onClick={() => setVessel('')}
                  className="mt-1 text-[11px] font-semibold text-brand-river hover:underline">
                  ← back to all {companyName} boats
                </button>
              )}
            </div>
          )}

          {/* Who already has their own price — the red note, made visible */}
          {companyId && boatsWithRates.length > 0 && (
            <div className="pt-0.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                Boats with their own rate
              </p>
              <div className="flex flex-wrap gap-1">
                {boatsWithRates.map(b => (
                  <button key={b.vessel_key} type="button" onClick={() => setVessel(b.vessel_label)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                      b.vessel_key === vKey
                        ? 'bg-brand-navy text-white border-brand-navy'
                        : 'bg-white text-brand-navy border-brand-gold/50 hover:border-brand-navy'
                    }`}>
                    {b.vessel_label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Rates for the chosen scope ────────────────────────── */}
        <div className="p-5 overflow-y-auto space-y-1">
          <p className="text-xs font-bold text-brand-navy mb-2">
            {scope === 'default' ? 'Rates for every barge line without its own price'
              : scope === 'company' ? `${companyName} — all boats`
              : `${companyName} — ${vessel.trim()} only`}
          </p>

          {serviceTypes.map(st => {
            const co = companyRate(st.id);
            const bt = boatRate(st.id);
            // What this row is worth right now, and where that came from.
            const effective = scope === 'default' ? st.default_rate
              : scope === 'company' ? (co ?? st.default_rate)
              : (bt ?? co ?? st.default_rate);
            const source = scope === 'default' ? 'default'
              : scope === 'company' ? (co != null ? 'company' : 'default')
              : (bt != null ? 'boat' : co != null ? 'company' : 'default');
            const own = scope === 'default' ? st.default_rate : scope === 'company' ? co : bt;
            const fallback = scope === 'company' ? st.default_rate : (co ?? st.default_rate);

            return (
              <div key={st.id} className="flex items-center gap-3 py-1">
                <span className="flex-1 text-sm text-brand-navy">{st.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-sm">$</span>
                  {/* key includes the scope so switching company or boat re-mounts with that scope's value */}
                  <input
                    key={`${scope}-${companyId}-${vKey}-${st.id}`}
                    type="number" step="0.01"
                    defaultValue={own ?? ''}
                    placeholder={scope === 'default' ? '0.00' : String(fallback)}
                    onBlur={e => save(st, e.target.value)}
                    className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30" />
                  <span className={`text-[10px] font-bold w-16 ${
                    source === 'boat' ? 'text-brand-orange'
                      : source === 'company' ? 'text-brand-green'
                      : 'text-gray-400'
                  }`}>
                    {source === 'boat' ? 'this boat' : source === 'company' ? 'company' : 'default'}
                  </span>
                </div>
                {saving === st.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  : savedId === st.id
                  ? <Check className="w-3.5 h-3.5 text-green-600" />
                  : <span className="w-3.5" />}
                <span className="sr-only">{formatCurrency(effective)}</span>
              </div>
            );
          })}

          <p className="text-xs text-gray-400 pt-3 leading-relaxed">
            {scope === 'default'
              ? 'These apply to any barge line without its own price. Changes save when you click away.'
              : scope === 'company'
              ? `Blank uses the shared default. A number here applies to every ${companyName} boat that doesn’t have its own.`
              : `Blank falls back to ${companyName}’s rate. A number here applies to ${vessel.trim()} only.`}
          </p>
          {scope === 'vessel' && (
            <p className="text-[11px] text-gray-400">
              Spelling doesn’t matter — “W Scott Noble” and “Scott Noble” share one rate.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
