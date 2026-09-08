// src/app/terms/page.tsx
//
// NOT LEGAL ADVICE, and Deepen knows it. These are careful working drafts
// fitted to how GTS actually operates, which is meaningfully better than a
// generated template describing practices they don't follow — but section 8
// (limitation of liability) is the one an Illinois attorney should read before
// this carries any real weight. Marine delivery has exposure a generic template
// never contemplates: dock access, boarding vessels, spoilage in transit.
//
// Bracketed items still needing Jen's confirmation are noted in the repo's
// LEGAL_PAGES.html. Payment terms are set to 30 days and the venue to Jersey
// County, both of which were inferred rather than confirmed.

import type { Metadata } from 'next';
import { LegalShell, LS, LP, LUL, LCallout } from '@/components/site/LegalShell';
import { BUSINESS } from '@/app/site/content';

export const metadata: Metadata = {
  title: 'Terms of Service | Grafton Towboat Services',
  description: 'The terms governing use of the Grafton Towboat Services ordering system.',
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      effective="Effective September 7, 2026"
      lede="These terms govern use of the Grafton Towboat Services online ordering system. By placing an order you agree to them. This is a commercial service for vessel operators and their crews."
    >
      <LS>1. What we do</LS>
      <LP>
        GTS takes grocery and supply orders for vessels, purchases those items from
        Sinclair&apos;s Foods, and delivers them to your vessel by boat or by van.
        We also provide crew transport and related marine services as arranged.
      </LP>
      <LP>
        <strong>We are a delivery and purchasing service, not the retailer.</strong>{' '}
        Groceries are sold by Sinclair&apos;s Foods. We buy them on your behalf and
        bring them to you.
      </LP>

      <LS>2. Placing an order</LS>
      <LUL items={[
        <>Prices shown come from Sinclair&apos;s current catalogue and <strong>may change before your order is shopped.</strong> The register total at the time of purchase is what gets billed.</>,
        'Item availability is not guaranteed. If something is out of stock we substitute sensibly or leave it off, and it will be reflected on your receipt.',
        'Weighted items — meat, produce, deli — are billed at actual weight, which will differ from the estimate shown when you ordered.',
        "Order as far ahead as you can. We'll always tell you if a delivery window isn't workable.",
      ]} />

      <LS>3. Delivery</LS>
      <LUL items={[
        'Delivery times are estimates. River conditions, lock traffic, weather and vessel movements affect them, and none of those are within our control.',
        'Someone must be available to receive the delivery at the agreed point. If we arrive and cannot safely transfer the order, we will contact you to rearrange, and an additional delivery charge may apply.',
        <><strong>We may refuse or postpone any delivery we judge unsafe.</strong> Weather, river stage, dock condition or vessel access — our crew&apos;s judgement is final, and we will not be penalised for exercising it.</>,
        'Risk of loss passes to you when the order is handed over at the vessel.',
      ]} />

      <LS>4. Charges and payment</LS>
      <LUL items={[
        'Delivery charges are set by the rate agreed with your company, and vary by service type, time of day and location.',
        "Depending on your company's arrangement, GTS either invoices for groceries and delivery together, or invoices delivery only while your company settles with Sinclair's directly.",
        <><strong>Invoices are issued to your company&apos;s accounts payable and are due within 30 days.</strong> The delivery summary emailed to the vessel is a record of what was delivered — it is not an invoice, and nothing is payable on it.</>,
        'Items a crew member elects to pay for personally are settled directly by that individual. A handling fee may apply to personal payments to cover processing costs; it will be disclosed before settlement.',
        "The person placing an order on a company's behalf confirms they are authorised to incur charges for that company.",
      ]} />

      <LS>5. Problems with an order</LS>
      <LCallout>
        <strong>Tell us within 24 hours of delivery</strong> and we&apos;ll make it
        right — we&apos;ll refund, credit or replace anything that arrives wrong,
        damaged or short. Perishables need reporting promptly for obvious reasons.
      </LCallout>
      <LP>
        We can&apos;t take responsibility for spoilage after handover, including
        where items are not refrigerated or frozen promptly aboard the vessel.
      </LP>

      <LS>6. Product information</LS>
      <LP>
        Product descriptions, images, and ingredient and allergen information come
        from Sinclair&apos;s Foods and their suppliers. We pass it through as we
        receive it and cannot independently verify it.{' '}
        <strong>If anyone aboard has a food allergy or a dietary restriction with
        health consequences, check the physical packaging on delivery.</strong>{' '}
        Manufacturers change formulations without notice.
      </LP>

      <LS>7. Your responsibilities</LS>
      <LUL items={[
        'Give accurate vessel, contact and delivery information. Most delivery problems trace back to a wrong phone number or mile marker.',
        "Keep account credentials secure and don't share them.",
        'Use the service lawfully, and do not attempt to disrupt it or gain unauthorised access.',
        'Provide safe access for our crew at the delivery point.',
      ]} />

      <LS>8. Limitation of liability</LS>
      <LP>
        To the fullest extent permitted by law, GTS is not liable for indirect,
        incidental or consequential damages — including lost time, delay or lost
        profits — arising from use of this service.
      </LP>
      <LP>
        <strong>Our total liability for any order is limited to the amount charged
        for that order.</strong>
      </LP>
      <LP>
        We are not liable for delays or failures caused by circumstances beyond our
        reasonable control, including weather, river conditions, lock closures,
        mechanical failure, labour disputes, acts of government or supplier shortage.
      </LP>

      <LS>9. Service availability</LS>
      <LP>
        We aim to keep the ordering system available at all times but don&apos;t
        guarantee uninterrupted access. If it&apos;s down, call us —{' '}
        <a className="text-brand-orange font-semibold hover:underline" href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>.
        We took orders by phone long before this website existed and we still do.
      </LP>

      <LS>10. Changes to these terms</LS>
      <LP>
        We may update these terms. The effective date above will change, and
        continued use after an update means you accept it. The terms applying to an
        order are the ones in effect when the order was placed.
      </LP>

      <LS>11. Governing law</LS>
      <LP>
        These terms are governed by the laws of the State of Illinois, without
        regard to conflict-of-law principles. Any dispute will be brought in the
        state or federal courts serving Jersey County, Illinois.
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
