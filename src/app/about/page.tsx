// src/app/about/page.tsx — marketing About page.
//
// THE SISTERS ARE THE PAGE. Not an illustration beside some text — the reason
// anybody chooses a small operator over a big one. So they get the centre of
// the layout, at full width, on the gradient, above the fold.
//
// Two decisions carried over from the Aug 25 call:
//   · The marina drone photo is gone. Jen's mother said so live, because the
//     family no longer owns the marina and the photo implied otherwise.
//   · No "woman-owned" badge. Dad is an owner through the marina, so it
//     wouldn't be accurate. The photograph carries the signal instead — which
//     is more convincing than a badge anyway.

import type { Metadata } from 'next';
import { Anchor, Clock, MapPin, Radio } from 'lucide-react';
import { SiteShell, Photo, SistersPortrait, CtaBand } from '@/components/site/SiteChrome';
import { ABOUT, CTA, BUSINESS, IMAGES } from '@/app/site/content';

export const metadata: Metadata = {
  title: ABOUT.meta.title,
  description: ABOUT.meta.description,
};

const ICONS = [Clock, MapPin, Radio];

export default function AboutPage() {
  return (
    <SiteShell current="About">

      {/* ── The sisters ────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pt-14 md:pt-20 pb-4 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-green text-brand-yellow rounded-full px-4 py-1.5 mb-7">
          <Anchor className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-widest">
            On the river for generations
          </span>
        </div>

        <h1 className="gts-heading text-[2.5rem] sm:text-5xl md:text-6xl mb-9 leading-[0.95]">
          {ABOUT.headingLines.map((line, i) => (
            <span key={i}>{line}{i < ABOUT.headingLines.length - 1 && <br />}</span>
          ))}
        </h1>

        <SistersPortrait src={IMAGES.sisters.src} alt={IMAGES.sisters.alt} />
      </section>

      {/* ── The story ──────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-14">
        {ABOUT.paragraphs.map((p, i) => (
          <p key={i}
            className={`font-body leading-relaxed mb-6 ${
              // Lead paragraph carries more weight, the rest settle back.
              i === 0
                ? 'text-brand-green/85 text-xl md:text-[22px] leading-relaxed'
                : 'text-brand-green/70 text-lg'
            }`}>
            {p}
          </p>
        ))}

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          {ABOUT.stats.map(({ stat, label }, i) => {
            const Icon = ICONS[i] ?? Clock;
            return (
              <div key={stat}
                className="bg-white/60 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-4 h-4 text-brand-green" aria-hidden="true" />
                </div>
                <p className="gts-heading text-xl leading-none mb-1">{stat}</p>
                <p className="text-brand-green/55 text-[11px] font-body uppercase tracking-wider">{label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── The river ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-14">
        <Photo src={IMAGES.hero.src} alt={IMAGES.hero.alt} width={1800} aspect="hero" />
      </section>

      {/* ── Sinclair's ─────────────────────────────────────────────────────
          Barge companies care about two things: family-owned, and that the
          groceries come from a real grocery store. The page above makes the
          first case; this makes the second. Name prominent, no logo. */}
      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="bg-brand-green rounded-2xl px-7 py-7 text-center">
          <p className="text-white font-body leading-snug max-w-2xl mx-auto">
            <span className="font-bold text-lg block mb-1.5">
              Groceries from Sinclair&apos;s Foods.
            </span>
            <span className="text-brand-yellow/85">
              A family grocery in Jerseyville that&apos;s been feeding this county
              for decades. We walk their aisles the same way you would.
            </span>
          </p>
          <p className="text-brand-yellow/55 text-[11px] font-body mt-4 uppercase tracking-widest">
            {BUSINESS.mileMarkers}
          </p>
        </div>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
