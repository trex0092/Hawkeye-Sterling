"use client";

// Unified left-sidebar for the Workbench module. Previously rendered
// "Pipeline" + "Faculties" sections; the product direction is now that
// every section shows the same two-block sidebar (REGULATORY operator
// card + REPORT button) so the workspace chrome is identical across
// modules. Faculty filtering is still available inline on the page.
import {
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
} from "@/components/layout/SidebarParts";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import type { FacultyFilter, FacultyFilterKey } from "@/lib/types";

interface WorkbenchSidebarProps {
  // Inert here now; preserved on the public surface so the page does
  // not need an edit. A future refactor can drop them.
  filters?: FacultyFilter[];
  activeFilter?: FacultyFilterKey;
  onFilterChange?: (_key: FacultyFilterKey) => void;
}

export function WorkbenchSidebar(_props: WorkbenchSidebarProps) {
  return (
    <SidebarShell>
      <SidebarSection title="Regulatory">
        <SidebarMLROCard />
      </SidebarSection>

      <SidebarSection title="Report">
        <AsanaReportButton
          payload={{
            module: "workbench",
            label: "Brain Workbench",
            summary:
              "Workbench report submitted from Hawkeye Sterling — multi-perspective reasoning chain and faculty coverage snapshot.",
          }}
        />
      </SidebarSection>
    </SidebarShell>
  );
}
