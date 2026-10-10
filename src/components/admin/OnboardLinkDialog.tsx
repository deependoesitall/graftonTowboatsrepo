'use client';
// src/components/admin/OnboardLinkDialog.tsx
//
// Login message for a staff account (GTS or Sinclair's): send it, or copy it
// to send yourself. The password is never stored: it lives only in this component's state
// (prefilled when it was just set in this tab) and is gone on close.

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Send, X } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import {
  ONBOARD_LINKS,
  OnboardKind,
  onboardBody,
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

/** Compact one-line link for a group header: only that site's link, never both. */
export function OnboardLinksCard({ kind }: { kind: OnboardKind }) {
  const { copied, copy } = useCopied();
  const { url } = ONBOARD_LINKS[kind];
  return (
    <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
      <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
      <button type="button" onClick={() => copy(kind, url)}
        className="min-h-[32px] shrink-0 flex items-center gap-1 font-semibold text-brand-river hover:text-brand-navy">
        {copied === kind ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copied === kind ? 'Copied' : 'Copy'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="min-h-[32px] shrink-0 flex items-center gap-1 font-semibold text-brand-river hover:text-brand-navy">
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
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [sendError, setSendError] = useState('');
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send login">
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h3 className="font-bold text-brand-navy">{target.isNew ? 'Login created' : 'Send login'}</h3>
            <p className="text-xs text-gray-500 truncate">{target.name || target.username} · {ONBOARD_LINKS[kind].label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -m-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-600 break-all bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{link}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-base">Username</label>
              <input className="input-base bg-gray-50" value={target.username} readOnly />
            </div>
            <div>
              <label className="label-base">Password</label>
              <input type="text" className="input-base" value={password} autoComplete="off"
                placeholder="The one you set" onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-base">Send to</label>
            <input type="email" className="input-base" value={to} placeholder="name@example.com"
              onChange={e => setTo(e.target.value)} />
          </div>

          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Preview message</summary>
            <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3">
              <p className="font-semibold text-brand-navy mb-2">{subject}</p>
              <pre className="whitespace-pre-wrap font-sans">{body}</pre>
            </div>
          </details>

          <div className="space-y-2 pt-1">
            <button type="button"
              disabled={sending || !to.trim() || !password.trim()}
              onClick={async () => {
                setSending(true);
                setSendError('');
                setSentTo('');
                try {
                  const res = await adminFetch('/api/admin/staff-invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      to: to.trim(),
                      username: target.username,
                      password: password.trim(),
                      display_name: target.name || target.username,
                      kind,
                    }),
                  });
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok) { setSendError(j.error || 'Send failed.'); return; }
                  setSentTo(to.trim());
                } finally {
                  setSending(false);
                }
              }}
              className="btn-primary w-full text-sm flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-40">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send login email'}
            </button>
            {sentTo && <p className="text-sm text-emerald-800">Sent to {sentTo}.</p>}
            {sendError && <p className="text-sm text-red-700">{sendError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => copy('msg', `Subject: ${subject}\n\n${body}`)}
                className="btn-outline text-sm flex items-center justify-center gap-2 min-h-[44px]">
                {copied === 'msg' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === 'msg' ? 'Copied' : 'Copy message'}
              </button>
              <button type="button" onClick={() => copy('link', link)}
                className="btn-outline text-sm flex items-center justify-center gap-2 min-h-[44px]">
                {copied === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
