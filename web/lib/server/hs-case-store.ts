// HS Compliance Case Store (Part 1 of the build spec).
//
// Separate from the existing presentation-layer case-vault (which syncs
// localStorage to Blobs). This module implements the full compliance-law
// case data model required by Federal Decree-Law No. 10 of 2025 and the build spec.
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
  | "open" | "under_review" | "pending_approval" | "closed" | "escalated" | "frozen" | "mlro_review" | "filed_str";

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

// ── Escalation timeline tracker ──────────────────────────────────────────────
// One entry per status transition; appended by appendEscalationHistory().
export interface EscalationHistoryEntry {
  timestamp:  string;        // ISO-8601
  fromStatus: HsCaseStatus;
  toStatus:   HsCaseStatus;
  byUserId:   string;
  reason:     string;
}

// ── Cross-case pattern detection ─────────────────────────────────────────────
// Result of detectLinkedCases(); matchedField identifies which attribute linked them.
export type LinkedCaseMatchField =
  | "subjectName" | "accountNumber" | "counterparty" | "ipAddress";

export interface LinkedCaseMatch {
  caseId:       string;
  matchedField: LinkedCaseMatchField;
  matchValue:   string;
}

// ── Composite risk score inputs ───────────────────────────────────────────────
// Populated by callers when evidence is available; updateCaseRiskScore() reads them.
export interface CaseRiskFactors {
  sanctionsHitCount:   number;   // number of hard-hit sanctions matches
  isPep:               boolean;
  adverseMediaCount:   number;   // count of adverse media articles / signals
  redlineViolations:   number;   // count of triggered redline rules
  jurisdictionRisk:    number;   // 0–100 score derived from counterparty country tier
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

  // ── Risk re-scoring ───────────────────────────────────────────────────────
  // compositeRiskScore: 0–100 weighted score; updated by updateCaseRiskScore().
  compositeRiskScore?: number;
  riskFactors?:        CaseRiskFactors;

  // ── Escalation timeline (b) ───────────────────────────────────────────────
  escalationHistory:   EscalationHistoryEntry[];

  // ── Regulatory deadline tracking (c) ─────────────────────────────────────
  // UAE Federal Decree-Law No. 10 of 2025 Art.17: STR must be filed within 48 h of suspicion formation.
  // filingDeadline is set when status transitions to "escalated".
  // overdueSar is set true when the case remains "escalated" for >36 h without
  // advancing to "filed_str".
  filingDeadline?:     string;   // ISO-8601 timestamp (createdAt_of_escalation + 48 h)
  overdueSar?:         boolean;

  // ── Cross-case identifiers (d) ────────────────────────────────────────────
  // Optional structured identifiers used by detectLinkedCases().
  accountNumber?:      string;
  counterparty?:       string;
  ipAddress?:          string;
}

type Tenant = string;

function counterKey(tenant: Tenant): string {
  return `hs-compliance/${safeId(tenant)}/counter.json`;
}

function caseKey(tenant: Tenant, caseId: string): string {
  return `hs-compliance/${safeId(tenant)}/cases/${safeId(caseId)}.json`;
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
  input: Omit<HsCase, "caseId" | "createdAt" | "updatedAt" | "linkedAuditSeqs" | "breachLogged" | "slaBreach" | "fourEyesApprovers" | "escalationHistory">,
): Promise<HsCase> {
  const n = await nextCaseNumber(tenant);
  const caseId = formatCaseId(n);
  const now = new Date().toISOString();
  const rec: HsCase = {
    ...input,
    caseId,
    createdAt:        now,
    updatedAt:        now,
    linkedAuditSeqs:  [],
    breachLogged:     false,
    slaBreach:        false,
    fourEyesApprovers: [],
    escalationHistory: [],
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

// ─────────────────────────────────────────────────────────────────────────────
// (a) Risk re-scoring on update
// ─────────────────────────────────────────────────────────────────────────────
// Weights (sum to 100):
//   sanctionsHitCount   → 35 pts (up to 35)
//   isPep               → 20 pts (binary)
//   adverseMediaCount   → 15 pts (up to 15)
//   redlineViolations   → 20 pts (up to 20)
//   jurisdictionRisk    → 10 pts (scaled from 0-100 to 0-10)
//
// Score interpretation:
//   0–24    → severity "clear" / riskCategory LOW
//   25–49   → severity "low"   / riskCategory LOW
//   50–64   → severity "medium"/ riskCategory MEDIUM
//   65–79   → severity "high"  / riskCategory HIGH
//   80–100  → severity "critical"/ riskCategory CRITICAL

export function computeCompositeRiskScore(factors: CaseRiskFactors): number {
  const sanctionsPts   = Math.min(35, factors.sanctionsHitCount * 12);
  const pepPts         = factors.isPep ? 20 : 0;
  const adversePts     = Math.min(15, factors.adverseMediaCount * 3);
  const redlinePts     = Math.min(20, factors.redlineViolations * 5);
  const jurisdictionPts = Math.min(10, Math.round((factors.jurisdictionRisk / 100) * 10));
  return sanctionsPts + pepPts + adversePts + redlinePts + jurisdictionPts;
}

function scoreToSeverity(score: number): HsCase["severity"] {
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "clear";
}

function scoreToRiskCategory(score: number): RiskCategory {
  if (score >= 80) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

/**
 * Re-calculates the composite risk score for the given case, persists the new
 * score + updated severity/riskCategory, and returns the updated case record.
 * Triggered after any status change or evidence update.
 */
export async function updateCaseRiskScore(
  tenant: Tenant,
  caseId: string,
  factors: CaseRiskFactors,
  actor = "system",
): Promise<HsCase | null> {
  const existing = await loadCase(tenant, caseId);
  if (!existing) return null;

  const score    = computeCompositeRiskScore(factors);
  const severity = scoreToSeverity(score);
  const riskCategory = scoreToRiskCategory(score);

  const updated = await updateCase(tenant, caseId, {
    compositeRiskScore: score,
    riskFactors: factors,
    severity,
    riskCategory,
  }, actor);

  if (updated) {
    void writeAuditChainEntry({
      event: "hs_case.risk_rescored",
      actor,
      caseId,
      subjectName: updated.subjectName,
      compositeRiskScore: score,
      severity,
      riskCategory,
    }, tenant).catch(() => undefined);
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// (b) Escalation timeline tracker
// ─────────────────────────────────────────────────────────────────────────────

// Status transitions that are recorded in escalationHistory.
const ESCALATION_STATUSES: ReadonlySet<HsCaseStatus> = new Set([
  "open", "escalated", "mlro_review", "filed_str", "closed",
]);

/**
 * Appends an entry to the case's escalationHistory when the status changes
 * between tracked statuses. Call this immediately after a status transition.
 */
export async function appendEscalationHistory(
  tenant: Tenant,
  caseId: string,
  fromStatus: HsCaseStatus,
  toStatus: HsCaseStatus,
  byUserId: string,
  reason: string,
): Promise<HsCase | null> {
  if (!ESCALATION_STATUSES.has(fromStatus) || !ESCALATION_STATUSES.has(toStatus)) {
    // Not a tracked transition — nothing to record.
    return loadCase(tenant, caseId);
  }

  const existing = await loadCase(tenant, caseId);
  if (!existing) return null;

  const entry: EscalationHistoryEntry = {
    timestamp:  new Date().toISOString(),
    fromStatus,
    toStatus,
    byUserId,
    reason: reason.slice(0, 500),
  };

  const escalationHistory = [...(existing.escalationHistory ?? []), entry];
  return updateCase(tenant, caseId, { escalationHistory }, byUserId);
}

// ─────────────────────────────────────────────────────────────────────────────
// (c) Regulatory deadline tracking (UAE Federal Decree-Law No. 10 of 2025 Art.17)
// ─────────────────────────────────────────────────────────────────────────────
// STR must be filed within 48 hours of suspicion formation.
// The filing deadline clock starts when a case transitions to "escalated".
// If the case remains "escalated" for >36 h without advancing to "filed_str",
// overdueSar is set to true.

const FILING_DEADLINE_HOURS = 48;
const OVERDUE_WARN_HOURS    = 36;

/**
 * Sets the filingDeadline timestamp on a case when it is first escalated.
 * Should be called immediately after updateCase sets status = "escalated".
 */
export async function setFilingDeadline(
  tenant: Tenant,
  caseId: string,
  escalatedAt?: string,
): Promise<HsCase | null> {
  const base = new Date(escalatedAt ?? new Date().toISOString());
  base.setHours(base.getHours() + FILING_DEADLINE_HOURS);
  return updateCase(tenant, caseId, { filingDeadline: base.toISOString() }, "system");
}

/**
 * Scans all escalated cases and sets overdueSar = true on any that have been
 * in "escalated" status for more than OVERDUE_WARN_HOURS (36 h) without having
 * advanced to "filed_str".
 * Returns the list of newly flagged overdue cases.
 */
export async function checkOverdueSar(tenant: Tenant): Promise<HsCase[]> {
  const all      = await listCases(tenant);
  const now      = Date.now();
  const flagged: HsCase[] = [];

  for (const c of all) {
    if (c.status !== "escalated") continue;
    if (c.overdueSar) continue;                       // already flagged
    if (!c.filingDeadline) continue;                  // no deadline set yet

    // filingDeadline is set to escalatedAt + 48 h.
    // We warn when 36 h have elapsed (i.e. 12 h before the hard 48 h deadline).
    const deadlineMs    = new Date(c.filingDeadline).getTime();
    const warnThreshMs  = deadlineMs - (FILING_DEADLINE_HOURS - OVERDUE_WARN_HOURS) * 3_600_000;

    if (now >= warnThreshMs) {
      const updated = await updateCase(tenant, c.caseId, { overdueSar: true }, "system");
      if (updated) {
        flagged.push(updated);
        void writeAuditChainEntry({
          event:           "sar.overdue_warning",
          actor:           "system",
          caseId:          c.caseId,
          subjectName:     c.subjectName,
          filingDeadline:  c.filingDeadline,
          fdlReference:    "Federal Decree-Law No. 10 of 2025 Art.17",
        }, tenant).catch(() => undefined);
      }
    }
  }
  return flagged;
}

// ─────────────────────────────────────────────────────────────────────────────
// (d) Cross-case pattern detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bigram-based similarity score in [0, 1].
 * Returns 1.0 for identical strings, ~0.85+ for minor variations.
 */
function bigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const bgA = bigrams(na);
  const bgB = bigrams(nb);

  let intersection = 0;
  for (const [bg, countA] of bgA) {
    const countB = bgB.get(bg) ?? 0;
    intersection += Math.min(countA, countB);
  }

  const totalA = na.length > 1 ? na.length - 1 : 1;
  const totalB = nb.length > 1 ? nb.length - 1 : 1;
  return (2 * intersection) / (totalA + totalB);
}

const FUZZY_THRESHOLD = 0.85;

/**
 * Finds cases that share identifying attributes with the given subject.
 *
 * Matching logic:
 *   - subjectName:  fuzzy bigram similarity ≥ 85% (excluding the anchor case itself)
 *   - accountNumber: exact string match (case-insensitive)
 *   - counterparty:  exact string match (case-insensitive)
 *   - ipAddress:     exact string match
 *
 * @param subjectId   The subject ID of the case being investigated (used to
 *                    exclude the case itself from results).
 * @param subjectName The display name of the subject for fuzzy matching.
 * @param anchors     Optional additional identifiers to match against.
 * @param cases       The full list of cases to search through.
 * @returns           Array of LinkedCaseMatch records (may contain duplicates
 *                    if multiple fields match — one entry per field).
 */
export function detectLinkedCases(
  subjectId: string,
  subjectName: string,
  anchors: {
    accountNumber?: string;
    counterparty?:  string;
    ipAddress?:     string;
  },
  cases: HsCase[],
): LinkedCaseMatch[] {
  const results: LinkedCaseMatch[] = [];

  for (const c of cases) {
    // Skip the case belonging to the same subject.
    if (c.subjectId === subjectId) continue;

    // (1) Subject name — fuzzy
    const nameSim = bigramSimilarity(subjectName, c.subjectName);
    if (nameSim >= FUZZY_THRESHOLD) {
      results.push({ caseId: c.caseId, matchedField: "subjectName", matchValue: c.subjectName });
    }

    // (2) Account number — exact (case-insensitive)
    if (
      anchors.accountNumber &&
      c.accountNumber &&
      anchors.accountNumber.toLowerCase() === c.accountNumber.toLowerCase()
    ) {
      results.push({ caseId: c.caseId, matchedField: "accountNumber", matchValue: c.accountNumber });
    }

    // (3) Counterparty — exact (case-insensitive)
    if (
      anchors.counterparty &&
      c.counterparty &&
      anchors.counterparty.toLowerCase() === c.counterparty.toLowerCase()
    ) {
      results.push({ caseId: c.caseId, matchedField: "counterparty", matchValue: c.counterparty });
    }

    // (4) IP address — exact
    if (anchors.ipAddress && c.ipAddress && anchors.ipAddress === c.ipAddress) {
      results.push({ caseId: c.caseId, matchedField: "ipAddress", matchValue: c.ipAddress });
    }
  }

  return results;
}
