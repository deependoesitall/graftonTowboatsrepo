// Read-only Google Sheets. Two ways in:
//   - Service account (no googleapis package; jsonwebtoken is already in the
//     repo; scope spreadsheets.readonly) when its email + key are set.
//   - Otherwise the sheet's public CSV export, which works when the sheet is
//     shared "Anyone with the link: Viewer". Tabs are found by their gid.
//
// Env:
//   DELIVERY_LEDGER_SHEET_ID      (id or full docs.google.com URL) — required
//   GOOGLE_SHEETS_CLIENT_EMAIL    (optional, service account)
//   GOOGLE_SHEETS_PRIVATE_KEY     (optional, PEM; literal \n in Vercel is fine)
//   DELIVERY_LEDGER_TAB           (optional, comma-separated tab names)

import jwt from 'jsonwebtoken';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let cached: { token: string; exp: number } | null = null;

export function parseSpreadsheetId(raw: string): string {
  const m = String(raw || '').trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return String(raw || '').trim();
}

function serviceAccount(): boolean {
  return !!(process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY);
}

export function googleSheetsConfigured(): boolean {
  return !!process.env.DELIVERY_LEDGER_SHEET_ID;
}

// ── Public link (no credentials) ──

const tabGids = new Map<string, string>();

async function publicGet(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  const text = await res.text();
  if (!res.ok || /^\s*<!DOCTYPE html/i.test(text) && url.includes('/export')) {
    throw new Error(res.status === 401 || res.status === 403
      ? 'The sheet is not shared as "Anyone with the link: Viewer"'
      : `Google Sheets ${res.status}`);
  }
  return text;
}

async function publicTabs(spreadsheetId: string): Promise<string[]> {
  const html = await publicGet(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/htmlview`);
  const titles: string[] = [];
  for (const m of html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: [^}]*?gid: "(\d+)"/g)) {
    const name = JSON.parse(`"${m[1]}"`) as string;
    tabGids.set(name, m[2]);
    titles.push(name);
  }
  if (!titles.length) throw new Error('Could not read the tab list from the shared sheet');
  return titles;
}

/** RFC 4180 CSV → rows. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

async function publicValues(spreadsheetId: string, tab: string): Promise<unknown[][]> {
  if (!tabGids.has(tab)) await publicTabs(spreadsheetId);
  const gid = tabGids.get(tab);
  if (gid == null) throw new Error(`Tab "${tab}" not found on the sheet`);
  return parseCsv(await publicGet(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${gid}`,
  ));
}

function privateKey(): string {
  let k = process.env.GOOGLE_SHEETS_PRIVATE_KEY || '';
  k = k.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, '\n');
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  if (!email) throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL is not set');

  const assertion = jwt.sign(
    {
      iss: email,
      sub: email,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: SCOPE,
    },
    privateKey(),
    { algorithm: 'RS256' },
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google token ${res.status}`);
  }
  cached = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cached.token;
}

async function sheetsGet<T>(path: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message || `Sheets API ${res.status}`);
  }
  return json;
}

export async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  if (!serviceAccount()) return publicTabs(spreadsheetId);
  const data = await sheetsGet<{
    sheets?: Array<{ properties?: { title?: string; hidden?: boolean } }>;
  }>(`spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title,sheets.properties.hidden`);
  return (data.sheets || [])
    .filter(s => s.properties?.title && !s.properties.hidden)
    .map(s => s.properties!.title!);
}

export function pickLedgerTabs(titles: string[], envTabs?: string): string[] {
  if (envTabs) {
    return envTabs.split(',').map(s => s.trim()).filter(Boolean);
  }
  const skip = /rate|card|template|instruction|readme/i;
  const usable = titles.filter(t => !skip.test(t));
  const years = usable.filter(t => /^\d{4}/.test(t.trim()));
  if (years.length) return years;
  return usable.slice(0, 1);
}

export async function fetchSheetValues(spreadsheetId: string, tab: string): Promise<unknown[][]> {
  if (!serviceAccount()) return publicValues(spreadsheetId, tab);
  const range = `'${tab.replace(/'/g, "''")}'!A:ZZ`;
  const data = await sheetsGet<{ values?: unknown[][] }>(
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return Array.isArray(data.values) ? data.values : [];
}
