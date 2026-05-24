// Internal Audit Findings store — CBUAE §9 · IIA Standards
//
// Tracks audit findings, remediation plans, and MLRO sign-offs.
// Regulatory basis: CBUAE §9, IIA Standards, Board Audit Committee requirements.

import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface AuditFinding {
  id: string;               // "AUF-YYYYMMDD-xxxx"
  tenantId: string;
  title: string;
  auditorName: string;
  auditDate: string;        // ISO date
  severity: "critical" | "high" | "medium" | "low";
  finding: string;          // description of the finding
  regulation: string;       // e.g. "CBUAE §9.3", "FATF R.10"
  owner: string;            // staff member responsible for remediation
  dueDate: string;          // ISO date
  status: "open" | "in_progress" | "resolved" | "overdue";
  remediationPlan?: string;
  mlroSignOff?: boolean;
  mlroSignOffDate?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuditFindingCreateFields = Pick<
  AuditFinding,
  | "title"
  | "auditorName"
  | "auditDate"
  | "severity"
  | "finding"
  | "regulation"
  | "owner"
  | "dueDate"
> & {
  remediationPlan?: string;
};

export type AuditFindingPatch = Partial<
  Omit<AuditFinding, "id" | "tenantId" | "createdAt">
>;

const SEVERITY_ORDER: Record<AuditFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function auditFindingKey(tenantId: string, id: string): string {
  return `audit-findings/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function generateAuditFindingId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AUF-${yyyymmdd}-${suffix}`;
}

export async function createAuditFinding(
  tenantId: string,
  fields: AuditFindingCreateFields,
): Promise<AuditFinding> {
  const now = new Date();
  const id = generateAuditFindingId();

  const record: AuditFinding = {
    id,
    tenantId,
    title: fields.title,
    auditorName: fields.auditorName,
    auditDate: fields.auditDate,
    severity: fields.severity,
    finding: fields.finding,
    regulation: fields.regulation,
    owner: fields.owner,
    dueDate: fields.dueDate,
    status: "open",
    ...(fields.remediationPlan ? { remediationPlan: fields.remediationPlan } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await setJson(auditFindingKey(tenantId, id), record);
  return record;
}

export async function loadAuditFinding(
  tenantId: string,
  id: string,
): Promise<AuditFinding | null> {
  const record = await getJson<AuditFinding>(auditFindingKey(tenantId, id));
  if (!record) return null;
  const today = new Date().toISOString().slice(0, 10);
  if ((record.status === "open" || record.status === "in_progress") && record.dueDate < today) {
    return { ...record, status: "overdue" };
  }
  return record;
}

export async function loadAllAuditFindings(tenantId: string): Promise<AuditFinding[]> {
  const prefix = `audit-findings/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<AuditFinding>(key)),
  );

  const today = new Date().toISOString().slice(0, 10);

  const results = records
    .filter((r): r is AuditFinding => r !== null)
    .map((r) => {
      // Auto-set overdue when dueDate < today and status is open or in_progress
      if (
        (r.status === "open" || r.status === "in_progress") &&
        r.dueDate < today
      ) {
        return { ...r, status: "overdue" as const };
      }
      return r;
    });

  // Sort by severity then dueDate
  results.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return results;
}

export async function updateAuditFinding(
  tenantId: string,
  id: string,
  patch: AuditFindingPatch,
): Promise<AuditFinding> {
  const existing = await loadAuditFinding(tenantId, id);
  if (!existing) {
    throw new Error(`Audit finding not found: ${id}`);
  }

  const now = new Date();
  const updated: AuditFinding = { ...existing, ...patch, updatedAt: now.toISOString() };

  await setJson(auditFindingKey(tenantId, id), updated);
  return updated;
}
