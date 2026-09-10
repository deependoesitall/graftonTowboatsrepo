// src/app/terms/page.tsx
//
// NOT LEGAL ADVICE, and Deepen knows it. These are careful working drafts
// fitted to how GTS actually operates, which is meaningfully better than a
// generated template describing practices they don't follow — but section 8
// (limitation of liability) is the one an Illinois attorney should read before
// this carries any real weight. Marine delivery has exposure a generic template
// never contemplates: dock access, boarding vessels, spoilage in transit.
//
// Payment terms are set to 30 days and the venue to Jersey County, both of
// which were inferred rather than confirmed — still on the list for Jen.
//
// DELIBERATELY ABSENT, and it should stay that way unless an attorney says
// otherwise: there is no arbitration clause, no class-action waiver, and no
// fixed dollar cap on liability. The cap here is the charges on the order in
// question, which is defensible and easy to explain. Bolting on the standard
// SaaS boilerplate would import terms nobody at GTS has considered, into a
// business where the real exposure is a deckhand on a wet barge — not a
// software dispute.
//
// Also deliberately absent: a required "I agree" checkbox at submit. The
// notice sits immediately above the button instead (see src/app/order/page.tsx),
// which meets the conspicuous-notice standard without adding a tap between a
// cook on a moving boat and a placed order.

import type { Metadata } from 'next';
import { LegalShell, LS, LSub, LP, LUL, LCallout } from '@/components/site/LegalShell';
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
      effective="Effective September 7, 2026 · Last updated September 9, 2026"
      lede="These terms govern use of the Grafton Towboat Services online ordering system. By placing an order you agree to them. This is a commercial service for vessel operators and their crews."
    >
      <LS>1. What we do, and who sells what</LS>
      <LP>
        GTS takes grocery and supply orders for vessels and brings them to your
        boat, by boat or by refrigerated van. There are two sellers involved and
        it matters which is which:
      </LP>
      <LUL items={[
        <><strong>Sinclair&apos;s Foods sells the groceries.</strong> They are the retailer. We buy those items on your behalf as your purchasing agent and deliver them.</>,
        <><strong>GTS sells the delivery itself</strong>, any supplies we stock and provide directly, and services we arrange for you such as crew transport.</>,
      ]} />
      <LP>
        So a grocery order is a purchase from Sinclair&apos;s that we handle and
        carry; a delivery charge, a deck supply out of our own stock, or a crew
        run is a purchase from us.
      </LP>

      <LS>2. Placing an order</LS>
      <LUL items={[
        <>Prices shown come from Sinclair&apos;s current catalogue and <strong>may change before your order is shopped.</strong> The register total at the time of purchase is what gets billed.</>,
        'Weighted items — meat, produce, deli — are billed at actual weight, which will differ from the estimate shown when you ordered.',
        "Order as far ahead as you can. We'll always tell you if a delivery window isn't workable.",
      ]} />

      <LSub>If something is out of stock</LSub>
      <LP>
        Item availability is never guaranteed. When something can&apos;t be got:
      </LP>
      <LUL items={[
        <><strong>We try to reach the contact on the order</strong> and ask what you&apos;d like instead.</>,
        <><strong>If we can&apos;t reach anyone, we leave the item off.</strong> We do not choose a replacement on your behalf — a substitution nobody agreed to is how a galley ends up with something it can&apos;t use and a bill it didn&apos;t expect.</>,
        <><strong>Unless your order notes say otherwise.</strong> If you&apos;ve written something like &ldquo;any brand is fine&rdquo; or &ldquo;swap for a similar cut,&rdquo; we&apos;ll act on it.</>,
      ]} />
      <LP>Anything omitted or swapped is shown on your receipt and you are not charged for what you didn&apos;t get.</LP>

      <LSub>Alcohol — we do not carry it</LSub>
      <LCallout>
        <strong>GTS does not sell or deliver alcohol of any kind, to any vessel,
        under any arrangement.</strong> Not on a company order, not as a personal
        item paid for by a crew member, and not as a special request.
      </LCallout>
      <LP>
        This is not a policy we can make an exception to as a favour. Alcoholic
        products are excluded from our catalogue automatically and will not
        appear as something you can order. If alcohol is written into an order&apos;s
        notes or added as an off-catalogue request, that part of the order will
        not be filled and we&apos;ll tell you why.
      </LP>

      <LSub>Tobacco</LSub>
      <LP>
        Where tobacco is available, it is sold <strong>only to people aged 21 or
        over</strong>. We may decline to carry it on any order, and we may ask
        for photo identification at handover. If nobody of age is present to
        receive it, those items come back with us — the rest of the order is
        delivered as normal.
      </LP>

      <LSub>Use of the catalogue</LSub>
      <LP>
        The product catalogue is here so vessels can order from it. It is not
        licensed for automated collection, scraping, resale or republication, and
        the pricing and product data in it belong to Sinclair&apos;s Foods.
      </LP>

      <LS>3. Delivery</LS>
      <LUL items={[
        'Delivery times are estimates. River conditions, lock traffic, weather and vessel movements affect them, and none of those are within our control.',
        'Risk of loss passes to you when the order is handed over at the vessel.',
      ]} />

      <LSub>Safe access, and who is responsible for what</LSub>
      <LP>
        Getting an order aboard means our people approaching your dock, barge or
        deck. Responsibility splits along an obvious line:
      </LP>
      <LUL items={[
        <><strong>You provide safe access and someone to receive the order</strong> — a dock or deck that can be come alongside safely, and a person present at the agreed point to take the handover.</>,
        <><strong>We may abort any delivery our crew judges unsafe.</strong> Weather, river stage, dock condition, vessel movement — the judgement of the person standing there is final, and we will not be penalised for using it. We&apos;ll contact you to rearrange, and an additional delivery charge may apply.</>,
        <><strong>GTS is not responsible for the condition of your vessel, dock or terminal</strong>, or for injury or damage arising from it — except to the extent it results from our own negligence. We accept responsibility for how our people behave; we cannot accept it for a deck we did not build or maintain.</>,
      ]} />

      <LSub>Crew change and arranged transport</LSub>
      <LP>
        When we arrange crew transport, we are providing a <strong>local
        arranged service, not a scheduled-carrier guarantee.</strong> We&apos;ll
        tell you honestly whether a window is workable and we&apos;ll do what we
        say — but flights, tows, locks and traffic are outside our control, and
        this service is not a common carrier and does not guarantee arrival by a
        particular time.
      </LP>

      <LS>4. Charges and payment</LS>
      <LUL items={[
        'Delivery charges are set by the rate agreed with your company, and vary by service type, time of day and location.',
        "Depending on your company's arrangement, GTS either invoices for groceries and delivery together, or invoices delivery only while your company settles with Sinclair's directly.",
        <><strong>Invoices are issued to your company&apos;s accounts payable and are due within 30 days.</strong> The delivery summary emailed to the vessel is a record of what was delivered — it is not an invoice, and nothing is payable on it.</>,
        <>Items a crew member elects to pay for personally are <strong>that individual&apos;s debt, not the company&apos;s</strong> — unless the company has agreed in advance to take them onto its account. A handling fee may apply to personal payments to cover processing costs; it will be disclosed before settlement.</>,
        "The person placing an order on a company's behalf confirms they are authorised to incur charges for that company.",
      ]} />

      <LSub>Signed delivery logs</LSub>
      <LP>
        Some barge lines require a signed delivery log before they will pay an
        invoice. Where yours does, <strong>you authorise us to photograph the
        signed slip and include it in the invoice packet</strong> sent to your
        accounts payable department. It is used for that and nothing else — see
        our <a className="text-brand-orange font-semibold hover:underline" href="/privacy">Privacy Policy</a>.
      </LP>

      <LS>5. Problems with an order</LS>
      <LCallout>
        <strong>Perishables — tell us within 24 hours.</strong> Meat, produce,
        dairy, deli, frozen.
        <br />
        <strong>Everything else — tell us within 5 days.</strong> Groceries that
        keep, deck supplies, hardware.
        <br /><br />
        Within those windows we&apos;ll refund, credit or replace anything that
        arrives wrong, damaged or short.
      </LCallout>
      <LP>
        The two windows differ for a practical reason rather than a legal one:
        nobody can tell three days later whether a chicken went off on our boat
        or in a galley fridge that wasn&apos;t cold enough, but a wrong part or a
        short case is just as provable on Friday as it was on Monday.
      </LP>
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
