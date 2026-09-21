// src/app/api/admin/deliveries/import/route.ts
// Sheet → ledger import / diff.
// POST { mode: 'preview' | 'apply', rows: [...] }
// Idempotent key: date + vesselKey(vessel) + driver + fee (normalized).
// Never invents invoice_sent when blank. Unmatched companies are flagged
// (create name-only only when apply + createMissingCompanies).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselKey } from '@/lib/vessel';

type SheetRow = Record<string, unknown>;

type MappedRow = {
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

type DiffKind = 'add' | 'update' | 'unchanged' | 'error';

type DiffItem = {
  kind: DiffKind;
  key: string;
  row: MappedRow;
  existingId?: string;
  changes?: string[];
  error?: string;
  unmatchedCompany?: boolean;
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

function normHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

/** Accept Excel serials, MM/DD/YYYY, YYYY-MM-DD. Never invent — blank stays null. */
function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(v) * 86400000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/YYYY or MM/DD/YY
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
  if (!delivery_date) return { error: 'Missing or unparseable date' };
  if (!vessel_name) return { error: 'Missing vessel name' };

  const bill = parseBoolYesNo(get('bill_for_groceries'));
  // Never invent invoice_sent — blank stays null even if sheet has "Updated Quickbooks" noise.
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
  const cmp = (field: keyof MappedRow, label: string, coerce?: (v: unknown) => unknown) => {
    const left = coerce ? coerce(a[field]) : a[field];
    const right = coerce ? coerce(existing[field as string]) : existing[field as string];
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
  // Only update invoice_sent when the sheet provides one — never clear an existing date with a blank.
  if (a.invoice_sent) cmp('invoice_sent', 'invoice sent');
  cmp('company_id', 'company');
  return changes;
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const mode: 'preview' | 'apply' = body.mode === 'apply' ? 'apply' : 'preview';
  const createMissingCompanies = !!body.createMissingCompanies;
  const rawRows: SheetRow[] = Array.isArray(body.rows) ? body.rows : [];
  const headers: string[] = Array.isArray(body.headers)
    ? body.headers.map(String)
    : rawRows[0]
      ? Object.keys(rawRows[0])
      : [];

  if (!rawRows.length) {
    return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
  }

  const headerMap = resolveHeaderMap(headers);
  if (!headerMap.delivery_date || !headerMap.vessel_name) {
    return NextResponse.json(
      {
        error: 'Could not map required columns (Date, Vessel). Check headers.',
        headerMap,
        headers,
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data: companies, error: coErr } = await supabase.from('companies').select('id, name');
  if (coErr) return NextResponse.json({ error: coErr.message }, { status: 500 });

  const companyByName = new Map<string, string>();
  for (const c of companies || []) {
    companyByName.set(String(c.name).trim().toLowerCase(), c.id);
  }

  // Load existing deliveries covering the date range of this sheet (plus a
  // little slack) so we can diff without pulling the entire history.
  const mapped: MappedRow[] = [];
  const earlyErrors: DiffItem[] = [];
  for (const raw of rawRows) {
    const m = mapSheetRow(raw, headerMap);
    if ('error' in m) {
      earlyErrors.push({
        kind: 'error',
        key: '',
        row: {
          delivery_date: null,
          delivery_driver: null,
          hours_worked: null,
          amount_paid_driver: null,
          vessel_name: textOrNull(raw[headerMap.vessel_name]),
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
        },
        error: m.error,
      });
      continue;
    }
    mapped.push(m);
  }

  const dates = mapped.map(r => r.delivery_date!).filter(Boolean).sort();
  const start = dates[0] || '2000-01-01';
  const end = dates[dates.length - 1] || '2100-01-01';
  // Inclusive end: bump one day for .lt
  const endParts = end.split('-').map(Number);
  const endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 1));
  const endExclusive = endDate.toISOString().slice(0, 10);

  const { data: existing, error: exErr } = await supabase
    .from('deliveries')
    .select(
      'id, delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, company_id, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, phone_number_used, issues_comments, gts_correspondent, invoice_sent',
    )
    .gte('delivery_date', start)
    .lt('delivery_date', endExclusive);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

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

    // Resolve company on the existing row for comparison
    const changes = rowEqualish(row, hit);
    if (unmatchedCompany && !row.company_id) {
      // Don't clobber an existing company_id with null just because the sheet
      // spelling didn't match — leave company off the change list.
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
    return NextResponse.json({ summary, diffs, headerMap });
  }

  // APPLY
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
      grocery_mode: d.row.grocery_mode,
      sinclairs_grocery_total: d.row.sinclairs_grocery_total,
      phone_number_used: d.row.phone_number_used,
      issues_comments: d.row.issues_comments,
      gts_correspondent: d.row.gts_correspondent,
    };
    // Never invent invoice_sent — only write when the sheet has a real date.
    if (d.row.invoice_sent) payload.invoice_sent = d.row.invoice_sent;

    if (d.kind === 'add') {
      const { error } = await supabase.from('deliveries').insert(payload);
      if (error) applyErrors.push(`Add ${d.key}: ${error.message}`);
      else inserted += 1;
    } else if (d.kind === 'update' && d.existingId) {
      // On update, do not null out invoice_sent if sheet blank.
      const { error } = await supabase
        .from('deliveries')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', d.existingId);
      if (error) applyErrors.push(`Update ${d.key}: ${error.message}`);
      else updated += 1;
    }
  }

  return NextResponse.json({
    summary,
    applied: { inserted, updated, createdCompanies, applyErrors },
    diffs,
    headerMap,
  });
}
