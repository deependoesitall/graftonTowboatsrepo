// src/lib/email-address.ts
//
// One address check for the Emails page and the server, so what the page
// shows as good is what the queue accepts.
//
// ⚠️ '/' IS LEGAL BEFORE THE @. Ergon names its boat inboxes after the boat:
// m/vlestercruse@ergon.com. The local part takes every RFC 5322 "atext"
// character (letters, digits and !#$%&'*+/=?^_`{|}~-), with dots between them
// but not at either end or doubled. The domain is ordinary DNS labels with a
// letter TLD. Addresses are lowercased so the same inbox typed two ways is one.

const ATEXT = "A-Za-z0-9!#$%&'*+/=?^_`{|}~-";
const LOCAL = `[${ATEXT}]+(?:\\.[${ATEXT}]+)*`;
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const EMAIL = new RegExp(`^${LOCAL}@(?:${LABEL}\\.)+[A-Za-z]{2,63}$`);

export function normalizeEmail(raw: string): string {
  return raw.trim().replace(/^mailto:/i, '').replace(/^<|>$/g, '').toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  if (e.length > 254) return false;
  const at = e.lastIndexOf('@');
  if (at < 1 || at > 64) return false;
  return EMAIL.test(e);
}

/** Split a pasted list (lines, commas, semicolons, spaces) into unique good
 *  addresses, lowercased, and the entries that are not addresses. */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const badSeen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const piece of raw.split(/[\s,;]+/)) {
    const p = piece.trim();
    if (!p) continue;
    const e = normalizeEmail(p);
    if (isValidEmail(e)) {
      if (!seen.has(e)) { seen.add(e); valid.push(e); }
    } else if (!badSeen.has(p)) {
      badSeen.add(p);
      invalid.push(p);
    }
  }
  return { valid, invalid };
}

/** "m/vname@…" is usually a misread of "mv" or "m.v." on a scanned list.
 *  It's a legal address (Ergon really uses it), so it's flagged, not refused. */
export function looksMisread(email: string): boolean {
  return /^m\/|\/v/i.test(email.split('@')[0] || '');
}

export type ContactRow = { email: string; name?: string; company?: string; vessel?: string };

/** A pasted list or CSV. A first line naming an "email" column is read as a
 *  header (name, company, boat/vessel columns are picked up too); otherwise
 *  every address in the text is taken. */
export function parseContactText(raw: string): { rows: ContactRow[]; invalid: string[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  const split = (l: string) => {
    const out: string[] = []; let f = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t' || c === ';') { out.push(f.trim()); f = ''; } else f += c;
    }
    out.push(f.trim());
    return out;
  };
  const head = lines.length ? split(lines[0]).map((h) => h.toLowerCase()) : [];
  const ei = head.findIndex((h) => /e-?mail/.test(h));
  if (ei < 0) {
    const { valid, invalid } = parseEmailList(raw);
    return { rows: valid.map((email) => ({ email })), invalid };
  }
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const ni = col(/name|contact/), ci = col(/company|barge|line/), vi = col(/boat|vessel/);
  const rows: ContactRow[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const l of lines.slice(1)) {
    const c = split(l);
    const email = normalizeEmail(c[ei] || '');
    if (!email) continue;
    if (!isValidEmail(email)) { invalid.push(c[ei]); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({
      email,
      name: ni >= 0 && ni !== ei ? c[ni] || undefined : undefined,
      company: ci >= 0 ? c[ci] || undefined : undefined,
      vessel: vi >= 0 ? c[vi] || undefined : undefined,
    });
  }
  return { rows, invalid };
}
