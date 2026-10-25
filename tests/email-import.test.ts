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

import { toEditableHtml, fromEditableHtml, toggleBullets } from '@/lib/rich-text';
import { groceryOutreachDoc } from '@/lib/email-blocks';
test('words edited on the email round-trip: bold, links, new lines', () => {
  const t = 'Hi **crew**,\nsee [this week](https://x.com/a?b=1&c=2).\n\n- one';
  assert.equal(fromEditableHtml(toEditableHtml(t)), t);
  assert.equal(fromEditableHtml('<div>a <strong>b</strong></div><div>c <a href="javascript:x">bad</a> <script>z</script></div>'), 'a **b**\nc bad z');
  assert.equal(toEditableHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
});

import { isDesigned } from '@/lib/email-import';
import { shrinkBytes } from '@/lib/email-images';
test('a designed email (coloured panels, call-out box) is kept as it looks', () => {
  const html = '<table><tr><td style="background:#09283f;color:#fff">GTS</td></tr><tr><td><p>Hi</p></td></tr><tr><td style="background:#edf4f7"><p>Steps</p></td></tr><tr><td bgcolor="#f4bd39"><a href="https://x.com">SHOP</a></td></tr></table>';
  assert.equal(isDesigned(html), true);
  const r = importHtml(html);
  assert.equal(r.mode, 'locked');
  assert.equal(isDesigned('<p style="color:#333">Plain words</p><p><a href="https://x.com" style="background:#1E3D1E">Go</a></p>'), false);
});

test('big embedded pictures are shrunk to inbox size', async () => {
  const sharp = (await import('sharp')).default;
  const big = new Uint8Array(await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#3a6ea5' } }).png({ compressionLevel: 0 }).toBuffer());
  const s = await shrinkBytes(big, 'image/png');
  assert.equal(s.type, 'image/jpeg');
  assert.ok(s.bytes.length < big.length / 10);
  assert.equal((await sharp(Buffer.from(s.bytes)).metadata()).width, 1200);
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38]);
  assert.equal((await shrinkBytes(gif, 'image/gif')).bytes, gif);
});

test('bullet lists render as • in the editor and round-trip cleanly with toggleBullets', () => {
  const html = toEditableHtml('- Ribeyes\n- Pork loin');
  assert.match(html, /• Ribeyes<br>• Pork loin/);
  assert.equal(fromEditableHtml(html), '- Ribeyes\n- Pork loin');
  const added = toggleBullets('Ribeyes\nPork loin');
  assert.equal(added, '- Ribeyes\n- Pork loin');
  const removed = toggleBullets(added);
  assert.equal(removed, 'Ribeyes\nPork loin');
});

test("Grocery Outreach (Jen's design) starter has hosted banner and no duplicate Reply remove line", () => {
  const doc = groceryOutreachDoc();
  assert.equal(doc.branded, false);
  assert.equal(doc.blocks[0].type, 'html');
  const html = (doc.blocks[0] as { html: string }).html;
  assert.match(html, /grocery-outreach-banner\.jpg/);
  assert.doesNotMatch(html, /Reply\s*[“"']remove/i);
  assert.match(html, /SHOP SINCLAIR’S GROCERIES/);
});

import { readUpload } from '@/app/api/admin/email-builder/route';
import { hostDocImages } from '@/lib/email-images';
test('readUpload and importHtml accept a >3.4 MB HTML file with a large embedded base64 PNG', async () => {
  const sharp = (await import('sharp')).default;
  const pngBytes = await sharp({ create: { width: 1400, height: 1100, channels: 3, background: '#1e3d1e' } }).png({ compressionLevel: 0 }).toBuffer();
  const b64 = pngBytes.toString('base64');
  // Pad with harmless whitespace inside base64 or HTML comments so total HTML > 3.4 MB
  const pad = ' '.repeat(Math.max(0, 3_500_000 - b64.length));
  const bigHtml = `<!doctype html><html><head><title>Grafton Towboat Services</title></head><body><!--${pad}--><table style="background:#edf2f5"><tr><td style="background:#09283f;color:#fff">GTS</td></tr><tr><td><img src="data:image/png;base64,${b64}" width="600" alt="Banner"></td></tr><tr><td bgcolor="#f4bd39"><a href="https://graftontowboatservices.com">SHOP</a></td></tr></table></body></html>`;
  assert.ok(bigHtml.length > 3_400_000, `expected >3.4 MB, got ${bigHtml.length}`);
  const fd = new FormData();
  fd.set('action', 'import');
  fd.append('file', new File([bigHtml], 'GTS_Grocery_E-mail.html', { type: 'text/html' }));
  const up = await readUpload(fd);
  assert.notEqual(typeof up, 'string');
  if (typeof up !== 'string') {
    const r = importHtml(up.html);
    assert.equal(r.mode, 'locked');
    let savedBytes = 0;
    const hosted = await hostDocImages(r.doc, {
      store: {
        owns: () => false,
        async put(bytes) { savedBytes = bytes.length; return 'https://example.com/hosted.jpg'; },
      },
      files: up.files,
    });
    assert.equal(hosted.hosted, 1);
    assert.ok(savedBytes > 0 && savedBytes < 100_000);
  }
});
