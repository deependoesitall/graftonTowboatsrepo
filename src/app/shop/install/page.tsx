// src/app/shop/install/page.tsx
//
// Install instructions for the Sinclair's shopping app.
//
// Reached at shop.graftontowboatservices.com/install. This page exists
// separately from /admin/install for one reason that matters: an iPhone
// installs the ORIGIN the page is on. Sending a Sinclair's shopper to the
// admin host's install page would put the GTS admin app on their Home Screen —
// right instructions, wrong app, and the resulting "notifications don't work"
// would take an hour to diagnose.
import InstallGuide from '@/components/InstallGuide';

export const metadata = { title: "Install Sinclair's Shop", robots: 'noindex' };

export default function ShopInstallPage() {
  return (
    <InstallGuide
      appName="Sinclair's"
      blurb="Add Sinclair's Shop to your Home Screen and your phone will buzz when a grocery order comes in, with the list ready to pick. Email still arrives as normal — this is extra, not a replacement."
    />
  );
}
