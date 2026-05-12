// Hawkeye Sterling — regulatory anchors catalogue.
//
// Every finding, verdict, and audit entry Hawkeye Sterling emits cites one
// or more of these anchors. This is the Refinitiv-kill: no black-box scores,
// no "trust us, we checked" — every decision points at the named article,
// recommendation, step, or resolution that justifies it.
//
// Anchor IDs are deterministic slugs; citation strings are the regulator's
// canonical reference. Add a new anchor by appending to the appropriate
// family; never renumber existing IDs (the audit chain references them).

export type AnchorFamily =
  | "FATF"
  | "UAE-FDL"
  | "UAE-CABINET"
  | "UAE-MOE"
  | "UAE-CBUAE"
  | "UAE-FIU"
  | "UAE-VARA"
  | "LBMA"
  | "OECD"
  | "EU"
  | "OFAC"
  | "UN"
  | "PDPL";

export interface RegulatoryAnchor {
  id: string;
  family: AnchorFamily;
  citation: string;            // canonical regulator reference, e.g. "FATF R.10"
  title: string;               // human-readable title
  summary: string;             // one-line effect
  jurisdiction: string;        // "global" | "AE" | "EU" | "US" | "UK" | etc.
  url?: string;
}

function slug(citation: string): string {
  return citation
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const RAW: Omit<RegulatoryAnchor, "id">[] = [
  // ── FATF Recommendations (global standard) ────────────────────────────
  { family: "FATF", citation: "FATF R.1",  title: "Assessing risks · applying risk-based approach", summary: "Jurisdictions must identify, assess, and understand ML/TF/PF risks and apply a risk-based approach.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.10", title: "Customer due diligence",                        summary: "Identify and verify the customer and the beneficial owner; understand purpose of the relationship.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.11", title: "Record-keeping",                                 summary: "Keep transaction records for at least five years.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.12", title: "PEPs — politically exposed persons",             summary: "Enhanced measures for foreign PEPs and their family/close associates.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.13", title: "Correspondent banking",                          summary: "Cross-border correspondent relationships require EDD and senior management approval.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.15", title: "New technologies · VASPs",                       summary: "Virtual asset service providers must be licensed/registered and supervised for AML/CFT.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.16", title: "Wire transfers · travel rule",                   summary: "Originator and beneficiary information must accompany wire transfers.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.20", title: "Reporting of suspicious transactions",           summary: "File an STR promptly with the FIU on suspicion of ML/TF proceeds.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.21", title: "Tipping-off and confidentiality",                summary: "Prohibited from tipping-off the subject; protection from liability for good-faith reporting.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.22", title: "DNFBPs — customer due diligence",                summary: "Designated non-financial businesses (DPMS included) apply R.10–12,15,17.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.23", title: "DNFBPs — other measures",                        summary: "DNFBPs apply R.18–21 (internal controls, foreign branches, higher-risk countries, STRs).", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.24", title: "Transparency of legal persons",                  summary: "Adequate, accurate, timely beneficial-ownership information on legal persons.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.25", title: "Transparency of legal arrangements",             summary: "BO information on trusts and similar arrangements.", jurisdiction: "global" },
  { family: "FATF", citation: "FATF R.29", title: "Financial intelligence units",                   summary: "Establish an FIU as the national centre for STR analysis and dissemination.", jurisdiction: "global" },

  // ── UAE Federal Decree-Law 10/2025 (formerly FDL 20/2018) ──────────────
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.2",  title: "ML offence definition",              summary: "Defines ML as conversion/transfer/concealment/acquisition of proceeds with knowledge they derive from a crime.", jurisdiction: "AE" },
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.15", title: "STR filing obligation",              summary: "File an STR with the FIU through goAML without delay upon suspicion.", jurisdiction: "AE" },
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.16", title: "Prohibition of tipping-off",         summary: "Criminal prohibition on informing the subject or any third party that an STR has been filed.", jurisdiction: "AE" },
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.20", title: "Record retention",                   summary: "Ten-year retention of CDD records, transaction records, and reasoning chain.", jurisdiction: "AE" },
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.24", title: "Record-keeping format & integrity",  summary: "Records must be accessible, tamper-evident, producible on regulator demand.", jurisdiction: "AE" },
  { family: "UAE-FDL", citation: "FDL 10/2025 Art.46", title: "Four-eyes / dual approval",          summary: "Designated AML decisions require MLRO + deputy MLRO co-signature.", jurisdiction: "AE" },

  // ── UAE Cabinet Resolutions ────────────────────────────────────────────
  { family: "UAE-CABINET", citation: "Cabinet Res No.134/2025", title: "AML/CFT executive regulations (in force 30 Sep 2025)", summary: "Supersedes Cabinet Decision No. 10/2019. Implementing regulations under FDL No.10/2025. 71 articles.", jurisdiction: "AE" },
  { family: "UAE-CABINET", citation: "Cabinet Res 74/2020 Art.4-7", title: "TFS · immediate freeze without delay", summary: "Funds/assets of UN/UNSC/Local Terrorism List designatees frozen within 24h without prior notice.", jurisdiction: "AE" },
  { family: "UAE-CABINET", citation: "Cabinet Res 16/2021", title: "Beneficial ownership register", summary: "Mandatory BO filing with licensing authority; refresh on any >10% change.", jurisdiction: "AE" },
  { family: "UAE-CABINET", citation: "Cabinet Res 134/2025 Art.12-14", title: "DPMS thresholds and EDD triggers", summary: "Designated Non-Financial Businesses & Professions — DPMS-specific CDD, EDD, transaction limits.", jurisdiction: "AE" },

  // ── UAE MoE circulars ──────────────────────────────────────────────────
  { family: "UAE-MOE",  citation: "MoE Circular 3/2025",    title: "DPMS AML guidance",             summary: "Ministry of Economy binding guidance to DNFBPs (DPMS) on AML/CFT obligations.", jurisdiction: "AE" },

  // ── UAE FIU / goAML ────────────────────────────────────────────────────
  { family: "UAE-FIU",  citation: "goAML XML Schema v4.0",  title: "STR/SAR/FFR filing format",     summary: "FIU-prescribed XML envelope for STR, SAR, DPMSR, FFR (funds freeze report).", jurisdiction: "AE" },

  // ── UAE CBUAE ──────────────────────────────────────────────────────────
  { family: "UAE-CBUAE", citation: "CBUAE AML Guidance 2023", title: "Sanctions compliance directive", summary: "CBUAE expectations on sanctions screening, lookback, and governance for licensed FIs.", jurisdiction: "AE" },

  // ── UAE VARA (Virtual Assets Regulatory Authority) ─────────────────────
  { family: "UAE-VARA", citation: "VARA VASP Rulebook 2024", title: "VASP compliance obligations",   summary: "Dubai VASPs — AML, travel rule, market conduct, custody, proof-of-reserves.", jurisdiction: "AE" },

  // ── LBMA Responsible Gold Guidance v9 ──────────────────────────────────
  { family: "LBMA", citation: "LBMA RGG v9 Step 1", title: "Establish strong management systems",    summary: "Policy, senior management accountability, internal controls on responsible gold sourcing.", jurisdiction: "global" },
  { family: "LBMA", citation: "LBMA RGG v9 Step 2", title: "Identify and assess supply chain risks", summary: "KYC on counterparty miners/refiners; assess CAHRA exposure.", jurisdiction: "global" },
  { family: "LBMA", citation: "LBMA RGG v9 Step 3", title: "Design and implement a strategy to respond to identified risks", summary: "Risk-based management plan; board-visible remediation; trigger disengagement where required.", jurisdiction: "global" },
  { family: "LBMA", citation: "LBMA RGG v9 Step 4", title: "Independent third-party audit",          summary: "Annual independent audit of Step 1–3 by an LBMA-approved auditor.", jurisdiction: "global" },
  { family: "LBMA", citation: "LBMA RGG v9 Step 5", title: "Annual public report",                    summary: "Publish an annual responsible-gold report; transparent to supply-chain partners.", jurisdiction: "global" },

  // ── OECD Due Diligence Guidance ────────────────────────────────────────
  { family: "OECD", citation: "OECD DDG Annex II", title: "CAHRA red flags for precious metals",     summary: "Conflict-Affected and High-Risk Area typology; mandatory enhanced DD triggers.", jurisdiction: "global" },

  // ── Sanctions regimes ──────────────────────────────────────────────────
  { family: "OFAC", citation: "OFAC SDN List",              title: "US primary sanctions — specially designated nationals", summary: "Blocked persons; US nexus transactions prohibited.", jurisdiction: "US" },
  { family: "OFAC", citation: "OFAC 50% Rule",              title: "Ownership aggregation",          summary: "Entities owned 50%+ by one or more SDNs are blocked even if not listed.", jurisdiction: "US" },
  { family: "UN",   citation: "UNSC 1267 (Consolidated)",   title: "UN ISIL/Al-Qaida/Taliban sanctions", summary: "Global freeze obligation on designated persons/entities.", jurisdiction: "global" },
  { family: "EU",   citation: "EU CFSP Consolidated",       title: "EU restrictive measures",         summary: "EU Council asset freezes and sectoral restrictions.", jurisdiction: "EU" },

  // ── UAE PDPL (data privacy) ────────────────────────────────────────────
  { family: "PDPL", citation: "FDL 45/2021 Art.6",  title: "Lawful basis for processing",           summary: "AML processing lawful on legal obligation basis; consent not required.", jurisdiction: "AE" },
  { family: "PDPL", citation: "FDL 45/2021 Art.13", title: "Data breach notification",              summary: "Notify Data Office of breaches that risk privacy / security of personal data.", jurisdiction: "AE" },
];

export const ANCHORS: readonly RegulatoryAnchor[] = Object.freeze(
  RAW.map((r) => ({ ...r, id: `anchor-${slug(r.citation)}` })),
);

export function anchorById(id: string): RegulatoryAnchor | undefined {
  return ANCHORS.find((a) => a.id === id);
}

export function anchorsByFamily(family: AnchorFamily): RegulatoryAnchor[] {
  return ANCHORS.filter((a) => a.family === family);
}
