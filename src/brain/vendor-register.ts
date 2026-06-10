// Hawkeye Sterling — machine-readable vendor register.
// Mirror of docs/operations/THIRD_PARTY_MANAGEMENT.md (HS-OPS-003, the
// authoritative human-readable register). Each entry carries the platform
// function the vendor serves so kri_vendor_concentration can measure
// single-provider dependency (ISO/IEC 42001:2023 Clause 8.4 supply-chain
// risk). Keep both registers in sync: adding or removing a vendor is a
// Major change requiring MLRO approval.

export type VendorRiskClass = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Platform function a vendor serves. Concentration is measured per function. */
export type VendorFunction =
  | 'sanctions_data'
  | 'pep_data'
  | 'adverse_media'
  | 'hosting_storage'
  | 'llm_inference';

export interface VendorEntry {
  /** Register ID matching HS-OPS-003 (V-001…V-011). */
  id: string;
  name: string;
  service: string;
  functionKey: VendorFunction;
  riskClass: VendorRiskClass;
  /** Documented fallback that keeps the function alive during an outage
   *  (seed corpus, snapshot, circuit breaker). Null = none documented. */
  contingency: string | null;
  /** True when another registered provider (or configured fallback service)
   *  can serve the same function — i.e. the dependency is not single-vendor. */
  alternateProvider: boolean;
  lastReviewed: string;
  nextReview: string;
}

export const VENDOR_REGISTER: VendorEntry[] = [
  { id: 'V-001', name: 'OpenSanctions', service: 'PEP database + sanctions aggregator', functionKey: 'pep_data', riskClass: 'CRITICAL', contingency: 'Seed corpus of last-known-good snapshot in Netlify Blobs; candidates-loader auto-fallback', alternateProvider: false, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-002', name: 'UN Security Council', service: 'UN Consolidated List', functionKey: 'sanctions_data', riskClass: 'CRITICAL', contingency: 'Last validated snapshot; seed corpus fallback; manual MLRO review', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-003', name: 'US Treasury OFAC', service: 'SDN + Consolidated lists', functionKey: 'sanctions_data', riskClass: 'CRITICAL', contingency: 'Last validated snapshot; seed corpus fallback', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-004', name: 'European Union', service: 'EU Consolidated Financial Sanctions List', functionKey: 'sanctions_data', riskClass: 'CRITICAL', contingency: 'Last validated snapshot', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-005', name: 'UK OFSI', service: 'UK Consolidated List', functionKey: 'sanctions_data', riskClass: 'HIGH', contingency: 'Last validated snapshot', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-006', name: 'UAE National Security Council', service: 'UAE EOCN + Local Terrorist List', functionKey: 'sanctions_data', riskClass: 'CRITICAL', contingency: 'Last validated snapshot; MLRO manual monitoring of official NSSA channel', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-007', name: 'NewsAPI', service: 'Commercial news aggregator', functionKey: 'adverse_media', riskClass: 'HIGH', contingency: 'Fallback to GDELT + RSS', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-008', name: 'GDELT Project', service: 'Global event database', functionKey: 'adverse_media', riskClass: 'MEDIUM', contingency: 'Circuit breaker with stale-Redis fallback', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-009', name: 'Google CSE', service: 'Web search for adverse media', functionKey: 'adverse_media', riskClass: 'MEDIUM', contingency: 'Fallback to NewsAPI + GDELT', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-010', name: 'Netlify', service: 'Hosting, Blobs, scheduled functions', functionKey: 'hosting_storage', riskClass: 'CRITICAL', contingency: 'Seed corpus fallback; nightly S3 audit-chain backup', alternateProvider: false, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
  { id: 'V-011', name: 'Anthropic', service: 'Claude LLM — reasoning + narratives', functionKey: 'llm_inference', riskClass: 'HIGH', contingency: 'Deterministic rule-based degradation; Groq fallback via model-router', alternateProvider: true, lastReviewed: '2026-06-09', nextReview: '2027-06-09' },
];

export const VENDOR_BY_ID: Map<string, VendorEntry> = new Map(
  VENDOR_REGISTER.map((v) => [v.id, v]),
);

export interface VendorConcentration {
  /** All platform functions present in the register. */
  functions: VendorFunction[];
  /** Functions served by exactly one provider with no alternate. */
  singleProviderFunctions: VendorFunction[];
  /** Single-provider functions whose sole vendor is CRITICAL-class —
   *  the fourth-party-visibility hotspots the board watches. */
  criticalSingleProviderFunctions: VendorFunction[];
  /** % of registered functions that are single-provider (0–100). */
  concentrationPct: number;
}

/** Measure single-vendor dependency across platform functions.
 *  Feeds kri_vendor_concentration and the vendor_concentration appetite
 *  dimension. A function counts as single-provider when every vendor
 *  serving it reports alternateProvider: false. */
export function computeVendorConcentration(
  register: readonly VendorEntry[] = VENDOR_REGISTER,
): VendorConcentration {
  const byFunction = new Map<VendorFunction, VendorEntry[]>();
  for (const v of register) {
    const arr = byFunction.get(v.functionKey) ?? [];
    arr.push(v);
    byFunction.set(v.functionKey, arr);
  }

  const functions = [...byFunction.keys()];
  const singleProviderFunctions = functions.filter((f) =>
    (byFunction.get(f) ?? []).every((v) => !v.alternateProvider),
  );
  const criticalSingleProviderFunctions = singleProviderFunctions.filter((f) =>
    (byFunction.get(f) ?? []).some((v) => v.riskClass === 'CRITICAL'),
  );
  const concentrationPct = functions.length
    ? Math.round((singleProviderFunctions.length / functions.length) * 1000) / 10
    : 0;

  return { functions, singleProviderFunctions, criticalSingleProviderFunctions, concentrationPct };
}
