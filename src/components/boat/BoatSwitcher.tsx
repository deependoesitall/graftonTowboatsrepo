'use client';
// src/components/boat/BoatSwitcher.tsx
//
// Multi-boat only. Single membership → render nothing (no clutter).
// "Ordering as Company · Boat" — one tap to switch; persists local + optional profile mirror.

import { useEffect, useRef, useState } from 'react';
import { Ship, ChevronDown, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  ActiveBoat,
  getActiveBoat,
  resolveActiveBoat,
  setActiveBoat,
  subscribeActiveBoat,
} from '@/lib/active-boat';

export function BoatSwitcher({
  className = '',
  variant = 'header',
  onChanged,
}: {
  className?: string;
  /** header = compact pill; panel = fuller card for account/checkout */
  variant?: 'header' | 'panel';
  onChanged?: (boat: ActiveBoat) => void;
}) {
  const { user, refreshProfile } = useAuth();
  const [links, setLinks] = useState<ActiveBoat[]>([]);
  const [active, setActive] = useState<ActiveBoat | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setLinks([]);
      setActive(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('vessel_members')
          .select('role, vessel_id, vessel:vessels(id, name, company:companies(name))');
        if (cancelled) return;
        const rows: ActiveBoat[] = (data || []).map((row: any) => ({
          vesselId: String(row.vessel_id || row.vessel?.id || '') || undefined,
          boat: row.vessel?.name || '',
          company: row.vessel?.company?.name || '',
        })).filter((r: ActiveBoat) => !!r.boat);
        // Dedupe by vesselId or company+boat
        const seen = new Set<string>();
        const unique = rows.filter(r => {
          const k = r.vesselId || `${r.company}::${r.boat}`.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setLinks(unique);
        const resolved = resolveActiveBoat(unique);
        if (resolved) {
          // Persist so checkout + history agree even if local was empty
          if (unique.length > 1) {
            const cur = getActiveBoat();
            if (!cur || cur.boat !== resolved.boat || cur.company !== resolved.company) {
              setActiveBoat(resolved);
            }
          }
          setActive(resolved);
        }
      } catch {
        if (!cancelled) setLinks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => subscribeActiveBoat(setActive), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user || links.length < 2 || !active) return null;

  async function pick(boat: ActiveBoat) {
    setActiveBoat(boat);
    setActive(boat);
    setOpen(false);
    onChanged?.(boat);
    // Mirror onto profile so returning visits + soft autofill stay honest
    try {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from('customer_profiles')
        .select('user_id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (existing) {
        await supabase.from('customer_profiles').update({
          company_name: boat.company,
          vessel_name: boat.boat,
        }).eq('user_id', user!.id);
      } else {
        await supabase.from('customer_profiles').insert({
          user_id: user!.id,
          company_name: boat.company,
          vessel_name: boat.boat,
        });
      }
      await refreshProfile?.();
    } catch { /* local selection still wins */ }
  }

  const label = [active.company, active.boat].filter(Boolean).join(' · ');

  if (variant === 'panel') {
    return (
      <div ref={rootRef} className={`rounded-xl border border-brand-gold/30 bg-brand-sand/50 px-4 py-3 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-brand-green/50 mb-2">
          Ordering as
        </p>
        <div className="flex flex-col gap-1.5">
          {links.map(b => {
            const id = b.vesselId || `${b.company}-${b.boat}`;
            const selected = active.vesselId
              ? active.vesselId === b.vesselId
              : active.boat === b.boat && active.company === b.company;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(b)}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'bg-brand-green text-white'
                    : 'bg-white/80 text-brand-navy hover:bg-white'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-sm truncate">
                    {[b.company, b.boat].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {selected && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-brand-green/50 mt-2 leading-relaxed">
          Past orders and checkout follow this boat. Other boats stay on their own list.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 max-w-[14rem] sm:max-w-xs rounded-full border border-brand-green/20 bg-brand-sand/70 hover:bg-brand-sand px-2.5 py-1 text-left transition-colors"
      >
        <Ship className="w-3.5 h-3.5 text-brand-orange shrink-0" />
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-wide text-brand-green/50 leading-none">
            Ordering as
          </span>
          <span className="block text-xs font-bold text-brand-navy truncate leading-tight mt-0.5">
            {label}
          </span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-brand-green/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1.5 z-50 w-64 max-w-[85vw] rounded-xl border border-brand-green/15 bg-white shadow-xl py-1 overflow-hidden"
        >
          {links.map(b => {
            const id = b.vesselId || `${b.company}-${b.boat}`;
            const selected = active.vesselId
              ? active.vesselId === b.vesselId
              : active.boat === b.boat && active.company === b.company;
            return (
              <li key={id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => pick(b)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                    selected ? 'bg-brand-green/5 font-bold text-brand-green' : 'text-brand-navy hover:bg-brand-sand/50'
                  }`}
                >
                  <span className="truncate">{[b.company, b.boat].filter(Boolean).join(' · ')}</span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0 text-brand-green" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
