// src/app/shop/install/page.tsx
//
// Onboarding for Sinclair's staff. Served from shop.graftontowboatservices.com
// — see the note in components/InstallGuide.tsx for why the host matters more
// than the instructions do.
//
// On the Sinclair's mark: Dave's boundary (Aug 2026) was liability, not the
// logo — nothing may imply Sinclair's does the delivery. Clarified by Deepen,
// Sept 2026. This page is his own staff's tool and the lockup reads as a
// partnership, so the mark is welcome here.

import InstallGuide from '@/components/InstallGuide';

export const metadata = { title: "Install GTS - Sinclair's", robots: 'noindex' };

export default function ShopInstallPage() {
  return (
    <InstallGuide
      appName="GTS - Sinclair's"
      lockup="partner"
      eyebrow="For Sinclair's staff"
      headline={['Orders on your phone,', 'the moment they land.']}
      blurb="Add the app to your Home Screen and your phone buzzes when a grocery order comes in — with the list already sorted by aisle."
      iconSrc="/branding/shop-icon.png"
      // Deep green base with warm radial washes picking up Sinclair's red and
      // gold. Enough colour to feel considered; dark enough that white type
      // stays readable on a phone under shop lighting.
      background={
        'radial-gradient(120% 80% at 15% 0%, rgba(200,16,46,0.28) 0%, transparent 55%),'
        + 'radial-gradient(100% 70% at 90% 10%, rgba(255,209,0,0.20) 0%, transparent 50%),'
        + 'linear-gradient(180deg, #0F2419 0%, #14301F 45%, #0B1A12 100%)'
      }
    />
  );
}
