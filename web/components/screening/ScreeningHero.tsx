
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
      <h1 className="font-display font-normal text-28 md:text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        Experience the <em className="italic text-brand">standard.</em>
      </h1>
    </div>
  );
}

