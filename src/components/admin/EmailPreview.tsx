'use client';

// The email as it lands: subject line and the message, at desktop or phone width.
import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

export function EmailPreview({ subject, html }: { subject: string; html: string }) {
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Preview</p>
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {([['desktop', Monitor], ['phone', Smartphone]] as const).map(([k, I]) => (
            <button key={k} type="button" onClick={() => setWidth(k)} title={k === 'phone' ? 'Phone width' : 'Desktop width'}
              className={`px-2.5 py-1 rounded-md ${width === k ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-400 hover:text-brand-navy'}`}>
              <I className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-baseline gap-2 px-4 py-3 border-b border-gray-200 bg-white min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Subject</span>
          <span className="text-sm font-semibold text-brand-navy break-words min-w-0">{subject || '…'}</span>
        </div>
        <div className="p-3 sm:p-4 flex justify-center">
          <iframe title="Email preview" srcDoc={html} sandbox=""
            style={{ width: width === 'phone' ? 390 : '100%', maxWidth: '100%' }}
            className="h-[560px] bg-white rounded-lg border border-gray-200 shadow-sm" />
        </div>
      </div>
    </div>
  );
}
