// src/app/privacy/page.tsx
// Short, accurate notice: CalOPPA-style categories without operational storytelling.
// Card details are never entered on this website; personal card pay is finalized off-site.

import type { Metadata } from 'next';
import { LegalShell, LS, LSub, LP, LUL, LTable, LCallout } from '@/components/site/LegalShell';
import { BUSINESS } from '@/app/site/content';

const EFFECTIVE = 'Effective September 7, 2026 · Last updated September 11, 2026';

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
      lede={`Grafton Towboat Services ("GTS," "we," "us") operates graftontowboatservices.com and related ordering apps. This policy explains what personal information we collect and how we use it.`}
    >
      <LCallout>
        <strong>In short:</strong> we collect what we need to fulfill and bill vessel
        orders. We do not sell your information. Card numbers are never entered on
        this website. We do not use advertising or cross-site tracking.
      </LCallout>

      <LS>1. Information we collect</LS>
      <LTable
        head={['Category', 'Examples']}
        rows={[
          ['Order and delivery details', 'Company, vessel, captain/contact name, phone, email, arrival/location info, items, notes, crew-change details when provided'],
          ['Personal (crew) payment contacts', 'Venmo/Cash App handle, or a phone number and time to reach you if paying by card — we contact you to finalize off this site'],
          ['Account information (optional)', 'Email, hashed password, role, last vessel/company used'],
          ['Delivery records', 'Itemized register receipts; signed delivery-log photos when a barge line requires them'],
          ['Staff app notifications', 'Push subscription tokens for GTS/Sinclair staff who opt in — operational alerts only'],
          ['Technical', 'Essential cookies (sign-in, cart, security); brief server logs (IP, browser, pages, time)'],
          ['Contact form', 'Name, email or phone, message'],
        ]}
      />
      <LP>
        <strong>Card details are never entered on this website</strong> and are not
        stored in the ordering system. If anyone asks you to type or send a card
        number through this site, it is not us.
      </LP>

      <LS>2. How we use it</LS>
      <LUL items={[
        'Fulfill, confirm, and deliver orders',
        'Invoice the correct company and keep business records',
        'Operate and secure the service',
        'Meet legal and tax obligations',
      ]} />
      <LP>
        We do not sell personal information or share it for third-party marketing.
      </LP>

      <LS>3. Who we share it with</LS>
      <LTable
        head={['Who', 'Why']}
        rows={[
          [<><strong>Sinclair&apos;s Foods</strong></>, 'Grocery lines so the order can be shopped (not GTS delivery rates or billing terms)'],
          ['Your company', 'Delivery details on invoices to accounts payable'],
          ['Service providers', 'Hosting, database, and email vendors that process data only to run this service (currently Vercel, Supabase, Resend — US-based)'],
          ['Legal', 'When required by law, or to protect safety or legal rights'],
        ]}
      />

      <LS>4. Cookies and tracking</LS>
      <LP>
        We use essential cookies only (session, cart, security). We do not use
        advertising cookies, tracking pixels, or third-party analytics that follow
        you across other sites. We do not respond to browser &ldquo;Do Not Track&rdquo;
        signals in a special way because we do not engage in that tracking.
      </LP>

      <LS>5. Retention</LS>
      <LUL items={[
        'Orders, invoices, receipts, and delivery documentation: at least seven years',
        'Accounts: until you ask us to remove them (order records may still be kept as required)',
        'Staff push subscriptions: until turned off or the device stops responding',
        'Contact messages and server logs: only as long as needed to handle them / briefly for security',
      ]} />

      <LS>6. Your choices</LS>
      <LP>
        Email <a className="text-brand-orange font-semibold hover:underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> to
        ask what we hold about you, correct it, or request account deletion.
        We notify affected people of a personal-information breach as Illinois law requires.
      </LP>

      <LS>7. Children</LS>
      <LP>
        This service is for vessel operators and crews. We do not knowingly collect
        information from anyone under 18.
      </LP>

      <LS>8. Changes</LS>
      <LP>
        We will update the date above when this policy changes, and contact customers
        directly if a change is significant.
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
