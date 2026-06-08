// src/app/page.tsx
import Link from 'next/link';
import { Anchor, ShoppingCart, Phone, MapPin, Clock, ChevronRight, Package, FileText } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-brand-navy">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-brand-navy/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-gold/20 rounded-full flex items-center justify-center">
              <Anchor className="w-4 h-4 text-brand-gold" />
            </div>
            <span className="font-display text-white text-lg font-bold tracking-wide">
              Grafton Towboat
            </span>
          </div>
          <Link href="/catalog" className="btn-gold text-sm px-5 py-2 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Order Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 min-h-[92vh] flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-navy via-[#112438] to-brand-steel" />
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Gold glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-gold/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
            <span className="text-brand-gold text-xs font-semibold tracking-widest uppercase">
              Mississippi Mile Marker 218
            </span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl text-white font-bold leading-[1.05] mb-6">
            Grafton Towboat
            <span className="block text-brand-gold">Services</span>
          </h1>

          <p className="text-brand-sky text-lg md:text-xl mb-12 font-light max-w-xl mx-auto leading-relaxed">
            Groceries, supplies &amp; crew change delivered to your vessel. Partnered with Sinclair&apos;s Foods.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/catalog"
              className="inline-flex items-center gap-3 bg-brand-gold hover:bg-brand-amber text-white font-body font-bold text-lg px-10 py-4 rounded-lg transition-colors duration-200 shadow-2xl shadow-brand-gold/20 group"
            >
              <ShoppingCart className="w-5 h-5" />
              Order Groceries &amp; Supplies
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="tel:6185560290"
              className="inline-flex items-center gap-2 text-brand-sky hover:text-white border border-white/20 hover:border-white/40 px-7 py-4 rounded-lg transition-colors font-medium"
            >
              <Phone className="w-4 h-4" />
              (618) 556-0290
            </a>
          </div>

          <p className="text-brand-sky/50 text-xs mt-8 tracking-wide">
            No login required · Orders sent instantly · PDF receipt included
          </p>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 30 Q360 0 720 30 Q1080 60 1440 30 L1440 60 L0 60 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="font-display text-4xl text-brand-navy font-bold mb-3">How It Works</h2>
            <p className="text-gray-400 text-base">Three steps, no hassle</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 bg-brand-sand" />

            {[
              { step: '01', icon: ShoppingCart, title: 'Browse & Build', desc: 'Search hundreds of grocery and supply items. Add to cart instantly — no account needed.' },
              { step: '02', icon: Package, title: 'Enter Vessel Info', desc: 'Company name, contact, phone, PO#, ETA, and any special instructions.' },
              { step: '03', icon: FileText, title: 'Submit & Done', desc: 'We receive your order instantly by email. Download your PDF receipt for your records.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative text-center">
                <div className="relative inline-flex mb-5">
                  <div className="w-20 h-20 bg-brand-navy rounded-2xl flex items-center justify-center shadow-lg shadow-brand-navy/20">
                    <Icon className="w-8 h-8 text-brand-gold" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-brand-gold text-white text-xs font-bold rounded-full flex items-center justify-center shadow">
                    {step}
                  </span>
                </div>
                <h3 className="font-display text-xl text-brand-navy font-bold mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link href="/catalog" className="inline-flex items-center gap-2 btn-primary px-10 py-4 text-base">
              <ShoppingCart className="w-5 h-5" />
              Start Your Order
            </Link>
          </div>
        </div>
      </section>

      {/* Contact strip */}
      <section className="bg-brand-navy py-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { icon: Phone, label: '(618) 556-0290', sub: '24/7 Support', href: 'tel:6185560290' },
              { icon: MapPin, label: 'Mile Marker 218', sub: 'Grafton, IL 62037', href: null },
              { icon: Clock, label: 'Monitor Channel 68', sub: 'Grafton Harbor', href: null },
            ].map(({ icon: Icon, label, sub, href }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center mb-1">
                  <Icon className="w-5 h-5 text-brand-gold" />
                </div>
                {href ? (
                  <a href={href} className="text-white font-semibold hover:text-brand-gold transition-colors">{label}</a>
                ) : (
                  <span className="text-white font-semibold">{label}</span>
                )}
                <span className="text-brand-sky text-sm">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
