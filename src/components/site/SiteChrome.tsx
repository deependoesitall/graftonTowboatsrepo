// src/components/site/SiteChrome.tsx
//
// Nav, footer and the shared pieces every marketing page uses.
//
// One definition each. The Squarespace site repeated its footer on five pages,
// which is how the mile markers ended up wrong in five places at once — nobody
// edits the same text five times and gets it right.

import Link from 'next/link';
import { Phone, ShoppingCart, MapPin, Mail, Radio, Menu } from 'lucide-react';
import { BUSINESS, NAV, OWNERS, img } from '@/app/site/content';
import { LocalBusinessSchema } from '@/components/site/StructuredData';

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
/**
 * A real photograph.
 *
 * Plain <img> rather than next/image on purpose: these are a handful of static
 * images from a CDN that already resizes on request, and next/image would spend
 * Vercel image-optimisation quota to do a job Squarespace's CDN does for free.
 *
 * `width` asks the CDN for roughly what we display, so a phone doesn't download
 * a 2500px original. The channel-marker stripe stays — it's the one piece of
 * river language on the site that means something.
 */
export function Photo({
  src, alt, width, aspect = 'wide', priority = false, fit = 'cover',
}: {
  src: string; alt: string; width: number;
  aspect?: 'wide' | 'tall' | 'hero' | 'strip'; priority?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const ratio = {
    tall:  'aspect-[3/4]',
    hero:  'aspect-[16/10] md:aspect-[21/9]',
    // For the sisters: the source is 500×200, three headshots side by side.
    // Cropping that to 4:3 with object-cover would slice the outer two women
    // out of frame entirely — the single worst possible thing to crop.
    strip: 'aspect-[5/2]',
    wide:  'aspect-[4/3]',
  }[aspect];

  const contain = fit === 'contain';

  return (
    <div className={`relative rounded-2xl overflow-hidden ${ratio} ${
      contain ? 'bg-white/70 border border-brand-green/10' : 'shadow-lg'}`}>
      <div className="absolute top-0 left-0 right-0 h-1 flex z-10" aria-hidden="true">
        <div className="flex-1 bg-[#C4342A]" />
        <div className="flex-1 bg-brand-glight" />
      </div>
      <img
        src={img(src, width)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        // Every image on the live Squarespace site has alt="". Not here.
        className={`w-full h-full ${contain ? 'object-contain p-4' : 'object-cover'}`}
      />
    </div>
  );
}

/**
 * The sisters.
 *
 * Their photo is a 500×200 PNG containing THREE separate rounded portraits on a
 * TRANSPARENT background — not one photograph. That's why it gets its own
 * treatment: no card, no border, no channel-marker stripe. Dropped straight
 * onto the page gradient, the three portraits float and it reads as designed.
 * Boxed into a white card it reads as a screenshot someone pasted in.
 *
 * It's also capped at a sensible width. The source is only 500px, so blowing it
 * up across a hero would make the people look soft — and these are the faces
 * the whole "family owned" pitch rests on. Better modest and sharp than large
 * and mushy, until a higher-resolution version exists.
 */
export function SistersPortrait({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="max-w-[560px] mx-auto">
      <img
        src={img(src, 1000)}
        alt={alt}
        className="w-full h-auto drop-shadow-[0_10px_24px_rgba(30,61,30,0.18)]"
      />

      {/* NAMES ALIGNED UNDER THEIR OWN FACES.
          Order confirmed by Deepen, Sept 8: MaryKaren, Laura, Jennifer, left to
          right. Worth having asked — the Squarespace page these came from
          renders its labels misaligned on a wide screen (MaryKaren under the
          first portrait, Laura under the third, Jennifer under nothing), so
          reading the mapping off that page would have put the wrong name under
          someone's photograph on her own company's website.

          The three portraits sit evenly across the source PNG, so an equal
          three-column grid at the same width lines up beneath them — and unlike
          Squarespace's absolutely-positioned text, it can't drift apart at any
          screen size. */}
      <figcaption className="grid grid-cols-3 gap-1 mt-3">
        {OWNERS.map(({ name, phone, href }) => (
          <a key={name} href={href}
            className="group text-center rounded-xl px-1 py-2 hover:bg-white/60 transition-colors">
            <span className="block gts-heading text-sm sm:text-base leading-none group-hover:text-brand-orange transition-colors">
              {name}
            </span>
            <span className="block text-brand-green/60 font-body text-[11px] sm:text-xs mt-1 tabular-nums">
              {phone}
            </span>
          </a>
        ))}
      </figcaption>

      <p className="text-brand-green/55 font-body text-sm text-center mt-4">
        The three sisters who own and run Grafton Towboat Services
      </p>
    </figure>
  );
}

/**
 * The owners' direct lines.
 *
 * For a business whose whole pitch is "family owned", a captain being able to
 * ring an owner directly IS the product — so these get real cards rather than
 * the line of small text they had on Squarespace.
 *
 * This is the Contact-page block. The About page captions the same three names
 * under their own faces via SistersPortrait — that mapping was confirmed by
 * Deepen on Sept 8 rather than read off the Squarespace page, whose own labels
 * are misaligned. Both render from OWNERS in content.ts, so a correction in one
 * place fixes both.
 */
export function OwnerContacts() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50 text-center mb-4">
        Talk to an owner
      </p>
      <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {OWNERS.map(({ name, phone, href }) => (
          <a key={name} href={href}
            className="group bg-white/65 backdrop-blur-sm rounded-2xl border border-brand-green/10 px-5 py-4 text-center hover:bg-brand-green transition-colors">
            <p className="gts-heading text-base leading-none mb-1.5 group-hover:text-brand-yellow transition-colors">
              {name}
            </p>
            <p className="inline-flex items-center gap-1.5 text-brand-green/70 font-body text-sm group-hover:text-white transition-colors">
              <Phone className="w-3 h-3" aria-hidden="true" />
              {phone}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

export function PhotoSlot({
  label, hint, aspect = 'wide',
}: { label: string; hint: string; aspect?: 'wide' | 'tall' }) {
  // THE HINT IS A NOTE TO OURSELVES, NOT COPY.
  //
  // It's the brief for Jen — "people, not scenery", "replaces the stock photo",
  // "the current image is 269px". Useful internally, actively embarrassing in
  // public: the first deploy rendered "the fuzziest thing on the site" on a
  // live page a customer could read. It now only appears in development.
  //
  // The label stays visible in production because "GTS boat alongside a
  // towboat" reads as a photo that hasn't loaded yet, which is honest — these
  // are placeholders until Jen's delivery photos arrive.
  const showHint = process.env.NODE_ENV !== 'production';

  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed border-brand-green/25 bg-brand-green/[0.04]
                  flex flex-col items-center justify-center text-center px-6 overflow-hidden
                  ${aspect === 'tall' ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}
      role="img"
      aria-label={`Photograph coming soon: ${label}`}
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
      {showHint && (
        <p className="text-[11px] text-brand-green/45 mt-1.5 font-body leading-snug max-w-[16rem]">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="sticky top-0 z-50 bg-white/60 backdrop-blur-md border-b border-brand-green/10">
      <div className="max-w-7xl mx-auto px-5 h-20 md:h-24 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center shrink-0">
          <img src="/branding/gts-lockup.png" alt={BUSINESS.name} className="h-14 md:h-20 w-auto" />
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
          <a href="/order-online"
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
            {/* Trading name, not the legal name. A copyright notice only has to
                identify the owner, and "LLC" in a footer reads like paperwork.
                The entity name stays where it actually matters — Terms, Privacy
                and invoices, which is where naming the LLC does real work.

                NO YEAR, DELIBERATELY. These pages are statically generated, so
                `new Date().getFullYear()` would freeze at the last deploy — and
                a marketing site can sit untouched for a year or more. A footer
                reading "© 2026" in 2028 says the business folded. The year is
                legally worthless here anyway (US copyright is automatic since
                1989), so omitting it removes a failure mode rather than adding
                a chore nobody will remember. */}
            © {BUSINESS.name} · Grafton, Illinois
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

/** The page shell: structured data + gradient background + nav + footer. */
export function SiteShell({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <>
      {/* Feeds Google's local business panel. Invisible, and probably the
          highest-return thing on the site — the Squarespace version had none. */}
      <LocalBusinessSchema />

      {/* SKIP LINK — keyboard users shouldn't have to tab through the whole nav
          on every page to reach the content. Hidden until focused, then it
          slides into the top-left corner.

          DON'T REWRITE THIS AS `sr-only focus:not-sr-only`. That was the first
          version and it was broken: the two utilities have equal CSS
          specificity, so which one wins depends on source order — and
          `not-sr-only` lost. The link stayed 1×1px even when focused, which
          means it did nothing at all for the only people it exists to serve.
          Measured on the deployed site, not assumed.

          A transform can't lose that fight: -translate-y-full parks it fully
          above the viewport, focus:translate-y-3 brings it down. Transforms
          also don't affect layout or create phantom scrollbars the way a
          negative `top` can. */}
      <a href="#main"
        className="fixed top-0 left-3 z-[60] -translate-y-full focus:translate-y-3
                   bg-brand-green text-white px-4 py-2.5 rounded-full
                   text-xs font-bold uppercase tracking-widest
                   transition-transform duration-150">
        Skip to content
      </a>

      <main id="main" className="min-h-screen"
        style={{ background: 'linear-gradient(135deg, #D9E84A 0%, #E8F070 50%, #F0F7A0 100%)' }}>
        <SiteNav current={current} />
        {children}
        <SiteFooter />
      </main>
    </>
  );
}
