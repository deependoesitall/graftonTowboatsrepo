// src/app/about/page.tsx — marketing About page.
//
// The marina drone photo that was here is gone: decided live on the Aug 25 call
// by Jen's mother, because the family no longer owns the marina and the photo
// implied otherwise. The sisters' photo takes its place and carries the
// family-owned signal — which is also why there's no "woman-owned" badge, since
// Dad is an owner through the marina and it wouldn't be accurate.

import type { Metadata } from 'next';
import { SiteShell, PhotoSlot, CtaBand } from '@/components/site/SiteChrome';
import { ABOUT, CTA, BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: ABOUT.meta.title,
  description: ABOUT.meta.description,
};

export default function AboutPage() {
  return (
    <SiteShell current="About">
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <PhotoSlot label={ABOUT.photo.label} hint={ABOUT.photo.hint} />

          <div>
            <h1 className="gts-heading text-[2.4rem] sm:text-5xl md:text-6xl mb-6 leading-[0.95]">
              {ABOUT.headingLines.map((line, i) => (
                <span key={i}>{line}{i < ABOUT.headingLines.length - 1 && <br />}</span>
              ))}
            </h1>

            {ABOUT.paragraphs.map((p, i) => (
              <p key={i} className="text-brand-green/75 font-body text-lg leading-relaxed mb-5">{p}</p>
            ))}

            <div className="flex flex-wrap gap-6 mt-8">
              {ABOUT.stats.map(({ stat, label }) => (
                <div key={stat} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-green/10 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="gts-heading text-lg leading-none">{stat}</p>
                    <p className="text-brand-green/55 text-[11px] font-body uppercase tracking-wider">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Sinclair's attribution appears here too. Barge companies care about
          two things — family-owned, and that the groceries come from a real
          grocery store. This page makes the first case; this band makes the
          second. Name prominent, no Sinclair's logo. */}
      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="bg-brand-green rounded-2xl px-7 py-6 text-center">
          <p className="text-white font-body leading-snug">
            <span className="font-bold text-lg">Groceries from Sinclair&apos;s Foods.</span>{' '}
            <span className="text-brand-yellow/85">
              A family grocery in Jerseyville that&apos;s been feeding this county for decades.
              We shop their shelves the same way you would.
            </span>
          </p>
          <p className="text-brand-yellow/60 text-xs font-body mt-3 uppercase tracking-widest">
            {BUSINESS.mileMarkers}
          </p>
        </div>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
