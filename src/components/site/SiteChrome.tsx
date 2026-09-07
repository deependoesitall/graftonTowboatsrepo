// src/components/site/SiteChrome.tsx
//
// Nav, footer and the shared pieces every marketing page uses.
//
// One definition each. The Squarespace site repeated its footer on five pages,
// which is how the mile markers ended up wrong in five places at once — nobody
// edits the same text five times and gets it right.

import Link from 'next/link';
import { Phone, ShoppingCart, MapPin, Mail, Radio, Menu } from 'lucide-react';
import { BUSINESS, NAV } from '@/app/site/content';

/**
 * A photo slot.
 *
 * NOT a stock image, deliberately. Three of the live site's photos are Unsplash
 * and that quietly contradicts the "small town, family owned" pitch the copy is
 * making. Each slot names the shot it wants, so this doubles as the brief for
 * Jen — she's already photographing deliveries.
 *
 * Swapping one for a real photo is a one-line change: replace this component
 * with <img src=… alt=… />. The alt text is not optional — every image on the
 * live site has alt="" today, which is 13 accessibility failures and 13 missed
 * SEO opportunities.
 */
export function PhotoSlot({
  label, hint, aspect = 'wide',
}: { label: string; hint: string; aspect?: 'wide' | 'tall' }) {
  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed border-brand-green/25 bg-brand-green/[0.04]
                  flex flex-col items-center justify-center text-center px-6 overflow-hidden
                  ${aspect === 'tall' ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}
    >
      {/* Channel-marker stripe: red to port, green to starboard. The one piece
          of nautical language here that means something, rather than rope and
          anchors — which read as seafood restaurant to anyone who works a river. */}
      <div className="absolute top-0 left-0 right-0 h-1 flex" aria-hidden="true">
        <div className="flex-1 bg-[#C4342A]" />
        <div className="flex-1 bg-brand-glight" />
      </div>
      <div className="w-7 h-7 rounded-md bg-brand-green/15 mb-3" aria-hidden="true" />
      <p className="gts-heading text-sm text-brand-green/70 leading-tight">{label}</p>
      <p className="text-[11px] text-brand-green/45 mt-1.5 font-body leading-snug max-w-[16rem]">{hint}</p>
    </div>
  );
}

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="sticky top-0 z-50 bg-white/60 backdrop-blur-md border-b border-brand-green/10">
      <div className="max-w-7xl mx-auto px-5 h-20 md:h-24 flex items-center justify-between gap-4">
        <Link href="/site" className="flex items-center shrink-0">
          <img src="/branding/gts-logo.png" alt={BUSINESS.name} className="h-14 md:h-20 w-auto" />
        </Link>

        <div className="hidden lg:flex items-center gap-8">
          {NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className={`font-body font-semibold text-sm tracking-wide transition-colors ${
                current === label ? 'text-brand-orange' : 'text-brand-green hover:text-brand-orange'
              }`}>
              {label}
            </Link>
          ))}
        </div>

        {/* Order Now and Call sit at EQUAL weight. Jen rejected demoting the
            call button on Aug 25 — customers ring about crew change and parts,
            not just groceries, and a ghost button costs her that work. */}
        <div className="flex items-center gap-2 shrink-0">
          <a href={BUSINESS.phoneHref}
            className="border-2 border-brand-green text-brand-green text-[11px] md:text-xs font-bold uppercase tracking-widest px-4 md:px-5 py-2.5 rounded-full hover:bg-brand-green hover:text-white transition-colors flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Call or Email</span>
            <span className="sm:hidden">Call</span>
          </a>
          <a href={BUSINESS.orderUrl}
            className="bg-brand-green text-white text-[11px] md:text-xs font-bold uppercase tracking-widest px-4 md:px-5 py-2.5 rounded-full hover:bg-brand-gmed transition-colors flex items-center gap-2 border-2 border-brand-green">
            <ShoppingCart className="w-3.5 h-3.5" />
            Order Now
          </a>
        </div>
      </div>

      {/* Small screens lose the text links above, so they get them here rather
          than behind a hamburger. A captain on a phone should never have to
          hunt for Services. */}
      <div className="lg:hidden border-t border-brand-green/10 bg-white/40">
        <div className="max-w-7xl mx-auto px-5 py-2 flex items-center gap-5 overflow-x-auto">
          <Menu className="w-3.5 h-3.5 text-brand-green/40 shrink-0" aria-hidden="true" />
          {NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className={`text-xs font-semibold font-body whitespace-nowrap ${
                current === label ? 'text-brand-orange' : 'text-brand-green/75'
              }`}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

/** The order-or-call block that closes every page. */
export function CtaBand({ heading, lede }: { heading: string; lede: string }) {
  return (
    <section className="bg-brand-green py-16">
      <div className="max-w-4xl mx-auto px-5 text-center">
        <h2 className="gts-heading text-4xl md:text-5xl text-white mb-4">{heading}</h2>
        <p className="text-brand-yellow/85 font-body text-lg mb-9 max-w-xl mx-auto">{lede}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href={BUSINESS.orderUrl}
            className="inline-flex items-center gap-2.5 bg-brand-yellow text-brand-green font-bold uppercase tracking-widest text-sm px-8 py-4 rounded-full hover:bg-brand-ylight transition-colors shadow-lg">
            <ShoppingCart className="w-4 h-4" />
            Start an Order
          </a>
          <a href={BUSINESS.phoneHref}
            className="inline-flex items-center gap-2.5 border-2 border-brand-yellow text-brand-yellow font-bold uppercase tracking-widest text-sm px-8 py-4 rounded-full hover:bg-brand-yellow hover:text-brand-green transition-colors">
            <Phone className="w-4 h-4" />
            {BUSINESS.phone}
          </a>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-brand-green border-t border-white/10">
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid sm:grid-cols-3 gap-8 pb-9 border-b border-white/12">
          {[
            { icon: Phone, main: BUSINESS.phone, sub: '24/7 Support', href: BUSINESS.phoneHref },
            { icon: MapPin, main: `${BUSINESS.street}, ${BUSINESS.cityStateZip}`, sub: BUSINESS.mileMarkersShort, href: null },
            { icon: Mail, main: BUSINESS.email, sub: 'Email us anytime', href: `mailto:${BUSINESS.email}` },
          ].map(({ icon: Icon, main, sub, href }) => {
            const inner = (
              <>
                <Icon className="w-5 h-5 text-brand-yellow mb-2.5" aria-hidden="true" />
                <p className="text-white font-semibold text-sm font-body leading-snug break-words">{main}</p>
                <p className="text-brand-yellow/60 text-[11px] mt-1 uppercase tracking-wider font-body">{sub}</p>
              </>
            );
            return href
              ? <a key={sub} href={href} className="block hover:opacity-80 transition-opacity">{inner}</a>
              : <div key={sub}>{inner}</div>;
          })}
        </div>

        <div className="flex items-center gap-2 pt-6 pb-5 text-brand-yellow/70">
          <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />
          <p className="text-sm font-body">{BUSINESS.vhf}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
          <p className="text-brand-yellow/55 text-xs font-body text-center sm:text-left">
            © {new Date().getFullYear()} {BUSINESS.legalName} · Grafton, Illinois
          </p>
          {/* Footer, not main nav — nobody navigates to a privacy policy on
              purpose, and it clutters the top of the site. */}
          <div className="flex items-center gap-5">
            {[
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
              { label: 'Accessibility', href: '/accessibility' },
            ].map(({ label, href }) => (
              <Link key={label} href={href}
                className="text-brand-yellow/55 hover:text-brand-yellow text-xs font-body transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/** The page shell: gradient background + nav + footer. */
export function SiteShell({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #D9E84A 0%, #E8F070 50%, #F0F7A0 100%)' }}>
      <SiteNav current={current} />
      {children}
      <SiteFooter />
    </main>
  );
}
