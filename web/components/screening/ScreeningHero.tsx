interface ScreeningHeroProps {
  inQueue: number;
  critical: number;
  slaRisk: number;
}

export function ScreeningHero({ inQueue, critical, slaRisk }: ScreeningHeroProps) {
  return (
    <div className="mb-8">
      <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
        BUREAU II · PRECISION BENCH
      </div>
      <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        Experience the <em className="italic text-brand">standard.</em>
      </h1>
      <div className="flex gap-8 mt-3 pt-3 border-t border-hair">
        <HeroStat value={String(inQueue)} label="in queue" />
        <HeroStat value={String(critical)} label="critical" />
        <HeroStat value={String(slaRisk)} label="SLA risk" />
      </div>
      <p className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
        <strong>Six lists · ten-year audit · four eyes.</strong> One bench. One queue. Every
        subject cross-checked against six sanctions lists and bound to the ten-year audit
        trail.
      </p>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-20 font-semibold text-ink-0">{value}</span>
      <span className="text-11 uppercase tracking-wide-4 text-ink-2 font-medium">{label}</span>
    </div>
  );
}
