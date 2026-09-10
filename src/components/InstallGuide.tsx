// src/components/InstallGuide.tsx
//
// "Add to Home Screen" instructions, shared by both apps.
//
// ⚠️ THIS MUST BE SERVED FROM THE ORIGIN BEING INSTALLED.
// An iPhone installs whatever origin the page is on. If a Sinclair's shopper
// reads these steps on graftontowboatservices.com, they install the GTS admin
// app — correct instructions, wrong app, and the confusion looks like a bug in
// notifications. So /shop/install and /admin/install both exist and each is
// reachable only from its own host.
//
// Written for someone on a dock or a shop floor. No "PWA", no screenshots to
// go stale, just the tap sequence.

import { Share, Plus, Bell, Smartphone, Monitor } from 'lucide-react';

export default function InstallGuide({ appName, blurb }: { appName: string; blurb: string }) {
  const step = 'flex gap-3 items-start';
  const num = 'w-6 h-6 rounded-full bg-brand-green text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5';

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl font-bold text-brand-navy mb-1.5">
        Get order alerts on your phone
      </h1>
      <p className="text-gray-600 text-sm mb-7 leading-relaxed">{blurb}</p>

      {/* iPhone first: it's the platform with the constraint, and the one most
          of the team will be holding. */}
      <section className="rounded-2xl border border-brand-navy/15 bg-white p-5 mb-4">
        <h2 className="font-bold text-brand-navy flex items-center gap-2 mb-4">
          <Smartphone className="w-4 h-4" /> iPhone or iPad
        </h2>
        <ol className="space-y-3.5 text-sm text-gray-700">
          <li className={step}>
            <span className={num}>1</span>
            <span>Open <strong>this page</strong> in <strong>Safari</strong>. It has to be Safari — Chrome on an iPhone can&apos;t do this.</span>
          </li>
          <li className={step}>
            <span className={num}>2</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              Tap the Share button <Share className="w-4 h-4 inline text-brand-navy" /> at the bottom of the screen.
            </span>
          </li>
          <li className={step}>
            <span className={num}>3</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              Scroll down, tap <strong>Add to Home Screen</strong> <Plus className="w-4 h-4 inline text-brand-navy" />, then <strong>Add</strong>.
            </span>
          </li>
          <li className={step}>
            <span className={num}>4</span>
            <span>
              <strong>Close Safari and open the new {appName} icon</strong> from your Home Screen.
              This step matters — notifications only work from the icon, never from Safari.
            </span>
          </li>
          <li className={step}>
            <span className={num}>5</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              In the app, tap <Bell className="w-4 h-4 inline text-brand-navy" /> <strong>Notify me of new orders</strong> and allow notifications.
            </span>
          </li>
        </ol>
        <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t border-gray-100 pt-3">
          If you tapped &ldquo;Don&apos;t Allow&rdquo; by mistake, the app can&apos;t ask again.
          Go to <strong>Settings → Notifications → {appName}</strong> and turn them on there.
        </p>
      </section>

      <section className="rounded-2xl border border-brand-navy/15 bg-white p-5">
        <h2 className="font-bold text-brand-navy flex items-center gap-2 mb-4">
          <Monitor className="w-4 h-4" /> Android, or a computer
        </h2>
        <ol className="space-y-3.5 text-sm text-gray-700">
          <li className={step}>
            <span className={num}>1</span>
            <span>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.</span>
          </li>
          <li className={step}>
            <span className={num}>2</span>
            <span>Look for an <strong>Install</strong> icon in the address bar, or use the browser menu and choose <strong>Install app</strong>.</span>
          </li>
          <li className={step}>
            <span className={num}>3</span>
            <span>Open the installed app and turn on <strong>Notify me of new orders</strong>.</span>
          </li>
        </ol>
        <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t border-gray-100 pt-3">
          On a computer you can skip installing — Chrome and Edge can notify from an
          ordinary tab. Installing just keeps it working when the tab is closed.
        </p>
      </section>

      <p className="text-xs text-gray-400 mt-6 leading-relaxed">
        Notifications are for GTS and Sinclair&apos;s staff only. Vessels and crews never receive them.
      </p>
    </div>
  );
}
