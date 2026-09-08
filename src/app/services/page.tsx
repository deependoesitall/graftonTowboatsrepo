// src/app/services/page.tsx — marketing Services page.
//
// Replaces the Squarespace /services page. Differences that matter:
//   · Every card ends in an action that WORKS. The live page's supplies card
//     said "Coming Soon!" and linked to an orphaned scheduling page, and the
//     grocery card's "Book now" pointed there too — so the single most
//     important link on the site sent customers away from the ordering system.
//   · "Towboat" is one word, everywhere. The live site spells it three ways.

import type { Metadata } from 'next';
import { ChevronRight, Phone } from 'lucide-react';
import { SiteShell, Photo, CtaBand } from '@/components/site/SiteChrome';
import { SERVICES, SERVICES_PAGE, CTA, BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: SERVICES_PAGE.meta.title,
  description: SERVICES_PAGE.meta.description,
};

export default function ServicesPage() {
  return (
    <SiteShell current="Services">
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-6">
        <h1 className="gts-heading text-[2.4rem] sm:text-5xl md:text-6xl text-center mb-4">
          {SERVICES_PAGE.heading}
        </h1>
        <p className="text-brand-green/70 font-body text-lg text-center max-w-2xl mx-auto">
          {SERVICES_PAGE.lede}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="space-y-6">
          {SERVICES.map((s, i) => (
            <div key={s.slug} id={s.slug}
              className="bg-white/65 backdrop-blur-sm rounded-2xl border border-brand-green/10 overflow-hidden">
              <div className={`grid md:grid-cols-2 gap-0 ${i % 2 ? 'md:[direction:rtl]' : ''}`}>
                <div className="p-5 md:[direction:ltr]">
                  <Photo src={s.image.src} alt={s.image.alt} width={900} />
                </div>
                <div className="p-6 md:p-8 flex flex-col justify-center md:[direction:ltr]">
                  <h2 className="gts-heading text-2xl md:text-3xl mb-3 leading-tight">{s.title}</h2>
                  <p className="text-brand-green/75 font-body leading-relaxed mb-3">{s.blurb}</p>
                  <p className="text-brand-green/60 font-body text-sm leading-relaxed mb-6">{s.detail}</p>
                  <a href={s.cta.href}
                    className="self-start inline-flex items-center gap-2 bg-brand-orange text-white font-bold uppercase tracking-widest text-xs px-6 py-3.5 rounded-full hover:bg-brand-ored transition-colors shadow">
                    {s.cta.href.startsWith('tel:')
                      ? <Phone className="w-3.5 h-3.5" />
                      : null}
                    {s.cta.label}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-brand-green/60 font-body mt-10">
          Need something that isn&apos;t on this list?{' '}
          <a href={BUSINESS.phoneHref} className="text-brand-orange font-semibold hover:underline">
            Call {BUSINESS.phone}
          </a>{' '}
          — if we can get it, we will.
        </p>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
