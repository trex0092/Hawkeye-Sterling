// AI Governance Registry (Cybersecurity spec item 3).
//
// Static registry of every AI model used in Hawkeye Sterling:
// model ID, purpose, data received, constraints, and FDL reference.
// Satisfies the "Inventory AI systems, models and data flows" checklist
// item from the Leader's Action Checklist (AI vs Cybersecurity framework).

export interface ModelRegistryEntry {
  modelId:         string;
  purpose:         string;
  invokedFrom:     string[];   // route paths
  dataReceived:    string[];   // field names / categories
  maxTokens:       number;
  timeoutMs:       number;
  humanReviewRequired: boolean;
  fdlReference:    string;
  constraints:     string[];
  registeredAt:    string;     // ISO date this entry was added
}

export interface GovernancePolicy {
  policyVersion:   string;
  effectiveDate:   string;
  attestation:     string;
  principles:      string[];
  prohibitions:    string[];
  reviewCycle:     string;
}

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  {
    modelId:     "claude-haiku-4-5-20251001",
    purpose:     "Sanctions screening disambiguation (smart-disambiguate)",
    invokedFrom: ["/api/smart-disambiguate", "/api/hs-cases/[caseId]/enrich"],
    dataReceived: ["subjectName (PII-guarded)", "sanctionsHits", "riskContext"],
    maxTokens:   1500,
    timeoutMs:   55_000,
    humanReviewRequired: true,
    fdlReference: "FDL No.10/2025 Art.18 — all AI outputs require MLRO human review",
    constraints: [
      "Output is advisory only — no autonomous compliance action",
      "PII is masked before transmission via getAnthropicClient guard",
      "Response truncated to 500 chars in audit trail",
    ],
    registeredAt: "2025-05-20",
  },
  {
    modelId:     "claude-haiku-4-5-20251001",
    purpose:     "AI decision engine (risk disposition)",
    invokedFrom: ["/api/ai-decision"],
    dataReceived: ["subjectName (PII-guarded)", "riskScore", "sanctionsHits", "adverseMedia", "pepTier", "exposureAED"],
    maxTokens:   1500,
    timeoutMs:   25_000,
    humanReviewRequired: true,
    fdlReference: "FDL No.10/2025 Art.18",
    constraints: [
      "Disposition is advisory — MLRO must sign off before any action",
      "Four-eyes required for STR filing (FDL Art.16)",
      "Rule-based fallback if Claude is unavailable",
    ],
    registeredAt: "2025-05-20",
  },
  {
    modelId:     "claude-haiku-4-5-20251001",
    purpose:     "MLRO advisor — balanced / speed mode (screening advisor)",
    invokedFrom: ["/api/mlro-advisor"],
    dataReceived: ["subjectName (PII-guarded)", "riskSignals", "question"],
    maxTokens:   1500,
    timeoutMs:   15_000,
    humanReviewRequired: true,
    fdlReference: "FDL No.10/2025 Art.18",
    constraints: [
      "Multi-perspective consensus (executor/advisor/challenger) for complex queries",
      "Uncertainty explicitly stated — no false confidence",
    ],
    registeredAt: "2025-05-20",
  },
  {
    modelId:     "claude-sonnet-4-6",
    purpose:     "MLRO advisor — deep analysis mode",
    invokedFrom: ["/api/mlro-advisor"],
    dataReceived: ["subjectName (PII-guarded)", "riskSignals", "question"],
    maxTokens:   2000,
    timeoutMs:   45_000,
    humanReviewRequired: true,
    fdlReference: "FDL No.10/2025 Art.18",
    constraints: [
      "Only invoked when mode=deep is explicitly requested",
      "Higher latency accepted for complex regulatory analysis",
    ],
    registeredAt: "2025-05-20",
  },
  {
    modelId:     "claude-haiku-4-5-20251001",
    purpose:     "Adverse media classification (22-language keyword + AI scoring)",
    invokedFrom: ["/api/quick-screen", "/api/screening/run"],
    dataReceived: ["newsArticles (no PII)", "keywords"],
    maxTokens:   600,
    timeoutMs:   8_000,
    humanReviewRequired: false,
    fdlReference: "FATF R.10 — adverse media screening",
    constraints: [
      "News article text only — no subject PII transmitted",
      "Result feeds into composite risk score reviewed by MLRO",
    ],
    registeredAt: "2025-05-20",
  },
];

export const GOVERNANCE_POLICY: GovernancePolicy = {
  policyVersion: "1.0.0",
  effectiveDate: "2025-05-20",
  attestation:
    "All AI models used in Hawkeye Sterling operate in an advisory capacity only. " +
    "No autonomous compliance action is taken based solely on AI output. " +
    "All AI-generated outputs require MLRO human review before any compliance action " +
    "(FDL No.10/2025 Art.18). Two distinct approvers are required for STR filing " +
    "(FDL Art.16, FATF R.26). All AI invocations are logged to the HMAC-signed audit chain.",
  principles: [
    "Human oversight — MLRO review required for all AI outputs",
    "Explainability — every decision includes rationale and regulatory basis",
    "Non-discrimination — bias monitoring across 9 name-script groups (FATF R.10)",
    "Transparency — full model registry published at /api/ai-governance",
    "Data minimisation — PII masked before transmission to AI models",
    "Audit trail — all AI invocations HMAC-signed and append-only",
    "Resilience — rule-based fallback when AI is unavailable",
  ],
  prohibitions: [
    "Autonomous STR filing without dual human sign-off",
    "Case closure without recorded disposition verdict and rationale",
    "Sending raw PII (passport numbers, full DOB) to AI models",
    "Using AI output as sole basis for freezing transactions",
    "Suppressing or modifying existing audit chain entries",
  ],
  reviewCycle: "Quarterly — next review due 2025-08-20",
};
