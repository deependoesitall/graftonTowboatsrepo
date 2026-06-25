'use client';
// src/components/auth/AuthModal.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Star, History, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
  defaultEmail?: string;
  title?: string;
}

export function AuthModal({ open, onClose, defaultMode = 'signin', defaultEmail = '', title }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Reset state every time the modal is opened
  useEffect(() => {
    if (open) {
      setError('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setCompanyName('');
      setMode(defaultMode);
      setEmail(defaultEmail || '');
      setNeedsConfirmation(false);
    }
  }, [open, defaultMode, defaultEmail]);

  if (!open || !mounted) return null;

  const canSubmit = mode === 'signup'
    ? email && password.length >= 6 && firstName.trim().length > 0
    : email && password.length >= 6;

  async function submit() {
    if (!canSubmit) return;
    setError(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const { error: err, needsConfirmation: confirm } = await signUp(email.trim(), password, {
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          companyName: companyName.trim() || undefined,
        });
        if (err) { setError(err); return; }
        if (confirm) { setNeedsConfirmation(true); return; }
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) { setError(err); return; }
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in my-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-brand-green rounded-t-2xl px-6 py-5 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-display text-white text-lg font-bold uppercase tracking-wide">
            {needsConfirmation ? 'Check Your Email' : (title || (mode === 'signup' ? 'Create Free Account' : 'Welcome Back'))}
          </h2>
          <p className="text-brand-yellow/70 text-xs mt-1">Grafton Towboat Services</p>
        </div>

        <div className="p-6">
          {/* Email confirmation screen */}
          {needsConfirmation ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-brand-yellow/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-brand-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-bold text-brand-navy text-sm mb-2">We sent you a confirmation link</p>
              <p className="text-gray-500 text-xs leading-relaxed mb-1">
                Check your inbox at
              </p>
              <p className="font-semibold text-brand-navy text-sm mb-4">{email}</p>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                Click the link in the email to activate your account, then sign in here.
              </p>
              <button
                onClick={() => { setNeedsConfirmation(false); setMode('signin'); setPassword(''); }}
                className="text-brand-orange text-xs font-bold hover:underline"
              >
                Sign in instead →
              </button>
            </div>
          ) : (
            <>
              {mode === 'signup' && (
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
                {mode === 'signup' && (
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
                  <label className="label-base">Password</label>
                  <input type="password" className="input-base" placeholder="At least 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                </div>
                {error && <p className="text-red-500 text-xs bg-red-50 rounded p-2.5">{error}</p>}
                <button onClick={submit} disabled={busy || !canSubmit}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </div>

              <p className="text-center text-xs text-gray-400 mt-4">
                {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
                <button onClick={() => { setMode(m => m === 'signup' ? 'signin' : 'signup'); setError(''); }}
                  className="text-brand-orange font-bold hover:underline">
                  {mode === 'signup' ? 'Sign in' : 'Create free account'}
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
