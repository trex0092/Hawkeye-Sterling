import type { FacultyFilter, ReasoningMode, ReasoningPreset } from "@/lib/types";

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

export const MODES: ReasoningMode[] = [
  { id: "RM-001", name: "Modus Ponens", faculty: "reasoning" },
  { id: "RM-002", name: "Modus Tollens", faculty: "reasoning" },
  { id: "RM-003", name: "Hypothetical Syllogism", faculty: "reasoning" },
  { id: "RM-004", name: "Disjunctive Syllogism", faculty: "reasoning" },
  { id: "RM-005", name: "Constructive Dilemma", faculty: "reasoning" },
  { id: "RM-006", name: "Reductio ad Absurdum", faculty: "reasoning" },
  { id: "RM-007", name: "Paraconsistent Logic", faculty: "reasoning" },
  { id: "RM-008", name: "Modal Possibility", faculty: "reasoning" },

  { id: "RM-012", name: "Bayesian Update", faculty: "inference" },
  { id: "RM-013", name: "Likelihood Ratio", faculty: "inference" },
  { id: "RM-014", name: "Prior Elicitation", faculty: "inference" },
  { id: "RM-015", name: "Posterior Fusion", faculty: "inference" },
  { id: "RM-016", name: "Bayesian Network", faculty: "inference" },
  { id: "RM-017", name: "Markov Blanket", faculty: "inference" },
  { id: "RM-018", name: "Conditional Independence", faculty: "inference" },
  { id: "RM-019", name: "Abductive Inference", faculty: "inference" },
  { id: "RM-020", name: "Inverse Probability", faculty: "inference" },
  { id: "RM-021", name: "Maximum Likelihood", faculty: "inference" },

  { id: "RM-027", name: "Causal Graph Analysis", faculty: "deep-thinking" },
  { id: "RM-028", name: "Do-Calculus", faculty: "deep-thinking" },
  { id: "RM-029", name: "Confounder Detection", faculty: "deep-thinking" },
  { id: "RM-030", name: "Steelman Argument", faculty: "deep-thinking" },
  { id: "RM-034", name: "Counterfactual Reasoning", faculty: "deep-thinking" },
  { id: "RM-035", name: "Pre-Mortem Analysis", faculty: "deep-thinking" },

  { id: "RM-045", name: "Pattern Matching", faculty: "data-analysis" },
  { id: "RM-046", name: "Levenshtein Distance", faculty: "data-analysis" },
  { id: "RM-047", name: "Jaro-Winkler", faculty: "data-analysis" },
  { id: "RM-048", name: "Double Metaphone", faculty: "data-analysis" },
  { id: "RM-056", name: "Anomaly Detection", faculty: "data-analysis" },
  { id: "RM-078", name: "Time-Series Analysis", faculty: "data-analysis" },

  { id: "RM-089", name: "Network Analysis", faculty: "intelligence" },
  { id: "RM-090", name: "Link Analysis", faculty: "intelligence" },
  { id: "RM-091", name: "Community Detection", faculty: "intelligence" },
  { id: "RM-092", name: "Centrality Metrics", faculty: "intelligence" },
  { id: "RM-102", name: "Entity Resolution", faculty: "intelligence" },
  { id: "RM-115", name: "UBO Trace", faculty: "intelligence" },
  { id: "RM-128", name: "Bearer Share Detection", faculty: "intelligence" },
  { id: "RM-143", name: "Layering Detection", faculty: "intelligence" },

  { id: "RM-156", name: "Structuring Analysis", faculty: "smartness" },
  { id: "RM-178", name: "TBML Red-Flag", faculty: "smartness" },
  { id: "RM-192", name: "CAHRA Refiner", faculty: "smartness" },
  { id: "RM-205", name: "Mixer Heuristic", faculty: "smartness" },
  { id: "RM-218", name: "PEP Proximity", faculty: "smartness" },
  { id: "RM-231", name: "Correspondent Nesting", faculty: "smartness" },
  { id: "RM-244", name: "BEC Typosquat", faculty: "smartness" },

  { id: "RM-260", name: "Dialectical Synthesis", faculty: "argumentation" },
  { id: "RM-261", name: "Toulmin Argument Mapping", faculty: "argumentation" },
  { id: "RM-262", name: "Rebuttal Tree", faculty: "argumentation" },
  { id: "RM-263", name: "Evidence Weighting", faculty: "argumentation" },
  { id: "RM-264", name: "Claim Adjudication", faculty: "argumentation" },
  { id: "RM-265", name: "Devil's Advocate", faculty: "argumentation" },

  { id: "RM-301", name: "Popper Falsification", faculty: "introspection" },
  { id: "RM-302", name: "Cognitive Bias Audit", faculty: "introspection" },
  { id: "RM-303", name: "Confidence Calibration", faculty: "introspection" },
  { id: "RM-304", name: "Source Triangulation", faculty: "introspection" },
  { id: "RM-305", name: "Occam vs Conspiracy", faculty: "introspection" },
  { id: "RM-306", name: "Chain Quality Audit", faculty: "introspection" },
  { id: "RM-307", name: "Coverage Gap Detection", faculty: "introspection" },
  { id: "RM-308", name: "Meta-Confidence Adjust", faculty: "introspection" },

  { id: "RM-420", name: "Charter P1–P10 Gate", faculty: "ratiocination" },
  { id: "RM-421", name: "Redline Veto", faculty: "ratiocination" },
  { id: "RM-422", name: "Four-Eyes Verification", faculty: "ratiocination" },
  { id: "RM-423", name: "Tipping-Off Guard", faculty: "ratiocination" },
  { id: "RM-424", name: "FDL 10/2025 Conformity", faculty: "ratiocination" },
  { id: "RM-425", name: "Cabinet Res 74/2020 Check", faculty: "ratiocination" },
  { id: "RM-426", name: "LBMA RGG v9 Step 3", faculty: "ratiocination" },
  { id: "RM-427", name: "goAML Schema Validation", faculty: "ratiocination" },
  { id: "RM-428", name: "Ten-Year Retention Proof", faculty: "ratiocination" },
  { id: "RM-429", name: "Tamper-Evident Chain", faculty: "ratiocination" },
  { id: "RM-430", name: "Egress Policy Gate", faculty: "ratiocination" },
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
