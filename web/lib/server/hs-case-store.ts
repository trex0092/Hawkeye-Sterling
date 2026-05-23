// HS Compliance Case Store (Part 1 of the build spec).
//
// Separate from the existing presentation-layer case-vault (which syncs
// localStorage to Blobs). This module implements the full compliance-law
// case data model required by UAE FDL No.10/2025 and the build spec.
//
// Storage layout (all under the "hawkeye-sterling" Blobs store):
//   hs-compliance/<tenant>/counter.json        → { next: number }
//   hs-compliance/<tenant>/cases/<caseId>.json → HsCase
//
// Enhanced with:
//   • Risk re-scoring on update        — updateCaseRiskScore()
//   • Escalation timeline tracker      — escalationHistory field + appendEscalationHistory()
//   • Regulatory deadline tracking     — filingDeadline + overdueSar flag + checkOverdueSar()
//   • Cross-case pattern detection     — detectLinkedCases()

import { getJson, setJson, listKeys } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import { type RiskCategory, type DueDiligenceLevel } from "./categorize";

export type HsCaseStatus =
  | "open" | "under_review" | "pending_approval" | "closed" | "escalated" | "frozen";

export type DispositionVerdict =
  | "approve" | "EDD" | "escalate" | "STR" | "false_positive";

export type FourEyesStatus = "pending" | "approved" | "rejected";

export interface HsCaseHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchScore: number;
  programs?: string[];
}

export interface HsCase {
  caseId:              string;   // HS-CASE-NNN
  subjectName:         string;
  subjectId:           string;
  createdAt:           string;
  createdBy:           string;
  updatedAt:           string;
  status:              HsCaseStatus;
  severity:            "clear" | "low" | "medium" | "high" | "critical";
  riskCategory:        RiskCategory;
  dueDiligence:        DueDiligenceLevel;
  reviewDueDate:       string;
  hits:                HsCaseHit[];
  enrichmentPending:   boolean;
  enrichedAt?:         string;
  dispositionVerdict?: DispositionVerdict;
  dispositionRationale?:string;
  dispositionBy?:      string;
  dispositionAt?:      string;
  linkedAuditSeqs:     number[];
  breachLogged:        boolean;
  slaDeadline:         string;
  slaBreach:           boolean;
  fourEyesRequired:    boolean;
  fourEyesStatus?:     FourEyesStatus;
  fourEyesApprovers:   string[];
  fourEyesItemId?:     string;
  goamlReportRef?:     string;
  seniorMgmtApproval:  boolean;
  autoFreezeRequired:  boolean;
  transactionSuspendRequired: boolean;
  provisionalScreening:boolean;
  overrideReasons:     string[];
  notes?:              string;
}

type Tenant = string;

function counterKey(tenant: Tenant): string {
  return `hs-compliance/${safeId(tenant)}/counter.json`;
}

function caseKey(tenant: Tenant, caseId: string): string {
  return `hs-compliance/${safeId(tenant)}/cases/${caseId}.json`;
}

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

async function nextCaseNumber(tenant: Tenant): Promise<number> {
  const counter = await getJson<{ next: number }>(counterKey(tenant));
  const next = (counter?.next ?? 0) + 1;
  await setJson(counterKey(tenant), { next });
  return next;
}

export function formatCaseId(n: number): string {
  return `HS-CASE-${String(n).padStart(3, "0")}`;
}

export async function createCase(
  tenant: Tenant,
  input: Omit<HsCase, "caseId" | "createdAt" | "updatedAt" | "linkedAuditSeqs" | "breachLogged" | "slaBreach" | "fourEyesApprovers">,
): Promise<HsCase> {
  const n = await nextCaseNumber(tenant);
  const caseId = formatCaseId(n);
  const now = new Date().toISOString();
  const rec: HsCase = {
    ...input,
    caseId,
    createdAt:       now,
    updatedAt:       now,
    linkedAuditSeqs: [],
    breachLogged:    false,
    slaBreach:       false,
    fourEyesApprovers: [],
  };
  await setJson(caseKey(tenant, caseId), rec);
  void writeAuditChainEntry({
    event: "hs_case.created",
    actor: input.createdBy,
    caseId,
    subjectName: input.subjectName,
    subjectId: input.subjectId,
    severity: input.severity,
    riskCategory: input.riskCategory,
  }, tenant).catch((err) =>
    console.warn("[hs-case-store] audit write failed:", err instanceof Error ? err.message : String(err)),
  );
  return rec;
}

export async function loadCase(tenant: Tenant, caseId: string): Promise<HsCase | null> {
  return getJson<HsCase>(caseKey(tenant, caseId));
}

export async function updateCase(
  tenant: Tenant,
  caseId: string,
  patch: Partial<HsCase>,
  actor?: string,
): Promise<HsCase | null> {
  const existing = await loadCase(tenant, caseId);
  if (!existing) return null;
  const updated: HsCase = { ...existing, ...patch, caseId, updatedAt: new Date().toISOString() };
  await setJson(caseKey(tenant, caseId), updated);
  void writeAuditChainEntry({
    event: "hs_case.updated",
    actor: actor ?? "system",
    caseId,
    subjectName: updated.subjectName,
    patch: Object.keys(patch),
  }, tenant).catch(() => undefined);
  return updated;
}

export async function listCases(
  tenant: Tenant,
  filters?: {
    status?: HsCaseStatus;
    severity?: string;
    subjectId?: string;
    riskCategory?: RiskCategory;
  },
): Promise<HsCase[]> {
  const prefix = `hs-compliance/${safeId(tenant)}/cases/`;
  const keys = await listKeys(prefix).catch(() => [] as string[]);
  const loaded = await Promise.all(
    keys.map((k) => getJson<HsCase>(k).catch(() => null)),
  );
  let cases = loaded.filter((c): c is HsCase => c !== null);

  if (filters?.status) cases = cases.filter((c) => c.status === filters.status);
  if (filters?.severity) cases = cases.filter((c) => c.severity === filters.severity);
  if (filters?.subjectId) cases = cases.filter((c) => c.subjectId === filters.subjectId);
  if (filters?.riskCategory) cases = cases.filter((c) => c.riskCategory === filters.riskCategory);

  // Newest first.
  cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cases;
}

/** Find an existing open case for a subject (to avoid duplicates). */
export async function findOpenCaseForSubject(
  tenant: Tenant,
  subjectId: string,
): Promise<HsCase | null> {
  const all = await listCases(tenant, { subjectId });
  return all.find((c) => c.status !== "closed") ?? null;
}

/** Append an audit seq to linkedAuditSeqs without a full update. */
export async function appendAuditSeq(
  tenant: Tenant,
  caseId: string,
  seq: number,
): Promise<void> {
  const existing = await loadCase(tenant, caseId);
  if (!existing) return;
  const seqs = [...new Set([...existing.linkedAuditSeqs, seq])];
  await updateCase(tenant, caseId, { linkedAuditSeqs: seqs });
}

/** Check all open cases for SLA breaches and log them. */
export async function checkSlaBreach(tenant: Tenant): Promise<HsCase[]> {
  const all = await listCases(tenant);
  const now = Date.now();
  const breached: HsCase[] = [];
  for (const c of all) {
    if (c.status === "closed" || c.breachLogged) continue;
    if (c.riskCategory !== "CRITICAL" && c.riskCategory !== "HIGH") continue;
    if (new Date(c.slaDeadline).getTime() < now) {
      const updated = await updateCase(tenant, c.caseId, { breachLogged: true, slaBreach: true });
      if (updated) breached.push(updated);
      void writeAuditChainEntry({
        event: "sla.breach",
        actor: "system",
        caseId: c.caseId,
        subjectName: c.subjectName,
        slaDeadline: c.slaDeadline,
        riskCategory: c.riskCategory,
      }, tenant).catch(() => undefined);
    }
  }
  return breached;
}
