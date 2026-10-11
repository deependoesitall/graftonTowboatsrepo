'use client';
// src/components/admin/AddCrewForm.tsx
//
// Customers → Logins: the one small form behind every "+".
//   login   — a login on this boat
//   boat    — a boat under this company, with an optional first login
//   company — a company and its first boat, with an optional first login
// A login whose email already has an account links that account instead.
// All of it goes through src/lib/crew-setup.ts, the same steps the other
// customer forms use.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { CrewRoleField } from '@/components/admin/CrewRoleField';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';
import { isValidEmail } from '@/lib/email-address';
import { accountExists, addBoat, addCompany, addLoginToBoat } from '@/lib/crew-setup';
import type { OnboardCardData } from '@/components/admin/OnboardSendCard';

type Named = { id: string; name: string };
export type AddCrewMode =
  | { kind: 'login'; boat: Named }
  | { kind: 'boat'; company: Named }
  | { kind: 'company' };

export type AddCrewDone = {
  message: string;
  error?: string;
  /** Set when a login was made but not emailed, so the send card can open. */
  card?: OnboardCardData;
  boatId?: string;
};

export function AddCrewForm({ mode, onDone, onCancel }: {
  mode: AddCrewMode;
  onDone: (r: AddCrewDone) => void;
  onCancel: () => void;
}) {
  const [company, setCompany] = useState('');
  const [boat, setBoat] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cook');
  const [sendWelcome, setSendWelcome] = useState(true);
  const [existing, setExisting] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // What this form already made, so pressing again after an error never
  // makes a second company or boat.
  const made = useRef<{ company?: Named; boat?: Named }>({});

  const addr = email.trim().toLowerCase();
  const emailOk = isValidEmail(addr);
  useEffect(() => {
    setExisting(null);
    if (!emailOk) return;
    const t = window.setTimeout(() => { accountExists(addr).then(setExisting).catch(() => setExisting(null)); }, 350);
    return () => window.clearTimeout(t);
  }, [addr, emailOk]);

  const wantsLogin = mode.kind === 'login' || !!email.trim();
  const needsPassword = wantsLogin && existing !== true;
  const ready =
    (mode.kind !== 'company' || !!company.trim()) &&
    (mode.kind === 'login' || !!boat.trim()) &&
    (!wantsLogin || (emailOk && (!needsPassword || password.trim().length >= MIN_PASSWORD_LENGTH)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      let co: Named | undefined = mode.kind === 'boat' ? mode.company : made.current.company;
      if (mode.kind === 'company' && !co) co = made.current.company = await addCompany(company);
      let bt: Named | undefined = mode.kind === 'login' ? mode.boat : made.current.boat;
      if (!bt && co) bt = made.current.boat = await addBoat(co.id, boat);
      if (!bt) throw new Error('Could not add the boat.');
      const where = mode.kind === 'company' ? `${bt.name}, ${co?.name}` : bt.name;

      if (!wantsLogin) {
        onDone({ message: mode.kind === 'company' ? `Added ${co?.name} with ${bt.name}.` : `Added ${bt.name}.`, boatId: bt.id });
        return;
      }
      const parts = name.trim().split(/\s+/);
      const first = parts[0] || '';
      const last = parts.slice(1).join(' ');
      const r = await addLoginToBoat(bt, { first, last, email: addr, password, role, sendWelcome });
      const who = name.trim() || addr;
      if (r.linkedExisting) {
        onDone({ message: `${addr} already had an account. It is now on ${where}; their password is unchanged.`, boatId: bt.id });
      } else if (r.emailed) {
        onDone({ message: `${who} can sign in for ${where}. Welcome email sent to ${addr}.`, boatId: bt.id });
      } else {
        onDone({
          message: `${who} can sign in for ${where}.`,
          error: r.emailError ? `The welcome email did not send: ${r.emailError}` : undefined,
          card: { name: name.trim(), email: addr, vessel: bt.name, password: password.trim() },
          boatId: bt.id,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const title = mode.kind === 'login' ? `Add a login to ${mode.boat.name}`
    : mode.kind === 'boat' ? `Add a boat to ${mode.company.name}` : 'New company';
  const button = mode.kind === 'login' ? 'Add login' : mode.kind === 'boat' ? 'Add boat' : 'Add company';

  return (
    <form onSubmit={submit} className="rounded-xl border border-brand-river/25 bg-white p-3.5 space-y-3">
      <p className="text-sm font-bold text-brand-navy">{title}</p>

      {mode.kind !== 'login' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {mode.kind === 'company' && (
            <input className="input-base" placeholder="Company" value={company} autoFocus autoComplete="off"
              onChange={e => setCompany(e.target.value)} />
          )}
          <input className="input-base" placeholder="Boat" value={boat} autoComplete="off" autoFocus={mode.kind === 'boat'}
            onChange={e => setBoat(e.target.value)} />
        </div>
      )}

      {mode.kind !== 'login' && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 pt-1">First login (optional)</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input className="input-base" placeholder="Name" value={name} autoComplete="off" autoFocus={mode.kind === 'login'}
          onChange={e => setName(e.target.value)} />
        <input className="input-base" placeholder="Email" type="email" inputMode="email" value={email} autoComplete="off"
          onChange={e => setEmail(e.target.value)} />
        {needsPassword && (
          <input className="input-base font-mono" placeholder={`Password (${MIN_PASSWORD_LENGTH}+ characters)`} type="text"
            value={password} autoComplete="off" onChange={e => setPassword(e.target.value)} />
        )}
      </div>
      {existing === true && (
        <p className="text-xs text-brand-river">
          {addr} already has an account. It will be linked to this boat and keeps its own password.
        </p>
      )}
      {wantsLogin && (
        <>
          <CrewRoleField value={role} onChange={setRole} />
          {existing !== true && (
            <label className="flex items-center gap-2 text-sm text-gray-700 min-h-[32px]">
              <input type="checkbox" className="w-4 h-4" checked={sendWelcome} onChange={e => setSendWelcome(e.target.checked)} />
              Email them their login
            </label>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!ready || busy}
          className="btn-primary text-sm min-h-[44px] inline-flex items-center gap-1.5 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {button}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 min-h-[44px]">
          Cancel
        </button>
      </div>
    </form>
  );
}
