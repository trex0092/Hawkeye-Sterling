"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { StrDraftModal } from "@/components/shared/StrDraftModal";
import { downloadEvidencePack, type EvidencePackEntry } from "@/lib/evidencePack";
import { findApplicableConflicts, type JurisdictionalConflict } from "@/lib/jurisdictionalConflicts";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReasoningMode = "quick" | "speed" | "balanced" | "multi_perspective";

interface ReasoningStep {
  stepNo: number;
  actor: "executor" | "advisor";
  modelId: string;
  at: string;
  summary: string;
  body: string;
}

interface QuestionAnalysis {
  primaryTopic: string;
  topics: string[];
  jurisdictions: string[];
  regimes: string[];
  typologies: string[];
  doctrineHints: string[];
  playbookHints: string[];
  redFlagHints: string[];
  fatfRecHints: string[];
  fatfRecDetails?: Array<{ id: string; num: number; title: string; citation: string; pillar: string }>;
  urgencyFlags: string[];
  numericThresholds: Array<{ value: number; unit: string; context: string }>;
  commonSenseRules: string[];
  suggestedFollowUps: string[];
  confidence: "high" | "medium" | "low";
  intelligenceProfile?: {
    coverageScore: number;
    doctrineCount: number;
    fatfRecCount: number;
    playbookCount: number;
    redFlagCount: number;
    typologyCount: number;
    jurisdictionCount: number;
    secondaryTopicCount: number;
    totalArtefacts: number;
  };
}

interface AdvisorResponseV1 {
  schemaVersion: 1;
  facts: { bullets: string[] };
  redFlags: { flags: Array<{ indicator: string; typology: string }> };
  frameworkCitations: { byClass: Partial<Record<"A" | "B" | "C" | "D" | "E", string[]>> };
  decision: { verdict: "proceed" | "decline" | "escalate" | "file_str" | "freeze"; oneLineRationale: string };
  confidence: { score: 1 | 2 | 3 | 4 | 5; reason?: string };
  counterArgument: { inspectorChallenge: string; rebuttal: string };
  auditTrail: {
    charterVersionHash: string;
    directivesInvoked: string[];
    doctrinesApplied: string[];
    retrievedSources: Array<{ class: string; classLabel: string; sourceId: string; articleRef: string }>;
    timestamp: string;
    userId: string;
    mode: string;
    modelVersions: Record<string, string>;
  };
  escalationPath: { responsible: string; accountable: string; consulted: string[]; informed: string[]; nextAction: string };
}

interface AdvisorResult {
  ok: boolean;
  mode: string;
  elapsedMs: number;
  partial: boolean;
  guidance?: string;
  reasoningTrail: ReasoningStep[];
  narrative?: string;
  /** Layer 3 — 8-section structured response. Present iff the request
   *  opted into structured output AND the model emitted parseable JSON
   *  AND the completion gate passed. UI renders this when present and
   *  falls back to `narrative` otherwise. */
  structured?: AdvisorResponseV1 | null;
  structuredFallback?: { reason: "parse_failed" | "gate_tripped"; defects?: unknown } | null;
  /** Layer 6.3 — adversarial probe outcome. */
  probeOutcome?: {
    innocent: string | null;
    adversarial: string | null;
    survived: boolean;
    disagreement?: string;
    bothEmitted: boolean;
  };
  complianceReview: {
    advisorVerdict: "approved" | "returned_for_revision" | "blocked" | "incomplete";
    issues: string[];
  };
  charterIntegrityHash?: string;
  questionAnalysis?: QuestionAnalysis;
  /** Numeric quality-gate score over the rendered narrative, computed
   *  server-side after invocation. Drives the STRONG/MEDIUM/WEAK
   *  confidence chip in the answer header. */
  advisorScore?: {
    confidenceScore: number;
    consistencyScore: number;
    passedQualityGate: boolean;
    failures: string[];
  };
  /** Citation verifier output — flags unknown FATF/FDL/Cabinet/etc.
   *  citations the model produced that don't match our bundled
   *  regulatory catalogue. Surfaced as a warning chip per cite. */
  citationReport?: {
    citations: Array<{
      raw: string;
      category: string;
      verified: boolean;
      note?: string;
    }>;
    verifiedCount: number;
    unknownCount: number;
    allVerified: boolean;
  };
  /** One-click follow-up questions derived from the rule-based
   *  classifier's per-topic suggestion list. */
  suggestedFollowUps?: string[];
  /** Tier-2 context flags — which augmentation paths fired on this
   *  request. Drives the small chip row above the answer so the
   *  operator can see "case precedent loaded · 2 turns from prior
   *  session · live EOCN signal". */
  contextFlags?: {
    sessionKey?: string | null;
    sessionTurnsLoaded?: number;
    jurisdictionComparison?: boolean;
    casePrecedentApplied?: boolean;
    regulatoryUpdatesApplied?: boolean;
  };
  /** Quick-mode deterministic-verifier output. `passed` = the rendered
   *  answer cleared all four axes (citation grounding, topic anchor,
   *  structure sanity, no refusal/CoT-leak). `retried` = the verifier
   *  triggered a rewrite pass. `initialDefectCount` lets the UI
   *  distinguish "passed first try" from "passed after auto-correction". */
  verification?: {
    passed: boolean;
    retried: boolean;
    initialDefectCount: number;
    defects: Array<{ axis: string; detail: string }>;
  };
  /** Compact summary of what the rule-based classifier surfaced for
   *  this question — primary topic, secondary topics, jurisdictions,
   *  FATF Recs, confidence, and the coverage score. Drives the
   *  "smart context" chip row above Quick-mode answers so the operator
   *  can see what the brain pulled in BEFORE Haiku ran. */
  classifierHits?: {
    primaryTopic: string;
    secondaryTopics: string[];
    jurisdictions: string[];
    fatfRecs: Array<{ num: number; title: string }>;
    confidence: "high" | "medium" | "low";
    coverageScore: number;
  };
  error?: string;
}

interface Citation { document: string; section?: string; jurisdiction?: string; excerpt?: string }

interface ComplianceAnswer {
  ok: boolean;
  query: string;
  answer?: string;
  citations: Citation[];
  confidenceScore?: number;
  confidenceTier?: string;
  consistencyScore?: number;
  jurisdiction?: string;
  passedQualityGate: boolean;
  source?: string;
  error?: string;
}

interface QaHistoryEntry {
  id: string;
  question: string;
  result: ComplianceAnswer;
  askedAt: string;
}

interface AdvisorHistoryEntry {
  id: string;
  question: string;
  mode: ReasoningMode;
  result: AdvisorResult;
  askedAt: string;
  expanded: boolean;
  /** Standalone red-team critique against this entry's verdict. Populated
   *  on demand via /api/mlro-advisor-challenger. */
  challenge?: ChallengeResult;
  /** True while a challenge request is in flight for this entry. */
  challenging?: boolean;
  /** Last challenge error, if any. */
  challengeError?: string;
}

interface ChallengeResult {
  outcome?: "UPHELD" | "PARTIALLY_UPHELD" | "OVERTURNED";
  steelman?: string;
  weakCitations: Array<{ citation: string; why: string }>;
  alternativeReadings: string[];
  hardenSuggestions: string[];
  fullCritique: string;
  elapsedMs: number;
  challengedAt: string;
}

interface EscalationResult {
  decision: "FILE_STR" | "ESCALATE_INTERNAL" | "ENHANCE_CDD" | "MONITOR" | "CLEAR";
  confidence: number;
  urgency: "immediate" | "24h" | "72h" | "routine";
  primaryTrigger: string;
  regulatoryBasis: string;
  rationale: string;
  requiredActions: string[];
  deadlines: string[];
}

interface ExtractedFlag {
  indicator: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  fatfReference: string;
  uaeReference: string;
  actionRequired: string;
}

interface FlagResult {
  flags: ExtractedFlag[];
  overallRisk: "critical" | "high" | "medium" | "low";
  recommendedDisposition: string;
  summary: string;
}

interface CasePattern {
  type: string;
  severity: "critical" | "high" | "medium";
  caseIds: string[];
  description: string;
  regulatoryImplication: string;
  recommendedAction: string;
}

interface PatternResult {
  patterns: CasePattern[];
  portfolioRisk: "critical" | "high" | "medium" | "low";
  consolidationRequired: boolean;
  immediateEscalations: string[];
  summary: string;
}

interface SubjectBrief {
  riskProfile: {
    nameRisk: "high" | "medium" | "low";
    jurisdictionRisk: "high" | "medium" | "low";
    entityTypeRisk: "high" | "medium" | "low";
    compositeRisk: "high" | "medium" | "low";
    rationale: string;
  };
  likelyTypologies: string[];
  sanctionsExposure: string;
  keyQuestions: string[];
  dueDiligenceChecklist: string[];
  regulatoryContext: string;
}

interface PepPersonToScreen {
  relationship: string;
  screeningPriority: "mandatory" | "high" | "recommended";
  rationale: string;
  fatfBasis: string;
}

interface PepEntityToScreen {
  entityType: string;
  screeningPriority: "mandatory" | "high" | "recommended";
  rationale: string;
}

interface PepNetwork {
  pepCategory: string;
  riskRating: "critical" | "high" | "medium";
  riskNarrative: string;
  personsToScreen: PepPersonToScreen[];
  entitiesToScreen: PepEntityToScreen[];
  typicalMlRisks: string[];
  jurisdictionalRisks: string[];
  eddRequirements: string[];
  seniorManagementApprovalRequired: boolean;
  ongoingMonitoringFrequency: "monthly" | "quarterly" | "annually";
  exitTriggers: string[];
  regulatoryBasis: string;
}

interface SanctionsIndirectRisk {
  riskType: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  sanctionsRegime: string;
  regulatoryBasis: string;
}

interface SanctionsNexus {
  directExposure: "none" | "possible" | "likely" | "confirmed";
  indirectExposure: "none" | "possible" | "likely" | "confirmed";
  overallSanctionsRisk: "critical" | "high" | "medium" | "low" | "clear";
  exposureNarrative: string;
  directRisks: string[];
  indirectRisks: SanctionsIndirectRisk[];
  jurisdictionalExposure: string[];
  fiftyPercentRuleApplicable: boolean;
  fiftyPercentAnalysis: string;
  recommendedAction: "block" | "escalate_to_mlro" | "enhanced_dd" | "file_str" | "monitor" | "clear";
  requiredChecks: string[];
  regulatoryBasis: string;
}

interface TypologyMatchPrimary {
  name: string;
  fatfReference: string;
  matchStrength: "strong" | "moderate" | "weak";
  matchRationale: string;
}

interface TypologyMatchSecondary {
  name: string;
  fatfReference: string;
  matchStrength: "strong" | "moderate" | "weak";
  overlap: string;
}

interface TypologyMatchPriority {
  step: number;
  action: string;
  rationale: string;
  tool: string;
}

interface TypologyMatch {
  primaryTypology: TypologyMatchPrimary;
  secondaryTypologies: TypologyMatchSecondary[];
  keyIndicators: string[];
  missingIndicators: string[];
  investigativePriorities: TypologyMatchPriority[];
  strThreshold: string;
  predicate: string;
  uaeCaseContext: string;
  regulatoryBasis: string;
}

// ── Suggested questions ───────────────────────────────────────────────────────
// Sources: UAE FDL 10/2025 & Cabinet Resolution 134/2025 (which together
// repealed and replaced the previous FDL 20/2018 + Cabinet Decision 10/2019),
// MoE DPMS rules, UAE FIU (goAML), EOCN sanctions guidance, LBMA Responsible
// Gold Guidance, OECD CAHRA 5-step Due Diligence, FATF 40 Recommendations,
// RMI RMAP / CMRT, ESG frameworks (EU CSDDD / CSRD), UN Guiding Principles
// on Business & Human Rights, UN Security Council Consolidated List & UNSCRs.

const SUGGESTED_GROUPS = [
  {
    label: "UAE FDL & Cabinet Resolution",
    questions: [
      "What is the record-retention period under UAE FDL 10/2025 Art.16?",
      "What are the STR reporting obligations under UAE FDL 10/2025?",
      "What are the tipping-off prohibitions under UAE FDL 10/2025 Art.25?",
      "What CDD measures does UAE Cabinet Resolution 134/2025 require?",
    ],
  },
  {
    label: "MoE / DPMS",
    questions: [
      "What is the DPMS cash-transaction reporting threshold under MoE Circular 08/2021?",
      "What CDD applies to a UAE gold trader under MoE DPMS rules?",
      "Is goAML registration mandatory for MoE-supervised DPMS?",
      "What red flags must DPMS dealers monitor under MoE guidance?",
    ],
  },
  {
    label: "UAE FIU / goAML",
    questions: [
      "What is the STR submission timeline to the UAE FIU via goAML?",
      "When must an Additional Information File (AIF) be filed via goAML?",
      "What narrative elements must a goAML STR contain?",
      "Can a reporting entity disclose an STR to the subject?",
    ],
  },
  {
    label: "EOCN Sanctions",
    questions: [
      "How often must we re-screen against the UAE EOCN consolidated list?",
      "What is the freezing-action timeline under EOCN guidance?",
      "What records must be kept on EOCN sanctions screening?",
      "How do we handle a true positive against the EOCN list?",
    ],
  },
  {
    label: "LBMA Responsible Gold",
    questions: [
      "What does the LBMA Responsible Gold Guidance require at Step 1?",
      "What KYC standards apply under the LBMA RGG?",
      "What is the LBMA Step 3 supplier audit obligation?",
      "What public reporting does LBMA Step 5 require?",
    ],
  },
  {
    label: "OECD CAHRA Due Diligence",
    questions: [
      "What are the 5 steps of the OECD Due Diligence Guidance?",
      "What red flags trigger Step 3 enhanced due diligence under OECD guidance?",
      "What disengagement criteria does OECD guidance set for high-risk suppliers?",
      "What public reporting does OECD Step 5 require?",
    ],
  },
  {
    label: "FATF Recommendations",
    questions: [
      "What does FATF Recommendation 16 require for wire transfers?",
      "What does FATF Recommendation 12 require for PEPs?",
      "What does FATF Recommendation 15 require of VASPs?",
      "What ownership threshold does FATF Recommendation 24 apply to UBOs?",
    ],
  },
  {
    label: "RMI Minerals",
    questions: [
      "What does the RMI Responsible Minerals Assurance Process (RMAP) require?",
      "What is the RMI Conflict Minerals Reporting Template (CMRT) used for?",
      "What is the RMI smelter audit cadence?",
      "How does RMI align with OECD 5-step due diligence?",
    ],
  },
  {
    label: "ESG & Sustainability",
    questions: [
      "What does the EU Corporate Sustainability Due Diligence Directive (CSDDD) require?",
      "What due diligence does the EU Conflict Minerals Regulation 2017/821 require?",
      "What does CSRD / ESRS S1 require on workforce disclosures?",
      "How does OECD CAHRA guidance link to ESG due diligence?",
    ],
  },
  {
    label: "Human Rights",
    questions: [
      "What do the UN Guiding Principles on Business & Human Rights (UNGPs) require?",
      "What are the steps of the UNGP human-rights due-diligence cycle?",
      "What do the OECD Guidelines for MNEs require on human rights?",
      "What modern-slavery red flags must DPMS supply chains monitor?",
    ],
  },
  {
    label: "UN Sanctions & Standards",
    questions: [
      "How is the UN Security Council Consolidated List implemented in the UAE?",
      "What does UNSCR 1373 require on terrorist financing?",
      "What does UNSCR 1540 require on WMD non-proliferation financing?",
      "What does the UN Global Compact require on anti-corruption (Principle 10)?",
    ],
  },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const tabCls = (active: boolean) =>
  `px-2.5 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

const verdictCls = (v: string) => {
  if (v === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-300";
  if (v === "blocked") return "bg-red-100 text-red-700 border-red-300";
  if (v === "returned_for_revision") return "bg-amber-50 text-amber-700 border-amber-300";
  return "bg-gray-100 text-gray-600 border-gray-300";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportQaSession(history: QaHistoryEntry[]) {
  const lines: string[] = [`MLRO Regulatory Q&A Session Export — ${new Date().toISOString()}`, "=".repeat(72), ""];
  for (const entry of history) {
    lines.push(`Q [${entry.askedAt}]: ${entry.question}`);
    lines.push(`A: ${entry.result.answer ?? "(no answer)"}`);
    if (entry.result.citations.length > 0) {
      lines.push(`Sources: ${entry.result.citations.map((c) => c.document).join("; ")}`);
    }
    if (entry.result.confidenceScore != null) {
      lines.push(`Confidence: ${entry.result.confidenceScore}%`);
    }
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mlro-qa-session-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAdvisorSession(history: AdvisorHistoryEntry[]) {
  const lines: string[] = [`MLRO Advisor Session Export — ${new Date().toISOString()}`, "=".repeat(72), ""];
  for (const entry of history) {
    lines.push(`Q [${entry.askedAt}] mode:${entry.mode}: ${entry.question}`);
    lines.push(`Verdict: ${entry.result.complianceReview.advisorVerdict}`);
    if (entry.result.narrative) lines.push(`Narrative: ${entry.result.narrative}`);
    lines.push(`Elapsed: ${entry.result.elapsedMs}ms`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mlro-advisor-session-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Layer 3: 8-section structured-response renderer ──────────────────────────

const VERDICT_TONE: Record<string, string> = {
  proceed: "bg-emerald-50 text-emerald-700 border-emerald-300",
  decline: "bg-red-100 text-red-700 border-red-300",
  escalate: "bg-amber-50 text-amber-700 border-amber-300",
  file_str: "bg-violet-50 text-violet-700 border-violet-300",
  freeze: "bg-red-100 text-red-700 border-red-300",
};

function StructuredAdvisorView({ response }: { response: AdvisorResponseV1 }) {
  const tone = VERDICT_TONE[response.decision.verdict] ?? "bg-gray-100 text-gray-700 border-gray-300";
  const citationGroups = Object.entries(response.frameworkCitations.byClass).filter(([, list]) => (list?.length ?? 0) > 0);
  return (
    <div className="bg-bg-panel border border-brand/40 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-brand">
          Regulator-grade response · 8-section schema
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${tone}`}>
            verdict · {response.decision.verdict.replace(/_/g, " ")}
          </span>
          <span className="inline-flex items-center px-1.5 py-px rounded border border-hair-2 bg-bg-1 font-mono text-9 font-semibold uppercase tracking-wide-2 text-ink-1">
            confidence · {response.confidence.score}/5
          </span>
        </div>
      </div>

      <Section label="1 · Facts as understood">
        <ul className="list-disc list-inside text-13 text-ink-0 space-y-0.5">
          {response.facts.bullets.map((b, i) => (<li key={i}>{b}</li>))}
        </ul>
      </Section>

      {response.redFlags.flags.length > 0 ? (
        <Section label="2 · Red flags triggered">
          <ul className="space-y-1">
            {response.redFlags.flags.map((f, i) => (
              <li key={i} className="text-13 text-ink-0">
                <span className="font-medium">{f.indicator}</span>
                <span className="text-11 text-ink-3 ml-2">→ {f.typology.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {citationGroups.length > 0 ? (
        <Section label="3 · Applicable framework citations">
          <div className="space-y-1.5">
            {citationGroups.map(([cls, list]) => (
              <div key={cls} className="text-13 text-ink-0">
                <span className="text-10 font-mono text-ink-3 mr-2">Class {cls}</span>
                {(list ?? []).join(" · ")}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section label="4 · Decision">
        <div className="text-13 text-ink-0 leading-relaxed">
          <span className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 mr-2 ${tone}`}>
            {response.decision.verdict.replace(/_/g, " ")}
          </span>
          {response.decision.oneLineRationale}
        </div>
      </Section>

      <Section label="5 · Confidence">
        <div className="text-13 text-ink-0">
          <span className="font-mono mr-2">{response.confidence.score}/5</span>
          {response.confidence.reason ? (
            <span className="text-ink-2">— {response.confidence.reason}</span>
          ) : null}
        </div>
      </Section>

      <Section label="6 · Regulator-perspective counter-argument">
        <div className="text-13 text-ink-0 leading-relaxed">
          <div className="mb-1.5"><strong className="text-ink-2">Inspector challenge:</strong> {response.counterArgument.inspectorChallenge}</div>
          {response.counterArgument.rebuttal ? (
            <div><strong className="text-ink-2">Rebuttal:</strong> {response.counterArgument.rebuttal}</div>
          ) : null}
        </div>
      </Section>

      <Section label="7 · Audit trail">
        <div className="text-12 text-ink-1 space-y-0.5 font-mono">
          <div>charter: {response.auditTrail.charterVersionHash}</div>
          <div>mode: {response.auditTrail.mode} · ts: {response.auditTrail.timestamp}</div>
          {response.auditTrail.directivesInvoked.length > 0 ? (
            <div>directives: {response.auditTrail.directivesInvoked.join(", ")}</div>
          ) : null}
          {response.auditTrail.retrievedSources.length > 0 ? (
            <div>
              sources:{" "}
              {response.auditTrail.retrievedSources.map((s) => `[${s.class}] ${s.sourceId} ${s.articleRef}`).join(" · ")}
            </div>
          ) : null}
        </div>
      </Section>

      <Section label="8 · Escalation path">
        <div className="text-13 text-ink-0 space-y-0.5">
          <div><strong className="text-ink-2">Responsible:</strong> {response.escalationPath.responsible}</div>
          <div><strong className="text-ink-2">Accountable:</strong> {response.escalationPath.accountable}</div>
          {response.escalationPath.consulted.length > 0 ? (
            <div><strong className="text-ink-2">Consulted:</strong> {response.escalationPath.consulted.join(", ")}</div>
          ) : null}
          {response.escalationPath.informed.length > 0 ? (
            <div><strong className="text-ink-2">Informed:</strong> {response.escalationPath.informed.join(", ")}</div>
          ) : null}
          <div className="mt-1"><strong className="text-ink-2">Next action:</strong> {response.escalationPath.nextAction}</div>
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-brand/40 pl-3">
      <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MlroAdvisorPage() {
  const [pageTab, setPageTab] = useState<"advisor" | "regulatory-qa" | "super-tools">("advisor");

  // ── Advisor state ────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ReasoningMode>("quick");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorHistoryEntry[]>([]);
  /** ID of the entry currently being streamed (Quick mode). null when idle. */
  const [streamingEntryId, setStreamingEntryId] = useState<string | null>(null);
  /** Advisor entry currently open in the goAML draft modal (null = closed). */
  const [strDraftFor, setStrDraftFor] = useState<AdvisorHistoryEntry | null>(null);

  const CLIENT_TIMEOUTS: Record<ReasoningMode, number> = {
    quick: 15_000,
    speed: 9_000,
    balanced: 45_000,
    multi_perspective: 600_000,
  };

  const recordAdvisorEntry = useCallback((q: string, m: ReasoningMode, data: AdvisorResult) => {
    setAdvisorHistory((prev) => [
      {
        id: `adv-${Date.now()}`,
        question: q,
        mode: m,
        result: data,
        askedAt: new Date().toLocaleTimeString(),
        expanded: false,
      },
      ...prev,
    ]);
    setQuestion("");
  }, []);

  /**
   * Run a Quick-mode answer via /api/mlro-advisor-quick. Single-pass
   * Haiku 4.5, no extended thinking, brain-classifier-grounded prompt.
   * Returns a single JSON {answer, elapsedMs} — Netlify Lambda buffers
   * responses regardless, so genuine SSE streaming wasn't reaching the
   * client. Target end-to-end latency: 3-7 s. The placeholder entry
   * appears instantly while the request is in flight so the user has
   * visual feedback.
   */
  const runQuick = useCallback(async (q: string): Promise<void> => {
    const entryId = `adv-${Date.now()}`;
    const startedAt = new Date();

    setAdvisorHistory((prev) => [
      {
        id: entryId,
        question: q,
        mode: "quick" as const,
        result: {
          ok: true,
          mode: "quick",
          elapsedMs: 0,
          partial: false,
          reasoningTrail: [],
          narrative: "",
          complianceReview: { advisorVerdict: "approved", issues: [] },
        },
        askedAt: startedAt.toLocaleTimeString(),
        expanded: true,
      },
      ...prev,
    ]);
    setQuestion("");
    setStreamingEntryId(entryId);

    const ctl = new AbortController();
    const killTimer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUTS.quick);

    try {
      const res = await fetch("/api/mlro-advisor-quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ctl.signal,
      });
      const data = (await res.json()) as {
        ok: boolean;
        answer?: string;
        error?: string;
        elapsedMs?: number;
        advisorScore?: AdvisorResult["advisorScore"];
        citationReport?: AdvisorResult["citationReport"];
        suggestedFollowUps?: AdvisorResult["suggestedFollowUps"];
        verification?: AdvisorResult["verification"];
        classifierHits?: AdvisorResult["classifierHits"];
      };
      if (!data.ok || !data.answer) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setAdvisorHistory((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? {
                ...e,
                result: {
                  ...e.result,
                  narrative: data.answer ?? "",
                  elapsedMs: data.elapsedMs ?? Date.now() - startedAt.getTime(),
                  ...(data.advisorScore ? { advisorScore: data.advisorScore } : {}),
                  ...(data.citationReport ? { citationReport: data.citationReport } : {}),
                  ...(data.suggestedFollowUps ? { suggestedFollowUps: data.suggestedFollowUps } : {}),
                  ...(data.verification ? { verification: data.verification } : {}),
                  ...(data.classifierHits ? { classifierHits: data.classifierHits } : {}),
                },
              }
            : e,
        ),
      );
    } catch (err) {
      // Drop the placeholder entry on error so the catch in handleAsk
      // can render the error banner cleanly.
      setAdvisorHistory((prev) => prev.filter((e) => e.id !== entryId));
      throw err;
    } finally {
      clearTimeout(killTimer);
      setStreamingEntryId(null);
    }
  }, [CLIENT_TIMEOUTS.quick]);

  // multi_perspective is offloaded to the Netlify Background Function so it
  // is not killed by Netlify's ~26 s edge inactivity timeout. Speed and
  // Balanced still use the synchronous route.
  const runDeepBackground = useCallback(async (q: string, m: ReasoningMode): Promise<void> => {
    const jobId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startResp = await fetch("/.netlify/functions/mlro-advisor-deep-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, question: q, mode: m, audience: "regulator" }),
    });
    if (startResp.status === 404) {
      // Background function isn't deployed in this environment (e.g. local
      // `next dev` without `netlify dev`). Fall through to sync.
      throw new Error("__no_background__");
    }
    if (startResp.status !== 202 && !startResp.ok) {
      const txt = await startResp.text().catch(() => "");
      throw new Error(`Background start failed (HTTP ${startResp.status}): ${txt.slice(0, 240)}`);
    }

    const pollDeadline = Date.now() + CLIENT_TIMEOUTS.multi_perspective;
    let pollIntervalMs = 2_500;
    // Allow a brief grace period for the first blob write before the GET
    // can find the record.
    let notFoundStreak = 0;
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      pollIntervalMs = Math.min(pollIntervalMs + 500, 5_000);
      const pollResp = await fetch(`/api/advisor-job/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { "cache-control": "no-store" },
      });
      if (pollResp.status === 404) {
        notFoundStreak += 1;
        if (notFoundStreak > 30) {
          throw new Error("Background job never reported in — check function logs.");
        }
        continue;
      }
      notFoundStreak = 0;
      const rawText = await pollResp.text();
      let payload: { ok: boolean; status?: string; result?: AdvisorResult; error?: string } | null = null;
      try { payload = JSON.parse(rawText); } catch { /* ignore */ }
      if (!payload) continue;
      if (payload.status === "done" && payload.result) {
        recordAdvisorEntry(q, m, payload.result);
        return;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error ?? payload.result?.error ?? "advisor pipeline failed");
      }
      // status === "running" → keep polling
    }
    throw new Error("Multi (Deep) timed out — check Netlify function logs.");
  }, [CLIENT_TIMEOUTS.multi_perspective, recordAdvisorEntry]);

  const runSynchronous = useCallback(async (q: string, m: ReasoningMode): Promise<void> => {
    const ctl = new AbortController();
    const syncTimeout = m === "multi_perspective" ? 110_000 : CLIENT_TIMEOUTS[m];
    const timer = setTimeout(() => ctl.abort(), syncTimeout);
    try {
      const res = await fetch("/api/mlro-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Layer 3 — request the 8-section structured response when
        // running Balanced or Multi-perspective. Speed mode skips
        // structured (it's the latency-tightest mode and the fallback
        // legacy narrative is fine there). Quick mode goes through
        // /api/mlro-advisor-quick, not this branch.
        body: JSON.stringify({
          question: q,
          subjectName: "Regulatory Query",
          mode: m,
          audience: "regulator",
          structured: m !== "speed",
        }),
        signal: ctl.signal,
      });
      const rawText = await res.text();
      let data: AdvisorResult | null = null;
      try { data = JSON.parse(rawText) as AdvisorResult; }
      catch {
        throw new Error(
          res.status === 504 || res.status === 524
            ? "Request timed out — try Speed or Balanced mode."
            : `Server error ${res.status} — check ANTHROPIC_API_KEY is configured.`,
        );
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? data.guidance ?? `HTTP ${res.status}`);
      }
      recordAdvisorEntry(q, m, data);
    } finally {
      clearTimeout(timer);
    }
  }, [CLIENT_TIMEOUTS, recordAdvisorEntry]);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    try {
      if (mode === "quick") {
        await runQuick(q);
      } else if (mode === "multi_perspective") {
        try {
          await runDeepBackground(q, mode);
        } catch (err) {
          // Fall back to the synchronous route only when the background
          // function isn't reachable (local dev). Real failures should
          // surface to the user.
          if (err instanceof Error && err.message === "__no_background__") {
            await runSynchronous(q, mode);
          } else {
            throw err;
          }
        }
      } else {
        await runSynchronous(q, mode);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(mode === "quick"
          ? "Quick mode timed out (>15 s) — try again or switch to Balanced."
          : mode === "speed"
            ? "Speed mode timed out (>9 s) — check server logs or try again."
            : "Request timed out — try Quick or Balanced mode.");
      } else {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setRunning(false);
    }
  }, [question, mode, runQuick, runDeepBackground, runSynchronous]);

  const toggleAdvisorEntry = (id: string) =>
    setAdvisorHistory((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)),
    );

  /** Run a standalone red-team / regulator-perspective critique against
   *  the verdict on this entry. The result is attached to the entry so
   *  it persists in the session log and is included in the evidence pack. */
  const runChallenge = useCallback(async (entry: AdvisorHistoryEntry) => {
    if (!entry.result.narrative) return;
    setAdvisorHistory((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? { ...e, challenging: true, challengeError: undefined, expanded: true }
          : e,
      ),
    );
    try {
      const res = await fetch("/api/mlro-advisor-challenger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: entry.question,
          narrative: entry.result.narrative,
          mode: entry.mode,
          classifierContext: entry.result.questionAnalysis
            ? compactClassifierContext(entry.result.questionAnalysis)
            : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        outcome?: ChallengeResult["outcome"];
        steelman?: string;
        weakCitations?: Array<{ citation: string; why: string }>;
        alternativeReadings?: string[];
        hardenSuggestions?: string[];
        fullCritique?: string;
        elapsedMs?: number;
        error?: string;
      };
      if (!data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const challenge: ChallengeResult = {
        outcome: data.outcome,
        steelman: data.steelman,
        weakCitations: data.weakCitations ?? [],
        alternativeReadings: data.alternativeReadings ?? [],
        hardenSuggestions: data.hardenSuggestions ?? [],
        fullCritique: data.fullCritique ?? "",
        elapsedMs: data.elapsedMs ?? 0,
        challengedAt: new Date().toLocaleTimeString(),
      };
      setAdvisorHistory((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, challenging: false, challenge } : e)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Challenge failed";
      setAdvisorHistory((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, challenging: false, challengeError: msg } : e)),
      );
    }
  }, []);

  // ── Regulatory Q&A state ─────────────────────────────────────────────────────
  const [qaQuery, setQaQuery] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<QaHistoryEntry[]>([]);
  const [qaDepth, setQaDepth] = useState<"balanced" | "deep">("balanced");
  const [qaUseTools, setQaUseTools] = useState<boolean>(true);
  const [openGroupIdx, setOpenGroupIdx] = useState<number | null>(0);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (qaHistory.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [qaHistory.length]);

  const handleQaAsk = useCallback(async (q?: string) => {
    const query = (q ?? qaQuery).trim();
    if (!query) return;
    setQaQuery(query);
    setQaLoading(true);
    setQaError(null);
    try {
      const res = await fetch("/api/compliance-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, mode: "multi-agent", depth: qaDepth, useTools: qaUseTools }),
      });
      const rawText = await res.text();
      let data: (ComplianceAnswer & { partialAnswer?: string }) | null = null;
      try {
        data = rawText ? JSON.parse(rawText) as ComplianceAnswer : null;
      } catch {
        // Body wasn't JSON — likely a Netlify HTML error page (504 timeout,
        // 502 bad gateway, etc.). Surface the HTTP status + a snippet so the
        // user (and we) can actually see what happened.
        const snippet = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        setQaError(
          `Server returned HTTP ${res.status} ${res.statusText || ""} (non-JSON body). ` +
          (snippet ? `Detail: ${snippet}` : "Likely a function timeout — try again or use the MLRO Advisor tab."),
        );
        return;
      }
      if (!data || !data.ok) {
        const baseError = data?.error ?? `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
        const suffix = data?.partialAnswer ? ` Partial answer captured below.` : "";
        setQaError(`${baseError}${suffix}`);
        if (data?.partialAnswer) {
          setQaHistory((prev) => [
            ...prev,
            {
              id: `qa-${Date.now()}`,
              question: query,
              result: { ...data, ok: true, answer: data.partialAnswer, citations: [], passedQualityGate: false, source: "mlro-advisor-fallback" } as ComplianceAnswer,
              askedAt: new Date().toLocaleTimeString(),
            },
          ]);
          setQaQuery("");
        }
      } else {
        setQaHistory((prev) => [
          ...prev,
          {
            id: `qa-${Date.now()}`,
            question: query,
            result: data,
            askedAt: new Date().toLocaleTimeString(),
          },
        ]);
        setQaQuery("");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setQaError(`Request failed: ${detail}`);
    } finally {
      setQaLoading(false);
    }
  }, [qaQuery, qaDepth, qaUseTools]);

  // ── Super Tools state ────────────────────────────────────────────────────────
  const [superToolsTab, setSuperToolsTab] = useState<"escalation"|"flags"|"patterns"|"brief"|"pep-network"|"sanctions-nexus"|"typology-match">("escalation");

  // Escalation engine
  const [escSubject, setEscSubject] = useState("");
  const [escScore, setEscScore] = useState("");
  const [escSanctions, setEscSanctions] = useState("");
  const [escPepTier, setEscPepTier] = useState("");
  const [escTypologies, setEscTypologies] = useState("");
  const [escJurisdictions, setEscJurisdictions] = useState("");
  const [escNotes, setEscNotes] = useState("");
  const [escResult, setEscResult] = useState<EscalationResult | null>(null);
  const [escLoading, setEscLoading] = useState(false);

  // Red flag extractor
  const [flagText, setFlagText] = useState("");
  const [flagResult, setFlagResult] = useState<FlagResult | null>(null);
  const [flagLoading, setFlagLoading] = useState(false);

  // Case patterns
  const [patternResult, setPatternResult] = useState<PatternResult | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  // Subject brief
  const [briefSubject, setBriefSubject] = useState("");
  const [briefJurisdiction, setBriefJurisdiction] = useState("");
  const [briefEntityType, setBriefEntityType] = useState("");
  const [briefResult, setBriefResult] = useState<SubjectBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // PEP Network
  const [pepNet, setPepNet] = useState<PepNetwork | null>(null);
  const [pepNetLoading, setPepNetLoading] = useState(false);
  const [pepInput, setPepInput] = useState({ name: "", role: "", country: "", party: "", tenure: "" });

  // Sanctions Nexus
  const [sanctionsNexus, setSanctionsNexus] = useState<SanctionsNexus | null>(null);
  const [sanctionsNexusLoading, setSanctionsNexusLoading] = useState(false);
  const [sanctionsNexusInput, setSanctionsNexusInput] = useState({
    subject: "", country: "", counterpartyName: "", counterpartyCountry: "",
    transactionType: "", amount: "", currency: "", ownershipChain: "",
    bankingRelationships: "", context: "",
  });

  // Typology Match
  const [typoMatch, setTypoMatch] = useState<TypologyMatch | null>(null);
  const [typoMatchLoading, setTypoMatchLoading] = useState(false);
  const [typoInput, setTypoInput] = useState({
    facts: "", subjectType: "", transactionTypes: "", jurisdictions: "", redFlags: "",
  });

  const runTypologyMatch = async () => {
    if (!typoInput.facts.trim()) return;
    setTypoMatchLoading(true);
    setTypoMatch(null);
    try {
      const res = await fetch("/api/typology-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          facts: typoInput.facts,
          subjectType: typoInput.subjectType || undefined,
          transactionTypes: typoInput.transactionTypes ? typoInput.transactionTypes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          jurisdictions: typoInput.jurisdictions ? typoInput.jurisdictions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          redFlags: typoInput.redFlags ? typoInput.redFlags.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & TypologyMatch;
      if (data.ok) setTypoMatch(data);
    } catch { /* silent */ }
    finally { setTypoMatchLoading(false); }
  };

  const runEscalation = async () => {
    if (!escSubject.trim()) return;
    setEscLoading(true);
    setEscResult(null);
    try {
      const res = await fetch("/api/mlro-advisor/escalation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectName: escSubject,
          riskScore: escScore ? Number(escScore) : undefined,
          sanctionsHits: escSanctions ? escSanctions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          pepTier: escPepTier || undefined,
          typologies: escTypologies ? escTypologies.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          jurisdictions: escJurisdictions ? escJurisdictions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          notes: escNotes || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & EscalationResult;
      if (data.ok) setEscResult(data);
    } catch { /* silent */ }
    finally { setEscLoading(false); }
  };

  const runFlagExtraction = async () => {
    if (!flagText.trim()) return;
    setFlagLoading(true);
    setFlagResult(null);
    try {
      const res = await fetch("/api/mlro-advisor/extract-flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: flagText }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & FlagResult;
      if (data.ok) setFlagResult(data);
    } catch { /* silent */ }
    finally { setFlagLoading(false); }
  };

  const runCasePatterns = async () => {
    setPatternLoading(true);
    setPatternResult(null);
    try {
      // Load cases from localStorage
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("hawkeye.case-store.v1") : null;
      const cases = raw ? JSON.parse(raw) as Array<{ id: string; subject: string; meta: string; status: string; opened: string }> : [];
      const res = await fetch("/api/mlro-advisor/case-patterns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cases: cases.map((c) => ({ id: c.id, subject: c.subject, meta: c.meta, status: c.status, openedAt: c.opened })) }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & PatternResult;
      if (data.ok) setPatternResult(data);
    } catch { /* silent */ }
    finally { setPatternLoading(false); }
  };

  const runSubjectBrief = async () => {
    if (!briefSubject.trim()) return;
    setBriefLoading(true);
    setBriefResult(null);
    try {
      const res = await fetch("/api/mlro-advisor/subject-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: briefSubject, jurisdiction: briefJurisdiction || undefined, entityType: briefEntityType || undefined }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & SubjectBrief;
      if (data.ok) setBriefResult(data);
    } catch { /* silent */ }
    finally { setBriefLoading(false); }
  };

  const runPepNetwork = async () => {
    if (!pepInput.name.trim()) return;
    setPepNetLoading(true);
    setPepNet(null);
    try {
      const res = await fetch("/api/pep-network", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pepName: pepInput.name,
          role: pepInput.role,
          country: pepInput.country,
          party: pepInput.party || undefined,
          tenure: pepInput.tenure || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & PepNetwork;
      if (data.ok) setPepNet(data);
    } catch { /* silent */ }
    finally { setPepNetLoading(false); }
  };

  const runSanctionsNexus = async () => {
    if (!sanctionsNexusInput.subject.trim()) return;
    setSanctionsNexusLoading(true);
    setSanctionsNexus(null);
    try {
      const res = await fetch("/api/sanctions-indirect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: sanctionsNexusInput.subject,
          country: sanctionsNexusInput.country,
          counterpartyName: sanctionsNexusInput.counterpartyName || undefined,
          counterpartyCountry: sanctionsNexusInput.counterpartyCountry || undefined,
          transactionType: sanctionsNexusInput.transactionType || undefined,
          amount: sanctionsNexusInput.amount ? Number(sanctionsNexusInput.amount) : undefined,
          currency: sanctionsNexusInput.currency || undefined,
          ownershipChain: sanctionsNexusInput.ownershipChain || undefined,
          bankingRelationships: sanctionsNexusInput.bankingRelationships || undefined,
          context: sanctionsNexusInput.context || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & SanctionsNexus;
      if (data.ok) setSanctionsNexus(data);
    } catch { /* silent */ }
    finally { setSanctionsNexusLoading(false); }
  };

  return (
    <ModuleLayout asanaModule="mlro-advisor" asanaLabel="MLRO Advisor" engineLabel="MLRO Advisor">
      <ModuleHero
        eyebrow="Module 09 · Deep Reasoning"
        title="MLRO"
        titleEm="advisor."
        intro={
          <>
            <strong>Quick mode default — answers stream in ~5 s.</strong> Haiku 4.5
            grounded by the brain&apos;s rule-based classifier (FATF Recs, playbooks,
            red flags, doctrines).{" "}
            <span className="text-ink-3">
              50 MLRO topics · 250 common-sense rules · 40 FATF Recs. Switch to
              Balanced or Deep for charter-gated executor → advisor reasoning trails.
            </span>
          </>
        }
      />

      <div className="bg-bg-panel border border-brand/30 rounded-xl p-5">
        {/* Tab bar */}
        <div className="flex items-center gap-1.5 mb-5 pb-4 border-b border-hair-2">
          <button type="button" onClick={() => setPageTab("advisor")} className={tabCls(pageTab === "advisor")}>
            MLRO Advisor
          </button>
          <button type="button" onClick={() => setPageTab("regulatory-qa")} className={tabCls(pageTab === "regulatory-qa")}>
            Regulatory Q&A
          </button>
          <button type="button" onClick={() => setPageTab("super-tools")} className={tabCls(pageTab === "super-tools")}>
            Super Tools
          </button>
        </div>

        {/* ── MLRO Advisor tab ──────────────────────────────────────────────── */}
        {pageTab === "advisor" && (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Deep Reasoning · MLRO Advisor
                </div>
                <div className="text-12 text-ink-2">
                  Sonnet executor → Opus advisor · 132 directives · charter P1–P10
                  <span className="ml-2 text-ink-3">— standalone mode</span>
                </div>
              </div>
              {advisorHistory.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportAdvisorSession(advisorHistory)}
                    className="text-11 text-ink-3 hover:text-brand border border-hair-2 hover:border-brand px-2.5 py-1 rounded transition-colors"
                  >
                    Export session
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvisorHistory([])}
                    className="text-11 text-ink-3 hover:text-red"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="space-y-2 mb-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleAsk(); }}
                disabled={running}
                rows={3}
                placeholder='Ask the MLRO Advisor a compliance question — e.g. "What CDD is required for a UAE gold trader?"'
                className="w-full px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand focus:bg-bg-panel resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {/* Live classification badges (debounced 400ms) */}
              <LiveClassifierBadges question={question} />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-11 font-semibold text-ink-2 uppercase tracking-wide-3">Mode</span>
                  {(["quick", "speed", "balanced", "multi_perspective"] as const).map((m) => {
                    const label =
                      m === "quick"             ? "Quick (~5 s)" :
                      m === "multi_perspective" ? "Deep" :
                      m === "balanced"          ? "Balanced" :
                      m === "speed"             ? "Speed" : m;
                    const title =
                      m === "quick"             ? "Haiku 4.5 streaming, single-pass, brain-classifier-grounded. Default for everyday Q&A. ~5 s." :
                      m === "multi_perspective" ? "Sonnet executor → Opus advisor → challenger. Deepest reasoning, charter-gated. ~2 min." :
                      m === "balanced"          ? "Sonnet advisor only, ~40 s. No executor stage." :
                      "Sonnet executor only, ~9 s. No advisor review.";
                    return (
                      <button key={m} type="button" onClick={() => setMode(m)} className={tabCls(mode === m)} title={title}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1" />
                <span className="text-10 text-ink-3 font-mono">⌘+Enter to submit</span>
                <button
                  type="button"
                  onClick={() => { void handleAsk(); }}
                  disabled={!question.trim() || running}
                  className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {running ? (mode === "quick" ? "Streaming…" : "Analysing…") : "Ask Advisor"}
                </button>
              </div>
            </div>

            {running && mode !== "quick" && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center border border-hair-2 rounded-lg bg-bg-1 mb-4">
                <span className="animate-pulse font-mono text-brand">●</span>
                {mode === "speed"
                  ? "Speed mode — Sonnet executor only, ~9 s…"
                  : mode === "balanced"
                  ? "Balanced mode — Sonnet advisor, ~40 s…"
                  : "Deep mode — Sonnet → Opus → challenger via background job · up to ~2 min, polling for result…"}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-13 text-red-700 mb-4">
                <span className="font-semibold">Advisor error:</span> {error}
              </div>
            )}

            {/* Session log */}
            {advisorHistory.length > 0 && (
              <div className="space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                  Session — {advisorHistory.length} {advisorHistory.length === 1 ? "query" : "queries"}
                </div>
                {advisorHistory.map((entry) => (
                  <div key={entry.id} className="border border-hair-2 rounded-xl bg-bg-1 overflow-hidden">
                    {/* Entry header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleAdvisorEntry(entry.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleAdvisorEntry(entry.id); }}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-bg-panel transition-colors cursor-pointer"
                    >
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded border text-10 font-semibold uppercase tracking-wide-2 flex-shrink-0 ${verdictCls(entry.result.complianceReview.advisorVerdict)}`}
                      >
                        {entry.result.complianceReview.advisorVerdict.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-13 text-ink-0 font-medium truncate">{entry.question}</p>
                        <p className="text-10 text-ink-3 font-mono mt-0.5">
                          {entry.askedAt} · mode:{entry.mode} · {entry.result.elapsedMs}ms
                          {entry.result.partial && " · partial"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setQuestion(entry.question); setMode(entry.mode); }}
                          aria-label="Edit question"
                          title="Edit question — load into input"
                          className="p-1 rounded text-ink-3 hover:text-brand hover:bg-brand-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdvisorHistory((prev) => prev.filter((e) => e.id !== entry.id))}
                          aria-label="Delete entry"
                          title="Delete entry"
                          className="p-1 rounded text-ink-3 hover:text-red hover:bg-red-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <span className="text-11 text-ink-3 ml-1">{entry.expanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Entry detail */}
                    {entry.expanded && (
                      <div className="border-t border-hair-2 px-4 pb-4 pt-3 space-y-3">
                        {entry.result.complianceReview.issues.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber-700 mb-1">Charter issues</div>
                            <ul className="list-disc list-inside space-y-0.5">
                              {entry.result.complianceReview.issues.map((issue) => (
                                <li key={issue} className="text-12 text-amber-800">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {entry.result.guidance && (
                          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">Guidance</div>
                            <p className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{entry.result.guidance}</p>
                          </div>
                        )}
                        {/* Layer 3 — 8-section structured response. Renders
                            ABOVE the narrative when the model returned a
                            valid AdvisorResponseV1; otherwise the legacy
                            narrative panel below is what the operator sees. */}
                        {entry.result.structured ? (
                          <StructuredAdvisorView response={entry.result.structured} />
                        ) : null}
                        {entry.result.structuredFallback ? (
                          <div className="bg-amber-50/30 border border-amber-300 rounded-lg p-3 text-12 text-amber-700">
                            <strong>Structured-output fallback fired.</strong>{" "}
                            {entry.result.structuredFallback.reason === "parse_failed"
                              ? "The model emitted text instead of JSON; the legacy narrative below is what's shown."
                              : "The 8-section completion gate tripped on the model's draft; the legacy narrative below is shown alongside the gate-trip event in the audit log."}
                          </div>
                        ) : null}
                        {(entry.result.narrative || streamingEntryId === entry.id) && (
                          <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1 flex items-center gap-2 flex-wrap">
                              <span>{entry.mode === "quick" ? "Answer" : "Regulator-facing narrative"}</span>
                              {streamingEntryId === entry.id && (
                                <span className="font-mono text-brand animate-pulse">● working ~5 s</span>
                              )}
                              {entry.result.advisorScore && (
                                (() => {
                                  const s = entry.result.advisorScore.confidenceScore;
                                  const tier = s >= 75 ? "STRONG" : s >= 45 ? "MEDIUM" : "WEAK";
                                  const cls =
                                    tier === "STRONG"
                                      ? "bg-green-dim text-green border-green/40"
                                      : tier === "MEDIUM"
                                        ? "bg-amber-dim text-amber border-amber/40"
                                        : "bg-red-dim text-red border-red/40";
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${cls}`}
                                      title={`Confidence ${s}/100 · Consistency ${(entry.result.advisorScore.consistencyScore * 100).toFixed(0)}/100${entry.result.advisorScore.failures.length ? `\nFailures: ${entry.result.advisorScore.failures.join(", ")}` : ""}`}
                                    >
                                      {tier} · {s}/100
                                    </span>
                                  );
                                })()
                              )}
                              {entry.result.citationReport && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${
                                    entry.result.citationReport.allVerified
                                      ? "bg-green-dim text-green border-green/40"
                                      : "bg-amber-dim text-amber border-amber/40"
                                  }`}
                                  title={
                                    entry.result.citationReport.allVerified
                                      ? `All ${entry.result.citationReport.verifiedCount} citations verified against the bundled regulatory catalogue.`
                                      : `${entry.result.citationReport.unknownCount} of ${entry.result.citationReport.verifiedCount + entry.result.citationReport.unknownCount} citations could not be verified — double-check before relying.\n\n${entry.result.citationReport.citations.filter((c) => !c.verified).map((c) => `${c.raw}: ${c.note ?? "not in catalogue"}`).join("\n")}`
                                  }
                                >
                                  {entry.result.citationReport.allVerified
                                    ? `✓ ${entry.result.citationReport.verifiedCount} cites`
                                    : `⚠ ${entry.result.citationReport.unknownCount} unknown cite${entry.result.citationReport.unknownCount === 1 ? "" : "s"}`}
                                </span>
                              )}
                              {entry.result.verification && (
                                (() => {
                                  const v = entry.result.verification;
                                  const tone = v.passed
                                    ? v.retried
                                      ? "bg-violet-dim text-violet border-violet/40"
                                      : "bg-green-dim text-green border-green/40"
                                    : "bg-amber-dim text-amber border-amber/40";
                                  const label = v.passed
                                    ? v.retried
                                      ? `↻ auto-corrected`
                                      : `✓ verified`
                                    : `⚠ ${v.defects.length} defect${v.defects.length === 1 ? "" : "s"}`;
                                  const title = v.passed
                                    ? v.retried
                                      ? `Initial draft failed ${v.initialDefectCount} verification axis(es); the rewrite pass cleared every defect.`
                                      : "Cleared all verification axes on the first pass (citation grounding, topic anchor, structure sanity, no refusal/CoT-leak)."
                                    : `Verification still flagged ${v.defects.length} defect(s) after retry:\n\n${v.defects.map((d) => `· [${d.axis}] ${d.detail}`).join("\n\n")}`;
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${tone}`}
                                      title={title}
                                    >
                                      {label}
                                    </span>
                                  );
                                })()
                              )}
                            </div>
                            {entry.result.classifierHits && (
                              (() => {
                                const h = entry.result.classifierHits;
                                const chips: Array<{ label: string; tone: string; title: string }> = [];
                                chips.push({
                                  label: `topic · ${h.primaryTopic.replace(/_/g, " ")}`,
                                  tone: "bg-brand-dim text-brand border-brand/30",
                                  title: `Primary topic resolved by the rule-based classifier (${h.confidence} confidence, coverage ${h.coverageScore}/100). Used to ground Haiku's prompt.`,
                                });
                                if (h.secondaryTopics.length > 0) {
                                  chips.push({
                                    label: `+ ${h.secondaryTopics.length} secondary`,
                                    tone: "bg-bg-2 text-ink-1 border-hair-2",
                                    title: `Secondary topics: ${h.secondaryTopics.map((t) => t.replace(/_/g, " ")).join(", ")}`,
                                  });
                                }
                                if (h.fatfRecs.length > 0) {
                                  chips.push({
                                    label: `FATF · ${h.fatfRecs.map((r) => `R.${r.num}`).join(" ")}`,
                                    tone: "bg-violet-dim text-violet border-violet/30",
                                    title: `Canonical FATF Recommendations the verifier expected the answer to cite:\n\n${h.fatfRecs.map((r) => `· R.${r.num} — ${r.title}`).join("\n")}`,
                                  });
                                }
                                if (h.jurisdictions.length > 0) {
                                  chips.push({
                                    label: `${h.jurisdictions.join(" · ")}`,
                                    tone: "bg-amber-dim text-amber border-amber/30",
                                    title: `Jurisdictions detected in the question: ${h.jurisdictions.join(", ")}`,
                                  });
                                }
                                if (chips.length === 0) return null;
                                return (
                                  <div className="mb-2 -mt-1 flex flex-wrap gap-1.5">
                                    {chips.map((c) => (
                                      <span
                                        key={c.label}
                                        className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${c.tone}`}
                                        title={c.title}
                                      >
                                        {c.label}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()
                            )}
                            <div className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">
                              {entry.result.narrative || (streamingEntryId === entry.id ? "" : "")}
                              {streamingEntryId === entry.id && (
                                <span className="inline-block w-1.5 h-4 bg-brand ml-0.5 animate-pulse align-middle" />
                              )}
                            </div>
                            {entry.result.citationReport && entry.result.citationReport.unknownCount > 0 && (
                              <div className="mt-2 pt-2 border-t border-hair text-10 text-amber leading-snug">
                                <strong>Unknown citations:</strong>{" "}
                                {entry.result.citationReport.citations
                                  .filter((c) => !c.verified)
                                  .map((c) => c.raw)
                                  .join(" · ")}
                              </div>
                            )}
                            {entry.result.contextFlags && (
                              (() => {
                                const f = entry.result.contextFlags;
                                const chips: Array<{ label: string; tone: string; title: string }> = [];
                                if ((f.sessionTurnsLoaded ?? 0) > 0) {
                                  chips.push({
                                    label: `↺ ${f.sessionTurnsLoaded} prior turn${f.sessionTurnsLoaded === 1 ? "" : "s"}`,
                                    tone: "bg-violet-dim text-violet border-violet/30",
                                    title: `Loaded ${f.sessionTurnsLoaded} prior turn(s) from session ${f.sessionKey ?? "?"} so the answer is continuous with your earlier conversation.`,
                                  });
                                }
                                if (f.casePrecedentApplied) {
                                  chips.push({
                                    label: "≈ case precedent",
                                    tone: "bg-brand-dim text-brand border-brand/30",
                                    title: "Prior cases from your tenant's vault matched this question's signals (jurisdiction / PEP / adverse-media). The advisor was briefed with their dispositions.",
                                  });
                                }
                                if (f.jurisdictionComparison) {
                                  chips.push({
                                    label: "⇄ multi-jurisdiction",
                                    tone: "bg-amber-dim text-amber border-amber/30",
                                    title: "Multiple jurisdictions detected — answer should include a comparison table with primary-source citations per jurisdiction.",
                                  });
                                }
                                if (f.regulatoryUpdatesApplied) {
                                  chips.push({
                                    label: "🔔 live EOCN signal",
                                    tone: "bg-green-dim text-green border-green/30",
                                    title: "EOCN UAE published a sanctions update in the last 7 days. The advisor was briefed with the recent activity in case it affects this answer.",
                                  });
                                }
                                if (chips.length === 0) return null;
                                return (
                                  <div className="mt-3 pt-3 border-t border-hair">
                                    <div className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
                                      Context augmentation
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {chips.map((c) => (
                                        <span
                                          key={c.label}
                                          className={`inline-flex items-center px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${c.tone}`}
                                          title={c.title}
                                        >
                                          {c.label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                            {entry.result.suggestedFollowUps && entry.result.suggestedFollowUps.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-hair">
                                <div className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
                                  Suggested follow-ups
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {entry.result.suggestedFollowUps.map((q) => (
                                    <button
                                      key={q}
                                      type="button"
                                      onClick={() => setQuestion(q)}
                                      className="inline-flex items-center px-2 py-1 rounded border border-hair-2 bg-bg-1 hover:bg-bg-2 hover:border-brand/40 text-11 text-ink-1 hover:text-ink-0 transition-colors text-left"
                                      title="Click to fill the question box with this follow-up"
                                    >
                                      {q}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {entry.challengeError && (
                          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
                            <span className="font-semibold">Challenger error:</span> {entry.challengeError}
                          </div>
                        )}
                        {entry.challenge && <ChallengePanel challenge={entry.challenge} />}
                        <ConflictsPanel
                          jurisdictions={entry.result.questionAnalysis?.jurisdictions ?? []}
                          regimes={entry.result.questionAnalysis?.regimes ?? []}
                        />
                        {entry.result.questionAnalysis && (
                          <ClassifierResultPanels
                            analysis={entry.result.questionAnalysis}
                            onPick={(q) => setQuestion(q)}
                          />
                        )}
                        {entry.result.reasoningTrail.length > 0 && (
                          <details className="group">
                            <summary className="text-11 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
                              Reasoning trail ({entry.result.reasoningTrail.length} steps) ▶
                            </summary>
                            <div className="mt-2 space-y-1.5">
                              {entry.result.reasoningTrail.map((step) => (
                                <div key={step.stepNo} className="border border-hair rounded-lg bg-bg-1 p-2.5">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-10 font-mono font-bold px-1.5 py-0.5 rounded uppercase ${step.actor === "executor" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                      {step.actor}
                                    </span>
                                    <span className="text-10 font-mono text-ink-3">{step.modelId}</span>
                                    <span className="text-10 text-ink-3">{step.at}</span>
                                    <span className="flex-1 text-12 text-ink-1 truncate">{step.summary}</span>
                                  </div>
                                  <pre className="text-10 text-ink-2 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{step.body}</pre>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <AsanaReportButton payload={{
                            module: "mlro-advisor",
                            label: `MLRO Advisory · ${entry.result.complianceReview.advisorVerdict.replace(/_/g, " ")}`,
                            summary: `Q: ${entry.question.slice(0, 80)} | Verdict: ${entry.result.complianceReview.advisorVerdict} | Mode: ${entry.mode} | ${entry.result.elapsedMs}ms`,
                            metadata: { verdict: entry.result.complianceReview.advisorVerdict, mode: entry.mode, issues: entry.result.complianceReview.issues.length },
                          }} />
                          <button
                            type="button"
                            onClick={() => setStrDraftFor(entry)}
                            disabled={!entry.result.narrative}
                            title={entry.result.narrative
                              ? "Draft a goAML XML report from this verdict"
                              : "Narrative not yet available"}
                            className="text-11 px-2.5 py-1 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:border-brand hover:text-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Draft STR (XML)
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadEvidencePack(buildEvidencePackEntry(entry))}
                            title="Download a regulator-ready PDF evidence pack with reasoning trail and charter hash"
                            className="text-11 px-2.5 py-1 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:border-brand hover:text-brand transition-colors"
                          >
                            Evidence Pack (PDF)
                          </button>
                          <button
                            type="button"
                            onClick={() => { void runChallenge(entry); }}
                            disabled={!entry.result.narrative || entry.challenging}
                            title="Run a regulator-perspective red-team critique against this verdict"
                            className="text-11 px-2.5 py-1 rounded border border-amber/50 bg-amber-dim text-amber hover:border-amber hover:bg-amber/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {entry.challenging ? "Challenging…" : entry.challenge ? "Re-challenge" : "Challenge verdict"}
                          </button>
                          {entry.result.charterIntegrityHash && (
                            <span className="text-10 text-ink-3 font-mono">
                              hash:{entry.result.charterIntegrityHash.slice(0, 12)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {advisorHistory.length === 0 && !running && !error && (
              <div className="text-center py-10 text-ink-3 text-12 border border-dashed border-hair-2 rounded-xl">
                No queries yet — ask the MLRO Advisor a compliance question above.
              </div>
            )}
          </>
        )}

        {/* ── Regulatory Q&A tab ────────────────────────────────────────────── */}
        {pageTab === "regulatory-qa" && (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
                  Regulatory Q&A
                </div>
                <div className="text-12 text-ink-2">
                  Source-cited regulatory answers via AML-MultiAgent-RAG — 4-agent pipeline with confidence and consistency quality gates.
                  Falls back to MLRO Advisor pipeline when external RAG is unavailable.
                </div>
              </div>
              {qaHistory.length > 0 && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => exportQaSession(qaHistory)}
                    className="text-11 text-ink-3 hover:text-brand border border-hair-2 hover:border-brand px-2.5 py-1 rounded transition-colors"
                  >
                    Export Q&A
                  </button>
                  <button
                    type="button"
                    onClick={() => setQaHistory([])}
                    className="text-11 text-ink-3 hover:text-red"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 mb-4">
              <textarea
                className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-panel focus:outline-none focus:border-brand resize-none text-ink-0"
                rows={3}
                placeholder="Ask a regulatory question…"
                value={qaQuery}
                onChange={(e) => setQaQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleQaAsk(); }}
              />
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-11 text-ink-3">⌘+Enter to submit</span>
                  <div className="flex items-center gap-1.5 border border-hair-2 rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => setQaDepth("balanced")}
                      title="Advisor only · ~45 s · safe on every Netlify tier"
                      className={`text-11 px-2 py-1 rounded ${qaDepth === "balanced" ? "bg-brand text-white" : "text-ink-2 hover:text-ink-0"}`}
                    >
                      Balanced
                    </button>
                    <button
                      type="button"
                      onClick={() => setQaDepth("deep")}
                      title="Executor → Advisor (multi-perspective) · ~90 s · requires extended function timeout"
                      className={`text-11 px-2 py-1 rounded ${qaDepth === "deep" ? "bg-brand text-white" : "text-ink-2 hover:text-ink-0"}`}
                    >
                      Deep
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-11 text-ink-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={qaUseTools}
                      onChange={(e) => setQaUseTools(e.target.checked)}
                      className="accent-brand"
                    />
                    Live lookups
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleQaAsk(); }}
                  disabled={qaLoading || qaQuery.trim().length < 10}
                  className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {qaLoading ? "Asking…" : "Ask"}
                </button>
              </div>
            </div>

            {qaLoading && (
              <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center border border-hair-2 rounded-lg bg-bg-1 mb-4">
                <span className="animate-pulse font-mono text-brand">●</span>
                Pipeline running — RAG or MLRO Advisor fallback…
              </div>
            )}

            {qaError && (
              <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
                <span className="font-semibold">Error:</span> {qaError}
              </div>
            )}

            {/* Q&A History */}
            {qaHistory.length > 0 && (
              <div className="space-y-3 mb-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                  Session — {qaHistory.length} {qaHistory.length === 1 ? "answer" : "answers"}
                </div>
                {qaHistory.map((entry) => (
                  <div key={entry.id} className="border border-hair-2 rounded-xl overflow-hidden">
                    {/* Question */}
                    <div className="bg-bg-1 px-4 py-2.5 border-b border-hair flex items-start gap-2">
                      <span className="text-11 font-mono text-ink-3 flex-shrink-0 mt-0.5">{entry.askedAt}</span>
                      <p className="text-13 text-ink-0 font-medium flex-1">{entry.question}</p>
                      {entry.result.source === "mlro-advisor-fallback" && (
                        <span className="text-10 bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">
                          Advisor fallback
                        </span>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setQaQuery(entry.question)}
                          aria-label="Edit question"
                          title="Edit question — load into input"
                          className="p-1 rounded text-ink-3 hover:text-brand hover:bg-brand-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQaHistory((prev) => prev.filter((e) => e.id !== entry.id))}
                          aria-label="Delete entry"
                          title="Delete entry"
                          className="p-1 rounded text-ink-3 hover:text-red hover:bg-red-dim transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Answer */}
                    <div className="px-4 py-3 bg-bg-panel">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-11 px-2 py-0.5 rounded-full border font-semibold ${entry.result.passedQualityGate ? "bg-green-dim border-green/30 text-green" : "bg-amber-dim border-amber/30 text-amber"}`}>
                          {entry.result.passedQualityGate ? "✓ Quality gate passed" : "⚠ Below threshold"}
                        </span>
                        {entry.result.confidenceScore != null && (
                          <span className="text-11 text-ink-3 font-mono">confidence {entry.result.confidenceScore}%</span>
                        )}
                        {entry.result.consistencyScore != null && (
                          <span className="text-11 text-ink-3 font-mono">consistency {(entry.result.consistencyScore * 100).toFixed(0)}%</span>
                        )}
                        {entry.result.jurisdiction && (
                          <span className="text-11 bg-brand-dim text-brand px-2 py-0.5 rounded">{entry.result.jurisdiction}</span>
                        )}
                      </div>
                      <p className="text-13 text-ink-0 leading-relaxed whitespace-pre-wrap">{entry.result.answer}</p>
                      {entry.result.citations.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Sources</div>
                          {entry.result.citations.map((c, i) => (
                            <div key={i} className="border-l-2 border-brand pl-2.5">
                              <p className="text-12 font-medium text-ink-0">{c.document}</p>
                              {c.section && <p className="text-11 text-ink-3">§ {c.section}</p>}
                              {c.jurisdiction && <span className="text-11 text-brand">{c.jurisdiction}</span>}
                              {c.excerpt && <p className="text-11 text-ink-2 mt-0.5 italic">"{c.excerpt}"</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={historyEndRef} />
              </div>
            )}

            {/* Suggested questions — always visible */}
            <div className="border border-hair-2 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-bg-1 border-b border-hair-2">
                <p className="text-11 font-semibold text-ink-2 uppercase tracking-wide-3">Suggested questions</p>
              </div>
              <div className="divide-y divide-hair">
                {SUGGESTED_GROUPS.map((group, idx) => (
                  <div key={group.label}>
                    <button
                      type="button"
                      onClick={() => setOpenGroupIdx(openGroupIdx === idx ? null : idx)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-1 transition-colors"
                    >
                      <span className="text-12 font-semibold text-ink-1">{group.label}</span>
                      <span className="text-10 text-ink-3">{openGroupIdx === idx ? "▲" : "▼"}</span>
                    </button>
                    {openGroupIdx === idx && (
                      <div className="px-4 pb-3 space-y-0.5">
                        {group.questions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => { void handleQaAsk(q); }}
                            disabled={qaLoading}
                            className="w-full text-left text-12 text-brand hover:text-brand-deep hover:bg-brand-dim/20 px-2.5 py-1.5 rounded transition-colors disabled:opacity-40"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Super Tools tab ───────────────────────────────────────────────── */}
        {pageTab === "super-tools" && (
          <div className="mt-6 space-y-4">
            {/* Sub-tab bar */}
            <div className="flex gap-2 flex-wrap">
              {(["escalation", "flags", "patterns", "brief", "pep-network", "sanctions-nexus", "typology-match"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setSuperToolsTab(t)}
                  className={tabCls(superToolsTab === t)}>
                  {t === "escalation" ? "Escalation Engine" : t === "flags" ? "Red Flag Extractor" : t === "patterns" ? "Case Patterns" : t === "brief" ? "Subject Brief" : t === "pep-network" ? "PEP Network" : t === "sanctions-nexus" ? "Sanctions Nexus" : "Typology Match"}
                </button>
              ))}
            </div>

            {/* Escalation Engine */}
            {superToolsTab === "escalation" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Escalation Decision Engine</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Subject name *</label>
                    <input value={escSubject} onChange={(e) => setEscSubject(e.target.value)} placeholder="Full subject name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Risk score (0-100)</label>
                    <input value={escScore} onChange={(e) => setEscScore(e.target.value)} placeholder="e.g. 87" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Sanctions hits (comma-separated)</label>
                    <input value={escSanctions} onChange={(e) => setEscSanctions(e.target.value)} placeholder="OFAC, UN, EU" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">PEP tier</label>
                    <input value={escPepTier} onChange={(e) => setEscPepTier(e.target.value)} placeholder="national, ministerial, local…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Typologies (comma-separated)</label>
                    <input value={escTypologies} onChange={(e) => setEscTypologies(e.target.value)} placeholder="structuring, layering, tbml" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Jurisdictions (comma-separated)</label>
                    <input value={escJurisdictions} onChange={(e) => setEscJurisdictions(e.target.value)} placeholder="RU, IR, AE" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-10 text-ink-3 mb-1">Additional notes</label>
                    <textarea value={escNotes} onChange={(e) => setEscNotes(e.target.value)} rows={2} placeholder="Any additional context…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                  </div>
                </div>
                <button type="button" onClick={() => void runEscalation()} disabled={escLoading || !escSubject.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {escLoading ? "Deciding…" : "Get Escalation Decision"}
                </button>
                {escResult && (() => {
                  const r = escResult;
                  const decisionCls = r.decision === "FILE_STR" ? "bg-red text-white" : r.decision === "ESCALATE_INTERNAL" ? "bg-red-dim text-red" : r.decision === "ENHANCE_CDD" ? "bg-amber-dim text-amber" : r.decision === "MONITOR" ? "bg-brand-dim text-brand-deep" : "bg-green-dim text-green";
                  const urgencyCls = r.urgency === "immediate" ? "bg-red text-white" : r.urgency === "24h" ? "bg-red-dim text-red" : r.urgency === "72h" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${decisionCls}`}>{r.decision.replace(/_/g, " ")}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${urgencyCls}`}>{r.urgency}</span>
                        <span className="font-mono text-10 text-ink-3">{(r.confidence * 100).toFixed(0)}% confident</span>
                      </div>
                      <div className="text-12 font-semibold text-red">{r.primaryTrigger}</div>
                      <p className="text-12 text-ink-1 leading-relaxed">{r.rationale}</p>
                      <div className="text-10 font-mono text-ink-3">{r.regulatoryBasis}</div>
                      {r.requiredActions.length > 0 && (
                        <ul className="text-11 text-ink-1 space-y-1 list-disc list-inside">
                          {r.requiredActions.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                      )}
                      {r.deadlines.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {r.deadlines.map((d, i) => <span key={i} className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red">{d}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Red Flag Extractor */}
            {superToolsTab === "flags" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Red Flag Extractor</div>
                <p className="text-11 text-ink-3">Paste raw analyst notes → Claude extracts structured FATF red flags with regulatory references.</p>
                <textarea value={flagText} onChange={(e) => setFlagText(e.target.value)} rows={6}
                  placeholder="Paste case notes, transaction descriptions, or any free-text compliance content…"
                  className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand" />
                <button type="button" onClick={() => void runFlagExtraction()} disabled={flagLoading || !flagText.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {flagLoading ? "Extracting…" : "Extract Red Flags"}
                </button>
                {flagResult && (() => {
                  const f = flagResult;
                  const riskCls = f.overallRisk === "critical" ? "bg-red text-white" : f.overallRisk === "high" ? "bg-red-dim text-red" : f.overallRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-11 font-bold px-2 py-px rounded uppercase ${riskCls}`}>{f.overallRisk} risk</span>
                        <span className="font-mono text-11 px-2 py-px rounded bg-brand-dim text-brand-deep">{f.recommendedDisposition.replace(/_/g, " ")}</span>
                        <span className="text-11 text-ink-2 italic">{f.summary}</span>
                      </div>
                      <div className="space-y-2">
                        {f.flags.map((flag, i) => {
                          const sevCls = flag.severity === "critical" ? "bg-red text-white" : flag.severity === "high" ? "bg-red-dim text-red" : flag.severity === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                          return (
                            <div key={i} className="border border-hair-2 rounded-lg p-3 bg-bg-1">
                              <div className="flex items-start gap-2 mb-1">
                                <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 ${sevCls}`}>{flag.severity}</span>
                                <span className="text-12 font-medium text-ink-0">{flag.indicator}</span>
                              </div>
                              <div className="text-10 font-mono text-ink-3 mb-1">{flag.fatfReference} · {flag.uaeReference}</div>
                              <div className="text-11 text-amber italic">{flag.actionRequired}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Case Patterns */}
            {superToolsTab === "patterns" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Cross-Case Pattern Detector</div>
                <p className="text-11 text-ink-3">Analyzes all open cases in your register for coordinated structuring, shared counterparties, typology clusters, and consolidation candidates.</p>
                <button type="button" onClick={() => void runCasePatterns()} disabled={patternLoading}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {patternLoading ? "Analyzing…" : "Detect Patterns Across Cases"}
                </button>
                {patternResult && (() => {
                  const p = patternResult;
                  const prCls = p.portfolioRisk === "critical" ? "bg-red text-white" : p.portfolioRisk === "high" ? "bg-red-dim text-red" : p.portfolioRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-11 font-bold px-2 py-px rounded uppercase ${prCls}`}>{p.portfolioRisk} portfolio risk</span>
                        {p.consolidationRequired && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red">Consolidation required</span>}
                        <span className="text-11 text-ink-2 italic">{p.summary}</span>
                      </div>
                      {p.immediateEscalations.length > 0 && (
                        <div className="text-11 font-semibold text-red">Immediate escalation: {p.immediateEscalations.join(", ")}</div>
                      )}
                      <div className="space-y-2">
                        {p.patterns.map((pat, i) => {
                          const sevCls = pat.severity === "critical" ? "bg-red text-white" : pat.severity === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber";
                          return (
                            <div key={i} className="border border-hair-2 rounded-lg p-3 bg-bg-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-mono text-9 px-1.5 py-px rounded uppercase ${sevCls}`}>{pat.severity}</span>
                                <span className="font-mono text-10 text-ink-3">{pat.type.replace(/_/g, " ")}</span>
                                <span className="text-10 text-ink-3">{pat.caseIds.join(", ")}</span>
                              </div>
                              <div className="text-12 text-ink-0 mb-0.5">{pat.description}</div>
                              <div className="text-10 text-ink-3 italic">{pat.regulatoryImplication}</div>
                              <div className="text-11 text-amber mt-1">{pat.recommendedAction}</div>
                            </div>
                          );
                        })}
                        {p.patterns.length === 0 && <div className="text-12 text-ink-3 text-center py-4">No patterns detected across current cases.</div>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Subject Brief */}
            {superToolsTab === "brief" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Subject Intelligence Brief</div>
                <p className="text-11 text-ink-3">Pre-screening intelligence brief — risk profile, likely typologies, key compliance questions to ask, and document checklist.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-10 text-ink-3 mb-1">Subject name *</label>
                    <input value={briefSubject} onChange={(e) => setBriefSubject(e.target.value)} placeholder="Full name or entity name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Entity type</label>
                    <select value={briefEntityType} onChange={(e) => setBriefEntityType(e.target.value)} className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0">
                      <option value="">— select —</option>
                      <option value="individual">Individual</option>
                      <option value="organisation">Organisation</option>
                      <option value="vessel">Vessel</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Jurisdiction (ISO-2)</label>
                    <input value={briefJurisdiction} onChange={(e) => setBriefJurisdiction(e.target.value)} placeholder="AE, RU, IR…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                </div>
                <button type="button" onClick={() => void runSubjectBrief()} disabled={briefLoading || !briefSubject.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {briefLoading ? "Briefing…" : "Generate Intelligence Brief"}
                </button>
                {briefResult && (() => {
                  const b = briefResult;
                  const compCls = b.riskProfile.compositeRisk === "high" ? "bg-red-dim text-red" : b.riskProfile.compositeRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-3 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-11 font-bold px-2 py-px rounded uppercase ${compCls}`}>{b.riskProfile.compositeRisk} risk</span>
                        <span className="text-11 text-ink-2">{b.riskProfile.rationale}</span>
                      </div>
                      {b.likelyTypologies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {b.likelyTypologies.map((t, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-brand-dim text-brand-deep">{t}</span>)}
                        </div>
                      )}
                      <div className="text-11 text-ink-2">{b.sanctionsExposure}</div>
                      {b.keyQuestions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Key questions to ask</div>
                          <ol className="text-12 text-ink-0 space-y-1 list-decimal list-inside">
                            {b.keyQuestions.map((q, i) => <li key={i}>{q}</li>)}
                          </ol>
                        </div>
                      )}
                      {b.dueDiligenceChecklist.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Document checklist</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {b.dueDiligenceChecklist.map((d, i) => <li key={i}>{d}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{b.regulatoryContext}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Typology Match */}
            {superToolsTab === "typology-match" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">FATF Typology Fingerprinter</div>
                <p className="text-11 text-ink-3">Describe transaction facts or entity behavior — AI maps them to precise FATF ML/TF/PF typologies with case references and investigative priorities.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Facts *</label>
                    <textarea
                      value={typoInput.facts}
                      onChange={(e) => setTypoInput((prev) => ({ ...prev, facts: e.target.value }))}
                      rows={5}
                      placeholder="Describe the transaction, entity behavior, or scenario in detail…"
                      className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject type</label>
                      <input
                        value={typoInput.subjectType}
                        onChange={(e) => setTypoInput((prev) => ({ ...prev, subjectType: e.target.value }))}
                        placeholder="individual, corporate, VASP, DPMS…"
                        className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0"
                      />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Transaction types (comma-separated)</label>
                      <input
                        value={typoInput.transactionTypes}
                        onChange={(e) => setTypoInput((prev) => ({ ...prev, transactionTypes: e.target.value }))}
                        placeholder="wire transfer, cash, crypto, trade finance…"
                        className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0"
                      />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Jurisdictions (comma-separated)</label>
                      <input
                        value={typoInput.jurisdictions}
                        onChange={(e) => setTypoInput((prev) => ({ ...prev, jurisdictions: e.target.value }))}
                        placeholder="AE, RU, IR, CN…"
                        className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0"
                      />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Red flags already identified (comma-separated)</label>
                      <input
                        value={typoInput.redFlags}
                        onChange={(e) => setTypoInput((prev) => ({ ...prev, redFlags: e.target.value }))}
                        placeholder="unusual cash volumes, no business rationale…"
                        className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void runTypologyMatch()}
                  disabled={typoMatchLoading || !typoInput.facts.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
                >
                  {typoMatchLoading ? "Matching…" : "Match Typologies"}
                </button>
                {typoMatch && (() => {
                  const tm = typoMatch;
                  const strengthCls = (s: string) => s === "strong" ? "bg-red text-white" : s === "moderate" ? "bg-amber-dim text-amber" : "bg-blue-dim text-blue";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      {/* Primary typology */}
                      <div className="border border-hair-2 rounded-lg p-3 bg-bg-panel">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-12 font-bold text-ink-0">{tm.primaryTypology.name}</span>
                          <span className={`font-mono text-9 px-1.5 py-px rounded uppercase font-semibold ${strengthCls(tm.primaryTypology.matchStrength)}`}>{tm.primaryTypology.matchStrength}</span>
                        </div>
                        <div className="text-10 font-mono text-ink-3 mb-1">{tm.primaryTypology.fatfReference}</div>
                        <div className="text-11 text-ink-1">{tm.primaryTypology.matchRationale}</div>
                      </div>
                      {/* Secondary typologies */}
                      {tm.secondaryTypologies.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Secondary typologies</div>
                          <div className="space-y-2">
                            {tm.secondaryTypologies.map((s, i) => (
                              <div key={i} className="border border-hair rounded-lg p-2.5 bg-bg-panel">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <span className="text-11 font-medium text-ink-0">{s.name}</span>
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase font-semibold ${strengthCls(s.matchStrength)}`}>{s.matchStrength}</span>
                                </div>
                                <div className="text-9 font-mono text-ink-3 mb-0.5">{s.fatfReference}</div>
                                <div className="text-10 text-ink-3 italic">{s.overlap}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Key indicators */}
                      {tm.keyIndicators.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5">Key indicators triggered</div>
                          <div className="flex flex-wrap gap-1.5">
                            {tm.keyIndicators.map((ind, i) => (
                              <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red font-medium">{ind}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Missing indicators */}
                      {tm.missingIndicators.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5">Investigate these (missing indicators)</div>
                          <div className="flex flex-wrap gap-1.5">
                            {tm.missingIndicators.map((ind, i) => (
                              <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-amber-dim text-amber font-medium">{ind}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Investigative priorities */}
                      {tm.investigativePriorities.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Investigative priorities</div>
                          <ol className="space-y-2">
                            {tm.investigativePriorities.map((p, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="font-mono text-10 px-1.5 py-px rounded bg-bg-2 text-ink-2 shrink-0 mt-0.5">{p.step}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="text-12 font-bold text-ink-0">{p.action}</span>
                                    <span className="font-mono text-9 px-1.5 py-px rounded bg-brand-dim text-brand-deep">{p.tool}</span>
                                  </div>
                                  <div className="text-11 text-ink-3">{p.rationale}</div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {/* STR threshold */}
                      <div className="border border-hair-2 rounded p-3 bg-bg-panel">
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">STR Threshold Assessment</div>
                        <div className="text-12 text-ink-0">{tm.strThreshold}</div>
                      </div>
                      {/* Predicate offence */}
                      {tm.predicate && (
                        <div className="flex items-center gap-2">
                          <span className="text-10 uppercase tracking-wide-3 text-ink-3">Predicate offence:</span>
                          <span className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red font-semibold">{tm.predicate}</span>
                        </div>
                      )}
                      {/* UAE case context */}
                      {tm.uaeCaseContext && (
                        <div className="text-11 text-ink-1">{tm.uaeCaseContext}</div>
                      )}
                      {/* Regulatory basis */}
                      {tm.regulatoryBasis && (
                        <div className="font-mono text-10 text-ink-3">{tm.regulatoryBasis}</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      <StrDraftModal
        open={strDraftFor !== null}
        onClose={() => setStrDraftFor(null)}
        payload={{
          question: strDraftFor?.question ?? "",
          narrative: strDraftFor?.result.narrative ?? "",
          defaultJurisdiction: strDraftFor?.result.questionAnalysis?.jurisdictions?.[0],
        }}
      />
    </ModuleLayout>
  );
}

/** Project an advisor history entry onto the EvidencePackEntry shape the
 *  PDF builder expects. Pulls everything regulator-relevant: verdict,
 *  narrative, classifier hits, FATF anchors, and the charter hash that
 *  proves provenance. */
function buildEvidencePackEntry(entry: AdvisorHistoryEntry): EvidencePackEntry {
  const a = entry.result.questionAnalysis;
  return {
    question: entry.question,
    askedAt: entry.askedAt,
    mode: entry.mode,
    verdict: entry.result.complianceReview.advisorVerdict,
    narrative: entry.result.narrative,
    guidance: entry.result.guidance,
    elapsedMs: entry.result.elapsedMs,
    partial: entry.result.partial,
    charterIntegrityHash: entry.result.charterIntegrityHash,
    reasoningTrail: entry.result.reasoningTrail,
    charterIssues: entry.result.complianceReview.issues,
    classifier: a
      ? {
          primaryTopic: a.primaryTopic,
          jurisdictions: a.jurisdictions,
          regimes: a.regimes,
          fatfRecs: a.fatfRecDetails?.map((f) => ({
            num: f.num,
            title: f.title,
            citation: f.citation,
          })),
          doctrines: a.doctrineHints,
          redFlags: a.redFlagHints,
          typologies: a.typologies,
          commonSenseRules: a.commonSenseRules,
        }
      : undefined,
    challenge: entry.challenge
      ? {
          outcome: entry.challenge.outcome,
          steelman: entry.challenge.steelman,
          weakCitations: entry.challenge.weakCitations,
          alternativeReadings: entry.challenge.alternativeReadings,
          hardenSuggestions: entry.challenge.hardenSuggestions,
        }
      : undefined,
    conflicts: findApplicableConflicts(
      entry.result.questionAnalysis?.jurisdictions ?? [],
      entry.result.questionAnalysis?.regimes ?? [],
    ).map((c) => ({
      title: c.title,
      severity: c.severity,
      jurisdictions: c.jurisdictions,
      description: c.description,
      mitigation: c.mitigation,
      authorities: c.authorities,
    })),
  };
}

function ConflictsPanel({
  jurisdictions,
  regimes,
}: {
  jurisdictions: string[];
  regimes: string[];
}) {
  const conflicts = findApplicableConflicts(jurisdictions, regimes);
  if (conflicts.length === 0) return null;
  return (
    <div className="bg-bg-panel border border-violet/30 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-10 font-semibold uppercase tracking-wide-3 text-violet">
          Cross-jurisdictional conflicts
        </span>
        <span className="text-10 font-mono text-ink-3">
          {conflicts.length} match{conflicts.length === 1 ? "" : "es"}
        </span>
      </div>
      <div className="space-y-3">
        {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} />)}
      </div>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: JurisdictionalConflict }) {
  const sevCls =
    conflict.severity === "high" ? "bg-red-100 text-red-700 border-red-300"
      : conflict.severity === "medium" ? "bg-amber-50 text-amber-700 border-amber-300"
      : "bg-bg-2 text-ink-2 border-hair-2";
  return (
    <div className="border-l-2 border-violet pl-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-10 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded border ${sevCls}`}>
          {conflict.severity}
        </span>
        <span className="text-12 text-ink-0 font-medium">{conflict.title}</span>
        <span className="text-10 font-mono text-ink-3">
          {conflict.jurisdictions.join(" ↔ ")}
        </span>
      </div>
      <p className="text-12 text-ink-1 leading-relaxed mb-2">{conflict.description}</p>
      {conflict.mitigation.length > 0 && (
        <div className="mb-2">
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
            Mitigation
          </div>
          <ol className="list-decimal list-inside space-y-0.5">
            {conflict.mitigation.map((m, i) => (
              <li key={i} className="text-11 text-ink-1 leading-relaxed">{m}</li>
            ))}
          </ol>
        </div>
      )}
      {conflict.authorities.length > 0 && (
        <div className="text-10 font-mono text-ink-3">
          {conflict.authorities.join(" · ")}
        </div>
      )}
    </div>
  );
}

/** One-line summary of the brain classifier's hits, used as the
 *  classifierContext field in the challenger request body. Keeps the
 *  challenger grounded on the same regulatory anchors the executor saw. */
function compactClassifierContext(a: QuestionAnalysis): string {
  const parts: string[] = [];
  parts.push(`topic=${a.primaryTopic}`);
  if (a.jurisdictions.length) parts.push(`juris=${a.jurisdictions.join(",")}`);
  if (a.regimes.length) parts.push(`regimes=${a.regimes.slice(0, 6).join(",")}`);
  if (a.fatfRecHints.length) parts.push(`fatf=${a.fatfRecHints.slice(0, 6).join(",")}`);
  if (a.doctrineHints.length) parts.push(`doctrines=${a.doctrineHints.slice(0, 6).join(",")}`);
  if (a.redFlagHints.length) parts.push(`red_flags=${a.redFlagHints.slice(0, 6).join(",")}`);
  return parts.join(" · ");
}

function ChallengePanel({ challenge }: { challenge: ChallengeResult }) {
  const outcomeCls =
    challenge.outcome === "UPHELD" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
      : challenge.outcome === "PARTIALLY_UPHELD" ? "bg-amber-50 text-amber-700 border-amber-300"
      : challenge.outcome === "OVERTURNED" ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <div className="bg-bg-panel border border-amber/30 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-10 font-semibold uppercase tracking-wide-3 text-amber">
          Red-team challenge
        </span>
        {challenge.outcome && (
          <span className={`text-10 font-semibold uppercase tracking-wide-2 px-2 py-0.5 rounded border ${outcomeCls}`}>
            {challenge.outcome.replace(/_/g, " ")}
          </span>
        )}
        <span className="text-10 font-mono text-ink-3">
          {challenge.challengedAt} · {challenge.elapsedMs}ms
        </span>
      </div>

      {challenge.steelman && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
            Strongest counter-argument
          </div>
          <p className="text-12 text-ink-0 leading-relaxed">{challenge.steelman}</p>
        </div>
      )}

      {challenge.weakCitations.length > 0 && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
            Weak citations
          </div>
          <ul className="space-y-1">
            {challenge.weakCitations.map((wc, i) => (
              <li key={i} className="text-12 text-ink-1 leading-relaxed">
                <span className="font-mono text-amber">{wc.citation}</span>
                {wc.why && <span className="text-ink-2"> — {wc.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {challenge.alternativeReadings.length > 0 && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
            Alternative regulatory readings
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {challenge.alternativeReadings.map((r, i) => (
              <li key={i} className="text-12 text-ink-1 leading-relaxed">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {challenge.hardenSuggestions.length > 0 && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
            Harden suggestions
          </div>
          <ol className="list-decimal list-inside space-y-0.5">
            {challenge.hardenSuggestions.map((h, i) => (
              <li key={i} className="text-12 text-ink-1 leading-relaxed">{h}</li>
            ))}
          </ol>
        </div>
      )}

      <details className="group">
        <summary className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
          Raw critique ▶
        </summary>
        <pre className="mt-2 text-11 text-ink-2 whitespace-pre-wrap font-mono leading-relaxed">
          {challenge.fullCritique}
        </pre>
      </details>
    </div>
  );
}

// ── Classifier UI ───────────────────────────────────────────────────────────

interface LiveAnalysisShape {
  primaryTopic: string;
  topics: string[];
  jurisdictions: string[];
  regimes: string[];
  fatfRecHints: string[];
  doctrineHints: string[];
  redFlagHints: string[];
  urgencyFlags: string[];
  confidence: "high" | "medium" | "low";
}

function LiveClassifierBadges({ question }: { question: string }) {
  const [analysis, setAnalysis] = useState<LiveAnalysisShape | null>(null);
  useEffect(() => {
    const trimmed = question.trim();
    if (trimmed.length < 12) {
      setAnalysis(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void fetch("/api/mlro-classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ok?: boolean; analysis?: LiveAnalysisShape } | null) => {
          if (j?.ok && j.analysis) setAnalysis(j.analysis);
        })
        .catch(() => { /* aborted or offline */ });
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [question]);

  if (!analysis) return null;
  const chips: Array<{ label: string; tone: "brand" | "violet" | "amber" | "red" | "ink" }> = [];
  chips.push({ label: `topic: ${analysis.primaryTopic.replace(/_/g, " ")}`, tone: "brand" });
  for (const j of analysis.jurisdictions) chips.push({ label: j, tone: "violet" });
  for (const r of analysis.regimes.slice(0, 4)) chips.push({ label: r, tone: "amber" });
  for (const f of analysis.fatfRecHints.slice(0, 3)) chips.push({ label: f.replace("_", " "), tone: "ink" });
  for (const u of analysis.urgencyFlags) chips.push({ label: `⚠ ${u.replace(/_/g, " ")}`, tone: "red" });
  return (
    <div className="flex flex-wrap gap-1 items-center text-10 font-mono">
      <span className="text-ink-3 mr-1">classifier ({analysis.confidence}):</span>
      {chips.map((c, i) => (
        <span
          key={i}
          className={
            c.tone === "brand" ? "px-1.5 py-px rounded bg-brand-dim text-brand"
            : c.tone === "violet" ? "px-1.5 py-px rounded bg-violet-dim text-violet"
            : c.tone === "amber" ? "px-1.5 py-px rounded bg-amber-dim text-amber"
            : c.tone === "red" ? "px-1.5 py-px rounded bg-red-dim text-red"
            : "px-1.5 py-px rounded bg-bg-2 text-ink-1"
          }
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function ClassifierResultPanels({
  analysis,
  onPick,
}: {
  analysis: QuestionAnalysis;
  onPick: (q: string) => void;
}) {
  const moduleChips: Array<[string, string]> = [
    ...analysis.doctrineHints.map((d) => ["doctrine", d] as [string, string]),
    ...analysis.fatfRecHints.map((f) => ["fatf", f.replace("_", " ")] as [string, string]),
    ...analysis.playbookHints.slice(0, 8).map((p) => ["playbook", p] as [string, string]),
    ...analysis.redFlagHints.slice(0, 8).map((r) => ["red-flag", r] as [string, string]),
    ...analysis.typologies.map((t) => ["typology", t] as [string, string]),
  ];
  const ip = analysis.intelligenceProfile;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 space-y-3">
      {ip && (() => {
        const score = ip.coverageScore;
        const grade =
          score >= 75 ? { label: "STRONG", cls: "text-brand", bar: "bg-brand" }
          : score >= 45 ? { label: "MEDIUM", cls: "text-amber", bar: "bg-amber" }
          : { label: "WEAK",   cls: "text-red",   bar: "bg-red" };
        return (
          <div className="flex items-center gap-3">
            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3">
              Brain coverage
            </div>
            <div className="flex-1 h-2 bg-bg-2 rounded overflow-hidden max-w-xs">
              <div
                className={`h-2 ${grade.bar}`}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <div className={`font-mono text-12 font-semibold ${grade.cls}`}>{score}/100</div>
            <div
              className={`text-10 font-mono font-semibold uppercase tracking-wide-3 ${grade.cls}`}
              title="STRONG ≥75 = safe to act on; MEDIUM 45–74 = corroborate; WEAK <45 = escalate to Opus deep-reasoning."
            >
              {grade.label}
            </div>
            <div className="text-10 font-mono text-ink-3 ml-1">
              ({ip.totalArtefacts} artefacts · {ip.doctrineCount} doc · {ip.fatfRecCount} FATF · {ip.playbookCount} pb · {ip.redFlagCount} rf · {ip.typologyCount} typ · {ip.jurisdictionCount} juris)
            </div>
          </div>
        );
      })()}
      {analysis.fatfRecDetails && analysis.fatfRecDetails.length > 0 && (
        <details className="group">
          <summary className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
            FATF Recommendations anchored ({analysis.fatfRecDetails.length}) ▶
          </summary>
          <div className="mt-2 space-y-1">
            {analysis.fatfRecDetails.map((f) => (
              <div key={f.id} className="text-11 leading-snug border-l-2 border-amber pl-2">
                <span className="font-mono font-semibold text-amber">R.{f.num}</span>{" "}
                <span className="text-ink-0">{f.title}</span>
                <span className="ml-2 font-mono text-10 text-ink-3">{f.citation}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div>
        <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
          Brain modules engaged
          <span className="ml-2 font-mono text-ink-3 normal-case">({moduleChips.length})</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {moduleChips.map(([kind, id], i) => (
            <span
              key={`${kind}-${id}-${i}`}
              className={
                kind === "doctrine" ? "text-10 font-mono px-1.5 py-px rounded bg-violet-dim text-violet"
                : kind === "fatf" ? "text-10 font-mono px-1.5 py-px rounded bg-amber-dim text-amber"
                : kind === "playbook" ? "text-10 font-mono px-1.5 py-px rounded bg-brand-dim text-brand"
                : kind === "red-flag" ? "text-10 font-mono px-1.5 py-px rounded bg-red-dim text-red"
                : "text-10 font-mono px-1.5 py-px rounded bg-bg-2 text-ink-1"
              }
              title={kind}
            >
              {id}
            </span>
          ))}
        </div>
      </div>

      {analysis.commonSenseRules.length > 0 && (
        <details className="group">
          <summary className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 cursor-pointer hover:text-ink-1 select-none">
            Common-sense rules applied ({analysis.commonSenseRules.length}) ▶
          </summary>
          <ol className="mt-2 space-y-1 list-decimal pl-5">
            {analysis.commonSenseRules.map((r, i) => (
              <li key={i} className="text-11 text-ink-1 leading-relaxed">{r}</li>
            ))}
          </ol>
        </details>
      )}

      {analysis.suggestedFollowUps.length > 0 && (
        <div>
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
            Suggested next questions
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.suggestedFollowUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="text-11 px-2 py-1 rounded border border-hair-2 bg-bg-1 hover:border-brand hover:bg-brand-dim hover:text-brand transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
