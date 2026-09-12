// src/app/accessibility/page.tsx
//
// Not box-ticking. A captain is often ordering from a phone, in bad light, on a
// moving boat, one-handed, on poor signal — which is functionally a low-vision,
// low-dexterity, high-distraction environment. Designing for that is the same
// work as designing for accessibility, and it makes the product better for
// everyone using it.
//
// A good-faith statement plus a working contact route is also meaningful
// protection: ADA website complaints against small businesses are common, and
// "here is how to reach a human who will help you" is the single most useful
// thing this page does.

import type { Metadata } from 'next';
import { LegalShell, LS, LP, LUL } from '@/components/site/LegalShell';
import { BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: 'Accessibility | Grafton Towboat Services',
  description: 'Our commitment to keeping the Grafton Towboat Services website usable for everyone.',
  robots: { index: false, follow: true },
};

export default function AccessibilityPage() {
  return (
    <LegalShell
      title="Accessibility"
      effective="Last reviewed September 7, 2026"
      lede="We want anyone to be able to order from us, whatever device they're on and however they use it. If something on this site gets in your way, tell us and we'll fix it — and in the meantime we'll take your order over the phone."
    >
      <LS>Call us and we&apos;ll handle it</LS>
      <LP>
        The fastest fix is always a person. If any part of this website is
        difficult or impossible for you to use, call{' '}
        <a className="text-brand-orange font-semibold hover:underline" href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>{' '}
        — answered around the clock — or email{' '}
        <a className="text-brand-orange font-semibold hover:underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        We will take your order, answer your question, or read you whatever you
        need. No explanation required.
      </LP>

      <LS>What we&apos;ve done</LS>
      <LUL items={[
        'Text and background colors are chosen for contrast, and body text can be enlarged by your browser without the layout breaking.',
        'Every control can be reached and operated with a keyboard alone.',
        'Form fields have real labels attached to them, so screen readers announce what each one is for.',
        'Buttons and links are sized for a thumb, not a mouse pointer — which matters on a boat as much as it does for anyone with limited dexterity.',
        'Images carry text descriptions so screen readers can convey what they show.',
        'The site works without JavaScript for reading, and does not depend on hover to reveal anything important.',
      ]} />

      <LS>Where we know we fall short</LS>
      <LP>
        We would rather name this than claim perfection. We are working through
        the remaining image descriptions on older photographs, and we have not yet
        had this site independently audited against WCAG 2.1 AA. We intend to.
      </LP>

      <LS>Ordering by phone is always an option</LS>
      <LP>
        Nothing on this site is the only way to do anything. Every order that can
        be placed online can be placed by phone, at the same price, with no
        difference in service. The website exists to save you time when it&apos;s
        convenient — never as a barrier when it isn&apos;t.
      </LP>

      <LS>Tell us</LS>
      <LP>
        If you hit a problem, we want to hear about it — including what device and
        browser you were using, if you know. We&apos;ll work to get it resolved
        and get you back up and running.
      </LP>
      <LP>
        {BUSINESS.legalName}<br />
        <a className="text-brand-orange font-semibold hover:underline" href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
        {' · '}
        <a className="text-brand-orange font-semibold hover:underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      </LP>
    </LegalShell>
  );
}
