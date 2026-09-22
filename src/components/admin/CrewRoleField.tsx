'use client';
// Quick chips for cook / captain / other, plus a free-text role.

const CHIPS = [
  { value: 'cook', label: 'Cook' },
  { value: 'captain', label: 'Captain' },
  { value: 'other', label: 'Other' },
] as const;

export function CrewRoleField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
}) {
  const selected = value.trim().toLowerCase();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map(chip => {
          const on = selected === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(chip.value)}
              className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                on
                  ? 'bg-brand-green text-white border-brand-green'
                  : 'bg-white text-brand-navy border-gray-200 hover:border-brand-gold'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <input
        className="input-base"
        placeholder="Or type a role — steward, engineer, mate"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        maxLength={40}
        autoComplete="off"
      />
    </div>
  );
}
