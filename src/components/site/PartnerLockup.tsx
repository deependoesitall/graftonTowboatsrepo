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
// ⚠️ DO NOT recolour, crop, or restyle either mark. Both are transparent PNGs
// rendered at full size with only a drop-shadow for separation — no plates, no
// tinting, no masking. Restyling a partner's logo to match your palette is the
// thing brand owners actually object to, and it costs nothing to avoid.

interface Props {
  /** 'dark' = on the deep green band. 'light' = on the pale site background. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  /** The who-delivers line. Omit only where the surrounding copy already says it. */
  caption?: string | null;
  className?: string;
}

// NO PLATES. Both marks are transparent PNGs, so a white card behind them only
// shrank the artwork and boxed two logos that were designed to breathe. They
// render directly at a size that can actually be read across a room.
const BOX = {
  sm: 'h-11',
  md: 'h-16',
  lg: 'h-[88px]',
} as const;

const CROSS = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
} as const;

// A drop-shadow FILTER, not a box-shadow — it follows the alpha channel, so it
// traces the actual logo silhouette instead of a rectangle around it. This is
// what keeps the dark ring of the GTS badge from dissolving into a dark
// background without putting a plate behind it.
const GLOW = {
  dark: 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]',
  light: 'drop-shadow-[0_2px_6px_rgba(30,61,30,0.18)]',
} as const;

export function PartnerLockup({
  tone = 'dark',
  size = 'md',
  caption = 'Ordered and delivered by Grafton Towboat Services.',
  className = '',
}: Props) {
  const dark = tone === 'dark';
  const mark = `${BOX[size]} w-auto object-contain shrink-0 ${GLOW[tone]}`;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-5 sm:gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/gts-logo.png" alt="Grafton Towboat Services" className={mark} />

        {/* The × is decorative — screen readers get the two alt texts, and
            "Grafton Towboat Services times Sinclair's Foods" would be noise. */}
        <span aria-hidden="true"
          className={`${CROSS[size]} font-light select-none leading-none ${
            dark ? 'text-white/30' : 'text-brand-green/25'
          }`}>
          ×
        </span>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/sinclairs-logo.png" alt="Sinclair's Foods" className={mark} />
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
