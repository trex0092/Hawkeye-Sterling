"use client";

import type { ReactNode } from "react";
import { Header } from "./Header";
import { ActivityFeed } from "@/components/screening/ActivityFeed";
import {
  SidebarFilterList,
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
  type SidebarFilterItem,
} from "./SidebarParts";

// Unified module shell — Header + left sidebar (MLRO / Shift / optional
// queue filters) + main content. Mirrors the /screening layout pattern
// across every module in the app so the tool has one consistent look.

interface ModuleLayoutProps<K extends string = string> {
  children: ReactNode;
  filters?: SidebarFilterItem<K>[] | undefined;
  activeFilter?: K | undefined;
  onFilterChange?: ((key: K) => void) | undefined;
  filtersTitle?: string | undefined;
  sidebarExtra?: ReactNode | undefined;
  detailPanel?: ReactNode | undefined;
  shift?: string | undefined;
  // Label shown on the live engine feed. Defaults to "Compliance engine".
  engineLabel?: string | undefined;
}

export function ModuleLayout<K extends string = string>({
  children,
  filters,
  activeFilter,
  onFilterChange,
  filtersTitle = "Queue filters",
  sidebarExtra,
  detailPanel,
  shift = "09:00–18:00",
  engineLabel = "Compliance engine",
}: ModuleLayoutProps<K>) {
  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-84px)] print:block"
        style={{ gridTemplateColumns: "220px 1fr 360px" }}
      >
        <SidebarShell>
          <SidebarSection title="Regulatory">
            <SidebarMLROCard />
          </SidebarSection>

          <SidebarSection title="Shift">
            <div className="text-12 text-ink-1 px-2">{shift}</div>
          </SidebarSection>

          {filters && activeFilter !== undefined && onFilterChange && (
            <SidebarSection title={filtersTitle}>
              <SidebarFilterList
                items={filters}
                activeKey={activeFilter}
                onSelect={onFilterChange}
              />
            </SidebarSection>
          )}

          {sidebarExtra}
        </SidebarShell>

        <main className="px-10 py-8 overflow-y-auto">
          {children}
        </main>

        {detailPanel ?? (
          <aside className="border-l border-hair-2 overflow-y-auto px-5 py-6 print:hidden">
            <ActivityFeed label={engineLabel} />
          </aside>
        )}
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
      <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
        {eyebrow}
      </div>
      <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
        {title}
        {titleEm && (
          <>
            {" "}
            <em className="italic text-brand">{titleEm}</em>
          </>
        )}
      </h1>
      {kpis && kpis.length > 0 && (
        <div className="flex gap-8 mt-3 pt-3 border-t border-hair flex-wrap">
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
          : "text-ink-0";
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
