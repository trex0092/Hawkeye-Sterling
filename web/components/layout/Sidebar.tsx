"use client";

import {
  SidebarFilterList,
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
} from "./SidebarParts";
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

      <SidebarSection title="Shift">
        <div className="text-12 text-ink-1 px-2">09:00–18:00</div>
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
