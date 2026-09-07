// src/components/site/LegalShell.tsx
//
// Shared frame for /privacy, /terms and /accessibility.
//
// These pages are set to noindex in their route metadata. A privacy policy
// outranking the grocery delivery page would be a genuinely bad outcome, and
// legal boilerplate is not what anyone should find when they search for
// towboat supplies in Grafton.

import { SiteShell } from '@/components/site/SiteChrome';

export function LegalShell({
  title, effective, lede, children,
}: {
  title: string;
  effective: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <SiteShell>
      <article className="max-w-3xl mx-auto px-5 pt-14 md:pt-20 pb-20">
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-7 md:p-12">
          <h1 className="gts-heading text-[2.1rem] md:text-4xl mb-2 leading-tight">{title}</h1>
          <p className="text-brand-green/50 text-sm font-body pb-5 mb-7 border-b-2 border-brand-green/80">
            Grafton Towboat Services LLC &nbsp;·&nbsp; {effective}
          </p>

          {lede && (
            <p className="text-brand-green/80 font-body text-[17px] leading-relaxed mb-8">{lede}</p>
          )}

          <div className="legal-body space-y-1">{children}</div>
        </div>
      </article>
    </SiteShell>
  );
}

/** Section heading. */
export function LS({ children }: { children: React.ReactNode }) {
  return <h2 className="gts-heading text-xl md:text-2xl mt-9 mb-3">{children}</h2>;
}

/** Sub-heading. */
export function LSub({ children }: { children: React.ReactNode }) {
  return <h3 className="font-body font-bold text-brand-green text-[15px] mt-6 mb-2">{children}</h3>;
}

/** Body paragraph. */
export function LP({ children }: { children: React.ReactNode }) {
  return <p className="text-brand-green/75 font-body leading-relaxed mb-4">{children}</p>;
}

/** Bulleted list. */
export function LUL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-2 mb-4 text-brand-green/75 font-body leading-relaxed marker:text-brand-orange">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

/** Two-column "what / why" table — reads far better than prose for data lists. */
export function LTable({ head, rows }: { head: [string, string]; rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div className="overflow-x-auto mb-6 rounded-xl border border-brand-green/12">
      <table className="w-full text-sm font-body border-collapse">
        <thead>
          <tr className="bg-brand-green/[0.06]">
            {head.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-brand-green/60">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-brand-green/10 align-top">
              <td className="px-4 py-3 text-brand-green font-semibold w-[42%]">{r[0]}</td>
              <td className="px-4 py-3 text-brand-green/70">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Emphasised aside — used for the "we never take cards on this site" point. */
export function LCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-green/[0.05] border-l-4 border-brand-glight rounded-r-xl px-5 py-4 mb-6">
      <p className="text-brand-green/85 font-body leading-relaxed text-[15px]">{children}</p>
    </div>
  );
}
