'use client';
// src/components/admin/PushBell.tsx
//
// "Notify me of new orders" — staff only.
//
// DESIGN RULE: never nag, and never fail silently.
//
// The browser only lets you ask for notification permission a small number of
// times, and on most browsers a "Deny" is permanent for the origin — there is
// no second chance and no API to re-ask. So this NEVER prompts on page load.
// It prompts only after a deliberate click, which is also the only way to make
// the question make sense: "New order arrived" means nothing to someone who
// just opened a settings page they didn't expect.
//
// The other half is that every unhappy state says what it is. An install
// prompt that quietly does nothing on iOS is worse than no prompt at all,
// because the person assumes it worked and then misses orders.

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-auth';

/** base64url → Uint8Array, required by the Push API for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | 'checking'
  | 'unconfigured'     // VAPID keys missing from THIS BUILD — a server problem
  | 'unsupported'      // browser has no Push API at all
  | 'needs-install'    // iOS Safari in a tab — must be added to Home Screen first
  | 'off'              // supported, not subscribed
  | 'on'
  | 'denied'           // permission refused; only recoverable in OS settings
  | 'working';

/**
 * `installHref` MUST point at an install page on the SAME ORIGIN.
 *
 * iOS installs whatever origin the page is on, so linking the shop app's
 * prompt at /admin/install would put the GTS admin app on a Sinclair's
 * shopper's Home Screen — and the symptom would be "notifications don't work",
 * not "wrong app installed". Defaults to the admin guide because that's the
 * host this component was written for.
 */
export default function PushBell({
  installHref = '/admin/install',
  canConfigure = false,
}: { installHref?: string; canConfigure?: boolean } = {}) {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState('');

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  useEffect(() => {
    (async () => {
      // NOT 'unsupported' — the BROWSER is fine, the DEPLOYMENT is missing a
      // key. Collapsing the two hid a server misconfiguration behind a
      // component that renders nothing, so the toggle silently vanished from
      // the panel and looked like a feature that had been removed.
      //
      // ⚠️ NEXT_PUBLIC_* IS BAKED IN AT BUILD TIME. Setting the key in Vercel
      // is not enough — a build has to run AFTER it was set. If the last
      // successful production build predates the variable, this stays empty
      // no matter what the dashboard says.
      if (!vapid) { setState('unconfigured'); return; }

      // iOS ONLY SUPPORTS WEB PUSH FROM AN INSTALLED HOME-SCREEN APP.
      //
      // In Safari-the-browser, `Notification` and `PushManager` simply don't
      // exist — so the generic "unsupported" branch would catch iOS and tell
      // an iPhone user their phone can't do this. It can; it just needs the
      // icon installed first. Detecting standalone lets us say the useful
      // thing instead of the discouraging one.
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // Safari's non-standard flag, still the only reliable iOS signal.
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState(isIOS && !isStandalone ? 'needs-install' : 'unsupported');
        return;
      }
      if (isIOS && !isStandalone) { setState('needs-install'); return; }

      if (Notification.permission === 'denied') { setState('denied'); return; }

      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const existing = await reg?.pushManager.getSubscription();
      setState(existing ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [vapid]);

  async function enable() {
    setState('working');
    setError('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }

      const sub = await reg.pushManager.subscribe({
        // Required by Chrome — a push that shows no notification isn't allowed.
        // We always call showNotification() in sw.js, so this is honest.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });

      const res = await adminFetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save this device');

      setState('on');
    } catch (e) {
      // Surfaced in place. A dead-silent failure here means someone believes
      // they'll be alerted about orders and won't be.
      setError(e instanceof Error ? e.message : 'Could not turn on notifications');
      setState('off');
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await adminFetch('/api/admin/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  }

  if (state === 'checking' || state === 'unsupported') return null;

  const shell = 'rounded-xl border p-3 text-sm flex items-start gap-3';

  // Staff don't need to see a configuration problem they can't act on, but the
  // owner does — otherwise the only signal is an absence, and an absence is
  // indistinguishable from "we never built this".
  if (state === 'unconfigured') {
    if (!canConfigure) return null;
    return (
      <div className={`${shell} border-amber-200 bg-amber-50`}>
        <BellOff className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
        <div>
          <p className="font-bold text-amber-800">Order alerts aren&apos;t switched on for this deployment</p>
          <p className="text-amber-700 mt-0.5 leading-relaxed">
            <code className="font-mono text-xs">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> is missing from the
            build that&apos;s live. Add it in Vercel &rarr; Settings &rarr; Environment Variables, then
            <strong> redeploy</strong> — this value is baked in at build time, so setting it alone
            changes nothing until a new build runs.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'needs-install') {
    return (
      <div className={`${shell} border-brand-navy/15 bg-brand-sand/40`}>
        <Smartphone className="w-4 h-4 mt-0.5 text-brand-navy shrink-0" />
        <div>
          <p className="font-bold text-brand-navy">Get order alerts on this iPhone</p>
          <p className="text-gray-600 mt-0.5 leading-relaxed">
            Apple only allows notifications once the app is on your Home Screen. Takes about 20 seconds.
          </p>
          <Link href={installHref} className="inline-block mt-1.5 font-bold text-brand-green hover:underline">
            Show me how →
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className={`${shell} border-amber-200 bg-amber-50`}>
        <BellOff className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
        <div>
          <p className="font-bold text-amber-800">Notifications are blocked</p>
          {/* There is no API to re-ask once denied — saying so beats a button
              that would do nothing. */}
          <p className="text-amber-700 mt-0.5 leading-relaxed">
            This has to be changed in your phone or browser settings — the app can&apos;t ask again.
            Look for notification permissions for this site, then reload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} ${state === 'on' ? 'border-green-200 bg-green-50' : 'border-brand-navy/15 bg-white'}`}>
      {state === 'on'
        ? <Bell className="w-4 h-4 mt-0.5 text-green-700 shrink-0" />
        : <Bell className="w-4 h-4 mt-0.5 text-brand-navy shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className={`font-bold ${state === 'on' ? 'text-green-800' : 'text-brand-navy'}`}>
          {state === 'on' ? 'Order alerts are on for this device' : 'Notify me of new orders'}
        </p>
        <p className="text-gray-600 mt-0.5 leading-relaxed">
          {state === 'on'
            ? 'This phone will buzz when an order comes in. Email still arrives as normal.'
            : 'Get a notification the moment an order arrives, without watching your inbox.'}
        </p>
        {error && <p className="text-red-600 font-semibold mt-1">{error}</p>}
        <button
          onClick={state === 'on' ? disable : enable}
          disabled={state === 'working'}
          className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 ${
            state === 'on'
              ? 'border border-gray-300 text-gray-600 hover:bg-white'
              : 'bg-brand-green text-white hover:bg-brand-gmed'
          }`}>
          {state === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {state === 'on' ? 'Turn off on this device' : 'Turn on'}
        </button>
      </div>
    </div>
  );
}
