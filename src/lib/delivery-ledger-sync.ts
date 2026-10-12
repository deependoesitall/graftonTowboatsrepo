// One-way Google Sheet → admin ledger. New sheet rows are added; for rows the
// ledger already has, the sheet only fills EMPTY fields, so manual edits and
// grocery auto-fill are never replaced. Differences are counted as conflicts.
// Website orders, QuickBooks, receipts, and GTS-purchased grocery mode stay in admin.

import { createServiceClient } from '@/lib/supabase/server';
import { importDeliveryRows, matrixToRecords, type ImportResult } from '@/lib/delivery-sheet-import';
import {
  fetchSheetValues,
  googleSheetsConfigured,
  listSheetTitles,
  parseSpreadsheetId,
  pickLedgerTabs,
} from '@/lib/google-sheets';

export type LedgerSyncStatus = {
  configured: boolean;
  synced_at: string | null;
  ok: boolean | null;
  note: string | null;
};

export type LedgerSyncRun = {
  ok: boolean;
  note: string;
  tabs: string[];
  summary: { adds: number; updates: number; unchanged: number; errors: number; conflicts: number };
  /** Rows a person should look at: skipped rows and sheet/ledger differences. */
  needsReview: string[];
  applied: { inserted: number; updated: number; createdCompanies: number; applyErrors: string[] };
  tabErrors: string[];
};

export async function getLedgerSyncStatus(): Promise<LedgerSyncStatus> {
  const configured = googleSheetsConfigured();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('admin_settings')
      .select('google_ledger_synced_at, google_ledger_sync_note, google_ledger_sync_ok')
      .maybeSingle();
    if (error) return { configured, synced_at: null, ok: null, note: null };
    return {
      configured,
      synced_at: (data?.google_ledger_synced_at as string | null) ?? null,
      ok: typeof data?.google_ledger_sync_ok === 'boolean' ? data.google_ledger_sync_ok : null,
      note: (data?.google_ledger_sync_note as string | null) ?? null,
    };
  } catch {
    return { configured, synced_at: null, ok: null, note: null };
  }
}

async function saveStatus(ok: boolean, note: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('id').maybeSingle();
  if (!data?.id) return;
  await supabase
    .from('admin_settings')
    .update({
      google_ledger_synced_at: new Date().toISOString(),
      google_ledger_sync_note: note.slice(0, 500),
      google_ledger_sync_ok: ok,
    })
    .eq('id', data.id);
}

export async function syncDeliveryLedgerFromGoogle(opts: { dryRun?: boolean } = {}): Promise<LedgerSyncRun> {
  if (!googleSheetsConfigured()) {
    throw new Error('Google Sheets is not configured (email, private key, sheet id).');
  }

  const spreadsheetId = parseSpreadsheetId(process.env.DELIVERY_LEDGER_SHEET_ID || '');
  const titles = await listSheetTitles(spreadsheetId);
  const tabs = pickLedgerTabs(titles, process.env.DELIVERY_LEDGER_TAB);
  if (!tabs.length) throw new Error('No delivery tabs found on the spreadsheet.');

  const summary = { adds: 0, updates: 0, unchanged: 0, errors: 0, conflicts: 0 };
  const needsReview: string[] = [];
  const applied = { inserted: 0, updated: 0, createdCompanies: 0, applyErrors: [] as string[] };
  const tabErrors: string[] = [];

  for (const tab of tabs) {
    try {
      const matrix = await fetchSheetValues(spreadsheetId, tab);
      const { headers, rows } = matrixToRecords(matrix);
      if (!rows.length) continue;
      const result: ImportResult = await importDeliveryRows({
        mode: opts.dryRun ? 'preview' : 'apply',
        headers,
        rows,
        createMissingCompanies: false,
        fillOnly: true,
      });
      for (const d of result.diffs || []) {
        const what = `${d.row.delivery_date || '?'} ${d.row.vessel_name || '?'}`;
        if (d.conflicts?.length) {
          summary.conflicts += 1;
          needsReview.push(`${tab}: ${what}: sheet differs on ${d.conflicts.join(', ')}`);
        }
        if (d.kind === 'error' && !/no date and no vessel/.test(d.error || '')) {
          needsReview.push(`${tab}: ${what}: ${d.error}`);
        }
      }
      if (result.error) {
        tabErrors.push(`${tab}: ${result.error}`);
        continue;
      }
      if (result.summary) {
        summary.adds += result.summary.adds;
        summary.updates += result.summary.updates;
        summary.unchanged += result.summary.unchanged;
        summary.errors += result.summary.errors;
      }
      if (result.applied) {
        applied.inserted += result.applied.inserted;
        applied.updated += result.applied.updated;
        applied.createdCompanies += result.applied.createdCompanies;
        applied.applyErrors.push(...result.applied.applyErrors.map(e => `${tab}: ${e}`));
      }
    } catch (e) {
      tabErrors.push(`${tab}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const ok = tabErrors.length === 0 && applied.applyErrors.length === 0;
  if (opts.dryRun) {
    return { ok, note: 'dry run', tabs, summary, needsReview, applied, tabErrors };
  }
  const note = [
    tabs.join(', '),
    `+${applied.inserted} ~${applied.updated}`,
    summary.errors ? `${summary.errors} skipped` : '',
    summary.conflicts ? `${summary.conflicts} differ from the sheet` : '',
    tabErrors[0] || applied.applyErrors[0] || '',
  ].filter(Boolean).join(' · ');

  try { await saveStatus(ok, note); } catch { /* columns may not exist until migration 101 */ }

  return { ok, note, tabs, summary, needsReview, applied, tabErrors };
}
