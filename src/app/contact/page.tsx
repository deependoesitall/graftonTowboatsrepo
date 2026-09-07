// src/app/contact/page.tsx — marketing Contact page.
//
// The phone number is given more weight than the form on purpose. Crews call;
// that's how this business actually works, and Jen was explicit on Aug 25 that
// people ring about crew change and parts, not just groceries. The form is for
// the ones who'd rather type.

import type { Metadata } from 'next';
import { Phone, Mail, MapPin, Radio, Clock } from 'lucide-react';
import { SiteShell } from '@/components/site/SiteChrome';
import ContactForm from '@/components/site/ContactForm';
import { CONTACT_PAGE, BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: CONTACT_PAGE.meta.title,
  description: CONTACT_PAGE.meta.description,
};

export default function ContactPage() {
  return (
    <SiteShell current="Contact">
      <section className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-16">
        <h1 className="gts-heading text-[2.4rem] sm:text-5xl md:text-6xl text-center mb-4">
          {CONTACT_PAGE.heading}
        </h1>
        <p className="text-brand-green/70 font-body text-lg text-center max-w-2xl mx-auto mb-12">
          {CONTACT_PAGE.lede}
        </p>

        <div className="grid lg:grid-cols-[1fr_1.25fr] gap-8 lg:gap-12 items-start">

          {/* Call first. A captain with a problem at 5am should not be typing. */}
          <div className="space-y-4">
            <a href={BUSINESS.phoneHref}
              className="block bg-brand-green rounded-2xl p-7 hover:bg-brand-gmed transition-colors shadow-lg">
              <Phone className="w-7 h-7 text-brand-yellow mb-3" />
              <p className="text-brand-yellow/70 text-[11px] font-bold uppercase tracking-widest mb-1">
                Call us — fastest
              </p>
              <p className="gts-heading text-3xl text-white leading-none mb-2">{BUSINESS.phone}</p>
              <p className="text-brand-yellow/75 text-sm font-body">
                Answered around the clock, including nights and weekends.
              </p>
            </a>

            <div className="bg-white/65 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-6 space-y-5">
              {[
                { icon: Mail, label: 'Email', value: BUSINESS.email, href: `mailto:${BUSINESS.email}` },
                { icon: MapPin, label: 'Find us', value: `${BUSINESS.street}\n${BUSINESS.cityStateZip}`, href: null },
                { icon: Radio, label: 'On the water', value: BUSINESS.mileMarkers, href: null },
                { icon: Clock, label: 'VHF', value: BUSINESS.vhf, href: null },
              ].map(({ icon: Icon, label, value, href }) => {
                const body = (
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-brand-green" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50 mb-0.5">
                        {label}
                      </p>
                      <p className="text-brand-green font-body text-sm leading-snug whitespace-pre-line break-words">
                        {value}
                      </p>
                    </div>
                  </div>
                );
                return href
                  ? <a key={label} href={href} className="block hover:opacity-75 transition-opacity">{body}</a>
                  : <div key={label}>{body}</div>;
              })}
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
    </SiteShell>
  );
}
