import type { CaseFilter } from "@/lib/types";

// Static sidebar filter list. The actual case register is hydrated at
// runtime from web/lib/data/case-store.ts (localStorage-backed) so
// filings made in /str-cases or from the screening panel show up here.
// The `count` is overwritten in /cases/page.tsx with live counts.
export const CASE_FILTERS: CaseFilter[] = [
  { key: "all", label: "All cases", count: "00" },
  { key: "active", label: "Active investigation", count: "00" },
  { key: "awaiting", label: "Awaiting MLRO", count: "00" },
  { key: "escalated", label: "Escalated to FIU", count: "00" },
  { key: "closed-cleared", label: "Closed · cleared", count: "00" },
  { key: "closed-reported", label: "Closed · reported", count: "00" },
];
