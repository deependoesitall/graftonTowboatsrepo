/* public/sw.js — service worker for Web Push (staff only).
 *
 * SCOPE, DELIBERATELY NARROW.
 * This worker does push and nothing else. No precaching, no offline shell, no
 * fetch handler. A fetch handler that caches wrongly can serve a stale catalog
 * or a stale price to someone ordering groceries, and debugging that on a boat
 * with one bar of signal is not a position to be in. Push needs a service
 * worker to exist; it does not need one that intercepts traffic.
 *
 * There is no versioning/cleanup logic here for the same reason — nothing is
 * stored, so there is nothing to invalidate.
 */

// Take over as soon as installed rather than waiting for every tab to close.
// Staff install the app once and expect the next order to buzz; waiting for a
// natural activation could mean the first notification silently never fires.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  // DEFENSIVE PARSE. A push with no payload, or a non-JSON one, must still
  // produce a notification — on iOS a push event that ends without calling
  // showNotification() can cost the site its push permission entirely.
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'New order', body: 'Open GTS Orders to view it.' };
  }

  const title = d.title || 'New order';
  const options = {
    body: d.body || '',
    icon: '/branding/gts-logo.png',
    badge: '/branding/gts-logo.png',
    // Collapses repeats of the same order into one notification instead of
    // stacking duplicates if the send is retried.
    //
    // TAGS ARE SCOPED PER ORIGIN, which is what keeps the two apps from
    // interfering. This same file is served from both graftontowboatservices.com
    // and shop.graftontowboatservices.com, but each host has its own service
    // worker registration and its own notification store. A GTS notification
    // tagged "order-1234" and a Sinclair's one tagged "shop-order-1234" are
    // unrelated objects — opening, dismissing or replacing either has no
    // effect on the other. Nothing one team does can clear the other's alert.
    tag: d.tag || 'gts-order',
    // Orders are why this exists — buzz rather than arrive silently.
    renotify: true,
    requireInteraction: false,
    data: { url: d.url || '/admin/orders' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/admin/orders';
  // Absolute, against THIS worker's origin. The same file is served from both
  // hosts, so a relative path resolves to the right app on its own — the GTS
  // worker can never send anyone to the shop, or the reverse.
  const target = new URL(raw, self.location.origin);

  // The app this notification belongs to, as a path prefix: '/admin' for GTS,
  // '/' for the shop (whose whole origin is the app).
  const section = '/' + (target.pathname.split('/')[1] || '');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Prefer focusing a window ALREADY IN THIS APP — opening a second copy of
      // the admin panel each time a notification is tapped is how you end up
      // with eleven tabs and a lost draft.
      //
      // Matching on the section rather than taking list[0] matters: staff have
      // the customer-facing site open too, and the old version would grab
      // whatever window came back first and navigate it to the admin panel —
      // yanking someone out of a half-built order to show them a new one.
      const preferred = list.find(c => {
        try { return new URL(c.url).pathname.startsWith(section); } catch { return false; }
      });

      if (preferred && 'focus' in preferred) {
        if ('navigate' in preferred) { preferred.navigate(target.href).catch(() => {}); }
        return preferred.focus();
      }
      // Nothing suitable open — a new window, rather than commandeering an
      // unrelated one.
      return self.clients.openWindow(target.href);
    })
  );
});
