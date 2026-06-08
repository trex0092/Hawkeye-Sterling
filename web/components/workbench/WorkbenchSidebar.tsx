"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import type { FacultyFilter, FacultyFilterKey } from "@/lib/types";

interface WorkbenchSidebarProps {
  filters?: FacultyFilter[];
  activeFilter?: FacultyFilterKey;
  onFilterChange?: (_key: FacultyFilterKey) => void;
}

export function WorkbenchSidebar(_props: WorkbenchSidebarProps) {
  return <Sidebar />;
}
