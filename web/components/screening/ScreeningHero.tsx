interface ScreeningHeroProps {
  inQueue: number;
  critical: number;
  slaRisk: number;
  avgRisk: number;
}

export function ScreeningHero({ inQueue, critical, slaRisk, avgRisk }: ScreeningHeroProps) {
  return (
    <div className="mb-8">
      <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
        BUREAU II · PRECISION BENCH
      </div>
      <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        Experience the <em className="italic text-brand">standard.</em>
      </h1>
      <div className="flex gap-8 mt-3 pt-3 border-t border-hair flex-wrap">
        <HeroStat value={String(inQueue)} label="in queue" />
        <HeroStat value={String(critical)} label="critical" tone="red" />
        <HeroStat value={String(slaRisk)} label="SLA risk" tone="orange" />
        <HeroStat
          value={inQueue > 0 ? String(avgRisk) : "—"}
          label="avg risk"
          {...(avgRisk >= 85 ? { tone: "red" as const } : avgRisk >= 60 ? { tone: "orange" as const } : {})}
        />
      </div>
      <p className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
        <strong>Six lists · ten-year audit · four eyes.</strong> One bench. One queue. Every
        subject cross-checked against OFAC, UN, EU, UK, EOCN, and CA lists — bound to the
        ten-year audit trail.
      </p>
    </div>
  );
}

function HeroStat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "red" | "orange";
}) {
  const valueColor =
    tone === "red"
      ? "text-red"
      : tone === "orange"
        ? "text-orange"
        : "text-ink-0";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-mono text-20 font-semibold ${valueColor}`}>{value}</span>
      <span className="text-11 uppercase tracking-wide-4 text-ink-2 font-medium">{label}</span>
    </div>
  );
}
