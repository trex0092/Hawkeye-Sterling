export type SortKey = "name" | "riskScore" | "slaNotify" | "status" | "cddPosture";

// All columns the screening table can render. Persisted to localStorage so
// the analyst's column layout survives reloads. "id" / "subject" / "actions"
// are required and never hidden — only the middle six toggle.
export type TableColumnKey =
  | "risk"
  | "status"
  | "cdd"
  | "sla"
  | "lists"
  | "snooze";

export const ALL_COLUMNS: { key: TableColumnKey; label: string; defaultOn: boolean }[] = [
  { key: "risk",   label: "Risk",   defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "cdd",    label: "CDD",    defaultOn: true },
  { key: "sla",    label: "SLA",    defaultOn: true },
  { key: "lists",  label: "Lists",  defaultOn: true },
  { key: "snooze", label: "Snooze", defaultOn: false },
];

// Global sanctions list identifiers — ordered by jurisdiction prominence.
// OFAC, UN, EU, UK, EOCN are the primary Gulf/international regimes;
// AU/CA/CH/JP/FATF/INTERPOL/WB/ADB round out full global coverage.
export type SanctionSource =
  | "OFAC"      // US Treasury – SDN + Non-SDN + CAPTA
  | "UN"        // UN Security Council Consolidated (1267/1988/2231+)
  | "EU"        // EU CFSP Consolidated Financial Sanctions
  | "UK"        // UK OFSI Financial Sanctions
  | "EOCN"      // UAE Executive Office for Control & Non-Proliferation
  | "AU"        // Australia DFAT Consolidated Sanctions
  | "CA"        // Canada SEMA / OSFI
  | "CH"        // Switzerland SECO
  | "JP"        // Japan MoF / METI
  | "FATF"      // FATF High-risk & monitored jurisdictions
  | "INTERPOL"  // Interpol Red / Blue / Yellow Notices
  | "WB"        // World Bank Debarment List
  | "ADB";      // Asian Development Bank Sanctions List

export interface SanctionMatch {
  source: SanctionSource | "OFAC SDN" | "EU Consolidated" | "UK OFSI" | "Adverse media";
  score: number;
  name: string;
  reference: string;
  date: string;
  flagged?: boolean;
}

export type SubjectType =
  | "Individual · UBO"
  | "Individual · Customer"
  | "Individual · Correspondent"
  | "Individual · Counterparty"
  | "Individual · Director"
  | "Individual · Authorised Signatory"
  | "Corporate · Supplier"
  | "Corporate · Refiner"
  | "Corporate · Customer"
  | "Corporate · Correspondent"
  | "Corporate · Intermediary"
  | "Corporate · Counterparty"
  | "Transaction · Cluster";

export type CDDPosture = "CDD" | "EDD" | "SDD";

export type SubjectStatus = "active" | "frozen" | "cleared";

export type BadgeTone = "violet" | "orange" | "dashed";

export interface AdverseMediaMatch {
  source: string;
  score: number;
  name: string;
  reference: string;
  date: string;
}

export interface ScreeningHistoryEntry {
  /** ISO 8601 capture time. */
  at: string;
  topScore: number;
  severity: "clear" | "low" | "medium" | "high" | "critical";
  /** List IDs that produced a hit (e.g. ["OFAC", "UN"]). */
  lists: string[];
  /** Compact hit fingerprint for diffing — listId:listRef. */
  hits: string[];
  /** Optional confidence band half-width (0-100), if calibration is on. */
  confidenceBand?: number;
}

export interface Subject {
  id: string;
  badge: string;
  badgeTone: BadgeTone;
  name: string;
  meta: string;
  country: string;
  jurisdiction: string;
  aliases?: string[];
  type: SubjectType;
  /** Brain-supported entity types. vessel/aircraft route to entity-specific
   *  candidate corpora and IMO/MMSI/tail-number lookups. */
  entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  riskScore: number;
  status: SubjectStatus;
  cddPosture: CDDPosture;
  listCoverage: SanctionSource[];
  adverseMedia?: AdverseMediaMatch;
  pep?: { tier: string; rationale?: string };
  rca?: { screened: boolean; linkedAssociates?: string[] };
  exposureAED: string;
  slaNotify: string;
  mostSerious: string;
  openedAgo: string;
  // ISO 8601 timestamp set at creation time. Used for precise a24 filter
  // comparisons. Absent on seed/legacy subjects; those fall back to parsing
  // openedAgo as dd/mm/yyyy (day-precision, which is acceptable for seeds).
  openedAt?: string;
  notes?: string;
  riskCategory?: string;

  /** Snooze the subject from the active queue until this ISO timestamp.
   *  Reason captured to the audit chain when set. Cleared explicitly. */
  snoozedUntil?: string;
  snoozeReason?: string;
  /** Operator login the case is assigned to. Empty = unassigned. */
  assignedTo?: string;
  /** Crypto wallet addresses linked to the subject — fed into /api/crypto-risk
   *  during screening. Persisted on the subject so re-screens stay coherent. */
  walletAddresses?: string[];
  /** IMO number for vessel entityType, MMSI fallback. */
  vesselImo?: string;
  vesselMmsi?: string;
  /** Tail number for aircraft entityType (ICAO 24-bit also accepted). */
  aircraftTail?: string;
  /** Last N screening runs for diff + replay. Bounded to ~10 entries. */
  screeningHistory?: ScreeningHistoryEntry[];
}

// ─── Saved searches ────────────────────────────────────────────────────────
// Predicates analysts pin to the toolbar. Persisted server-side via Blobs
// (NOT localStorage) so the daily MLRO huddle sees the same set across
// browsers and machines.
export interface SavedSearch {
  id: string;
  label: string;
  /** Free-text query — same syntax as the search box. */
  query?: string;
  /** Filter key applied alongside the query. */
  filter?: FilterKey;
  /** Status pill applied alongside. */
  statusFilter?: SubjectStatus | "all";
  /** Min risk score floor (0-100). */
  minRisk?: number;
  /** Subject must have a PEP tier in this set. */
  pepTiers?: string[];
  /** Subject's jurisdiction must match one of these ISO2 / country names. */
  jurisdictions?: string[];
  /** Opened within last N hours (overrides a24). */
  openedWithinH?: number;
  /** Author who created the search. */
  createdBy?: string;
  createdAt: string;
}

// ─── Four-eyes queue ───────────────────────────────────────────────────────
// Items waiting on a second approver before they leave screening (STR draft,
// freeze, decline). Replaces the native window.prompt approver flow.
export type FourEyesAction = "str" | "freeze" | "decline" | "edd-uplift" | "escalate";
export type FourEyesStatus = "pending" | "approved" | "rejected" | "expired";

export interface FourEyesItem {
  id: string;
  subjectId: string;
  subjectName: string;
  action: FourEyesAction;
  initiatedBy: string;
  initiatedAt: string;
  reason: string;
  /** Optional Asana / case URL that the action will write into. */
  contextUrl?: string;
  status: FourEyesStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface UboEntry {
  id: string;
  name: string;
  ownershipPct: number;
  role: string;
  jurisdiction: string;
  verified: boolean;
}

export interface EddChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
}

export const EDD_CHECKLIST_DEFAULTS: { id: string; label: string }[] = [
  { id: "sow", label: "Source of wealth documented" },
  { id: "sof", label: "Source of funds verified" },
  { id: "ubo-struct", label: "Beneficial ownership structure confirmed" },
  { id: "edd-review", label: "Enhanced due diligence review completed" },
  { id: "mlro", label: "MLRO sign-off obtained" },
  { id: "pep-cert", label: "PEP screening certified" },
  { id: "cbq", label: "Correspondent bank questionnaire received" },
  { id: "four-eyes", label: "Four-eyes approval recorded" },
];

export interface SubjectDetail {
  subjectId: string;
  cddReviewDate?: string;
  eddChecklist: EddChecklistItem[];
  uboEntries: UboEntry[];
  evidenceItems: EvidenceEntry[];
  timelineEvents: TimelineEvent[];
  hitResolutions?: HitResolution[];
}

export type FilterKey =
  | "all"
  | "critical"
  | "sanctions"
  | "edd"
  | "pep"
  | "sla"
  | "a24"
  | "mine"
  | "closed";

export interface SavedFilterSet {
  id: string;
  label: string;
  keys: FilterKey[];
  createdAt: string;
}

export interface QueueFilter {
  key: FilterKey;
  label: string;
  count: string;
}

export type CaseStatus = "active" | "review" | "reported" | "closed";

export type CaseFilterKey =
  | "all"
  | "active"
  | "awaiting"
  | "escalated"
  | "closed-cleared"
  | "closed-reported";

export interface CaseFilter {
  key: CaseFilterKey;
  label: string;
  count: string;
}

export type EvidenceCategory =
  | "screening-report"
  | "cdd-package"
  | "transaction-records"
  | "reasoning-chain"
  | "four-eyes-approval";

export interface EvidenceEntry {
  category: EvidenceCategory;
  title: string;
  meta: string;
  detail: string;
}

export interface TimelineEvent {
  timestamp: string;
  event: string;
}

export type HitResolutionVerdict =
  | "false_positive"     // World-Check: False / Low risk
  | "possible_match"     // World-Check: Possible / Medium risk
  | "confirmed_positive" // World-Check: Positive / High risk
  | "unspecified";       // World-Check: Unspecified / Unknown risk

// Structured reason category (mirrors Refinitiv World-Check's "REASON" dropdown).
// Drives the regulator-readable rationale on the audit trail; the free-text
// reason captures the analyst's specific basis on top of this.
export type HitResolutionReasonCategory =
  | "no_match"               // sanctioned subject is clearly not the customer
  | "partial_match"          // some identifiers align, others don't
  | "full_match"             // all decisive identifiers match (DOB / passport / biometric)
  | "name_only"              // matched on name alone — no other identifiers to compare
  | "duplicate_record"       // same listing already resolved under a different hit
  | "verified_negative"      // independent verification rules out the subject
  | "data_quality_issue"     // record's data is incomplete / corrupted
  | "stale_listing"          // listing is no longer in force
  | "other";

// Risk level derived from verdict (World-Check parity).
export type HitResolutionRiskLevel = "high" | "medium" | "low" | "unknown";

export interface HitResolution {
  hitRef: string;
  verdict: HitResolutionVerdict;
  /** Structured reason category from a fixed taxonomy (audit-trail). */
  reasonCategory?: HitResolutionReasonCategory;
  /** Derived risk level (Positive=high, Possible=medium, False=low, Unspecified=unknown). */
  riskLevel?: HitResolutionRiskLevel;
  /** Free-text rationale supplied by the analyst. */
  reason: string;
  resolvedAt: string;
  resolvedBy?: string;
  enrolledInMonitoring?: boolean;
}

export function riskLevelForVerdict(v: HitResolutionVerdict): HitResolutionRiskLevel {
  if (v === "confirmed_positive") return "high";
  if (v === "possible_match") return "medium";
  if (v === "false_positive") return "low";
  return "unknown";
}

export type Faculty =
  | "reasoning"
  | "data-analysis"
  | "deep-thinking"
  | "intelligence"
  | "smartness"
  | "inference"
  | "argumentation"
  | "introspection"
  | "ratiocination"
  | "forensics"
  | "linguistic"
  | "psychological"
  | "temporal"
  | "geospatial"
  | "cryptographic"
  | "ethical"
  | "quantitative"
  | "adversarial"
  | "regulatory"
  | "behavioral"
  | "systemic"
  | "narrative"
  | "geopolitical"
  | "reputational"
  | "operational"
  | "sociological"
  | "semantic"
  | "epidemiological"
  | "contractual"
  | "predictive"
  | "computational"
  | "ai-governance";

export interface ReasoningMode {
  id: string;
  name: string;
  faculty: Faculty;
  taxonomyIds: readonly string[];
}

export type FacultyFilterKey = "all" | Faculty;

export interface FacultyFilter {
  key: FacultyFilterKey;
  label: string;
  count: string;
}

export interface ReasoningPreset {
  id: string;
  label: string;
  modeIds: string[];
}

export type CaseBadgeTone = "violet" | "orange" | "green";

export interface CaseRecord {
  id: string;
  badge: string;
  badgeTone: CaseBadgeTone;
  subject: string;
  meta: string;
  status: CaseStatus;
  evidenceCount: string;
  lastActivity: string;
  opened: string;
  reported?: string;
  goAMLReference?: string;
  mlroDisposition?: string;
  statusLabel: string;
  statusDetail: string;
  evidence: EvidenceEntry[];
  timeline: TimelineEvent[];
  /** Permalink to the Asana task created when this case was reported.
   *  Persisted so detail panels can render the green "Reported to Asana"
   *  pill across reloads, not just for the lifetime of the report POST. */
  asanaTaskUrl?: string;
  /** Snapshot of the screening + super-brain context captured when the
   *  case was opened. Lets the case-page compliance report render the
   *  exact same dossier the screening panel produced — without it the
   *  case page falls back to invented numbers because the localStorage
   *  CaseRecord is otherwise display-only. Optional so older cases
   *  predating this field still load. Shape mirrors the
   *  /api/compliance-report request body. */
  screeningSnapshot?: {
    subject: {
      id: string;
      name: string;
      entityType:
        | "individual"
        | "organisation"
        | "vessel"
        | "aircraft"
        | "other";
      jurisdiction?: string;
      aliases?: string[];
    };
    result: {
      topScore: number;
      severity: "clear" | "low" | "medium" | "high" | "critical";
      hits: Array<{
        listId: string;
        listRef: string;
        candidateName: string;
        score: number;
        method: string;
        programs?: string[];
      }>;
    };
    /** Same shape as ReportSuperBrain on the server side. Kept loose
     *  here so this types file doesn't have to import the report
     *  module. Persisted as-is from the screening panel's
     *  buildReportPayload(). */
    superBrain?: Record<string, unknown> | null;
    capturedAt: string;
  };
}
