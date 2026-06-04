"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { HubContextProvider } from "@/components/intelligence-hub/HubContext";

// ── Tab configuration ────────────────────────────────────────────────────────

const TAB_IDS = [
  "workbench",
  "telemetry",
  "red-team",
  "security-audit",
  "governance",
  "status",
  "api-docs",
  "system-card",
  "security-scan",
  "analyst-behavior",
  "board-dashboard",
  "kri-dashboard",
] as const;

type TabId = (typeof TAB_IDS)[number];

const TAB_CONFIG: Record<TabId, { label: string; icon: string; hint: string }> = {
  workbench:       { label: "Workbench",     icon: "🔧", hint: "Multi-mode AI · super-brain · manifest" },
  telemetry:       { label: "Telemetry",     icon: "📡", hint: "Mode firing counts · drift" },
  "red-team":      { label: "Red-Team",      icon: "🥷", hint: "Adversarial prompt catalogue" },
  "security-audit":{ label: "Security",      icon: "🛡️", hint: "AI code analyser · OWASP checklist" },
  governance:      { label: "Governance",    icon: "⚖️",  hint: "NIST AI RMF · MITRE ATLAS · FDL 10/2025 Art.18" },
  status:          { label: "Status",        icon: "💚", hint: "Live endpoint & watchlist health" },
  "api-docs":      { label: "API Docs",      icon: "📘", hint: "OpenAPI reference" },
  "system-card":     { label: "System Card",      icon: "📋", hint: "Model/system card disclosure" },
  "security-scan":   { label: "Security Scan",    icon: "🛡️", hint: "Dependency & code security scan" },
  "analyst-behavior":{ label: "Analyst Behavior", icon: "👁️", hint: "Analyst activity & behaviour monitoring" },
  "board-dashboard": { label: "Board Dashboard",  icon: "🎯", hint: "Single-screen board & committee view" },
  "kri-dashboard":   { label: "KRI Dashboard",    icon: "📊", hint: "Key risk indicators dashboard" },
};

// Map embedded-tool tabs to their standalone page routes. Each renders the
// tool's own page (via ?embed=1) so its features and engine are untouched.
const EMBED_ROUTES: Partial<Record<TabId, string>> = {
  "system-card": "/system-card",
  "security-scan": "/security-scan",
  "analyst-behavior": "/analyst-behavior",
  "board-dashboard": "/board-dashboard",
  "kri-dashboard": "/kri-dashboard",
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

// ── Tab strip ────────────────────────────────────────────────────────────────

function TabStrip({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (_t: TabId) => void }) {
  return (
    <div
      className="flex flex-wrap gap-1 mb-6 pb-1"
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

// Renders a standalone tool's own page inside the hub via ?embed=1, so the
// tool's features/engine run unchanged — we only host it in a tab.
function EmbeddedTool({ src, label }: { src: string; label: string }) {
  const url = `${src}${src.includes("?") ? "&" : "?"}embed=1`;
  return (
    <div className="border border-hair-2 rounded-xl overflow-hidden">
      <iframe
        key={url}
        src={url}
        title={label}
        className="w-full border-0 bg-bg-0"
        style={{ minHeight: 760, display: "block" }}
        loading="lazy"
      />
    </div>
  );
}

function ActiveSection({ tab }: { tab: TabId }) {
  const embedSrc = EMBED_ROUTES[tab];
  if (embedSrc) return <EmbeddedTool src={embedSrc} label={TAB_CONFIG[tab].label} />;
  switch (tab) {
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
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : "workbench";
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
