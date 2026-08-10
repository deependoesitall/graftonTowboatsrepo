// src/app/page.tsx
import Link from 'next/link';
import { ShoppingCart, Phone, MapPin, Mail, ChevronRight, Package, FileText, Truck } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#F7F6EF]">

      {/* ── HERO PANEL ──────────────────────────────────────────────────────
          Deep green, full-bleed. The lime is a brilliant accent but as a
          full-page wash it flattened everything and read cheap; on dark it
          does the work of a highlight. */}
      <div className="relative bg-brand-green overflow-hidden">
        {/* Subtle depth — river-light glow, no gradients on text */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{ background: 'radial-gradient(60% 60% at 50% 0%, #D9E84A 0%, transparent 70%)' }} />

        {/* Nav */}
        <nav className="relative z-50 border-b border-white/10">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <img
                src="/branding/gts-logo.png"
                alt="Grafton Towboat Services"
                className="h-16 w-auto drop-shadow"
              />
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {[
                { href: 'https://www.graftontowboatservices.com/', label: 'Home' },
                { href: 'https://www.graftontowboatservices.com/services', label: 'Services' },
                { href: 'https://www.graftontowboatservices.com/about', label: 'About' },
                { href: 'https://www.graftontowboatservices.com/contact', label: 'Contact' },
              ].map(({ href, label }) => (
                <a key={label} href={href}
                  className="text-white/75 font-body font-semibold text-sm hover:text-brand-yellow transition-colors tracking-wide">
                  {label}
                </a>
              ))}
            </div>

            <Link href="/catalog"
              className="bg-brand-yellow text-brand-green text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded-full hover:brightness-105 transition-all flex items-center gap-2 whitespace-nowrap shadow-lg">
              <ShoppingCart className="w-3.5 h-3.5" />
              Order Now
            </Link>
          </div>
        </nav>

        {/* Hero copy */}
        <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
          <p className="text-brand-yellow/90 text-xs font-bold uppercase tracking-[0.25em] mb-5">
            Now ordering online
          </p>
          <h1 className="gts-heading text-5xl md:text-7xl leading-[0.95] mb-6 text-white">
            Groceries, Supplies<br />
            <span className="text-brand-yellow">&amp; Crew Change</span><br />
            When You Need It.
        </h1>
          <p className="text-white/65 text-lg mb-10 font-body max-w-xl mx-auto leading-relaxed">
            Partnered with Sinclair&apos;s Foods · Grafton, IL<br />
            Mile Marker 219 Mississippi River · Mile Marker 0 Illinois River
          </p>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-3 bg-brand-yellow text-brand-green font-bold text-lg uppercase tracking-widest px-10 py-4 rounded-full hover:brightness-105 transition-all shadow-xl group"
          >
            <ShoppingCart className="w-5 h-5" />
            Order Groceries &amp; Supplies
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <p className="text-white/40 text-xs mt-4 tracking-widest uppercase">
            No login required · Instant confirmation · PDF receipt
          </p>
        </section>
      </div>

      {/* Delivery callout — straddles the hero edge so it reads as a card */}
      <section className="max-w-5xl mx-auto px-6">
        <div className="-mt-10 relative z-20 flex items-center gap-4 bg-white rounded-2xl px-8 py-6 shadow-xl border border-brand-green/10 text-left">
          <div className="w-12 h-12 bg-brand-green rounded-full flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6 text-brand-yellow" />
          </div>
          <div>
            <p className="font-bold text-base leading-tight text-brand-green">We deliver directly to your vessel — by boat or refrigerated van.</p>
            <p className="text-brand-green/60 text-sm mt-1 font-body leading-snug">
              Order online · we pack &amp; bring it to your boat at Mile Marker 219 on the Mississippi River, Mile Marker 0 on the Illinois River.
              Cold &amp; frozen goods ride refrigerated the whole way.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="gts-heading text-4xl text-brand-green text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { num: '01', icon: ShoppingCart, title: 'Browse & Build', desc: 'Search hundreds of grocery and supply items. Add to cart instantly.' },
            { num: '02', icon: Package, title: 'Enter Vessel Info', desc: 'Company name, contact, PO#, ETA, and any special instructions.' },
            { num: '03', icon: Truck, title: 'We Deliver to Your Boat', desc: "Submit your order and we'll have it packed and waiting at your vessel when you arrive." },
          ].map(({ num, icon: Icon, title, desc }) => (
            <div key={num} className="bg-white rounded-2xl p-8 border border-brand-green/10 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-colors">
              <div className="w-16 h-16 bg-brand-green rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <Icon className="w-7 h-7 text-brand-yellow" />
              </div>
              <span className="text-brand-orange font-bold text-xs uppercase tracking-widest">{num}</span>
              <h3 className="gts-heading text-xl text-brand-green mt-1 mb-2">{title}</h3>
              <p className="text-brand-green/60 text-sm leading-relaxed font-body">{desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/catalog" className="inline-flex items-center gap-2 bg-brand-orange text-white font-bold uppercase tracking-widest text-sm px-10 py-4 rounded-full hover:bg-brand-ored transition-colors shadow-md">
            <ShoppingCart className="w-4 h-4" />
            Start Your Order
          </Link>
        </div>
      </section>

      {/* Contact strip */}
      <section className="bg-brand-green py-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { icon: Phone, label: '(618) 556-0290', sub: '24/7 Support', href: 'tel:6185560290' },
              { icon: MapPin, label: 'Mile Marker 219 (Mississippi River) · Mile Marker 0 (Illinois River)', sub: 'Grafton, IL 62037', href: null },
              { icon: Mail, label: 'GraftonTowboatServices@gmail.com', sub: 'Email us anytime', href: 'mailto:GraftonTowboatServices@gmail.com' },
            ].map(({ icon: Icon, label, sub, href }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-brand-yellow/20 rounded-full flex items-center justify-center mb-1">
                  <Icon className="w-5 h-5 text-brand-yellow" />
                </div>
                {href ? (
                  <a href={href} className="text-white font-bold hover:text-brand-yellow transition-colors font-body">{label}</a>
                ) : (
                  <span className="text-white font-bold font-body">{label}</span>
                )}
                <span className="text-brand-yellow/60 text-sm font-body">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
