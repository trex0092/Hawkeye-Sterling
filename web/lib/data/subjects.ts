import type { QueueFilter, Subject } from "@/lib/types";

export const QUEUE_FILTERS: QueueFilter[] = [
  { key: "all", label: "All open", count: "00" },
  { key: "critical", label: "Critical", count: "00" },
  { key: "sanctions", label: "Sanctions hits", count: "00" },
  { key: "edd", label: "EDD", count: "00" },
  { key: "pep", label: "PEP exposure", count: "00" },
  { key: "sla", label: "SLA breaching", count: "00" },
  { key: "a24", label: "A-24h approver", count: "00" },
  { key: "closed", label: "Closed today", count: "00" },
];

export const SUBJECTS: Subject[] = [];

export function toQuickScreenSubject(subject: Subject) {
  return {
    name: subject.name,
    ...(subject.aliases ? { aliases: subject.aliases } : {}),
    entityType: subject.entityType,
    jurisdiction: subject.jurisdiction,
  };
}
