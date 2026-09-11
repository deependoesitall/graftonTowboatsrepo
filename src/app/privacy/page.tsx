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

// The terms themselves took force on Sept 7. Sept 9 added sections describing
// things that already existed (accounts, cookies) plus staff push
// notifications, which are new. Effective date stays put — changing it would
// imply the earlier terms were never in force.
const EFFECTIVE = 'Effective September 7, 2026 · Last updated September 9, 2026';

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
      lede={`Grafton Towboat Services ("GTS," "we," "us") operates graftontowboatservices.com and order.graftontowboatservices.com — the public website and the ordering system used by the vessels we serve. This policy covers both. It explains what we collect, why, and what we do with it, in plain language on purpose.`}
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
        <><strong>Credit card</strong> — a preferred phone number and a good time to reach you. <strong>We will contact you to finalize the transaction.</strong></>,
        <><strong>Cash</strong> — nothing extra. Settled at the dock.</>,
      ]} />

      <LCallout>
        <strong>Card details are never entered on this website.</strong> There is no
        field anywhere in the ordering system for a card number, and we will never
        ask you to type one into the site, email one, or send one by text message.
        If you&apos;re paying a personal balance by card, we contact you to finalize
        the transaction outside this site, and card details are not stored in the
        ordering system.
        <br /><br />
        <strong>So if anyone asks you to enter or send card details through this
        site, it isn&apos;t us.</strong>
      </LCallout>

      <LSub>If you create an account</LSub>
      <LP>
        An account is optional — you can order without one. If you make one we hold:
      </LP>
      <LUL items={[
        <><strong>Your email address and a password.</strong> The password is stored only as a one-way hash; nobody at GTS can read it, and we will never ask you for it.</>,
        <><strong>A role</strong> — customer, GTS staff, or Sinclair&apos;s shopper. This decides what you can see. It&apos;s why a Sinclair&apos;s shopper can open the grocery list they need to pick and cannot open our delivery rates.</>,
        <><strong>The vessel and company you last ordered for</strong>, so you don&apos;t retype them every time.</>,
      ]} />

      <LSub>Delivery documentation</LSub>
      <LP>
        We keep the itemized register receipt from Sinclair&apos;s Foods and, where
        the barge line requires one, a <strong>photograph of the signed delivery
        log</strong>. Those exist for one reason: they are the proof of delivery
        your accounts payable department asks for, and several barge lines will
        not pay an invoice without them.
      </LP>
      <LP>
        A signed log is shared only with the barge line it belongs to, as part of
        that invoice packet. It is never shown to another customer, never used in
        marketing, and never published. It is retained with the order records it
        supports — see &ldquo;How long we keep it&rdquo; below.
      </LP>

      <LSub>Notifications to our own staff</LSub>
      <LP>
        GTS and Sinclair&apos;s staff can install our ordering app on a phone and
        opt in to a notification when an order arrives. If someone does, we store
        a <strong>push subscription</strong> — an anonymous address issued by
        their browser, plus which device it belongs to — against that staff
        account, so their phone can be alerted.
      </LP>
      <LUL items={[
        <><strong>Staff only.</strong> Vessels, crews and customers are never sent push notifications, and there is no way in the system to do so.</>,
        <><strong>Never marketing.</strong> These alerts are operational — a new order arrived — and will not be used to promote anything.</>,
        <><strong>Off whenever you like.</strong> Turn them off in the app&apos;s settings, in your phone&apos;s notification settings, or by deleting the app. You can also email us and we&apos;ll remove the device.</>,
      ]} />

      <LSub>Cookies</LSub>
      <LP>
        <strong>Essential cookies only.</strong> We use them to keep you signed in,
        to remember what&apos;s in your cart between pages, and to keep your session
        secure. That&apos;s the entire list.
      </LP>
      <LP>
        We run <strong>no advertising cookies, no tracking pixels, and no
        third-party analytics that follow you to other websites.</strong> That is
        also why you have never seen a cookie banner here — those exist to get
        consent for tracking we don&apos;t do.
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
      <LP>
        <strong>If personal information is ever breached, we will notify affected
        people as Illinois law requires</strong> (the Personal Information
        Protection Act, 815 ILCS 530), without unreasonable delay, and we will
        tell you what happened rather than the minimum we can get away with.
      </LP>

      <LS>5. How long we keep it</LS>
      <LUL items={[
        <><strong>Orders, invoices, receipts and delivery documentation:</strong> at least seven years, as business and tax records require. Signed delivery-log photographs are kept with the order they belong to, for the same period and for the same reason — they are part of the invoice record.</>,
        <><strong>Account information:</strong> until you ask us to remove it.</>,
        <><strong>Staff push subscriptions:</strong> until the device is switched off, removed, or stops responding — at which point we mark it dead and stop sending to it.</>,
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
