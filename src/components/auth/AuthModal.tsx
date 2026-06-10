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
  title?: string;
}

export function AuthModal({ open, onClose, defaultMode = 'signin', title }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Reset state every time the modal is opened
  useEffect(() => {
    if (open) {
      setError('');
      setPassword('');
      setMode(defaultMode);
    }
  }, [open, defaultMode]);

  if (!open || !mounted) return null;

  async function submit() {
    setError(''); setBusy(true);
    const fn = mode === 'signup' ? signUp : signIn;
    const { error: err } = await fn(email.trim(), password);
    setBusy(false);
    if (err) { setError(err); return; }
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-brand-green rounded-t-2xl px-6 py-5 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-display text-white text-lg font-bold uppercase tracking-wide">
            {title || (mode === 'signup' ? 'Create Free Account' : 'Welcome Back')}
          </h2>
          <p className="text-brand-yellow/70 text-xs mt-1">Grafton Towboat Services</p>
        </div>

        <div className="p-6">

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
                <button onClick={submit} disabled={busy || !email || password.length < 6}
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

        </div>
      </div>
    </div>,
    document.body
  );
}
