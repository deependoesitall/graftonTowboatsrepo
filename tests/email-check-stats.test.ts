import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail } from '@/lib/email-check';
import { summarize, rollupStats } from '@/lib/email-stats';

test('pre-send check names broken links, missing pictures, alt text, size, subject', async () => {
  const fetcher = (async (u: string) => new Response('', { status: u.includes('dead') ? 404 : 200 })) as never;
  const p = await checkEmail({ blocks: [
    { id: '1', type: 'button', label: 'Shop', href: 'https://x.com/dead' },
    { id: '2', type: 'button', label: 'Empty', href: '' },
    { id: '3', type: 'image', src: '', alt: '' },
    { id: '4', type: 'image', src: 'https://x.com/ok.jpg', alt: '' },
  ] }, { subject: '', html: 'x'.repeat(110 * 1024), fetcher });
  const t = p.map((x) => x.text).join('\n');
  assert.match(t, /no subject/);
  assert.match(t, /doesn't open: "Shop"/);
  assert.match(t, /"Empty" button has no web address/);
  assert.match(t, /One picture is missing/);
  assert.match(t, /no description/);
  assert.match(t, /Gmail cuts off/);
});

test('a clean email passes', async () => {
  const fetcher = (async () => new Response('', { status: 200 })) as never;
  const p = await checkEmail({ blocks: [{ id: '1', type: 'button', label: 'Shop', href: 'https://x.com/a' }] }, { subject: 'Hi', html: '<p>x</p>', fetcher });
  assert.deepEqual(p, []);
});

test('stats: unique vs total, rates, links, people with boat', () => {
  const s = summarize({ id: 'i', created_at: '2026-10-12T13:30:00Z', subject: 's', newsletter_key: 'k' },
    [{ email: 'a@x', status: 'sent', error: null }, { email: 'b@x', status: 'sent', error: null }, { email: 'c@x', status: 'failed', error: 'Suppressed in Resend' }, { email: 'd@x', status: 'failed', error: 'Bounced (Permanent)' }],
    [
      { type: 'delivered', email: 'a@x', link: null, import_id: 'i' }, { type: 'delivered', email: 'b@x', link: null, import_id: 'i' },
      { type: 'opened', email: 'a@x', link: null, import_id: 'i' }, { type: 'opened', email: 'a@x', link: null, import_id: 'i' },
      { type: 'clicked', email: 'a@x', link: 'https://s/catalog', import_id: 'i' }, { type: 'clicked', email: 'a@x', link: 'https://s/catalog', import_id: 'i' },
      { type: 'unsubscribed', email: 'b@x', link: null, import_id: 'i' },
    ],
    new Map([['a@x', { name: 'Cap A', vessel: 'MV Alpha' }]]));
  assert.equal(s.sent, 4); assert.equal(s.delivered, 2); assert.equal(s.blocked, 1); assert.equal(s.bounced, 1);
  assert.deepEqual(s.opened, { unique: 1, total: 2 }); assert.deepEqual(s.clicked, { unique: 1, total: 2 });
  assert.equal(s.openRate, 50); assert.equal(s.unsubscribed, 1);
  assert.deepEqual(s.links, [{ link: 'https://s/catalog', unique: 1, total: 2 }]);
  assert.equal(s.people[0].vessel, 'MV Alpha');
});

test('rollupStats aggregates sent, delivered, unique opens/clicks, bounces, and unsubscribes across sends', () => {
  const s1 = summarize({ id: '1', created_at: '2026-10-12T13:30:00Z', subject: 'A', newsletter_key: 'k1' },
    [{ email: 'a@x', status: 'sent', error: null }, { email: 'b@x', status: 'sent', error: null }],
    [{ type: 'delivered', email: 'a@x', link: null, import_id: '1' }, { type: 'opened', email: 'a@x', link: null, import_id: '1' }, { type: 'clicked', email: 'a@x', link: 'https://s/1', import_id: '1' }],
    new Map());
  const s2 = summarize({ id: '2', created_at: '2026-10-19T13:30:00Z', subject: 'B', newsletter_key: 'k2' },
    [{ email: 'c@x', status: 'sent', error: null }, { email: 'd@x', status: 'failed', error: 'Bounced' }],
    [{ type: 'delivered', email: 'c@x', link: null, import_id: '2' }, { type: 'unsubscribed', email: 'c@x', link: null, import_id: '2' }],
    new Map());
  const tot = rollupStats([s1, s2]);
  assert.equal(tot.sends, 2);
  assert.equal(tot.sent, 4);
  assert.equal(tot.delivered, 2);
  assert.equal(tot.openedUnique, 1);
  assert.equal(tot.clickedUnique, 1);
  assert.equal(tot.bounced, 1);
  assert.equal(tot.unsubscribed, 1);
  assert.equal(tot.openRate, 33.3);
});
