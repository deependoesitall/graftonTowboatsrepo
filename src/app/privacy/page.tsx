// src/app/privacy/page.tsx
//
// Written around what this app ACTUALLY does, verified against the code — not
// pulled from a generator. A privacy policy that describes practices you don't
// follow is worse than none at all.
//
// The COD card wording is the part to leave alone without checking with Deepen:
// an earlier draft said GTS never takes card details "over the phone", which is
// FALSE. `CodPaymentMethod` includes 'credit_card', and choosing it collects a
// callback phone number and time — GTS then rings and takes the card verbally.
// The true and narrower claim is that card details are never entered on the
// website, which is both accurate and a real anti-phishing protection for crew.

import type { Metadata } from 'next';
import { LegalShell, LS, LSub, LP, LUL, LTable, LCallout } from '@/components/site/LegalShell';
import { BUSINESS } from '@/app/site/content';

const EFFECTIVE = 'Effective September 7, 2026';

export const metadata: Metadata = {
  title: 'Privacy Policy | Grafton Towboat Services',
  description: 'How Grafton Towboat Services collects, uses and protects your information.',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      effective={EFFECTIVE}
      lede={`Grafton Towboat Services ("GTS," "we," "us") operates graftontowboatservices.com and the online ordering system used by the vessels we serve. This explains what we collect, why, and what we do with it. We've written it in plain language on purpose.`}
    >
      <LCallout>
        <strong>The short version:</strong> we collect what we need to get groceries
        to your boat and bill the right company. We never sell your information.
        We never ask for card details on this website. We don&apos;t run advertising.
      </LCallout>

      <LS>1. What we collect</LS>

      <LSub>When you place an order</LSub>
      <LTable
        head={['What', 'Why we need it']}
        rows={[
          ['Company name, purchase order number, billing contact', 'To invoice the correct barge line and match the invoice to your PO.'],
          ['Vessel name and type, captain name and phone', 'To find the right boat and reach whoever is meeting us at the dock.'],
          ['Contact name, phone, email', 'To confirm the order and send the delivery summary.'],
          ['Arrival date and time, terminal, mile marker, approach side, VHF channel', 'To meet the vessel at the right place at the right time.'],
          ['Crew change details and counts', 'To plan transport when a crew change is part of the job.'],
          ['The items you order and any notes', 'To shop the order and produce your receipt.'],
        ]}
      />

      <LSub>When a crew member pays for their own items</LSub>
      <LP>
        Some orders include personal items a crew member settles individually
        rather than billing the company. What we collect depends on how you pay:
      </LP>
      <LUL items={[
        <><strong>Venmo or Cash App</strong> — your handle (for example, <em>@yourname</em>), so we can send a payment request.</>,
        <><strong>Credit card</strong> — a preferred phone number and a good time to reach you. <strong>We then call you and take the card details by phone.</strong></>,
        <><strong>Cash</strong> — nothing extra. Settled at the dock.</>,
      ]} />

      <LCallout>
        <strong>Card details are never entered on this website.</strong> There is no
        field anywhere in the ordering system for a card number, and we will never
        ask you to type one into the site, email one, or send one by text message.
        If you&apos;re paying a personal balance by card, you give it to a member of
        our staff over the phone, and it is not stored in the ordering system.
        <br /><br />
        <strong>So if anyone asks you to enter or send card details through this
        site, it isn&apos;t us.</strong>
      </LCallout>

      <LSub>If you create an account</LSub>
      <LP>Your email address, so you can see your own past orders. Nothing more.</LP>

      <LSub>Delivery documentation</LSub>
      <LP>
        We keep the itemised register receipt from Sinclair&apos;s Foods and, where
        the barge line requires one, a photograph of the signed delivery log. Those
        support the invoice and are retained as business records.
      </LP>

      <LSub>If you use the contact form</LSub>
      <LP>
        Your name, whichever of email or phone you give us, any vessel or company
        you mention, and your message. We keep these so an enquiry can&apos;t be
        lost if an email fails to deliver.
      </LP>

      <LSub>Automatically</LSub>
      <LP>
        Standard server logs from our hosting provider — IP address, browser type,
        pages requested, timestamps — kept briefly for security and troubleshooting.{' '}
        <strong>We do not use advertising cookies, tracking pixels, or third-party
        analytics that profile you across other websites.</strong>
      </LP>

      <LS>2. How we use it</LS>
      <LUL items={[
        'To shop, pack and deliver your order.',
        'To contact you about that order — confirmations, substitutions, arrival timing, problems.',
        'To invoice your company and keep accurate accounting records.',
        'To keep the service working and secure.',
        'To comply with tax, accounting and other legal obligations.',
      ]} />
      <LP>
        <strong>We do not sell your information, and we do not share it for anyone
        else&apos;s marketing.</strong> We won&apos;t send you promotional email
        unless you ask us to.
      </LP>

      <LS>3. Who we share it with</LS>
      <LTable
        head={['Who', 'What they get, and why']}
        rows={[
          [<><strong>Sinclair&apos;s Foods</strong> (Jerseyville, IL)</>, 'The grocery order itself, so it can be shopped. They see what is being bought and for which vessel — not your billing terms or our delivery rates.'],
          ['Your own company', 'Delivery details and charges, on the invoice sent to accounts payable.'],
          ['Service providers', 'Our hosting, database and email providers process data on our behalf, under their own terms, solely to run the service.'],
          ['Legal', "If required by law or subpoena, or to protect someone's safety or our legal rights."],
        ]} />
      <LP>
        Our current providers are Vercel (hosting), Supabase (database and file
        storage) and Resend (transactional email). All are US-based.
      </LP>

      <LS>4. How we protect it</LS>
      <LP>
        Data is encrypted in transit and at rest. Access to the administrative
        system is password-protected, individually accounted for, and limited by
        role — staff see only what their job requires. As one example, Sinclair&apos;s
        staff can see the grocery order they need to shop, and cannot see what GTS
        charges a barge line to deliver it.
      </LP>
      <LP>
        No system is perfectly secure and we won&apos;t claim otherwise. We review
        our security regularly and fix what we find.
      </LP>

      <LS>5. How long we keep it</LS>
      <LUL items={[
        <><strong>Orders, invoices, receipts and delivery documentation:</strong> at least seven years, as business and tax records require.</>,
        <><strong>Account information:</strong> until you ask us to remove it.</>,
        <><strong>Contact form messages:</strong> until they&apos;re dealt with and no longer useful as a record.</>,
        <><strong>Server logs:</strong> a short period, typically under 30 days.</>,
      ]} />

      <LS>6. Your choices</LS>
      <LP>Contact us at <a className="text-brand-orange font-semibold hover:underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> to:</LP>
      <LUL items={[
        'Ask what personal information we hold about you.',
        'Correct anything inaccurate.',
        'Ask us to delete your account and contact details.',
      ]} />
      <LP>
        We may need to keep completed order and invoice records even after an
        account is closed, because those are accounting records we&apos;re required
        to retain. If you&apos;re in a state with specific privacy rights, tell us
        and we&apos;ll honour them.
      </LP>

      <LS>7. Children</LS>
      <LP>
        This is a commercial service for vessel operators. It isn&apos;t directed at
        children and we don&apos;t knowingly collect information from anyone under 18.
      </LP>

      <LS>8. Changes</LS>
      <LP>
        If we change this policy we&apos;ll update the date above, and we&apos;ll
        tell customers directly if the change is significant.
      </LP>

      <LS>9. Contact</LS>
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
