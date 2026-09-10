// src/app/admin/install/page.tsx
//
// Onboarding for GTS staff. Served from graftontowboatservices.com/admin —
// see components/InstallGuide.tsx for why the host matters more than the
// instructions do.
//
// GTS mark alone, not the partnership lockup: this is the app for running the
// business — the ledger, billing, every order including crew change. Sinclair's
// branding on it would misdescribe what it is.

import InstallGuide from '@/components/InstallGuide';

export const metadata = { title: 'Install GTS Orders', robots: 'noindex' };

export default function AdminInstallPage() {
  return (
    // FULL-BLEED INSIDE THE ADMIN SHELL.
    //
    // The admin layout wraps every page in `max-w-7xl mx-auto px-4 py-6`, which
    // would frame this dark hero as a card floating on grey — the exact boxed
    // look the redesign was meant to remove. The 100vw trick escapes a centred
    // container without touching the layout, so no other admin page is affected.
    //
    // AdminNav is deliberately kept: someone who lands here from the dashboard
    // needs a way back, and a page with no navigation reads as a dead end.
    <div className="relative w-screen left-1/2 -ml-[50vw] -my-6">
      <InstallGuide
        appName="GTS Orders"
        lockup="gts"
        eyebrow="For GTS staff"
        headline={['Every order,', 'the moment it lands.']}
        blurb="Add GTS Orders to your Home Screen and your phone buzzes as soon as an order comes in. Email still arrives exactly as it does now — this is extra, not a replacement."
        iconSrc="/branding/admin-icon.png"
        // Navy with a warm orange wash — the admin palette, deliberately
        // distinct from the Sinclair's page so the two apps never look
        // interchangeable at a glance on someone's phone.
        background={
          'radial-gradient(120% 80% at 12% 0%, rgba(232,100,10,0.22) 0%, transparent 55%),'
          + 'radial-gradient(100% 70% at 88% 8%, rgba(217,232,74,0.16) 0%, transparent 50%),'
          + 'linear-gradient(180deg, #0D1B2A 0%, #12283A 45%, #08131E 100%)'
        }
      />
    </div>
  );
}
