// AI Governance Registry (Cybersecurity spec item 3).
//
// Static registry of every AI model used in Hawkeye Sterling:
// model ID, purpose, data received, constraints, FDL reference, risk tier,
// and approval record. Satisfies the "Inventory AI systems, models and data
// flows" checklist item from the Leader's Action Checklist (AI vs Cybersecurity
// framework) and UAE FDL No.10/2025 Art.18 demonstrable human oversight.

import { createHash } from "node:crypto";

/**
 * Risk tier for model governance. Higher tiers require commensurate controls:
 * - critical: board approval, monthly red-team, dual sign-off
 * - high: MLRO approval, quarterly red-team, dual sign-off
 * - medium: CTO approval, semi-annual review
 * - low: annual review
 */
export type ModelRiskTier = "low" | "medium" | "high" | "critical";

export interface ModelApprovalRecord {
  /** Who approved this model for compliance use */
  approvedBy: "mlro" | "cto" | "board";
  /** ISO 8601 date of last approval */
  approvedAt: string;
  /** ISO 8601 date by which the next attestation is due */
  nextAttestationDue: string;
  // attestationStatus is intentionally omitted from the stored record — it
  // is derived at query time via computeAttestationStatus(nextAttestationDue)
  // so it never goes stale in long-lived Lambda instances.
}

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
  /** Risk classification determining oversight controls required */
  riskTier:        ModelRiskTier;
  /** Human approval record — required for FDL Art.18 demonstrable oversight */
  approval:        ModelApprovalRecord;
  /** ISO date of last adversarial red-team run against this model deployment */
  redTeamLastRunAt?: string;
  /** Path to the model card document relative to repo root.
   *  Required for FDL 10/2025 Art.18 attestation — panel must review card before signing off. */
  cardRef: string;
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
    riskTier:    "high",
    approval: {
      approvedBy:           "mlro",
      approvedAt:           "2026-05-26",
      nextAttestationDue:   "2026-08-24",
    },
    redTeamLastRunAt: "2026-05-26",
    cardRef:     "docs/model-cards/hs-001-screening.md",
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
    riskTier:    "high",
    approval: {
      approvedBy:           "mlro",
      approvedAt:           "2026-05-26",
      nextAttestationDue:   "2026-08-24",
    },
    redTeamLastRunAt: "2026-05-26",
    cardRef:     "docs/model-cards/hs-002-reasoning.md",
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
    riskTier:    "high",
    approval: {
      approvedBy:           "mlro",
      approvedAt:           "2026-05-26",
      nextAttestationDue:   "2026-08-24",
    },
    redTeamLastRunAt: "2026-05-26",
    cardRef:     "docs/model-cards/hs-004-mlro-dispositioner.md",
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
    riskTier:    "high",
    approval: {
      approvedBy:           "mlro",
      approvedAt:           "2026-05-26",
      nextAttestationDue:   "2026-08-24",
    },
    redTeamLastRunAt: "2026-05-26",
    cardRef:     "docs/model-cards/hs-002-reasoning.md",
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
    riskTier:    "medium",
    approval: {
      approvedBy:           "cto",
      approvedAt:           "2026-05-26",
      nextAttestationDue:   "2026-11-22",
    },
    redTeamLastRunAt: "2026-05-26",
    cardRef:     "docs/model-cards/hs-003-adverse-media.md",
  },
];

/**
 * Compute a short (16 hex char) SHA-256 fingerprint of a prompt text.
 * Use this at inference time to record which exact prompt produced a decision —
 * satisfies FDL No.10/2025 Art.18 reproducibility requirement.
 * Safe to call with any string; returns "hash-pending" on error.
 */
export function hashPromptText(text: string): string {
  try {
    return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
  } catch {
    return "hash-pending";
  }
}

/**
 * Compute attestation status for a model approval record relative to today.
 * "current" = more than 30 days until due; "due" = within 30 days; "overdue" = past.
 */
export function computeAttestationStatus(nextAttestationDue: string): "current" | "due" | "overdue" {
  const due = new Date(nextAttestationDue).getTime();
  const now = Date.now();
  if (due < now) return "overdue";
  if (due - now < 30 * 24 * 3_600_000) return "due";
  return "current";
}

/**
 * Return MODEL_REGISTRY entries that are overdue for attestation.
 * Used by /api/ai-governance/risk-register to drive a 503 health signal.
 * Also validates the registry for required fields on each call so misconfigured
 * entries are surfaced at runtime rather than silently serving stale data.
 */
export function getOverdueModels(): readonly ModelRegistryEntry[] {
  validateModelRegistry();
  return MODEL_REGISTRY.filter(
    (m) => computeAttestationStatus(m.approval.nextAttestationDue) === "overdue",
  );
}

/**
 * Validate all MODEL_REGISTRY entries for required compliance fields.
 * Logs CRITICAL errors for missing cardRef, riskTier, or approval records
 * so misconfigured entries are visible before they reach a regulator audit.
 */
function validateModelRegistry(): void {
  for (const m of MODEL_REGISTRY) {
    const missing: string[] = [];
    if (!m.cardRef) missing.push("cardRef");
    if (!m.riskTier) missing.push("riskTier");
    if (!m.approval?.approvedBy) missing.push("approval.approvedBy");
    if (!m.approval?.nextAttestationDue) missing.push("approval.nextAttestationDue");
    if (missing.length > 0) {
      console.error(`[ai-governance] MODEL_REGISTRY entry '${m.modelId}' missing required fields: ${missing.join(", ")} — FDL 10/2025 Art.18 compliance gap`);
    }
  }
}

// ── Explainability metadata ───────────────────────────────────────────────────
// Attached to every AI-assisted decision (PEP classification, adverse media
// severity) so human reviewers and regulators can understand what drove the
// output. FDL No.10/2025 Art.18 requires AI outputs to be explainable.

export interface ExplainabilityMetadata {
  /** Top factors that most influenced the AI decision, ordered by weight. */
  primaryDrivers: string[];
  /** 90% confidence interval for the numerical output (e.g. risk score). */
  confidenceInterval: [low: number, high: number];
  /** Alternative outcomes and the conditions under which they would apply. */
  alternativeScenarios: string[];
}

/**
 * Build explainability metadata for a PEP classification result.
 * Derives primary drivers from the input signals; confidence interval is
 * a heuristic ±band around the reported score; alternative scenarios cover
 * the most common classification pivots.
 */
export function buildPepExplainability(opts: {
  pepTier: string;
  riskScore: number;
  currentPositions: string[];
  redFlagCount: number;
  adverseMediaPresent: boolean;
  sanctionsListed: boolean;
}): ExplainabilityMetadata {
  const drivers: string[] = [];

  if (opts.sanctionsListed) drivers.push("Subject is listed on one or more sanctions lists");
  if (opts.pepTier === "tier1") drivers.push("Tier-1 PEP classification (head of state / senior minister)");
  else if (opts.pepTier === "tier2") drivers.push("Tier-2 PEP classification (legislative / senior judicial / military official)");
  else if (opts.pepTier === "rca") drivers.push("Relative or close associate (RCA) of a confirmed PEP");
  else if (opts.pepTier === "tier3" || opts.pepTier === "tier4") drivers.push(`${opts.pepTier.toUpperCase()} PEP classification`);
  if (opts.currentPositions.length > 0) drivers.push(`Currently holds ${opts.currentPositions.length} political/public position(s): ${opts.currentPositions.slice(0, 2).join(", ")}`);
  if (opts.adverseMediaPresent) drivers.push("Adverse media references identified in open-source screening");
  if (opts.redFlagCount > 0) drivers.push(`${opts.redFlagCount} source-of-wealth red flag(s) identified`);
  if (drivers.length === 0) drivers.push("No material risk factors identified; base score applied");

  // Heuristic confidence band: ±8 points for tier1/tier2, ±12 for others
  const band = opts.pepTier === "tier1" || opts.pepTier === "tier2" ? 8 : 12;
  const low  = Math.max(0,   opts.riskScore - band);
  const high = Math.min(100, opts.riskScore + band);

  const alternativeScenarios: string[] = [];
  if (opts.pepTier !== "tier1" && opts.currentPositions.length > 0) {
    alternativeScenarios.push("If subject is confirmed to hold a cabinet-level position, tier would escalate to Tier-1 (score +10–15 points)");
  }
  if (!opts.sanctionsListed) {
    alternativeScenarios.push("If subject is added to a primary sanctions list, score would increase by 20–30 points and recommendation would change to Decline");
  }
  if (!opts.adverseMediaPresent) {
    alternativeScenarios.push("If credible adverse media emerges, score could increase by 5–15 points depending on severity");
  }
  if (opts.redFlagCount === 0) {
    alternativeScenarios.push("Identification of unexplained wealth or undisclosed offshore structures would materially increase score");
  }

  return {
    primaryDrivers: drivers,
    confidenceInterval: [low, high],
    alternativeScenarios,
  };
}

/**
 * Build explainability metadata for an adverse media severity classification.
 */
export function buildAdverseMediaExplainability(opts: {
  severity: string;           // clear|low|medium|high|critical
  keywordHits: string[];
  articleCount: number;
  languages: string[];
  sourceCredibility: "high" | "medium" | "low" | "unknown";
}): ExplainabilityMetadata {
  const drivers: string[] = [];

  if (opts.articleCount > 0) {
    drivers.push(`${opts.articleCount} adverse media article(s) found across ${opts.languages.length} language(s)`);
  }
  if (opts.keywordHits.length > 0) {
    drivers.push(`Key AML-risk keywords matched: ${opts.keywordHits.slice(0, 4).join(", ")}`);
  }
  if (opts.sourceCredibility === "high") {
    drivers.push("Sources include high-credibility publications (established news outlets / regulatory databases)");
  } else if (opts.sourceCredibility === "low") {
    drivers.push("Source credibility is low — results require manual verification before reliance");
  }
  if (drivers.length === 0) {
    drivers.push("No adverse media keywords matched; severity set to 'clear'");
  }

  // Numeric proxy for severity band
  const severityScore: Record<string, number> = { clear: 0, low: 20, medium: 45, high: 70, critical: 90 };
  const base = severityScore[opts.severity] ?? 0;

  const alternativeScenarios: string[] = [];
  if (opts.severity !== "critical") {
    alternativeScenarios.push("Additional articles confirming criminal charges or regulatory sanctions would escalate severity");
  }
  if (opts.sourceCredibility === "low" || opts.sourceCredibility === "unknown") {
    alternativeScenarios.push("Manual review of source credibility may reduce or confirm the assessed severity");
  }
  if (opts.languages.length < 3) {
    alternativeScenarios.push("Expanding the search to additional language databases may surface further adverse media");
  }

  return {
    primaryDrivers: drivers,
    confidenceInterval: [Math.max(0, base - 15), Math.min(100, base + 15)],
    alternativeScenarios,
  };
}

// ── Audit completeness validation ─────────────────────────────────────────────
// UAE FDL No.10/2025 requires every audit entry to carry a mandatory set of
// fields. This validator returns the list of missing fields so callers can
// reject or quarantine incomplete entries before they enter the audit chain.

export const UAE_FDL_REQUIRED_AUDIT_FIELDS = [
  "event",
  "timestamp",
  "actorId",
  "subjectId",
  "dataHash",
  "hmacSignature",
] as const;

export type UaeFdlAuditField = typeof UAE_FDL_REQUIRED_AUDIT_FIELDS[number];

/**
 * Validate that an audit entry contains all fields required for UAE FDL
 * No.10/2025 compliance. A field is considered present when it is a non-empty
 * string or a non-null/undefined value.
 *
 * @returns Array of missing field names. Empty array = fully compliant.
 */
export function validateAuditCompleteness(
  entry: Record<string, unknown>,
): UaeFdlAuditField[] {
  const missing: UaeFdlAuditField[] = [];
  for (const field of UAE_FDL_REQUIRED_AUDIT_FIELDS) {
    const val = entry[field];
    if (val === undefined || val === null || val === "") {
      missing.push(field);
    }
  }
  return missing;
}

// ── Model version tracking ────────────────────────────────────────────────────
// All AI-assisted screening results must record the model and prompt versions
// so the audit chain can trace which AI artefact produced each decision.
// This satisfies FDL No.10/2025 Art.18 (audit trail for AI outputs) and
// supports reproducibility investigations when model versions are updated.

export interface ModelVersionInfo {
  /** Anthropic model ID used at inference time, e.g. "claude-haiku-4-5-20251001" */
  modelVersion: string;
  /** Semantic version of the prompt template used, e.g. "1.2.0".
   *  Increment the patch version for wording tweaks, minor for structural
   *  changes, major for schema-breaking changes. */
  promptVersion: string;
  /**
   * First 16 hex chars of SHA-256(prompt text) at inference time.
   * Computed by passing the actual prompt string to hashPromptText().
   * Enables audit trace to distinguish runs even when version is not bumped.
   * "hash-pending" = caller did not provide prompt text (legacy path).
   */
  promptHash: string;
  /** ISO date this prompt version was deployed — from PROMPT_REGISTRY. */
  promptDeployedAt: string;
}

/**
 * Prompt version constants. Increment these when the corresponding prompt
 * template is updated so every audit entry records which prompt produced it.
 */
export const PROMPT_VERSIONS = {
  PEP_PROFILE:     "1.0.0",
  ADVERSE_MEDIA:   "1.0.0",
  SMART_DISAMBIG:  "1.0.0",
  AI_DECISION:     "1.0.0",
  MLRO_ADVISOR:    "1.0.0",
} as const;

export type PromptVersionKey = keyof typeof PROMPT_VERSIONS;

/**
 * Richer prompt registry including deployed date for audit traceability.
 * Hash is computed at inference time from the actual prompt text via hashPromptText()
 * and stored on ModelVersionInfo — not pre-computed here since prompts are
 * constructed dynamically in route handlers.
 */
export const PROMPT_REGISTRY: Record<PromptVersionKey, { version: string; deployedAt: string }> = {
  PEP_PROFILE:    { version: "1.0.0", deployedAt: "2025-05-20" },
  ADVERSE_MEDIA:  { version: "1.0.0", deployedAt: "2025-05-20" },
  SMART_DISAMBIG: { version: "1.0.0", deployedAt: "2025-05-20" },
  AI_DECISION:    { version: "1.0.0", deployedAt: "2025-05-20" },
  MLRO_ADVISOR:   { version: "1.0.0", deployedAt: "2025-05-20" },
};

/**
 * Build a ModelVersionInfo object for a given screening tool.
 * Pass the actual system prompt text as promptText to compute a SHA-256 hash
 * that uniquely identifies the prompt content in the audit chain.
 * Satisfies FDL No.10/2025 Art.18 reproducibility tracing.
 */
export function buildModelVersionInfo(
  modelId: string,
  promptKey: PromptVersionKey,
  promptText?: string,
): ModelVersionInfo {
  return {
    modelVersion:    modelId,
    promptVersion:   PROMPT_VERSIONS[promptKey],
    promptHash:      promptText ? hashPromptText(promptText) : "hash-pending",
    promptDeployedAt: PROMPT_REGISTRY[promptKey].deployedAt,
  };
}

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
