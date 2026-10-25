import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { canUseEmails } from '@/lib/email-access';

process.env.ADMIN_SECRET_KEY ||= 'test-secret-key-0123456789';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';

const DIRS = ['customer-email', 'email-builder', 'email-imports', 'email-quota', 'newsletters', 'newsletter-schedules', 'contacts'];
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('route.ts') ? [p] : []; });
const ROUTES = DIRS.flatMap((d) => files(join('src/app/api/admin', d)));

test('only Owner and GTS Manager, never Sinclair', () => {
  assert.equal(canUseEmails('owner', []), true);
  assert.equal(canUseEmails('gts_manager', []), true);
  assert.equal(canUseEmails('manager', []), false);
  assert.equal(canUseEmails('staff', []), false);
  assert.equal(canUseEmails('gts_manager', ['sinclair']), false);
  assert.equal(canUseEmails('owner', ['sinclair']), false);
  assert.equal(canUseEmails(null, []), false);
});

test('every email route handler checks access first', () => {
  assert.ok(ROUTES.length >= 8);
  for (const f of ROUTES) {
    const src = readFileSync(f, 'utf8');
    const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)].length;
    assert.ok(handlers > 0, f);
    assert.equal((src.match(/requireEmailAccess\(req\)/g) || []).length, handlers, `${f}: every handler gated`);
    assert.doesNotMatch(src, /requireAdmin\(/, f);
  }
});

async function call(role: string, perms: string[] | null) {
  const { signAdminSession } = await import('@/lib/admin-auth-server');
  const out: { route: string; method: string; status: number }[] = [];
  const token = role ? signAdminSession({ sub: 'u1', username: 'u', role: role as never, display_name: 'U', permissions: (perms || []) as never }) : '';
  for (const f of ROUTES) {
    const mod = await import(join(process.cwd(), f));
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (typeof mod[method] !== 'function') continue;
      const req = new NextRequest(`http://x/api?id=00000000-0000-0000-0000-000000000000`, {
        method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' }),
      });
      const res = await mod[method](req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
      out.push({ route: f, method, status: res.status });
    }
  }
  return out;
}

test('Sinclair Manager and staff get 403 from every email API', async () => {
  for (const [role, perms] of [['manager', []], ['staff', []], ['gts_manager', ['sinclair']]] as const) {
    for (const r of await call(role, [...perms])) assert.equal(r.status, 403, `${role} ${r.method} ${r.route}`);
  }
});

test('signed-out callers get 401', async () => {
  for (const r of await call('', null)) assert.equal(r.status, 401, `${r.method} ${r.route}`);
});
