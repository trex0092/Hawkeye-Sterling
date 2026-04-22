import type { FacultyFilter, ReasoningMode, ReasoningPreset } from "@/lib/types";
import { slugifyTaxonomyName } from "@/lib/data/taxonomy";

export const TOTAL_MODES = 690;

export const FACULTY_FILTERS: FacultyFilter[] = [
  { key: "all", label: "All modes", count: "690" },
  { key: "reasoning", label: "Reasoning", count: "78" },
  { key: "data-analysis", label: "Data Analysis", count: "64" },
  { key: "deep-thinking", label: "Deep Thinking", count: "52" },
  { key: "intelligence", label: "Intelligence", count: "88" },
  { key: "smartness", label: "Smartness", count: "71" },
  { key: "inference", label: "Inference", count: "94" },
  { key: "argumentation", label: "Argumentation", count: "58" },
  { key: "introspection", label: "Introspection", count: "82" },
  { key: "ratiocination", label: "Ratiocination", count: "103" },
];

// ── Taxonomy-ID helpers ─────────────────────────────────────────────────────
// Strings MUST match the names in web/lib/data/taxonomy.ts byte-for-byte so the
// slugified ID lines up with the exported TAXONOMY. A mismatch produces a
// dangling reference — caught by coverage audits but silent at runtime.
const s = (...names: string[]): string[] =>
  names.map((n) => `skills-${slugifyTaxonomyName(n)}`);
const r = (...names: string[]): string[] =>
  names.map((n) => `reasoning-${slugifyTaxonomyName(n)}`);
const a = (...names: string[]): string[] =>
  names.map((n) => `analysis-${slugifyTaxonomyName(n)}`);

export const MODES: ReasoningMode[] = [
  {
    id: "RM-001",
    name: "Modus Ponens",
    faculty: "reasoning",
    taxonomyIds: [
      ...r("Regulatory Inference", "Precedent-Based Reasoning", "Policy Application Reasoning"),
    ],
  },
  {
    id: "RM-002",
    name: "Modus Tollens",
    faculty: "reasoning",
    taxonomyIds: [...r("Regulatory Inference", "False Positive Determination")],
  },
  {
    id: "RM-003",
    name: "Hypothetical Syllogism",
    faculty: "reasoning",
    taxonomyIds: [...r("Regulatory Inference", "Control Effectiveness Reasoning")],
  },
  {
    id: "RM-004",
    name: "Disjunctive Syllogism",
    faculty: "reasoning",
    taxonomyIds: [...r("Regulatory Inference", "Proportionality Assessment")],
  },
  {
    id: "RM-005",
    name: "Constructive Dilemma",
    faculty: "reasoning",
    taxonomyIds: [...r("Escalation Logic", "Proportionality Assessment")],
  },
  {
    id: "RM-006",
    name: "Reductio ad Absurdum",
    faculty: "reasoning",
    taxonomyIds: [...r("Precedent-Based Reasoning", "MLRO Judgment")],
  },
  {
    id: "RM-007",
    name: "Paraconsistent Logic",
    faculty: "reasoning",
    taxonomyIds: [...r("Materiality Assessment", "MLRO Judgment")],
  },
  {
    id: "RM-008",
    name: "Modal Possibility",
    faculty: "reasoning",
    taxonomyIds: [...r("Likelihood & Impact Assessment", "Proportionality Assessment")],
  },

  {
    id: "RM-012",
    name: "Bayesian Update",
    faculty: "inference",
    taxonomyIds: [
      ...s("Risk Assessment Proficiency"),
      ...r("Risk Scoring Logic", "Inherent Risk Logic", "Residual Risk Logic", "Indicator Weighting"),
      ...a("Customer Risk Scoring"),
    ],
  },
  {
    id: "RM-013",
    name: "Likelihood Ratio",
    faculty: "inference",
    taxonomyIds: [...r("Likelihood & Impact Assessment", "Risk Scoring Logic")],
  },
  {
    id: "RM-014",
    name: "Prior Elicitation",
    faculty: "inference",
    taxonomyIds: [...r("Inherent Risk Logic", "Risk Scoring Logic")],
  },
  {
    id: "RM-015",
    name: "Posterior Fusion",
    faculty: "inference",
    taxonomyIds: [...r("Red Flag Correlation", "Indicator Weighting")],
  },
  {
    id: "RM-016",
    name: "Bayesian Network",
    faculty: "inference",
    taxonomyIds: [...r("Transaction Pattern Reasoning", "Indicator Weighting")],
  },
  {
    id: "RM-017",
    name: "Markov Blanket",
    faculty: "inference",
    taxonomyIds: [...a("Pattern Detection")],
  },
  {
    id: "RM-018",
    name: "Conditional Independence",
    faculty: "inference",
    taxonomyIds: [...r("Indicator Weighting", "Red Flag Correlation")],
  },
  {
    id: "RM-019",
    name: "Abductive Inference",
    faculty: "inference",
    taxonomyIds: [...r("Suspicious Activity Assessment", "Red Flag Correlation")],
  },
  {
    id: "RM-020",
    name: "Inverse Probability",
    faculty: "inference",
    taxonomyIds: [...r("Risk Scoring Logic", "False Positive Determination")],
  },
  {
    id: "RM-021",
    name: "Maximum Likelihood",
    faculty: "inference",
    taxonomyIds: [...r("Risk Scoring Logic")],
  },

  {
    id: "RM-027",
    name: "Causal Graph Analysis",
    faculty: "deep-thinking",
    taxonomyIds: [
      ...r("Transaction Pattern Reasoning", "Supply Chain Risk Logic"),
      ...a("Circular Transaction Analysis"),
    ],
  },
  {
    id: "RM-028",
    name: "Do-Calculus",
    faculty: "deep-thinking",
    taxonomyIds: [...r("Proportionate Response Determination", "MLRO Judgment")],
  },
  {
    id: "RM-029",
    name: "Confounder Detection",
    faculty: "deep-thinking",
    taxonomyIds: [...r("False Positive Determination"), ...a("False Positive Root Cause Analysis")],
  },
  {
    id: "RM-030",
    name: "Steelman Argument",
    faculty: "deep-thinking",
    taxonomyIds: [...s("Judgment and Discretion"), ...r("MLRO Judgment")],
  },
  {
    id: "RM-034",
    name: "Counterfactual Reasoning",
    faculty: "deep-thinking",
    taxonomyIds: [...r("MLRO Judgment", "Proportionality Assessment")],
  },
  {
    id: "RM-035",
    name: "Pre-Mortem Analysis",
    faculty: "deep-thinking",
    taxonomyIds: [
      ...s("Examination Preparation"),
      ...r("Examination Preparation Logic"),
      ...a("Examination Preparation Analysis"),
    ],
  },

  {
    id: "RM-045",
    name: "Pattern Matching",
    faculty: "data-analysis",
    taxonomyIds: [
      ...s("Red Flag Recognition"),
      ...r("Transaction Pattern Reasoning", "Red Flag Correlation"),
      ...a("Pattern Detection"),
    ],
  },
  {
    id: "RM-046",
    name: "Levenshtein Distance",
    faculty: "data-analysis",
    taxonomyIds: [
      ...s("Sanctions Screening Capability"),
      ...r("Screening Match Assessment"),
      ...a("Screening Match Validation", "Match Validation"),
    ],
  },
  {
    id: "RM-047",
    name: "Jaro-Winkler",
    faculty: "data-analysis",
    taxonomyIds: [
      ...s("Sanctions Screening Capability"),
      ...a("Screening Match Validation"),
    ],
  },
  {
    id: "RM-048",
    name: "Double Metaphone",
    faculty: "data-analysis",
    taxonomyIds: [
      ...s("Sanctions Screening Capability"),
      ...a("Screening Match Validation"),
    ],
  },
  {
    id: "RM-056",
    name: "Anomaly Detection",
    faculty: "data-analysis",
    taxonomyIds: [
      ...s("Velocity Anomaly Detection"),
      ...r("Velocity Anomaly Reasoning", "Transaction Pattern Reasoning"),
      ...a("Velocity Analysis", "Pattern Detection"),
    ],
  },
  {
    id: "RM-078",
    name: "Time-Series Analysis",
    faculty: "data-analysis",
    taxonomyIds: [
      ...r("Velocity Anomaly Reasoning", "Transaction Pattern Reasoning"),
      ...a("Velocity Analysis", "Transaction Volume Investigation"),
    ],
  },

  {
    id: "RM-089",
    name: "Network Analysis",
    faculty: "intelligence",
    taxonomyIds: [
      ...s("UBO Tracing", "Corporate Structure Analysis"),
      ...r("Corporate Structure Unraveling", "Beneficial Owner Tracing Logic"),
      ...a("UBO Beneficial Ownership Mapping", "Corporate Structure Analysis"),
    ],
  },
  {
    id: "RM-090",
    name: "Link Analysis",
    faculty: "intelligence",
    taxonomyIds: [
      ...r("PEP Connection Reasoning", "Corporate Structure Unraveling"),
      ...a("Family Connection Tracing", "PEP & Corruption Investigation"),
    ],
  },
  {
    id: "RM-091",
    name: "Community Detection",
    faculty: "intelligence",
    taxonomyIds: [...a("Circular Transaction Analysis", "Suspicious Pattern Investigation")],
  },
  {
    id: "RM-092",
    name: "Centrality Metrics",
    faculty: "intelligence",
    taxonomyIds: [...a("UBO Beneficial Ownership Mapping")],
  },
  {
    id: "RM-102",
    name: "Entity Resolution",
    faculty: "intelligence",
    taxonomyIds: [
      ...s("Sanctions Screening Capability"),
      ...r("Screening Match Assessment"),
      ...a("Screening Match Validation", "Match Validation"),
    ],
  },
  {
    id: "RM-115",
    name: "UBO Trace",
    faculty: "intelligence",
    taxonomyIds: [
      ...s("UBO Tracing", "Beneficial Owner Identification"),
      ...r("Beneficial Owner Tracing Logic", "Corporate Structure Unraveling"),
      ...a("UBO Beneficial Ownership Mapping", "Beneficial Owner Verification"),
    ],
  },
  {
    id: "RM-128",
    name: "Bearer Share Detection",
    faculty: "intelligence",
    taxonomyIds: [
      ...s("UBO Tracing"),
      ...r("Corporate Structure Unraveling"),
      ...a("Corporate Structure Analysis"),
    ],
  },
  {
    id: "RM-143",
    name: "Layering Detection",
    faculty: "intelligence",
    taxonomyIds: [
      ...s("Structuring Detection", "Smurfing Detection"),
      ...r("TBML Pattern Reasoning", "Structuring Pattern Reasoning"),
      ...a("Placement/Layering/Integration Staging", "Structuring Investigation"),
    ],
  },

  {
    id: "RM-156",
    name: "Structuring Analysis",
    faculty: "smartness",
    taxonomyIds: [
      ...s("Structuring Detection", "Threshold Alert Review"),
      ...r("Structuring Pattern Reasoning", "Smurfing Pattern Reasoning"),
      ...a("Structuring Investigation", "Smurfing Investigation", "TBML Red Flag Analysis"),
    ],
  },
  {
    id: "RM-178",
    name: "TBML Red-Flag",
    faculty: "smartness",
    taxonomyIds: [
      ...s("TBML Review", "Invoice Analysis", "Pricing Discrepancy Detection"),
      ...r("TBML Pattern Reasoning", "Invoice Pricing Reasoning"),
      ...a(
        "Trade-Based Money Laundering Analysis",
        "Invoice Pricing Analysis",
        "Over-Invoice Analysis",
        "Under-Invoice Analysis",
      ),
    ],
  },
  {
    id: "RM-192",
    name: "CAHRA Refiner",
    faculty: "smartness",
    taxonomyIds: [
      ...s("CAHRA Assessment", "Refinery Evaluation", "Conflict Minerals Assessment"),
      ...r(
        "CAHRA Determination",
        "Conflict Zone Identification",
        "Refinery Assessment Reasoning",
        "LBMA RGG Logic",
      ),
      ...a(
        "CAHRA Assessment",
        "Conflict-Affected Area Analysis",
        "Refinery Due Diligence",
        "Refinery Compliance Evaluation",
        "Conflict Minerals Analysis",
      ),
    ],
  },
  {
    id: "RM-205",
    name: "Mixer Heuristic",
    faculty: "smartness",
    taxonomyIds: [
      ...s("Digital Asset Compliance", "Cryptocurrencies Monitoring", "Virtual Assets Screening"),
      ...r("Digital Asset Reasoning", "VARA Reasoning"),
      ...a("Digital Asset Deep Analysis", "Cryptocurrency Analysis", "Virtual Asset Analysis"),
    ],
  },
  {
    id: "RM-218",
    name: "PEP Proximity",
    faculty: "smartness",
    taxonomyIds: [
      ...s("PEP Identification", "Adverse Media Screening"),
      ...r("PEP Connection Reasoning", "Adverse Media Assessment"),
      ...a("PEP & Corruption Investigation", "Adverse Media Deep Review"),
    ],
  },
  {
    id: "RM-231",
    name: "Correspondent Nesting",
    faculty: "smartness",
    taxonomyIds: [
      ...s("Counterparty Due Diligence"),
      ...a("Counterparty Risk Analysis", "Third-Party Risk Assessment"),
    ],
  },
  {
    id: "RM-244",
    name: "BEC Typosquat",
    faculty: "smartness",
    taxonomyIds: [...s("Red Flag Recognition"), ...r("Red Flag Correlation")],
  },

  {
    id: "RM-260",
    name: "Dialectical Synthesis",
    faculty: "argumentation",
    taxonomyIds: [...r("MLRO Judgment", "Regulatory Interpretation")],
  },
  {
    id: "RM-261",
    name: "Toulmin Argument Mapping",
    faculty: "argumentation",
    taxonomyIds: [...r("MLRO Judgment", "Regulatory Interpretation")],
  },
  {
    id: "RM-262",
    name: "Rebuttal Tree",
    faculty: "argumentation",
    taxonomyIds: [...r("Tipping-Off Analysis"), ...a("Tipping-Off Risk Assessment")],
  },
  {
    id: "RM-263",
    name: "Evidence Weighting",
    faculty: "argumentation",
    taxonomyIds: [
      ...s("Evidence Collection"),
      ...r("Indicator Weighting", "Materiality Assessment"),
      ...a("Audit Trail Forensics"),
    ],
  },
  {
    id: "RM-264",
    name: "Claim Adjudication",
    faculty: "argumentation",
    taxonomyIds: [...r("MLRO Judgment", "Regulatory Interpretation")],
  },
  {
    id: "RM-265",
    name: "Devil's Advocate",
    faculty: "argumentation",
    taxonomyIds: [...s("Judgment and Discretion"), ...r("MLRO Judgment")],
  },

  {
    id: "RM-301",
    name: "Popper Falsification",
    faculty: "introspection",
    taxonomyIds: [...r("MLRO Judgment")],
  },
  {
    id: "RM-302",
    name: "Cognitive Bias Audit",
    faculty: "introspection",
    taxonomyIds: [...r("MLRO Judgment", "Control Effectiveness Judgment")],
  },
  {
    id: "RM-303",
    name: "Confidence Calibration",
    faculty: "introspection",
    taxonomyIds: [...r("MLRO Judgment", "Control Effectiveness Judgment")],
  },
  {
    id: "RM-304",
    name: "Source Triangulation",
    faculty: "introspection",
    taxonomyIds: [
      ...s("Investigative Competence"),
      ...r("Precedent-Based Reasoning"),
      ...a("Industry Precedent Analysis"),
    ],
  },
  {
    id: "RM-305",
    name: "Occam vs Conspiracy",
    faculty: "introspection",
    taxonomyIds: [...r("MLRO Judgment", "Proportionality Assessment")],
  },
  {
    id: "RM-306",
    name: "Chain Quality Audit",
    faculty: "introspection",
    taxonomyIds: [
      ...r("Audit Trail Integrity Assessment"),
      ...a("Audit Trail Forensics", "Audit Trail Analysis"),
    ],
  },
  {
    id: "RM-307",
    name: "Coverage Gap Detection",
    faculty: "introspection",
    taxonomyIds: [...r("Gap Assessment Reasoning"), ...a("Gap Analysis", "Policy Gap Analysis")],
  },
  {
    id: "RM-308",
    name: "Meta-Confidence Adjust",
    faculty: "introspection",
    taxonomyIds: [...r("Control Effectiveness Judgment", "MLRO Judgment")],
  },

  {
    id: "RM-420",
    name: "Charter P1–P10 Gate",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("Policy Drafting", "Compliance Documentation"),
      ...r("Policy Application Reasoning", "Proportionality Assessment"),
    ],
  },
  {
    id: "RM-421",
    name: "Redline Veto",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("Tipping-Off Management", "Escalation Management"),
      ...r("Tipping-Off Analysis", "Escalation Logic"),
    ],
  },
  {
    id: "RM-422",
    name: "Four-Eyes Verification",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("MLRO Decision-Making", "Audit Competence"),
      ...r("Authority Assessment", "Reporting Line Assessment"),
    ],
  },
  {
    id: "RM-423",
    name: "Tipping-Off Guard",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("Tipping-Off Management"),
      ...r("Tipping-Off Analysis", "Consent Reasoning"),
      ...a("Tipping-Off Risk Assessment", "Consent Feasibility Analysis"),
    ],
  },
  {
    id: "RM-424",
    name: "FDL 10/2025 Conformity",
    faculty: "ratiocination",
    taxonomyIds: [
      ...r("Cabinet Resolution Reasoning", "Regulatory Interpretation"),
      ...a("Cabinet Resolution Interpretation Analysis"),
    ],
  },
  {
    id: "RM-425",
    name: "Cabinet Res 74/2020 Check",
    faculty: "ratiocination",
    taxonomyIds: [
      ...r("Cabinet Resolution Reasoning", "Sanctions Regime Logic", "TFS Compliance Reasoning"),
      ...a("Cabinet Resolution Interpretation Analysis", "TFS Compliance Deep Analysis"),
    ],
  },
  {
    id: "RM-426",
    name: "LBMA RGG v9 Step 3",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("LBMA RGG Steps 1-5", "Chain-of-Custody Verification"),
      ...r("LBMA RGG Logic", "Supply Chain Risk Logic"),
      ...a(
        "LBMA RGG Steps 1-5 Assessment",
        "LBMA Certification Verification",
        "Chain-of-Custody Verification",
        "Responsible Sourcing Assessment",
      ),
    ],
  },
  {
    id: "RM-427",
    name: "goAML Schema Validation",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("GOAML Reporting", "FIU Correspondence"),
      ...a("FIU Correspondence Analysis", "FIU Filing Pattern Analysis"),
    ],
  },
  {
    id: "RM-428",
    name: "Ten-Year Retention Proof",
    faculty: "ratiocination",
    taxonomyIds: [
      ...s("Record-Keeping", "Compliance Documentation"),
      ...r("Record-Keeping Standard Reasoning", "Documentation Requirement Reasoning"),
      ...a("Record-Keeping Assessment", "Retention Schedule Verification"),
    ],
  },
  {
    id: "RM-429",
    name: "Tamper-Evident Chain",
    faculty: "ratiocination",
    taxonomyIds: [
      ...r("Chain of Custody Reasoning", "Evidence Preservation Logic"),
      ...a("Evidence Preservation Analysis", "Audit Trail Analysis"),
    ],
  },
  {
    id: "RM-430",
    name: "Egress Policy Gate",
    faculty: "ratiocination",
    taxonomyIds: [...s("Tipping-Off Management"), ...r("Tipping-Off Analysis")],
  },
];

export const PRESETS: ReasoningPreset[] = [
  {
    id: "cahra-gold-onboard",
    label: "CAHRA gold · onboard",
    modeIds: ["RM-192", "RM-045", "RM-012", "RM-115", "RM-426"],
  },
  {
    id: "vasp-mixer-inbound",
    label: "VASP · mixer inbound",
    modeIds: ["RM-205", "RM-089", "RM-056", "RM-090"],
  },
  {
    id: "pep-sow-mismatch",
    label: "PEP · SoW mismatch",
    modeIds: ["RM-218", "RM-027", "RM-034", "RM-263"],
  },
  {
    id: "structuring-near-threshold",
    label: "Structuring · near threshold",
    modeIds: ["RM-156", "RM-143", "RM-078", "RM-056"],
  },
  {
    id: "tbml-over-invoice",
    label: "TBML · over-invoice",
    modeIds: ["RM-178", "RM-045", "RM-089", "RM-263"],
  },
  {
    id: "eocn-partial-pnmr",
    label: "EOCN · partial (PNMR)",
    modeIds: ["RM-045", "RM-012", "RM-102", "RM-304"],
  },
  {
    id: "eocn-confirmed-ffr",
    label: "EOCN · confirmed (FFR)",
    modeIds: ["RM-102", "RM-115", "RM-128", "RM-421", "RM-425"],
  },
  {
    id: "ubo-opaque-chain",
    label: "UBO · opaque chain",
    modeIds: ["RM-115", "RM-128", "RM-089", "RM-102"],
  },
  {
    id: "correspondent-nested",
    label: "Correspondent · nested",
    modeIds: ["RM-231", "RM-089", "RM-102", "RM-056"],
  },
  {
    id: "bec-typosquat",
    label: "BEC · typosquat",
    modeIds: ["RM-244", "RM-045", "RM-034", "RM-027"],
  },
];

export const DEFAULT_SELECTED_MODE_IDS = ["RM-001", "RM-012", "RM-056", "RM-143"];
