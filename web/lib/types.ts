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

export interface Subject {
  id: string;
  badge: string;
  badgeTone: BadgeTone;
  name: string;
  meta: string;
  country: string;
  type: SubjectType;
  riskScore: number;
  status: SubjectStatus;
  cddPosture: CDDPosture;
  listCoverage: SanctionSource[];
  sanctions: SanctionMatch[];
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
