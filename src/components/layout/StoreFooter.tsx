// src/components/layout/StoreFooter.tsx
//
// The legal footer for the ordering side of the site (catalog, order form,
// confirmation). The marketing site has its own richer footer; this is the
// minimum a commercial storefront should always show.
//
// WHY IT EXISTS: until now the ordering system carried no company identity and
// no link to the Terms a customer agrees to by submitting an order. Agreeing to
// terms you have no way to reach is the kind of gap that undoes them — the
// standard is reasonable opportunity to review, and a permanent footer link is
// what makes the notice above the submit button meaningful rather than decorative.
//
// It also just answers the obvious question a new customer has on a catalog
// page: who am I actually buying from, and how do I ring them?
//
// Deliberately quiet — small, muted, out of the way. Nothing here should
// compete with the cart bar or an order in progress.

import { BUSINESS } from '@/app/site/content';

export function StoreFooter() {
  return (
    <footer className="border-t border-brand-navy/10 bg-white/60 mt-8">
      <div className="max-w-5xl mx-auto px-4 py-6 text-center">
        <p className="text-xs font-bold text-brand-navy">{BUSINESS.legalName}</p>

        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          {BUSINESS.street}, {BUSINESS.cityStateZip}
          <span className="mx-1.5 text-gray-300">·</span>
          <a href={BUSINESS.phoneHref} className="hover:text-brand-navy font-semibold">
            {BUSINESS.phone}
          </a>
        </p>

        <div className="flex items-center justify-center gap-4 mt-3">
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Accessibility', href: '/accessibility' },
          ].map(l => (
            <a key={l.href} href={l.href}
              className="text-[11px] text-gray-400 hover:text-brand-navy underline underline-offset-2">
              {l.label}
            </a>
          ))}
        </div>

        {/* Groceries are Sinclair's; delivery is GTS. Stating it here matches
            section 1 of the Terms, and keeps the two sellers straight on the
            page where someone is actually buying. */}
        <p className="text-[10px] text-gray-400 mt-3 leading-relaxed max-w-md mx-auto">
          Groceries are sold by Sinclair&apos;s Foods and purchased on your behalf.
          Delivery and arranged services are provided by {BUSINESS.name}.
        </p>
      </div>
    </footer>
  );
}

export default StoreFooter;
