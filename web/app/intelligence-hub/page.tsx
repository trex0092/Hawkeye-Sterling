"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { HubContextProvider, useHubContext } from "@/components/intelligence-hub/HubContext";

// ── Tab configuration ────────────────────────────────────────────────────────

const TAB_IDS = [
  "analytics",
  "brain",
  "workbench",
  "telemetry",
  "red-team",
  "security-audit",
  "governance",
  "status",
  "api-docs",
] as const;

type TabId = (typeof TAB_IDS)[number];

const TAB_CONFIG: Record<TabId, { label: string; icon: string; hint: string }> = {
  analytics:       { label: "Analytics",     icon: "📈", hint: "MLRO digest · bias · risk forecast" },
  brain:           { label: "Brain Intel",   icon: "🧠", hint: "XAI · forecast · heatmap · responsible AI" },
  workbench:       { label: "Workbench",     icon: "🔧", hint: "Multi-mode AI · super-brain · manifest" },
  telemetry:       { label: "Telemetry",     icon: "📡", hint: "Mode firing counts · drift" },
  "red-team":      { label: "Red-Team",      icon: "🥷", hint: "Adversarial prompt catalogue" },
  "security-audit":{ label: "Security",      icon: "🛡️", hint: "AI code analyser · OWASP checklist" },
  governance:      { label: "Governance",    icon: "⚖️",  hint: "NIST AI RMF · MITRE ATLAS · FDL 10/2025 Art.18" },
  status:          { label: "Status",        icon: "💚", hint: "Live endpoint & watchlist health" },
  "api-docs":      { label: "API Docs",      icon: "📘", hint: "OpenAPI reference" },
};

function isValidTab(s: string | null): s is TabId {
  return TAB_IDS.includes(s as TabId);
}

// ── Lazy-loaded section components ───────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse pt-2">
      <div className="h-36 bg-bg-1 rounded-xl" />
      <div className="h-24 bg-bg-1 rounded-xl" />
      <div className="h-52 bg-bg-1 rounded-xl" />
    </div>
  );
}

const AnalyticsSection = dynamic(
  () => import("@/components/intelligence-hub/AnalyticsSection").then((m) => ({ default: m.AnalyticsSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const BrainIntelSection = dynamic(
  () => import("@/components/intelligence-hub/BrainIntelSection").then((m) => ({ default: m.BrainIntelSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const WorkbenchSection = dynamic(
  () => import("@/components/intelligence-hub/WorkbenchSection").then((m) => ({ default: m.WorkbenchSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const TelemetrySection = dynamic(
  () => import("@/components/intelligence-hub/TelemetrySection").then((m) => ({ default: m.TelemetrySection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const RedTeamSection = dynamic(
  () => import("@/components/intelligence-hub/RedTeamSection").then((m) => ({ default: m.RedTeamSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const SecurityAuditSection = dynamic(
  () => import("@/components/intelligence-hub/SecurityAuditSection").then((m) => ({ default: m.SecurityAuditSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const GovernanceSection = dynamic(
  () => import("@/components/intelligence-hub/GovernanceSection").then((m) => ({ default: m.GovernanceSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const StatusSection = dynamic(
  () => import("@/components/intelligence-hub/StatusSection").then((m) => ({ default: m.StatusSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

const ApiDocsSection = dynamic(
  () => import("@/components/intelligence-hub/ApiDocsSection").then((m) => ({ default: m.ApiDocsSection })),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

// ── Unified health bar ───────────────────────────────────────────────────────

function UnifiedHealthBar() {
  const { signals } = useHubContext();

  const pills: Array<{ label: string; value: string | undefined; tone: "green" | "amber" | "red" | "default" }> = [
    {
      label: "FP rate",
      value: signals.fpRate !== undefined ? `${signals.fpRate.toFixed(1)}%` : undefined,
      tone:
        signals.fpRate === undefined ? "default"
        : signals.fpRate > 3 ? "red"
        : signals.fpRate > 1 ? "amber"
        : "green",
    },
    {
      label: "Red-team pass",
      value: signals.redTeamPassPct !== undefined ? `${signals.redTeamPassPct}%` : undefined,
      tone:
        signals.redTeamPassPct === undefined ? "default"
        : signals.redTeamPassPct < 95 ? "amber"
        : "green",
    },
    {
      label: "Endpoint",
      value: signals.endpointHealth,
      tone:
        signals.endpointHealth === "operational" ? "green"
        : signals.endpointHealth === "degraded" ? "amber"
        : signals.endpointHealth === "down" ? "red"
        : "default",
    },
    {
      label: "Brain drift",
      value: signals.driftedModes !== undefined ? String(signals.driftedModes) : undefined,
      tone:
        signals.driftedModes === undefined ? "default"
        : signals.driftedModes > 0 ? "amber"
        : "green",
    },
  ];

  const toneClasses: Record<string, string> = {
    green:   "bg-green-dim text-green border-green/30",
    amber:   "bg-amber-dim text-amber border-amber/30",
    red:     "bg-red-dim text-red border-red/30",
    default: "bg-bg-1 text-ink-3 border-hair-2",
  };

  const hasAnySignal = pills.some((p) => p.value !== undefined);

  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-3 font-mono">
        Cross-section health
      </span>
      {pills.map((p) => (
        <span
          key={p.label}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-11 font-mono font-semibold ${toneClasses[p.tone]}`}
          title={`${p.label}: ${p.value ?? "visit tab to load"}`}
        >
          <span className="text-10 font-normal opacity-70">{p.label}</span>
          {p.value !== undefined ? (
            <span>{p.value}</span>
          ) : (
            <span className="opacity-40 text-10">—</span>
          )}
        </span>
      ))}
      {!hasAnySignal && (
        <span className="text-11 text-ink-3 font-mono">Visit tabs to populate signals</span>
      )}
    </div>
  );
}

// ── Tab strip ────────────────────────────────────────────────────────────────

function TabStrip({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (_t: TabId) => void }) {
  return (
    <div
      className="flex gap-1 mb-6 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Intelligence Hub sections"
    >
      {TAB_IDS.map((id) => {
        const cfg = TAB_CONFIG[id];
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onTabChange(id)}
            title={cfg.hint}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-12 font-semibold transition-colors whitespace-nowrap shrink-0 border ${
              isActive
                ? "bg-brand text-white border-brand"
                : "text-ink-1 border-hair-2 bg-bg-panel hover:bg-bg-1 hover:text-ink-0"
            }`}
          >
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Active section renderer ──────────────────────────────────────────────────

function ActiveSection({ tab }: { tab: TabId }) {
  switch (tab) {
    case "analytics":       return <AnalyticsSection />;
    case "brain":           return <BrainIntelSection />;
    case "workbench":       return <WorkbenchSection />;
    case "telemetry":       return <TelemetrySection />;
    case "red-team":        return <RedTeamSection />;
    case "security-audit":  return <SecurityAuditSection />;
    case "governance":      return <GovernanceSection />;
    case "status":          return <StatusSection />;
    case "api-docs":        return <ApiDocsSection />;
    default:                return null;
  }
}

// ── Section error boundary ───────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }

class SectionErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error("[SectionErrorBoundary]", err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-28">⚠️</span>
          <p className="text-14 font-semibold text-ink-0">Section failed to load</p>
          <p className="text-12 text-ink-3 max-w-[44ch]">{this.state.message || "An unexpected error occurred."}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: "" })}
            className="px-4 py-2 rounded border border-brand text-brand text-12 font-semibold hover:bg-brand/10 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Hub inner (uses useSearchParams, must be in Suspense on server routes) ──

function HubInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams?.get("tab") ?? null;
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : "analytics";
  const embedded = searchParams?.get("embed") === "1";

  const handleTabChange = (tab: TabId) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tab);
    router.replace(`/intelligence-hub?${params.toString()}`, { scroll: false });
  };

  if (embedded) {
    return (
      <ModuleLayout asanaModule="intelligence-hub" asanaLabel="Intelligence Hub">
        <SectionErrorBoundary>
          <ActiveSection tab={activeTab} />
        </SectionErrorBoundary>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout asanaModule="intelligence-hub" asanaLabel="Intelligence Hub">
      {/* Page header */}
      <div className="mb-6 border-b-2 border-ink-0 pb-4">
        <div className="flex items-center gap-1.5 text-10.5 font-semibold uppercase tracking-wide-4 text-brand mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
          Intelligence Hub · 9 modules unified
        </div>
        <h1 className="font-display text-36 text-ink-0 m-0 leading-tight">
          Intelligence <em className="italic text-brand">command centre.</em>
        </h1>
        <p className="text-13 text-ink-2 mt-1 max-w-[70ch]">
          Analytics · Brain XAI · AI Workbench · Mode Telemetry · Red-Team · Security · Governance · Status · API Docs — unified in one view with cross-section health monitoring.
        </p>
      </div>

      <UnifiedHealthBar />
      <TabStrip activeTab={activeTab} onTabChange={handleTabChange} />

      <div role="tabpanel" aria-label={TAB_CONFIG[activeTab].label}>
        <SectionErrorBoundary>
          <ActiveSection tab={activeTab} />
        </SectionErrorBoundary>
      </div>
    </ModuleLayout>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function IntelligenceHubPage() {
  return (
    <HubContextProvider>
      <Suspense fallback={<div className="p-8 text-ink-2 text-13">Loading…</div>}>
        <HubInner />
      </Suspense>
    </HubContextProvider>
  );
}
