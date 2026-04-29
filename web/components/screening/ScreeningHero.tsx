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

      {/* KPI bar */}
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

      {/* 5-pillar coverage strip */}
      <div className="grid grid-cols-5 gap-3 mt-5">
        <PillarCard
          label="Global sanctions"
          detail="OFAC · UN · EU · UK · EOCN + AU · CA · CH · JP · FATF · INTERPOL · WB · ADB · MDB debarment · 50+ official lists"
          tone="violet"
        />
        <PillarCard
          label="PEP databases"
          detail="Tier 1–4 · Heads of state · Ministers · SOE directors · Judiciary · 15+ PEP registries"
          tone="blue"
        />
        <PillarCard
          label="Adverse media"
          detail="38 global outlets · 50+ languages · Real-time RSS · Pandora / Panama / FinCEN files · Investigative leaks"
          tone="orange"
        />
        <PillarCard
          label="RCA"
          detail="Relatives &amp; close associates · Spouse · Siblings · Nominees · Known intermediaries · Beneficial owners"
          tone="green"
        />
        <PillarCard
          label="257 verified sources"
          detail="Commercial AML · Crypto analytics · Trade &amp; maritime · Regulatory enforcement · Open-source civil society"
          tone="amber"
        />
      </div>

    </div>
  );
}

function PillarCard({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: string;
  tone: "violet" | "blue" | "orange" | "green" | "amber";
}) {
  const tones: Record<typeof tone, { border: string; label: string; dot: string }> = {
    violet: { border: "border-violet/30", label: "text-violet", dot: "bg-violet" },
    blue:   { border: "border-blue/30",   label: "text-blue",   dot: "bg-blue" },
    orange: { border: "border-orange/30", label: "text-orange", dot: "bg-orange" },
    green:  { border: "border-green/30",  label: "text-green",  dot: "bg-green" },
    amber:  { border: "border-amber/30",  label: "text-amber",  dot: "bg-amber" },
  };
  const t = tones[tone];
  return (
    <div className={`border ${t.border} rounded-lg p-3 bg-bg-panel`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
        <span className={`text-11 font-semibold uppercase tracking-wide-3 ${t.label}`}>
          {label}
        </span>
      </div>
      <p className="text-10.5 text-ink-2 leading-snug m-0">{detail}</p>
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

