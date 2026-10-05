'use client';
// src/components/admin/OnboardLinkDialog.tsx
//
// "Send onboard link" — builds a ready-to-send login message for a staff
// account (GTS or Sinclair's) and hands it to the mail app via mailto:, or
// copies it. Nothing is sent from the server and the password is never stored:
// it lives only in this component's state (prefilled when it was just set in
// this browser tab) and disappears when the dialog closes.

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Mail, X } from 'lucide-react';
import {
  ONBOARD_LINKS,
  OnboardKind,
  onboardBody,
  onboardMailto,
  onboardSubject,
} from '@/lib/onboard-links';

/** Clipboard copy with a hidden-textarea fallback for older mobile browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 2000);
    }
  }
  return { copied, copy };
}

/** One site's onboarding link with Copy / Open buttons (never both). */
export function OnboardLinksCard({ kind }: { kind: OnboardKind }) {
  const { copied, copy } = useCopied();
  const { label, url } = ONBOARD_LINKS[kind];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
      <span className="text-xs font-semibold text-brand-navy shrink-0">{label} link</span>
      <span className="text-xs text-gray-500 flex-1 min-w-[10rem] truncate">{url}</span>
      <button type="button" onClick={() => copy(kind, url)}
        className="min-h-[36px] flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy">
        {copied === kind ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied === kind ? 'Copied' : 'Copy'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="min-h-[36px] flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy">
        <ExternalLink className="w-3.5 h-3.5" /> Open
      </a>
    </div>
  );
}

export interface OnboardTarget {
  kind: OnboardKind;
  username: string;
  name?: string | null;
  /** Only when it was just set in this browser tab — never persisted. */
  password?: string;
  email?: string | null;
  /** True right after the account was created. */
  isNew?: boolean;
}

export default function OnboardLinkDialog({
  target,
  onClose,
}: {
  target: OnboardTarget;
  onClose: () => void;
}) {
  // Scoped to the account's own site — the dialog never offers the other link.
  const kind = target.kind;
  const [to, setTo] = useState(target.email && target.email.includes('@') ? target.email : '');
  const [password, setPassword] = useState(target.password || '');
  const { copied, copy } = useCopied();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const subject = onboardSubject(kind);
  const body = onboardBody({ kind, name: target.name, username: target.username, password: password.trim() });
  const link = ONBOARD_LINKS[kind].url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Send onboard link">
        <div className="bg-brand-navy px-5 py-3 flex items-center justify-between rounded-t-xl">
          <div>
            <h3 className="text-white font-bold text-sm">
              {target.isNew ? 'Login created — send onboard link' : 'Send onboard link'}
            </h3>
            <p className="text-white/60 text-xs">{target.name || target.username} · @{target.username}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label-base">{ONBOARD_LINKS[kind].label} link</label>
            <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-600 flex-1 min-w-[10rem] break-all">{link}</span>
              <button type="button" onClick={() => copy('link', link)}
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy">
                {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy">
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Username</label>
              <input className="input-base bg-gray-50" value={target.username} readOnly />
            </div>
            <div>
              <label className="label-base">Password</label>
              <input type="text" className="input-base" value={password} autoComplete="off"
                placeholder="Type their password"
                onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
          {!target.password && (
            <p className="text-[11px] text-gray-400 -mt-2">
              Passwords can&apos;t be looked up later. Type the one you gave them.
            </p>
          )}

          <div>
            <label className="label-base">Send to (email)</label>
            <input type="email" className="input-base" value={to} placeholder="Optional — you can fill it in your mail app"
              onChange={e => setTo(e.target.value)} />
          </div>

          <div>
            <label className="label-base">Message preview</label>
            <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-semibold text-brand-navy mb-2">Subject: {subject}</p>
              <pre className="whitespace-pre-wrap font-sans">{body}</pre>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a href={onboardMailto(to, subject, body)}
              className="btn-primary text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" /> Open email
            </a>
            <button type="button" onClick={() => copy('msg', `Subject: ${subject}\n\n${body}`)}
              className="btn-outline text-sm flex items-center gap-2">
              {copied === 'msg' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied === 'msg' ? 'Copied' : 'Copy message'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-2">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
