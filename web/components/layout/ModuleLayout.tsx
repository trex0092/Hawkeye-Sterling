"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Header } from "./Header";
import { ActivityFeed } from "@/components/screening/ActivityFeed";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import {
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
  type SidebarFilterItem,
} from "./SidebarParts";

// Detect `?embed=1` so a page rendered inside an iframe (e.g. the Intel-Feed
// inline preview panel) drops the Header, sidebar, regulatory ticker, and
// right-rail activity feed. Without this every iframe nested the entire app
// inside the panel, producing a duplicate header + sidebar + ticker.
function useIsEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setEmbedded(params.get("embed") === "1");
  }, []);
  return embedded;
}

// Unified module shell — Header + left sidebar (operator card / optional
// queue filters) + main content. Mirrors the /screening layout pattern
// across every module in the app so the tool has one consistent look.

interface ModuleLayoutProps<K extends string = string> {
  children: ReactNode;
  filters?: SidebarFilterItem<K>[] | undefined;
  activeFilter?: K | undefined;
  onFilterChange?: ((_key: K) => void) | undefined;
  filtersTitle?: string | undefined;
  sidebarExtra?: ReactNode | undefined;
  // Asana-style sidebar actions. Pass the module's primary action buttons
  // (e.g. "+ Add transaction", "▶ Run Due", "Run daily scan") and they
  // render in a dedicated "Actions" section in the left sidebar instead
  // of crowding the page header. Vertical stack inside the sidebar so
  // each button is one tap target — matches Asana's "+ Add task" / quick
  // actions placement.
  sidebarActions?: ReactNode | undefined;
  detailPanel?: ReactNode | undefined;
  // Label shown on the live engine feed. Defaults to "Compliance engine".
  engineLabel?: string | undefined;
  // Pass a module key to show a "Report to Asana" button in the sidebar.
  // Key must match the switch in /api/module-report for correct project routing.
  asanaModule?: string | undefined;
  asanaLabel?: string | undefined;
}

export function ModuleLayout<K extends string = string>({
  children,
  // ModuleLayout used to render a sidebar filter list; that responsibility
  // moved to Sidebar.tsx + SidebarFilterList. The props remain in the
  // interface so call sites don't break, but are not consumed here yet.
  // Prefix with _ to satisfy no-unused-vars without removing public API.
  filters: _filters,
  activeFilter: _activeFilter,
  onFilterChange: _onFilterChange,
  filtersTitle: _filtersTitle = "Queue filters",
  sidebarExtra,
  sidebarActions,
  detailPanel,
  engineLabel = "Compliance engine",
  asanaModule,
  asanaLabel,
}: ModuleLayoutProps<K>) {
  const embedded = useIsEmbedded();
  if (embedded) {
    return (
      <main className="px-4 py-4 md:px-8 md:py-6">
        {children}
      </main>
    );
  }
  return (
    <>
      <Header />
      <div className="grid min-h-[calc(100vh-84px)] print:block grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_1fr_360px] border-t-2 border-brand-line">
        <div className="hidden md:block">
          <SidebarShell>
            <SidebarSection title="Regulatory">
              <SidebarMLROCard />
            </SidebarSection>

            {sidebarActions && (
              <SidebarSection title="Actions">
                <div className="flex flex-col gap-2 px-2">{sidebarActions}</div>
              </SidebarSection>
            )}

            {sidebarExtra}

            {asanaModule && (
              <SidebarSection title="Report">
                <AsanaReportButton
                  payload={{
                    module: asanaModule,
                    label: asanaLabel ?? asanaModule,
                    summary: `Module report submitted from Hawkeye Sterling dashboard — ${asanaLabel ?? asanaModule}.`,
                  }}
                />
              </SidebarSection>
            )}
          </SidebarShell>
        </div>

        <main className="px-4 py-4 md:px-10 md:py-8 overflow-y-auto">
          {children}
        </main>

        <div className="hidden lg:block">
          {detailPanel ?? (
            <aside className="border-l border-hair-2 overflow-y-auto px-5 py-6 print:hidden">
              <ActivityFeed label={engineLabel} />
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

// Reusable module hero — eyebrow line + display title + optional KPI bar
// + optional intro paragraph. Same shape as ScreeningHero but usable by
// any module.
interface ModuleHeroProps {
  eyebrow: string;
  title: string;
  titleEm?: string | undefined; // italic trailing word (e.g. "trail.", "standard.")
  kpis?:
    | Array<{
        value: string;
        label: string;
        tone?: "red" | "orange" | "amber" | undefined;
      }>
    | undefined;
  intro?: ReactNode | undefined;
}

export function ModuleHero({
  eyebrow,
  title,
  titleEm,
  kpis,
  intro,
}: ModuleHeroProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
        {eyebrow}
      </div>
      <h1 className="font-display font-normal text-28 md:text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        {title}
        {titleEm && (
          <>
            {" "}
            <em className="italic text-brand">{titleEm}</em>
          </>
        )}
      </h1>
      {kpis && kpis.length > 0 && (
        <div className="flex gap-8 mt-3 pt-3 border-t border-hair-pink flex-wrap">
          {kpis.map((k) => (
            <HeroStat
              key={k.label}
              value={k.value}
              label={k.label}
              {...(k.tone ? { tone: k.tone } : {})}
            />
          ))}
        </div>
      )}
      {intro && (
        <div className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] mt-3 border-l-2 border-brand pl-3.5">
          {intro}
        </div>
      )}
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
  tone?: "red" | "orange" | "amber";
}) {
  const valueColor =
    tone === "red"
      ? "text-red"
      : tone === "orange"
        ? "text-orange"
        : tone === "amber"
          ? "text-amber"
          : "text-brand";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-mono text-20 font-semibold ${valueColor}`}>
        {value}
      </span>
      <span className="text-11 uppercase tracking-wide-4 text-ink-2 font-medium">
        {label}
      </span>
    </div>
  );
}
