// src/components/layout/ContactPhones.tsx
// Clickable contact phone numbers shown on customer-facing pages.
//  - Grocery questions  → Sinclair's Foods
//  - Delivery/logistics → Grafton Towboat Services
import { Phone, ShoppingBasket } from 'lucide-react';

export function ContactPhones({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
      <a
        href="tel:6184986856"
        className="flex items-center gap-3 bg-white border border-brand-green/20 rounded-xl px-4 py-3 hover:border-brand-green/50 hover:shadow-sm transition-all"
      >
        <div className="w-9 h-9 bg-brand-green/10 rounded-full flex items-center justify-center shrink-0">
          <ShoppingBasket className="w-4 h-4 text-brand-green" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 leading-tight">Grocery questions?</p>
          <p className="text-sm font-bold text-brand-navy leading-tight">
            Call Sinclair&apos;s (618) 498-6856
          </p>
        </div>
      </a>
      <a
        href="tel:6185560290"
        className="flex items-center gap-3 bg-white border border-brand-orange/20 rounded-xl px-4 py-3 hover:border-brand-orange/50 hover:shadow-sm transition-all"
      >
        <div className="w-9 h-9 bg-brand-orange/10 rounded-full flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-brand-orange" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 leading-tight">Delivery / logistics?</p>
          <p className="text-sm font-bold text-brand-navy leading-tight">
            Call Grafton Towboat Services (618) 556-0290
          </p>
        </div>
      </a>
    </div>
  );
}
