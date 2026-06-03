
interface ScreeningHeroProps {
  inQueue: number;
  critical: number;
  slaRisk: number;
  avgRisk: number;
}

// KPI tile bar removed. Props are retained on ScreeningHeroProps so the
// call site still compiles (and keeps its derived metrics) without edits.
export function ScreeningHero(_props: ScreeningHeroProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
        BUREAU II · PRECISION BENCH
      </div>
      <h1 className="font-display font-normal text-28 md:text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        Experience the <em className="italic text-brand">standard.</em>
      </h1>
    </div>
  );
}

