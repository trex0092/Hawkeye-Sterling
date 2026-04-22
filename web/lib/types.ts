export type SanctionSource = "OFAC" | "UN" | "EU" | "UK" | "EOCN";

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
  | "Corporate · Supplier"
  | "Corporate · Refiner"
  | "Corporate · Customer"
  | "Corporate · Intermediary"
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
  entityType: "individual" | "organisation" | "other";
  riskScore: number;
  status: SubjectStatus;
  cddPosture: CDDPosture;
  listCoverage: SanctionSource[];
  adverseMedia?: AdverseMediaMatch;
  exposureAED: string;
  slaNotify: string;
  mostSerious: string;
  openedAgo: string;
}

export type FilterKey =
  | "all"
  | "critical"
  | "sanctions"
  | "edd"
  | "pep"
  | "sla"
  | "a24"
  | "closed";

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
  | "cryptographic";

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
}
