// src/components/site/PartnerLockup.tsx
//
// GTS × Sinclair's. One component so the partnership looks identical everywhere.
//
// ── WHY THE LOGO IS ALLOWED HERE, AND WHAT THE BOUNDARY ACTUALLY IS ──────
//
// Dave's objection (Aug 2026) was never "don't show our logo". It was liability:
// nothing may imply Sinclair's is doing the DELIVERY. Clarified by Deepen,
// Sept 2026. That distinction is what this component is built around, and it's
// why the logo and the caption are inseparable here:
//
//   · The LOGO answers "where do the groceries come from" — Sinclair's.
//   · The CAPTION answers "who brings them to your boat" — GTS, in words.
//
// Splitting those two facts is the safest possible framing, and it's also the
// most persuasive: a real grocery store's mark does more for a captain's trust
// than the sentence "we partner with a local grocer" ever could.
//
// ⚠️ DO NOT render this without its caption, and do not reword the caption to
// blur who delivers. That is the one thing Dave asked for.
//
// ⚠️ DO NOT recolour, crop, or restyle either mark. Both sit on their own
// neutral plate so each keeps its own colours against any background. Tinting
// a partner's logo to match your palette is the thing brand owners actually
// object to, and it costs nothing to avoid.

interface Props {
  /** 'dark' = on the deep green band. 'light' = on the pale site background. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  /** The who-delivers line. Omit only where the surrounding copy already says it. */
  caption?: string | null;
  className?: string;
}

const BOX = {
  sm: 'w-12 h-12 rounded-xl p-1.5',
  md: 'w-16 h-16 rounded-2xl p-2',
  lg: 'w-20 h-20 rounded-2xl p-2.5',
} as const;

const CROSS = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
} as const;

export function PartnerLockup({
  tone = 'dark',
  size = 'md',
  caption = 'Ordered and delivered by Grafton Towboat Services.',
  className = '',
}: Props) {
  const dark = tone === 'dark';

  // White plates on dark; a faint outline on light so the white-backed
  // Sinclair's mark doesn't dissolve into the pale page.
  const plate = dark
    ? 'bg-white shadow-[0_6px_20px_rgba(0,0,0,0.28)]'
    : 'bg-white border border-brand-green/10 shadow-sm';

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`${BOX[size]} ${plate} flex items-center justify-center shrink-0`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/gts-logo.png" alt="Grafton Towboat Services"
            className="w-full h-full object-contain" />
        </div>

        {/* The × is decorative — screen readers get the two alt texts, and
            "Grafton Towboat Services times Sinclair's Foods" would be noise. */}
        <span aria-hidden="true"
          className={`${CROSS[size]} font-light select-none ${dark ? 'text-brand-yellow/50' : 'text-brand-green/30'}`}>
          ×
        </span>

        <div className={`${BOX[size]} ${plate} flex items-center justify-center shrink-0`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/sinclairs-logo.png" alt="Sinclair's Foods"
            className="w-full h-full object-contain" />
        </div>
      </div>

      {caption && (
        <p className={`text-center font-body leading-snug mt-3.5 text-sm ${
          dark ? 'text-brand-yellow/80' : 'text-brand-green/65'
        }`}>
          {caption}
        </p>
      )}
    </div>
  );
}

export default PartnerLockup;
