// Hawkeye Sterling — regulatory playbooks (coverage-engine source).
//
// Distinct from src/brain/playbooks.ts, which carries step-by-step MLRO
// decision scaffolds. This catalogue is the composition layer consumed by
// ./coverage.ts: each entry declares the taxonomy requirements
// (skills/reasoning/analysis) and regulatory anchors that must be
// discharged for the playbook to count as "satisfied".
//
// Separate export namespace keeps both concepts clean:
//   - playbooks.ts      → PLAYBOOKS (step-driven, MLRO operator flow)
//   - regulatory-playbooks.ts → REGULATORY_PLAYBOOKS (coverage-gated)

import { slugifyTaxonomyName } from "./taxonomy.js";

export interface RegulatoryPlaybook {
  id: string;
  name: string;
  summary: string;
  triggers: string[];
  requiredSkills: string[];
  requiredReasoning: string[];
  requiredAnalysis: string[];
  requiredAnchors: string[];
  charterArticles: string[];
  slaHours?: number;
}

export function taxId(category: "skills" | "reasoning" | "analysis", name: string): string {
  return `${category}-${slugifyTaxonomyName(name)}`;
}

const S = (name: string) => taxId("skills", name);
const R = (name: string) => taxId("reasoning", name);
const A = (name: string) => taxId("analysis", name);

export const REGULATORY_PLAYBOOKS: readonly RegulatoryPlaybook[] = Object.freeze([
  {
    id: "playbook-dpms-onboard",
    name: "UAE DPMS onboarding",
    summary:
      "Onboard a gold/bullion/jewellery counterparty per MoE Circular 3/2025 and Cabinet Res 134/2025.",
    triggers: ["new DPMS relationship", "refresh after 12m", "ownership change >10%"],
    requiredSkills: [
      S("KYC/CDD/EDD Expertise"),
      S("UBO Tracing"),
      S("Sanctions Screening Capability"),
      S("Record-Keeping"),
      S("Beneficial Owner Identification"),
    ],
    requiredReasoning: [
      R("Inherent Risk Logic"),
      R("Geographic Risk Reasoning"),
      R("Customer Risk Assessment Reasoning"),
    ],
    requiredAnalysis: [
      A("Customer Risk Scoring"),
      A("UBO Beneficial Ownership Mapping"),
      A("Sanctions Screening Analysis"),
    ],
    requiredAnchors: [
      "anchor-fatf-r-10",
      "anchor-fatf-r-22",
      "anchor-fatf-r-24",
      "anchor-fdl-10-2025-art-20",
      "anchor-cabinet-res-134-2025-art-12-14",
      "anchor-moe-circular-3-2025",
    ],
    charterArticles: ["P1", "P2", "P10"],
    slaHours: 72,
  },
  {
    id: "playbook-cahra-gold",
    name: "CAHRA gold supply chain",
    summary:
      "Enhanced supply-chain DD on gold originating in or transiting through Conflict-Affected and High-Risk Areas.",
    triggers: ["refiner located in CAHRA", "shipment transit through CAHRA", "OECD Annex II red flag"],
    requiredSkills: [
      S("CAHRA Assessment"),
      S("Refinery Evaluation"),
      S("Chain-of-Custody Verification"),
      S("Conflict Minerals Assessment"),
      S("Sourcing Documentation"),
      S("LBMA RGG Steps 1-5"),
    ],
    requiredReasoning: [
      R("CAHRA Determination"),
      R("Conflict Zone Identification"),
      R("Refinery Assessment Reasoning"),
      R("LBMA RGG Logic"),
      R("Supply Chain Risk Logic"),
    ],
    requiredAnalysis: [
      A("CAHRA Assessment"),
      A("Refinery Due Diligence"),
      A("LBMA Certification Verification"),
      A("Chain-of-Custody Verification"),
      A("Responsible Sourcing Assessment"),
    ],
    requiredAnchors: [
      "anchor-lbma-rgg-v9-step-2",
      "anchor-lbma-rgg-v9-step-3",
      "anchor-lbma-rgg-v9-step-4",
      "anchor-oecd-ddg-annex-ii",
    ],
    charterArticles: ["P2", "P3", "P6"],
    slaHours: 168,
  },
  {
    id: "playbook-eocn-freeze",
    name: "EOCN · immediate freeze without delay",
    summary:
      "UN/UNSC/Local Terrorism List match — freeze assets within 24h per Cabinet Res 74/2020 Art.4-7, file FFR.",
    triggers: [
      "confirmed UN 1267 match",
      "confirmed OFAC SDN match (US nexus)",
      "Local Terrorism List match",
    ],
    requiredSkills: [
      S("Sanctions Screening Capability"),
      S("Tipping-Off Management"),
      S("GOAML Reporting"),
      S("FIU Correspondence"),
      S("Escalation Management"),
    ],
    requiredReasoning: [
      R("Sanctions Regime Logic"),
      R("TFS Compliance Reasoning"),
      R("Tipping-Off Analysis"),
      R("Escalation Logic"),
    ],
    requiredAnalysis: [
      A("Sanctions Screening Analysis"),
      A("TFS Compliance Deep Analysis"),
      A("FIU Filing Pattern Analysis"),
    ],
    requiredAnchors: [
      "anchor-cabinet-res-74-2020-art-4-7",
      "anchor-unsc-1267-consolidated",
      "anchor-ofac-sdn-list",
      "anchor-fdl-10-2025-art-15",
      "anchor-goaml-xml-schema-v4-0",
    ],
    charterArticles: ["P4", "P7", "P8"],
    slaHours: 24,
  },
  {
    id: "playbook-str-filing",
    name: "STR · suspicious transaction report",
    summary:
      "File an STR with the UAE FIU via goAML without delay; enforce four-eyes approval and tipping-off prohibition.",
    triggers: ["MLRO reasonable suspicion", "red-flag correlation above threshold"],
    requiredSkills: [
      S("MLRO Decision-Making"),
      S("GOAML Reporting"),
      S("FIU Correspondence"),
      S("Tipping-Off Management"),
      S("Record-Keeping"),
    ],
    requiredReasoning: [
      R("Suspicious Activity Assessment"),
      R("MLRO Judgment"),
      R("Tipping-Off Analysis"),
      R("Record-Keeping Standard Reasoning"),
    ],
    requiredAnalysis: [
      A("Audit Trail Analysis"),
      A("FIU Correspondence Analysis"),
      A("Evidence Preservation Analysis"),
    ],
    requiredAnchors: [
      "anchor-fatf-r-20",
      "anchor-fatf-r-21",
      "anchor-fdl-10-2025-art-15",
      "anchor-fdl-10-2025-art-16",
      "anchor-fdl-10-2025-art-46",
      "anchor-goaml-xml-schema-v4-0",
    ],
    charterArticles: ["P5", "P7", "P8", "P9"],
    slaHours: 48,
  },
  {
    id: "playbook-pep-edd",
    name: "PEP · enhanced due diligence",
    summary:
      "Foreign/domestic PEP relationship requires senior management approval, SoW/SoF establishment, ongoing EDD.",
    triggers: [
      "PEP hit above threshold",
      "family/close-associate of PEP",
      "role change to PEP status",
    ],
    requiredSkills: [
      S("PEP Identification"),
      S("Adverse Media Screening"),
      S("UBO Tracing"),
      S("Senior Management Briefing"),
    ],
    requiredReasoning: [
      R("PEP Connection Reasoning"),
      R("Source of Funds Reasoning"),
      R("Source of Wealth Reasoning"),
      R("Adverse Media Assessment"),
    ],
    requiredAnalysis: [
      A("PEP & Corruption Investigation"),
      A("Source of Funds Analysis"),
      A("Source of Wealth Analysis"),
      A("Adverse Media Deep Review"),
    ],
    requiredAnchors: ["anchor-fatf-r-12", "anchor-cabinet-res-134-2025-art-12-14"],
    charterArticles: ["P1", "P2", "P10"],
    slaHours: 96,
  },
  {
    id: "playbook-tbml",
    name: "Trade-based money laundering",
    summary: "Invoice manipulation, over/under-invoicing, phantom shipments — detect and evidence.",
    triggers: [
      "invoice-price variance >15% vs market",
      "phantom shipment red flag",
      "third-party payment mismatch",
    ],
    requiredSkills: [
      S("TBML Review"),
      S("Invoice Analysis"),
      S("Pricing Discrepancy Detection"),
      S("Third-Party Payment Investigation"),
    ],
    requiredReasoning: [
      R("TBML Pattern Reasoning"),
      R("Invoice Pricing Reasoning"),
      R("Third-Party Payment Logic"),
    ],
    requiredAnalysis: [
      A("Trade-Based Money Laundering Analysis"),
      A("Over-Invoice Analysis"),
      A("Under-Invoice Analysis"),
      A("Pricing Discrepancy Analysis"),
      A("Third-Party Payment Analysis"),
    ],
    requiredAnchors: ["anchor-fatf-r-20", "anchor-moe-circular-3-2025"],
    charterArticles: ["P5", "P6"],
    slaHours: 120,
  },
  {
    id: "playbook-structuring",
    name: "Structuring / smurfing",
    summary: "Multiple sub-threshold cash deposits designed to evade CTR reporting.",
    triggers: [
      "≥3 transactions within 48h at >85% of CTR",
      "velocity anomaly",
      "multiple counterparties same beneficiary",
    ],
    requiredSkills: [
      S("Structuring Detection"),
      S("Smurfing Detection"),
      S("Velocity Anomaly Detection"),
      S("Threshold Alert Review"),
    ],
    requiredReasoning: [
      R("Structuring Pattern Reasoning"),
      R("Smurfing Pattern Reasoning"),
      R("Velocity Anomaly Reasoning"),
    ],
    requiredAnalysis: [
      A("Structuring Investigation"),
      A("Smurfing Investigation"),
      A("Velocity Analysis"),
      A("Placement/Layering/Integration Staging"),
    ],
    requiredAnchors: ["anchor-fatf-r-20", "anchor-cabinet-res-134-2025-art-12-14"],
    charterArticles: ["P5", "P6"],
    slaHours: 72,
  },
  {
    id: "playbook-vasp-mixer",
    name: "VASP · mixer inbound",
    summary:
      "Virtual-asset inflow from a privacy mixer or high-risk VASP — trace provenance, evaluate MASP risk.",
    triggers: [
      "wallet with Tornado/Mixer heuristic hit",
      "VASP not licensed under VARA/FATF R.15",
    ],
    requiredSkills: [
      S("Digital Asset Compliance"),
      S("Cryptocurrencies Monitoring"),
      S("Virtual Assets Screening"),
    ],
    requiredReasoning: [
      R("Digital Asset Reasoning"),
      R("VARA Reasoning"),
      R("Corporate Structure Unraveling"),
    ],
    requiredAnalysis: [
      A("Digital Asset Deep Analysis"),
      A("Cryptocurrency Analysis"),
      A("Virtual Asset Analysis"),
      A("VARA Framework Analysis"),
    ],
    requiredAnchors: ["anchor-fatf-r-15", "anchor-fatf-r-16", "anchor-vara-vasp-rulebook-2024"],
    charterArticles: ["P2", "P6"],
    slaHours: 96,
  },
  {
    id: "playbook-ubo-opaque",
    name: "UBO · opaque ownership chain",
    summary:
      "Layered ownership obscures the natural-person UBO — trace to ≥25% or until transparency achieved.",
    triggers: [
      "Layer 3+ UBO unresolved",
      "bearer-share company in chain",
      "nominee director pattern",
    ],
    requiredSkills: [
      S("UBO Tracing"),
      S("Corporate Structure Analysis"),
      S("Beneficial Owner Identification"),
    ],
    requiredReasoning: [R("Beneficial Owner Tracing Logic"), R("Corporate Structure Unraveling")],
    requiredAnalysis: [
      A("UBO Beneficial Ownership Mapping"),
      A("Corporate Structure Analysis"),
      A("Beneficial Owner Verification"),
    ],
    requiredAnchors: ["anchor-fatf-r-24", "anchor-fatf-r-25", "anchor-cabinet-res-16-2021"],
    charterArticles: ["P2", "P10"],
    slaHours: 120,
  },
  {
    id: "playbook-correspondent-nested",
    name: "Correspondent banking · nested relationship",
    summary:
      "A respondent bank's customer accessing correspondent services — apply R.13 EDD and senior approval.",
    triggers: ["nested respondent discovered", "correspondent relationship in high-risk jurisdiction"],
    requiredSkills: [S("Counterparty Due Diligence"), S("Senior Management Briefing")],
    requiredReasoning: [R("Geographic Risk Reasoning"), R("Proportionality Assessment")],
    requiredAnalysis: [A("Counterparty Risk Analysis"), A("Third-Party Risk Assessment")],
    requiredAnchors: ["anchor-fatf-r-13"],
    charterArticles: ["P1", "P2"],
    slaHours: 168,
  },
  {
    id: "playbook-adverse-media",
    name: "Adverse media · deep review",
    summary:
      "Credible adverse media surfaces — triangulate sources, assess materiality, evidence MLRO disposition.",
    triggers: [
      "≥3 credible adverse sources",
      "regulatory/criminal allegation",
      "sanctions-evasion narrative",
    ],
    requiredSkills: [S("Adverse Media Screening"), S("Investigative Competence")],
    requiredReasoning: [R("Adverse Media Assessment"), R("Materiality Assessment")],
    requiredAnalysis: [A("Adverse Media Deep Review"), A("Industry Precedent Analysis")],
    requiredAnchors: ["anchor-fatf-r-10", "anchor-fatf-r-12"],
    charterArticles: ["P2", "P3"],
    slaHours: 72,
  },
  {
    id: "playbook-pdpl-processing",
    name: "PDPL · AML processing lawful basis",
    summary:
      "Process personal data for AML purposes under legal-obligation lawful basis; enforce minimisation + retention.",
    triggers: ["new customer record", "cross-border processing", "data breach"],
    requiredSkills: [S("PDPL Data Privacy"), S("Data Breach Response"), S("Record-Keeping")],
    requiredReasoning: [R("PDPL Application Reasoning"), R("Consent Reasoning")],
    requiredAnalysis: [A("PDPL Data Privacy Analysis")],
    requiredAnchors: [
      "anchor-fdl-45-2021-art-6",
      "anchor-fdl-45-2021-art-13",
      "anchor-fdl-10-2025-art-20",
    ],
    charterArticles: ["P10"],
    slaHours: 24,
  },
]);

export function regulatoryPlaybookById(id: string): RegulatoryPlaybook | undefined {
  return REGULATORY_PLAYBOOKS.find((p) => p.id === id);
}
