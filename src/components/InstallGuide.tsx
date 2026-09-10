// src/components/InstallGuide.tsx
//
// The onboarding page for both staff apps. One component, two configurations,
// so GTS and Sinclair's get the same quality rather than one polished page and
// one plain one.
//
// ⚠️ MUST BE SERVED FROM THE ORIGIN BEING INSTALLED.
// An iPhone installs whichever host is in the address bar — not whichever app
// the instructions describe. So /admin/install and /shop/install both exist,
// each on its own host. Linking one team at the other's page puts the wrong
// app on their phone, and the symptom surfaces later as "notifications don't
// work" rather than anything that points at the cause.
//
// Written for someone on a dock or a shop floor: no "PWA", no jargon, no
// screenshots to go stale — just the tap sequence, with the one step everybody
// skips visually flagged.

import { Share, Plus, Bell, Smartphone, Monitor, Check } from 'lucide-react';
import PartnerLockup from '@/components/site/PartnerLockup';

interface Props {
  /** Exactly as it appears under the Home Screen icon. */
  appName: string;
  /** Two lines — the second is accented. */
  headline: [string, string];
  eyebrow: string;
  blurb: string;
  /** The installed app's icon, so people can recognise what they just added. */
  iconSrc: string;
  /** 'partner' = GTS × Sinclair's. 'gts' = the GTS mark alone. */
  lockup: 'partner' | 'gts';
  /** CSS background for the page. Each app gets its own. */
  background: string;
}

export default function InstallGuide({
  appName, headline, eyebrow, blurb, iconSrc, lockup, background,
}: Props) {
  const STEPS = [
    {
      title: 'Open this page in Safari',
      body: 'It has to be Safari — Chrome on an iPhone can’t install apps.',
      icon: null as typeof Share | null,
      emphasis: false,
    },
    {
      title: 'Tap the Share button',
      body: 'The square with an arrow, at the bottom of the screen.',
      icon: Share,
      emphasis: false,
    },
    {
      title: 'Choose “Add to Home Screen”',
      body: 'Scroll down the list to find it, then tap Add.',
      icon: Plus,
      emphasis: false,
    },
    {
      // THE STEP EVERYBODY SKIPS. Opening from the icon rather than Safari is
      // the difference between notifications working and not, and it's the one
      // instruction people scan past. It gets the gold treatment for that
      // reason alone.
      title: 'Open it from your Home Screen',
      body: 'Close Safari first. Notifications only work from the icon — never from inside Safari.',
      icon: null,
      emphasis: true,
    },
    {
      title: 'Turn on notifications',
      body: 'Tap “Notify me of new orders” and allow it when your phone asks.',
      icon: Bell,
      emphasis: false,
    },
  ];

  return (
    <div className="min-h-screen text-white" style={{ background }}>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <header className="px-6 pt-14 pb-10 max-w-lg mx-auto text-center">
        {lockup === 'partner' ? (
          <PartnerLockup tone="dark" size="lg" caption={null} className="mb-9" />
        ) : (
          <div className="flex justify-center mb-9">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/gts-logo.png" alt="Grafton Towboat Services"
              className="h-[88px] w-auto object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]" />
          </div>
        )}

        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/80 mb-3">
          {eyebrow}
        </p>

        <h1 className="font-display text-[2.1rem] sm:text-5xl font-bold leading-[1.05] mb-4">
          {headline[0]}
          <br />
          <span className="text-amber-300">{headline[1]}</span>
        </h1>

        <p className="text-white/60 text-[15px] leading-relaxed max-w-sm mx-auto">
          {blurb}
        </p>
      </header>

      {/* ── The icon they're looking for ─────────────────────────────────
          Showing the actual icon kills the most common failure: someone
          completes the install, then can't find what they installed among
          thirty other apps on the Home Screen. */}
      <section className="px-6 pb-12 max-w-lg mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-6 py-7 flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="absolute -inset-3 rounded-[28px] bg-amber-300/20 blur-xl" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} alt=""
              className="relative w-[68px] h-[68px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">
              Look for this icon
            </p>
            <p className="font-display text-xl font-bold leading-none">{appName}</p>
            <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
              This is what appears on your Home Screen when you&apos;re done.
            </p>
          </div>
        </div>
      </section>

      {/* ── iPhone ───────────────────────────────────────────────────────── */}
      <section className="px-6 pb-12 max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <Smartphone className="w-4 h-4 text-amber-300" />
          <h2 className="font-display text-lg font-bold">iPhone or iPad</h2>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/30">
            about 30 seconds
          </span>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i}
                className={`rounded-2xl border px-5 py-4 flex gap-4 items-start ${
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
          Open <strong className="text-white/60">Settings → Notifications → {appName}</strong> and
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
            Notifications go to GTS and Sinclair&apos;s staff only.
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
