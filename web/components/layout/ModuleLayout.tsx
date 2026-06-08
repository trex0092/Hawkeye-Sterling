"use client";

import { type ReactNode, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import {
  SidebarSection,
  type SidebarFilterItem,
} from "./SidebarParts";

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
  // Hide the right-hand activity/engine feed column entirely (reclaims its
  // width). Used by pages that are themselves a live feed (e.g. /intel).
  hideDetailPanel?: boolean | undefined;
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
  // The right-hand "Compliance engine" activity feed was removed from every
  // module page — it now lives only in the Screening section. These props are
  // kept in the public interface so the 30+ call sites don't break, but are no
  // longer consumed here.
  detailPanel: _detailPanel,
  hideDetailPanel: _hideDetailPanel = false,
  engineLabel: _engineLabel = "Compliance engine",
  asanaModule,
  asanaLabel,
}: ModuleLayoutProps<K>) {
  const searchParams = useSearchParams();
  const embedded = searchParams?.get("embed") === "1";
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
      <div className="grid min-h-[calc(100vh-84px)] print:block grid-cols-1 md:grid-cols-[220px_1fr] border-t-2 border-brand-line">
        <div className="hidden md:block">
          <Sidebar>
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
          </Sidebar>
        </div>

        <main className="px-4 py-4 md:px-10 md:py-8 overflow-y-auto">
          {children}
        </main>
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

function ModuleHeroInner({
  eyebrow: _eyebrow,
  title,
  titleEm,
  // kpis intentionally ignored — the hero KPI tile bar was removed across
  // all modules. The prop is kept on ModuleHeroProps so call sites still
  // compile (and keep their derived metrics) without needing edits.
  intro: _intro,
}: ModuleHeroProps) {
  // When a module page is rendered embedded inside another view (e.g. the
  // Intelligence Hub iframe tabs, ?embed=1), its own page hero is redundant
  // with the host's hero — suppress it so there is no doubled header.
  const searchParams = useSearchParams();
  if (searchParams?.get("embed") === "1") return null;
  return (
    <div className="mb-8">
      <h1 className="font-display font-normal text-28 md:text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        {title}
        {titleEm && (
          <>
            {" "}
            <em className="italic text-brand">{titleEm}</em>
          </>
        )}
      </h1>
    </div>
  );
}

export function ModuleHero(props: ModuleHeroProps) {
  return (
    <Suspense fallback={null}>
      <ModuleHeroInner {...props} />
    </Suspense>
  );
}
