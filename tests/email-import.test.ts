import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHtml } from '@/lib/email-import';
import { htmlParts, patchHtmlPart, docLinks } from '@/lib/email-blocks';

test('a simple pasted email becomes editable blocks', () => {
  const r = importHtml(`<!DOCTYPE html><html><head><title>Fresh this week</title><style>p{}</style></head><body>
    <div style="max-width:600px"><h1>Fresh this week</h1><p>Hi crew, ribeyes are <b>on sale</b>.</p>
    <img src="https://x.com/a.jpg" alt="Steaks"><ul><li>Ribeyes</li><li>Pork</li></ul>
    <p><a href="https://graftontowboatservices.com/catalog" style="background:#1E3D1E;padding:12px 20px;color:#fff">Order now</a></p><hr><p>Jen</p></div></body></html>`);
  assert.equal(r.mode, 'blocks');
  assert.equal(r.subject, 'Fresh this week');
  const types = r.doc.blocks.map((b) => (b.type === 'text' && b.heading ? 'heading' : b.type));
  assert.deepEqual(types, ['heading', 'text', 'image', 'text', 'button', 'divider', 'text']);
  assert.equal((r.doc.blocks[3] as { text: string }).text, '- Ribeyes\n- Pork');
  assert.match((r.doc.blocks[1] as { text: string }).text, /\*\*on sale\*\*/);
});

test('a multi-column design is kept whole, its links still editable', () => {
  const r = importHtml('<table><tr><td><img src="https://x.com/a.jpg" alt="a"></td><td><p>Two</p><a href="https://x.com/go">Go</a></td></tr></table><script>x</script>');
  assert.equal(r.mode, 'locked');
  assert.equal(r.doc.blocks[0].type, 'html');
  assert.ok(r.removed.includes('scripts'));
  assert.deepEqual(docLinks(r.doc).map((l) => l.href), ['https://x.com/go']);
});

test('htmlParts and patchHtmlPart change one link or picture only', () => {
  const html = '<p>a <a href="https://one.com" style="x">One &amp; only</a></p><a href="https://two.com"><img src="https://p.com/1.png" alt="p"></a>';
  const parts = htmlParts(html);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].text, 'One & only');
  let out = patchHtmlPart(html, 'link', 0, { href: 'https://new.com/?a=1&b="2"', text: 'New <words>' });
  assert.match(out, /href="https:\/\/new\.com\/\?a=1&amp;b=&quot;2&quot;"/);
  assert.match(out, />New &lt;words&gt;<\/a>/);
  assert.match(out, /href="https:\/\/two\.com"/);
  out = patchHtmlPart(out, 'image', 0, { src: 'https://p.com/2.png', alt: 'Two' });
  assert.match(out, /<img src="https:\/\/p\.com\/2\.png" alt="Two" \/>/);
  // Linked picture: its words aren't replaced.
  assert.equal(patchHtmlPart(out, 'link', 1, { text: 'x' }).includes('<img'), true);
});
