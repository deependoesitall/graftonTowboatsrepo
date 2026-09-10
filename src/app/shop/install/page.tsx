// src/app/shop/install/page.tsx
//
// The Sinclair's onboarding page. Dave's staff see this before they see
// anything else we've built, so it does more work than a set of instructions:
// it's the first impression of a system they're being asked to adopt.
//
// ⚠️ MUST BE SERVED FROM THE SHOP ORIGIN. An iPhone installs whichever host is
// in the address bar, so sending Sinclair's staff to /admin/install would put
// the GTS admin app on their phone — right steps, wrong app, and the symptom
// arrives later as "notifications don't work".
//
// FULL-BLEED BY DESIGN. The shop layout deliberately provides no container
// (unlike the admin layout's max-w-7xl), so this page owns its own width and
// can run the hero edge to edge.
//
// On the Sinclair's mark: Dave asked for name-only on GTS *marketing* back in
// August. This is different — an internal tool for his own staff, on a page
// that exists to say the two companies are working together. The lockup is
// framed as a partnership rather than GTS appropriating their brand. Worth a
// courtesy heads-up to him regardless; it costs nothing and he asked once.

import { Share, Plus, Bell, Smartphone, Monitor, Check } from 'lucide-react';
import PartnerLockup from '@/components/site/PartnerLockup';

export const metadata = { title: "Install GTS - Sinclair's", robots: 'noindex' };

const STEPS_IOS = [
  {
    title: 'Open this page in Safari',
    body: 'It has to be Safari — Chrome on an iPhone can’t install apps.',
    icon: null,
  },
  {
    title: 'Tap the Share button',
    body: 'The square with an arrow, at the bottom of the screen.',
    icon: Share,
  },
  {
    title: 'Choose “Add to Home Screen”',
    body: 'Scroll down the list to find it, then tap Add.',
    icon: Plus,
  },
  {
    title: 'Open it from your Home Screen',
    body: 'Close Safari first. Notifications only work from the icon — never from inside Safari.',
    icon: null,
    emphasis: true,
  },
  {
    title: 'Turn on notifications',
    body: 'Tap “Notify me of new orders” and allow it when your phone asks.',
    icon: Bell,
  },
];

export default function ShopInstallPage() {
  return (
    <div className="min-h-screen text-white"
      style={{
        // Deep green base with two warm radial washes picking up Sinclair's
        // red and gold — enough colour to feel considered, dark enough that
        // white type stays comfortable on a phone in a bright store.
        background:
          'radial-gradient(120% 80% at 15% 0%, rgba(200,16,46,0.28) 0%, transparent 55%),'
          + 'radial-gradient(100% 70% at 90% 10%, rgba(255,209,0,0.20) 0%, transparent 50%),'
          + 'linear-gradient(180deg, #0F2419 0%, #14301F 45%, #0B1A12 100%)',
      }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="px-6 pt-14 pb-10 max-w-lg mx-auto text-center">

        {/* Same lockup as the marketing site. Caption omitted — this page is
            for Sinclair's own staff, who do not need telling who delivers. */}
        <PartnerLockup tone="dark" size="lg" caption={null} className="mb-9" />

        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/80 mb-3">
          For Sinclair&apos;s staff
        </p>

        <h1 className="font-display text-[2.1rem] sm:text-5xl font-bold leading-[1.05] mb-4">
          Orders on your phone,
          <br />
          <span className="text-amber-300">the moment they land.</span>
        </h1>

        <p className="text-white/60 text-[15px] leading-relaxed max-w-sm mx-auto">
          Add the app to your Home Screen and your phone buzzes when a grocery
          order comes in — with the list already sorted by aisle.
        </p>
      </header>

      {/* ── The icon they're looking for ────────────────────────────────────
          Showing the actual icon removes the most common failure: someone
          completes the install, then can't find what they installed among
          thirty other apps. */}
      <section className="px-6 pb-12 max-w-lg mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-6 py-7 flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="absolute -inset-3 rounded-[28px] bg-amber-300/20 blur-xl" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/shop-icon.png" alt=""
              className="relative w-[68px] h-[68px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">
              Look for this icon
            </p>
            <p className="font-display text-xl font-bold leading-none">GTS - Sinclair&apos;s</p>
            <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
              This is what appears on your Home Screen when you&apos;re done.
            </p>
          </div>
        </div>
      </section>

      {/* ── iPhone steps ─────────────────────────────────────────────────── */}
      <section className="px-6 pb-12 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <Smartphone className="w-4 h-4 text-amber-300" />
          <h2 className="font-display text-lg font-bold">iPhone or iPad</h2>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/30">
            about 30 seconds
          </span>
        </div>

        <ol className="space-y-2.5">
          {STEPS_IOS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i}
                className={`rounded-2xl border px-5 py-4 flex gap-4 items-start transition-colors ${
                  s.emphasis
                    ? 'border-amber-300/30 bg-amber-300/[0.07]'
                    : 'border-white/10 bg-white/[0.03]'
                }`}>
                <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                  s.emphasis ? 'bg-amber-300 text-[#0F2419]' : 'bg-white/10 text-white/70'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[15px] leading-snug flex items-center gap-2 flex-wrap">
                    {s.title}
                    {Icon && <Icon className="w-4 h-4 text-amber-300 shrink-0" />}
                  </p>
                  <p className="text-white/55 text-[13px] leading-relaxed mt-1">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="text-[12px] text-white/40 leading-relaxed mt-5 px-1">
          Tapped &ldquo;Don&apos;t Allow&rdquo; by mistake? The app can&apos;t ask a second time.
          Open <strong className="text-white/60">Settings → Notifications → GTS - Sinclair&apos;s</strong> and
          switch them on there.
        </p>
      </section>

      {/* ── Android / desktop ────────────────────────────────────────────── */}
      <section className="px-6 pb-12 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <Monitor className="w-4 h-4 text-amber-300" />
          <h2 className="font-display text-lg font-bold">Android, or a computer</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 space-y-3">
          {[
            'Open this page in Chrome or Edge.',
            'Tap the Install icon in the address bar, or use the browser menu → Install app.',
            'Open the installed app and turn on “Notify me of new orders”.',
          ].map((t, i) => (
            <div key={i} className="flex gap-3 items-start">
              <Check className="w-4 h-4 text-amber-300/70 shrink-0 mt-0.5" />
              <p className="text-white/70 text-[13px] leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-white/40 leading-relaxed mt-4 px-1">
          On a computer you can skip installing altogether — Chrome and Edge notify
          from an ordinary tab. Installing just keeps it working once the tab is closed.
        </p>
      </section>

      <footer className="px-6 pb-14 max-w-lg mx-auto">
        <div className="border-t border-white/10 pt-6 text-center">
          <p className="text-[11px] text-white/35 leading-relaxed">
            Notifications go to Sinclair&apos;s and GTS staff only.
            Vessels and crews never receive them.
          </p>
          <p className="text-[11px] text-white/25 mt-3">
            Grafton Towboat Services · Grafton, Illinois
          </p>
        </div>
      </footer>
    </div>
  );
}
