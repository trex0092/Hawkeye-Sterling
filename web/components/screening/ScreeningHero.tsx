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

      {/* Coverage description */}
      <p className="max-w-[72ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-4 border-l-2 border-brand pl-3.5">
        <strong>
          Global sanctions · PEP databases · 20,000+ news sources · RCA.
        </strong>{" "}
        Every subject cross-referenced against all major international sanctions
        regimes, classified PEP databases with relatives &amp; close associates
        (RCA), and 20,000+ adverse-media sources across 50+ languages — bound
        to the ten-year FDL Art.24 audit trail.
      </p>

      {/* 4-pillar coverage strip */}
      <div className="grid grid-cols-4 gap-3 mt-5">
        <PillarCard
          label="Global sanctions"
          detail="OFAC · UN · EU · UK · EOCN + AU · CA · CH · JP · FATF · INTERPOL · WB · ADB"
          tone="violet"
        />
        <PillarCard
          label="PEP databases"
          detail="Tier 1–4 · Heads of state · Ministers · SOE directors · Judiciary"
          tone="blue"
        />
        <PillarCard
          label="Adverse media"
          detail="20,000+ sources · 50+ languages · Real-time RSS · Google News"
          tone="orange"
        />
        <PillarCard
          label="RCA"
          detail="Relatives &amp; close associates · Spouse · Siblings · Known intermediaries"
          tone="green"
        />
      </div>

      {/* 6-card feature grid */}
      <FeatureGrid />
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
  tone: "violet" | "blue" | "orange" | "green";
}) {
  const tones: Record<typeof tone, { border: string; label: string; dot: string }> = {
    violet: { border: "border-violet/30", label: "text-violet", dot: "bg-violet" },
    blue:   { border: "border-blue/30",   label: "text-blue",   dot: "bg-blue" },
    orange: { border: "border-orange/30", label: "text-orange", dot: "bg-orange" },
    green:  { border: "border-green/30",  label: "text-green",  dot: "bg-green" },
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

function FeatureGrid() {
  const cards = [
    {
      icon: <IconClock />,
      title: "Real-time, on-demand access",
      body: "Stop waiting for batch updates. Gain access to sanctions updates as they happen — meeting the demands of real-time payments and digital onboarding.",
    },
    {
      icon: <IconTarget />,
      title: "Unified data, tailored to your risk appetite",
      body: "Benefit from a single, consistent data model that includes sanctions, PEPs, and adverse media — enriched with metadata and filtered to align with your compliance framework.",
    },
    {
      icon: <IconGrid />,
      title: "High-quality, structured intelligence",
      body: "Our data is structured to enhance precision — with detailed classifications, granular fields, and provenance tagging — supporting automated workflows to help reduce false positives and accelerate decision making.",
    },
    {
      icon: <IconSearch />,
      title: "Smarter screening, fewer false positives",
      body: "Leverage deep filtering, enhanced categorisation, and structured risk taxonomy to reduce noise and sharpen focus on true risk indicators.",
    },
    {
      icon: <IconSync />,
      title: "Transparent change tracking",
      body: "A built-in record change summary highlights what's new — so you can react faster and keep your systems in sync, with confidence.",
    },
    {
      icon: <IconScalable />,
      title: "Scalable, future ready architecture",
      body: "Our API-first architecture evolves with your business, adapting to changing regulations like ISO 20022 and instant payments mandates. Built to grow with your risk landscape — so your compliance workflows never fall behind.",
    },
  ];

  return (
    <div className="mt-8 pt-6 border-t border-hair">
      <div className="grid grid-cols-3 gap-8">
        {cards.map((c) => (
          <FeatureCard key={c.title} icon={c.icon} title={c.title} body={c.body} />
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="text-brand">{icon}</div>
      <h3 className="m-0 text-14 font-semibold text-ink-0 leading-snug">{title}</h3>
      <p className="m-0 text-12.5 text-ink-2 leading-[1.65]">{body}</p>
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

/* ── SVG icons — matching the blue-outline style in the screenshot ── */

function IconClock() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="20" r="14" />
      <polyline points="20,10 20,20 26,24" />
      <path d="M30 8 A14 14 0 0 1 33 14" strokeDasharray="2 2" />
      <polyline points="30,6 30,9 33,9" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="14" width="12" height="12" rx="1" />
      <line x1="20" y1="8" x2="20" y2="13" />
      <line x1="20" y1="27" x2="20" y2="32" />
      <line x1="8"  y1="20" x2="13" y2="20" />
      <line x1="27" y1="20" x2="32" y2="20" />
      <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9"  y="9"  width="8" height="8" rx="1" />
      <rect x="23" y="9"  width="8" height="8" rx="1" />
      <rect x="9"  y="23" width="8" height="8" rx="1" />
      <rect x="23" y="23" width="8" height="8" rx="1" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="22" r="8" />
      <line x1="10" y1="28" x2="10" y2="32" />
      <line x1="10" y1="32" x2="15" y2="32" />
      <circle cx="28" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <path d="M22 14 Q25 10 28 14" />
      <line x1="28" y1="20" x2="28" y2="16" />
    </svg>
  );
}

function IconSync() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="18" r="6" />
      <line x1="10" y1="24" x2="22" y2="24" />
      <circle cx="28" cy="24" r="5" />
      <polyline points="23,22 28,18 33,22" />
    </svg>
  );
}

function IconScalable() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="20" r="6" />
      <line x1="20" y1="8"  x2="20" y2="14" />
      <line x1="20" y1="26" x2="20" y2="32" />
      <line x1="8"  y1="20" x2="14" y2="20" />
      <line x1="26" y1="20" x2="32" y2="20" />
      <line x1="11" y1="11" x2="15" y2="15" />
      <line x1="25" y1="25" x2="29" y2="29" />
      <line x1="29" y1="11" x2="25" y2="15" />
      <line x1="15" y1="25" x2="11" y2="29" />
    </svg>
  );
}
