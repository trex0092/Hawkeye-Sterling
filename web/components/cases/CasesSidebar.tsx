"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import type { CaseFilter, CaseFilterKey } from "@/lib/types";

interface CasesSidebarProps {
  filters?: CaseFilter[];
  activeFilter?: CaseFilterKey;
  onFilterChange?: (_key: CaseFilterKey) => void;
}

export function CasesSidebar(_props: CasesSidebarProps) {
  return <Sidebar />;
}
