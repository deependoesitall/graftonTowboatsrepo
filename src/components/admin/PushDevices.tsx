'use client';
// src/components/admin/PushDevices.tsx
//
// Per-device notification control, in Settings.
//
// PUSH ONLY. Email notifications are not affected by anything on this screen
// and there is deliberately no switch for them here — order emails are the
// system of record, they go to a shared inbox rather than a device, and one
// person turning them off on their own phone isn't a thing that makes sense.
// The heading says so, because "notifications" would otherwise read as both.
//
// Why a list rather than a single toggle: a phone gets lost, replaced, or
// belongs to someone who's left. Without this, the only way to stop a device
// buzzing is to be holding it.

import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Monitor, Loader2, Trash2, BellOff } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

interface Device {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_sent_at: string | null;
  expired_at: string | null;
}

/**
 * A human label from the user agent.
 *
 * Deliberately coarse. UA sniffing is unreliable and the only job here is
 * helping someone recognize their own phone in a list of two or three — "iPhone
 * · Safari" does that, and an exact version string wouldn't do it better.
 */
function describe(ua: string | null): { label: string; mobile: boolean } {
  const s = ua || '';
  const mobile = /iphone|ipad|android|mobile/i.test(s);
  let device = 'Unknown device';
  if (/iphone/i.test(s)) device = 'iPhone';
  else if (/ipad/i.test(s)) device = 'iPad';
  else if (/android/i.test(s)) device = 'Android';
  else if (/macintosh|mac os/i.test(s)) device = 'Mac';
  else if (/windows/i.test(s)) device = 'Windows PC';

  let browser = '';
  // Order matters: Edge and Chrome both claim "Chrome" in their UA string, and
  // Safari appears in nearly all of them.
  if (/edg\//i.test(s)) browser = 'Edge';
  else if (/chrome|crios/i.test(s)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(s)) browser = 'Firefox';
  else if (/safari/i.test(s)) browser = 'Safari';

  return { label: browser ? `${device} · ${browser}` : device, mobile };
}

const when = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function PushDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await adminFetch('/api/admin/push/subscribe');
      if (!res.ok) throw new Error('Could not load your devices');
      setDevices((await res.json()).devices || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Which row is the device being used right now, so it can be labeled
  // instead of the person guessing between two iPhones.
  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      setThisEndpoint(sub?.endpoint ?? null);
    })().catch(() => {});
  }, []);

  async function turnOff(d: Device) {
    setBusy(d.id);
    setError('');
    try {
      const res = await adminFetch('/api/admin/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id }),
      });
      if (!res.ok) throw new Error('Could not turn that device off');

      // If it's THIS device, also unsubscribe locally. Deleting the server row
      // alone would leave the browser still holding a live subscription — it
      // would stop receiving (nothing sends to it) but would report itself as
      // "on", and re-enabling would silently recreate the same endpoint.
      if (thisEndpoint && d.endpoint === thisEndpoint) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
        setThisEndpoint(null);
      }
      setDevices(list => list.filter(x => x.id !== d.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn that device off');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card-base p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold text-brand-navy">Order alerts by device</h2>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
          Phones and computers set up to buzz when an order arrives.
          {' '}<strong className="text-gray-500">Email is separate and isn&apos;t affected by anything here.</strong>
        </p>
      </div>

      {error && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {loading && (
        <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-300 mx-auto" /></div>
      )}

      {!loading && !devices.length && (
        <div className="py-6 text-center">
          <BellOff className="w-6 h-6 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No devices set up yet.</p>
          <p className="text-xs text-gray-300 mt-1">
            Turn alerts on from the dashboard on any phone or computer you want notified.
          </p>
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {devices.map(d => {
          const { label, mobile } = describe(d.user_agent);
          const isThis = !!thisEndpoint && d.endpoint === thisEndpoint;
          const Icon = mobile ? Smartphone : Monitor;
          return (
            <li key={d.id} className="py-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${d.expired_at ? 'text-gray-300' : 'text-brand-navy'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${d.expired_at ? 'text-gray-400' : 'text-brand-navy'}`}>
                  {label}
                  {isThis && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 rounded-full px-1.5 py-0.5">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {/* A device that's expired stopped working on its own — the
                      app was deleted or permission was revoked. Saying so beats
                      leaving a row that looks active but never buzzes. */}
                  {d.expired_at
                    ? 'Stopped working — app removed or notifications turned off'
                    : d.last_sent_at
                      ? `Last alert ${when(d.last_sent_at)}`
                      : `Added ${when(d.created_at)} · no alerts yet`}
                </p>
              </div>
              <button
                onClick={() => turnOff(d)}
                disabled={busy === d.id}
                title="Turn off alerts on this device"
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 shrink-0">
                {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
