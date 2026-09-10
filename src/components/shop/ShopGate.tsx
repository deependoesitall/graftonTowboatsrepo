'use client';
// src/components/shop/ShopGate.tsx
//
// Who may use the Sinclair's picking app.
//
// ⚠️ THIS IS A UX GATE, NOT A SECURITY BOUNDARY. Every API route this app
// calls enforces its own permissions server-side (requireAdmin / gtsOnly /
// isSinclairScoped). Nothing here is trusted — hiding a page in the browser
// stops the wrong person being confused, not the wrong person being determined.
// The real protection is that GTS's rates and ledger endpoints refuse a
// Sinclair-scoped token regardless of what the UI shows.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { fetchAdminSession, isGtsRole, type AdminRole, type AdminPermission } from '@/lib/admin-auth';

type Status = 'checking' | 'allowed' | 'anon' | 'wrong-app';

export default function ShopGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>('checking');

  // THE INSTALL GUIDE IS PUBLIC, DELIBERATELY.
  //
  // The order of operations is: read the instructions → install the app →
  // open it → sign in → enable notifications. Gating the instructions behind
  // a login puts step four before step one, and a shopper who can't get past
  // the sign-in screen has no way to reach the page explaining what to do.
  // It's a page of tap-here instructions — there is nothing here to protect.
  const isPublicPage = pathname?.endsWith('/install');

  useEffect(() => {
    if (isPublicPage) { setStatus('allowed'); return; }
    fetchAdminSession()
      .then((s: { role: AdminRole; permissions: AdminPermission[] } | null) => {
        if (!s) { setStatus('anon'); return; }

        // Sinclair-scoped accounts are the intended users. Owners are allowed
        // through as well — the person who has to support this at 6am when a
        // shopper says it's broken shouldn't need a second login to see what
        // they're seeing.
        const sinclairScoped = !isGtsRole(s.role) || s.permissions?.includes('sinclair');
        const isOwner = s.role === 'owner';
        setStatus(sinclairScoped || isOwner ? 'allowed' : 'wrong-app');
      })
      .catch(() => setStatus('anon'));
  }, [isPublicPage]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  if (status === 'allowed') return <>{children}</>;

  // Signed in, but as GTS staff who aren't Sinclair-scoped. Not an error —
  // they're simply in the wrong one of the two apps, and saying which is more
  // use than "access denied".
  if (status === 'wrong-app') {
    return (
      <Message
        title="This is the Sinclair's shopping app"
        body="Your account is GTS staff. Order management, the ledger and billing all live in the admin app."
        cta={{ label: 'Go to GTS Orders', href: 'https://graftontowboatservices.com/admin' }}
      />
    );
  }

  return (
    <Message
      title="Sign in to start shopping"
      body="You'll need your Sinclair's login to see the orders waiting to be picked."
      cta={{ label: 'Sign in', href: '/admin' }}
    />
  );
}

function Message({ title, body, cta }: {
  title: string; body: string; cta: { label: string; href: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-5 h-5 text-brand-green" />
        </div>
        <h1 className="font-display text-xl font-bold text-brand-navy mb-1.5">{title}</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">{body}</p>
        <a href={cta.href}
          className="inline-block px-5 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold hover:bg-brand-gmed">
          {cta.label}
        </a>
      </div>
    </div>
  );
}
