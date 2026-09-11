// src/app/install/page.tsx
//
// Onboarding for CUSTOMERS — the crews who order. Served from the apex, which
// is the origin the ordering app actually lives on (manifest start_url is
// /catalog). See the note at the top of components/InstallGuide.tsx: an iPhone
// installs whichever host is in the address bar, not whichever app the page
// describes, so this cannot live on shop.* or behind /admin.
//
// The GTS mark alone, not the partnership lockup. Sinclair's logo carries a
// caption rule — it may never appear in a way that suggests Sinclair's does the
// delivering — and an install page is all instructions and no room for the
// nuance. The Sinclair's relationship is made properly on the marketing site
// and in the catalog; it does not need restating here.
//
// INDEXABLE, unlike the two staff pages. This is a link GTS will hand to
// captains and put in an email signature; the staff ones are noindex because
// nobody should stumble into them.

import type { Metadata } from 'next';
import InstallGuide from '@/components/InstallGuide';

export const metadata: Metadata = {
  title: 'Install the Grafton Order app',
  description:
    'Add Grafton Towboat Services to your phone’s Home Screen and order groceries '
    + 'and supplies for your vessel in a couple of taps — no app store, no account required.',
};

export default function CustomerInstallPage() {
  return (
    <InstallGuide
      appName="Grafton Order"
      lockup="gts"
      eyebrow="For vessel crews"
      headline={['Your order,', 'from the wheelhouse.']}
      blurb="Add Grafton Order to your Home Screen and your boat's details, your cart and your past orders are waiting the next time you need them. No app store, nothing to download."
      iconSrc="/branding/customer-icon.png"
      // ⚠️ Push is staff-only and enforced in the database — a vessel can never
      // receive one. Leaving the notifications step in would tell a captain to
      // wait for an alert that does not exist.
      notifications={false}
      // Brand green with a lime and orange wash — the customer palette, and
      // deliberately neither the admin navy nor the Sinclair's red so the three
      // install pages are as distinguishable as the three icons.
      background={
        'radial-gradient(120% 80% at 14% 0%, rgba(217,232,74,0.22) 0%, transparent 55%),'
        + 'radial-gradient(100% 70% at 88% 8%, rgba(232,100,10,0.18) 0%, transparent 50%),'
        + 'linear-gradient(180deg, #1E3D1E 0%, #2D5A1E 45%, #14290F 100%)'
      }
    />
  );
}
