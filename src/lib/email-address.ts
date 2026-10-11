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
