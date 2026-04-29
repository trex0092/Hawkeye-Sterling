// Reporting-entity identity used by goAML XML envelopes. The MLRO
// identity (name / email / phone) is shared across every entity in the
// group — it lives in process.env, not on the entity record itself.

export interface ReportingEntity {
  /** Stable slug used in API payloads, audit chain, and case-store. */
  id: string;
  /** Human-readable name shown in the STR/SAR form's Reporting entity dropdown. */
  name: string;
  /** Reporting entity ID assigned by the UAE FIU on goAML registration. */
  goamlRentityId: string;
  /** Optional branch code if the entity has multiple branches registered. */
  goamlBranch?: string;
  /** ISO-3166-1 alpha-2 country code. Defaults to AE. */
  jurisdiction?: string;
}
