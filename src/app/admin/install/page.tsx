// src/app/admin/install/page.tsx
// Install instructions for the GTS staff app. See components/InstallGuide.tsx
// for why this must be served from the origin being installed.
import InstallGuide from '@/components/InstallGuide';

export const metadata = { title: 'Install GTS Orders', robots: 'noindex' };

export default function AdminInstallPage() {
  return (
    <InstallGuide
      appName="GTS Orders"
      blurb="Add GTS Orders to your Home Screen and your phone will buzz the moment an order comes in. Email still arrives exactly as it does now — this is extra, not a replacement."
    />
  );
}
