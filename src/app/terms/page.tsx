// src/app/terms/page.tsx
// Working draft fitted to GTS operations. Not a substitute for Illinois counsel
// review of liability limits. No arbitration / class-waiver bolted on.

import type { Metadata } from 'next';
import { LegalShell, LS, LSub, LP, LUL, LCallout } from '@/components/site/LegalShell';
import { BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: 'Terms of Service | Grafton Towboat Services',
  description: 'Terms for the Grafton Towboat Services ordering system.',
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      effective="Effective September 7, 2026 · Last updated September 11, 2026"
      lede="These terms govern the Grafton Towboat Services ordering system. By placing an order you agree to them."
    >
      <LS>1. Who sells what</LS>
      <LUL items={[
        <><strong>Sinclair&apos;s Foods sells the groceries.</strong> They are the retailer. We are the delivery service and courtesy seller of items sold by Sinclair&apos;s Foods.</>,
        <><strong>GTS sells delivery</strong>, supplies we stock ourselves, and services we arrange (such as crew transport).</>,
      ]} />

      <LS>2. Orders</LS>
      <LUL items={[
        <>Catalog prices may change before shopping; <strong>the register total controls</strong>.</>,
        'Weighted items are billed at actual weight.',
        'If something is unavailable, we try to reach the order contact. If we cannot, we omit it unless your notes authorize a swap. You are not charged for what you did not get.',
      ]} />

      <LSub>Alcohol</LSub>
      <LCallout>
        <strong>GTS does not sell or deliver alcohol of any kind.</strong> This is
        not a policy we can make an exception to as a favor.
      </LCallout>

      <LSub>Tobacco</LSub>
      <LP>
        Where tobacco is available, <strong>a valid ID over 21 is required</strong>.
        We may decline to carry it. If nobody of age is present at handover, those
        items return with us; the rest of the order is delivered.
      </LP>

      <LSub>Catalog</LSub>
      <LP>
        The catalog is for ordering only — not for scraping, resale, or republication.
        Product and price data belong to Sinclair&apos;s Foods.
      </LP>

      <LS>3. Delivery</LS>
      <LUL items={[
        'Delivery times are estimates (river, locks, weather, vessel movement).',
        'Risk of loss passes at handover to the vessel.',
        'You provide safe access and someone to receive the order. We may abort a delivery our crew judges unsafe and rearrange (an extra delivery charge may apply).',
        'GTS is not responsible for vessel, dock, or terminal condition except to the extent of our own negligence.',
      ]} />
      <LP>
        Crew transport we arrange is a local arranged service, not a scheduled-carrier
        guarantee of arrival time.
      </LP>

      <LS>4. Charges and payment</LS>
      <LUL items={[
        'Delivery charges are based on service type, time of day and location.',
        "Depending on your company's arrangement, GTS may invoice groceries and delivery together, or delivery only while your company settles with Sinclair's.",
        <><strong>Invoices to company AP are due within 30 days.</strong> The vessel delivery summary is not an invoice.</>,
        <>Crew personal items are that individual&apos;s debt unless the company agrees otherwise. Any handling fee is disclosed before settlement.</>,
        "Anyone ordering for a company confirms they are authorized to incur charges for it.",
      ]} />
      <LP>
        Where your barge line requires a signed delivery log, you authorize us to
        photograph it for the invoice packet only — see our{' '}
        <a className="text-brand-orange font-semibold hover:underline" href="/privacy">Privacy Policy</a>.
      </LP>

      <LS>5. Problems</LS>
      <LCallout>
        <strong>Perishables — report within 24 hours.</strong> Meat, produce, dairy, deli, frozen.
        <br />
        <strong>Everything else — report within 5 days.</strong>
        <br /><br />
        Within those windows we will refund, credit, or replace what arrived wrong,
        damaged, or short. We are not responsible for spoilage after handover.
      </LCallout>

      <LS>6. Product information</LS>
      <LP>
        Descriptions, images, and allergen information come from Sinclair&apos;s and
        their suppliers. <strong>Check physical packaging on delivery</strong> if
        anyone aboard has a serious allergy or dietary restriction.
      </LP>

      <LS>7. Your responsibilities</LS>
      <LUL items={[
        'Give accurate vessel, contact, and delivery information',
        'Keep account credentials secure',
        'Use the service lawfully',
        'Provide safe access for our crew',
      ]} />

      <LS>8. Liability</LS>
      <LP>
        To the fullest extent permitted by law, GTS is not liable for indirect or
        consequential damages arising from the service.{' '}
        <strong>Our total liability for any order is limited to the amount charged
        for that order.</strong> We are not liable for delays beyond our reasonable
        control (weather, river conditions, locks, mechanical failure, labor
        disputes, government acts, supplier shortage).
      </LP>

      <LS>9. Availability</LS>
      <LP>
        We aim for continuous access but do not guarantee it. If the site is down,
        call{' '}
        <a className="text-brand-orange font-semibold hover:underline" href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>.
      </LP>

      <LS>10. Changes</LS>
      <LP>
        We may update these terms; the date above will change. Continued use after
        an update means acceptance. An order is governed by the terms in effect
        when it was placed.
      </LP>

      <LS>11. Governing law</LS>
      <LP>
        Illinois law governs. Disputes belong in state or federal courts serving
        Jersey County, Illinois.
      </LP>

      <LS>12. Contact</LS>
      <LP>
        {BUSINESS.legalName}<br />
        {BUSINESS.street}<br />
        {BUSINESS.cityStateZip}<br />
        <a className="text-brand-orange font-semibold hover:underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        {' · '}
        <a className="text-brand-orange font-semibold hover:underline" href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
      </LP>
    </LegalShell>
  );
}
