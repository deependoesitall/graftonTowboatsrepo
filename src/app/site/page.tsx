// src/app/site/page.tsx
//
// MARKETING HOME PAGE.
//
// Lives at /site rather than / for now, because / is still the ordering
// landing page and Deepen is mid-launch. On DNS-switch day this file's contents
// move to app/page.tsx and the ordering entry point stays at /catalog, which is
// already where every CTA points.
//
// Nav, footer, photo slots and the closing CTA come from SiteChrome so they are
// defined once. The Squarespace site repeated its footer across five pages,
// which is exactly how the mile markers ended up wrong in five places at once.
//
// ON THE MARINE LOOK: no rope, no anchors, no portholes — that reads as seafood
// restaurant and a port captain clocks it immediately. The references used here
// are working-river ones: hi-vis deck-safety yellow (already the brand), the
// red/green channel-marker stripe on photo slots, and the mile-marker system
// these crews actually navigate by, promoted out of the footer and into the
// hero where it does some good.

import type { Metadata } from 'next';
import { ShoppingCart, Phone, ChevronRight, Truck, Radio } from 'lucide-react';
import { SiteShell, PhotoSlot, CtaBand } from '@/components/site/SiteChrome';
import { HOME, SERVICES, CTA, BUSINESS } from './content';

export const metadata: Metadata = {
  title: HOME.meta.title,
  description: HOME.meta.description,
};

export default function MarketingHome() {
  return (
    <SiteShell current="Home">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-12">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-green text-brand-yellow rounded-full px-4 py-1.5 mb-6">
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-widest">
                {BUSINESS.mileMarkersShort}
              </span>
            </div>

            <h1 className="gts-heading text-[2.6rem] sm:text-6xl lg:text-7xl leading-[0.95] mb-6">
              {HOME.heroLines[0]}<br />
              <span className="text-brand-orange">{HOME.heroLines[1]}</span><br />
              {HOME.heroLines[2]}
            </h1>

            <p className="text-brand-green/75 text-lg font-body leading-relaxed mb-8 max-w-lg">
              {HOME.lede}
            </p>

            <div className="flex flex-wrap gap-3">
              <a href={BUSINESS.orderUrl}
                className="inline-flex items-center gap-2.5 bg-brand-green text-white font-bold text-base uppercase tracking-widest px-8 py-4 rounded-full hover:bg-brand-gmed transition-colors shadow-lg group">
                <ShoppingCart className="w-5 h-5" />
                Start an Order
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a href={BUSINESS.phoneHref}
                className="inline-flex items-center gap-2.5 border-2 border-brand-green text-brand-green font-bold text-base uppercase tracking-widest px-8 py-4 rounded-full hover:bg-brand-green hover:text-white transition-colors">
                <Phone className="w-4 h-4" />
                {BUSINESS.phone}
              </a>
            </div>

            <p className="text-brand-green/50 text-[11px] mt-5 tracking-widest uppercase font-body">
              {HOME.fineprint}
            </p>
          </div>

          <PhotoSlot aspect="tall" label={HOME.heroPhoto.label} hint={HOME.heroPhoto.hint} />
        </div>
      </section>

      {/* ── Sinclair's attribution ───────────────────────────────────────
          Jen: barge companies care about two things — family-owned, and that
          the groceries come from a real grocery store. This answers the second.
          Name prominent, NO Sinclair's logo (Dave's boundary). */}
      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="bg-brand-green rounded-2xl px-7 py-6 flex flex-col sm:flex-row items-center gap-5 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-brand-yellow/20 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6 text-brand-yellow" aria-hidden="true" />
          </div>
          <p className="text-white font-body text-center sm:text-left leading-snug">
            <span className="font-bold text-lg block sm:inline">{HOME.sinclairs.lead}</span>{' '}
            <span className="text-brand-yellow/85">{HOME.sinclairs.rest}</span>
          </p>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────
          Every card ends in an action that WORKS. On the live Squarespace site
          the supplies card said "Coming Soon!" and the grocery card's "Book
          now" both pointed at an orphaned scheduling page — so the most
          important link on the site sent customers away from the ordering
          system entirely. */}
      <section className="max-w-6xl mx-auto px-5 py-6 md:py-10">
        <h2 className="gts-heading text-4xl md:text-5xl text-center mb-3">Our Services</h2>
        <p className="text-brand-green/65 font-body text-center max-w-2xl mx-auto mb-12">
          Grocery delivery, crew change and supplies. Need something else? Tell us
          and we&apos;ll work it out.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {SERVICES.map(s => (
            <div key={s.slug}
              className="bg-white/65 backdrop-blur-sm rounded-2xl border border-brand-green/10 overflow-hidden flex flex-col hover:bg-white/85 transition-colors">
              <div className="p-4 pb-0">
                <PhotoSlot label={s.photo.label} hint={s.photo.hint} />
              </div>
              <div className="p-6 pt-5 flex flex-col flex-1">
                <h3 className="gts-heading text-xl mb-2 leading-tight">{s.title}</h3>
                <p className="text-brand-green/65 text-sm leading-relaxed font-body flex-1">{s.blurb}</p>
                <a href={s.cta.href}
                  className={`mt-5 inline-flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs px-5 py-3 rounded-full transition-colors ${
                    s.cta.href.startsWith('tel:')
                      ? 'border-2 border-brand-green text-brand-green hover:bg-brand-green hover:text-white'
                      : 'bg-brand-orange text-white hover:bg-brand-ored'
                  }`}>
                  {s.cta.label}
                  <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
