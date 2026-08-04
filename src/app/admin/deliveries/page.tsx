'use client';
// src/app/admin/deliveries/page.tsx
// The delivery ledger — Mary/Jen's "DELIVERIES" spreadsheet, in the app.
// Monthly view, add/edit a delivery with rate auto-fill from the company's
// rate card, and an editable rate-card manager. No more Google Drive.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Plus, Pencil, Trash2, X, Loader2, DollarSign, Check, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Company { id: string; name: string; is_active: boolean; }
interface ServiceType { id: string; name: string; default_rate: number; sort: number; }
interface Override { company_id: string; service_type_id: string; rate: number; }
interface Delivery {
  id: string;
  delivery_date: string | null;
  delivery_driver: string | null;
  hours_worked: number | null;
  amount_paid_driver: number | null;
  vessel_name: string | null;
  company_id: string | null;
  company?: { id: string; name: string } | null;
  service_type: string | null;
  location_delivered: string | null;
  delivery_fee: number | null;
  bill_for_groceries: boolean | null;
  sinclairs_grocery_total: number | null;
  updated_quickbooks: boolean | null;
  phone_number_used: string | null;
  issues_comments: string | null;
  gts_correspondent: string | null;
  invoice_sent: string | null;
  incentive: string | null;
  sinclairs_receipt_url: string | null;
}

// Deliveries began January 2026 — never offer a month before that.
const LEDGER_YEAR = 2026;

export default function DeliveriesPage() {
  // 'all' = whole-year list (default); otherwise a specific 'YYYY-MM'.
  const [month, setMonth] = useState<string>('all');
  const [rows, setRows] = useState<Delivery[]>([]);
  const [totals, setTotals] = useState({ count: 0, delivery_fees: 0, groceries: 0, driver_pay: 0 });
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [editing, setEditing] = useState<Delivery | 'new' | null>(null);
  const [showRates, setShowRates] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const q = month === 'all' ? `year=${LEDGER_YEAR}` : `month=${month}`;
    const res = await adminFetch(`/api/admin/deliveries?${q}`);
    if (res.ok) { const d = await res.json(); setRows(d.deliveries); setTotals(d.totals); }
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
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-brand-navy">
            {monthOpts.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
          <button onClick={() => setShowRates(true)} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4" /> Rate Cards
          </button>
          <button onClick={() => setEditing('new')} className="bg-brand-green text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-brand-gmed">
            <Plus className="w-4 h-4" /> Add Delivery
          </button>
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Deliveries', val: totals.count, money: false },
          { label: 'Delivery Fees', val: totals.delivery_fees, money: true },
          { label: "Sinclair's Groceries", val: totals.groceries, money: true },
          { label: 'Driver Pay', val: totals.driver_pay, money: true },
        ].map(s => (
          <div key={s.label} className="card-base p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-bold text-brand-navy mt-1">{s.money ? formatCurrency(s.val) : s.val}</p>
          </div>
        ))}
      </div>

      {/* Ledger table */}
      <div className="card-base overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No deliveries logged for this month yet.</div>
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
              {rows.map(d => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap">{d.delivery_date || '—'}</td>
                  <td className="px-3 py-2.5 font-medium text-brand-navy">{d.company?.name || '—'}</td>
                  <td className="px-3 py-2.5">{d.vessel_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{d.service_type || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{d.delivery_fee != null ? formatCurrency(d.delivery_fee) : '—'}</td>
                  <td className="px-3 py-2.5 text-right">{d.sinclairs_grocery_total != null ? formatCurrency(d.sinclairs_grocery_total) : '—'}</td>
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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {showRates && (
        <RateCardEditor companies={companies} serviceTypes={serviceTypes}
          onClose={() => setShowRates(false)} onChanged={loadMeta} />
      )}
    </div>
  );
}

// ── Add / edit a delivery ────────────────────────────────────────────────
function DeliveryEditor({ delivery, companies, serviceTypes, onClose, onSaved }: {
  delivery: Delivery | null; companies: Company[]; serviceTypes: ServiceType[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Record<string, any>>(() => ({
    delivery_date: delivery?.delivery_date || new Date().toISOString().slice(0, 10),
    delivery_driver: delivery?.delivery_driver || '',
    hours_worked: delivery?.hours_worked ?? '',
    amount_paid_driver: delivery?.amount_paid_driver ?? '',
    vessel_name: delivery?.vessel_name || '',
    company_id: delivery?.company_id || '',
    service_type: delivery?.service_type || '',
    location_delivered: delivery?.location_delivered || '',
    delivery_fee: delivery?.delivery_fee ?? '',
    bill_for_groceries: delivery?.bill_for_groceries ?? false,
    sinclairs_grocery_total: delivery?.sinclairs_grocery_total ?? '',
    updated_quickbooks: delivery?.updated_quickbooks ?? false,
    phone_number_used: delivery?.phone_number_used || '',
    issues_comments: delivery?.issues_comments || '',
    gts_correspondent: delivery?.gts_correspondent || '',
    invoice_sent: delivery?.invoice_sent || '',
    incentive: delivery?.incentive || '',
  }));
  const [saving, setSaving] = useState(false);
  const [rateHint, setRateHint] = useState<string>('');
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

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

  // When company + service type are both chosen, auto-fill the fee from the
  // rate card (default, or that company's override). Editable afterward.
  const svcId = serviceTypes.find(s => s.name === f.service_type)?.id;
  useEffect(() => {
    if (!f.company_id || !svcId) { setRateHint(''); return; }
    let cancelled = false;
    adminFetch(`/api/admin/service-rates?company_id=${f.company_id}&service_type_id=${svcId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || d.rate == null) return;
        setRateHint(`${d.is_override ? "this company's rate" : 'default rate'}: ${formatCurrency(d.rate)}`);
        // Only prefill when the fee is still empty (don't clobber an edit)
        setF(p => (p.delivery_fee === '' || p.delivery_fee == null) ? { ...p, delivery_fee: d.rate } : p);
      });
    return () => { cancelled = true; };
  }, [f.company_id, svcId]);

  async function save() {
    setSaving(true);
    const method = delivery ? 'PATCH' : 'POST';
    const body = delivery ? { id: delivery.id, ...f } : f;
    const res = await adminFetch('/api/admin/deliveries', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) onSaved();
  }

  const field = (label: string, k: string, type = 'text') => (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <input type={type} value={f[k] ?? ''} onChange={e => set(k, e.target.value)}
        className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30" />
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-navy">{delivery ? 'Edit delivery' : 'Add delivery'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto grid grid-cols-2 gap-3">
          {field('Date', 'delivery_date', 'date')}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Company (barge line)</span>
            <select value={f.company_id} onChange={e => set('company_id', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
              <option value="">—</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {field('Vessel', 'vessel_name')}
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Service type</span>
            <select value={f.service_type} onChange={e => set('service_type', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
              <option value="">—</option>
              {serviceTypes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Delivery fee {rateHint && <span className="text-brand-green font-normal">· {rateHint}</span>}</span>
            <input type="number" step="0.01" value={f.delivery_fee ?? ''} onChange={e => set('delivery_fee', e.target.value)}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          {field('Location delivered', 'location_delivered')}
          {field('Driver', 'delivery_driver')}
          {field('Hours worked', 'hours_worked', 'number')}
          {field('Driver pay', 'amount_paid_driver', 'number')}
          {field("Sinclair's grocery total", 'sinclairs_grocery_total', 'number')}
          {field('Phone number used', 'phone_number_used')}
          {field('GTS correspondent', 'gts_correspondent')}
          {field('Invoice sent (date)', 'invoice_sent', 'date')}
          {field('Incentive', 'incentive')}
          <label className="flex items-center gap-2 text-sm mt-1">
            <input type="checkbox" checked={!!f.bill_for_groceries} onChange={e => set('bill_for_groceries', e.target.checked)} className="w-4 h-4 accent-brand-green" />
            Bill for groceries
          </label>
          <label className="flex items-center gap-2 text-sm mt-1">
            <input type="checkbox" checked={!!f.updated_quickbooks} onChange={e => set('updated_quickbooks', e.target.checked)} className="w-4 h-4 accent-brand-green" />
            Updated QuickBooks
          </label>

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
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-brand-gmed disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Rate card editor: default rates + per-company overrides ───────────────
function RateCardEditor({ companies, serviceTypes, onClose, onChanged }: {
  companies: Company[]; serviceTypes: ServiceType[]; onClose: () => void; onChanged: () => void;
}) {
  const [companyId, setCompanyId] = useState<string>(''); // '' = shared defaults
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const loadOverrides = useCallback(async () => {
    const res = await adminFetch('/api/admin/service-rates');
    if (res.ok) setOverrides((await res.json()).overrides);
  }, []);
  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  function flagSaved(id: string) {
    setSavedId(id);
    setTimeout(() => setSavedId(s => (s === id ? null : s)), 2000);
  }
  async function saveDefault(st: ServiceType, val: string) {
    if (String(parseFloat(val) || 0) === String(st.default_rate)) return; // unchanged
    setSaving(st.id);
    const res = await adminFetch('/api/admin/service-rates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'default', id: st.id, default_rate: parseFloat(val) || 0 }) });
    setSaving(null);
    if (res.ok) { flagSaved(st.id); onChanged(); }
  }
  async function saveOverride(st: ServiceType, val: string) {
    const current = overrideFor(st.id);
    const next = val === '' ? null : parseFloat(val);
    if (String(current ?? '') === String(next ?? '')) return; // unchanged
    setSaving(st.id);
    const res = await adminFetch('/api/admin/service-rates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'override', company_id: companyId, service_type_id: st.id, rate: next }) });
    await loadOverrides(); setSaving(null);
    if (res.ok) flagSaved(st.id);
  }
  const overrideFor = (stId: string) => overrides.find(o => o.company_id === companyId && o.service_type_id === stId)?.rate;

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2"><DollarSign className="w-5 h-5 text-brand-green" /> Delivery Rate Cards</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500">Editing rates for</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
            <option value="">Shared default (applies to any company without its own rate)</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name} — custom rates</option>)}
          </select>
        </div>
        <div className="p-5 overflow-y-auto space-y-1.5">
          {serviceTypes.map(st => {
            const ov = overrideFor(st.id);
            return (
              <div key={st.id} className="flex items-center gap-3 py-1">
                <span className="flex-1 text-sm text-brand-navy">{st.name}</span>
                {companyId === '' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">$</span>
                    {/* key re-mounts the input per service type so defaultValue is fresh */}
                    <input key={`def-${st.id}`} type="number" step="0.01" defaultValue={st.default_rate}
                      onBlur={e => saveDefault(st, e.target.value)}
                      className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">$</span>
                    {/* key includes companyId so switching companies re-mounts with that company's value */}
                    <input key={`${companyId}-${st.id}`} type="number" step="0.01" defaultValue={ov ?? ''} placeholder={String(st.default_rate)}
                      onBlur={e => saveOverride(st, e.target.value)}
                      className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm" />
                    {ov == null && <span className="text-[10px] text-gray-400 w-14">default</span>}
                    {ov != null && <span className="text-[10px] text-brand-green font-bold w-14">custom</span>}
                  </div>
                )}
                {saving === st.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  : savedId === st.id
                  ? <Check className="w-3.5 h-3.5 text-green-600" />
                  : <span className="w-3.5" />}
              </div>
            );
          })}
          <p className="text-xs text-gray-400 pt-3">
            {companyId === ''
              ? 'These defaults apply to any company that doesn’t have its own rate set. Changes save when you click away.'
              : 'Leave a box blank to use the shared default. A number overrides it for this company only.'}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
