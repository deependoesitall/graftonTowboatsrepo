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

// ⚠️ THIS METADATA IS WHAT THE PHONE INSTALLS — AND IT MUST OVERRIDE THE
// PARENT.
//
// src/app/shop/layout.tsx declares the RETIRED shop shell's identity: "GTS
// Orders", the navy admin icon, /admin.webmanifest. Without the block below
// this page inherited all of it, so a Sinclair's employee following the
// Sinclair's-branded instructions ended up with a Home Screen icon called
// "GTS Orders" wearing Grafton's mark. The page said one thing and the phone
// did another, and nobody would suspect the layout file.
//
// A child segment's `icons`/`manifest`/`appleWebApp` replace the parent's
// outright, which is exactly what's wanted here — and only here. Every other
// /shop route keeps the admin identity, because every other /shop route is a
// redirect into the admin app.
export const metadata = {
  title: "Install GTS Order Fulfillment",
  robots: 'noindex',
  manifest: '/shop.webmanifest',
  icons: {
    // Red mark: the one thing that tells two installed apps apart at a glance
    // in a browser tab.
    icon: '/branding/favicon-sinclairs.png',
    shortcut: '/branding/favicon-sinclairs.png',
    // iOS ignores the manifest's icons for the Home Screen and uses ONLY this.
    apple: '/branding/shop-icon.png',
  },
  appleWebApp: {
    capable: true,
    // Exactly what sits under the icon. Must match `appName` on the guide
    // below, or the page promises one name and the phone shows another.
    title: "GTS Fulfill",
    statusBarStyle: 'black-translucent' as const,
  },
};

export default function ShopInstallPage() {
  return (
    <InstallGuide
      appName="GTS Fulfill"
      lockup="partner"
      eyebrow="For Sinclair's staff"
      headline={['Orders on your phone,', 'the moment they land.']}
      blurb="Add the app to your Home Screen and your phone buzzes when a grocery order comes in — with the list already sorted by aisle."
      iconSrc="/branding/shop-icon.png"
      // Deep green base with warm radial washes picking up Sinclair's red and
      // gold. Enough color to feel considered; dark enough that white type
      // stays readable on a phone under shop lighting.
      background={
        'radial-gradient(120% 80% at 15% 0%, rgba(200,16,46,0.28) 0%, transparent 55%),'
        + 'radial-gradient(100% 70% at 90% 10%, rgba(255,209,0,0.20) 0%, transparent 50%),'
        + 'linear-gradient(180deg, #0F2419 0%, #14301F 45%, #0B1A12 100%)'
      }
    />
  );
}
