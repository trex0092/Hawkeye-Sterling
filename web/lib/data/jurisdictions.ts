// Frontend mirror of src/brain/jurisdictions.ts. Keep synchronised — the brain
// is the source of truth for FATF / EU / Basel statuses. Phase 2 ingestion
// refreshes the brain registry; this mirror is regenerated with it.

export type FATFStatus = "call_for_action" | "increased_monitoring" | "not_listed";
export type EUAMLDStatus = "high_risk_third_country" | "not_listed";
export type BaselTier = "very_high" | "high" | "medium" | "low" | "very_low";

export interface JurisdictionRisk {
  iso2: string;
  name: string;
  fatf: FATFStatus;
  eu: EUAMLDStatus;
  baselTier: BaselTier;
}

export const JURISDICTION_RISK: readonly JurisdictionRisk[] = Object.freeze([
  { iso2: "AE", name: "United Arab Emirates", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "AF", name: "Afghanistan", fatf: "increased_monitoring", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "AL", name: "Albania", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "BY", name: "Belarus", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "CD", name: "Democratic Republic of the Congo", fatf: "increased_monitoring", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "IR", name: "Iran", fatf: "call_for_action", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "KP", name: "DPR Korea", fatf: "call_for_action", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "MM", name: "Myanmar", fatf: "call_for_action", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "NG", name: "Nigeria", fatf: "increased_monitoring", eu: "not_listed", baselTier: "high" },
  { iso2: "PA", name: "Panama", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "PH", name: "Philippines", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "RU", name: "Russian Federation", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "SD", name: "Sudan", fatf: "increased_monitoring", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "SY", name: "Syrian Arab Republic", fatf: "not_listed", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "VE", name: "Venezuela", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "YE", name: "Yemen", fatf: "increased_monitoring", eu: "high_risk_third_country", baselTier: "very_high" },
  { iso2: "ZW", name: "Zimbabwe", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "GB", name: "United Kingdom", fatf: "not_listed", eu: "not_listed", baselTier: "low" },
  { iso2: "US", name: "United States", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "CH", name: "Switzerland", fatf: "not_listed", eu: "not_listed", baselTier: "low" },
  { iso2: "SG", name: "Singapore", fatf: "not_listed", eu: "not_listed", baselTier: "low" },
  { iso2: "HK", name: "Hong Kong SAR", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "IN", name: "India", fatf: "not_listed", eu: "not_listed", baselTier: "medium" },
  { iso2: "TR", name: "Türkiye", fatf: "not_listed", eu: "not_listed", baselTier: "high" },
  { iso2: "ZA", name: "South Africa", fatf: "increased_monitoring", eu: "not_listed", baselTier: "high" },
]);

export const JURISDICTION_BY_ISO: Map<string, JurisdictionRisk> = new Map(
  JURISDICTION_RISK.map((j) => [j.iso2, j]),
);
