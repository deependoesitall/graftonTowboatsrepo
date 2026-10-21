import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocks } from '@/lib/email-render';
import { starterDoc, type EmailDoc } from '@/lib/email-blocks';
import { withUnsubscribe } from '@/lib/announcement-versions';
import { listMessage } from '@/lib/list-email';

process.env.UNSUBSCRIBE_SECRET ||= 'test-secret';

test('the starter renders inside the GTS frame with a text part', async () => {
  const e = await renderBlocks(starterDoc(), { subject: ' Specials ' });
  assert.equal(e.subject, 'Specials');
  assert.match(e.html, /gts-badge\.png/);
  assert.equal((e.html.match(/<!DOCTYPE/gi) || []).length, 1);
  assert.match(e.html, /Order now/);
  assert.match(e.html, /onsale\.jpg/);
  assert.match(e.text, /Order now: https:\/\/graftontowboatservices\.com\/catalog/);
  assert.ok(Buffer.byteLength(e.html) < 90 * 1024);
});

test('words are escaped; lists, bold and links work', async () => {
  const doc: EmailDoc = { blocks: [{ id: 'a', type: 'text', text: '<script>alert(1)</script> **Big** https://x.com/a\n\n- one\n- two' }] };
  const e = await renderBlocks(doc, { subject: 's' });
  assert.doesNotMatch(e.html, /<script/);
  assert.match(e.html, /&lt;script&gt;/);
  assert.match(e.html, /<b>Big<\/b>/);
  assert.match(e.html, /<a href="https:\/\/x\.com\/a"/);
  assert.match(e.html, /<li[^>]*>one<\/li>/);
});

test('injection: unsafe links, pictures and imported code never go out', async () => {
  const doc: EmailDoc = { blocks: [
    { id: 'b', type: 'button', label: '"><script>x</script>', href: 'javascript:alert(1)' },
    { id: 'i', type: 'image', src: 'javascript:alert(2)', alt: '" onerror="alert(3)' },
    { id: 'j', type: 'image', src: 'https://ok.com/p.jpg', alt: '" onerror="alert(4)', href: 'data:text/html,hi' },
    { id: 'h', type: 'html', html: '<p onclick="x()">Hi</p><script>bad()</script><a href="javascript:y()">z</a><img src="https://a.com/b.png" onerror="q()">' },
  ] };
  const e = await renderBlocks(doc, { subject: 's' });
  assert.doesNotMatch(e.html, /javascript:|<script|\son\w+="|data:text|bad\(\)/i);
  assert.match(e.html, /https:\/\/ok\.com\/p\.jpg/);
  assert.match(e.html, /&quot; onerror|&#x27;|alt="&quot;/);
});

test('signup link token is filled in everywhere', async () => {
  const e = await renderBlocks({ blocks: [{ id: 'a', type: 'button', label: 'Sign up', href: '{signup_link}' }, { id: 't', type: 'text', text: 'Go: {signup_link}' }] }, { subject: 's' });
  assert.doesNotMatch(e.html + e.text, /\{signup_link\}/);
});

test('plain version: no pictures or buttons, same words', async () => {
  const e = await renderBlocks(starterDoc(), { subject: 's', plain: true });
  assert.doesNotMatch(e.html, /<img|gts-badge/);
  assert.match(e.html, /Order now: /);
});

test('unsubscribe: line before the last </body>, token filled, headers and tags', async () => {
  const doc: EmailDoc = { blocks: [{ id: 'h', type: 'html', html: '<p>x</p><a href="{unsubscribe_link}">Leave</a>' }] };
  const e = await renderBlocks(doc, { subject: 's' });
  const m = listMessage(e, 'Cap@Boat.com', { key: 'abc-123', importId: '11111111-2222-3333-4444-555555555555' });
  assert.doesNotMatch(m.html, /\{unsubscribe_link\}/);
  assert.match(m.html, /Unsubscribe<\/a><\/p>\n<\/body>/);
  assert.match(m.html, /href="https?:\/\/[^"]+\/api\/unsubscribe\?e=cap%40boat\.com&amp;t=/);
  assert.match(m.text, /Unsubscribe: https?:\/\/.+cap%40boat\.com/);
  assert.match(m.headers['List-Unsubscribe'], /^<https?:\/\/.+>$/);
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.deepEqual(m.tags.map((t) => t.name), ['newsletter', 'import']);
  // A test send is built by the same function, so it is the same bytes.
  assert.deepEqual(listMessage(e, 'cap@boat.com', { key: 'abc-123', importId: '11111111-2222-3333-4444-555555555555' }).html, m.html);
});

test('withUnsubscribe works on emails with a nested </body>', () => {
  const r = withUnsubscribe({ subject: 's', text: 't', html: '<html><body><div>&lt;/body&gt;</div><table><tr><td></td></tr></table></body></html>' }, 'https://u');
  assert.ok(r.html.endsWith('</p>\n</body></html>'));
});
