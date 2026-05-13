// MCP Tool Risk Manifest
// Classifies all 28 Hawkeye Sterling MCP tools by consequence level for audit
// and governance purposes (ISO/IEC 42001, UAE FDL No.10/2025).
//
// Consequence levels:
//   read-only   — no side effects; AI can call freely
//   supervised  — generates documents/scores a human must review before acting
//   action      — creates or modifies external state (use with care)

export type ConsequenceLevel = "read-only" | "supervised" | "action";

export interface ToolManifestEntry {
  level: ConsequenceLevel;
  description: string;
  regulatoryNote?: string;
}

export const TOOL_MANIFEST: Record<string, ToolManifestEntry> = {
  // ── Read-only ─────────────────────────────────────────────────────────────
  smart_disambiguate: {
    level: "read-only",
    description: "Name disambiguation with confidence scoring",
  },
  intel_feed: {
    level: "supervised",
    description: "Adverse intel — GDELT 10-y, Google News RSS (7 locales), or both",
    regulatoryNote: "Art.19 FDL 10/2025 lookback when source includes gdelt — findings require MLRO review",
  },
  pep: {
    level: "supervised",
    description: "PEP profile (depth=0) and association network traversal (depth=1..3)",
    regulatoryNote: "World-Check + LLM assessment — MLRO must review before any compliance decision",
  },
  country_risk: {
    level: "supervised",
    description: "Jurisdiction risk assessment (FATF, CPI, sanctions regime)",
    regulatoryNote: "LLM-generated risk profile — must be reviewed by MLRO before compliance action",
  },
  sanctions_status: {
    level: "read-only",
    description: "Sanctions list freshness and coverage check",
  },
  relationship_graph: {
    level: "read-only",
    description: "Relationship graph — corporate UBO chains, political associates, or both",
  },
  domain_intel: {
    level: "read-only",
    description: "Domain reputation and hosting intelligence",
  },
  vessel_check: {
    level: "read-only",
    description: "Vessel screening by IMO, flag state, sanctions",
  },
  crypto_risk: {
    level: "read-only",
    description: "Blockchain address risk (BTC, ETH, TRON)",
  },
  lei_lookup: {
    level: "read-only",
    description: "LEI lookup with ownership hierarchy",
  },
  typology_match: {
    level: "supervised",
    description: "FATF predicate offence typology matching",
    regulatoryNote: "LLM-generated typology analysis — MLRO must review before any STR/SAR decision",
  },
  get_cases: {
    level: "read-only",
    description: "List compliance cases with status and risk score",
  },
  audit_trail: {
    level: "read-only",
    description: "HMAC-signed immutable audit trail",
  },
  regulatory_feed: {
    level: "read-only",
    description: "Latest UAE AML/CFT regulatory notices",
  },
  compliance_qa: {
    level: "read-only",
    description: "AML/CFT regulatory Q&A (jurisdiction-aware)",
  },
  system_status: {
    level: "read-only",
    description: "Full system health check",
  },

  // ── Supervised ────────────────────────────────────────────────────────────
  // These tools generate documents or risk scores. A human must review
  // the output before taking any compliance action.
  screen: {
    level: "supervised",
    description: "Single or batch subject screening (sanctions, PEP, adverse media) — discriminator is subjects.length",
    regulatoryNote: "Result must be reviewed by MLRO before case action — CR No.134/2025 Art.18",
  },
  super_brain: {
    level: "supervised",
    description: "Full deep analysis with composite risk score",
    regulatoryNote: "AI-generated risk score — human MLRO review required before EDD/escalation",
  },
  generate_report: {
    level: "supervised",
    description: "Compliance report — scope='screening' (14-section SCR) or 'full' (screening + super-brain + audit)",
    regulatoryNote: "AI-generated draft — MLRO must review and sign off before filing",
  },
  generate_sar_report: {
    level: "supervised",
    description: "SAR/STR narrative + GoAML-compatible XML (draft only — filed via FIU GoAML portal)",
    regulatoryNote: "DRAFT only. Human MLRO must file via goaml.uae.gov.ae — FDL 10/2025 Art.32",
  },
  mlro_analyze: {
    level: "supervised",
    description: "MLRO analysis — depth='quick' (single-pass <5s) or 'deep' (executor/advisor/challenger consensus)",
    regulatoryNote: "Advisory output only — final decision rests with human MLRO",
  },
  disposition: {
    level: "supervised",
    description: "Final disposition — mode='automated' (fast AI decide) or 'advisory' (multi-perspective MLRO)",
    regulatoryNote: "Recommendation only — human MLRO must approve any escalation or STR",
  },
  transaction_anomaly: {
    level: "supervised",
    description: "Real-time transaction anomaly scoring",
    regulatoryNote: "Anomaly flags require human review before case creation",
  },

  // ── Action ────────────────────────────────────────────────────────────────
  // These tools can modify external state. Use with explicit intent.
  call_api: {
    level: "action",
    description: "Generic proxy — calls any /api/* endpoint directly",
    regulatoryNote: "Unrestricted API access — only use for endpoints not covered by named tools",
  },
};

export function getToolLevel(toolName: string): ConsequenceLevel {
  return TOOL_MANIFEST[toolName]?.level ?? "action";
}
