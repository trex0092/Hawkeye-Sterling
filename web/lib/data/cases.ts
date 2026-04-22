import type { CaseFilter, CaseRecord } from "@/lib/types";

export const CASE_FILTERS: CaseFilter[] = [
  { key: "all", label: "All cases", count: "00" },
  { key: "active", label: "Active investigation", count: "00" },
  { key: "awaiting", label: "Awaiting MLRO", count: "00" },
  { key: "escalated", label: "Escalated to FIU", count: "00" },
  { key: "closed-cleared", label: "Closed · cleared", count: "00" },
  { key: "closed-reported", label: "Closed · reported", count: "00" },
];

export const CASES: CaseRecord[] = [];
