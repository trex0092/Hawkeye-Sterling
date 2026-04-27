"use client";

import {
  SidebarFilterList,
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
} from "./SidebarParts";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import type { FilterKey, QueueFilter } from "@/lib/types";

interface SidebarProps {
  filters: QueueFilter[];
  activeFilter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
}

export function Sidebar({ filters, activeFilter, onFilterChange }: SidebarProps) {
  return (
    <SidebarShell>
      <SidebarSection title="Regulatory">
        <SidebarMLROCard />
      </SidebarSection>

      <SidebarSection title="Report">
        <AsanaReportButton
          payload={{
            module: "screening",
            label: "Screening",
            summary: "Module report submitted from Hawkeye Sterling dashboard — Screening.",
          }}
        />
      </SidebarSection>

      <SidebarSection title="Queue filters">
        <SidebarFilterList
          items={filters}
          activeKey={activeFilter}
          onSelect={onFilterChange}
        />
      </SidebarSection>
    </SidebarShell>
  );
}
