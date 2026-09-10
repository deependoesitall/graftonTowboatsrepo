// src/app/order/layout.tsx
//
// Adds the legal footer to the checkout flow without touching the page itself.
//
// The order page renders three separate full-page returns (vessel details,
// review, confirm), so a layout is the only place to put something that must
// appear on all of them — editing three call sites guarantees the fourth step
// someone adds later quietly won't have it.
//
// This matters more here than on the catalogue: this is the page where
// submitting the form agrees to the Terms, and the notice above the button
// only means something if the Terms are actually reachable from the same page.

import { StoreFooter } from '@/components/layout/StoreFooter';

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <StoreFooter />
    </>
  );
}
