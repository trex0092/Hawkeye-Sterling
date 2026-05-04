"use client";

import {
  SidebarFilterList,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/SidebarParts";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import type { CaseFilter, CaseFilterKey } from "@/lib/types";

interface CasesSidebarProps {
  filters: CaseFilter[];
  activeFilter: CaseFilterKey;
  onFilterChange: (key: CaseFilterKey) => void;
}

export function CasesSidebar({
  filters,
  activeFilter,
  onFilterChange,
}: CasesSidebarProps) {
  return (
    <SidebarShell>
      <SidebarSection title="Case status">
        <SidebarFilterList
          items={filters}
          activeKeys={[activeFilter]}
          onSelect={(key) => onFilterChange(key as CaseFilterKey)}
        />
      </SidebarSection>

<SidebarSection title="Evidence vault">
        <div className="text-12 text-ink-1 px-2">
          <div className="mb-2">
            <div className="font-medium text-ink-0">2,847 documents</div>
            <div className="text-11 text-ink-2 mt-0.5">Immutable chain</div>
          </div>
          <div>
            <div className="font-medium text-ink-0">10-year retention</div>
            <div className="text-11 text-ink-2 mt-0.5">FDL 10/2025 Art.24</div>
          </div>
        </div>
      </SidebarSection>
    </SidebarShell>
  );
}
