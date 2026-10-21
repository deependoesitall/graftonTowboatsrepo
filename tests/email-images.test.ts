import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostHtmlImages, hostDocImages, isPublicUrl, type ImageStore } from '@/lib/email-images';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

function memStore() {
  const puts: { type: string; size: number }[] = [];
  const store: ImageStore = {
    owns: (u) => u.startsWith('https://cdn.test/'),
    async put(bytes, type) { puts.push({ type, size: bytes.length }); return `https://cdn.test/${puts.length}.${type.split('/')[1]}`; },
  };
  return { store, puts };
}

test('base64 pictures are hosted', async () => {
  const { store, puts } = memStore();
  const b64 = Buffer.from(PNG).toString('base64');
  const r = await hostHtmlImages(`<p>x</p><img src="data:image/png;base64,${b64}" alt="a">`, { store });
  assert.equal(r.hosted, 1);
  assert.match(r.html, /src="https:\/\/cdn\.test\/1\.png"/);
  assert.equal(puts[0].type, 'image/png');
});

test('cid: and relative pictures match uploaded files; unknown ones are flagged', async () => {
  const { store } = memStore();
  const files = [{ name: 'logo.png', type: 'image/png', bytes: PNG, cid: 'logo@x' }, { name: 'pics/boat.jpg', type: 'image/jpeg', bytes: JPG }];
  const r = await hostHtmlImages('<img src="cid:logo@x" alt="l"><img src="images/boat.jpg" alt="b"><img src="nope.png" alt="n">', { store, files });
  assert.equal(r.hosted, 2);
  assert.deepEqual(r.missing, ['nope.png']);
  assert.match(r.html, /cdn\.test\/1\.png/);
  assert.match(r.html, /cdn\.test\/2\.jpeg/);
});

test('outside pictures are copied in; failures keep the original address', async () => {
  const { store } = memStore();
  const fetcher = async (u: string) => (u.includes('ok')
    ? new Response(JPG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    : new Response('no', { status: 404 }));
  const r = await hostHtmlImages('<img src="https://a.com/ok.jpg" alt="a"><img src="https://a.com/bad.jpg" alt="b">', { store, fetcher: fetcher as never });
  assert.equal(r.hosted, 1);
  assert.match(r.html, /cdn\.test\/1\.jpeg/);
  assert.match(r.html, /a\.com\/bad\.jpg/);
  assert.deepEqual(r.failed, ['https://a.com/bad.jpg']);
});

test('local and private addresses are never fetched', async () => {
  for (const u of ['http://localhost/x.png', 'http://127.0.0.1/x.png', 'http://10.0.0.1/a', 'http://[::1]/a', 'file:///etc/passwd', 'http://metadata.internal/']) assert.equal(isPublicUrl(u), false, u);
  assert.equal(isPublicUrl('https://graftontowboatservices.com/a.png'), true);
  let called = 0;
  const { store } = memStore();
  await hostHtmlImages('<img src="http://169.254.169.254/latest" alt="x">', { store, fetcher: (async () => { called++; return new Response(''); }) as never });
  assert.equal(called, 0);
});

test('already-hosted pictures are left alone; picture blocks are hosted too', async () => {
  const { store, puts } = memStore();
  const b64 = Buffer.from(JPG).toString('base64');
  const r = await hostDocImages({ blocks: [
    { id: '1', type: 'image', src: 'https://cdn.test/old.jpg', alt: '' },
    { id: '2', type: 'image', src: `data:image/jpeg;base64,${b64}`, alt: '' },
    { id: '3', type: 'html', html: `<img src="data:image/jpeg;base64,${b64}" alt="x">` },
  ] }, { store });
  assert.equal(puts.length, 2);
  assert.equal((r.doc.blocks[0] as { src: string }).src, 'https://cdn.test/old.jpg');
});
