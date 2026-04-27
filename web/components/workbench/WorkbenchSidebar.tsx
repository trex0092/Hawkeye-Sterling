"use client";

import {
  SidebarFilterList,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/SidebarParts";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import type { FacultyFilter, FacultyFilterKey } from "@/lib/types";

interface WorkbenchSidebarProps {
  filters: FacultyFilter[];
  activeFilter: FacultyFilterKey;
  onFilterChange: (key: FacultyFilterKey) => void;
}

export function WorkbenchSidebar({
  filters,
  activeFilter,
  onFilterChange,
}: WorkbenchSidebarProps) {
  return (
    <SidebarShell>
      <SidebarSection title="Report">
        <AsanaReportButton
          payload={{
            module: "workbench",
            label: "MLRO Workbench",
            summary: "Module report submitted from Hawkeye Sterling dashboard — MLRO Workbench.",
          }}
        />
      </SidebarSection>

      <SidebarSection title="Pipeline">
        <div className="text-12 text-ink-1 px-2">
          <div className="mb-3">
            <div className="font-medium text-ink-0 mb-1">Multi-perspective</div>
            <div className="text-11 text-ink-2">Sonnet executor → Opus advisor</div>
          </div>
          <div className="mb-3">
            <div className="font-medium text-ink-0 mb-1">Charter coverage</div>
            <div className="text-11 text-ink-2">P1–P10 · Immutable</div>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="Faculties">
        <SidebarFilterList
          items={filters}
          activeKey={activeFilter}
          onSelect={onFilterChange}
        />
      </SidebarSection>
    </SidebarShell>
  );
}
