import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';

test('keeps tables, inline styles and safe links', () => {
  const { html } = sanitizeEmailHtml('<table width="600" cellpadding="0"><tr><td style="color:#123;padding:10px"><a href="https://x.com/a" style="background:#1E3D1E;color:#fff">Shop</a></td></tr></table>');
  assert.match(html, /<table width="600" cellpadding="0">/);
  assert.match(html, /style="color:#123;padding:10px"/);
  assert.match(html, /href="https:\/\/x\.com\/a"/);
});

test('drops scripts, handlers, forms, iframes and javascript: links', () => {
  const { html, removed } = sanitizeEmailHtml('<p onclick="alert(1)">Hi<script>alert(2)</script></p><a href="javascript:alert(3)">x</a><form><input></form><iframe src="https://evil"></iframe><img src="x" onerror="alert(4)">');
  assert.doesNotMatch(html, /script|onclick|onerror|javascript:|<form|<input|<iframe|alert/i);
  for (const r of ['scripts', 'forms', 'embedded media', 'click scripts']) assert.ok(removed.includes(r), r);
});

test('drops data: links and style sheets, keeps only the body', () => {
  const { html } = sanitizeEmailHtml('<html><head><style>body{x:1}</style><link rel="stylesheet" href="https://e/x.css"></head><body><a href="data:text/html,<script>1</script>">d</a><p>ok</p></body></html>');
  assert.doesNotMatch(html, /data:|<style|<link|stylesheet/);
  assert.match(html, /<p>ok<\/p>/);
});

test('removes dangerous CSS but keeps the safe parts', () => {
  const { html } = sanitizeEmailHtml('<div style="color:red;background:url(javascript:alert(1));position:fixed;width:expression(alert(1));font-size:14px">a</div>');
  assert.match(html, /style="color:red;font-size:14px"/);
});

test('strips 1x1 tracking pixels', () => {
  const { html, removed } = sanitizeEmailHtml('<p>Hi</p><img src="https://t.co/open.gif" width="1" height="1"><img src="https://x.com/real.jpg" alt="Boat" width="600">');
  assert.doesNotMatch(html, /open\.gif/);
  assert.match(html, /real\.jpg/);
  assert.ok(removed.includes('tracking pixels'));
});

test('other mailers\' unsubscribe placeholders become ours', () => {
  for (const tok of ['*|UNSUB|*', '{{unsubscribe}}', '{{{RESEND_UNSUBSCRIBE_URL}}}', '%unsubscribe%']) {
    const { html } = sanitizeEmailHtml(`<a href="${tok}">Unsubscribe</a>`);
    assert.match(html, /href="\{unsubscribe_link\}"/, tok);
  }
});

test('keeps embedded, attached and relative picture addresses for hosting', () => {
  const { html } = sanitizeEmailHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="a"><img src="cid:logo" alt="b"><img src="images/c.png" alt="c">');
  assert.match(html, /data:image\/png;base64/);
  assert.match(html, /cid:logo/);
  assert.match(html, /images\/c\.png/);
});
