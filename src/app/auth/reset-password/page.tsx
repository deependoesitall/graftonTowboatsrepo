'use client';
// src/app/auth/reset-password/page.tsx
// User lands here after clicking the password-reset link in their email.
// The /auth/callback route has already exchanged the code for a session,
// so we just need to collect a new password and call updateUser.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, Anchor } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/layout/SiteHeader';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Verify a session exists (set by the callback route)
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
      else setError('This link has expired or already been used. Please request a new one.');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);

    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => router.push('/account'), 2500);
  }

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-start justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="card-base p-8">
            {done ? (
              <div className="text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <p className="font-display font-bold text-brand-navy text-lg mb-1">Password updated!</p>
                <p className="text-gray-500 text-sm">Redirecting you to your account…</p>
              </div>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <div className="w-12 h-12 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Anchor className="w-6 h-6 text-brand-green" />
                  </div>
                  <h1 className="font-display font-bold text-brand-navy text-xl">Set New Password</h1>
                  <p className="text-gray-500 text-xs mt-1">Grafton Towboat Services</p>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-xs rounded-lg p-3 mb-4">
                    {error}
                    {!sessionReady && (
                      <div className="mt-2">
                        <Link href="/" className="text-brand-orange font-bold hover:underline">
                          Return to homepage →
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {sessionReady && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="label-base">New Password</label>
                      <input
                        type="password"
                        className="input-base"
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="label-base">Confirm Password</label>
                      <input
                        type="password"
                        className="input-base"
                        placeholder="Same password again"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !password || !confirm}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Update Password
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
