// src/app/order-online/page.tsx
//
// Dedicated Order front door for marketing traffic (nav "Order", Order Now,
// Google sitelink candidate). Keeps /catalog as the actual storefront and
// /order as checkout — this page is the handoff: start ordering, sign in,
// or install the Home Screen app.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingCart, LogIn, Smartphone, Phone, ChevronRight, Ship } from 'lucide-react';
import { SiteShell, CtaBand } from '@/components/site/SiteChrome';
import { ORDER_PAGE, CTA, BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: ORDER_PAGE.meta.title,
  description: ORDER_PAGE.meta.description,
  alternates: { canonical: 'https://graftontowboatservices.com/order-online' },
  openGraph: {
    title: ORDER_PAGE.meta.title,
    description: ORDER_PAGE.meta.description,
    url: 'https://graftontowboatservices.com/order-online',
    images: [{ url: '/branding/gts-lockup.png', width: 1178, height: 492, alt: 'Grafton Towboat Services' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: ORDER_PAGE.meta.title,
    description: ORDER_PAGE.meta.description,
    images: ['/branding/gts-lockup.png'],
  },
};

const ACTIONS = [
  {
    href: '/catalog',
    icon: ShoppingCart,
    title: 'Browse & order',
    blurb: "Open the full catalog — groceries from Sinclair's Foods, supplies, and write-ins for your vessel.",
    cta: 'Start ordering',
    primary: true,
  },
  {
    href: '/account',
    icon: LogIn,
    title: 'Sign in',
    blurb: 'Have an account? See your order history and saved vessel details.',
    cta: 'Sign in',
    primary: false,
  },
  {
    href: '/install',
    icon: Smartphone,
    title: 'Add to Home Screen',
    blurb: 'Install Grafton Order on your phone — stays signed in, one tap when you need groceries or supplies.',
    cta: 'Install guide',
    primary: false,
  },
] as const;

export default function OrderOnlinePage() {
  return (
    <SiteShell current="Order">
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-brand-green text-brand-yellow rounded-full px-4 py-1.5 mb-6">
            <Ship className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase tracking-widest">
              Online ordering
            </span>
          </div>

          <h1 className="gts-heading text-[2.6rem] sm:text-6xl lg:text-7xl leading-[0.95] mb-6">
            {ORDER_PAGE.headingLines[0]}
            <br />
            <span className="text-brand-orange">{ORDER_PAGE.headingLines[1]}</span>
          </h1>

          <p className="text-brand-green/75 text-lg font-body leading-relaxed mb-8 max-w-xl">
            {ORDER_PAGE.lede}
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="inline-flex items-center gap-2.5 bg-brand-green text-white font-bold text-base uppercase tracking-widest px-8 py-4 rounded-full hover:bg-brand-gmed transition-colors shadow-lg group"
            >
              <ShoppingCart className="w-5 h-5" />
              Start ordering
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center gap-2.5 border-2 border-brand-green text-brand-green font-bold text-base uppercase tracking-widest px-8 py-4 rounded-full hover:bg-brand-green hover:text-white transition-colors"
            >
              <Phone className="w-4 h-4" />
              {BUSINESS.phone}
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="grid md:grid-cols-3 gap-4">
          {ACTIONS.map(({ href, icon: Icon, title, blurb, cta, primary }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-2xl border p-6 flex flex-col transition-colors ${
                primary
                  ? 'border-brand-green bg-brand-green text-white hover:bg-brand-gmed'
                  : 'border-brand-green/15 bg-white/70 hover:border-brand-orange/40'
              }`}
            >
              <Icon className={`w-7 h-7 mb-4 ${primary ? 'text-brand-yellow' : 'text-brand-orange'}`} />
              <h2 className={`gts-heading text-xl mb-2 ${primary ? 'text-white' : 'text-brand-navy'}`}>
                {title}
              </h2>
              <p className={`font-body text-sm leading-relaxed flex-1 mb-5 ${primary ? 'text-white/85' : 'text-brand-green/70'}`}>
                {blurb}
              </p>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${
                  primary ? 'text-brand-yellow' : 'text-brand-orange'
                }`}
              >
                {cta}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand heading={CTA.heading} lede={CTA.lede} />
    </SiteShell>
  );
}
