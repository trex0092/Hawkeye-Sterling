import { WatchlistHealthBadges } from "@/components/screening/WatchlistHealthBadges";

interface ScreeningHeroProps {
  inQueue: number;
  critical: number;
  slaRisk: number;
  avgRisk: number;
}

export function ScreeningHero({ inQueue, critical, slaRisk, avgRisk }: ScreeningHeroProps) {
  return (
    <div className="mb-8">
      <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
        MODULE 02
      </div>
      <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
        BUREAU II · PRECISION BENCH
      </div>
      <h1 className="font-display font-normal text-28 md:text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        Experience the <em className="italic text-brand">standard.</em>
      </h1>

      {/* KPI bar */}
      <div className="flex gap-8 mt-3 pt-3 border-t border-hair-pink flex-wrap">
        <HeroStat value={String(inQueue)} label="in queue" />
        <HeroStat value={String(critical)} label="critical" tone="red" />
        <HeroStat value={String(slaRisk)} label="SLA risk" tone="orange" />
        <HeroStat
          value={inQueue > 0 ? String(avgRisk) : "—"}
          label="avg risk"
          {...(avgRisk >= 85 ? { tone: "red" as const } : avgRisk >= 60 ? { tone: "orange" as const } : {})}
        />
      </div>

      {/* Live watchlist source health — replaces the static marketing
          strip with a 60s-polling read of /api/status. Each list goes
          green/amber/red by freshness SLO so a stale feed surfaces on
          the dashboard instead of being papered over. */}
      <WatchlistHealthBadges />

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
        : "text-brand";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-mono text-20 font-semibold ${valueColor}`}>{value}</span>
      <span className="text-11 uppercase tracking-wide-4 text-ink-2 font-medium">{label}</span>
    </div>
  );
}

