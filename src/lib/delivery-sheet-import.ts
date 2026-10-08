// Shared sheet → ledger mapper. Used by CSV/XLSX import and the Google live pull.
// Idempotent key: date + vesselKey + driver + fee.
// Never invents invoice_sent. Never touches QuickBooks / receipts / linked web orders.

import { createServiceClient } from '@/lib/supabase/server';
import { vesselKey } from '@/lib/vessel';

export type SheetRow = Record<string, unknown>;

export type MappedRow = {
  delivery_date: string | null;
  delivery_driver: string | null;
  hours_worked: number | null;
  amount_paid_driver: number | null;
  vessel_name: string | null;
  company_name: string | null;
  company_id: string | null;
  service_type: string | null;
  location_delivered: string | null;
  delivery_fee: number | null;
  bill_for_groceries: boolean;
  grocery_mode: 'none' | 'sinclair_courtesy' | 'gts_purchased';
  sinclairs_grocery_total: number | null;
  phone_number_used: string | null;
  issues_comments: string | null;
  gts_correspondent: string | null;
  invoice_sent: string | null;
};

export type DiffKind = 'add' | 'update' | 'unchanged' | 'error';

export type DiffItem = {
  kind: DiffKind;
  key: string;
  row: MappedRow;
  existingId?: string;
  changes?: string[];
  error?: string;
  unmatchedCompany?: boolean;
};

export type ImportResult = {
  error?: string;
  status?: number;
  headerMap?: Record<string, string>;
  headers?: string[];
  summary?: { adds: number; updates: number; unchanged: number; errors: number };
  diffs?: DiffItem[];
  applied?: { inserted: number; updated: number; createdCompanies: number; applyErrors: string[] };
};

const HEADER_ALIASES: Record<string, string[]> = {
  delivery_date: ['date', 'delivery date', 'delivery_date'],
  delivery_driver: ['delivery driver', 'driver', 'delivery_driver'],
  hours_worked: ['hours worked', 'hours', 'hours_worked'],
  amount_paid_driver: ['amount paid driver', 'driver pay', 'amount paid', 'amount_paid_driver', 'pay'],
  vessel_name: ['vessel name', 'vessel', 'boat', 'vessel_name'],
  company_name: ['barge line', 'company', 'barge', 'company name', 'company_name'],
  service_type: ['type of service', 'service', 'service type', 'service_type'],
  location_delivered: ['location delivered', 'location', 'location_delivered'],
  delivery_fee: ['delivery fee', 'fee', 'delivery_fee'],
  bill_for_groceries: ['bill for groceries', 'bill groceries', 'bill_for_groceries', 'groceries'],
  sinclairs_grocery_total: [
    "sinclairs grocery total",
    "sinclair's grocery total",
    'grocery total',
    'grocery total (mk)',
    'sinclairs_grocery_total',
    'grocery',
  ],
  phone_number_used: ['phone number used', 'phone', 'phone number', 'phone_number_used'],
  issues_comments: ['issues/comments', 'issues / comments', 'issues', 'comments', 'notes', 'issues_comments'],
  gts_correspondent: ['gts correspondent', 'correspondent', 'gts contact', 'gts_correspondent'],
  invoice_sent: ['invoice sent', 'invoice', 'invoice_sent'],
};

export const HEADER_PROBES = [
  'date', 'delivery driver', 'driver', 'vessel name', 'vessel', 'barge line',
  'type of service', 'location delivered', 'delivery fee', 'hours worked',
  'amount paid driver', 'bill for groceries', 'gts correspondent',
];

function normHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findHeaderRow(matrix: unknown[][]): number {
  let best = 0;
  let bestScore = 0;
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const cells = (matrix[r] || []).map(v => normHeader(String(v ?? ''))).filter(Boolean);
    const score = cells.filter(c => HEADER_PROBES.includes(c)).length;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 2 ? best : 0;
}

export function matrixToRecords(matrix: unknown[][]): { headers: string[]; rows: SheetRow[] } {
  const h = findHeaderRow(matrix);
  const headers = (matrix[h] || []).map(v => String(v ?? ''));
  const rows = matrix.slice(h + 1)
    .map(cells => {
      const o: SheetRow = {};
      headers.forEach((key, i) => { if (key) o[key] = (cells as unknown[])[i] ?? ''; });
      return o;
    })
    .filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''));
  return { headers, rows };
}

function resolveHeaderMap(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const norms = headers.map(h => ({ raw: h, n: normHeader(h) }));
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const hit = norms.find(h => aliases.includes(h.n));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

function parseMoney(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/[$,\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBoolYesNo(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return false;
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(v) * 86400000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const mo = String(Number(m[1])).padStart(2, '0');
    const day = String(Number(m[2])).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function textOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function idemKey(r: {
  delivery_date: string | null;
  vessel_name: string | null;
  delivery_driver: string | null;
  delivery_fee: number | null;
}): string {
  const fee =
    r.delivery_fee == null || !Number.isFinite(Number(r.delivery_fee))
      ? ''
      : Number(r.delivery_fee).toFixed(2);
  return [
    r.delivery_date || '',
    vesselKey(r.vessel_name),
    (r.delivery_driver || '').trim().toLowerCase().replace(/\s+/g, ' '),
    fee,
  ].join('|');
}

function emptyMapped(partial: Partial<MappedRow> = {}): MappedRow {
  return {
    delivery_date: null,
    delivery_driver: null,
    hours_worked: null,
    amount_paid_driver: null,
    vessel_name: null,
    company_name: null,
    company_id: null,
    service_type: null,
    location_delivered: null,
    delivery_fee: null,
    bill_for_groceries: false,
    grocery_mode: 'none',
    sinclairs_grocery_total: null,
    phone_number_used: null,
    issues_comments: null,
    gts_correspondent: null,
    invoice_sent: null,
    ...partial,
  };
}

function mapSheetRow(raw: SheetRow, headerMap: Record<string, string>): MappedRow | { error: string } {
  const get = (field: string) => {
    const h = headerMap[field];
    return h ? raw[h] : undefined;
  };
  const delivery_date = parseDate(get('delivery_date'));
  const vessel_name = textOrNull(get('vessel_name'));
  if (!delivery_date && !vessel_name) {
    return { error: 'Row has no date and no vessel — skipped as empty/fragment' };
  }
  if (vessel_name && /^(totals?|grand total|subtotal)$/i.test(vessel_name)) {
    return { error: 'Totals/summary row skipped' };
  }
  if (!delivery_date) return { error: 'Missing or unparseable date' };
  if (!vessel_name) return { error: 'Missing vessel name' };

  const bill = parseBoolYesNo(get('bill_for_groceries'));
  const invoiceRaw = get('invoice_sent');
  const invoice_sent = parseDate(invoiceRaw);

  return {
    delivery_date,
    delivery_driver: textOrNull(get('delivery_driver')),
    hours_worked: parseMoney(get('hours_worked')),
    amount_paid_driver: parseMoney(get('amount_paid_driver')),
    vessel_name,
    company_name: textOrNull(get('company_name')),
    company_id: null,
    service_type: textOrNull(get('service_type')),
    location_delivered: textOrNull(get('location_delivered')),
    delivery_fee: parseMoney(get('delivery_fee')),
    bill_for_groceries: bill,
    grocery_mode: bill ? 'sinclair_courtesy' : 'none',
    sinclairs_grocery_total: parseMoney(get('sinclairs_grocery_total')),
    phone_number_used: textOrNull(get('phone_number_used')),
    issues_comments: textOrNull(get('issues_comments')),
    gts_correspondent: textOrNull(get('gts_correspondent')),
    invoice_sent,
  };
}

function rowEqualish(a: MappedRow, existing: Record<string, unknown>): string[] {
  const changes: string[] = [];
  const cmp = (field: keyof MappedRow, label: string) => {
    const left = a[field];
    const right = existing[field as string];
    const l = left == null || left === '' ? null : left;
    const r = right == null || right === '' ? null : right;
    if (typeof l === 'number' || typeof r === 'number') {
      const ln = l == null ? null : Number(l);
      const rn = r == null ? null : Number(r);
      if (ln !== rn && !(ln == null && rn == null)) changes.push(label);
      return;
    }
    if (String(l ?? '') !== String(r ?? '')) changes.push(label);
  };
  cmp('hours_worked', 'hours');
  cmp('amount_paid_driver', 'driver pay');
  cmp('service_type', 'service');
  cmp('location_delivered', 'location');
  cmp('delivery_fee', 'fee');
  cmp('bill_for_groceries', 'bill groceries');
  cmp('sinclairs_grocery_total', 'grocery total');
  cmp('phone_number_used', 'phone');
  cmp('issues_comments', 'comments');
  cmp('gts_correspondent', 'correspondent');
  if (a.invoice_sent) cmp('invoice_sent', 'invoice sent');
  cmp('company_id', 'company');
  return changes;
}

export async function importDeliveryRows(opts: {
  mode: 'preview' | 'apply';
  headers: string[];
  rows: SheetRow[];
  createMissingCompanies?: boolean;
}): Promise<ImportResult> {
  const { mode, createMissingCompanies } = opts;
  const rawRows = opts.rows;
  const headers = opts.headers.length
    ? opts.headers
    : rawRows[0]
      ? Object.keys(rawRows[0])
      : [];

  if (!rawRows.length) return { error: 'No rows to import', status: 400 };

  const headerMap = resolveHeaderMap(headers);
  if (!headerMap.delivery_date || !headerMap.vessel_name) {
    return {
      error: 'Could not map required columns (Date, Vessel). Check headers.',
      status: 400,
      headerMap,
      headers,
    };
  }

  const supabase = createServiceClient();
  const { data: companies, error: coErr } = await supabase.from('companies').select('id, name');
  if (coErr) return { error: coErr.message, status: 500 };

  const companyByName = new Map<string, string>();
  for (const c of companies || []) {
    companyByName.set(String(c.name).trim().toLowerCase(), c.id);
  }

  const mapped: MappedRow[] = [];
  const earlyErrors: DiffItem[] = [];
  for (const raw of rawRows) {
    const m = mapSheetRow(raw, headerMap);
    if ('error' in m) {
      earlyErrors.push({
        kind: 'error',
        key: '',
        row: emptyMapped({ vessel_name: textOrNull(raw[headerMap.vessel_name]) }),
        error: m.error,
      });
      continue;
    }
    mapped.push(m);
  }

  const dates = mapped.map(r => r.delivery_date!).filter(Boolean).sort();
  const start = dates[0] || '2000-01-01';
  const end = dates[dates.length - 1] || '2100-01-01';
  const endParts = end.split('-').map(Number);
  const endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 1));
  const endExclusive = endDate.toISOString().slice(0, 10);

  const { data: existing, error: exErr } = await supabase
    .from('deliveries')
    .select(
      'id, order_id, grocery_mode, delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, company_id, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, phone_number_used, issues_comments, gts_correspondent, invoice_sent',
    )
    .gte('delivery_date', start)
    .lt('delivery_date', endExclusive);
  if (exErr) return { error: exErr.message, status: 500 };

  const byKey = new Map<string, Record<string, unknown>>();
  for (const e of existing || []) {
    byKey.set(
      idemKey({
        delivery_date: e.delivery_date,
        vessel_name: e.vessel_name,
        delivery_driver: e.delivery_driver,
        delivery_fee: e.delivery_fee == null ? null : Number(e.delivery_fee),
      }),
      e as Record<string, unknown>,
    );
  }

  const diffs: DiffItem[] = [...earlyErrors];

  for (const row of mapped) {
    const key = idemKey(row);
    let unmatchedCompany = false;
    if (row.company_name) {
      const id = companyByName.get(row.company_name.trim().toLowerCase());
      if (id) row.company_id = id;
      else unmatchedCompany = true;
    }

    const hit = byKey.get(key);
    if (!hit) {
      diffs.push({
        kind: unmatchedCompany && !createMissingCompanies ? 'error' : 'add',
        key,
        row,
        unmatchedCompany,
        error:
          unmatchedCompany && !createMissingCompanies
            ? `Unmatched company “${row.company_name}” — match an existing company or enable create-on-apply`
            : undefined,
      });
      continue;
    }

    // A web order already owns this slot — leave it alone.
    if (hit.order_id) {
      diffs.push({ kind: 'unchanged', key, row, existingId: String(hit.id) });
      continue;
    }

    const changes = rowEqualish(row, hit);
    if (unmatchedCompany && !row.company_id) {
      const i = changes.indexOf('company');
      if (i >= 0) changes.splice(i, 1);
    }
    if (!changes.length) {
      diffs.push({ kind: 'unchanged', key, row, existingId: String(hit.id) });
    } else {
      diffs.push({
        kind: 'update',
        key,
        row,
        existingId: String(hit.id),
        changes,
        unmatchedCompany,
      });
    }
  }

  const summary = {
    adds: diffs.filter(d => d.kind === 'add').length,
    updates: diffs.filter(d => d.kind === 'update').length,
    unchanged: diffs.filter(d => d.kind === 'unchanged').length,
    errors: diffs.filter(d => d.kind === 'error').length,
  };

  if (mode === 'preview') {
    return { summary, diffs, headerMap };
  }

  let createdCompanies = 0;
  let inserted = 0;
  let updated = 0;
  const applyErrors: string[] = [];

  for (const d of diffs) {
    if (d.kind === 'error' || d.kind === 'unchanged') continue;

    let companyId = d.row.company_id;
    if (!companyId && d.row.company_name && createMissingCompanies) {
      const name = d.row.company_name.trim();
      const existingId = companyByName.get(name.toLowerCase());
      if (existingId) {
        companyId = existingId;
      } else {
        const { data: created, error } = await supabase
          .from('companies')
          .insert({ name })
          .select('id, name')
          .single();
        if (error) {
          applyErrors.push(`Company “${name}”: ${error.message}`);
          continue;
        }
        companyId = created.id;
        companyByName.set(name.toLowerCase(), created.id);
        createdCompanies += 1;
      }
    }

    const payload: Record<string, unknown> = {
      delivery_date: d.row.delivery_date,
      delivery_driver: d.row.delivery_driver,
      hours_worked: d.row.hours_worked,
      amount_paid_driver: d.row.amount_paid_driver,
      vessel_name: d.row.vessel_name,
      company_id: companyId,
      service_type: d.row.service_type,
      location_delivered: d.row.location_delivered,
      delivery_fee: d.row.delivery_fee,
      bill_for_groceries: d.row.bill_for_groceries,
      sinclairs_grocery_total: d.row.sinclairs_grocery_total,
      phone_number_used: d.row.phone_number_used,
      issues_comments: d.row.issues_comments,
      gts_correspondent: d.row.gts_correspondent,
    };
    if (d.row.invoice_sent) payload.invoice_sent = d.row.invoice_sent;

    if (d.kind === 'add') {
      payload.grocery_mode = d.row.grocery_mode;
      const { error } = await supabase.from('deliveries').insert(payload);
      if (error) applyErrors.push(`Add ${d.key}: ${error.message}`);
      else inserted += 1;
    } else if (d.kind === 'update' && d.existingId) {
      const hit = byKey.get(d.key);
      // Keep GTS-purchased grocery billing; the sheet only has a yes/no groceries column.
      if (hit?.grocery_mode !== 'gts_purchased') {
        payload.grocery_mode = d.row.grocery_mode;
      }
      const { error } = await supabase
        .from('deliveries')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', d.existingId);
      if (error) applyErrors.push(`Update ${d.key}: ${error.message}`);
      else updated += 1;
    }
  }

  return {
    summary,
    applied: { inserted, updated, createdCompanies, applyErrors },
    diffs,
    headerMap,
  };
}
