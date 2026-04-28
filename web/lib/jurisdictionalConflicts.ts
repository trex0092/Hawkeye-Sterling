// Cross-jurisdictional regulatory-conflict registry. Each entry encodes
// a known tension between two or more regimes/jurisdictions plus the
// MLRO mitigation path. The registry is consulted by the MLRO Advisor
// whenever the brain classifier detects ≥2 jurisdictions or regimes
// in a question, surfacing the relevant conflicts inline in the entry
// detail (and embedding them in the regulator-facing evidence pack).
//
// Sources for each entry are listed in `authorities` so MLROs can audit
// the conflict text against the underlying regulation.

export type ConflictSeverity = "high" | "medium" | "low";

export interface JurisdictionalConflict {
  id: string;
  title: string;
  /** ISO-2 country / region codes that participate in the conflict. */
  jurisdictions: string[];
  /** Regulatory regime identifiers the brain classifier emits
   *  (e.g. "OFAC_SDN", "UN_CONSOLIDATED", "EU_CFSP", "UAE_EOCN", "FATF",
   *  "EU_GDPR", "EU_CSDDD", "UAE_FDL", "UAE_DATA_LAW"). Used for
   *  fuzzy matching against the classifier's regime hits. */
  regimes: string[];
  severity: ConflictSeverity;
  /** Free-text conflict description — what the tension actually is. */
  description: string;
  /** Concrete steps an MLRO should take to resolve / document the
   *  conflict before acting. */
  mitigation: string[];
  /** Anchored citations — short labels with regulation/article references. */
  authorities: string[];
}

export const JURISDICTIONAL_CONFLICTS: JurisdictionalConflict[] = [
  {
    id: "gdpr_vs_uae_data_localisation",
    title: "EU GDPR right-to-erasure vs UAE AML record-retention",
    jurisdictions: ["EU", "AE"],
    regimes: ["EU_GDPR", "UAE_FDL", "UAE_DATA_LAW"],
    severity: "high",
    description:
      "GDPR Art.17 grants data subjects a right to erasure, but UAE FDL 20/2018 Art.16 requires reporting institutions to retain CDD and transaction records for 5 years from end-of-relationship. An EU resident asking for deletion of UAE-held AML records cannot be honoured during the retention window.",
    mitigation: [
      "Decline erasure under GDPR Art.17(3)(b) — compliance with a legal obligation under the law of a Member State or third-country law to which the controller is subject.",
      "Document the rejection with the specific UAE FDL/AML basis and inform the data subject of the retention period in writing.",
      "On retention expiry, purge or anonymise the records and confirm in writing.",
    ],
    authorities: ["EU GDPR Art.17", "UAE FDL 20/2018 Art.16", "UAE PDPL 45/2021 Art.12"],
  },
  {
    id: "csddd_vs_uae_supplier_engagement",
    title: "EU CSDDD remediation vs UAE FATF de-risking guidance",
    jurisdictions: ["EU", "AE"],
    regimes: ["EU_CSDDD", "UAE_FDL", "FATF"],
    severity: "medium",
    description:
      "The EU Corporate Sustainability Due Diligence Directive (CSDDD) prefers continued supplier engagement over disengagement to remediate adverse human-rights impacts. UAE FATF-aligned supervision and FATF Recommendation 1 require risk-based de-risking when a supplier is high ML/TF-risk. The two regimes can pull in opposite directions for the same supplier.",
    mitigation: [
      "Run a parallel ML/TF risk score and human-rights impact score for the supplier.",
      "If both are high, prioritise de-risking under FATF R.1 and document the CSDDD remediation effort attempted.",
      "If only the human-rights score is high, follow CSDDD remediation; do not de-risk.",
      "Record the rationale and scoring methodology in the file before any action.",
    ],
    authorities: ["EU CSDDD (Directive 2024/1760)", "FATF Recommendation 1", "UAE FDL 20/2018"],
  },
  {
    id: "fatf_tipping_off_vs_eu_amld_disclosure",
    title: "FATF / UAE tipping-off prohibition vs EU AMLD subject-access",
    jurisdictions: ["EU", "AE"],
    regimes: ["FATF", "UAE_FDL", "EU_AMLD"],
    severity: "high",
    description:
      "FATF R.21 and UAE FDL 20/2018 Art.25 criminalise tipping-off — disclosing to a subject that an STR has been or will be filed. Under EU 5AMLD/6AMLD, customers have certain access rights. Confirming an STR filing in response to a subject-access request would breach the tipping-off prohibition.",
    mitigation: [
      "Treat any subject-access request mentioning suspicion, STR, FIU, or goAML as in-scope of the tipping-off rule.",
      "Respond using the standard exempt-records language; never confirm or deny an STR exists.",
      "Refer the request to the MLRO and FIU liaison before any reply leaves the institution.",
    ],
    authorities: ["FATF R.21 (INR.21)", "UAE FDL 20/2018 Art.25", "EU 5AMLD Art.41"],
  },
  {
    id: "ofac_sdn_vs_uae_eocn_overlap",
    title: "OFAC SDN vs UAE EOCN — primacy on a UAE-domiciled subject",
    jurisdictions: ["US", "AE"],
    regimes: ["OFAC_SDN", "UAE_EOCN", "UN_CONSOLIDATED"],
    severity: "high",
    description:
      "A UAE-domiciled subject can be designated by OFAC SDN (US secondary-sanctions exposure) but not appear on the UAE EOCN consolidated list, or vice versa. UAE law obliges institutions to freeze on UN-listed subjects; OFAC SDN designation does not automatically trigger a UAE freezing obligation, but creates US-correspondent-banking exposure.",
    mitigation: [
      "Always screen against UN Consolidated, EU CFSP, OFAC SDN, and UAE EOCN.",
      "On EOCN or UN hit: freeze immediately and notify EOCN within the prescribed window.",
      "On OFAC SDN hit only: do not freeze under UAE law, but conduct EDD, restrict USD correspondent activity, and consider exit under risk-based approach.",
      "Document the regime-by-regime decision in the case file.",
    ],
    authorities: ["UN Consolidated List", "OFAC SDN List", "UAE EOCN guidance", "UAE FDL 20/2018"],
  },
  {
    id: "fatf_r10_vs_uae_lite_kyc_thresholds",
    title: "FATF R.10 simplified-CDD eligibility vs UAE Cabinet Decision 10/2019",
    jurisdictions: ["INT", "AE"],
    regimes: ["FATF", "UAE_CABINET_10_2019"],
    severity: "low",
    description:
      "FATF R.10 permits simplified CDD where ML/TF risk is low. UAE Cabinet Decision 10/2019 lists specific high-risk circumstances where SDD is forbidden regardless of FATF baseline (e.g., correspondent banking, PEPs, CAHRA suppliers, DPMS gold-trade). UAE rules prevail for UAE-licensed institutions.",
    mitigation: [
      "Apply UAE Cabinet Decision 10/2019 as the binding floor; FATF R.10 cannot override.",
      "Do not apply SDD to PEPs, correspondents, CAHRA suppliers, or DPMS gold-trade subjects.",
      "Document the SDD eligibility assessment on file.",
    ],
    authorities: ["FATF Recommendation 10", "UAE Cabinet Decision 10/2019"],
  },
  {
    id: "lbma_rgg_vs_oecd_5step_disengagement",
    title: "LBMA RGG immediate suspension vs OECD progressive disengagement",
    jurisdictions: ["INT"],
    regimes: ["LBMA", "OECD"],
    severity: "medium",
    description:
      "LBMA Responsible Gold Guidance can require immediate suspension of a non-compliant supplier (Step 4 risk management). OECD CAHRA 5-Step Due Diligence prefers progressive risk mitigation and disengagement only when remediation fails after 6 months. For LBMA-Good-Delivery refiners these can collide on the same supplier.",
    mitigation: [
      "If LBMA Step 3 audit identifies a Red Flag 1 or 2 risk, suspend immediately under LBMA RGG.",
      "Run the OECD 6-month progressive remediation in parallel for documentation only — disengage at any time if LBMA suspension stands.",
      "Disclose both decisions in the OECD Step 5 public report.",
    ],
    authorities: ["LBMA Responsible Gold Guidance v9", "OECD CAHRA Due Diligence Guidance"],
  },
  {
    id: "un_global_compact_vs_un_sanctions",
    title: "UN Global Compact engagement principle vs UN Security Council sanctions",
    jurisdictions: ["INT"],
    regimes: ["UN_GLOBAL_COMPACT", "UN_CONSOLIDATED"],
    severity: "low",
    description:
      "UN Global Compact Principle 1 commits signatories to support and respect human rights, including via engagement with affected communities. A UNSC-sanctioned entity in those communities cannot be transacted with under the freezing obligation, even for humanitarian engagement.",
    mitigation: [
      "Treat the UNSC freezing obligation as binding; humanitarian engagement does not override.",
      "Use the UNSC-issued humanitarian carve-out (e.g. UNSCR 2664 (2022)) where applicable, with the prescribed notification.",
      "Document non-engagement decisions in the human-rights due-diligence record.",
    ],
    authorities: ["UN Global Compact Principle 1", "UNSCR 2664 (2022)", "UN Consolidated List"],
  },
  {
    id: "rmi_cmrt_vs_eu_conflict_minerals_reg",
    title: "RMI CMRT smelter scope vs EU Conflict Minerals Regulation 2017/821",
    jurisdictions: ["EU", "INT"],
    regimes: ["RMI", "EU_CONFLICT_MINERALS"],
    severity: "low",
    description:
      "The RMI Conflict Minerals Reporting Template (CMRT) tracks 3TG plus cobalt across global smelters. The EU Conflict Minerals Regulation (EU 2017/821) requires direct importers to conduct supply-chain due diligence on 3TG only, sourced from CAHRAs. Filing CMRT alone does not satisfy the EU Regulation.",
    mitigation: [
      "Use CMRT as the data feed into the EU Regulation due-diligence file.",
      "Add the EU Regulation's CAHRA-specific risk assessment on top.",
      "Publish the EU-required annual report independently of the CMRT submission.",
    ],
    authorities: ["EU Conflict Minerals Regulation 2017/821", "RMI CMRT v6.3"],
  },
];

const NORMALISE = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");

/** Rank a conflict against the brain's detected jurisdictions + regimes
 *  via fuzzy substring match. A conflict with 0 hits is excluded. */
function scoreConflict(
  c: JurisdictionalConflict,
  jurisdictions: string[],
  regimes: string[],
): number {
  const jSet = new Set(jurisdictions.map(NORMALISE));
  const rSet = new Set(regimes.map(NORMALISE));
  let score = 0;
  for (const j of c.jurisdictions) if (jSet.has(NORMALISE(j))) score += 2;
  for (const r of c.regimes) {
    const nr = NORMALISE(r);
    if (rSet.has(nr)) {
      score += 3;
      continue;
    }
    // Fuzzy: any classifier regime that includes this conflict's regime
    // token (or vice versa) counts as a half-match.
    for (const cr of rSet) {
      if (cr.includes(nr) || nr.includes(cr)) { score += 1; break; }
    }
  }
  return score;
}

/** Find conflicts that match the question's classifier hits. The list
 *  is sorted by relevance and capped at `limit` so we never flood the
 *  UI with low-signal matches. A conflict is included only if it
 *  references at least one detected jurisdiction or regime. */
export function findApplicableConflicts(
  jurisdictions: string[],
  regimes: string[],
  limit = 5,
): JurisdictionalConflict[] {
  const scored = JURISDICTIONAL_CONFLICTS
    .map((c) => ({ c, score: scoreConflict(c, jurisdictions, regimes) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.c);
}
