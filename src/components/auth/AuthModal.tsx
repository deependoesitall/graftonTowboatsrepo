'use client';
// src/components/auth/AuthModal.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Star, History, Zap, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
  defaultEmail?: string;
  title?: string;
}

type Screen = 'signin' | 'signup' | 'forgot' | 'forgot_sent' | 'email_confirm';

export function AuthModal({ open, onClose, defaultMode = 'signin', defaultEmail = '', title }: AuthModalProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [screen, setScreen] = useState<Screen>(defaultMode);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setError('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setCompanyName('');
      setScreen(defaultMode);
      setEmail(defaultEmail || '');
    }
  }, [open, defaultMode, defaultEmail]);

  if (!open || !mounted) return null;

  const canSubmit = screen === 'signup'
    ? email && password.length >= 6 && firstName.trim().length > 0
    : screen === 'forgot'
    ? !!email
    : email && password.length >= 6;

  async function handleGoogleSignIn() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Page will redirect — no need to setBusy(false)
  }

  async function submit() {
    if (!canSubmit) return;
    setError(''); setBusy(true);
    try {
      if (screen === 'signup') {
        const { error: err, needsConfirmation: confirm } = await signUp(email.trim(), password, {
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          companyName: companyName.trim() || undefined,
        });
        if (err) { setError(err); return; }
        if (confirm) { setScreen('email_confirm'); return; }
        onClose();
      } else if (screen === 'forgot') {
        const { error: err } = await resetPassword(email.trim());
        if (err) { setError(err); return; }
        setScreen('forgot_sent');
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) { setError(err); return; }
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const headerTitle =
    screen === 'forgot' || screen === 'forgot_sent' ? 'Reset Password' :
    screen === 'email_confirm' ? 'Check Your Email' :
    title || (screen === 'signup' ? 'Create Free Account' : 'Welcome Back');

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-green rounded-t-2xl px-6 py-5 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-display text-white text-lg font-bold uppercase tracking-wide">
            {headerTitle}
          </h2>
          <p className="text-brand-yellow/70 text-xs mt-1">Grafton Towboat Services</p>
        </div>

        <div className="p-6">

          {/* ── Email confirmation ── */}
          {screen === 'email_confirm' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-brand-yellow/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-brand-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-bold text-brand-navy text-sm mb-2">We sent you a confirmation link</p>
              <p className="text-gray-500 text-xs leading-relaxed mb-1">Check your inbox at</p>
              <p className="font-semibold text-brand-navy text-sm mb-4">{email}</p>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                Click the link to activate your account, then sign in here.
              </p>
              <button
                onClick={() => { setScreen('signin'); setPassword(''); }}
                className="text-brand-orange text-xs font-bold hover:underline"
              >
                Sign in instead →
              </button>
            </div>
          )}

          {/* ── Reset sent ── */}
          {screen === 'forgot_sent' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <p className="font-bold text-brand-navy text-sm mb-2">Reset link sent!</p>
              <p className="text-gray-500 text-xs leading-relaxed mb-1">Check your inbox at</p>
              <p className="font-semibold text-brand-navy text-sm mb-4">{email}</p>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                Click the link in the email to set a new password.
              </p>
              <button
                onClick={() => { setScreen('signin'); }}
                className="text-brand-orange text-xs font-bold hover:underline"
              >
                Back to sign in →
              </button>
            </div>
          )}

          {/* ── Forgot password form ── */}
          {screen === 'forgot' && (
            <div className="space-y-4">
              <p className="text-gray-500 text-xs leading-relaxed">
                Enter the email on your account and we&apos;ll send a reset link.
              </p>
              <div>
                <label className="label-base">Email</label>
                <input type="email" className="input-base" placeholder="captain@example.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="email" autoFocus />
              </div>
              {error && <p className="text-red-500 text-xs bg-red-50 rounded p-2.5">{error}</p>}
              <button onClick={submit} disabled={busy || !canSubmit}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Reset Link
              </button>
              <p className="text-center text-xs text-gray-400">
                <button onClick={() => { setScreen('signin'); setError(''); }}
                  className="text-brand-orange font-bold hover:underline">
                  ← Back to sign in
                </button>
              </p>
            </div>
          )}

          {/* ── Sign in / Sign up ── */}
          {(screen === 'signin' || screen === 'signup') && (
            <>
              {/* Google button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors mb-4"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              {screen === 'signup' && (
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {[
                    { icon: Star, label: 'Save favorites' },
                    { icon: History, label: 'Past orders' },
                    { icon: Zap, label: '1-click reorder' },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="text-center">
                      <div className="w-9 h-9 bg-brand-yellow/40 rounded-full flex items-center justify-center mx-auto mb-1">
                        <Icon className="w-4 h-4 text-brand-green" />
                      </div>
                      <p className="text-[10px] text-gray-500 font-semibold leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {screen === 'signup' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label-base">First Name</label>
                        <input type="text" className="input-base" placeholder="Jennifer"
                          value={firstName} onChange={e => setFirstName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="given-name" />
                      </div>
                      <div>
                        <label className="label-base">Last Name <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                        <input type="text" className="input-base" placeholder="Smith"
                          value={lastName} onChange={e => setLastName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="family-name" />
                      </div>
                    </div>
                    <div>
                      <label className="label-base">Company Name <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                      <input type="text" className="input-base" placeholder="M/V River Hawk"
                        value={companyName} onChange={e => setCompanyName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="organization" />
                    </div>
                  </>
                )}
                <div>
                  <label className="label-base">Email</label>
                  <input type="email" className="input-base" placeholder="captain@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="email" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label-base mb-0">Password</label>
                    {screen === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setScreen('forgot'); setError(''); }}
                        className="text-[11px] text-brand-orange font-semibold hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input type="password" className="input-base" placeholder="At least 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    autoComplete={screen === 'signup' ? 'new-password' : 'current-password'} />
                </div>
                {error && <p className="text-red-500 text-xs bg-red-50 rounded p-2.5">{error}</p>}
                <button onClick={submit} disabled={busy || !canSubmit}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {screen === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </div>

              <p className="text-center text-xs text-gray-400 mt-4">
                {screen === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
                <button
                  onClick={() => { setScreen(s => s === 'signup' ? 'signin' : 'signup'); setError(''); }}
                  className="text-brand-orange font-bold hover:underline"
                >
                  {screen === 'signup' ? 'Sign in' : 'Create free account'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
