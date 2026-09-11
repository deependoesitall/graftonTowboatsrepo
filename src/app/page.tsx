// src/app/page.tsx
//
// MARKETING HOME PAGE — the front door of graftontowboatservices.com.
//
// Promoted from /site to / on Sept 8, 2026, ahead of pointing the domain at
// Vercel. The previous occupant was a SECOND ordering landing page; it's gone,
// because everything it said now lives here and /catalog is one click from
// every page. Two pages competing to be the front door is how you end up with
// the problem the Squarespace site had — a primary CTA nobody maintained.
//
// A dedicated /how-it-works page is planned for app trailers and media
// (Deepen, Sept 8). The three-step explainer lower down this page is the seed
// for it — lift it out when there's video to hang on it.
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
import { ShoppingCart, Phone, ChevronRight, Radio } from 'lucide-react';
import { SiteShell, Photo, CtaBand } from '@/components/site/SiteChrome';
import PartnerLockup from '@/components/site/PartnerLockup';
import { HOME, SERVICES, CTA, BUSINESS, IMAGES } from '@/app/site/content';

export const metadata: Metadata = {
  title: HOME.meta.title,
  description: HOME.meta.description,
  alternates: { canonical: 'https://graftontowboatservices.com/' },
  openGraph: {
    title: HOME.meta.title,
    description: HOME.meta.description,
    url: 'https://graftontowboatservices.com/',
    images: [{ url: '/branding/gts-lockup.png', width: 1178, height: 492, alt: 'Grafton Towboat Services' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME.meta.title,
    description: HOME.meta.description,
    images: ['/branding/gts-lockup.png'],
  },
};

export default function MarketingHome() {
  return (
    <SiteShell current="Home">
      {/* ── Hero ─────────────────────────────────────────────────────────
          Text first, then a wide photograph beneath it. The earlier version put
          a tall portrait slot beside the headline, which suited placeholders but
          fights every real photo GTS has — they're all landscape river shots,
          and cropping a barge tow to 3:4 throws away the river. */}
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-10">
        <div className="max-w-3xl">
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

        <div className="mt-11">
          <Photo src={IMAGES.hero.src} alt={IMAGES.hero.alt} width={1800} aspect="hero" priority />
        </div>
      </section>

      {/* ── Sinclair's attribution ───────────────────────────────────────
          Jen: barge companies care about two things — family-owned, and that
          the groceries come from a real grocery store. This answers the second.
          Name prominent, NO Sinclair's logo (Dave's boundary). */}
      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="bg-brand-green rounded-2xl px-7 py-9 shadow-lg">
          {/* THE LOGO REPLACES THE WORDS "Sinclair's Foods".
              Dave's boundary was never the mark itself — it was anything
              implying Sinclair's does the delivery (clarified Sept 2026). So
              the lockup states the sourcing visually and the caption underneath
              states who delivers, in words. See PartnerLockup for the full note.

              It also simply works harder: a real grocery store's logo is
              evidence, where "partnered with a local grocer" is a claim. */}
          <PartnerLockup
            tone="dark"
            size="lg"
            gtsMark="lockup"
            caption="Groceries from Sinclair's Foods — you order, Grafton Towboat Services delivers."
          />
          <p className="text-brand-yellow/60 font-body text-center text-sm mt-2.5 max-w-md mx-auto leading-snug">
            Cold and frozen goods ride refrigerated the whole way.
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
                <Photo src={s.image.src} alt={s.image.alt} width={760} />
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

      {/* ── How it works ─────────────────────────────────────────────────
          The Squarespace site never told a first-time customer what actually
          happens after they get in touch — it listed services and stopped. A
          port captain deciding whether to try an unfamiliar vendor is asking
          "what am I committing to here", and three sentences answer it.
          Mirrors the ordering site's own explainer so the two feel like one
          business rather than two. */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <h2 className="gts-heading text-3xl md:text-4xl text-center mb-3">How It Works</h2>
        <p className="text-brand-green/60 font-body text-center max-w-xl mx-auto mb-11">
          No account, no contract, no minimum. First time is the same as the hundredth.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              n: '01',
              title: 'Tell us what you need',
              body: 'Order online, or call and read us a list. Whichever is faster for you at the time.',
            },
            {
              n: '02',
              // DON'T ATTRIBUTE THE LABOUR HERE. Two corrections landed on this
              // one paragraph in Sept 2026 and they pull in opposite directions:
              //
              //   1. It said "we shop it / we walk Sinclair's aisles". False —
              //      Sinclair's own staff pull the grocery orders.
              //   2. The fix said "anything they don't carry, we source
              //      ourselves". Also false — on an off-catalog run it might be
              //      Sinclair's staff or GTS who drives to Walmart. It varies.
              //
              // So the copy describes the OUTCOME and the MECHANISM the customer
              // uses, and stays silent on whose hands do it. A cook does not
              // care who drove; they care that it arrives. Any sentence naming
              // the driver will be wrong some of the time.
              //
              // It also surfaces the external-item feature (paste a link, add a
              // note), which is a real differentiator and was invisible on the
              // marketing site until now.
              title: 'We put it together',
              body: "Grocery orders are pulled at Sinclair's by their own staff — the people who stock the shelves, picking your meat and produce. Need something the store doesn't carry? Send a link or just write it down, and it gets picked up along the way.",
            },
            {
              n: '03',
              title: 'We meet your boat',
              body: 'Delivered to your vessel at the mile marker, by boat or refrigerated van. Cold stays cold the whole way.',
            },
          ].map(({ n, title, body }) => (
            <div key={n} className="relative bg-white/55 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-7 pt-9">
              <span className="absolute top-5 right-6 gts-heading text-4xl text-brand-green/10 leading-none select-none"
                aria-hidden="true">
                {n}
              </span>
              <h3 className="gts-heading text-lg mb-2 pr-12 leading-tight">{title}</h3>
              <p className="text-brand-green/65 text-sm font-body leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
