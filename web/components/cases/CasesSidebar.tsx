"use client";

// Unified left-sidebar for the Cases module. Previously rendered a
// "Case status" filter list + an "Evidence vault" stats panel; the
// product direction now is that every section shows the same two-block
// sidebar (REGULATORY operator card + REPORT button) so the workspace
// chrome is identical across modules. The case-status filter is still
// available inline on the page above the table — only the sidebar copy
// of it was removed.
import {
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/SidebarParts";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import type { CaseFilter, CaseFilterKey } from "@/lib/types";

interface CasesSidebarProps {
  // Props kept on the public surface so the page does not need an edit;
  // they're inert here now. A future refactor can drop them once every
  // call site stops passing them.
  filters?: CaseFilter[];
  activeFilter?: CaseFilterKey;
  onFilterChange?: (_key: CaseFilterKey) => void;
}

export function CasesSidebar(_props: CasesSidebarProps) {
  return (
    <SidebarShell>
      <SidebarSection title="Regulatory">
        <SidebarMLROCard />
      </SidebarSection>

      <SidebarSection title="Report">
        <AsanaReportButton
          payload={{
            module: "cases",
            label: "Cases Dashboard",
            summary:
              "Case management report submitted from Hawkeye Sterling — active, escalated and reported STR/SAR cases reviewed.",
          }}
        />
      </SidebarSection>
    </SidebarShell>
  );
}
