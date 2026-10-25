'use client';

// The email as it lands: subject line and the message, at desktop or phone
// width, in light or dark mode, with its size against Gmail's cut-off.
import { useState } from 'react';
import { Monitor, Moon, Smartphone, Sun } from 'lucide-react';

const CLIP = 102 * 1024;
// Roughly what Gmail and Apple Mail do in dark mode: light backgrounds go
// dark, colours shift, pictures stay as they are.
const DARK = '<style>html{filter:invert(1) hue-rotate(180deg);background:#fff}img{filter:invert(1) hue-rotate(180deg)}</style>';

export function EmailPreview({ subject, html, bytes }: { subject: string; html: string; bytes?: number }) {
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [dark, setDark] = useState(false);
  const shown = dark ? html.replace(/<head[^>]*>|<html[^>]*>/i, (m) => `${m}${DARK}`) : html;
  const kb = bytes ? Math.round(bytes / 1024) : null;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Preview</p>
        <div className="flex gap-2">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {([[false, Sun, 'Light mode'], [true, Moon, 'Dark mode']] as const).map(([k, I, t]) => (
              <button key={String(k)} type="button" onClick={() => setDark(k)} title={t}
                className={`px-2.5 py-1 rounded-md ${dark === k ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-400 hover:text-brand-navy'}`}>
                <I className="w-4 h-4" />
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {([['desktop', Monitor], ['phone', Smartphone]] as const).map(([k, I]) => (
              <button key={k} type="button" onClick={() => setWidth(k)} title={k === 'phone' ? 'Phone width' : 'Desktop width'}
                className={`px-2.5 py-1 rounded-md ${width === k ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-400 hover:text-brand-navy'}`}>
                <I className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-baseline gap-2 px-4 py-3 border-b border-gray-200 bg-white min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Subject</span>
          <span className="text-sm font-semibold text-brand-navy break-words min-w-0">{subject || '…'}</span>
        </div>
        <div className="p-3 sm:p-4 flex justify-center">
          <iframe title="Email preview" srcDoc={shown} sandbox=""
            style={{ width: width === 'phone' ? 390 : '100%', maxWidth: '100%' }}
            className="h-[560px] bg-white rounded-lg border border-gray-200 shadow-sm" />
        </div>
        {kb !== null && (
          <div className="px-4 pb-3">
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full ${bytes! > CLIP ? 'bg-red-600' : bytes! > 90 * 1024 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, (bytes! / CLIP) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {kb} KB of 102 KB{bytes! > CLIP ? '. Gmail will cut this off; shorten it.' : bytes! > 90 * 1024 ? '. Close to the Gmail cut-off.' : '. Fits in Gmail without being cut off.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
