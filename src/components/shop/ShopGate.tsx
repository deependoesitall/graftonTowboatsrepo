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
//
// ── SIGN-IN HAPPENS HERE, ON THIS ORIGIN. DO NOT LINK TO /admin. ────────
//
// This used to render a "Sign in" button pointing at /admin, which was broken
// in a way that made the installed app impossible to log into at all:
//
//   1. On shop.graftontowboatservices.com, /admin is redirected by middleware
//      to the canonical host. That is a CROSS-ORIGIN navigation, and both iOS
//      and Android throw an installed app out of standalone mode when one
//      happens — the address bar reappears and it stops looking like an app.
//   2. The login they then completed was on the OTHER origin. The session JWT
//      lives in sessionStorage and the backstop cookie is host-only with
//      sameSite:'strict', so neither is visible to shop.* — by design.
//   3. Back in the installed app, fetchAdminSession() still found nothing and
//      showed "Sign in to start shopping" again.
//
// So the button could never succeed, no matter how correctly someone typed
// their password. The fix is that the form below posts to /api/admin/auth on
// THIS host — middleware's matcher excludes /api/, so the request is served
// directly and the resulting cookie and token belong to shop.* where the app
// can actually see them. Nothing navigates; standalone mode survives.

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, Lock, AlertCircle } from 'lucide-react';
import {
  fetchAdminSession, isGtsRole, setAdminSession,
  type AdminRole, type AdminPermission,
} from '@/lib/admin-auth';

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

  const check = useCallback(() => {
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

  useEffect(() => { check(); }, [check]);

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
  //
  // This link DOES leave the origin, and that is correct: it is sending them to
  // a different app. Leaving standalone mode is the honest outcome of "you want
  // the other one", unlike the sign-in case above.
  if (status === 'wrong-app') {
    return (
      <Shell
        title="This is the Sinclair's shopping app"
        body="Your account is GTS staff. Order management, the ledger and billing all live in the admin app."
      >
        <a href="https://graftontowboatservices.com/admin"
          className="inline-block px-5 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold hover:bg-brand-gmed">
          Go to GTS Orders
        </a>
      </Shell>
    );
  }

  return <ShopSignIn onSignedIn={check} />;
}

/**
 * Sign in without leaving the app.
 *
 * Posts to /api/admin/auth on whatever host the app is running on, so the
 * session lands on the same origin the picking screens read it from.
 */
function ShopSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // A blank username means the legacy single-password login, which the
      // route still accepts. Sending an empty username instead would look like
      // a failed multi-user attempt and burn a throttle slot.
      const body = username.trim()
        ? { username: username.trim(), password }
        : { password };

      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.token) {
        // The route's own message carries the useful detail — a wrong password
        // and "too many attempts, wait 5 minutes" need different reactions.
        setError(data?.error || 'That login was not accepted. Check the username and password.');
        return;
      }

      setAdminSession(
        data.token,
        data.user?.role,
        data.user?.display_name || '',
        data.user?.username,
        data.user?.permissions ?? [],
      );
      onSignedIn();
    } catch {
      setError('Could not reach the server. Check the signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Sign in to start shopping"
      body="Use your Sinclair's login to see the orders waiting to be picked."
    >
      <form onSubmit={submit} className="text-left space-y-3">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Username</label>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" autoCorrect="off"
            className="input-base w-full" placeholder="Your Sinclair's username"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input-base w-full" placeholder="Password"
          />
        </div>

        {error && (
          <div className="flex gap-2 items-start bg-red-50 border border-red-200 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed">{error}</p>
          </div>
        )}

        <button
          type="submit" disabled={busy || !password}
          className="w-full px-5 py-3 rounded-xl bg-brand-green text-white text-sm font-bold
            hover:bg-brand-gmed disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
        Forgotten it? Ask Grafton Towboat Services to reset it — they can set a new
        password for you without needing the old one.
      </p>
    </Shell>
  );
}

function Shell({ title, body, children }: {
  title: string; body: string; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-5 h-5 text-brand-green" />
        </div>
        <h1 className="font-display text-xl font-bold text-brand-navy mb-1.5">{title}</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">{body}</p>
        {children}
      </div>
    </div>
  );
}
