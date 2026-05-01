"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { StrDraftModal } from "@/components/shared/StrDraftModal";
import { downloadEvidencePack, type EvidencePackEntry } from "@/lib/evidencePack";
import { exportMlroMemo } from "@/lib/pdf/exporters";
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

interface TfIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  typology: "structured_transfers" | "npo_abuse" | "hawala_ivts" | "crypto_tf" | "crowdfunding" | "foreign_fighter" | "lone_actor" | "cash_courier" | "trade_based" | "other";
  fatfRef: string;
  detail: string;
}

interface TfScreenerResult {
  tfRisk: "critical" | "high" | "medium" | "low" | "clear";
  designatedEntityHit: boolean;
  unscr1267Hit: boolean;
  unscr1373Nexus: "confirmed" | "possible" | "unlikely" | "none";
  npOAbuseRisk: "high" | "medium" | "low" | "none";
  hawalaNexus: "high" | "medium" | "low" | "none";
  cryptoTfRisk: "high" | "medium" | "low" | "none";
  indicators: TfIndicator[];
  primaryTypology: string;
  primaryTypologyRef: string;
  recommendedAction: "freeze_and_report_immediately" | "file_str" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  mandatoryFreeze: boolean;
  freezeBasis?: string;
  freezeTimeline?: string;
  requiredActions: string[];
  applicableRegime: string[];
  regulatoryBasis: string;
  ctfObligations: string[];
}

interface StrNarrativeResult {
  narrative: string;
  wordCount: number;
  qualityScore: number;
  fatfR20Coverage: string[];
  missingElements: string[];
  goAmlFields: { reportType: string; suspiciousActivityType: string; filingBasis: string; deadlineDate: string };
  regulatoryBasis: string;
}

interface WireR16Result {
  r16Compliant: boolean;
  complianceLevel: "fully_compliant" | "partially_compliant" | "non_compliant";
  verdict: "stp" | "hold_and_request" | "return_to_sender" | "freeze_and_report";
  verdictRationale: string;
  originatorCheck: { namePresent: boolean; accountPresent: boolean; addressOrIdPresent: boolean; missing: string[] };
  beneficiaryCheck: { namePresent: boolean; accountPresent: boolean; missing: string[] };
  thresholdApplicable: boolean;
  thresholdAnalysis: string;
  requiredActions: string[];
  timeLimit: string;
  regulatoryBasis: string;
}

interface PfRisk {
  category: "dprk" | "iran" | "dual_use" | "unscr" | "proliferator_network" | "other";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  unscr?: string;
  mandatoryFreeze: boolean;
  detail: string;
}

interface PfScreenerResult {
  pfRisk: "critical" | "high" | "medium" | "low" | "clear";
  dprkNexus: "confirmed" | "possible" | "unlikely" | "none";
  iranNexus: "confirmed" | "possible" | "unlikely" | "none";
  dualUseRisk: "high" | "medium" | "low" | "none";
  mandatoryFreezeRequired: boolean;
  freezeBasis?: string;
  risks: PfRisk[];
  recommendedAction: "freeze_and_report" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  applicableUnscrs: string[];
  requiredChecks: string[];
  regulatoryBasis: string;
}

interface MlroMemoResult {
  memoRef: string;
  memo: string;
  decision: "file_str" | "escalate_senior" | "enhanced_cdd" | "monitor_and_review" | "close_no_action";
  decisionBasis: string;
  riskRating: "critical" | "high" | "medium" | "low";
  auditElements: { subjectIdentified: boolean; activityDocumented: boolean; redFlagsListed: boolean; regulatoryBasisCited: boolean; decisionRationalePresent: boolean; deadlineNoted: boolean };
  qualityScore: number;
  regulatoryBasis: string;
}

interface TransactionAnalysis {
  typology: string;
  typologyFatfRef: string;
  strRequired: boolean;
  strBasis: string;
  strDeadline: string;
  riskVerdict: "critical" | "high" | "medium" | "low" | "clear";
  redFlags: Array<{ indicator: string; severity: "critical" | "high" | "medium"; fatfRef: string }>;
  recommendedAction: "file_str" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  regulatoryBasis: string;
  missingInformation: string[];
  investigativeQuestions: string[];
}

interface EddQuestion {
  id: string;
  category: string;
  question: string;
  rationale: string;
  regulatoryBasis: string;
  mandatory: boolean;
  followUp?: string;
}

interface EddQuestionnaire {
  eddLevel: "standard" | "enhanced" | "intensive";
  eddBasis: string;
  totalQuestions: number;
  mandatoryCount: number;
  categories: string[];
  questions: EddQuestion[];
  documentationRequired: string[];
  seniorApprovalRequired: boolean;
  reviewFrequency: string;
  regulatoryBasis: string;
}

interface TbmlIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "pricing" | "documentation" | "routing" | "counterparty" | "quantity" | "pattern";
  fatfRef: string;
  detail: string;
}

interface TbmlAnalysis {
  tbmlRisk: "critical" | "high" | "medium" | "low" | "clear";
  tbmlTypology: string;
  tbmlTypologyRef: string;
  overInvoicingRisk: "high" | "medium" | "low" | "none";
  underInvoicingRisk: "high" | "medium" | "low" | "none";
  phantomShipmentRisk: "high" | "medium" | "low" | "none";
  multipleInvoicingRisk: "high" | "medium" | "low" | "none";
  indicators: TbmlIndicator[];
  recommendedAction: "block" | "escalate_mlro" | "file_str" | "enhanced_dd" | "request_docs" | "clear";
  actionRationale: string;
  documentationGaps: string[];
  investigativeSteps: string[];
  regulatoryBasis: string;
  oecdStep: string;
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

// ── Extended super-tool types ─────────────────────────────────────────────────

interface ShellRedFlag { flag: string; severity: "critical"|"high"|"medium"|"low"; category: "structure"|"director"|"activity"|"geography"|"financial"|"documentation"; fatfRef: string; detail: string }
interface ShellDetectorResult {
  shellRisk: "critical"|"high"|"medium"|"low"|"clear"; shellProbability: number;
  redFlags: ShellRedFlag[]; structureIndicators: string[];
  jurisdictionRisk: "high"|"medium"|"low"|"none"; layeringRisk: "high"|"medium"|"low"|"none";
  recommendedAction: "reject"|"escalate_mlro"|"enhanced_dd"|"verify_and_monitor"|"clear";
  actionRationale: string; requiredDocumentation: string[]; regulatoryBasis: string;
}

interface AdversePredicateOffence { offence: string; fatfPredicate: string; severity: "critical"|"high"|"medium"|"low"; uaeLegalBasis: string; detail: string }
interface AdverseClassifyResult {
  adverseRisk: "critical"|"high"|"medium"|"low"|"none"; sarThresholdMet: boolean; sarBasis: string;
  predicateOffences: AdversePredicateOffence[];
  keyEntities: Array<{name: string; role: string; relevance: "primary"|"secondary"|"peripheral"}>;
  mediaCredibility: "high"|"medium"|"low"; temporalRelevance: "current"|"historical"|"unclear";
  corroborationRequired: string[];
  recommendedAction: "file_str_immediately"|"escalate_mlro"|"enhanced_monitoring"|"note_and_monitor"|"disregard";
  actionRationale: string; regulatoryBasis: string; fatfR3Predicates: string[];
}

interface TimelineEvent { date: string; event: string; significance: "critical"|"high"|"medium"|"low"; fatfRef?: string; evidenceType: "transaction"|"behaviour"|"intelligence"|"document"|"screening"|"other" }
interface CaseTimelineResult {
  timeline: TimelineEvent[]; narrativeSummary: string; keyDateRange: string; totalDuration: string;
  patternIdentified: string; goAmlNarrativeBlock: string; suspicionCrystallisedDate: string;
  strDeadline: string; regulatoryBasis: string;
}

interface MlPredicateResult {
  primaryPredicate: {offence: string; uaeLegalRef: string; fatfCategory: string; maxPenalty: string; imprisonmentYears?: string; fineAed?: string};
  secondaryPredicates: Array<{offence: string; uaeLegalRef: string; fatfCategory: string; maxPenalty: string; overlap: string}>;
  mlOffenceApplicable: boolean; mlLegalBasis: string; proceedsEstimate: string;
  selfLaunderingApplicable: boolean; strRequired: boolean; strBasis: string;
  investigativeActions: string[]; jurisdictionalIssues: string[]; regulatoryBasis: string; fatfR3Categories: string[];
}

interface ClientRiskResult {
  overallRisk: "critical"|"high"|"medium"|"low"; riskNarrative: string; jurisdictionalRisk: string; ownershipRisk: string;
  pepExposure: {detected: boolean; pepNames: string[]; mitigants: string};
  cddRequirements: string[]; eddRequired: boolean; eddReason: string; enhancedMeasures: string[];
  recommendedAction: "onboard_standard"|"onboard_with_edd"|"refer_to_mlro"|"reject"|"pending_docs";
  regulatoryBasis: string; riskRating: string;
}

interface JurisdictionIntelResult {
  countryName: string; overallRisk: "critical"|"high"|"medium"|"low"; fatfStatus: string; fatfDetail: string;
  sanctionsExposure: {uae: string; un: string; ofac: string; eu: string; uk: string};
  cahraStatus: string; keyRisks: string[]; dpmsSpecificRisks: string[]; typologiesPrevalent: string[];
  cddImplications: string; transactionRisks: string; recentDevelopments: string;
  uaeRegulatoryRequirement: string; riskMitigation: string[];
}

interface UboRiskResult {
  overallRisk: "critical"|"high"|"medium"|"low"; riskNarrative: string; ownershipStructureRisk: string;
  pepRiskFlags: string[]; nationalityRisks: string[]; cddGaps: string[];
  recommendedActions: string[]; regulatoryBasis: string; eddRequired: boolean; sanctionsScreeningRequired: boolean;
}

interface BenfordDigit { digit: number; observed: number; observedPct: number; expectedPct: number; deviation: number }
interface BenfordResult {
  ok: boolean; label: string; n: number; mad: number; chiSquared: number; chiSquaredPValue: number;
  risk: "clean"|"marginal"|"suspicious"|"insufficient-data"; riskDetail: string;
  digits: BenfordDigit[]; flaggedDigits: number[]; error?: string;
}

interface OnboardingRiskResult {
  tier: "tier-1"|"tier-2"|"tier-3"; score: number;
  factors: Array<{id: string; label: string; points: number; anchor?: string}>;
  rationale: string;
  jurisdictionHits: Array<{list: string; label: string; stale: boolean; classification?: "grey"|"black"}>;
}

interface PfIndicator { indicator: string; severity: "critical"|"high"|"medium"|"low"; category: "dual_use"|"sanctions_evasion"|"financing_pattern"|"entity"|"jurisdiction"|"trade"|"other"; unscr: string; detail: string }
interface ProlifFinanceResult { pfRisk: "critical"|"high"|"medium"|"low"|"clear"; wmdNexus: "confirmed"|"possible"|"unlikely"|"none"; sanctionedEntityHit: boolean; dualUseGoodsDetected: boolean; dualUseCategories: string[]; indicators: PfIndicator[]; primaryConcern: string; mandatoryFreeze: boolean; freezeBasis?: string; recommendedAction: "freeze_and_report_immediately"|"file_str"|"escalate_mlro"|"enhanced_dd"|"monitor"|"clear"; actionRationale: string; requiredActions: string[]; applicableRegime: string[]; regulatoryBasis: string; pfObligations: string[] }
interface SarTriageResult { decision: "file_str"|"no_file"|"more_info"|"escalate_mlro"; confidenceLevel: "high"|"medium"|"low"; suspicionTest: "met"|"not_met"|"borderline"; suspicionBasis: string; thresholdAnalysis: string; tippingOffRisk: boolean; tippingOffWarning?: string; fatfR20Assessment: string; strDeadline?: string; strDeadlineBasis?: string; requiredFields: Array<{field: string; status: "available"|"missing"|"partial"; note?: string}>; missingInformation: string[]; narrativeQuality: "sufficient"|"needs_expansion"|"insufficient"; narrativeSuggestions: string[]; predetermination: string; supervisoryDisclosure?: string; regulatoryBasis: string; decisionRationale: string }
interface DocFraudIndicator { indicator: string; severity: "critical"|"high"|"medium"|"low"; documentType: string; detail: string }
interface DocumentFraudResult { fraudRisk: "critical"|"high"|"medium"|"low"|"clear"; fraudProbability: number; documentAssessments: Array<{docType: string; authentic: "likely"|"suspect"|"counterfeit"|"unknown"; redFlags: string[]; verificationRequired: string[]}>; indicators: DocFraudIndicator[]; identityConsistency: "consistent"|"inconsistent"|"partially_inconsistent"|"unknown"; kycImpact: "reject"|"re_verify"|"enhanced_verification"|"acceptable"; recommendedAction: "reject_onboarding"|"escalate_mlro"|"re_verify_documents"|"enhanced_dd"|"clear"; actionRationale: string; requiredVerificationSteps: string[]; externalVerificationSources: string[]; regulatoryBasis: string }
interface CtrStructuringResult { structuringDetected: boolean; structuringRisk: "critical"|"high"|"medium"|"low"|"none"; ctrRequired: boolean; ctrCount: number; ctrThresholdAed: number; smurfingPattern: boolean; patternDescription: string; totalValueAed: number; periodDays: number; averageTransactionAed: number; thresholdProximityPct: number; transactions: Array<{amount: number; date?: string; type?: string; proximityToCtrPct: number; flag: boolean}>; structuringBands: Array<{band: string; count: number; totalAed: number}>; recommendedAction: "file_ctr_and_str"|"file_str"|"file_ctr"|"escalate_mlro"|"monitor"|"clear"; actionRationale: string; ctrDeadline?: string; strBasis?: string; regulatoryBasis: string }
interface DnfbpObligationsResult { dnfbpCategory: string; dnfbpSubType: string; regulatoryAuthority: string; isRegulated: boolean; obligationTriggered: boolean; triggerThreshold?: string; triggerActivity?: string; cddRequired: boolean; cddLevel: "standard"|"simplified"|"enhanced"|"n/a"; strRequired: boolean; strBasis?: string; ctrRequired: boolean; ctrThreshold?: string; registrationRequired: boolean; registrationBody?: string; keyObligations: Array<{obligation: string; legalBasis: string; deadline?: string; notes?: string}>; prohibitedActivities: string[]; recordKeepingYears: number; supervisoryBody: string; sanctionsForNonCompliance: string; regulatoryBasis: string; practicalGuidance: string }
interface CddRefreshTriggerResult { refreshRequired: boolean; urgency: "immediate"|"within_30_days"|"within_90_days"|"scheduled"|"none"; triggerEvents: Array<{event: string; triggered: boolean; legalBasis: string; deadline?: string; severity: "mandatory"|"recommended"|"advisory"}>; currentRiskTier: "high"|"medium"|"low"|"unknown"; recommendedCddLevel: "full_edd"|"standard_cdd"|"simplified_cdd"; eddRequired: boolean; eddReason?: string; riskReviewRequired: boolean; fieldsToReverify: string[]; additionalDocumentsRequired: string[]; accountActionPending?: string; actionRationale: string; reviewDeadline?: string; regulatoryBasis: string }
interface VaspRiskResult { overallRisk: "critical"|"high"|"medium"|"low"; varaLicensed: boolean; travelRuleCompliant: boolean; travelRuleAssessment: string; custodyModel: "self_custody"|"custodial"|"non_custodial"|"hybrid"|"unknown"; exchangeType: string; geographicExposure: "high"|"medium"|"low"; highRiskJurisdictions: string[]; sanctionedExposure: boolean; darknetExposure: "confirmed"|"possible"|"unlikely"|"none"; mixingServiceExposure: "confirmed"|"possible"|"unlikely"|"none"; amlProgramAssessment: string; cddApproach: "robust"|"adequate"|"weak"|"unknown"; riskIndicators: Array<{indicator: string; severity: "critical"|"high"|"medium"|"low"; detail: string}>; recommendedAction: "reject"|"escalate_mlro"|"enhanced_dd"|"verify_and_monitor"|"onboard_standard"; actionRationale: string; requiredDocumentation: string[]; regulatoryObligations: string[]; regulatoryBasis: string }
interface GoAmlFieldCheck { field: string; section: "header"|"subject"|"transactions"|"narrative"|"reporting_entity"; status: "complete"|"incomplete"|"missing"|"invalid"; currentValue?: string; requiredFormat?: string; issue?: string; recommendation?: string }
interface GoAmlValidatorResult { overallStatus: "ready_to_file"|"needs_corrections"|"incomplete"|"rejected"; completenessScore: number; narrativeQuality: "excellent"|"good"|"adequate"|"poor"|"insufficient"; fieldChecks: GoAmlFieldCheck[]; criticalIssues: string[]; warnings: string[]; narrativeFeedback: string; narrativeStrengths: string[]; narrativeWeaknesses: string[]; goAmlSpecificRequirements: string[]; improvedNarrativeSuggestion?: string; filingDeadlineAssessment?: string; regulatoryBasis: string }
interface PepEddResult { pepClassification: "domestic_pep"|"foreign_pep"|"international_organisation_pep"|"former_pep"|"pep_family"|"pep_associate"|"not_pep"; pepRole: string; pepJurisdiction: string; riskRating: "very_high"|"high"|"medium"; seniorManagementApproval: boolean; approvalLevel: string; eddQuestionnaire: Array<{category: string; question: string; purpose: string; documentaryEvidence?: string}>; sourceOfWealthAssessment: string; sourceOfFundsAssessment: string; requiredDocumentation: string[]; ongoingMonitoringFrequency: string; ongoingMonitoringMeasures: string[]; screeningRequirements: string[]; pepMemo: string; recommendedAction: "onboard_with_enhanced_measures"|"refer_senior_management"|"decline"|"exit_relationship"; actionRationale: string; regulatoryBasis: string }
interface SanctionsListHit { list: string; listAuthority: string; hitType: "confirmed"|"possible"|"name_match"|"none"; designationDate?: string; designationBasis?: string; assetFreezeRequired: boolean; freezeTimeline?: string; dealingProhibition: boolean; reportingObligation?: string }
interface SanctionsExposureResult { overallExposure: "confirmed_hit"|"high"|"medium"|"low"|"none"; immediateFreeze: boolean; freezeBasis?: string; listHits: SanctionsListHit[]; assetFreezeRequired: boolean; dealingProhibition: boolean; tippingOffRisk: boolean; recommendedAction: "freeze_immediately"|"file_str"|"escalate_mlro"|"enhanced_screening"|"clear"; actionRationale: string; frozenAssetReportingDeadline?: string; applicableRegime: string[]; complianceObligations: string[]; regulatoryBasis: string }

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
  {
    label: "Terrorism Financing",
    questions: [
      "What are the FATF R.5 elements for the TF criminal offence?",
      "What is the UAE CTF Law No. 7/2014 freeze obligation for UNSCR 1267 designations?",
      "What TF red flags must DPMS dealers monitor under FATF guidance?",
      "How does hawala/IVTS create TF exposure under FATF R.14?",
      "When does a UNSCR 1267/1988 hit require immediate freeze without court order?",
      "What does UNSCR 2178 require on foreign terrorist fighter financing?",
    ],
  },
  {
    label: "Proliferation Financing",
    questions: [
      "What does FATF R.7 require on targeted financial sanctions for proliferation?",
      "What DPRK transactions are prohibited under UNSCR 1718 and 2375?",
      "What dual-use goods trigger UAE Cabinet Decision 57/2020 export controls?",
      "How does UNSCR 2231 restrict Iran-related financial transactions?",
      "What are the 50% rule implications for DPRK-owned entities?",
      "What does FATF's 2018 Guidance on Proliferation Financing Risk Assessment require?",
    ],
  },
  {
    label: "Virtual Assets / VASP",
    questions: [
      "What AML/CFT obligations apply to UAE-licensed VASPs under CBUAE guidance?",
      "What does FATF R.15 require of virtual asset service providers?",
      "What is the travel rule requirement for virtual asset transfers?",
      "How do we apply the FATF 'sunrise problem' guidance for crypto travel rule?",
      "What red flags indicate crypto-TF or crypto-ML in gold/DPMS transactions?",
      "What VASP due diligence is required before accepting crypto payments for gold?",
    ],
  },
  {
    label: "PEP — Enhanced Scrutiny",
    questions: [
      "What is the FATF R.12 definition of a domestic PEP vs foreign PEP?",
      "What enhanced measures are required for a Tier-1 PEP client under UAE rules?",
      "When can a PEP be stepped down from enhanced monitoring?",
      "What family members and close associates must be screened under FATF R.12?",
      "What senior management approval is required before onboarding a foreign PEP?",
      "How frequently must PEP clients be re-screened against sanctions lists?",
    ],
  },
  {
    label: "Cash & Physical Currency",
    questions: [
      "What is the UAE cash declaration threshold at entry/exit points?",
      "What reporting obligation applies to cash transactions above AED 55,000?",
      "What red flags indicate cash structuring below the AED 55,000 threshold?",
      "What records must be kept for cash transactions under FDL 10/2025?",
      "What due diligence applies when a DPMS client pays in physical gold rather than cash?",
      "How does FATF R.32 apply to cross-border transportation of cash and BNIs?",
    ],
  },
  {
    label: "Correspondent Banking",
    questions: [
      "What FATF R.13 obligations apply before establishing a correspondent relationship?",
      "What nested correspondent account risks must DPMS dealers monitor?",
      "What is the UAE position on shell bank correspondent relationships?",
      "How does FATF R.13 apply to payable-through accounts in the UAE context?",
    ],
  },
  {
    label: "Beneficial Ownership",
    questions: [
      "What is the UAE ultimate beneficial owner disclosure threshold under FDL 10/2025?",
      "What are the penalties for providing false UBO information under UAE law?",
      "How do we verify UBO claims for a BVI or Cayman holding structure?",
      "What does FATF R.24 require on legal persons' beneficial ownership transparency?",
      "When must UBO information be re-verified during the customer lifecycle?",
    ],
  },
  {
    label: "Sanctions — Advanced",
    questions: [
      "What is the OFAC 50% rule and how does it apply to UAE-based entities?",
      "How does the EU 'ownership and control' test differ from the OFAC 50% rule?",
      "What is the difference between primary and secondary sanctions exposure?",
      "When does a UAE entity face US secondary sanctions risk on gold transactions?",
      "What is OFAC's general licence framework and when does it apply to gold trade?",
      "What is the blocking statute implication of EU Regulation 2271/96 for UAE entities?",
    ],
  },
  {
    label: "goAML & FIU Reporting",
    questions: [
      "What is the difference between an STR and an SAR under UAE goAML rules?",
      "What is an Additional Information File (AIF) and when must it be filed?",
      "What are the goAML XML schema mandatory fields for a gold-sector STR?",
      "What is the UAE FIU feedback mechanism after an STR is filed?",
      "Can the UAE FIU request additional information after an STR is submitted?",
      "What is the goAML 'continuing suspicious activity' reporting obligation?",
    ],
  },
  {
    label: "UAE Real Estate & DNFBPs",
    questions: [
      "What AML/CFT obligations apply to UAE real estate agents under FDL 10/2025?",
      "What is the cash payment reporting threshold for UAE real estate transactions?",
      "What CDD is required before completing a high-value real estate transaction in the UAE?",
      "What red flags must UAE real estate agents monitor for property sector ML?",
      "How does FATF Guidance on DNFBP risk apply to UAE real estate developers?",
      "What does UAE Cabinet Decision 57/2018 require from real estate sector DNFBPs?",
    ],
  },
  {
    label: "Legal Persons & Arrangements",
    questions: [
      "What is the UAE's beneficial ownership disclosure threshold under FDL 10/2025?",
      "How do we verify UBO claims for a trust structure under UAE law?",
      "What CDD applies to a shelf company with nominee directors under FATF R.24?",
      "What does UAE Cabinet Resolution 109/2023 require on UBO registers?",
      "What are the red flags for complex layered ownership structures in the UAE?",
      "What happens when a UAE entity cannot identify its UBO — what are the obligations?",
    ],
  },
  {
    label: "Non-Profit Organizations (NPOs)",
    questions: [
      "What FATF R.8 measures apply to non-profit organizations operating in the UAE?",
      "What due diligence is required before accepting donations from an NPO?",
      "What red flags indicate NPO abuse for TF purposes under FATF guidance?",
      "What UAE regulatory body supervises NPOs for AML/CFT compliance?",
      "What does FATF Guidance on NPO Risk Assessment (2023) recommend for risk-based supervision?",
      "What enhanced measures apply to NPOs transferring funds to conflict-affected zones?",
    ],
  },
  {
    label: "Trade Finance & Letters of Credit",
    questions: [
      "What TBML red flags must banks monitor in documentary credit transactions?",
      "What due diligence applies before issuing a letter of credit for CAHRA goods?",
      "What does FATF Guidance on Trade-Based Money Laundering (2020) require?",
      "How do we detect phantom shipments in a trade finance transaction?",
      "What over/under-invoicing indicators should trigger enhanced scrutiny under UAE AML rules?",
      "What does ICC Guidance on trade finance and AML require from issuing banks?",
    ],
  },
  {
    label: "UAE Free Zones",
    questions: [
      "What AML/CFT obligations apply to entities registered in UAE free zones?",
      "How does FDL 10/2025 apply to DIFC and ADGM-licensed entities?",
      "What enhanced CDD applies to free zone companies with no UAE nexus business?",
      "What red flags indicate free zone abuse for sanctions evasion?",
      "What are the AML supervisory responsibilities of UAE free zone authorities?",
      "How does the DFSA AML Module differ from CBUAE AML requirements?",
    ],
  },
  {
    label: "Insurance Sector",
    questions: [
      "What AML/CFT obligations apply to UAE life insurers under IA Circular 8/2022?",
      "What CDD is required before issuing a single-premium life insurance policy?",
      "What red flags indicate ML through life insurance products in the UAE?",
      "What does FATF Guidance on life insurance sector ML apply to UAE operators?",
      "When must a UAE insurer file an STR for a suspicious insurance claim?",
      "What enhanced monitoring applies to insurance policies purchased by PEPs?",
    ],
  },
  {
    label: "Internal Audit & Compliance Testing",
    questions: [
      "What elements must a UAE AML internal audit programme cover under FDL 10/2025?",
      "How frequently must AML controls be independently tested in a UAE DPMS entity?",
      "What does FATF R.18 require on internal controls, audit, and compliance?",
      "What are the key AML internal audit findings that must be escalated to the Board?",
      "What transaction monitoring effectiveness tests must an AML audit conduct?",
      "What documentation must be retained from an AML compliance testing exercise?",
    ],
  },
  {
    label: "New Payment Methods",
    questions: [
      "What AML/CFT obligations apply to UAE-licensed e-wallet providers under CBUAE rules?",
      "What red flags indicate ML through buy-now-pay-later (BNPL) products?",
      "What CDD applies to customers using mobile payment apps for high-value transactions?",
      "How does FATF Guidance on New Payment Methods apply to prepaid cards in the UAE?",
      "What CBUAE supervision applies to payment service providers for AML purposes?",
      "What does FATF R.15 require of payment system operators regarding new technologies?",
    ],
  },
  {
    label: "Money Service Businesses (MSBs)",
    questions: [
      "What licensing requirements apply to UAE money exchange houses under CBUAE rules?",
      "What CDD applies when a customer exchanges more than AED 35,000 at a UAE exchange?",
      "What red flags must UAE hawala / IVTS operators monitor under FATF R.14?",
      "What reporting obligation applies to unregistered hawala operators discovered in the UAE?",
      "What transaction monitoring systems must UAE exchange houses maintain?",
      "What does UAE Cabinet Decision 57/2018 require from money transfer operators?",
    ],
  },
  {
    label: "Customer Risk Rating Models",
    questions: [
      "What risk factors must a UAE entity's customer risk rating model include under FDL 10/2025?",
      "What weighting should jurisdiction risk have in a UAE DPMS customer risk scoring model?",
      "When must a customer risk rating be reviewed outside the scheduled review cycle?",
      "What does FATF R.10 require on ongoing monitoring and risk-based customer classification?",
      "What are the minimum risk factors for a PEP customer risk rating under UAE rules?",
      "What documentation must support a downgrade of a customer from high to medium risk?",
    ],
  },
  {
    label: "Virtual Assets & VASP Onboarding",
    questions: [
      "What licence must a UAE VASP obtain before offering virtual asset services under VARA?",
      "What Travel Rule requirements apply to UAE virtual asset transfers under FATF R.16?",
      "When must a UAE FI apply enhanced CDD to a VASP correspondent relationship?",
      "What are the UAE CBUAE requirements for FIs dealing with unhosted wallet transactions?",
      "How does VARA's technology governance framework apply to VASP AML programmes?",
      "What blockchain analytics tools are considered adequate for UAE VASP CDD?",
    ],
  },
  {
    label: "Proliferation Financing (PF)",
    questions: [
      "What is the UAE's legal framework for countering proliferation financing under FDL 10/2025?",
      "Which UNSC resolutions impose immediate asset freeze obligations in UAE for PF?",
      "What goods are considered dual-use under UAE Federal Decree-Law 26/2021 Strategic Goods Control?",
      "What is the UAE CBUAE PF Circular 2023 and what does it require from financial institutions?",
      "How does FATF R.7 differ from FATF R.6 in terms of targeted financial sanctions?",
      "What is the end-user certificate requirement for trade finance involving controlled goods?",
    ],
  },
  {
    label: "PEP Enhanced Due Diligence",
    questions: [
      "What is the definition of a Politically Exposed Person under UAE FDL 10/2025 Art.14(2)?",
      "What senior management approval is required for a PEP relationship under UAE law?",
      "What is the difference between source of wealth and source of funds in PEP EDD?",
      "How should a UAE FI handle a customer who becomes a PEP during an existing relationship?",
      "What ongoing monitoring frequency is required for foreign PEPs under UAE law?",
      "Does the UAE define a time limit after which a former PEP ceases to be treated as a PEP?",
    ],
  },
  {
    label: "Cross-Border Correspondent Banking",
    questions: [
      "What FATF R.13 requirements apply to UAE banks establishing correspondent relationships?",
      "What is a payable-through account and why is it prohibited without additional controls?",
      "What is the UAE CBUAE requirement for nested correspondent account relationships?",
      "What due diligence must a UAE correspondent bank perform on a respondent bank's AML programme?",
      "How should a UAE FI handle a correspondent bank in a FATF grey-list jurisdiction?",
      "What is the 'shell bank' prohibition under UAE FDL 10/2025 and FATF R.13?",
    ],
  },
  {
    label: "High-Risk Customer Remediation",
    questions: [
      "What triggers a mandatory CDD refresh for a high-risk customer under UAE FDL 10/2025 Art.15?",
      "What account restrictions can a UAE FI impose pending completion of refresh CDD?",
      "When must a UAE FI terminate a business relationship under FDL 10/2025 Art.15(3)?",
      "Should a UAE FI file an exit STR when terminating a high-risk relationship?",
      "What documentation is required to support a decision to continue a high-risk relationship?",
      "What is the remediation timeline for a customer classified as high-risk after post-onboarding monitoring?",
    ],
  },
  {
    label: "Sanctions Compliance Programme",
    questions: [
      "What sanctions lists must a UAE financial institution screen against under UAE law?",
      "What is the UAE EOCN and what obligations does Cabinet Decision 74/2020 impose?",
      "What is the timeline for reporting frozen assets to UAE EOCN after a designation hit?",
      "How does secondary sanctions risk from OFAC affect UAE financial institutions?",
      "What is the tipping-off prohibition in the context of sanctions screening under FDL 10/2025?",
      "What is the difference between a designated entity hit and a PEP hit in terms of legal obligations?",
    ],
  },
  {
    label: "Transaction Monitoring Calibration",
    questions: [
      "What is the CBUAE expectation for transaction monitoring system calibration documentation?",
      "What alert-to-SAR conversion rate benchmarks are considered adequate by UAE regulators?",
      "How should a UAE FI document the rationale for transaction monitoring thresholds?",
      "What is the risk of over-suppression of transaction monitoring alerts from a regulatory perspective?",
      "How should typology changes identified by the UAE FIU be incorporated into TM rules?",
      "What does FATF R.10 require specifically for ongoing transaction monitoring?",
    ],
  },
  {
    label: "Annual AML Programme Self-Assessment",
    questions: [
      "What are the required components of an annual AML/CFT programme review under UAE FDL 10/2025?",
      "What must a UAE FI's annual enterprise-wide risk assessment (EWRA) cover?",
      "What is the CBUAE inspection framework for AML/CFT programmes and what are common findings?",
      "What governance documentation must a UAE MLRO maintain for the annual AML programme review?",
      "What training requirements must be satisfied annually under UAE FDL 10/2025 Art.19(3)?",
      "What are the penalties for an inadequate AML programme under UAE FDL 10/2025?",
    ],
  },
  {
    label: "Board & Senior Management AML Oversight",
    questions: [
      "What are the AML/CFT governance obligations of the Board of Directors under UAE FDL 10/2025?",
      "What management information (MIS) must be reported to the Board on AML performance?",
      "What is the personal liability of senior management for AML failures under UAE law?",
      "How should a UAE FI document Board approval of the AML/CFT risk appetite statement?",
      "What is the MLRO's reporting line and independence requirement under UAE AML rules?",
      "What is the three lines of defence model in the context of UAE AML/CFT governance?",
    ],
  },
  {
    label: "goAML Filing Quality & FIU Engagement",
    questions: [
      "What are the mandatory fields in a UAE FIU goAML STR submission?",
      "What is the 2-business-day STR filing deadline and when does it start running under UAE FDL 10/2025 Art.26?",
      "What is the tipping-off prohibition and how does it interact with the STR filing process?",
      "What voluntary disclosure obligations exist under UAE FDL 10/2025 beyond STRs?",
      "How should a UAE MLRO handle a goAML STR that was filed in error?",
      "What feedback does the UAE FIU provide to reporting entities after an STR is filed?",
    ],
  },
  {
    label: "Layering Detection & Asset Tracing",
    questions: [
      "What are the three ML stages (placement, layering, integration) and how does the UAE FDL 10/2025 address each?",
      "What structuring patterns indicate placement-stage ML under UAE CTR threshold rules?",
      "What round-trip transaction indicators indicate layering per FATF typologies?",
      "How does the UAE confiscation framework under Federal Law 4/2002 apply to traced criminal proceeds?",
      "What MLAT frameworks are available for UAE asset tracing to offshore jurisdictions?",
      "What evidence standard is required for asset restraint under UAE Federal Law 35/1992?",
    ],
  },
  {
    label: "Real Estate Money Laundering",
    questions: [
      "What off-plan property red flags must UAE DNFBP real estate agents report under FDL 10/2025?",
      "When is a UAE real estate transaction classified as all-cash and what EDD applies?",
      "What third-party payment red flags trigger STR obligations for UAE real estate agents?",
      "How does rapid DLD re-registration within 6 months indicate ML layering?",
      "What DLD and RERA records must be preserved for AML investigations in UAE?",
      "What does the FATF 2022 Guidance on ML through Real Estate require from DNFBPs?",
    ],
  },
  {
    label: "Source of Wealth & Illicit Enrichment",
    questions: [
      "What is UNCAC Article 20 illicit enrichment and how does it apply to UAE public officials?",
      "What documentation must a UAE FI obtain to verify PEP source of wealth under FDL 10/2025?",
      "What is the difference between source of wealth and source of funds in UAE EDD?",
      "What unexplained wealth gap percentage triggers an STR filing obligation for a UAE MLRO?",
      "How should a UAE FI handle an inheritance claim that cannot be independently verified?",
      "What lifestyle indicators are red flags for illicit enrichment in UAE compliance screening?",
    ],
  },
  {
    label: "Insider Threat & Employee Conduct",
    questions: [
      "What constitutes tipping off under UAE FDL 10/2025 Art.20 and what are the criminal penalties?",
      "What controls must a UAE FI have to detect insider facilitation of financial crime per FATF R.18?",
      "What lifestyle checks can a UAE FI conduct on employees in sensitive AML roles?",
      "When must a UAE MLRO notify regulators of a confirmed insider tipping-off incident?",
      "What HR disciplinary steps must align with UAE Labour Law before an employee is suspended for AML breaches?",
      "What system access monitoring is required to detect after-hours MLRO case system access?",
    ],
  },
  {
    label: "Board AML Governance & Reporting",
    questions: [
      "What quarterly AML MIS must a UAE Board receive under FDL 10/2025 Art.5(2)?",
      "What personal liability does a UAE Board member face for AML programme failures?",
      "What KPIs must a UAE Board monitor for AML effectiveness under CBUAE guidelines?",
      "When must a UAE MLRO escalate a compliance matter directly to the Board?",
      "What does a UAE Board AML risk appetite statement need to contain under FDL 10/2025?",
      "What is the three lines of defence model in UAE AML/CFT governance?",
    ],
  },
  {
    label: "Enforcement & Regulatory Penalties",
    questions: [
      "What are the maximum administrative penalties under UAE FDL 10/2025 for AML violations?",
      "When does an AML violation result in criminal prosecution of the MLRO personally under UAE law?",
      "What self-reporting discount is available under CBUAE enforcement policy for voluntary disclosure?",
      "What precedent CBUAE enforcement actions have been taken for STR filing failures?",
      "What mitigating factors reduce AML penalties in UAE regulatory proceedings?",
      "What is the MLRO's personal criminal exposure for knowingly failing to file an STR in UAE?",
    ],
  },
  {
    label: "Inter-Agency Coordination & Referrals",
    questions: [
      "What are the legal pathways for a UAE FI to refer a case to law enforcement under FDL 10/2025?",
      "What information must a UAE MLRO provide to the UAE FIU in an inter-agency referral?",
      "When must a UAE MLRO refer a matter to the UAE Attorney General vs filing an STR?",
      "What Egmont Group channels are available for UAE cross-border intelligence sharing?",
      "What tipping-off restrictions apply when coordinating with UAE law enforcement on a live case?",
      "How does the UAE NAMLCFTC coordinate between CBUAE, MOF, and law enforcement?",
    ],
  },
  {
    label: "AML Policy & Programme Governance",
    questions: [
      "What elements must a UAE AML/CFT policy contain to comply with FDL 10/2025 and CBUAE guidelines?",
      "How often must a UAE AML policy be formally reviewed and board-approved?",
      "What policy changes are mandatory following UAE FDL 10/2025 coming into force?",
      "What does FATF R.18 require regarding documented AML policies and procedures?",
      "How should a UAE AML policy address the risk-based approach to CDD and monitoring?",
      "What policy documentation must be available during a CBUAE AML/CFT inspection?",
    ],
  },
  {
    label: "SWIFT, Letters of Credit & Trade Finance AML",
    questions: [
      "What SWIFT MT103 fields must a compliance officer review for TBML red flags?",
      "What LC documentary credit conditions indicate over-invoicing ML risk?",
      "What does FATF TBML guidance require for correspondent bank screening of trade finance?",
      "When must a UAE bank reject an LC application on AML grounds?",
      "What dual-use goods require enhanced scrutiny in trade finance under UAE export controls?",
      "How does phantom shipment TBML typology manifest in SWIFT message fields?",
    ],
  },
  {
    label: "Regulatory Calendar & Compliance Deadlines",
    questions: [
      "What is the STR filing deadline under UAE FDL 10/2025 and when does the clock start?",
      "What is the CTR filing deadline for cash transactions above AED 55,000?",
      "When must a UAE FI file its annual AML self-assessment with CBUAE?",
      "What is the goAML registration renewal deadline for UAE reporting entities?",
      "What quarterly reporting obligations do UAE FIs have under CBUAE AML guidelines?",
      "What is the EWRA annual review deadline and board approval requirement?",
    ],
  },
  {
    label: "Enterprise-Wide Risk Assessment (EWRA)",
    questions: [
      "What risk categories must a UAE FI&apos;s EWRA cover under FDL 10/2025?",
      "How should a UAE DPMS entity weight real estate and gold sector risks in its EWRA?",
      "What methodology does FATF recommend for institutional ML/TF risk assessment?",
      "When must a UAE FI update its EWRA outside the annual review cycle?",
      "What residual risk rating triggers mandatory enhanced controls under CBUAE expectations?",
      "How should a UAE FI document the link between EWRA outcomes and its AML programme design?",
    ],
  },
  {
    label: "AML Programme Gap Analysis",
    questions: [
      "What are the mandatory components of a UAE AML/CFT programme under FDL 10/2025 Art.18?",
      "What CBUAE inspection findings most commonly indicate AML programme gaps?",
      "What does FATF R.18 require for internal AML audit independence and frequency?",
      "What gaps in a UAE TM programme are considered systemic failures by CBUAE?",
      "What remediation timeline is considered adequate for a critical AML programme gap?",
      "What documentation must a UAE MLRO maintain to evidence programme effectiveness?",
    ],
  },
  {
    label: "Trade Invoice & TBML Analysis",
    questions: [
      "What HS code categories carry heightened TBML risk under UAE AML guidelines?",
      "How does over-invoicing by 10% or more trigger UAE TBML reporting obligations?",
      "What does FATF TBML Guidance 2020 require for port-of-entry customs coordination?",
      "When does a discrepancy between invoice value and customs declaration require STR filing?",
      "What TBML red flags arise when a UAE free zone entity is the importer?",
      "How do phantom shipments in gold trading create integration-stage ML risk?",
    ],
  },
  {
    label: "Entity Network & Beneficial Ownership Mapping",
    questions: [
      "What relationship indicators suggest a nominee director arrangement under UAE FDL 10/2025?",
      "How does a shared registered address across multiple companies indicate a shell network?",
      "What is the UAE UBO disclosure threshold and how is it applied to layered holding structures?",
      "When do transaction links between entities indicate conduit ML activity per FATF typologies?",
      "What corporate registry searches must a UAE FI conduct for network mapping under FATF R.24?",
      "How should a UAE MLRO document a complex ML network for a goAML STR narrative?",
    ],
  },
  {
    label: "Risk Appetite & Governance Frameworks",
    questions: [
      "What must a UAE FI&apos;s AML risk appetite statement prohibit as zero-tolerance activities?",
      "How should Board risk appetite thresholds translate into operational TM alert parameters?",
      "What does UAE FDL 10/2025 Art.5 require of the Board on AML risk appetite?",
      "How often must a UAE AML risk appetite statement be reviewed and re-approved by the Board?",
      "What risk appetite metrics must be reported to the MLRO and Board regularly?",
      "What is the difference between risk tolerance and risk appetite in UAE AML governance?",
    ],
  },
  {
    label: "Regulatory Examination Readiness",
    questions: [
      "What are CBUAE examiners&apos; most common AML findings in UAE bank inspections?",
      "What CDD file evidence must be prepared for a CBUAE AML inspection of a DPMS entity?",
      "How should a UAE MLRO prepare for a FATF mutual evaluation onsite visit?",
      "What TM effectiveness metrics do CBUAE examiners request in AML inspections?",
      "What remediation documentation satisfies a CBUAE enforcement notice for AML deficiencies?",
      "How does the CBUAE risk-based inspection approach determine examination depth and scope?",
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

const superTabCls = (active: boolean) =>
  `px-2.5 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-brand/10 text-brand border-brand/40 hover:bg-brand/20 hover:border-brand"
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

// ── Chain Run types ───────────────────────────────────────────────────────────

interface ChainRunResult {
  ok: boolean;
  subjectBrief?: string;
  typologyMatch?: string;
  strRecommendation?: string;
  chainDuration?: number;
  error?: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MlroAdvisorPage() {
  const [pageTab, setPageTab] = useState<"advisor" | "regulatory-qa" | "super-tools">("advisor");

  // ── Chain Run state ──────────────────────────────────────────────────────────
  const [chainSubject, setChainSubject] = useState("");
  const [chainJurisdiction, setChainJurisdiction] = useState("UAE");
  const [chainRiskScore, setChainRiskScore] = useState(50);
  const [chainPattern, setChainPattern] = useState("");
  const [chainRunning, setChainRunning] = useState(false);
  const [chainResult, setChainResult] = useState<ChainRunResult | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const handleChainRun = useCallback(async () => {
    if (!chainSubject.trim()) return;
    setChainRunning(true);
    setChainResult(null);
    setChainError(null);
    try {
      const res = await fetch("/api/mlro-advisor/chain-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: chainSubject.trim(),
          jurisdiction: chainJurisdiction,
          riskScore: chainRiskScore,
          transactionPattern: chainPattern.trim(),
        }),
      });
      const data = (await res.json()) as ChainRunResult;
      if (!data.ok) throw new Error((data as { error?: string }).error ?? "Chain analysis failed");
      setChainResult(data);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : "Chain analysis failed");
    } finally {
      setChainRunning(false);
    }
  }, [chainSubject, chainJurisdiction, chainRiskScore, chainPattern]);

  // ── Advisor state ────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ReasoningMode>("quick");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ADVISOR_STORAGE = "hawkeye.mlro.advisor.v1";
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorHistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("hawkeye.mlro.advisor.v1");
      return raw ? (JSON.parse(raw) as AdvisorHistoryEntry[]) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(ADVISOR_STORAGE, JSON.stringify(advisorHistory.slice(0, 50))); } catch { /* quota */ }
  }, [advisorHistory, ADVISOR_STORAGE]);

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
  const [superToolsTab, setSuperToolsTab] = useState<"escalation"|"flags"|"patterns"|"brief"|"pep-network"|"sanctions-nexus"|"typology-match"|"txn-narrative"|"edd-questionnaire"|"tbml"|"str-narrative"|"wire-r16"|"pf-screener"|"mlro-memo"|"tf-screener"|"shell-detector"|"adverse-classify"|"case-timeline"|"ml-predicate"|"client-risk"|"jurisdiction-intel"|"ubo-risk"|"benford"|"crypto-wallet"|"onboarding-tier"|"prolif-finance"|"sar-triage"|"doc-fraud"|"ctr-structuring"|"dnfbp-obligations"|"cdd-refresh"|"vasp-risk"|"goaml-validator"|"pep-edd"|"sanctions-mapper"|"layering-detector"|"real-estate-ml"|"asset-tracer"|"sow-calculator"|"insider-threat-screen"|"board-aml-report"|"enforcement-exposure"|"inter-agency-referral"|"policy-reviewer"|"compliance-test-planner"|"swift-lc-analyzer"|"regulatory-calendar"|"ewra-generator"|"aml-programme-gap"|"trade-invoice-analyzer"|"network-mapper"|"risk-appetite-builder"|"regulatory-exam-prep"|"npo-risk"|"correspondent-bank"|"mixed-funds"|"sanctions-breach"|"freeze-seizure"|"audit-response"|"high-net-worth"|"cash-intensive"|"trust-structures"|"cross-border-wire"|"fiu-feedback"|"derisking-impact"|"legal-privilege"|"ml-scenario"|"staff-alert"|"str-quality"|"hawala-detector"|"nominee-risk"|"pep-corporate"|"crypto-mixing"|"ghost-company"|"pkeyc-planner"|"whistleblower"|"trade-finance-rf"|"sanctions-exposure-calc"|"customer-lifecycle"|"pep-screening-enhance"|"aml-training-gap"|"beneficial-owner-verify"|"aml-kpi-dashboard"|"w6-virtual-asset-risk"|"w6-prolif-finance"|"w6-environmental-crime"|"w6-crypto-tracing"|"w6-human-trafficking"|"w6-tax-evasion"|"w6-corruption-risk"|"w6-real-estate-ml"|"w6-trade-finance"|"w6-insider-threat">("escalation");

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

  // Transaction Narrative Analyzer
  const [txnNarrative, setTxnNarrative] = useState("");
  const [txnCustomerType, setTxnCustomerType] = useState("");
  const [txnJurisdiction, setTxnJurisdiction] = useState("");
  const [txnAmounts, setTxnAmounts] = useState("");
  const [txnResult, setTxnResult] = useState<TransactionAnalysis | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);

  const runTxnNarrative = async () => {
    if (!txnNarrative.trim()) return;
    setTxnLoading(true);
    setTxnResult(null);
    try {
      const res = await fetch("/api/transaction-narrative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative: txnNarrative, customerType: txnCustomerType || undefined, jurisdiction: txnJurisdiction || undefined, amounts: txnAmounts || undefined }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & TransactionAnalysis;
      if (data.ok) setTxnResult(data);
    } catch { /* silent */ }
    finally { setTxnLoading(false); }
  };

  // EDD Questionnaire Generator
  const [eddCustomerType, setEddCustomerType] = useState("");
  const [eddRiskFactors, setEddRiskFactors] = useState("");
  const [eddJurisdiction, setEddJurisdiction] = useState("");
  const [eddProducts, setEddProducts] = useState("");
  const [eddContext, setEddContext] = useState("");
  const [eddResult, setEddResult] = useState<EddQuestionnaire | null>(null);
  const [eddLoading, setEddLoading] = useState(false);
  const [eddExpandedQ, setEddExpandedQ] = useState<string | null>(null);

  const runEddQuestionnaire = async () => {
    if (!eddCustomerType.trim()) return;
    setEddLoading(true);
    setEddResult(null);
    try {
      const res = await fetch("/api/edd-questionnaire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerType: eddCustomerType,
          riskFactors: eddRiskFactors ? eddRiskFactors.split(",").map((s) => s.trim()).filter(Boolean) : [],
          jurisdiction: eddJurisdiction || undefined,
          productTypes: eddProducts ? eddProducts.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          context: eddContext || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & EddQuestionnaire;
      if (data.ok) setEddResult(data);
    } catch { /* silent */ }
    finally { setEddLoading(false); }
  };

  // TBML Trade Document Analyzer
  const [tbmlInput, setTbmlInput] = useState({ invoiceDescription: "", supplierCountry: "", buyerCountry: "", declaredValue: "", commodity: "", paymentRoute: "", additionalContext: "" });
  const [tbmlResult, setTbmlResult] = useState<TbmlAnalysis | null>(null);
  const [tbmlLoading, setTbmlLoading] = useState(false);

  const runTbml = async () => {
    if (!tbmlInput.invoiceDescription.trim()) return;
    setTbmlLoading(true);
    setTbmlResult(null);
    try {
      const res = await fetch("/api/tbml-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceDescription: tbmlInput.invoiceDescription,
          supplierCountry: tbmlInput.supplierCountry || undefined,
          buyerCountry: tbmlInput.buyerCountry || undefined,
          declaredValue: tbmlInput.declaredValue || undefined,
          commodity: tbmlInput.commodity || undefined,
          paymentRoute: tbmlInput.paymentRoute || undefined,
          additionalContext: tbmlInput.additionalContext || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & TbmlAnalysis;
      if (data.ok) setTbmlResult(data);
    } catch { /* silent */ }
    finally { setTbmlLoading(false); }
  };

  // STR Narrative Drafter
  const [strNarrInput, setStrNarrInput] = useState({ subjectName: "", subjectType: "", subjectNationality: "", activityDescription: "", amounts: "", dates: "", counterparty: "", jurisdiction: "", redFlags: "", actionsTaken: "", additionalFacts: "" });
  const [strNarrResult, setStrNarrResult] = useState<StrNarrativeResult | null>(null);
  const [strNarrLoading, setStrNarrLoading] = useState(false);

  const runStrNarrative = async () => {
    if (!strNarrInput.subjectName.trim() || !strNarrInput.activityDescription.trim()) return;
    setStrNarrLoading(true); setStrNarrResult(null);
    try {
      const res = await fetch("/api/str-narrative", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...strNarrInput, redFlags: strNarrInput.redFlags ? strNarrInput.redFlags.split("\n").map((s) => s.trim()).filter(Boolean) : undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & StrNarrativeResult;
      if (data.ok) setStrNarrResult(data);
    } catch { /* silent */ }
    finally { setStrNarrLoading(false); }
  };

  // Wire Transfer R.16 Checker
  const [wireInput, setWireInput] = useState({ originatorName: "", originatorAccount: "", originatorAddress: "", originatorId: "", originatorCountry: "", beneficiaryName: "", beneficiaryAccount: "", beneficiaryCountry: "", amount: "", currency: "", purpose: "", swiftRef: "" });
  const [wireResult, setWireResult] = useState<WireR16Result | null>(null);
  const [wireLoading, setWireLoading] = useState(false);

  const runWireR16 = async () => {
    setWireLoading(true); setWireResult(null);
    try {
      const res = await fetch("/api/wire-r16", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(wireInput) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & WireR16Result;
      if (data.ok) setWireResult(data);
    } catch { /* silent */ }
    finally { setWireLoading(false); }
  };

  // Proliferation Financing Screener
  const [pfInput, setPfInput] = useState({ subject: "", subjectCountry: "", counterparty: "", counterpartyCountry: "", goods: "", transactionType: "", amount: "", context: "" });
  const [pfResult, setPfResult] = useState<PfScreenerResult | null>(null);
  const [pfLoading, setPfLoading] = useState(false);

  const runPfScreener = async () => {
    if (!pfInput.subject.trim()) return;
    setPfLoading(true); setPfResult(null);
    try {
      const res = await fetch("/api/pf-screener", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pfInput) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & PfScreenerResult;
      if (data.ok) setPfResult(data);
    } catch { /* silent */ }
    finally { setPfLoading(false); }
  };

  // MLRO Decision Memo
  const [memoInput, setMemoInput] = useState({ subjectName: "", subjectType: "", caseRef: "", activitySummary: "", redFlags: "", investigationSteps: "", proposedDecision: "", mlroName: "", date: "" });
  const [memoResult, setMemoResult] = useState<MlroMemoResult | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);

  const runMlroMemo = async () => {
    if (!memoInput.subjectName.trim() || !memoInput.activitySummary.trim()) return;
    setMemoLoading(true); setMemoResult(null);
    try {
      const res = await fetch("/api/mlro-memo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...memoInput, redFlags: memoInput.redFlags ? memoInput.redFlags.split("\n").map((s) => s.trim()).filter(Boolean) : undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & MlroMemoResult;
      if (data.ok) setMemoResult(data);
    } catch { /* silent */ }
    finally { setMemoLoading(false); }
  };

  // Terrorism Financing Screener
  const [tfInput, setTfInput] = useState({ subject: "", subjectCountry: "", counterparty: "", counterpartyCountry: "", transactionType: "", amount: "", currency: "", destinationJurisdiction: "", goods: "", customerType: "", existingRedFlags: "", context: "" });
  const [tfResult, setTfResult] = useState<TfScreenerResult | null>(null);
  const [tfLoading, setTfLoading] = useState(false);

  // Shell Company Detector
  const [shellInput, setShellInput] = useState({ entityName: "", jurisdictionOfIncorporation: "", directorNames: "", shareholderStructure: "", businessActivity: "", yearsActive: "", bankingArrangements: "", context: "" });
  const [shellResult, setShellResult] = useState<ShellDetectorResult | null>(null);
  const [shellLoading, setShellLoading] = useState(false);

  // Adverse Media Classifier
  const [adverseText, setAdverseText] = useState("");
  const [adverseSubject, setAdverseSubject] = useState("");
  const [adverseResult, setAdverseResult] = useState<AdverseClassifyResult | null>(null);
  const [adverseLoading, setAdverseLoading] = useState(false);

  // Case Timeline Builder
  const [timelineEvents, setTimelineEvents] = useState("");
  const [timelineSubject, setTimelineSubject] = useState("");
  const [timelineCaseRef, setTimelineCaseRef] = useState("");
  const [timelineResult, setTimelineResult] = useState<CaseTimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // ML Predicate Mapper
  const [predicateFacts, setPredicateFacts] = useState("");
  const [predicateActivity, setPredicateActivity] = useState("");
  const [predicateJurisdiction, setPredicateJurisdiction] = useState("");
  const [predicateResult, setPredicateResult] = useState<MlPredicateResult | null>(null);
  const [predicateLoading, setPredicateLoading] = useState(false);

  // Client Risk Scorer
  const [clientRiskEntity, setClientRiskEntity] = useState({ name: "", alternateNames: "", countryOfIncorporation: "", tradeLicence: "", email: "", phone: "" });
  const [clientRiskShareholders, setClientRiskShareholders] = useState([{ designation: "", name: "", sharesPct: "", kind: "individual", nationality: "", pepStatus: "non-pep", emiratesId: "", idNumber: "" }]);
  const [clientRiskResult, setClientRiskResult] = useState<ClientRiskResult | null>(null);
  const [clientRiskLoading, setClientRiskLoading] = useState(false);

  // Jurisdiction Intel
  const [jurisCountry, setJurisCountry] = useState("");
  const [jurisContext, setJurisContext] = useState("");
  const [jurisResult, setJurisResult] = useState<JurisdictionIntelResult | null>(null);
  const [jurisLoading, setJurisLoading] = useState(false);

  // UBO Risk Analyzer
  const [uboEntity, setUboEntity] = useState("");
  const [uboRegistered, setUboRegistered] = useState("");
  const [uboEntries, setUboEntries] = useState([{ name: "", dob: "", nationality: "", gender: "", ownershipPct: "", role: "" }]);
  const [uboResult, setUboResult] = useState<UboRiskResult | null>(null);
  const [uboLoading, setUboLoading] = useState(false);

  // Benford Forensics
  const [benfordAmounts, setBenfordAmounts] = useState("");
  const [benfordLabel, setBenfordLabel] = useState("");
  const [benfordResult, setBenfordResult] = useState<BenfordResult | null>(null);
  const [benfordLoading, setBenfordLoading] = useState(false);

  // Crypto Wallet Risk
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [cryptoChain, setCryptoChain] = useState<"ethereum"|"bitcoin"|"tron">("ethereum");
  const [cryptoResult, setCryptoResult] = useState<Record<string, unknown> | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  // Onboarding Risk Tier
  const [onboardInput, setOnboardInput] = useState({ fullName: "", nationalityIso2: "", dob: "", occupation: "", sourceOfFunds: "", expectedProfile: "", address: "" });
  const [onboardResult, setOnboardResult] = useState<OnboardingRiskResult | null>(null);
  const [onboardLoading, setOnboardLoading] = useState(false);

  // Prolif Finance
  const [prolifInput, setProlifInput] = useState({ subject: "", subjectCountry: "", counterparty: "", counterpartyCountry: "", goods: "", transactionType: "", amount: "", currency: "AED", endUser: "", endUserCountry: "", context: "" });
  const [prolifResult, setProlifResult] = useState<ProlifFinanceResult | null>(null);
  const [prolifLoading, setProlifLoading] = useState(false);

  // SAR Triage
  const [sarInput, setSarInput] = useState({ suspiciousActivity: "", subjectName: "", subjectType: "", accountRef: "", transactionSummary: "", existingCddNotes: "", mlroNotes: "", context: "" });
  const [sarTriageResult, setSarTriageResult] = useState<SarTriageResult | null>(null);
  const [sarTriageLoading, setSarTriageLoading] = useState(false);

  // Document Fraud
  const [docFraudInput, setDocFraudInput] = useState({ documentTypes: "", documentDetails: "", subjectName: "", subjectNationality: "", occupationClaimed: "", incomeClaimedAed: "", inconsistenciesObserved: "", context: "" });
  const [docFraudResult, setDocFraudResult] = useState<DocumentFraudResult | null>(null);
  const [docFraudLoading, setDocFraudLoading] = useState(false);

  // CTR / Structuring
  const [ctrAmounts, setCtrAmounts] = useState("");
  const [ctrPeriodDays, setCtrPeriodDays] = useState("30");
  const [ctrSubject, setCtrSubject] = useState("");
  const [ctrResult, setCtrResult] = useState<CtrStructuringResult | null>(null);
  const [ctrLoading, setCtrLoading] = useState(false);

  // DNFBP Obligations
  const [dnfbpInput, setDnfbpInput] = useState({ dnfbpType: "", transactionType: "", transactionAmount: "", currency: "AED", customerType: "", jurisdiction: "UAE", context: "" });
  const [dnfbpResult, setDnfbpResult] = useState<DnfbpObligationsResult | null>(null);
  const [dnfbpLoading, setDnfbpLoading] = useState(false);

  // CDD Refresh Trigger
  const [cddRefreshInput, setCddRefreshInput] = useState({ customerName: "", customerType: "", currentRiskTier: "", lastCddDate: "", triggerEvents: "", transactionPatternChange: "", adverseMediaHit: "", ownershipChange: "", context: "" });
  const [cddRefreshResult, setCddRefreshResult] = useState<CddRefreshTriggerResult | null>(null);
  const [cddRefreshLoading, setCddRefreshLoading] = useState(false);

  // VASP Risk
  const [vaspInput, setVaspInput] = useState({ vaspName: "", vaspJurisdiction: "", exchangeType: "", custodyModel: "", supportedAssets: "", travelRuleProtocol: "", licenceNumber: "", geographicReach: "", amlPolicyAvailable: "", blockchainAnalyticsTool: "", context: "" });
  const [vaspResult, setVaspResult] = useState<VaspRiskResult | null>(null);
  const [vaspLoading, setVaspLoading] = useState(false);

  // goAML Validator
  const [goAmlInput, setGoAmlInput] = useState({ narrative: "", subjectName: "", subjectIdNumber: "", subjectDob: "", subjectNationality: "", subjectAddress: "", accountNumbers: "", transactionSummary: "", reportingEntityName: "", mlroName: "", context: "" });
  const [goAmlResult, setGoAmlResult] = useState<GoAmlValidatorResult | null>(null);
  const [goAmlLoading, setGoAmlLoading] = useState(false);

  // PEP EDD Generator
  const [pepEddInput, setPepEddInput] = useState({ pepName: "", pepRole: "", pepJurisdiction: "", pepClassification: "", relationshipType: "", proposedProducts: "", knownWealth: "", context: "" });
  const [pepEddResult, setPepEddResult] = useState<PepEddResult | null>(null);
  const [pepEddLoading, setPepEddLoading] = useState(false);

  // Sanctions Exposure Mapper
  const [sanctionsMapInput, setSanctionsMapInput] = useState({ entityName: "", entityType: "", nationality: "", dob: "", passportNumber: "", aliases: "", jurisdiction: "", context: "" });
  const [sanctionsMapResult, setSanctionsMapResult] = useState<SanctionsExposureResult | null>(null);
  const [sanctionsMapLoading, setSanctionsMapLoading] = useState(false);

  // ── Wave 3 tool state ──────────────────────────────────────────────────────

  // Layering Detector
  const [layeringInput, setLayeringInput] = useState({ transactions: "", subjectName: "", accountRefs: "", periodDays: "", context: "" });
  const [layeringResult, setLayeringResult] = useState<Record<string, unknown> | null>(null);
  const [layeringLoading, setLayeringLoading] = useState(false);

  // Real Estate ML
  const [realEstateMlInput, setRealEstateMlInput] = useState({ propertyDetails: "", buyerName: "", buyerNationality: "", paymentMethod: "", purchasePrice: "", marketValue: "", agentName: "", context: "" });
  const [realEstateMlResult, setRealEstateMlResult] = useState<Record<string, unknown> | null>(null);
  const [realEstateMlLoading, setRealEstateMlLoading] = useState(false);

  // Asset Tracer
  const [assetTracerInput, setAssetTracerInput] = useState({ initialFunds: "", suspectedSource: "", tracingPeriod: "", subjectName: "", jurisdictions: "", context: "" });
  const [assetTracerResult, setAssetTracerResult] = useState<Record<string, unknown> | null>(null);
  const [assetTracerLoading, setAssetTracerLoading] = useState(false);

  // SOW Calculator
  const [sowInput, setSowInput] = useState({ subjectName: "", declaredIncome: "", declaredAssets: "", periodYears: "", knownExpenditures: "", context: "" });
  const [sowResult, setSowResult] = useState<Record<string, unknown> | null>(null);
  const [sowLoading, setSowLoading] = useState(false);

  // Insider Threat Screen
  const [insiderInput, setInsiderInput] = useState({ employeeName: "", employeeRole: "", observedBehaviours: "", accessLevel: "", financialCircumstances: "", context: "" });
  const [insiderResult, setInsiderResult] = useState<Record<string, unknown> | null>(null);
  const [insiderLoading, setInsiderLoading] = useState(false);

  // Board AML Report
  const [boardAmlInput, setBoardAmlInput] = useState({ institutionName: "", reportingPeriod: "", strCount: "", ctrCount: "", trainingCompletion: "", openFindings: "", context: "" });
  const [boardAmlResult, setBoardAmlResult] = useState<Record<string, unknown> | null>(null);
  const [boardAmlLoading, setBoardAmlLoading] = useState(false);

  // Enforcement Exposure
  const [enforcementInput, setEnforcementInput] = useState({ violation: "", institutionType: "", violationPeriod: "", selfReported: "", priorHistory: "", context: "" });
  const [enforcementResult, setEnforcementResult] = useState<Record<string, unknown> | null>(null);
  const [enforcementLoading, setEnforcementLoading] = useState(false);

  // Inter-Agency Referral
  const [referralInput, setReferralInput] = useState({ caseDescription: "", suspectedOffence: "", subjectName: "", subjectId: "", evidenceSummary: "", context: "" });
  const [referralResult, setReferralResult] = useState<Record<string, unknown> | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // Policy Reviewer
  const [policyInput, setPolicyInput] = useState({ policyText: "", policyType: "", institutionType: "", lastReviewDate: "", context: "" });
  const [policyResult, setPolicyResult] = useState<Record<string, unknown> | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

  // Compliance Test Planner
  const [compTestInput, setCompTestInput] = useState({ institutionType: "", testingArea: "", riskFocus: "", staffCount: "", context: "" });
  const [compTestResult, setCompTestResult] = useState<Record<string, unknown> | null>(null);
  const [compTestLoading, setCompTestLoading] = useState(false);

  // SWIFT LC Analyzer
  const [swiftLcInput, setSwiftLcInput] = useState({ swiftMessage: "", messageType: "", beneficiaryCountry: "", applicantCountry: "", goodsDescription: "", context: "" });
  const [swiftLcResult, setSwiftLcResult] = useState<Record<string, unknown> | null>(null);
  const [swiftLcLoading, setSwiftLcLoading] = useState(false);

  // Regulatory Calendar
  const [regCalInput, setRegCalInput] = useState({ institutionType: "" });
  const [regCalResult, setRegCalResult] = useState<Record<string, unknown> | null>(null);
  const [regCalLoading, setRegCalLoading] = useState(false);

  // EWRA Generator
  const [ewraInput, setEwraInput] = useState({ institutionType: "", productsServices: "", customerBase: "", geographicFootprint: "", transactionVolume: "", context: "" });
  const [ewraResult, setEwraResult] = useState<Record<string, unknown> | null>(null);
  const [ewraLoading, setEwraLoading] = useState(false);

  // AML Programme Gap
  const [amlGapInput, setAmlGapInput] = useState({ institutionType: "", programmeDescription: "", currentControls: "", lastAuditDate: "", staffCount: "", context: "" });
  const [amlGapResult, setAmlGapResult] = useState<Record<string, unknown> | null>(null);
  const [amlGapLoading, setAmlGapLoading] = useState(false);

  // Trade Invoice Analyzer
  const [tradeInvoiceInput, setTradeInvoiceInput] = useState({ invoiceDetails: "", commodityType: "", hsCode: "", exporterCountry: "", importerCountry: "", context: "" });
  const [tradeInvoiceResult, setTradeInvoiceResult] = useState<Record<string, unknown> | null>(null);
  const [tradeInvoiceLoading, setTradeInvoiceLoading] = useState(false);

  // Network Mapper
  const [networkMapInput, setNetworkMapInput] = useState({ entities: "", sharedAddresses: "", sharedDirectors: "", sharedAccounts: "", transactionLinks: "", context: "" });
  const [networkMapResult, setNetworkMapResult] = useState<Record<string, unknown> | null>(null);
  const [networkMapLoading, setNetworkMapLoading] = useState(false);

  // Risk Appetite Builder
  const [riskAppInput, setRiskAppInput] = useState({ institutionType: "", riskProfile: "", boardPosition: "", keyProducts: "", context: "" });
  const [riskAppResult, setRiskAppResult] = useState<Record<string, unknown> | null>(null);
  const [riskAppLoading, setRiskAppLoading] = useState(false);

  // Regulatory Exam Prep
  const [examPrepInput, setExamPrepInput] = useState({ examArea: "", institutionType: "", context: "" });
  const [examPrepResult, setExamPrepResult] = useState<Record<string, unknown> | null>(null);
  const [examPrepLoading, setExamPrepLoading] = useState(false);

  // Wave 4 tools
  const [npoInput, setNpoInput] = useState({ npoName: "", country: "", sector: "", fundingSource: "", beneficiaryRegion: "", context: "" });
  const [npoResult, setNpoResult] = useState<Record<string, unknown> | null>(null);
  const [npoLoading, setNpoLoading] = useState(false);

  const [corrBankInput, setCorrBankInput] = useState({ bankName: "", country: "", regulatoryBody: "", lastKycDate: "", amlProgrammeStatus: "", context: "" });
  const [corrBankResult, setCorrBankResult] = useState<Record<string, unknown> | null>(null);
  const [corrBankLoading, setCorrBankLoading] = useState(false);

  const [mixedFundsInput, setMixedFundsInput] = useState({ accountHolder: "", totalBalance: "", suspectedProceedsAmount: "", legitimateFundsAmount: "", mixingPeriod: "", context: "" });
  const [mixedFundsResult, setMixedFundsResult] = useState<Record<string, unknown> | null>(null);
  const [mixedFundsLoading, setMixedFundsLoading] = useState(false);

  const [sanctionsBreachInput, setSanctionsBreachInput] = useState({ counterparty: "", transactionAmount: "", sanctionsList: "", discoveryDate: "", breachDuration: "", context: "" });
  const [sanctionsBreachResult, setSanctionsBreachResult] = useState<Record<string, unknown> | null>(null);
  const [sanctionsBreachLoading, setSanctionsBreachLoading] = useState(false);

  const [freezeSeizureInput, setFreezeSeizureInput] = useState({ subjectName: "", assetDescription: "", legalBasisCited: "", estimatedValue: "", jurisdictions: "", context: "" });
  const [freezeSeizureResult, setFreezeSeizureResult] = useState<Record<string, unknown> | null>(null);
  const [freezeSeizureLoading, setFreezeSeizureLoading] = useState(false);

  const [auditResponseInput, setAuditResponseInput] = useState({ auditorName: "", auditDate: "", findings: "", institutionType: "", context: "" });
  const [auditResponseResult, setAuditResponseResult] = useState<Record<string, unknown> | null>(null);
  const [auditResponseLoading, setAuditResponseLoading] = useState(false);

  const [hnwInput, setHnwInput] = useState({ subjectName: "", nationality: "", wealthEstimateAed: "", wealthSources: "", pepStatus: "", jurisdictions: "", context: "" });
  const [hnwResult, setHnwResult] = useState<Record<string, unknown> | null>(null);
  const [hnwLoading, setHnwLoading] = useState(false);

  const [cashIntensiveInput, setCashIntensiveInput] = useState({ businessName: "", businessType: "", monthlyRevenue: "", cashPct: "", depositPattern: "", context: "" });
  const [cashIntensiveResult, setCashIntensiveResult] = useState<Record<string, unknown> | null>(null);
  const [cashIntensiveLoading, setCashIntensiveLoading] = useState(false);

  const [trustStructInput, setTrustStructInput] = useState({ entityName: "", structureType: "", jurisdictions: "", layerCount: "", purposeStated: "", context: "" });
  const [trustStructResult, setTrustStructResult] = useState<Record<string, unknown> | null>(null);
  const [trustStructLoading, setTrustStructLoading] = useState(false);

  const [crossBorderInput, setCrossBorderInput] = useState({ originatorName: "", beneficiaryName: "", amount: "", currency: "", originCountry: "", destinationCountry: "", purpose: "", context: "" });
  const [crossBorderResult, setCrossBorderResult] = useState<Record<string, unknown> | null>(null);
  const [crossBorderLoading, setCrossBorderLoading] = useState(false);

  const [fiuFeedbackInput, setFiuFeedbackInput] = useState({ fiuRef: "", feedbackDate: "", feedbackContent: "", originalStrRef: "", context: "" });
  const [fiuFeedbackResult, setFiuFeedbackResult] = useState<Record<string, unknown> | null>(null);
  const [fiuFeedbackLoading, setFiuFeedbackLoading] = useState(false);

  const [deriskingInput, setDeriskingInput] = useState({ customerSegment: "", affectedCount: "", riskJustification: "", institutionType: "", context: "" });
  const [deriskingResult, setDeriskingResult] = useState<Record<string, unknown> | null>(null);
  const [deriskingLoading, setDeriskingLoading] = useState(false);

  const [legalPrivInput, setLegalPrivInput] = useState({ subjectType: "", communicationType: "", context: "", legalRelationship: "" });
  const [legalPrivResult, setLegalPrivResult] = useState<Record<string, unknown> | null>(null);
  const [legalPrivLoading, setLegalPrivLoading] = useState(false);

  const [mlScenarioInput, setMlScenarioInput] = useState({ subjectName: "", predicateOffence: "", estimatedAmount: "", jurisdictions: "", sectors: "", context: "" });
  const [mlScenarioResult, setMlScenarioResult] = useState<Record<string, unknown> | null>(null);
  const [mlScenarioLoading, setMlScenarioLoading] = useState(false);

  const [staffAlertInput, setStaffAlertInput] = useState({ alertSource: "", employeeName: "", employeeRole: "", allegation: "", evidenceDescribed: "", context: "" });
  const [staffAlertResult, setStaffAlertResult] = useState<Record<string, unknown> | null>(null);
  const [staffAlertLoading, setStaffAlertLoading] = useState(false);

  // Wave 5 tools
  const [strQualityInput, setStrQualityInput] = useState({ narrativeText: "", subjectName: "", totalAmount: "", transactionCount: "", suspectedOffence: "", context: "" });
  const [strQualityResult, setStrQualityResult] = useState<Record<string, unknown> | null>(null);
  const [strQualityLoading, setStrQualityLoading] = useState(false);

  const [hawalaInput, setHawalaInput] = useState({ subjectName: "", businessType: "", transactionPattern: "", counterparties: "", cashVolume: "", context: "" });
  const [hawalaResult, setHawalaResult] = useState<Record<string, unknown> | null>(null);
  const [hawalaLoading, setHawalaLoading] = useState(false);

  const [nomineeInput, setNomineeInput] = useState({ companyName: "", directorName: "", incorporationDate: "", businessActivity: "", controllerDetails: "", context: "" });
  const [nomineeResult, setNomineeResult] = useState<Record<string, unknown> | null>(null);
  const [nomineeLoading, setNomineeLoading] = useState(false);

  const [pepCorpInput, setPepCorpInput] = useState({ companyName: "", pepName: "", pepRole: "", ownershipPct: "", industryContext: "", context: "" });
  const [pepCorpResult, setPepCorpResult] = useState<Record<string, unknown> | null>(null);
  const [pepCorpLoading, setPepCorpLoading] = useState(false);

  const [cryptoMixInput, setCryptoMixInput] = useState({ walletAddress: "", cryptoType: "", transactionHashes: "", exchangeContext: "", amountUsd: "", context: "" });
  const [cryptoMixResult, setCryptoMixResult] = useState<Record<string, unknown> | null>(null);
  const [cryptoMixLoading, setCryptoMixLoading] = useState(false);

  const [ghostCoInput, setGhostCoInput] = useState({ companyName: "", incorporationDate: "", tradeActivity: "", employeeCount: "", physicalAddress: "", context: "" });
  const [ghostCoResult, setGhostCoResult] = useState<Record<string, unknown> | null>(null);
  const [ghostCoLoading, setGhostCoLoading] = useState(false);

  const [pKycInput, setPKycInput] = useState({ customerCount: "", highRiskCount: "", pepCount: "", overdueCount: "", institutionType: "", context: "" });
  const [pKycResult, setPKycResult] = useState<Record<string, unknown> | null>(null);
  const [pKycLoading, setPKycLoading] = useState(false);

  const [whistleInput, setWhistleInput] = useState({ allegation: "", reportSource: "", accusedRole: "", evidenceDescribed: "", affectedCustomers: "", context: "" });
  const [whistleResult, setWhistleResult] = useState<Record<string, unknown> | null>(null);
  const [whistleLoading, setWhistleLoading] = useState(false);

  const [tradeFinRfInput, setTradeFinRfInput] = useState({ transactionType: "", commodity: "", importerName: "", exporterName: "", invoiceValue: "", marketValue: "", shippingRoute: "", context: "" });
  const [tradeFinRfResult, setTradeFinRfResult] = useState<Record<string, unknown> | null>(null);
  const [tradeFinRfLoading, setTradeFinRfLoading] = useState(false);

  const [sanctionsExpInput, setSanctionsExpInput] = useState({ entityName: "", entityType: "", jurisdictions: "", transactionCount: "", totalValueUsd: "", context: "" });
  const [sanctionsExpResult, setSanctionsExpResult] = useState<Record<string, unknown> | null>(null);
  const [sanctionsExpLoading, setSanctionsExpLoading] = useState(false);

  const [custLifeInput, setCustLifeInput] = useState({ customerName: "", onboardingDate: "", currentRiskRating: "", recentChanges: "", transactionVolume: "", context: "" });
  const [custLifeResult, setCustLifeResult] = useState<Record<string, unknown> | null>(null);
  const [custLifeLoading, setCustLifeLoading] = useState(false);

  const [pepEnhInput, setPepEnhInput] = useState({ subjectName: "", currentRole: "", jurisdiction: "", wealthEstimate: "", knownConnections: "", context: "" });
  const [pepEnhResult, setPepEnhResult] = useState<Record<string, unknown> | null>(null);
  const [pepEnhLoading, setPepEnhLoading] = useState(false);

  const [amlTrainInput, setAmlTrainInput] = useState({ staffCount: "", completionRate: "", highRiskRoles: "", overdueCount: "", lastTrainingDate: "", context: "" });
  const [amlTrainResult, setAmlTrainResult] = useState<Record<string, unknown> | null>(null);
  const [amlTrainLoading, setAmlTrainLoading] = useState(false);

  const [uboVerifyInput, setUboVerifyInput] = useState({ entityName: "", ownershipStructure: "", jurisdictions: "", layerCount: "", uboName: "", context: "" });
  const [uboVerifyResult, setUboVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [uboVerifyLoading, setUboVerifyLoading] = useState(false);

  const [amlKpiInput, setAmlKpiInput] = useState({ institutionType: "", strCount: "", falsePositiveRate: "", trainingCompletion: "", openFindings: "", context: "" });
  const [amlKpiResult, setAmlKpiResult] = useState<Record<string, unknown> | null>(null);
  const [amlKpiLoading, setAmlKpiLoading] = useState(false);

  // ── Wave 6 tool state ──────────────────────────────────────────────────────
  const [w6VaspInput, setW6VaspInput] = useState({ vasp: "", jurisdiction: "", products: [] as string[], volumes: "" });
  const [w6VaspResult, setW6VaspResult] = useState<Record<string, unknown> | null>(null);
  const [w6VaspLoading, setW6VaspLoading] = useState(false);

  const [w6ProlifInput, setW6ProlifInput] = useState({ entity: "", jurisdiction: "", sectors: "", transactionPatterns: "" });
  const [w6ProlifResult, setW6ProlifResult] = useState<Record<string, unknown> | null>(null);
  const [w6ProlifLoading, setW6ProlifLoading] = useState(false);

  const [w6EnvInput, setW6EnvInput] = useState({ entity: "", commodities: "", tradeRoutes: "", jurisdiction: "" });
  const [w6EnvResult, setW6EnvResult] = useState<Record<string, unknown> | null>(null);
  const [w6EnvLoading, setW6EnvLoading] = useState(false);

  const [w6CryptoInput, setW6CryptoInput] = useState({ walletAddress: "", blockchain: "BTC", transactionHistory: "" });
  const [w6CryptoResult, setW6CryptoResult] = useState<Record<string, unknown> | null>(null);
  const [w6CryptoLoading, setW6CryptoLoading] = useState(false);

  const [w6HtInput, setW6HtInput] = useState({ entity: "", indicators: [] as string[], transactionPatterns: "" });
  const [w6HtResult, setW6HtResult] = useState<Record<string, unknown> | null>(null);
  const [w6HtLoading, setW6HtLoading] = useState(false);

  const [w6TaxInput, setW6TaxInput] = useState({ entity: "", jurisdiction: "", structureType: "", transactions: "" });
  const [w6TaxResult, setW6TaxResult] = useState<Record<string, unknown> | null>(null);
  const [w6TaxLoading, setW6TaxLoading] = useState(false);

  const [w6CorrInput, setW6CorrInput] = useState({ entity: "", jurisdiction: "", sector: "", pepStatus: "No", contractTypes: "" });
  const [w6CorrResult, setW6CorrResult] = useState<Record<string, unknown> | null>(null);
  const [w6CorrLoading, setW6CorrLoading] = useState(false);

  const [w6ReInput, setW6ReInput] = useState({ property: "", buyer: "", seller: "", price: "", jurisdiction: "", paymentMethod: "" });
  const [w6ReResult, setW6ReResult] = useState<Record<string, unknown> | null>(null);
  const [w6ReLoading, setW6ReLoading] = useState(false);

  const [w6TfInput, setW6TfInput] = useState({ tradeFlow: "", goods: "", parties: "", jurisdiction: "", documents: "" });
  const [w6TfResult, setW6TfResult] = useState<Record<string, unknown> | null>(null);
  const [w6TfLoading, setW6TfLoading] = useState(false);

  const [w6InsiderInput, setW6InsiderInput] = useState({ employee: "", role: "", access: "", behaviours: "", transactions: "" });
  const [w6InsiderResult, setW6InsiderResult] = useState<Record<string, unknown> | null>(null);
  const [w6InsiderLoading, setW6InsiderLoading] = useState(false);

  const runTfScreener = async () => {
    if (!tfInput.subject.trim()) return;
    setTfLoading(true); setTfResult(null);
    try {
      const res = await fetch("/api/tf-screener", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...tfInput, existingRedFlags: tfInput.existingRedFlags ? tfInput.existingRedFlags.split("\n").map((s) => s.trim()).filter(Boolean) : undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & TfScreenerResult;
      if (data.ok) setTfResult(data);
    } catch { /* silent */ }
    finally { setTfLoading(false); }
  };

  const runShellDetector = async () => {
    if (!shellInput.entityName.trim()) return;
    setShellLoading(true); setShellResult(null);
    try {
      const res = await fetch("/api/shell-detector", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(shellInput) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & ShellDetectorResult;
      if (data.ok) setShellResult(data);
    } catch { /* silent */ }
    finally { setShellLoading(false); }
  };

  const runAdverseClassify = async () => {
    if (!adverseText.trim()) return;
    setAdverseLoading(true); setAdverseResult(null);
    try {
      const res = await fetch("/api/adverse-classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleText: adverseText, subjectName: adverseSubject || undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & AdverseClassifyResult;
      if (data.ok) setAdverseResult(data);
    } catch { /* silent */ }
    finally { setAdverseLoading(false); }
  };

  const runCaseTimeline = async () => {
    if (!timelineEvents.trim()) return;
    setTimelineLoading(true); setTimelineResult(null);
    try {
      const res = await fetch("/api/case-timeline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: timelineEvents, subjectName: timelineSubject || undefined, caseRef: timelineCaseRef || undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & CaseTimelineResult;
      if (data.ok) setTimelineResult(data);
    } catch { /* silent */ }
    finally { setTimelineLoading(false); }
  };

  const runMlPredicate = async () => {
    if (!predicateFacts.trim()) return;
    setPredicateLoading(true); setPredicateResult(null);
    try {
      const res = await fetch("/api/ml-predicate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: predicateFacts, suspectedActivity: predicateActivity || undefined, jurisdiction: predicateJurisdiction || undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & MlPredicateResult;
      if (data.ok) setPredicateResult(data);
    } catch { /* silent */ }
    finally { setPredicateLoading(false); }
  };

  const runClientRisk = async () => {
    if (!clientRiskEntity.name.trim()) return;
    setClientRiskLoading(true); setClientRiskResult(null);
    try {
      const res = await fetch("/api/client-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: clientRiskEntity, shareholders: clientRiskShareholders.filter((s) => s.name.trim()) }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & ClientRiskResult;
      if (data.ok) setClientRiskResult(data);
    } catch { /* silent */ }
    finally { setClientRiskLoading(false); }
  };

  const runJurisdictionIntel = async () => {
    if (!jurisCountry.trim()) return;
    setJurisLoading(true); setJurisResult(null);
    try {
      const res = await fetch("/api/jurisdiction-intel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country: jurisCountry, context: jurisContext || undefined }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & JurisdictionIntelResult;
      if (data.ok) setJurisResult(data);
    } catch { /* silent */ }
    finally { setJurisLoading(false); }
  };

  const runUboRisk = async () => {
    if (!uboEntity.trim()) return;
    setUboLoading(true); setUboResult(null);
    try {
      const res = await fetch("/api/ubo-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: uboEntity, registered: uboRegistered || undefined, ubos: uboEntries.filter((u) => u.name.trim()) }) });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean } & UboRiskResult;
      if (data.ok) setUboResult(data);
    } catch { /* silent */ }
    finally { setUboLoading(false); }
  };

  const runBenford = async () => {
    const amounts = benfordAmounts.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
    if (amounts.length < 2) return;
    setBenfordLoading(true); setBenfordResult(null);
    try {
      const res = await fetch("/api/benford", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amounts, label: benfordLabel || undefined }) });
      if (!res.ok) return;
      const data = await res.json() as BenfordResult;
      setBenfordResult(data);
    } catch { /* silent */ }
    finally { setBenfordLoading(false); }
  };

  const runCryptoWallet = async () => {
    if (!cryptoAddress.trim()) return;
    setCryptoLoading(true); setCryptoResult(null); setCryptoError(null);
    try {
      const res = await fetch("/api/crypto-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: cryptoAddress, chain: cryptoChain }) });
      const data = await res.json() as { ok: boolean; error?: string } & Record<string, unknown>;
      if (!data.ok) { setCryptoError(data.error ?? "Service unavailable"); }
      else { setCryptoResult(data); }
    } catch { /* silent */ }
    finally { setCryptoLoading(false); }
  };

  const runOnboardingTier = async () => {
    if (!onboardInput.fullName.trim()) return;
    setOnboardLoading(true); setOnboardResult(null);
    try {
      const res = await fetch("/api/onboarding-risk-tier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(onboardInput) });
      if (!res.ok) return;
      const data = await res.json() as { ok?: boolean } & OnboardingRiskResult;
      setOnboardResult(data);
    } catch { /* silent */ }
    finally { setOnboardLoading(false); }
  };

  const runProlifFinance = async () => {
    if (!prolifInput.subject.trim()) return;
    setProlifLoading(true); setProlifResult(null);
    try {
      const res = await fetch("/api/proliferation-finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(prolifInput) });
      const data = await res.json() as ProlifFinanceResult;
      setProlifResult(data);
    } catch { /* noop */ }
    finally { setProlifLoading(false); }
  };

  const runSarTriage = async () => {
    if (!sarInput.suspiciousActivity.trim()) return;
    setSarTriageLoading(true); setSarTriageResult(null);
    try {
      const res = await fetch("/api/sar-triage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sarInput) });
      const data = await res.json() as SarTriageResult;
      setSarTriageResult(data);
    } catch { /* noop */ }
    finally { setSarTriageLoading(false); }
  };

  const runDocFraud = async () => {
    if (!docFraudInput.documentTypes.trim()) return;
    setDocFraudLoading(true); setDocFraudResult(null);
    try {
      const res = await fetch("/api/document-fraud", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(docFraudInput) });
      const data = await res.json() as DocumentFraudResult;
      setDocFraudResult(data);
    } catch { /* noop */ }
    finally { setDocFraudLoading(false); }
  };

  const runCtrStructuring = async () => {
    if (!ctrAmounts.trim()) return;
    setCtrLoading(true); setCtrResult(null);
    try {
      const res = await fetch("/api/ctr-structuring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amounts: ctrAmounts, periodDays: parseInt(ctrPeriodDays) || 30, subjectName: ctrSubject }) });
      const data = await res.json() as CtrStructuringResult;
      setCtrResult(data);
    } catch { /* noop */ }
    finally { setCtrLoading(false); }
  };

  const runDnfbpObligations = async () => {
    if (!dnfbpInput.dnfbpType.trim()) return;
    setDnfbpLoading(true); setDnfbpResult(null);
    try {
      const res = await fetch("/api/dnfbp-obligations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dnfbpInput) });
      const data = await res.json() as DnfbpObligationsResult;
      setDnfbpResult(data);
    } catch { /* noop */ }
    finally { setDnfbpLoading(false); }
  };

  const runCddRefresh = async () => {
    if (!cddRefreshInput.triggerEvents.trim() && !cddRefreshInput.adverseMediaHit.trim() && !cddRefreshInput.transactionPatternChange.trim()) return;
    setCddRefreshLoading(true); setCddRefreshResult(null);
    try {
      const res = await fetch("/api/cdd-refresh-trigger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cddRefreshInput) });
      const data = await res.json() as CddRefreshTriggerResult;
      setCddRefreshResult(data);
    } catch { /* noop */ }
    finally { setCddRefreshLoading(false); }
  };

  const runVaspRisk = async () => {
    if (!vaspInput.vaspName.trim()) return;
    setVaspLoading(true); setVaspResult(null);
    try {
      const res = await fetch("/api/vasp-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(vaspInput) });
      const data = await res.json() as VaspRiskResult;
      setVaspResult(data);
    } catch { /* noop */ }
    finally { setVaspLoading(false); }
  };

  const runGoAmlValidator = async () => {
    if (!goAmlInput.narrative.trim()) return;
    setGoAmlLoading(true); setGoAmlResult(null);
    try {
      const res = await fetch("/api/goaml-validator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(goAmlInput) });
      const data = await res.json() as GoAmlValidatorResult;
      setGoAmlResult(data);
    } catch { /* noop */ }
    finally { setGoAmlLoading(false); }
  };

  const runPepEdd = async () => {
    if (!pepEddInput.pepName.trim()) return;
    setPepEddLoading(true); setPepEddResult(null);
    try {
      const res = await fetch("/api/pep-edd-generator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pepEddInput) });
      const data = await res.json() as PepEddResult;
      setPepEddResult(data);
    } catch { /* noop */ }
    finally { setPepEddLoading(false); }
  };

  const runSanctionsMapper = async () => {
    if (!sanctionsMapInput.entityName.trim()) return;
    setSanctionsMapLoading(true); setSanctionsMapResult(null);
    try {
      const res = await fetch("/api/sanctions-exposure-mapper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sanctionsMapInput) });
      const data = await res.json() as SanctionsExposureResult;
      setSanctionsMapResult(data);
    } catch { /* noop */ }
    finally { setSanctionsMapLoading(false); }
  };

  // ── Wave 3 handlers ────────────────────────────────────────────────────────

  const runLayeringDetector = async () => {
    if (!layeringInput.transactions.trim()) return;
    setLayeringLoading(true); setLayeringResult(null);
    try {
      const res = await fetch("/api/layering-detector", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(layeringInput) });
      const data = await res.json() as Record<string, unknown>;
      setLayeringResult(data);
    } catch { /* noop */ }
    finally { setLayeringLoading(false); }
  };

  const runRealEstateMl = async () => {
    if (!realEstateMlInput.propertyDetails.trim()) return;
    setRealEstateMlLoading(true); setRealEstateMlResult(null);
    try {
      const res = await fetch("/api/real-estate-ml", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(realEstateMlInput) });
      const data = await res.json() as Record<string, unknown>;
      setRealEstateMlResult(data);
    } catch { /* noop */ }
    finally { setRealEstateMlLoading(false); }
  };

  const runAssetTracer = async () => {
    if (!assetTracerInput.initialFunds.trim()) return;
    setAssetTracerLoading(true); setAssetTracerResult(null);
    try {
      const res = await fetch("/api/asset-tracer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(assetTracerInput) });
      const data = await res.json() as Record<string, unknown>;
      setAssetTracerResult(data);
    } catch { /* noop */ }
    finally { setAssetTracerLoading(false); }
  };

  const runSowCalculator = async () => {
    if (!sowInput.declaredIncome.trim()) return;
    setSowLoading(true); setSowResult(null);
    try {
      const res = await fetch("/api/sow-calculator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sowInput) });
      const data = await res.json() as Record<string, unknown>;
      setSowResult(data);
    } catch { /* noop */ }
    finally { setSowLoading(false); }
  };

  const runInsiderThreat = async () => {
    if (!insiderInput.observedBehaviours.trim() && !insiderInput.employeeRole.trim()) return;
    setInsiderLoading(true); setInsiderResult(null);
    try {
      const res = await fetch("/api/insider-threat-screen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(insiderInput) });
      const data = await res.json() as Record<string, unknown>;
      setInsiderResult(data);
    } catch { /* noop */ }
    finally { setInsiderLoading(false); }
  };

  const runBoardAmlReport = async () => {
    if (!boardAmlInput.reportingPeriod.trim() && !boardAmlInput.institutionName.trim()) return;
    setBoardAmlLoading(true); setBoardAmlResult(null);
    try {
      const res = await fetch("/api/board-aml-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(boardAmlInput) });
      const data = await res.json() as Record<string, unknown>;
      setBoardAmlResult(data);
    } catch { /* noop */ }
    finally { setBoardAmlLoading(false); }
  };

  const runEnforcementExposure = async () => {
    if (!enforcementInput.violation.trim()) return;
    setEnforcementLoading(true); setEnforcementResult(null);
    try {
      const res = await fetch("/api/enforcement-exposure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(enforcementInput) });
      const data = await res.json() as Record<string, unknown>;
      setEnforcementResult(data);
    } catch { /* noop */ }
    finally { setEnforcementLoading(false); }
  };

  const runInterAgencyReferral = async () => {
    if (!referralInput.caseDescription.trim()) return;
    setReferralLoading(true); setReferralResult(null);
    try {
      const res = await fetch("/api/inter-agency-referral", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(referralInput) });
      const data = await res.json() as Record<string, unknown>;
      setReferralResult(data);
    } catch { /* noop */ }
    finally { setReferralLoading(false); }
  };

  const runPolicyReviewer = async () => {
    if (!policyInput.policyText.trim()) return;
    setPolicyLoading(true); setPolicyResult(null);
    try {
      const res = await fetch("/api/policy-reviewer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(policyInput) });
      const data = await res.json() as Record<string, unknown>;
      setPolicyResult(data);
    } catch { /* noop */ }
    finally { setPolicyLoading(false); }
  };

  const runComplianceTestPlanner = async () => {
    if (!compTestInput.institutionType.trim()) return;
    setCompTestLoading(true); setCompTestResult(null);
    try {
      const res = await fetch("/api/compliance-test-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(compTestInput) });
      const data = await res.json() as Record<string, unknown>;
      setCompTestResult(data);
    } catch { /* noop */ }
    finally { setCompTestLoading(false); }
  };

  const runSwiftLcAnalyzer = async () => {
    if (!swiftLcInput.swiftMessage.trim()) return;
    setSwiftLcLoading(true); setSwiftLcResult(null);
    try {
      const res = await fetch("/api/swift-lc-analyzer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(swiftLcInput) });
      const data = await res.json() as Record<string, unknown>;
      setSwiftLcResult(data);
    } catch { /* noop */ }
    finally { setSwiftLcLoading(false); }
  };

  const runRegulatoryCalendar = async () => {
    setRegCalLoading(true); setRegCalResult(null);
    try {
      const res = await fetch("/api/regulatory-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(regCalInput) });
      const data = await res.json() as Record<string, unknown>;
      setRegCalResult(data);
    } catch { /* noop */ }
    finally { setRegCalLoading(false); }
  };

  const runEwraGenerator = async () => {
    if (!ewraInput.institutionType.trim()) return;
    setEwraLoading(true); setEwraResult(null);
    try {
      const res = await fetch("/api/ewra-generator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ewraInput) });
      const data = await res.json() as Record<string, unknown>;
      setEwraResult(data);
    } catch { /* noop */ }
    finally { setEwraLoading(false); }
  };

  const runAmlProgrammeGap = async () => {
    if (!amlGapInput.institutionType.trim()) return;
    setAmlGapLoading(true); setAmlGapResult(null);
    try {
      const res = await fetch("/api/aml-programme-gap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(amlGapInput) });
      const data = await res.json() as Record<string, unknown>;
      setAmlGapResult(data);
    } catch { /* noop */ }
    finally { setAmlGapLoading(false); }
  };

  const runTradeInvoiceAnalyzer = async () => {
    if (!tradeInvoiceInput.invoiceDetails.trim()) return;
    setTradeInvoiceLoading(true); setTradeInvoiceResult(null);
    try {
      const res = await fetch("/api/trade-invoice-analyzer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tradeInvoiceInput) });
      const data = await res.json() as Record<string, unknown>;
      setTradeInvoiceResult(data);
    } catch { /* noop */ }
    finally { setTradeInvoiceLoading(false); }
  };

  const runNetworkMapper = async () => {
    if (!networkMapInput.entities.trim()) return;
    setNetworkMapLoading(true); setNetworkMapResult(null);
    try {
      const res = await fetch("/api/network-mapper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(networkMapInput) });
      const data = await res.json() as Record<string, unknown>;
      setNetworkMapResult(data);
    } catch { /* noop */ }
    finally { setNetworkMapLoading(false); }
  };

  const runRiskAppetiteBuilder = async () => {
    if (!riskAppInput.institutionType.trim()) return;
    setRiskAppLoading(true); setRiskAppResult(null);
    try {
      const res = await fetch("/api/risk-appetite-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(riskAppInput) });
      const data = await res.json() as Record<string, unknown>;
      setRiskAppResult(data);
    } catch { /* noop */ }
    finally { setRiskAppLoading(false); }
  };

  const runRegulatoryExamPrep = async () => {
    if (!examPrepInput.examArea.trim()) return;
    setExamPrepLoading(true); setExamPrepResult(null);
    try {
      const res = await fetch("/api/regulatory-exam-prep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(examPrepInput) });
      const data = await res.json() as Record<string, unknown>;
      setExamPrepResult(data);
    } catch { /* noop */ }
    finally { setExamPrepLoading(false); }
  };

  const runNpoRisk = async () => { setNpoLoading(true); try { const r = await fetch("/api/npo-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(npoInput) }); setNpoResult(await r.json()); } catch { setNpoResult({ ok: false, error: "Network error" }); } finally { setNpoLoading(false); } };
  const runCorrBank = async () => { setCorrBankLoading(true); try { const r = await fetch("/api/correspondent-bank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corrBankInput) }); setCorrBankResult(await r.json()); } catch { setCorrBankResult({ ok: false, error: "Network error" }); } finally { setCorrBankLoading(false); } };
  const runMixedFunds = async () => { setMixedFundsLoading(true); try { const r = await fetch("/api/mixed-funds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mixedFundsInput) }); setMixedFundsResult(await r.json()); } catch { setMixedFundsResult({ ok: false, error: "Network error" }); } finally { setMixedFundsLoading(false); } };
  const runSanctionsBreach = async () => { setSanctionsBreachLoading(true); try { const r = await fetch("/api/sanctions-breach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sanctionsBreachInput) }); setSanctionsBreachResult(await r.json()); } catch { setSanctionsBreachResult({ ok: false, error: "Network error" }); } finally { setSanctionsBreachLoading(false); } };
  const runFreezeSeizure = async () => { setFreezeSeizureLoading(true); try { const r = await fetch("/api/freeze-seizure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(freezeSeizureInput) }); setFreezeSeizureResult(await r.json()); } catch { setFreezeSeizureResult({ ok: false, error: "Network error" }); } finally { setFreezeSeizureLoading(false); } };
  const runAuditResponse = async () => { setAuditResponseLoading(true); try { const r = await fetch("/api/audit-response", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(auditResponseInput) }); setAuditResponseResult(await r.json()); } catch { setAuditResponseResult({ ok: false, error: "Network error" }); } finally { setAuditResponseLoading(false); } };
  const runHnw = async () => { setHnwLoading(true); try { const r = await fetch("/api/high-net-worth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(hnwInput) }); setHnwResult(await r.json()); } catch { setHnwResult({ ok: false, error: "Network error" }); } finally { setHnwLoading(false); } };
  const runCashIntensive = async () => { setCashIntensiveLoading(true); try { const r = await fetch("/api/cash-intensive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cashIntensiveInput) }); setCashIntensiveResult(await r.json()); } catch { setCashIntensiveResult({ ok: false, error: "Network error" }); } finally { setCashIntensiveLoading(false); } };
  const runTrustStruct = async () => { setTrustStructLoading(true); try { const r = await fetch("/api/trust-structures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(trustStructInput) }); setTrustStructResult(await r.json()); } catch { setTrustStructResult({ ok: false, error: "Network error" }); } finally { setTrustStructLoading(false); } };
  const runCrossBorder = async () => { setCrossBorderLoading(true); try { const r = await fetch("/api/cross-border-wire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(crossBorderInput) }); setCrossBorderResult(await r.json()); } catch { setCrossBorderResult({ ok: false, error: "Network error" }); } finally { setCrossBorderLoading(false); } };
  const runFiuFeedback = async () => { setFiuFeedbackLoading(true); try { const r = await fetch("/api/fiu-feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fiuFeedbackInput) }); setFiuFeedbackResult(await r.json()); } catch { setFiuFeedbackResult({ ok: false, error: "Network error" }); } finally { setFiuFeedbackLoading(false); } };
  const runDerisking = async () => { setDeriskingLoading(true); try { const r = await fetch("/api/derisking-impact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(deriskingInput) }); setDeriskingResult(await r.json()); } catch { setDeriskingResult({ ok: false, error: "Network error" }); } finally { setDeriskingLoading(false); } };
  const runLegalPriv = async () => { setLegalPrivLoading(true); try { const r = await fetch("/api/legal-privilege", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(legalPrivInput) }); setLegalPrivResult(await r.json()); } catch { setLegalPrivResult({ ok: false, error: "Network error" }); } finally { setLegalPrivLoading(false); } };
  const runMlScenario = async () => { setMlScenarioLoading(true); try { const r = await fetch("/api/ml-scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mlScenarioInput) }); setMlScenarioResult(await r.json()); } catch { setMlScenarioResult({ ok: false, error: "Network error" }); } finally { setMlScenarioLoading(false); } };
  const runStaffAlert = async () => { setStaffAlertLoading(true); try { const r = await fetch("/api/staff-alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(staffAlertInput) }); setStaffAlertResult(await r.json()); } catch { setStaffAlertResult({ ok: false, error: "Network error" }); } finally { setStaffAlertLoading(false); } };
  const runStrQuality = async () => { setStrQualityLoading(true); try { const r = await fetch("/api/str-quality", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(strQualityInput) }); setStrQualityResult(await r.json()); } catch { setStrQualityResult({ ok: false, error: "Network error" }); } finally { setStrQualityLoading(false); } };
  const runHawala = async () => { setHawalaLoading(true); try { const r = await fetch("/api/hawala-detector", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(hawalaInput) }); setHawalaResult(await r.json()); } catch { setHawalaResult({ ok: false, error: "Network error" }); } finally { setHawalaLoading(false); } };
  const runNominee = async () => { setNomineeLoading(true); try { const r = await fetch("/api/nominee-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nomineeInput) }); setNomineeResult(await r.json()); } catch { setNomineeResult({ ok: false, error: "Network error" }); } finally { setNomineeLoading(false); } };
  const runPepCorp = async () => { setPepCorpLoading(true); try { const r = await fetch("/api/pep-corporate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pepCorpInput) }); setPepCorpResult(await r.json()); } catch { setPepCorpResult({ ok: false, error: "Network error" }); } finally { setPepCorpLoading(false); } };
  const runCryptoMix = async () => { setCryptoMixLoading(true); try { const r = await fetch("/api/crypto-mixing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cryptoMixInput) }); setCryptoMixResult(await r.json()); } catch { setCryptoMixResult({ ok: false, error: "Network error" }); } finally { setCryptoMixLoading(false); } };
  const runGhostCo = async () => { setGhostCoLoading(true); try { const r = await fetch("/api/ghost-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ghostCoInput) }); setGhostCoResult(await r.json()); } catch { setGhostCoResult({ ok: false, error: "Network error" }); } finally { setGhostCoLoading(false); } };
  const runPKyc = async () => { setPKycLoading(true); try { const r = await fetch("/api/pkeyc-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pKycInput) }); setPKycResult(await r.json()); } catch { setPKycResult({ ok: false, error: "Network error" }); } finally { setPKycLoading(false); } };
  const runWhistle = async () => { setWhistleLoading(true); try { const r = await fetch("/api/whistleblower", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(whistleInput) }); setWhistleResult(await r.json()); } catch { setWhistleResult({ ok: false, error: "Network error" }); } finally { setWhistleLoading(false); } };
  const runTradeFinRf = async () => { setTradeFinRfLoading(true); try { const r = await fetch("/api/trade-finance-rf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tradeFinRfInput) }); setTradeFinRfResult(await r.json()); } catch { setTradeFinRfResult({ ok: false, error: "Network error" }); } finally { setTradeFinRfLoading(false); } };
  const runSanctionsExp = async () => { setSanctionsExpLoading(true); try { const r = await fetch("/api/sanctions-exposure-calc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sanctionsExpInput) }); setSanctionsExpResult(await r.json()); } catch { setSanctionsExpResult({ ok: false, error: "Network error" }); } finally { setSanctionsExpLoading(false); } };
  const runCustLife = async () => { setCustLifeLoading(true); try { const r = await fetch("/api/customer-lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(custLifeInput) }); setCustLifeResult(await r.json()); } catch { setCustLifeResult({ ok: false, error: "Network error" }); } finally { setCustLifeLoading(false); } };
  const runPepEnh = async () => { setPepEnhLoading(true); try { const r = await fetch("/api/pep-screening-enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pepEnhInput) }); setPepEnhResult(await r.json()); } catch { setPepEnhResult({ ok: false, error: "Network error" }); } finally { setPepEnhLoading(false); } };
  const runAmlTrain = async () => { setAmlTrainLoading(true); try { const r = await fetch("/api/aml-training-gap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(amlTrainInput) }); setAmlTrainResult(await r.json()); } catch { setAmlTrainResult({ ok: false, error: "Network error" }); } finally { setAmlTrainLoading(false); } };
  const runUboVerify = async () => { setUboVerifyLoading(true); try { const r = await fetch("/api/beneficial-owner-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(uboVerifyInput) }); setUboVerifyResult(await r.json()); } catch { setUboVerifyResult({ ok: false, error: "Network error" }); } finally { setUboVerifyLoading(false); } };
  const runAmlKpi = async () => { setAmlKpiLoading(true); try { const r = await fetch("/api/aml-kpi-dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(amlKpiInput) }); setAmlKpiResult(await r.json()); } catch { setAmlKpiResult({ ok: false, error: "Network error" }); } finally { setAmlKpiLoading(false); } };

  // ── Wave 6 handlers ────────────────────────────────────────────────────────
  const runW6Vasp = async () => { setW6VaspLoading(true); try { const r = await fetch("/api/virtual-asset-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6VaspInput) }); setW6VaspResult(await r.json()); } catch { setW6VaspResult({ ok: false, error: "Network error" }); } finally { setW6VaspLoading(false); } };
  const runW6Prolif = async () => { setW6ProlifLoading(true); try { const r = await fetch("/api/proliferation-finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: w6ProlifInput.entity, subjectCountry: w6ProlifInput.jurisdiction, goods: w6ProlifInput.sectors, context: w6ProlifInput.transactionPatterns }) }); setW6ProlifResult(await r.json()); } catch { setW6ProlifResult({ ok: false, error: "Network error" }); } finally { setW6ProlifLoading(false); } };
  const runW6Env = async () => { setW6EnvLoading(true); try { const r = await fetch("/api/environmental-crime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6EnvInput) }); setW6EnvResult(await r.json()); } catch { setW6EnvResult({ ok: false, error: "Network error" }); } finally { setW6EnvLoading(false); } };
  const runW6Crypto = async () => { setW6CryptoLoading(true); try { const r = await fetch("/api/crypto-tracing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6CryptoInput) }); setW6CryptoResult(await r.json()); } catch { setW6CryptoResult({ ok: false, error: "Network error" }); } finally { setW6CryptoLoading(false); } };
  const runW6Ht = async () => { setW6HtLoading(true); try { const r = await fetch("/api/human-trafficking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6HtInput) }); setW6HtResult(await r.json()); } catch { setW6HtResult({ ok: false, error: "Network error" }); } finally { setW6HtLoading(false); } };
  const runW6Tax = async () => { setW6TaxLoading(true); try { const r = await fetch("/api/tax-evasion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6TaxInput) }); setW6TaxResult(await r.json()); } catch { setW6TaxResult({ ok: false, error: "Network error" }); } finally { setW6TaxLoading(false); } };
  const runW6Corr = async () => { setW6CorrLoading(true); try { const r = await fetch("/api/corruption-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6CorrInput) }); setW6CorrResult(await r.json()); } catch { setW6CorrResult({ ok: false, error: "Network error" }); } finally { setW6CorrLoading(false); } };
  const runW6Re = async () => { setW6ReLoading(true); try { const r = await fetch("/api/real-estate-ml", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyDetails: w6ReInput.property, buyerName: w6ReInput.buyer, sellerName: w6ReInput.seller, purchasePrice: w6ReInput.price, jurisdiction: w6ReInput.jurisdiction, paymentMethod: w6ReInput.paymentMethod }) }); setW6ReResult(await r.json()); } catch { setW6ReResult({ ok: false, error: "Network error" }); } finally { setW6ReLoading(false); } };
  const runW6Tf = async () => { setW6TfLoading(true); try { const r = await fetch("/api/trade-finance-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6TfInput) }); setW6TfResult(await r.json()); } catch { setW6TfResult({ ok: false, error: "Network error" }); } finally { setW6TfLoading(false); } };
  const runW6Insider = async () => { setW6InsiderLoading(true); try { const r = await fetch("/api/insider-threat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w6InsiderInput) }); setW6InsiderResult(await r.json()); } catch { setW6InsiderResult({ ok: false, error: "Network error" }); } finally { setW6InsiderLoading(false); } };

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
        moduleNumber={7}
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
            🧠 MLRO Advisor
          </button>
          <button type="button" onClick={() => setPageTab("regulatory-qa")} className={tabCls(pageTab === "regulatory-qa")}>
            📜 Regulatory Q&A
          </button>
          <button type="button" onClick={() => setPageTab("super-tools")} className={tabCls(pageTab === "super-tools")}>
            🛠️ Super Tools
          </button>
        </div>

        {/* ── ⚡ Chain Run panel — always visible above all tabs ──────────── */}
        <div className="mb-6 bg-bg-1 border border-brand/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-brand font-semibold text-11 uppercase tracking-wide-4">⚡ Chain Run</span>
            <span className="font-mono text-10 text-ink-3">— Subject Brief · Typology Match · STR Recommendation</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide-2">Subject name</label>
              <input
                value={chainSubject}
                onChange={(e) => setChainSubject(e.target.value)}
                placeholder="e.g. Al-Rashid Trading LLC"
                disabled={chainRunning}
                className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide-2">Jurisdiction</label>
              <select
                value={chainJurisdiction}
                onChange={(e) => setChainJurisdiction(e.target.value)}
                disabled={chainRunning}
                className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 disabled:opacity-50"
              >
                <option value="UAE">UAE</option>
                <option value="UK">UK</option>
                <option value="US">US</option>
                <option value="SG">SG</option>
                <option value="HK">HK</option>
              </select>
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide-2">Risk score: {chainRiskScore}</label>
              <input
                type="range"
                min={1}
                max={100}
                value={chainRiskScore}
                onChange={(e) => setChainRiskScore(Number(e.target.value))}
                disabled={chainRunning}
                className="w-full accent-brand disabled:opacity-50 mt-1"
              />
              <div className="flex justify-between font-mono text-9 text-ink-3 mt-0.5">
                <span>1</span><span>100</span>
              </div>
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1 uppercase tracking-wide-2">Transaction pattern</label>
              <input
                value={chainPattern}
                onChange={(e) => setChainPattern(e.target.value)}
                placeholder="e.g. High-volume cash, round-trip wires"
                disabled={chainRunning}
                className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 disabled:opacity-50"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void handleChainRun(); }}
            disabled={chainRunning || !chainSubject.trim()}
            className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {chainRunning ? "Running 3-tool chain analysis…" : "⚡ Run Chain Analysis"}
          </button>
          {chainError && (
            <div className="mt-3 text-12 text-red font-mono">{chainError}</div>
          )}
          {chainResult && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="text-10 uppercase tracking-wide-4 font-semibold text-brand mb-2">Subject Brief</div>
                <p className="text-12 text-ink-1 leading-relaxed m-0">{chainResult.subjectBrief}</p>
              </div>
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="text-10 uppercase tracking-wide-4 font-semibold text-brand mb-2">Typology Match</div>
                <p className="text-12 text-ink-1 leading-relaxed m-0">{chainResult.typologyMatch}</p>
              </div>
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
                <div className="text-10 uppercase tracking-wide-4 font-semibold text-brand mb-2">STR Recommendation</div>
                <p className="text-12 text-ink-1 leading-relaxed m-0">{chainResult.strRecommendation}</p>
                {chainResult.chainDuration != null && chainResult.chainDuration > 0 && (
                  <div className="font-mono text-10 text-ink-3 mt-2">
                    chain: {(chainResult.chainDuration / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            </div>
          )}
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
                    onClick={() => {
                      const last = advisorHistory[advisorHistory.length - 1];
                      exportMlroMemo({
                        subject: last?.question?.slice(0, 80) ?? "MLRO Advisory Session",
                        summary: advisorHistory.map((h) => `Q: ${h.question}\nVerdict: ${h.result.complianceReview.advisorVerdict}`).join("\n\n"),
                        recommendation: last?.result.complianceReview.advisorVerdict ?? "See session transcript",
                        regulatoryBasis: "UAE FDL 10/2025 · FATF Recommendations · CBUAE AML Standards",
                      });
                    }}
                    className="text-11 text-ink-3 hover:text-brand border border-hair-2 hover:border-brand px-2.5 py-1 rounded transition-colors"
                  >
                    ↓ PDF Memo
                  </button>
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
              {(["escalation","flags","patterns","brief","pep-network","sanctions-nexus","typology-match","txn-narrative","edd-questionnaire","tbml","str-narrative","wire-r16","pf-screener","mlro-memo","tf-screener","shell-detector","adverse-classify","case-timeline","ml-predicate","client-risk","jurisdiction-intel","ubo-risk","benford","crypto-wallet","onboarding-tier","prolif-finance","sar-triage","doc-fraud","ctr-structuring","dnfbp-obligations","cdd-refresh","vasp-risk","goaml-validator","pep-edd","sanctions-mapper","layering-detector","real-estate-ml","asset-tracer","sow-calculator","insider-threat-screen","board-aml-report","enforcement-exposure","inter-agency-referral","policy-reviewer","compliance-test-planner","swift-lc-analyzer","regulatory-calendar","ewra-generator","aml-programme-gap","trade-invoice-analyzer","network-mapper","risk-appetite-builder","regulatory-exam-prep","npo-risk","correspondent-bank","mixed-funds","sanctions-breach","freeze-seizure","audit-response","high-net-worth","cash-intensive","trust-structures","cross-border-wire","fiu-feedback","derisking-impact","legal-privilege","ml-scenario","staff-alert","str-quality","hawala-detector","nominee-risk","pep-corporate","crypto-mixing","ghost-company","pkeyc-planner","whistleblower","trade-finance-rf","sanctions-exposure-calc","customer-lifecycle","pep-screening-enhance","aml-training-gap","beneficial-owner-verify","aml-kpi-dashboard","w6-virtual-asset-risk","w6-prolif-finance","w6-environmental-crime","w6-crypto-tracing","w6-human-trafficking","w6-tax-evasion","w6-corruption-risk","w6-real-estate-ml","w6-trade-finance","w6-insider-threat"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setSuperToolsTab(t)}
                  className={superTabCls(superToolsTab === t)}>
                  {t === "escalation" ? "⚡ Escalation" : t === "flags" ? "🚩 Red Flags" : t === "patterns" ? "📊 Case Patterns" : t === "brief" ? "📋 Subject Brief" : t === "pep-network" ? "🕸 PEP Network" : t === "sanctions-nexus" ? "🔒 Sanctions Nexus" : t === "typology-match" ? "🎯 Typology Match" : t === "txn-narrative" ? "📝 Txn Analyzer" : t === "edd-questionnaire" ? "📑 EDD Generator" : t === "tbml" ? "🚢 TBML Analyzer" : t === "str-narrative" ? "✍️ STR Drafter" : t === "wire-r16" ? "🔁 Wire R.16" : t === "pf-screener" ? "☢️ PF Screener" : t === "mlro-memo" ? "📂 MLRO Memo" : t === "tf-screener" ? "💣 TF Screener" : t === "shell-detector" ? "🏚 Shell Detector" : t === "adverse-classify" ? "📰 Adverse Classify" : t === "case-timeline" ? "📅 Case Timeline" : t === "ml-predicate" ? "⚖️ ML Predicate" : t === "client-risk" ? "👤 Client Risk" : t === "jurisdiction-intel" ? "🌍 Jurisdiction Intel" : t === "ubo-risk" ? "🏛 UBO Risk" : t === "benford" ? "📐 Benford Forensics" : t === "crypto-wallet" ? "₿ Crypto Wallet" : t === "onboarding-tier" ? "🎛 Onboarding Tier" : t === "prolif-finance" ? "☣️ Prolif Finance" : t === "sar-triage" ? "🔍 SAR Triage" : t === "doc-fraud" ? "🪪 Doc Fraud" : t === "ctr-structuring" ? "💰 CTR/Structuring" : t === "dnfbp-obligations" ? "🏪 DNFBP Obligations" : t === "cdd-refresh" ? "🔄 CDD Refresh" : t === "vasp-risk" ? "🔗 VASP Risk" : t === "goaml-validator" ? "📤 goAML Validator" : t === "pep-edd" ? "🎖 PEP EDD" : t === "sanctions-mapper" ? "🗺 Sanctions Mapper" : t === "layering-detector" ? "🔀 Layering Detector" : t === "real-estate-ml" ? "🏠 Real Estate ML" : t === "asset-tracer" ? "🔎 Asset Tracer" : t === "sow-calculator" ? "💼 SOW Calculator" : t === "insider-threat-screen" ? "🕵️ Insider Threat" : t === "board-aml-report" ? "📊 Board AML Report" : t === "enforcement-exposure" ? "⚠️ Enforcement Exposure" : t === "inter-agency-referral" ? "📨 Inter-Agency Referral" : t === "policy-reviewer" ? "📃 Policy Reviewer" : t === "compliance-test-planner" ? "🧪 Compliance Test Planner" : t === "swift-lc-analyzer" ? "🏦 SWIFT/LC Analyzer" : t === "regulatory-calendar" ? "📅 Regulatory Calendar" : t === "ewra-generator" ? "📋 EWRA Generator" : t === "aml-programme-gap" ? "🔍 AML Programme Gap" : t === "trade-invoice-analyzer" ? "🧾 Trade Invoice Analyzer" : t === "network-mapper" ? "🕸 Network Mapper" : t === "risk-appetite-builder" ? "🎯 Risk Appetite Builder" : t === "regulatory-exam-prep" ? "📚 Exam Prep" : t === "npo-risk" ? "🏛 NPO Risk" : t === "correspondent-bank" ? "🏦 Correspondent Bank" : t === "mixed-funds" ? "🌀 Mixed Funds" : t === "sanctions-breach" ? "🚨 Sanctions Breach" : t === "freeze-seizure" ? "❄️ Freeze / Seizure" : t === "audit-response" ? "📋 Audit Response" : t === "high-net-worth" ? "💎 HNW Profile" : t === "cash-intensive" ? "💵 Cash-Intensive" : t === "trust-structures" ? "🔐 Trust Structures" : t === "cross-border-wire" ? "🌐 Cross-Border Wire" : t === "fiu-feedback" ? "📬 FIU Feedback" : t === "derisking-impact" ? "⚖️ De-Risking Impact" : t === "legal-privilege" ? "🔏 Legal Privilege" : t === "ml-scenario" ? "🎭 ML Scenario" : t === "staff-alert" ? "🚨 Staff Alert" : t === "str-quality" ? "📝 STR Quality" : t === "hawala-detector" ? "💱 Hawala Detector" : t === "nominee-risk" ? "🎭 Nominee Risk" : t === "pep-corporate" ? "🏢 PEP Corporate" : t === "crypto-mixing" ? "🌀 Crypto Mixing" : t === "ghost-company" ? "👻 Ghost Company" : t === "pkeyc-planner" ? "🔄 pKYC Planner" : t === "whistleblower" ? "🔔 Whistleblower" : t === "trade-finance-rf" ? "🚢 Trade Finance RF" : t === "sanctions-exposure-calc" ? "💥 Sanctions Exposure" : t === "customer-lifecycle" ? "🔁 Customer Lifecycle" : t === "pep-screening-enhance" ? "🎖 PEP Enhanced" : t === "aml-training-gap" ? "🎓 Training Gap" : t === "beneficial-owner-verify" ? "🔍 UBO Verify" : t === "aml-kpi-dashboard" ? "📊 AML KPIs" : t === "w6-virtual-asset-risk" ? "₿ Virtual Asset Risk" : t === "w6-prolif-finance" ? "☢️ Prolif Finance" : t === "w6-environmental-crime" ? "🌿 Environmental Crime" : t === "w6-crypto-tracing" ? "🔗 Crypto Tracing" : t === "w6-human-trafficking" ? "🚨 Human Trafficking" : t === "w6-tax-evasion" ? "💰 Tax Evasion" : t === "w6-corruption-risk" ? "🏛️ Corruption Risk" : t === "w6-real-estate-ml" ? "🏠 Real Estate ML" : t === "w6-trade-finance" ? "🚢 Trade Finance" : "👤 Insider Threat"}
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

            {/* PEP Network Intelligence */}
            {superToolsTab === "pep-network" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">PEP Network Intelligence</div>
                <p className="text-11 text-ink-3">Full network enumeration of persons and entities requiring screening — beyond static PEP profiles. Powered by FATF R.12 and FDL 10/2025 Art.12.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">PEP name *</label>
                    <input value={pepInput.name} onChange={(e) => setPepInput((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Role *</label>
                    <input value={pepInput.role} onChange={(e) => setPepInput((p) => ({ ...p, role: e.target.value }))} placeholder="e.g. Minister of Finance, President" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Country *</label>
                    <input value={pepInput.country} onChange={(e) => setPepInput((p) => ({ ...p, country: e.target.value }))} placeholder="e.g. AE, NG, RU" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Party/Affiliation (optional)</label>
                    <input value={pepInput.party} onChange={(e) => setPepInput((p) => ({ ...p, party: e.target.value }))} placeholder="e.g. ruling party name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Tenure (optional)</label>
                    <input value={pepInput.tenure} onChange={(e) => setPepInput((p) => ({ ...p, tenure: e.target.value }))} placeholder="e.g. 2019-present" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                </div>
                <button type="button" onClick={() => void runPepNetwork()} disabled={pepNetLoading || !pepInput.name.trim() || !pepInput.role.trim() || !pepInput.country.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {pepNetLoading ? "Generating…" : "Generate PEP Network Intelligence"}
                </button>
                {pepNet && (() => {
                  const n = pepNet;
                  const ratingCls = n.riskRating === "critical" || n.riskRating === "high" ? "bg-red text-white" : "bg-amber-dim text-amber";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${ratingCls}`}>{n.riskRating} risk</span>
                        <span className="font-mono text-11 text-ink-2">{n.pepCategory}</span>
                        {n.seniorManagementApprovalRequired && (
                          <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red uppercase">Senior Mgmt Approval Required</span>
                        )}
                        <span className="font-mono text-10 px-2 py-px rounded bg-brand-dim text-brand-deep uppercase">Monitor: {n.ongoingMonitoringFrequency}</span>
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{n.riskNarrative}</p>
                      {n.personsToScreen.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Persons to Screen</div>
                          <div className="space-y-2">
                            {n.personsToScreen.map((person, i) => {
                              const priCls = person.screeningPriority === "mandatory" ? "bg-red text-white" : person.screeningPriority === "high" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand-deep";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-3 bg-bg-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 ${priCls}`}>{person.screeningPriority}</span>
                                    <span className="text-12 font-medium text-ink-0">{person.relationship}</span>
                                  </div>
                                  <div className="text-11 text-ink-2 mb-0.5">{person.rationale}</div>
                                  <div className="text-10 font-mono text-ink-3">{person.fatfBasis}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {n.entitiesToScreen.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Entities to Screen</div>
                          <div className="space-y-2">
                            {n.entitiesToScreen.map((ent, i) => {
                              const priCls = ent.screeningPriority === "mandatory" ? "bg-red text-white" : ent.screeningPriority === "high" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand-deep";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-3 bg-bg-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 ${priCls}`}>{ent.screeningPriority}</span>
                                    <span className="text-12 font-medium text-ink-0">{ent.entityType}</span>
                                  </div>
                                  <div className="text-11 text-ink-2">{ent.rationale}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {n.typicalMlRisks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Typical ML Risks</div>
                          <div className="flex flex-wrap gap-1.5">
                            {n.typicalMlRisks.map((r, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red">{r}</span>)}
                          </div>
                        </div>
                      )}
                      {n.eddRequirements.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">EDD Requirements</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {n.eddRequirements.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {n.exitTriggers.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Exit Triggers</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {n.exitTriggers.map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                        </div>
                      )}
                      {n.regulatoryBasis && <div className="text-10 font-mono text-ink-3">{n.regulatoryBasis}</div>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Sanctions Nexus */}
            {superToolsTab === "sanctions-nexus" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">AI Indirect Sanctions Exposure Analyzer</div>
                <p className="text-11 text-ink-3">Reasons about indirect sanctions exposure through ownership chains, jurisdictions, and financial intermediaries — beyond direct SDN name hits.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Subject *</label>
                    <input value={sanctionsNexusInput.subject} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, subject: e.target.value }))} placeholder="Person or entity name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Country *</label>
                    <input value={sanctionsNexusInput.country} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, country: e.target.value }))} placeholder="Subject country (ISO-2)" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Counterparty name</label>
                    <input value={sanctionsNexusInput.counterpartyName} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, counterpartyName: e.target.value }))} placeholder="Counterparty entity/person" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Counterparty country</label>
                    <input value={sanctionsNexusInput.counterpartyCountry} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, counterpartyCountry: e.target.value }))} placeholder="ISO-2" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div>
                    <label className="block text-10 text-ink-3 mb-1">Transaction type</label>
                    <input value={sanctionsNexusInput.transactionType} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, transactionType: e.target.value }))} placeholder="e.g. wire transfer, gold purchase" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-10 text-ink-3 mb-1">Amount</label>
                      <input value={sanctionsNexusInput.amount} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, amount: e.target.value }))} placeholder="0" type="number" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="w-24">
                      <label className="block text-10 text-ink-3 mb-1">Currency</label>
                      <input value={sanctionsNexusInput.currency} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, currency: e.target.value }))} placeholder="AED" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-10 text-ink-3 mb-1">Ownership chain</label>
                    <textarea value={sanctionsNexusInput.ownershipChain} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, ownershipChain: e.target.value }))} rows={2} placeholder="Describe the ownership/corporate structure…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-10 text-ink-3 mb-1">Banking relationships</label>
                    <textarea value={sanctionsNexusInput.bankingRelationships} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, bankingRelationships: e.target.value }))} rows={2} placeholder="Correspondent banks, payment processors, intermediaries…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-10 text-ink-3 mb-1">Additional context</label>
                    <textarea value={sanctionsNexusInput.context} onChange={(e) => setSanctionsNexusInput((p) => ({ ...p, context: e.target.value }))} rows={2} placeholder="Any further context relevant to the sanctions assessment…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                  </div>
                </div>
                <button type="button" onClick={() => void runSanctionsNexus()} disabled={sanctionsNexusLoading || !sanctionsNexusInput.subject.trim() || !sanctionsNexusInput.country.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {sanctionsNexusLoading ? "Analyzing…" : "Analyze Sanctions Exposure"}
                </button>
                {sanctionsNexus && (() => {
                  const s = sanctionsNexus;
                  const overallCls = s.overallSanctionsRisk === "critical" || s.overallSanctionsRisk === "high" ? "text-red font-bold" : s.overallSanctionsRisk === "medium" ? "text-amber font-bold" : "text-green font-bold";
                  const actionCls = s.recommendedAction === "block" || s.recommendedAction === "file_str" ? "bg-red text-white" : s.recommendedAction === "escalate_to_mlro" || s.recommendedAction === "enhanced_dd" ? "bg-amber-dim text-amber" : s.recommendedAction === "monitor" ? "bg-brand-dim text-brand-deep" : "bg-green-dim text-green";
                  const exposureBadge = (val: string) => val === "confirmed" ? "bg-red text-white" : val === "likely" ? "bg-red-dim text-red" : val === "possible" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 uppercase ${overallCls}`}>{s.overallSanctionsRisk} sanctions risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${exposureBadge(s.directExposure)}`}>Direct: {s.directExposure}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${exposureBadge(s.indirectExposure)}`}>Indirect: {s.indirectExposure}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actionCls}`}>{s.recommendedAction.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{s.exposureNarrative}</p>
                      {s.fiftyPercentRuleApplicable && (
                        <div className="rounded p-3 bg-amber-dim border border-amber text-amber text-11">
                          <span className="font-semibold">50% Ownership Rule applies: </span>{s.fiftyPercentAnalysis}
                        </div>
                      )}
                      {s.directRisks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Direct Risks</div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.directRisks.map((r, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-red text-white">{r}</span>)}
                          </div>
                        </div>
                      )}
                      {s.indirectRisks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Indirect Risks</div>
                          <div className="space-y-2">
                            {s.indirectRisks.map((r, i) => {
                              const sevCls = r.severity === "critical" ? "bg-red text-white" : r.severity === "high" ? "bg-red-dim text-red" : r.severity === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-3 bg-bg-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 ${sevCls}`}>{r.severity}</span>
                                    <span className="text-12 font-medium text-ink-0">{r.riskType}</span>
                                    <span className="font-mono text-10 text-ink-3">{r.sanctionsRegime}</span>
                                  </div>
                                  <div className="text-11 text-ink-2 mb-0.5">{r.description}</div>
                                  <div className="text-10 font-mono text-ink-3">{r.regulatoryBasis}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {s.jurisdictionalExposure.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictional Exposure</div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.jurisdictionalExposure.map((j, i) => <span key={i} className="font-mono text-10 px-1.5 py-px rounded bg-red text-white">{j}</span>)}
                          </div>
                        </div>
                      )}
                      {s.requiredChecks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Checks</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {s.requiredChecks.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {s.regulatoryBasis && <div className="text-10 font-mono text-ink-3">{s.regulatoryBasis}</div>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Transaction Narrative Analyzer ─────────────────────────────── */}
            {superToolsTab === "txn-narrative" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">Transaction Narrative Analyzer</div>
                  <p className="text-11 text-ink-3 mb-3">Paste a raw transaction narrative, TM alert, or case note. AI determines the AML typology, red flags, STR threshold, and recommended action — grounded in UAE FDL 10/2025 and FATF recommendations.</p>
                  <textarea
                    value={txnNarrative}
                    onChange={(e) => setTxnNarrative(e.target.value)}
                    rows={5}
                    placeholder="Paste transaction narrative or monitoring alert text here — e.g. 'Customer conducted 12 cash deposits across 3 branches over 2 weeks, each just below AED 55,000, followed by a same-day international wire to a UAE-listed counterparty in DRC…'"
                    className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none"
                  />
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Customer Type</label>
                      <input value={txnCustomerType} onChange={(e) => setTxnCustomerType(e.target.value)} placeholder="e.g. Gold trader, VASP, PEP" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Jurisdiction</label>
                      <input value={txnJurisdiction} onChange={(e) => setTxnJurisdiction(e.target.value)} placeholder="e.g. UAE, NG, AE→CH" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Amount Details</label>
                      <input value={txnAmounts} onChange={(e) => setTxnAmounts(e.target.value)} placeholder="e.g. AED 52,000 × 12" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runTxnNarrative()} disabled={txnLoading || !txnNarrative.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {txnLoading ? "Analyzing…" : "Analyze Transaction"}
                </button>
                {txnResult && (() => {
                  const t = txnResult;
                  const riskCls = t.riskVerdict === "critical" ? "bg-red text-white" : t.riskVerdict === "high" ? "bg-red-dim text-red" : t.riskVerdict === "medium" ? "bg-amber-dim text-amber" : t.riskVerdict === "low" ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  const actionCls = (t.recommendedAction === "file_str") ? "bg-red text-white" : (t.recommendedAction === "escalate_mlro") ? "bg-red-dim text-red" : (t.recommendedAction === "enhanced_dd") ? "bg-amber-dim text-amber" : (t.recommendedAction === "monitor") ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls}`}>{t.riskVerdict} risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actionCls}`}>{t.recommendedAction.replace(/_/g, " ")}</span>
                        {t.strRequired && <span className="font-mono text-10 px-2 py-px rounded bg-red text-white uppercase font-bold">STR required</span>}
                      </div>
                      <div>
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Typology</div>
                        <div className="text-12 font-semibold text-ink-0">{t.typology}</div>
                        <div className="text-10 font-mono text-ink-3">{t.typologyFatfRef}</div>
                      </div>
                      {t.strRequired && (
                        <div className="rounded p-3 bg-red-dim border border-red/40">
                          <div className="text-10 uppercase tracking-wide-3 text-red mb-1 font-semibold">STR Filing Obligation</div>
                          <p className="text-11 text-ink-0 mb-1">{t.strBasis}</p>
                          <div className="text-10 font-mono text-red">{t.strDeadline}</div>
                        </div>
                      )}
                      <p className="text-12 text-ink-1 leading-relaxed">{t.actionRationale}</p>
                      {t.redFlags.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Red Flags ({t.redFlags.length})</div>
                          <div className="space-y-1.5">
                            {t.redFlags.map((f, i) => {
                              const sevCls = f.severity === "critical" ? "bg-red text-white" : f.severity === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber";
                              return (
                                <div key={i} className="flex items-start gap-2 border border-hair-2 rounded p-2 bg-bg-0">
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${sevCls}`}>{f.severity}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-11 text-ink-0">{f.indicator}</div>
                                    <div className="text-10 font-mono text-ink-3">{f.fatfRef}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {t.missingInformation.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-amber mb-1">Missing Information</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {t.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                      {t.investigativeQuestions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Investigative Questions</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {t.investigativeQuestions.map((q, i) => <li key={i}>{q}</li>)}
                          </ol>
                        </div>
                      )}
                      {t.regulatoryBasis && <div className="text-10 font-mono text-ink-3">{t.regulatoryBasis}</div>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── EDD Questionnaire Generator ──────────────────────────────────── */}
            {superToolsTab === "edd-questionnaire" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">EDD Questionnaire Generator</div>
                  <p className="text-11 text-ink-3 mb-3">Input a customer profile and risk factors. AI generates a complete, tailored Enhanced Due Diligence questionnaire — with per-question regulatory basis, mandatory/optional classification, and documentation requirements.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Customer Type <span className="text-red">*</span></label>
                      <input value={eddCustomerType} onChange={(e) => setEddCustomerType(e.target.value)} placeholder="e.g. UAE gold refinery, Foreign DPMS dealer, VASP, PEP-owned LLC" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Risk Factors (comma-separated)</label>
                      <input value={eddRiskFactors} onChange={(e) => setEddRiskFactors(e.target.value)} placeholder="PEP, CAHRA sourcing, cash-intensive, BVI holding" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Jurisdiction</label>
                      <input value={eddJurisdiction} onChange={(e) => setEddJurisdiction(e.target.value)} placeholder="e.g. UAE, NG, RU" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Products / Services</label>
                      <input value={eddProducts} onChange={(e) => setEddProducts(e.target.value)} placeholder="gold bullion, refining, wire transfers" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Additional Context</label>
                      <input value={eddContext} onChange={(e) => setEddContext(e.target.value)} placeholder="Any other context relevant to EDD scope" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runEddQuestionnaire()} disabled={eddLoading || !eddCustomerType.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {eddLoading ? "Generating…" : "Generate EDD Questionnaire"}
                </button>
                {eddResult && (() => {
                  const e = eddResult;
                  const lvlCls = e.eddLevel === "intensive" ? "bg-red text-white" : e.eddLevel === "enhanced" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${lvlCls}`}>{e.eddLevel} EDD</span>
                        <span className="font-mono text-10 text-ink-3">{e.mandatoryCount} mandatory · {e.totalQuestions - e.mandatoryCount} optional · {e.totalQuestions} total</span>
                        {e.seniorApprovalRequired && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red uppercase">Senior approval required</span>}
                      </div>
                      <p className="text-11 text-ink-2 italic">{e.eddBasis}</p>
                      <div className="space-y-2">
                        {e.questions.map((q) => (
                          <div key={q.id} className={`border rounded-lg overflow-hidden ${q.mandatory ? "border-red/30" : "border-hair-2"}`}>
                            <button type="button" onClick={() => setEddExpandedQ(eddExpandedQ === q.id ? null : q.id)}
                              className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-bg-panel transition-colors">
                              <span className={`shrink-0 mt-0.5 font-mono text-9 px-1.5 py-px rounded uppercase ${q.mandatory ? "bg-red-dim text-red" : "bg-bg-2 text-ink-3"}`}>
                                {q.mandatory ? "mandatory" : "optional"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-10 font-mono text-ink-3 mb-0.5">{q.category}</div>
                                <div className="text-12 text-ink-0 leading-snug">{q.question}</div>
                              </div>
                              <span className="text-ink-3 text-11 shrink-0">{eddExpandedQ === q.id ? "▲" : "▼"}</span>
                            </button>
                            {eddExpandedQ === q.id && (
                              <div className="border-t border-hair-2 px-3 pb-3 pt-2 space-y-1.5 bg-bg-0">
                                <div className="text-10 text-ink-2"><strong className="text-ink-3">Rationale:</strong> {q.rationale}</div>
                                <div className="text-10 font-mono text-ink-3"><strong>Basis:</strong> {q.regulatoryBasis}</div>
                                {q.followUp && <div className="text-10 text-brand-deep italic">Follow-up: {q.followUp}</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {e.documentationRequired.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Documentation Required</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {e.documentationRequired.map((d, i) => <li key={i}>{d}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="flex gap-4 text-10 font-mono text-ink-3">
                        <span>Review: {e.reviewFrequency}</span>
                        <span>{e.regulatoryBasis}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TBML Trade Document Analyzer ─────────────────────────────────── */}
            {superToolsTab === "tbml" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">TBML Trade Document Analyzer</div>
                  <p className="text-11 text-ink-3 mb-3">Input trade document details (invoice, bill of lading, shipment). AI identifies over/under-invoicing, phantom shipment risk, CAHRA routing anomalies, and counterparty exposure — grounded in FATF TBML typologies and OECD CAHRA 5-step guidance.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Invoice / Document Description <span className="text-red">*</span></label>
                      <textarea value={tbmlInput.invoiceDescription} onChange={(e) => setTbmlInput((p) => ({ ...p, invoiceDescription: e.target.value }))} rows={4} placeholder="Describe the trade document — invoice number, goods described, weight/quantity, unit price, total value, payment terms, parties, any anomalies noted…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Commodity</label>
                      <input value={tbmlInput.commodity} onChange={(e) => setTbmlInput((p) => ({ ...p, commodity: e.target.value }))} placeholder="e.g. Gold bullion 999.9, silver, copper" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Declared Value</label>
                      <input value={tbmlInput.declaredValue} onChange={(e) => setTbmlInput((p) => ({ ...p, declaredValue: e.target.value }))} placeholder="e.g. USD 2,150,000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Supplier Country</label>
                      <input value={tbmlInput.supplierCountry} onChange={(e) => setTbmlInput((p) => ({ ...p, supplierCountry: e.target.value }))} placeholder="ISO-2 e.g. CD, GH, SD" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Buyer Country</label>
                      <input value={tbmlInput.buyerCountry} onChange={(e) => setTbmlInput((p) => ({ ...p, buyerCountry: e.target.value }))} placeholder="ISO-2 e.g. AE, CH, SG" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Payment Route</label>
                      <input value={tbmlInput.paymentRoute} onChange={(e) => setTbmlInput((p) => ({ ...p, paymentRoute: e.target.value }))} placeholder="e.g. Wire via Sharjah → Dubai → Geneva, SWIFT MT103" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Additional Context</label>
                      <textarea value={tbmlInput.additionalContext} onChange={(e) => setTbmlInput((p) => ({ ...p, additionalContext: e.target.value }))} rows={2} placeholder="Any other context — e.g. customer history, prior alerts, ownership chain, discrepancies noted…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runTbml()} disabled={tbmlLoading || !tbmlInput.invoiceDescription.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {tbmlLoading ? "Analyzing…" : "Analyze for TBML Risk"}
                </button>
                {tbmlResult && (() => {
                  const tb = tbmlResult;
                  const riskCls = tb.tbmlRisk === "critical" ? "bg-red text-white" : tb.tbmlRisk === "high" ? "bg-red-dim text-red" : tb.tbmlRisk === "medium" ? "bg-amber-dim text-amber" : tb.tbmlRisk === "low" ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  const actionCls = (tb.recommendedAction === "block" || tb.recommendedAction === "file_str") ? "bg-red text-white" : (tb.recommendedAction === "escalate_mlro") ? "bg-red-dim text-red" : (tb.recommendedAction === "enhanced_dd" || tb.recommendedAction === "request_docs") ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const subRisk = (r: string) => r === "high" ? "text-red font-semibold" : r === "medium" ? "text-amber font-semibold" : r === "low" ? "text-ink-2" : "text-green";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls}`}>{tb.tbmlRisk} TBML risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actionCls}`}>{tb.recommendedAction.replace(/_/g, " ")}</span>
                      </div>
                      <div>
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Typology</div>
                        <div className="text-12 font-semibold text-ink-0">{tb.tbmlTypology}</div>
                        <div className="text-10 font-mono text-ink-3">{tb.tbmlTypologyRef}</div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                          { label: "Over-invoicing", val: tb.overInvoicingRisk },
                          { label: "Under-invoicing", val: tb.underInvoicingRisk },
                          { label: "Phantom shipment", val: tb.phantomShipmentRisk },
                          { label: "Multi-invoicing", val: tb.multipleInvoicingRisk },
                        ].map(({ label, val }) => (
                          <div key={label} className="border border-hair-2 rounded p-2 bg-bg-0">
                            <div className="text-9 uppercase tracking-wide-3 text-ink-3 mb-1">{label}</div>
                            <div className={`text-12 font-semibold uppercase ${subRisk(val)}`}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{tb.actionRationale}</p>
                      {tb.indicators.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">TBML Indicators ({tb.indicators.length})</div>
                          <div className="space-y-1.5">
                            {tb.indicators.map((ind, i) => {
                              const sevCls = ind.severity === "critical" ? "bg-red text-white" : ind.severity === "high" ? "bg-red-dim text-red" : ind.severity === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                              const catCls = "bg-brand-dim text-brand-deep";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-2.5 bg-bg-0 flex items-start gap-2">
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${sevCls}`}>{ind.severity}</span>
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${catCls}`}>{ind.category}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-11 font-medium text-ink-0">{ind.indicator}</div>
                                    <div className="text-10 text-ink-2 mt-0.5">{ind.detail}</div>
                                    <div className="text-10 font-mono text-ink-3">{ind.fatfRef}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {tb.documentationGaps.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-amber mb-1">Documentation Gaps</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">
                            {tb.documentationGaps.map((d, i) => <li key={i}>{d}</li>)}
                          </ul>
                        </div>
                      )}
                      {tb.investigativeSteps.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Investigative Steps</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {tb.investigativeSteps.map((s, i) => <li key={i}>{s}</li>)}
                          </ol>
                        </div>
                      )}
                      <div className="flex gap-3 text-10 font-mono text-ink-3 flex-wrap">
                        <span>{tb.oecdStep}</span>
                        <span>{tb.regulatoryBasis}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── STR Narrative Drafter ─────────────────────────────────────────── */}
            {superToolsTab === "str-narrative" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">STR Narrative Drafter</div>
                  <p className="text-11 text-ink-3 mb-3">Input key case facts. AI drafts a complete, goAML-ready STR narrative covering all FATF R.20 mandatory elements: WHO / WHAT / WHEN / WHERE / WHY. Includes quality score and missing element check before you file.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Name <span className="text-red">*</span></label>
                      <input value={strNarrInput.subjectName} onChange={(e) => setStrNarrInput((p) => ({ ...p, subjectName: e.target.value }))} placeholder="Full legal name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Type</label>
                      <input value={strNarrInput.subjectType} onChange={(e) => setStrNarrInput((p) => ({ ...p, subjectType: e.target.value }))} placeholder="e.g. Individual, LLC, DPMS dealer" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Nationality / Jurisdiction</label>
                      <input value={strNarrInput.subjectNationality} onChange={(e) => setStrNarrInput((p) => ({ ...p, subjectNationality: e.target.value }))} placeholder="e.g. UAE national, Nigerian entity" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Jurisdiction</label>
                      <input value={strNarrInput.jurisdiction} onChange={(e) => setStrNarrInput((p) => ({ ...p, jurisdiction: e.target.value }))} placeholder="Countries involved" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Activity Description <span className="text-red">*</span></label>
                      <textarea value={strNarrInput.activityDescription} onChange={(e) => setStrNarrInput((p) => ({ ...p, activityDescription: e.target.value }))} rows={3} placeholder="Describe the suspicious activity — transaction pattern, behaviour, what triggered the alert…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Amounts</label>
                      <input value={strNarrInput.amounts} onChange={(e) => setStrNarrInput((p) => ({ ...p, amounts: e.target.value }))} placeholder="e.g. AED 638,000 across 12 txns" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Key Dates</label>
                      <input value={strNarrInput.dates} onChange={(e) => setStrNarrInput((p) => ({ ...p, dates: e.target.value }))} placeholder="e.g. 01/03/2026 – 14/03/2026" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Counterparty</label>
                      <input value={strNarrInput.counterparty} onChange={(e) => setStrNarrInput((p) => ({ ...p, counterparty: e.target.value }))} placeholder="Name and country" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Actions Taken</label>
                      <input value={strNarrInput.actionsTaken} onChange={(e) => setStrNarrInput((p) => ({ ...p, actionsTaken: e.target.value }))} placeholder="EDD requested, freeze considered…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Red Flags (one per line)</label>
                      <textarea value={strNarrInput.redFlags} onChange={(e) => setStrNarrInput((p) => ({ ...p, redFlags: e.target.value }))} rows={3} placeholder={"Structuring below AED 55,000 threshold\nCross-border wire to CAHRA jurisdiction\nNo source of funds documentation"} className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Additional Facts</label>
                      <input value={strNarrInput.additionalFacts} onChange={(e) => setStrNarrInput((p) => ({ ...p, additionalFacts: e.target.value }))} placeholder="Any other relevant context" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runStrNarrative()} disabled={strNarrLoading || !strNarrInput.subjectName.trim() || !strNarrInput.activityDescription.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {strNarrLoading ? "Drafting…" : "Draft STR Narrative"}
                </button>
                {strNarrResult && (() => {
                  const s = strNarrResult;
                  const qScore = s.qualityScore;
                  const qCls = qScore >= 80 ? "bg-green-dim text-green" : qScore >= 55 ? "bg-amber-dim text-amber" : "bg-red-dim text-red";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded font-bold ${qCls}`}>Quality {qScore}/100</span>
                        <span className="font-mono text-10 text-ink-3">{s.wordCount} words</span>
                        <span className="font-mono text-10 px-2 py-px rounded bg-brand-dim text-brand-deep">{s.goAmlFields.suspiciousActivityType}</span>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(s.narrative)} className="ml-auto text-10 font-mono text-brand hover:text-brand-deep border border-brand/30 px-2 py-px rounded">Copy</button>
                      </div>
                      <div className="bg-bg-0 rounded-lg p-4 border border-hair-2">
                        <pre className="text-11 text-ink-0 whitespace-pre-wrap leading-relaxed font-mono">{s.narrative}</pre>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {s.fatfR20Coverage.length > 0 && (
                          <div>
                            <div className="text-10 uppercase tracking-wide-3 text-green mb-1">FATF R.20 Coverage</div>
                            <ul className="text-10 text-ink-1 space-y-0.5 list-disc list-inside">
                              {s.fatfR20Coverage.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                          </div>
                        )}
                        {s.missingElements.length > 0 && (
                          <div>
                            <div className="text-10 uppercase tracking-wide-3 text-amber mb-1">Add Before Filing</div>
                            <ul className="text-10 text-ink-1 space-y-0.5 list-disc list-inside">
                              {s.missingElements.map((m, i) => <li key={i}>{m}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-10 font-mono text-ink-3">
                        <span>Filing: {s.goAmlFields.filingBasis}</span>
                        <span>Deadline: {s.goAmlFields.deadlineDate}</span>
                      </div>
                      <div className="text-10 font-mono text-ink-3">{s.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Wire Transfer R.16 Checker ────────────────────────────────────── */}
            {superToolsTab === "wire-r16" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">Wire Transfer R.16 Checker</div>
                  <p className="text-11 text-ink-3 mb-3">Input originator and beneficiary details from a wire transfer. AI determines FATF R.16 compliance — whether mandatory information is present, what's missing, and whether to STP, hold, return, or freeze and report.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3 text-10 font-semibold uppercase tracking-wide-3 text-ink-2 pt-1">Originator</div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Name</label>
                      <input value={wireInput.originatorName} onChange={(e) => setWireInput((p) => ({ ...p, originatorName: e.target.value }))} placeholder="Full legal name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Account / IBAN</label>
                      <input value={wireInput.originatorAccount} onChange={(e) => setWireInput((p) => ({ ...p, originatorAccount: e.target.value }))} placeholder="Account number or IBAN" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Country (ISO-2)</label>
                      <input value={wireInput.originatorCountry} onChange={(e) => setWireInput((p) => ({ ...p, originatorCountry: e.target.value }))} placeholder="e.g. AE, NG" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Address</label>
                      <input value={wireInput.originatorAddress} onChange={(e) => setWireInput((p) => ({ ...p, originatorAddress: e.target.value }))} placeholder="Street address or city/country" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">National ID / Passport</label>
                      <input value={wireInput.originatorId} onChange={(e) => setWireInput((p) => ({ ...p, originatorId: e.target.value }))} placeholder="ID or passport number" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-3 text-10 font-semibold uppercase tracking-wide-3 text-ink-2 pt-2 border-t border-hair-2">Beneficiary</div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Name</label>
                      <input value={wireInput.beneficiaryName} onChange={(e) => setWireInput((p) => ({ ...p, beneficiaryName: e.target.value }))} placeholder="Full legal name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Account / IBAN</label>
                      <input value={wireInput.beneficiaryAccount} onChange={(e) => setWireInput((p) => ({ ...p, beneficiaryAccount: e.target.value }))} placeholder="Account number or IBAN" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Country (ISO-2)</label>
                      <input value={wireInput.beneficiaryCountry} onChange={(e) => setWireInput((p) => ({ ...p, beneficiaryCountry: e.target.value }))} placeholder="e.g. CH, GB" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-3 text-10 font-semibold uppercase tracking-wide-3 text-ink-2 pt-2 border-t border-hair-2">Transaction</div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Amount</label>
                      <input value={wireInput.amount} onChange={(e) => setWireInput((p) => ({ ...p, amount: e.target.value }))} placeholder="e.g. 250,000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Currency</label>
                      <input value={wireInput.currency} onChange={(e) => setWireInput((p) => ({ ...p, currency: e.target.value }))} placeholder="AED / USD / EUR" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">SWIFT Reference</label>
                      <input value={wireInput.swiftRef} onChange={(e) => setWireInput((p) => ({ ...p, swiftRef: e.target.value }))} placeholder="MT103 reference" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-10 text-ink-3 mb-1">Purpose of Payment</label>
                      <input value={wireInput.purpose} onChange={(e) => setWireInput((p) => ({ ...p, purpose: e.target.value }))} placeholder="e.g. Gold bullion purchase, trade invoice settlement" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runWireR16()} disabled={wireLoading}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {wireLoading ? "Checking…" : "Check R.16 Compliance"}
                </button>
                {wireResult && (() => {
                  const w = wireResult;
                  const verdictCfg = {
                    stp: { cls: "bg-green text-white", label: "STP — Straight Through Processing" },
                    hold_and_request: { cls: "bg-amber-dim text-amber border border-amber/40", label: "Hold & Request Missing Information" },
                    return_to_sender: { cls: "bg-red-dim text-red border border-red/40", label: "Return to Sender" },
                    freeze_and_report: { cls: "bg-red text-white", label: "Freeze & File STR" },
                  };
                  const vc = verdictCfg[w.verdict];
                  const complianceCls = w.complianceLevel === "fully_compliant" ? "bg-green-dim text-green" : w.complianceLevel === "partially_compliant" ? "bg-amber-dim text-amber" : "bg-red-dim text-red";
                  const checkIcon = (v: boolean) => v ? <span className="text-green font-bold">✓</span> : <span className="text-red font-bold">✗</span>;
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-11 px-3 py-1 rounded font-bold ${vc.cls}`}>{vc.label}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${complianceCls}`}>{w.complianceLevel.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{w.verdictRationale}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="border border-hair-2 rounded p-3 bg-bg-0">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-2 mb-2 font-semibold">Originator Fields</div>
                          <div className="space-y-1 text-11">
                            <div className="flex items-center gap-2">{checkIcon(w.originatorCheck.namePresent)} <span>Name</span></div>
                            <div className="flex items-center gap-2">{checkIcon(w.originatorCheck.accountPresent)} <span>Account number</span></div>
                            <div className="flex items-center gap-2">{checkIcon(w.originatorCheck.addressOrIdPresent)} <span>Address or national ID</span></div>
                          </div>
                          {w.originatorCheck.missing.length > 0 && <div className="mt-2 text-10 text-red">{w.originatorCheck.missing.join(", ")}</div>}
                        </div>
                        <div className="border border-hair-2 rounded p-3 bg-bg-0">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-2 mb-2 font-semibold">Beneficiary Fields</div>
                          <div className="space-y-1 text-11">
                            <div className="flex items-center gap-2">{checkIcon(w.beneficiaryCheck.namePresent)} <span>Name</span></div>
                            <div className="flex items-center gap-2">{checkIcon(w.beneficiaryCheck.accountPresent)} <span>Account number</span></div>
                          </div>
                          {w.beneficiaryCheck.missing.length > 0 && <div className="mt-2 text-10 text-red">{w.beneficiaryCheck.missing.join(", ")}</div>}
                        </div>
                      </div>
                      <div className="text-11 text-ink-2">{w.thresholdAnalysis}</div>
                      {w.requiredActions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {w.requiredActions.map((a, i) => <li key={i}>{a}</li>)}
                          </ol>
                        </div>
                      )}
                      <div className="flex gap-4 text-10 font-mono text-ink-3 flex-wrap">
                        <span>Time limit: {w.timeLimit}</span>
                        <span>{w.regulatoryBasis}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Proliferation Financing Screener ─────────────────────────────── */}
            {superToolsTab === "pf-screener" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">Proliferation Financing Screener</div>
                  <p className="text-11 text-ink-3 mb-3">Dedicated PF risk assessment beyond standard sanctions screening. Evaluates DPRK nexus (UNSCR 1718/2375), Iran nexus (UNSCR 2231), dual-use goods, and proliferator network exposure. Mandatory freeze obligations flagged automatically.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject <span className="text-red">*</span></label>
                      <input value={pfInput.subject} onChange={(e) => setPfInput((p) => ({ ...p, subject: e.target.value }))} placeholder="Person or entity name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Country</label>
                      <input value={pfInput.subjectCountry} onChange={(e) => setPfInput((p) => ({ ...p, subjectCountry: e.target.value }))} placeholder="ISO-2" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Counterparty</label>
                      <input value={pfInput.counterparty} onChange={(e) => setPfInput((p) => ({ ...p, counterparty: e.target.value }))} placeholder="Name of counterparty" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Counterparty Country</label>
                      <input value={pfInput.counterpartyCountry} onChange={(e) => setPfInput((p) => ({ ...p, counterpartyCountry: e.target.value }))} placeholder="ISO-2" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Goods / Services</label>
                      <input value={pfInput.goods} onChange={(e) => setPfInput((p) => ({ ...p, goods: e.target.value }))} placeholder="e.g. gold, industrial chemicals, electronics" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Transaction Type</label>
                      <input value={pfInput.transactionType} onChange={(e) => setPfInput((p) => ({ ...p, transactionType: e.target.value }))} placeholder="Wire, trade finance, crypto" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Amount</label>
                      <input value={pfInput.amount} onChange={(e) => setPfInput((p) => ({ ...p, amount: e.target.value }))} placeholder="e.g. USD 4,200,000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Additional Context</label>
                      <textarea value={pfInput.context} onChange={(e) => setPfInput((p) => ({ ...p, context: e.target.value }))} rows={2} placeholder="Ownership chain, shipping routes, intermediaries, prior intelligence…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runPfScreener()} disabled={pfLoading || !pfInput.subject.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {pfLoading ? "Screening…" : "Screen for Proliferation Financing Risk"}
                </button>
                {pfResult && (() => {
                  const pf = pfResult;
                  const riskCls = pf.pfRisk === "critical" ? "bg-red text-white" : pf.pfRisk === "high" ? "bg-red-dim text-red" : pf.pfRisk === "medium" ? "bg-amber-dim text-amber" : pf.pfRisk === "low" ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  const nexusCls = (v: string) => v === "confirmed" ? "bg-red text-white" : v === "possible" ? "bg-red-dim text-red" : v === "unlikely" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const actionCls = (pf.recommendedAction === "freeze_and_report") ? "bg-red text-white" : (pf.recommendedAction === "escalate_mlro") ? "bg-red-dim text-red" : (pf.recommendedAction === "enhanced_dd") ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls}`}>{pf.pfRisk} PF risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actionCls}`}>{pf.recommendedAction.replace(/_/g, " ")}</span>
                        {pf.mandatoryFreezeRequired && <span className="font-mono text-10 px-2 py-px rounded bg-red text-white uppercase font-bold animate-pulse">MANDATORY FREEZE</span>}
                      </div>
                      {pf.mandatoryFreezeRequired && pf.freezeBasis && (
                        <div className="rounded p-3 bg-red border-red text-white text-11 font-semibold">
                          IMMEDIATE ACTION REQUIRED: Asset freeze mandatory under {pf.freezeBasis}. Do not process. Notify senior management and MLRO immediately.
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "DPRK Nexus", val: pf.dprkNexus },
                          { label: "Iran Nexus", val: pf.iranNexus },
                          { label: "Dual-Use Risk", val: pf.dualUseRisk },
                        ].map(({ label, val }) => (
                          <div key={label} className="border border-hair-2 rounded p-2 text-center bg-bg-0">
                            <div className="text-9 uppercase tracking-wide-3 text-ink-3 mb-1">{label}</div>
                            <span className={`font-mono text-10 px-2 py-px rounded uppercase font-semibold ${nexusCls(val)}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{pf.actionRationale}</p>
                      {pf.risks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">PF Risk Indicators</div>
                          <div className="space-y-2">
                            {pf.risks.map((r, i) => {
                              const sevCls = r.severity === "critical" ? "bg-red text-white" : r.severity === "high" ? "bg-red-dim text-red" : r.severity === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                              const catCls = "bg-brand-dim text-brand-deep";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-2.5 bg-bg-0 flex items-start gap-2">
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${sevCls}`}>{r.severity}</span>
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${catCls}`}>{r.category.replace(/_/g, " ")}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-11 font-medium text-ink-0">{r.description}</div>
                                    <div className="text-10 text-ink-2 mt-0.5">{r.detail}</div>
                                    {r.unscr && <div className="text-10 font-mono text-ink-3">{r.unscr}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {pf.applicableUnscrs.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Applicable UNSCRs</div>
                          <div className="flex flex-wrap gap-1.5">
                            {pf.applicableUnscrs.map((u, i) => <span key={i} className="font-mono text-10 px-2 py-px rounded bg-violet-dim text-violet border border-violet/30">{u}</span>)}
                          </div>
                        </div>
                      )}
                      {pf.requiredChecks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Checks</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {pf.requiredChecks.map((c, i) => <li key={i}>{c}</li>)}
                          </ol>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{pf.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── MLRO Decision Memo ───────────────────────────────────────────── */}
            {superToolsTab === "mlro-memo" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">MLRO Decision Memo Generator</div>
                  <p className="text-11 text-ink-3 mb-3">Generate a formal, regulator-grade MLRO Decision Memorandum for your audit trail. Structured for MoE / CBUAE / FIU inspection — includes subject identification, facts, red flags, investigation record, legal analysis, and sign-off block.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Name <span className="text-red">*</span></label>
                      <input value={memoInput.subjectName} onChange={(e) => setMemoInput((p) => ({ ...p, subjectName: e.target.value }))} placeholder="Full legal name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Type</label>
                      <input value={memoInput.subjectType} onChange={(e) => setMemoInput((p) => ({ ...p, subjectType: e.target.value }))} placeholder="Individual / LLC / Foreign entity" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Case Reference</label>
                      <input value={memoInput.caseRef} onChange={(e) => setMemoInput((p) => ({ ...p, caseRef: e.target.value }))} placeholder="e.g. TM-2026-0042" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">MLRO Name</label>
                      <input value={memoInput.mlroName} onChange={(e) => setMemoInput((p) => ({ ...p, mlroName: e.target.value }))} placeholder="Your name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Activity Summary <span className="text-red">*</span></label>
                      <textarea value={memoInput.activitySummary} onChange={(e) => setMemoInput((p) => ({ ...p, activitySummary: e.target.value }))} rows={3} placeholder="Describe the suspicious activity — transactions, pattern, timeline, counterparties, amounts…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Red Flags (one per line)</label>
                      <textarea value={memoInput.redFlags} onChange={(e) => setMemoInput((p) => ({ ...p, redFlags: e.target.value }))} rows={3} placeholder={"Structuring below threshold\nCross-border wire with no business purpose\nCustomer refused to provide SOF documentation"} className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Investigation Steps Taken</label>
                      <textarea value={memoInput.investigationSteps} onChange={(e) => setMemoInput((p) => ({ ...p, investigationSteps: e.target.value }))} rows={2} placeholder="e.g. EDD questionnaire sent on 01/04, customer did not respond; sanctions screens run on 02/04 — no matches; alert escalated to MLRO 03/04…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Proposed Decision</label>
                      <input value={memoInput.proposedDecision} onChange={(e) => setMemoInput((p) => ({ ...p, proposedDecision: e.target.value }))} placeholder="File STR / Enhance CDD / Close…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Date</label>
                      <input value={memoInput.date} onChange={(e) => setMemoInput((p) => ({ ...p, date: e.target.value }))} placeholder="dd/mm/yyyy" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runMlroMemo()} disabled={memoLoading || !memoInput.subjectName.trim() || !memoInput.activitySummary.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {memoLoading ? "Drafting Memo…" : "Generate MLRO Decision Memo"}
                </button>
                {memoResult && (() => {
                  const m = memoResult;
                  const riskCls = m.riskRating === "critical" ? "bg-red text-white" : m.riskRating === "high" ? "bg-red-dim text-red" : m.riskRating === "medium" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand";
                  const decisionCls = (m.decision === "file_str" || m.decision === "escalate_senior") ? "bg-red text-white" : m.decision === "enhanced_cdd" ? "bg-amber-dim text-amber" : m.decision === "monitor_and_review" ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  const qScore = m.qualityScore;
                  const qCls = qScore >= 80 ? "bg-green-dim text-green" : qScore >= 55 ? "bg-amber-dim text-amber" : "bg-red-dim text-red";
                  const auditPassed = Object.values(m.auditElements).filter(Boolean).length;
                  const auditTotal = Object.values(m.auditElements).length;
                  return (
                    <div className="space-y-4 border border-hair-2 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-10 text-ink-3">{m.memoRef}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls}`}>{m.riskRating} risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${decisionCls}`}>{m.decision.replace(/_/g, " ")}</span>
                        <span className={`font-mono text-10 px-2 py-px rounded ${qCls}`}>Quality {qScore}/100</span>
                        <span className="font-mono text-10 text-ink-3">Audit elements: {auditPassed}/{auditTotal}</span>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(m.memo)} className="ml-auto text-10 font-mono text-brand hover:text-brand-deep border border-brand/30 px-2 py-px rounded">Copy</button>
                      </div>
                      <div className="bg-bg-0 rounded-lg p-4 border border-hair-2">
                        <pre className="text-11 text-ink-0 whitespace-pre-wrap leading-relaxed font-mono">{m.memo}</pre>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-10">
                        {Object.entries(m.auditElements).map(([k, v]) => (
                          <div key={k} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${v ? "border-green/30 bg-green-dim text-green" : "border-red/30 bg-red-dim text-red"}`}>
                            <span className="font-bold">{v ? "✓" : "✗"}</span>
                            <span className="font-mono">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-10 font-mono text-ink-3">{m.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Terrorism Financing Screener ──────────────────────────────────── */}
            {superToolsTab === "tf-screener" && (
              <div className="space-y-4">
                <div>
                  <div className="text-12 font-semibold text-ink-0 mb-1">Terrorism Financing Screener</div>
                  <p className="text-11 text-ink-3 mb-3">
                    <strong className="text-red">Distinct from PF Screener</strong> — this tool focuses on terrorist organisations, foreign fighters, and TF typologies (hawala, NPO abuse, crypto-TF, crowdfunding). Covers FATF R.5/R.6/R.8/R.14, UNSCR 1267/1373/2178, UAE CTF Law No. 7/2014. <strong>No monetary threshold applies to TF — suspicion alone triggers reporting.</strong>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject <span className="text-red">*</span></label>
                      <input value={tfInput.subject} onChange={(e) => setTfInput((p) => ({ ...p, subject: e.target.value }))} placeholder="Person or entity name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Subject Country</label>
                      <input value={tfInput.subjectCountry} onChange={(e) => setTfInput((p) => ({ ...p, subjectCountry: e.target.value }))} placeholder="ISO-2" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Counterparty</label>
                      <input value={tfInput.counterparty} onChange={(e) => setTfInput((p) => ({ ...p, counterparty: e.target.value }))} placeholder="Beneficiary or payee" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Counterparty Country</label>
                      <input value={tfInput.counterpartyCountry} onChange={(e) => setTfInput((p) => ({ ...p, counterpartyCountry: e.target.value }))} placeholder="ISO-2 — especially conflict zones" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Destination Jurisdiction</label>
                      <input value={tfInput.destinationJurisdiction} onChange={(e) => setTfInput((p) => ({ ...p, destinationJurisdiction: e.target.value }))} placeholder="e.g. SY, IQ, YE, AF, ML, SO" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Transaction Type</label>
                      <input value={tfInput.transactionType} onChange={(e) => setTfInput((p) => ({ ...p, transactionType: e.target.value }))} placeholder="Hawala, wire, crypto, cash, gold" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Amount</label>
                      <input value={tfInput.amount} onChange={(e) => setTfInput((p) => ({ ...p, amount: e.target.value }))} placeholder="e.g. USD 1,200 (TF often small)" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Customer Type</label>
                      <input value={tfInput.customerType} onChange={(e) => setTfInput((p) => ({ ...p, customerType: e.target.value }))} placeholder="e.g. Individual, NPO/charity, gold trader" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-1">Goods / Purpose</label>
                      <input value={tfInput.goods} onChange={(e) => setTfInput((p) => ({ ...p, goods: e.target.value }))} placeholder="e.g. charitable donation, gold purchase, living expenses" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Existing Red Flags (one per line)</label>
                      <textarea value={tfInput.existingRedFlags} onChange={(e) => setTfInput((p) => ({ ...p, existingRedFlags: e.target.value }))} rows={2} placeholder={"Customer travelled to Syria recently\nTransfers match foreign fighter financing pattern\nAssociated with NPO flagged on social media"} className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-10 text-ink-3 mb-1">Additional Context</label>
                      <textarea value={tfInput.context} onChange={(e) => setTfInput((p) => ({ ...p, context: e.target.value }))} rows={2} placeholder="Social media associations, travel history, prior STRs, network links…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runTfScreener()} disabled={tfLoading || !tfInput.subject.trim()}
                  className="text-11 font-semibold px-4 py-2 rounded bg-red text-white hover:bg-red/90 disabled:opacity-40">
                  {tfLoading ? "Screening…" : "Screen for Terrorism Financing Risk"}
                </button>
                {tfResult && (() => {
                  const tf = tfResult;
                  const riskCls = tf.tfRisk === "critical" ? "bg-red text-white" : tf.tfRisk === "high" ? "bg-red-dim text-red" : tf.tfRisk === "medium" ? "bg-amber-dim text-amber" : tf.tfRisk === "low" ? "bg-brand-dim text-brand" : "bg-green-dim text-green";
                  const actionCls = (tf.recommendedAction === "freeze_and_report_immediately" || tf.recommendedAction === "file_str") ? "bg-red text-white" : (tf.recommendedAction === "escalate_mlro") ? "bg-red-dim text-red" : (tf.recommendedAction === "enhanced_dd") ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const nexusCls = (v: string) => v === "confirmed" ? "bg-red text-white" : v === "possible" ? "bg-red-dim text-red" : v === "unlikely" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const riskLvlCls = (v: string) => v === "high" ? "text-red font-semibold" : v === "medium" ? "text-amber font-semibold" : v === "low" ? "text-ink-2" : v === "clear" || v === "none" ? "text-green" : "text-ink-3";
                  const typoCls: Record<string, string> = { structured_transfers: "bg-red-dim text-red", npo_abuse: "bg-violet-dim text-violet", hawala_ivts: "bg-amber-dim text-amber", crypto_tf: "bg-brand-dim text-brand", crowdfunding: "bg-violet-dim text-violet", foreign_fighter: "bg-red-dim text-red", lone_actor: "bg-red text-white", cash_courier: "bg-amber-dim text-amber", trade_based: "bg-amber-dim text-amber", other: "bg-bg-2 text-ink-2" };
                  return (
                    <div className="space-y-4 border border-red/30 rounded-lg p-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls}`}>{tf.tfRisk} TF risk</span>
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actionCls}`}>{tf.recommendedAction.replace(/_/g, " ")}</span>
                        {tf.mandatoryFreeze && <span className="font-mono text-10 px-2 py-px rounded bg-red text-white uppercase font-bold animate-pulse">IMMEDIATE FREEZE</span>}
                        {tf.designatedEntityHit && <span className="font-mono text-10 px-2 py-px rounded bg-red text-white uppercase font-bold">DESIGNATED ENTITY HIT</span>}
                        {tf.unscr1267Hit && <span className="font-mono text-10 px-2 py-px rounded bg-red text-white uppercase font-bold">UNSCR 1267</span>}
                      </div>
                      {tf.mandatoryFreeze && (
                        <div className="rounded p-3 bg-red text-white text-12 font-semibold">
                          IMMEDIATE ACTION — FREEZE REQUIRED: {tf.freezeBasis}. {tf.freezeTimeline}. Do not process any transaction. Notify MLRO and senior management immediately. No court order required.
                        </div>
                      )}
                      <div>
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Primary TF Typology</div>
                        <div className="text-12 font-semibold text-ink-0">{tf.primaryTypology}</div>
                        <div className="text-10 font-mono text-ink-3">{tf.primaryTypologyRef}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "UNSCR 1373 Nexus", val: tf.unscr1373Nexus },
                          { label: "NPO Abuse Risk", val: tf.npOAbuseRisk },
                          { label: "Hawala Nexus", val: tf.hawalaNexus },
                        ].map(({ label, val }) => (
                          <div key={label} className="border border-hair-2 rounded p-2 text-center bg-bg-0">
                            <div className="text-9 uppercase tracking-wide-3 text-ink-3 mb-1">{label}</div>
                            <span className={`font-mono text-10 px-2 py-px rounded uppercase font-semibold ${nexusCls(val)}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{tf.actionRationale}</p>
                      {tf.indicators.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">TF Indicators ({tf.indicators.length})</div>
                          <div className="space-y-2">
                            {tf.indicators.map((ind, i) => {
                              const sevCls = ind.severity === "critical" ? "bg-red text-white" : ind.severity === "high" ? "bg-red-dim text-red" : ind.severity === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                              return (
                                <div key={i} className="border border-hair-2 rounded p-2.5 bg-bg-0 flex items-start gap-2">
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${sevCls}`}>{ind.severity}</span>
                                  <span className={`font-mono text-9 px-1.5 py-px rounded uppercase shrink-0 mt-0.5 ${typoCls[ind.typology] ?? "bg-bg-2 text-ink-2"}`}>{ind.typology.replace(/_/g, " ")}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-11 font-medium text-ink-0">{ind.indicator}</div>
                                    <div className="text-10 text-ink-2 mt-0.5">{ind.detail}</div>
                                    <div className="text-10 font-mono text-ink-3">{ind.fatfRef}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {tf.ctfObligations.length > 0 && (
                        <div className="rounded p-3 border border-red/30 bg-red-dim">
                          <div className="text-10 uppercase tracking-wide-3 text-red mb-2 font-semibold">UAE CTF Obligations Triggered</div>
                          <ul className="text-11 text-ink-0 space-y-1 list-disc list-inside">
                            {tf.ctfObligations.map((o, i) => <li key={i}>{o}</li>)}
                          </ul>
                        </div>
                      )}
                      {tf.requiredActions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {tf.requiredActions.map((a, i) => <li key={i}>{a}</li>)}
                          </ol>
                        </div>
                      )}
                      {tf.applicableRegime.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tf.applicableRegime.map((r, i) => <span key={i} className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red border border-red/30">{r}</span>)}
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{tf.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Shell Company Detector */}
            {superToolsTab === "shell-detector" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Shell Company Detector — FATF R.24 · UBO Transparency</div>
                <p className="text-11 text-ink-3">Input a corporate structure and detect shell company red flags: nominee directors, secrecy jurisdictions, layering, bearer shares, and no legitimate business purpose.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Entity Name *</label><input value={shellInput.entityName} onChange={(e) => setShellInput((p) => ({...p, entityName: e.target.value}))} placeholder="Company name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Jurisdiction of Incorporation</label><input value={shellInput.jurisdictionOfIncorporation} onChange={(e) => setShellInput((p) => ({...p, jurisdictionOfIncorporation: e.target.value}))} placeholder="e.g. BVI, Cayman, UAE, UK" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Director Names</label><input value={shellInput.directorNames} onChange={(e) => setShellInput((p) => ({...p, directorNames: e.target.value}))} placeholder="Comma-separated director names" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Shareholder Structure</label><input value={shellInput.shareholderStructure} onChange={(e) => setShellInput((p) => ({...p, shareholderStructure: e.target.value}))} placeholder="e.g. 100% held by Belize holding co" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Declared Business Activity</label><input value={shellInput.businessActivity} onChange={(e) => setShellInput((p) => ({...p, businessActivity: e.target.value}))} placeholder="e.g. trading, consulting" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Years Active / Incorporated</label><input value={shellInput.yearsActive} onChange={(e) => setShellInput((p) => ({...p, yearsActive: e.target.value}))} placeholder="e.g. 2 years" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Banking Arrangements</label><input value={shellInput.bankingArrangements} onChange={(e) => setShellInput((p) => ({...p, bankingArrangements: e.target.value}))} placeholder="e.g. account in Singapore, multiple banks" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={shellInput.context} onChange={(e) => setShellInput((p) => ({...p, context: e.target.value}))} placeholder="Anything unusual about the structure" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runShellDetector()} disabled={shellLoading || !shellInput.entityName.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {shellLoading ? "Analysing structure…" : "Detect Shell Indicators"}
                </button>
                {shellResult && (() => {
                  const s = shellResult;
                  const riskCls = s.shellRisk === "critical" ? "bg-red text-white" : s.shellRisk === "high" ? "bg-red-dim text-red" : s.shellRisk === "medium" ? "bg-amber-dim text-amber" : s.shellRisk === "low" ? "bg-brand-dim text-brand-deep" : "bg-green-dim text-green";
                  const actCls = s.recommendedAction === "reject" ? "bg-red text-white" : s.recommendedAction === "escalate_mlro" ? "bg-red-dim text-red" : s.recommendedAction === "enhanced_dd" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand-deep";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{s.shellRisk} shell risk</span>
                        <span className={`font-mono text-11 px-2 py-px rounded uppercase ${actCls}`}>{s.recommendedAction.replace(/_/g, " ")}</span>
                        <span className="font-mono text-11 text-ink-2">{s.shellProbability}% shell probability</span>
                      </div>
                      {s.structureIndicators.length > 0 && <div className="flex flex-wrap gap-1.5">{s.structureIndicators.map((si, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-amber-dim text-amber border border-amber/30">{si}</span>)}</div>}
                      <p className="text-12 text-ink-1 leading-relaxed">{s.actionRationale}</p>
                      {s.redFlags.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3">Red Flags ({s.redFlags.length})</div>
                          {s.redFlags.map((rf, i) => (
                            <div key={i} className="px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-10 font-mono px-1.5 py-px rounded uppercase ${rf.severity === "critical" ? "bg-red text-white" : rf.severity === "high" ? "bg-red-dim text-red" : rf.severity === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{rf.severity}</span>
                                <span className="text-10 font-mono text-ink-3 px-1.5 py-px bg-bg-2 rounded">{rf.category}</span>
                                <span className="text-10 font-mono text-ink-3">{rf.fatfRef}</span>
                              </div>
                              <div className="text-12 font-semibold text-ink-0 mb-1">{rf.flag}</div>
                              <p className="text-11 text-ink-2">{rf.detail}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {s.requiredDocumentation.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Documentation to De-Risk</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">
                            {s.requiredDocumentation.map((d, i) => <li key={i}>{d}</li>)}
                          </ol>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{s.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Adverse Media Classifier */}
            {superToolsTab === "adverse-classify" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Adverse Media Classifier — FATF R.3 · SAR Threshold</div>
                <p className="text-11 text-ink-3">Paste raw news/article text. AI maps it to FATF R.3 predicate offences, assesses SAR threshold, and identifies key entities. Works with full articles, excerpts, or translated text.</p>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Article / News Text *</label>
                  <textarea value={adverseText} onChange={(e) => setAdverseText(e.target.value)} rows={6} placeholder="Paste the full article text or relevant excerpt here…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                </div>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Subject Name (optional — improves relevance scoring)</label>
                  <input value={adverseSubject} onChange={(e) => setAdverseSubject(e.target.value)} placeholder="e.g. Mohammed Al-Rashidi, Gulf Trading LLC" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                </div>
                <button type="button" onClick={() => void runAdverseClassify()} disabled={adverseLoading || !adverseText.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {adverseLoading ? "Classifying…" : "Classify Adverse Media"}
                </button>
                {adverseResult && (() => {
                  const ar = adverseResult;
                  const riskCls = ar.adverseRisk === "critical" ? "bg-red text-white" : ar.adverseRisk === "high" ? "bg-red-dim text-red" : ar.adverseRisk === "medium" ? "bg-amber-dim text-amber" : ar.adverseRisk === "low" ? "bg-brand-dim text-brand-deep" : "bg-green-dim text-green";
                  const actCls = ar.recommendedAction === "file_str_immediately" ? "bg-red text-white" : ar.recommendedAction === "escalate_mlro" ? "bg-red-dim text-red" : ar.recommendedAction === "enhanced_monitoring" ? "bg-amber-dim text-amber" : "bg-brand-dim text-brand-deep";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{ar.adverseRisk} risk</span>
                        {ar.sarThresholdMet && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">SAR THRESHOLD MET</span>}
                        <span className={`font-mono text-10 px-2 py-px rounded uppercase ${actCls}`}>{ar.recommendedAction.replace(/_/g, " ")}</span>
                        <span className="text-10 font-mono text-ink-3">{ar.mediaCredibility} credibility · {ar.temporalRelevance}</span>
                      </div>
                      {ar.sarThresholdMet && <p className="text-12 text-ink-1 border-l-2 border-red/50 pl-3">{ar.sarBasis}</p>}
                      {ar.predicateOffences.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3">FATF R.3 Predicate Offences</div>
                          {ar.predicateOffences.map((po, i) => (
                            <div key={i} className="px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-10 font-mono px-1.5 py-px rounded uppercase ${po.severity === "critical" ? "bg-red text-white" : po.severity === "high" ? "bg-red-dim text-red" : po.severity === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{po.severity}</span>
                                <span className="text-11 font-semibold text-ink-0">{po.offence}</span>
                                <span className="text-10 font-mono text-ink-3">FATF: {po.fatfPredicate}</span>
                              </div>
                              <div className="text-10 font-mono text-ink-3 mb-1">{po.uaeLegalBasis}</div>
                              <p className="text-11 text-ink-2">{po.detail}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {ar.fatfR3Predicates.length > 0 && <div className="flex flex-wrap gap-1.5">{ar.fatfR3Predicates.map((p, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-amber-dim text-amber">{p}</span>)}</div>}
                      {ar.corroborationRequired.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Corroboration Required Before STR</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">{ar.corroborationRequired.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        </div>
                      )}
                      <p className="text-12 text-ink-1 italic">{ar.actionRationale}</p>
                      <div className="text-10 font-mono text-ink-3">{ar.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Case Timeline Builder */}
            {superToolsTab === "case-timeline" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Case Timeline Builder — goAML STR Narrative · Suspicion Crystallisation</div>
                <p className="text-11 text-ink-3">Input raw case notes, dates, and events in any order. AI structures them chronologically, identifies when suspicion crystallised (FATF R.20), calculates the STR deadline (FDL 10/2025 Art.26), and generates a goAML-ready narrative block.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={timelineSubject} onChange={(e) => setTimelineSubject(e.target.value)} placeholder="Subject / account holder" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Case / Account Reference</label><input value={timelineCaseRef} onChange={(e) => setTimelineCaseRef(e.target.value)} placeholder="e.g. CAS-2024-0041" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Case Events / Notes * (dates + what happened, any format)</label>
                  <textarea value={timelineEvents} onChange={(e) => setTimelineEvents(e.target.value)} rows={8} placeholder={"01/01/2024 – first cash deposit AED 54,000\n15/02/2024 – second cash deposit AED 54,500, same depositor\n01/03/2025 – TM alert fired on structured deposits\n31/03/2025 – wire transfer AED 108,000 to high-risk jurisdiction"} className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                </div>
                <button type="button" onClick={() => void runCaseTimeline()} disabled={timelineLoading || !timelineEvents.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {timelineLoading ? "Building timeline…" : "Build STR Timeline"}
                </button>
                {timelineResult && (() => {
                  const tl = timelineResult;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-4 bg-bg-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Date Range</div>
                          <div className="text-12 font-semibold text-ink-0">{tl.keyDateRange}</div>
                          <div className="text-11 text-ink-2">{tl.totalDuration}</div>
                        </div>
                        <div className="px-3 py-2 bg-red-dim border border-red/30 rounded">
                          <div className="text-10 uppercase tracking-wide-3 text-red mb-1">STR Deadline</div>
                          <div className="text-12 font-semibold text-red">{tl.strDeadline}</div>
                          <div className="text-11 text-ink-2">Suspicion: {tl.suspicionCrystallisedDate}</div>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Pattern Identified</div>
                        <div className="text-12 font-semibold text-brand">{tl.patternIdentified}</div>
                      </div>
                      {tl.timeline.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Chronological Timeline</div>
                          <div className="space-y-2">
                            {tl.timeline.map((ev, i) => (
                              <div key={i} className="flex gap-3 px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                                <div className="min-w-[90px]">
                                  <div className="text-11 font-mono font-semibold text-ink-0">{ev.date}</div>
                                  <div className={`text-10 font-mono px-1 py-px rounded ${ev.significance === "critical" ? "bg-red text-white" : ev.significance === "high" ? "bg-red-dim text-red" : ev.significance === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{ev.significance}</div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-12 text-ink-0">{ev.event}</div>
                                  {ev.fatfRef && <div className="text-10 font-mono text-ink-3 mt-0.5">{ev.fatfRef}</div>}
                                </div>
                                <div className="text-10 font-mono text-ink-3 pt-0.5">{ev.evidenceType}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3">goAML Narrative Block</div>
                          <button type="button" onClick={() => void navigator.clipboard.writeText(tl.goAmlNarrativeBlock)} className="text-10 px-2 py-0.5 border border-hair-2 rounded text-ink-2 hover:text-ink-0 hover:border-brand/40 transition-colors">Copy</button>
                        </div>
                        <textarea readOnly rows={6} className="w-full px-3 py-2 bg-bg-1 border border-hair-2 rounded text-11 font-mono text-ink-1 resize-y" value={tl.goAmlNarrativeBlock} />
                      </div>
                      <div className="text-10 font-mono text-ink-3">{tl.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ML Predicate Mapper */}
            {superToolsTab === "ml-predicate" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">ML Predicate Mapper — UAE FDL 10/2025 · FATF R.3 · 23 Predicate Categories</div>
                <p className="text-11 text-ink-3">Input case facts to identify applicable UAE predicate offences, maximum penalties, self-laundering applicability, and whether an STR is required. Maps to all 23 FATF R.3 designated predicate offence categories.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Suspected Activity (optional)</label><input value={predicateActivity} onChange={(e) => setPredicateActivity(e.target.value)} placeholder="e.g. corruption, fraud, tax evasion" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Jurisdiction (optional)</label><input value={predicateJurisdiction} onChange={(e) => setPredicateJurisdiction(e.target.value)} placeholder="e.g. UAE, offshore, multi-jurisdictional" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Case Facts *</label>
                  <textarea value={predicateFacts} onChange={(e) => setPredicateFacts(e.target.value)} rows={5} placeholder="Describe the suspicious activity: what happened, who was involved, what funds were moved, what was the alleged underlying crime…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                </div>
                <button type="button" onClick={() => void runMlPredicate()} disabled={predicateLoading || !predicateFacts.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {predicateLoading ? "Mapping predicates…" : "Map Predicate Offences"}
                </button>
                {predicateResult && (() => {
                  const pr = predicateResult;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-4 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {pr.mlOffenceApplicable && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">ML OFFENCE APPLICABLE</span>}
                        {pr.selfLaunderingApplicable && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red">SELF-LAUNDERING</span>}
                        {pr.strRequired && <span className="font-mono text-10 px-2 py-px rounded bg-amber-dim text-amber">STR REQUIRED</span>}
                      </div>
                      <div className="px-3 py-3 bg-bg-panel border border-brand/30 rounded-lg">
                        <div className="text-10 uppercase tracking-wide-3 text-brand mb-1">Primary Predicate Offence</div>
                        <div className="text-13 font-bold text-ink-0 mb-1">{pr.primaryPredicate.offence}</div>
                        <div className="text-11 font-mono text-ink-3 mb-2">{pr.primaryPredicate.uaeLegalRef}</div>
                        <div className="flex gap-4 flex-wrap">
                          <div><span className="text-10 text-ink-3 uppercase tracking-wide-3">Max Penalty: </span><span className="text-12 font-semibold text-red">{pr.primaryPredicate.maxPenalty}</span></div>
                          <div><span className="text-10 text-ink-3 uppercase tracking-wide-3">FATF Category: </span><span className="text-11 text-ink-1">{pr.primaryPredicate.fatfCategory}</span></div>
                        </div>
                      </div>
                      {pr.mlLegalBasis && <div className="text-11 text-ink-2 border-l-2 border-brand/40 pl-3"><span className="font-semibold text-ink-0">ML Legal Basis:</span> {pr.mlLegalBasis}</div>}
                      {pr.strBasis && <div className="text-11 text-ink-2 border-l-2 border-amber/40 pl-3"><span className="font-semibold text-ink-0">STR Basis:</span> {pr.strBasis}</div>}
                      {pr.secondaryPredicates.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Secondary Predicate Offences</div>
                          <div className="space-y-2">{pr.secondaryPredicates.map((sp, i) => (
                            <div key={i} className="px-3 py-2 bg-bg-panel border border-hair-2 rounded">
                              <div className="text-12 font-semibold text-ink-0">{sp.offence}</div>
                              <div className="text-10 font-mono text-ink-3">{sp.uaeLegalRef}</div>
                              <div className="text-11 text-ink-2 mt-1">Overlap: {sp.overlap}</div>
                            </div>
                          ))}</div>
                        </div>
                      )}
                      {pr.fatfR3Categories.length > 0 && <div className="flex flex-wrap gap-1.5">{pr.fatfR3Categories.map((c, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-violet-dim text-violet">{c}</span>)}</div>}
                      {pr.investigativeActions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Investigative Actions Required</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">{pr.investigativeActions.map((a, i) => <li key={i}>{a}</li>)}</ol>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{pr.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Client Risk Scorer */}
            {superToolsTab === "client-risk" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Client Risk Scorer — Onboarding Risk Assessment · CDD Level</div>
                <p className="text-11 text-ink-3">Input entity details and shareholders. AI produces a risk rating, determines CDD vs EDD, identifies PEP exposure, and recommends action per UAE FDL 10/2025 and FATF R.10.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Entity Name *</label><input value={clientRiskEntity.name} onChange={(e) => setClientRiskEntity((p) => ({...p, name: e.target.value}))} placeholder="Full legal name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Country of Incorporation</label><input value={clientRiskEntity.countryOfIncorporation} onChange={(e) => setClientRiskEntity((p) => ({...p, countryOfIncorporation: e.target.value}))} placeholder="e.g. UAE, BVI, UK" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Trade Licence / Registration No.</label><input value={clientRiskEntity.tradeLicence} onChange={(e) => setClientRiskEntity((p) => ({...p, tradeLicence: e.target.value}))} placeholder="e.g. DED-2024-00001" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Alternate / Former Names</label><input value={clientRiskEntity.alternateNames} onChange={(e) => setClientRiskEntity((p) => ({...p, alternateNames: e.target.value}))} placeholder="Previous trading names, DBA" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3 pt-2">Shareholders / UBOs</div>
                {clientRiskShareholders.map((sh, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 p-2 bg-bg-1 border border-hair-2 rounded">
                    <input value={sh.name} onChange={(e) => setClientRiskShareholders((p) => p.map((s, i) => i === idx ? {...s, name: e.target.value} : s))} placeholder="Shareholder name" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0 col-span-2" />
                    <input value={sh.sharesPct} onChange={(e) => setClientRiskShareholders((p) => p.map((s, i) => i === idx ? {...s, sharesPct: e.target.value} : s))} placeholder="% ownership" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0" />
                    <input value={sh.nationality} onChange={(e) => setClientRiskShareholders((p) => p.map((s, i) => i === idx ? {...s, nationality: e.target.value} : s))} placeholder="Nationality" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0" />
                    <select value={sh.pepStatus} onChange={(e) => setClientRiskShareholders((p) => p.map((s, i) => i === idx ? {...s, pepStatus: e.target.value} : s))} className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0">
                      <option value="non-pep">Non-PEP</option>
                      <option value="domestic-pep">Domestic PEP</option>
                      <option value="foreign-pep">Foreign PEP</option>
                      <option value="rca">RCA</option>
                    </select>
                    <button type="button" onClick={() => setClientRiskShareholders((p) => p.filter((_, i) => i !== idx))} disabled={clientRiskShareholders.length <= 1} className="text-11 text-ink-3 hover:text-red disabled:opacity-30">Remove</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setClientRiskShareholders((p) => [...p, {designation:"", name:"", sharesPct:"", kind:"individual", nationality:"", pepStatus:"non-pep", emiratesId:"", idNumber:""}])} className="text-11 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:border-brand/40">+ Add Shareholder</button>
                  <button type="button" onClick={() => void runClientRisk()} disabled={clientRiskLoading || !clientRiskEntity.name.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                    {clientRiskLoading ? "Scoring…" : "Score Client Risk"}
                  </button>
                </div>
                {clientRiskResult && (() => {
                  const cr = clientRiskResult;
                  const riskCls = cr.overallRisk === "critical" ? "bg-red text-white" : cr.overallRisk === "high" ? "bg-red-dim text-red" : cr.overallRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const actCls = cr.recommendedAction === "reject" ? "bg-red text-white" : cr.recommendedAction === "refer_to_mlro" ? "bg-red-dim text-red" : cr.recommendedAction === "onboard_with_edd" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{cr.overallRisk} risk</span>
                        <span className={`font-mono text-11 px-2 py-px rounded uppercase ${actCls}`}>{cr.recommendedAction.replace(/_/g, " ")}</span>
                        {cr.eddRequired && <span className="font-mono text-10 px-2 py-px rounded bg-amber-dim text-amber border border-amber/30">EDD REQUIRED</span>}
                        {cr.pepExposure.detected && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red border border-red/30">PEP EXPOSURE</span>}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{cr.riskNarrative}</p>
                      {cr.eddReason && <p className="text-11 text-ink-2 border-l-2 border-amber/40 pl-3">{cr.eddReason}</p>}
                      {cr.cddRequirements.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">CDD Requirements</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">{cr.cddRequirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{cr.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Jurisdiction Intel */}
            {superToolsTab === "jurisdiction-intel" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Jurisdiction Intelligence — FATF Status · CAHRA · Sanctions Exposure</div>
                <p className="text-11 text-ink-3">Get a full AML/CFT intelligence brief on any country: FATF status (grey/black list), CAHRA classification, sanctions exposure across UAE/UN/OFAC/EU/UK, DPMS-specific risks, and UAE regulatory requirements for that jurisdiction.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Country *</label><input value={jurisCountry} onChange={(e) => setJurisCountry(e.target.value)} placeholder="e.g. Nigeria, Russia, Iran, Afghanistan" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Context (optional)</label><input value={jurisContext} onChange={(e) => setJurisContext(e.target.value)} placeholder="e.g. gold trade, remittances, real estate" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runJurisdictionIntel()} disabled={jurisLoading || !jurisCountry.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {jurisLoading ? "Loading intelligence…" : "Get Jurisdiction Intel"}
                </button>
                {jurisResult && (() => {
                  const jr = jurisResult;
                  const riskCls = jr.overallRisk === "critical" ? "bg-red text-white" : jr.overallRisk === "high" ? "bg-red-dim text-red" : jr.overallRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-13 font-bold text-ink-0">{jr.countryName}</span>
                        <span className={`font-mono text-11 px-2 py-px rounded uppercase ${riskCls}`}>{jr.overallRisk} risk</span>
                        <span className="text-11 font-mono text-ink-3">{jr.fatfStatus}</span>
                      </div>
                      {jr.cahraStatus && <div className="px-3 py-1.5 bg-amber-dim border border-amber/30 rounded text-11 text-amber"><span className="font-semibold">CAHRA:</span> {jr.cahraStatus}</div>}
                      {jr.fatfDetail && <p className="text-12 text-ink-1">{jr.fatfDetail}</p>}
                      <div className="grid grid-cols-5 gap-2">
                        {Object.entries(jr.sanctionsExposure).map(([k, v]) => v ? (
                          <div key={k} className="px-2 py-1.5 bg-red-dim border border-red/20 rounded text-center">
                            <div className="text-10 font-mono text-red uppercase">{k}</div>
                            <div className="text-10 text-ink-2 truncate">{v}</div>
                          </div>
                        ) : null)}
                      </div>
                      {jr.keyRisks.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Key Risks</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">{jr.keyRisks.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {jr.typologiesPrevalent.length > 0 && <div className="flex flex-wrap gap-1.5">{jr.typologiesPrevalent.map((t, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-violet-dim text-violet">{t}</span>)}</div>}
                      {jr.cddImplications && <p className="text-11 text-ink-2 border-l-2 border-brand/40 pl-3">{jr.cddImplications}</p>}
                      {jr.uaeRegulatoryRequirement && <p className="text-11 text-ink-2 border-l-2 border-amber/40 pl-3"><span className="font-semibold text-ink-0">UAE Requirement:</span> {jr.uaeRegulatoryRequirement}</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* UBO Risk Analyzer */}
            {superToolsTab === "ubo-risk" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">UBO Risk Analyzer — Beneficial Ownership · FATF R.24 · PEP Flags</div>
                <p className="text-11 text-ink-3">Input the corporate entity and its ultimate beneficial owners. AI assesses ownership structure risk, PEP flags, nationality risks, CDD gaps, and sanctions screening requirements per FATF R.24 and UAE FDL 10/2025.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Entity Name *</label><input value={uboEntity} onChange={(e) => setUboEntity(e.target.value)} placeholder="Legal name of entity" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Country of Registration</label><input value={uboRegistered} onChange={(e) => setUboRegistered(e.target.value)} placeholder="e.g. UAE, BVI, Cayman" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <div className="text-10 uppercase tracking-wide-3 text-ink-3">Ultimate Beneficial Owners (25%+ threshold)</div>
                {uboEntries.map((ubo, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 p-2 bg-bg-1 border border-hair-2 rounded">
                    <input value={ubo.name} onChange={(e) => setUboEntries((p) => p.map((u, i) => i === idx ? {...u, name: e.target.value} : u))} placeholder="UBO full name" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0 col-span-2" />
                    <input value={ubo.ownershipPct} onChange={(e) => setUboEntries((p) => p.map((u, i) => i === idx ? {...u, ownershipPct: e.target.value} : u))} placeholder="% ownership" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0" />
                    <input value={ubo.nationality} onChange={(e) => setUboEntries((p) => p.map((u, i) => i === idx ? {...u, nationality: e.target.value} : u))} placeholder="Nationality" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0" />
                    <input value={ubo.dob} onChange={(e) => setUboEntries((p) => p.map((u, i) => i === idx ? {...u, dob: e.target.value} : u))} placeholder="DOB dd/mm/yyyy" className="text-11 px-2 py-1.5 rounded border border-hair-2 bg-bg-panel focus:outline-none focus:border-brand text-ink-0" />
                    <button type="button" onClick={() => setUboEntries((p) => p.filter((_, i) => i !== idx))} disabled={uboEntries.length <= 1} className="text-11 text-ink-3 hover:text-red disabled:opacity-30">Remove</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setUboEntries((p) => [...p, {name:"",dob:"",nationality:"",gender:"",ownershipPct:"",role:""}])} className="text-11 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:border-brand/40">+ Add UBO</button>
                  <button type="button" onClick={() => void runUboRisk()} disabled={uboLoading || !uboEntity.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                    {uboLoading ? "Analysing UBO chain…" : "Analyse UBO Risk"}
                  </button>
                </div>
                {uboResult && (() => {
                  const ur = uboResult;
                  const riskCls = ur.overallRisk === "critical" ? "bg-red text-white" : ur.overallRisk === "high" ? "bg-red-dim text-red" : ur.overallRisk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{ur.overallRisk} risk</span>
                        {ur.eddRequired && <span className="font-mono text-10 px-2 py-px rounded bg-amber-dim text-amber">EDD REQUIRED</span>}
                        {ur.sanctionsScreeningRequired && <span className="font-mono text-10 px-2 py-px rounded bg-red-dim text-red">SANCTIONS SCREENING</span>}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{ur.riskNarrative}</p>
                      {ur.pepRiskFlags.length > 0 && <div className="flex flex-wrap gap-1.5">{ur.pepRiskFlags.map((f, i) => <span key={i} className="text-11 px-2 py-px rounded bg-red-dim text-red border border-red/30">{f}</span>)}</div>}
                      {ur.cddGaps.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">CDD Gaps Identified</div>
                          <ul className="text-11 text-ink-1 space-y-0.5 list-disc list-inside">{ur.cddGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                        </div>
                      )}
                      {ur.recommendedActions.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Recommended Actions</div>
                          <ol className="text-11 text-ink-1 space-y-0.5 list-decimal list-inside">{ur.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}</ol>
                        </div>
                      )}
                      <div className="text-10 font-mono text-ink-3">{ur.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Benford Forensics */}
            {superToolsTab === "benford" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Benford Forensics — Statistical Fraud Detection · Structuring Analysis</div>
                <p className="text-11 text-ink-3">Paste a list of transaction amounts. Benford&apos;s Law analysis computes MAD, chi-squared, and p-value to detect structuring, round-tripping, or fabricated transactions. Minimum 20 amounts recommended for statistical significance.</p>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Transaction Amounts * (comma-separated numbers)</label>
                  <textarea value={benfordAmounts} onChange={(e) => setBenfordAmounts(e.target.value)} rows={4} placeholder="54000, 54500, 53900, 54100, 12500, 8750, 200000, 15000, 3500, 98000, 54200, 54800…" className="w-full text-12 px-2.5 py-2 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand resize-none" />
                </div>
                <div>
                  <label className="block text-10 text-ink-3 mb-1">Dataset Label (optional)</label>
                  <input value={benfordLabel} onChange={(e) => setBenfordLabel(e.target.value)} placeholder="e.g. Account XYZ 2024 transactions" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" />
                </div>
                <button type="button" onClick={() => void runBenford()} disabled={benfordLoading || benfordAmounts.split(",").filter((s) => !isNaN(Number(s.trim())) && Number(s.trim()) > 0).length < 2} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {benfordLoading ? "Analysing…" : "Run Benford Analysis"}
                </button>
                {benfordResult && (() => {
                  const br = benfordResult;
                  if (!br.ok || br.risk === "insufficient-data") return (
                    <div className="mt-3 px-4 py-3 bg-amber-dim border border-amber/30 rounded text-12 text-amber">{br.error ?? br.riskDetail ?? "Insufficient data — provide at least 20 amounts."}</div>
                  );
                  const riskCls = br.risk === "suspicious" ? "bg-red text-white" : br.risk === "marginal" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{br.risk}</span>
                        <span className="font-mono text-11 text-ink-2">n={br.n} amounts</span>
                        <span className="font-mono text-11 text-ink-2">MAD={br.mad.toFixed(4)}</span>
                        <span className="font-mono text-11 text-ink-2">χ²={br.chiSquared.toFixed(2)}</span>
                        <span className="font-mono text-11 text-ink-2">p={br.chiSquaredPValue.toFixed(4)}</span>
                      </div>
                      <p className="text-12 text-ink-1">{br.riskDetail}</p>
                      {br.flaggedDigits.length > 0 && (
                        <div className="px-3 py-2 bg-red-dim border border-red/30 rounded">
                          <div className="text-10 uppercase tracking-wide-3 text-red mb-1">Over-Represented Leading Digits (Structuring Signal)</div>
                          <div className="flex gap-2">{br.flaggedDigits.map((d) => <span key={d} className="text-16 font-mono font-bold text-red">{d}</span>)}</div>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-11 font-mono">
                          <thead><tr className="text-10 uppercase text-ink-3 border-b border-hair-2">
                            <th className="py-1 text-left">Digit</th>
                            <th className="py-1 text-right">Count</th>
                            <th className="py-1 text-right">Observed%</th>
                            <th className="py-1 text-right">Expected%</th>
                            <th className="py-1 text-right">Deviation</th>
                          </tr></thead>
                          <tbody>{br.digits.map((d) => (
                            <tr key={d.digit} className={`border-b border-hair-2 ${d.deviation > 5 ? "text-red font-semibold" : d.deviation < -5 ? "text-amber" : "text-ink-1"}`}>
                              <td className="py-1 text-14 font-bold">{d.digit}</td>
                              <td className="py-1 text-right">{d.observed}</td>
                              <td className="py-1 text-right">{d.observedPct.toFixed(1)}%</td>
                              <td className="py-1 text-right">{d.expectedPct.toFixed(1)}%</td>
                              <td className="py-1 text-right">{d.deviation > 0 ? "+" : ""}{d.deviation.toFixed(1)}pp</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Crypto Wallet Risk */}
            {superToolsTab === "crypto-wallet" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Crypto Wallet Risk — Taint Analysis · Mixer Exposure · Darknet Links</div>
                <p className="text-11 text-ink-3">AML taint analysis on crypto wallet addresses (ETH/BTC/TRX). Requires blockchain data service to be configured. Detects mixer exposure, darknet market links, exchange attribution, and high-risk counterparties.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Wallet Address *</label><input value={cryptoAddress} onChange={(e) => setCryptoAddress(e.target.value)} placeholder="0x… or bc1… or T…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 font-mono focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Chain</label>
                    <select value={cryptoChain} onChange={(e) => setCryptoChain(e.target.value as "ethereum"|"bitcoin"|"tron")} className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0">
                      <option value="ethereum">Ethereum (ETH)</option>
                      <option value="bitcoin">Bitcoin (BTC)</option>
                      <option value="tron">Tron (TRX)</option>
                    </select>
                  </div>
                </div>
                <button type="button" onClick={() => void runCryptoWallet()} disabled={cryptoLoading || !cryptoAddress.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {cryptoLoading ? "Querying blockchain…" : "Analyse Wallet"}
                </button>
                {cryptoError && <div className="px-4 py-3 bg-amber-dim border border-amber/30 rounded text-12 text-amber">Service unavailable: {cryptoError}. Blockchain data service requires configuration.</div>}
                {cryptoResult && !cryptoError && (
                  <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                    <pre className="text-11 font-mono text-ink-1 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(cryptoResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Onboarding Risk Tier */}
            {superToolsTab === "onboarding-tier" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Onboarding Risk Tier — Deterministic Scorer · FATF R.10 · Tier 1/2/3</div>
                <p className="text-11 text-ink-3">Deterministic risk-tier classification for new customer onboarding. No AI — pure rule-based scoring on FATF-listed countries, PEP status, source-of-funds quality, occupation risk, and screening hits. Instant result.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Full Name *</label><input value={onboardInput.fullName} onChange={(e) => setOnboardInput((p) => ({...p, fullName: e.target.value}))} placeholder="Customer full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Nationality (ISO-2)</label><input value={onboardInput.nationalityIso2} onChange={(e) => setOnboardInput((p) => ({...p, nationalityIso2: e.target.value}))} placeholder="e.g. AE, PK, RU, IR" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Date of Birth</label><input value={onboardInput.dob} onChange={(e) => setOnboardInput((p) => ({...p, dob: e.target.value}))} placeholder="YYYY-MM-DD" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Occupation</label><input value={onboardInput.occupation} onChange={(e) => setOnboardInput((p) => ({...p, occupation: e.target.value}))} placeholder="e.g. Gold trader, government official, lawyer" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Source of Funds</label><input value={onboardInput.sourceOfFunds} onChange={(e) => setOnboardInput((p) => ({...p, sourceOfFunds: e.target.value}))} placeholder="e.g. salary, business income, inheritance" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Expected Transaction Profile</label><input value={onboardInput.expectedProfile} onChange={(e) => setOnboardInput((p) => ({...p, expectedProfile: e.target.value}))} placeholder="e.g. monthly salary credit AED 25,000, occasional gold purchases" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Address</label><input value={onboardInput.address} onChange={(e) => setOnboardInput((p) => ({...p, address: e.target.value}))} placeholder="Full residential or registered address" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runOnboardingTier()} disabled={onboardLoading || !onboardInput.fullName.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
                  {onboardLoading ? "Scoring…" : "Score Onboarding Risk"}
                </button>
                {onboardResult && (() => {
                  const or = onboardResult;
                  const tierCls = or.tier === "tier-1" ? "bg-red text-white" : or.tier === "tier-2" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  const tierLabel = or.tier === "tier-1" ? "Tier 1 — High Risk" : or.tier === "tier-2" ? "Tier 2 — Medium Risk" : "Tier 3 — Standard";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-13 font-bold px-4 py-1.5 rounded uppercase ${tierCls}`}>{tierLabel}</span>
                        <span className="font-mono text-11 text-ink-2">Score: {or.score}/100</span>
                      </div>
                      <p className="text-12 text-ink-1">{or.rationale}</p>
                      {or.factors.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Contributing Risk Factors</div>
                          <div className="space-y-1.5">
                            {[...or.factors].sort((a, b) => b.points - a.points).map((f, i) => (
                              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-panel border border-hair-2 rounded">
                                <span className={`font-mono text-11 font-bold w-8 text-right ${f.points >= 20 ? "text-red" : f.points >= 10 ? "text-amber" : "text-ink-2"}`}>+{f.points}</span>
                                <span className="text-11 text-ink-0 flex-1">{f.label}</span>
                                {f.anchor && <span className="text-10 font-mono text-ink-3">{f.anchor}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {or.jurisdictionHits.length > 0 && (
                        <div>
                          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction Risk Hits</div>
                          <div className="flex flex-wrap gap-1.5">{or.jurisdictionHits.map((jh, i) => <span key={i} className={`text-10 font-mono px-2 py-px rounded ${jh.classification === "black" ? "bg-red text-white" : jh.classification === "grey" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{jh.list}: {jh.label}</span>)}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "prolif-finance" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Proliferation Finance Screener · FATF R.7 · UNSCR 1718/1737/2397</div>
                <p className="text-11 text-ink-3">Assess transactions and entities for WMD proliferation financing risk. Covers dual-use goods, DPRK/Iran/Syria sanctions corridors, front company structures, and Strategic Goods Control List (SGCL) obligations under UAE Federal Decree-Law 26/2021.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Subject / Buyer *</label><input value={prolifInput.subject} onChange={(e) => setProlifInput((p) => ({...p, subject: e.target.value}))} placeholder="Entity or individual name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Subject Country</label><input value={prolifInput.subjectCountry} onChange={(e) => setProlifInput((p) => ({...p, subjectCountry: e.target.value}))} placeholder="Country of incorporation" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Counterparty / Seller</label><input value={prolifInput.counterparty} onChange={(e) => setProlifInput((p) => ({...p, counterparty: e.target.value}))} placeholder="Counterparty name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Counterparty Country</label><input value={prolifInput.counterpartyCountry} onChange={(e) => setProlifInput((p) => ({...p, counterpartyCountry: e.target.value}))} placeholder="Country" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Goods / Services</label><input value={prolifInput.goods} onChange={(e) => setProlifInput((p) => ({...p, goods: e.target.value}))} placeholder="e.g. CNC machine tools, precision instruments, electronic components" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">End User / Destination</label><input value={prolifInput.endUser} onChange={(e) => setProlifInput((p) => ({...p, endUser: e.target.value}))} placeholder="Stated end user name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">End User Country</label><input value={prolifInput.endUserCountry} onChange={(e) => setProlifInput((p) => ({...p, endUserCountry: e.target.value}))} placeholder="Final destination country" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Amount + Currency</label><div className="flex gap-2"><input value={prolifInput.amount} onChange={(e) => setProlifInput((p) => ({...p, amount: e.target.value}))} placeholder="Amount" className="flex-1 text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /><input value={prolifInput.currency} onChange={(e) => setProlifInput((p) => ({...p, currency: e.target.value}))} placeholder="USD" className="w-20 text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><textarea value={prolifInput.context} onChange={(e) => setProlifInput((p) => ({...p, context: e.target.value}))} rows={2} placeholder="e.g. transshipment route, payment method, intermediaries" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runProlifFinance()} disabled={prolifLoading || !prolifInput.subject.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{prolifLoading ? "Assessing…" : "Screen for PF Risk"}</button>
                {prolifResult && (() => {
                  const pf = prolifResult as ProlifFinanceResult;
                  const riskCls = pf.pfRisk === "critical" ? "bg-red text-white" : pf.pfRisk === "high" ? "bg-amber-dim text-amber" : pf.pfRisk === "medium" ? "bg-yellow-dim text-yellow-600" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>PF Risk: {pf.pfRisk}</span>
                        {pf.mandatoryFreeze && <span className="font-mono text-11 px-3 py-1 rounded bg-red text-white font-bold">⚠️ MANDATORY FREEZE</span>}
                        {pf.wmdNexus !== "none" && <span className={`font-mono text-11 px-2 py-px rounded ${pf.wmdNexus === "confirmed" ? "bg-red text-white" : "bg-amber-dim text-amber"}`}>WMD Nexus: {pf.wmdNexus}</span>}
                      </div>
                      <p className="text-12 text-ink-0 font-medium">{pf.primaryConcern}</p>
                      {pf.dualUseGoodsDetected && pf.dualUseCategories.length > 0 && <div className="flex flex-wrap gap-1.5">{pf.dualUseCategories.map((c, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-amber-dim text-amber">Dual-use: {c}</span>)}</div>}
                      {pf.indicators.length > 0 && <div className="space-y-1.5">{pf.indicators.map((ind, i) => <div key={i} className={`border rounded p-2 text-11 ${ind.severity === "critical" ? "border-red bg-red-dim" : ind.severity === "high" ? "border-amber bg-amber-dim" : "border-hair-2 bg-bg-panel"}`}><div className="font-semibold text-ink-0">{ind.indicator}</div><div className="text-10 text-ink-3 mt-0.5">{ind.detail}</div><div className="text-10 font-mono text-ink-3 mt-0.5">{ind.unscr}</div></div>)}</div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{pf.actionRationale}</div>
                      {pf.requiredActions.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div><ol className="space-y-1">{pf.requiredActions.map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-2"><span className="font-mono text-ink-3 w-4">{i+1}.</span>{a}</li>)}</ol></div>}
                      <div className="text-10 font-mono text-ink-3">{pf.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "sar-triage" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">SAR/STR Triage Decision Engine · UAE FDL 10/2025 Art.26 · FATF R.20</div>
                <p className="text-11 text-ink-3">File or no-file? Applies the UAE 'reasonable grounds to suspect' standard (no monetary threshold) and the 2-business-day filing deadline. Checks narrative completeness, missing fields, and tipping-off risk before generating an MLRO decision memorandum.</p>
                <div className="space-y-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Suspicious Activity Description *</label><textarea value={sarInput.suspiciousActivity} onChange={(e) => setSarInput((p) => ({...p, suspiciousActivity: e.target.value}))} rows={4} placeholder="Describe the suspicious activity in detail — what happened, when, amounts, patterns, customer behaviour..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={sarInput.subjectName} onChange={(e) => setSarInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Type</label><input value={sarInput.subjectType} onChange={(e) => setSarInput((p) => ({...p, subjectType: e.target.value}))} placeholder="e.g. individual, corporate, DPMS" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Account Reference</label><input value={sarInput.accountRef} onChange={(e) => setSarInput((p) => ({...p, accountRef: e.target.value}))} placeholder="Account number or IBAN" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Transaction Summary</label><input value={sarInput.transactionSummary} onChange={(e) => setSarInput((p) => ({...p, transactionSummary: e.target.value}))} placeholder="e.g. 6 cash deposits AED 52,000–54,000 over 6 weeks" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">MLRO Notes</label><textarea value={sarInput.mlroNotes} onChange={(e) => setSarInput((p) => ({...p, mlroNotes: e.target.value}))} rows={2} placeholder="Any MLRO notes or preliminary assessment..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runSarTriage()} disabled={sarTriageLoading || !sarInput.suspiciousActivity.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{sarTriageLoading ? "Triaging…" : "Run STR Triage"}</button>
                {sarTriageResult && (() => {
                  const st = sarTriageResult;
                  const decCls = st.decision === "file_str" ? "bg-red text-white" : st.decision === "more_info" ? "bg-amber-dim text-amber" : st.decision === "escalate_mlro" ? "bg-yellow-dim text-yellow-700" : "bg-green-dim text-green";
                  const decLabel = st.decision === "file_str" ? "FILE STR NOW" : st.decision === "more_info" ? "MORE INFO NEEDED" : st.decision === "escalate_mlro" ? "ESCALATE TO MLRO" : "NO FILE";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-13 font-bold px-4 py-1.5 rounded uppercase ${decCls}`}>{decLabel}</span>
                        <span className={`font-mono text-11 px-2 py-px rounded ${st.suspicionTest === "met" ? "bg-red-dim text-red" : st.suspicionTest === "borderline" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Suspicion test: {st.suspicionTest}</span>
                        <span className="font-mono text-11 text-ink-3">Confidence: {st.confidenceLevel}</span>
                      </div>
                      {st.tippingOffRisk && <div className="bg-red text-white rounded p-3 text-11 font-semibold">⚠️ TIPPING-OFF WARNING: {st.tippingOffWarning}</div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 space-y-2">
                        <div className="text-10 uppercase tracking-wide-3 text-ink-3">Suspicion Basis</div>
                        <p className="text-12 text-ink-1">{st.suspicionBasis}</p>
                      </div>
                      {st.strDeadline && <div className="flex items-center gap-2"><span className="text-10 uppercase tracking-wide-3 text-ink-3">Filing Deadline:</span><span className="font-mono text-11 text-red font-bold">{st.strDeadline}</span></div>}
                      {st.requiredFields.length > 0 && (
                        <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">goAML Field Checklist</div>
                        <div className="grid grid-cols-2 gap-1.5">{st.requiredFields.map((f, i) => <div key={i} className={`text-11 px-2 py-1 rounded border ${f.status === "available" ? "border-green bg-green-dim text-green" : f.status === "missing" ? "border-red bg-red-dim text-red" : "border-amber bg-amber-dim text-amber"}`}>{f.status === "available" ? "✓" : f.status === "missing" ? "✗" : "~"} {f.field}{f.note ? ` — ${f.note}` : ""}</div>)}</div></div>
                      )}
                      {st.narrativeSuggestions.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Narrative Improvements</div><ul className="space-y-1">{st.narrativeSuggestions.map((s, i) => <li key={i} className="text-11 text-ink-1 flex gap-2"><span className="text-amber">→</span>{s}</li>)}</ul></div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">MLRO Predetermination</div>{st.predetermination}</div>
                      <div className="text-10 font-mono text-ink-3">{st.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "doc-fraud" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Document Fraud Detector · UAE FDL 10/2025 Art.14 · KYC Authenticity</div>
                <p className="text-11 text-ink-3">Assess identity documents and KYC supporting documents for fraud indicators. Checks Emirates ID format, salary certificate consistency, trade licence format, attestation chains, and income plausibility. Outputs verification steps and regulatory implications.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Document Types Presented *</label><input value={docFraudInput.documentTypes} onChange={(e) => setDocFraudInput((p) => ({...p, documentTypes: e.target.value}))} placeholder="e.g. Emirates ID, salary certificate, trade licence, bank statement" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={docFraudInput.subjectName} onChange={(e) => setDocFraudInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Full name on documents" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Subject Nationality</label><input value={docFraudInput.subjectNationality} onChange={(e) => setDocFraudInput((p) => ({...p, subjectNationality: e.target.value}))} placeholder="e.g. Pakistani, Egyptian, Indian" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Occupation Claimed</label><input value={docFraudInput.occupationClaimed} onChange={(e) => setDocFraudInput((p) => ({...p, occupationClaimed: e.target.value}))} placeholder="Stated occupation" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Income Claimed (AED/month)</label><input value={docFraudInput.incomeClaimedAed} onChange={(e) => setDocFraudInput((p) => ({...p, incomeClaimedAed: e.target.value}))} placeholder="Monthly income in AED" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Inconsistencies Observed</label><input value={docFraudInput.inconsistenciesObserved} onChange={(e) => setDocFraudInput((p) => ({...p, inconsistenciesObserved: e.target.value}))} placeholder="e.g. font differences, date mismatch" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Document Details / Observations</label><textarea value={docFraudInput.documentDetails} onChange={(e) => setDocFraudInput((p) => ({...p, documentDetails: e.target.value}))} rows={2} placeholder="Describe any unusual features, quality issues, or specific concerns..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runDocFraud()} disabled={docFraudLoading || !docFraudInput.documentTypes.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{docFraudLoading ? "Analysing…" : "Assess Document Authenticity"}</button>
                {docFraudResult && (() => {
                  const df = docFraudResult;
                  const riskCls = df.fraudRisk === "critical" ? "bg-red text-white" : df.fraudRisk === "high" ? "bg-amber-dim text-amber" : df.fraudRisk === "medium" ? "bg-yellow-dim text-yellow-600" : df.fraudRisk === "clear" ? "bg-green-dim text-green" : "bg-bg-2 text-ink-2";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>Fraud Risk: {df.fraudRisk} ({df.fraudProbability}%)</span>
                        <span className={`font-mono text-11 px-2 py-px rounded ${df.identityConsistency === "consistent" ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>Identity: {df.identityConsistency}</span>
                      </div>
                      {df.documentAssessments.map((da, i) => (
                        <div key={i} className="border border-hair-2 rounded p-3 space-y-1.5">
                          <div className="flex items-center gap-2"><span className="text-11 font-semibold text-ink-0">{da.docType}</span><span className={`text-10 font-mono px-2 py-px rounded ${da.authentic === "likely" ? "bg-green-dim text-green" : da.authentic === "counterfeit" ? "bg-red text-white" : "bg-amber-dim text-amber"}`}>{da.authentic}</span></div>
                          {da.redFlags.length > 0 && <ul className="space-y-0.5">{da.redFlags.map((f, j) => <li key={j} className="text-11 text-red flex gap-1.5"><span>⚠</span>{f}</li>)}</ul>}
                          {da.verificationRequired.length > 0 && <div className="text-10 text-ink-3">Verify: {da.verificationRequired.join(" · ")}</div>}
                        </div>
                      ))}
                      {df.indicators.length > 0 && <div className="space-y-1.5">{df.indicators.map((ind, i) => <div key={i} className={`border rounded p-2 text-11 ${ind.severity === "critical" ? "border-red bg-red-dim" : "border-amber bg-amber-dim"}`}><div className="font-semibold">{ind.indicator}</div><div className="text-10 text-ink-3 mt-0.5">{ind.detail}</div></div>)}</div>}
                      {df.requiredVerificationSteps.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Verification Steps</div><ol className="space-y-1">{df.requiredVerificationSteps.map((s, i) => <li key={i} className="text-11 text-ink-1 flex gap-2"><span className="font-mono text-ink-3 w-4">{i+1}.</span>{s}</li>)}</ol></div>}
                      <div className="text-10 font-mono text-ink-3">{df.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "ctr-structuring" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">CTR / Structuring Detector · UAE FDL 10/2025 Art.17 · Deterministic Engine</div>
                <p className="text-11 text-ink-3">Deterministic engine — no AI. Paste a list of cash transaction amounts. Instantly detects structuring (smurfing) patterns, identifies CTR-required transactions (≥ AED 55,000), computes Benford-style band distribution, and outputs filing obligations.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Cash Transaction Amounts (AED) *</label><textarea value={ctrAmounts} onChange={(e) => setCtrAmounts(e.target.value)} rows={3} placeholder="Paste amounts separated by commas, newlines, or semicolons&#10;e.g. 52000, 54500, 53200, 51800, 55000, 49000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 font-mono resize-none focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Period (days)</label><input type="number" value={ctrPeriodDays} onChange={(e) => setCtrPeriodDays(e.target.value)} placeholder="30" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={ctrSubject} onChange={(e) => setCtrSubject(e.target.value)} placeholder="Account holder name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runCtrStructuring()} disabled={ctrLoading || !ctrAmounts.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{ctrLoading ? "Analysing…" : "Analyse CTR & Structuring"}</button>
                {ctrResult && (() => {
                  const ct = ctrResult;
                  const riskCls = ct.structuringRisk === "critical" ? "bg-red text-white" : ct.structuringRisk === "high" ? "bg-amber-dim text-amber" : ct.structuringRisk === "medium" ? "bg-yellow-dim text-yellow-600" : ct.structuringRisk === "low" ? "bg-bg-2 text-ink-2" : "bg-green-dim text-green";
                  const actionCls = ct.recommendedAction === "file_ctr_and_str" || ct.recommendedAction === "file_str" ? "bg-red text-white" : ct.recommendedAction === "file_ctr" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>Structuring: {ct.structuringRisk}</span>
                        <span className={`font-mono text-11 font-bold px-3 py-1 rounded uppercase ${actionCls}`}>{ct.recommendedAction.replace(/_/g, " ")}</span>
                        {ct.ctrRequired && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">{ct.ctrCount} CTR(s) required</span>}
                        {ct.smurfingPattern && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">Smurfing pattern</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-bg-panel border border-hair-2 rounded p-2"><div className="font-mono text-13 font-bold text-ink-0">AED {ct.totalValueAed.toLocaleString()}</div><div className="text-10 text-ink-3">Total Value</div></div>
                        <div className="bg-bg-panel border border-hair-2 rounded p-2"><div className="font-mono text-13 font-bold text-ink-0">{ct.transactions.length}</div><div className="text-10 text-ink-3">Transactions</div></div>
                        <div className="bg-bg-panel border border-hair-2 rounded p-2"><div className={`font-mono text-13 font-bold ${ct.thresholdProximityPct >= 90 ? "text-red" : ct.thresholdProximityPct >= 80 ? "text-amber" : "text-ink-0"}`}>{ct.thresholdProximityPct}%</div><div className="text-10 text-ink-3">Max threshold proximity</div></div>
                      </div>
                      <p className="text-12 text-ink-1">{ct.patternDescription}</p>
                      <div className="border border-hair-2 rounded overflow-hidden"><table className="w-full text-11"><thead><tr className="bg-bg-panel border-b border-hair-2"><th className="text-left px-2 py-1 text-10 text-ink-3">Band</th><th className="text-right px-2 py-1 text-10 text-ink-3">Count</th><th className="text-right px-2 py-1 text-10 text-ink-3">Total AED</th></tr></thead><tbody>{ct.structuringBands.map((b, i) => <tr key={i} className={`border-b border-hair-2 ${b.band.includes("sub-threshold") ? "bg-amber-dim" : b.band.includes("CTR required") ? "bg-red-dim" : ""}`}><td className="px-2 py-1 font-mono text-ink-1">{b.band}</td><td className="px-2 py-1 text-right font-mono">{b.count}</td><td className="px-2 py-1 text-right font-mono">{b.totalAed.toLocaleString()}</td></tr>)}</tbody></table></div>
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{ct.actionRationale}</div>
                      {ct.strBasis && <div className="text-10 font-mono text-red">{ct.strBasis}</div>}
                      <div className="text-10 font-mono text-ink-3">{ct.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "dnfbp-obligations" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">DNFBP Obligation Mapper · UAE FDL 10/2025 · FATF R.22-23</div>
                <p className="text-11 text-ink-3">Maps exact AML/CFT obligations by DNFBP type — gold dealers, real estate agents, lawyers, accountants, TCSPs, MSBs, VASPs — under UAE FDL 10/2025 and FATF Recommendations 22-23. Identifies triggered obligations, thresholds, and regulatory authority.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">DNFBP Type *</label><input value={dnfbpInput.dnfbpType} onChange={(e) => setDnfbpInput((p) => ({...p, dnfbpType: e.target.value}))} placeholder="e.g. gold dealer, real estate agent, lawyer, accountant, TCSP" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Transaction Type</label><input value={dnfbpInput.transactionType} onChange={(e) => setDnfbpInput((p) => ({...p, transactionType: e.target.value}))} placeholder="e.g. gold purchase, property sale, corporate formation" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Transaction Amount (AED)</label><input value={dnfbpInput.transactionAmount} onChange={(e) => setDnfbpInput((p) => ({...p, transactionAmount: e.target.value}))} placeholder="Amount" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Customer Type</label><input value={dnfbpInput.customerType} onChange={(e) => setDnfbpInput((p) => ({...p, customerType: e.target.value}))} placeholder="e.g. individual, corporate, foreign entity" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={dnfbpInput.context} onChange={(e) => setDnfbpInput((p) => ({...p, context: e.target.value}))} placeholder="Any specific scenario details..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runDnfbpObligations()} disabled={dnfbpLoading || !dnfbpInput.dnfbpType.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{dnfbpLoading ? "Mapping…" : "Map DNFBP Obligations"}</button>
                {dnfbpResult && (() => {
                  const dn = dnfbpResult;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-12 font-bold px-3 py-1 rounded bg-brand text-white">{dn.dnfbpCategory}</span>
                        {!dn.isRegulated && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">NOT REGULATED</span>}
                        {dn.cddRequired && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">CDD: {dn.cddLevel}</span>}
                        {dn.ctrRequired && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">CTR required</span>}
                      </div>
                      <div className="text-11 text-ink-1"><span className="font-semibold">Supervisor:</span> {dn.supervisoryBody}</div>
                      {dn.triggerThreshold && <div className="text-11 text-ink-1"><span className="font-semibold">Trigger:</span> {dn.triggerThreshold}</div>}
                      {dn.keyObligations.length > 0 && (
                        <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Key Obligations</div>
                        <div className="space-y-1.5">{dn.keyObligations.map((ob, i) => <div key={i} className="border border-hair-2 rounded p-2 text-11"><div className="font-semibold text-ink-0">{ob.obligation}</div><div className="text-10 font-mono text-ink-3 mt-0.5">{ob.legalBasis}{ob.deadline ? ` · ${ob.deadline}` : ""}</div>{ob.notes && <div className="text-10 text-ink-3">{ob.notes}</div>}</div>)}</div></div>
                      )}
                      {dn.prohibitedActivities.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Prohibited Activities</div><ul className="space-y-0.5">{dn.prohibitedActivities.map((p, i) => <li key={i} className="text-11 text-red flex gap-1.5"><span>✗</span>{p}</li>)}</ul></div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{dn.practicalGuidance}</div>
                      <div className="text-11 text-ink-2"><span className="font-semibold">Non-compliance:</span> {dn.sanctionsForNonCompliance}</div>
                      <div className="text-10 font-mono text-ink-3">{dn.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "cdd-refresh" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">CDD Refresh Trigger Analyzer · UAE FDL 10/2025 Art.15 · Ongoing Monitoring</div>
                <p className="text-11 text-ink-3">Determine whether a CDD refresh is legally required and at what urgency. Evaluates all mandatory and advisory trigger events under UAE FDL 10/2025 Art.15, FATF R.10, and CBUAE review frequency guidelines. Outputs EDD requirement, field list, and account action.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Customer Name</label><input value={cddRefreshInput.customerName} onChange={(e) => setCddRefreshInput((p) => ({...p, customerName: e.target.value}))} placeholder="Customer full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Current Risk Tier</label><input value={cddRefreshInput.currentRiskTier} onChange={(e) => setCddRefreshInput((p) => ({...p, currentRiskTier: e.target.value}))} placeholder="high / medium / low" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Last CDD Date</label><input value={cddRefreshInput.lastCddDate} onChange={(e) => setCddRefreshInput((p) => ({...p, lastCddDate: e.target.value}))} placeholder="DD/MM/YYYY" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Customer Type</label><input value={cddRefreshInput.customerType} onChange={(e) => setCddRefreshInput((p) => ({...p, customerType: e.target.value}))} placeholder="individual / corporate / DPMS" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Trigger Events *</label><textarea value={cddRefreshInput.triggerEvents} onChange={(e) => setCddRefreshInput((p) => ({...p, triggerEvents: e.target.value}))} rows={2} placeholder="Describe what triggered this review — e.g. adverse media hit, transaction spike, annual review due, ownership change..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Transaction Pattern Change</label><input value={cddRefreshInput.transactionPatternChange} onChange={(e) => setCddRefreshInput((p) => ({...p, transactionPatternChange: e.target.value}))} placeholder="e.g. volume 3x expected, new international wires" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Adverse Media Hit</label><input value={cddRefreshInput.adverseMediaHit} onChange={(e) => setCddRefreshInput((p) => ({...p, adverseMediaHit: e.target.value}))} placeholder="Describe adverse media if any" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runCddRefresh()} disabled={cddRefreshLoading || (!cddRefreshInput.triggerEvents.trim() && !cddRefreshInput.adverseMediaHit.trim() && !cddRefreshInput.transactionPatternChange.trim())} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{cddRefreshLoading ? "Analysing…" : "Determine CDD Refresh Requirement"}</button>
                {cddRefreshResult && (() => {
                  const cr = cddRefreshResult;
                  const urgCls = cr.urgency === "immediate" ? "bg-red text-white" : cr.urgency === "within_30_days" ? "bg-amber-dim text-amber" : cr.urgency === "within_90_days" ? "bg-yellow-dim text-yellow-600" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${cr.refreshRequired ? "bg-red text-white" : "bg-green-dim text-green"}`}>{cr.refreshRequired ? "REFRESH REQUIRED" : "NO REFRESH NEEDED"}</span>
                        {cr.refreshRequired && <span className={`font-mono text-11 px-3 py-1 rounded uppercase ${urgCls}`}>{cr.urgency.replace(/_/g, " ")}</span>}
                        {cr.eddRequired && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">EDD required</span>}
                      </div>
                      {cr.eddReason && <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1"><span className="font-semibold">EDD Reason: </span>{cr.eddReason}</div>}
                      {cr.triggerEvents.length > 0 && (
                        <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Trigger Analysis</div>
                        <div className="space-y-1.5">{cr.triggerEvents.map((te, i) => <div key={i} className={`border rounded p-2 text-11 flex gap-2 ${te.triggered ? (te.severity === "mandatory" ? "border-red bg-red-dim" : "border-amber bg-amber-dim") : "border-hair-2 bg-bg-panel opacity-60"}`}><span>{te.triggered ? "✓" : "○"}</span><div><div className="font-semibold text-ink-0">{te.event}</div><div className="text-10 font-mono text-ink-3">{te.legalBasis}{te.deadline ? ` · ${te.deadline}` : ""}</div></div></div>)}</div></div>
                      )}
                      {cr.fieldsToReverify.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Fields to Re-verify</div><ul className="space-y-0.5">{cr.fieldsToReverify.map((f, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-amber">→</span>{f}</li>)}</ul></div>}
                      {cr.accountActionPending && <div className="bg-amber-dim border border-amber rounded p-3 text-11 text-amber font-semibold">⚠ Account Action: {cr.accountActionPending}</div>}
                      {cr.reviewDeadline && <div className="text-11 text-ink-1"><span className="font-semibold">Review Deadline:</span> <span className="font-mono text-red">{cr.reviewDeadline}</span></div>}
                      <div className="text-10 font-mono text-ink-3">{cr.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "vasp-risk" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">VASP Risk Classifier · VARA · FATF R.15 · Travel Rule</div>
                <p className="text-11 text-ink-3">Assess Virtual Asset Service Provider (VASP) onboarding or correspondent risk. Evaluates VARA licensing, Travel Rule compliance, custody model, geographic exposure, darknet and mixer exposure, and AML programme quality against FATF R.15 and UAE CBUAE VASP guidance.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">VASP Name *</label><input value={vaspInput.vaspName} onChange={(e) => setVaspInput((p) => ({...p, vaspName: e.target.value}))} placeholder="Name of exchange or platform" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">VASP Jurisdiction</label><input value={vaspInput.vaspJurisdiction} onChange={(e) => setVaspInput((p) => ({...p, vaspJurisdiction: e.target.value}))} placeholder="Where incorporated/licensed" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Exchange Type</label><input value={vaspInput.exchangeType} onChange={(e) => setVaspInput((p) => ({...p, exchangeType: e.target.value}))} placeholder="CEX / DEX / P2P / OTC desk" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Custody Model</label><input value={vaspInput.custodyModel} onChange={(e) => setVaspInput((p) => ({...p, custodyModel: e.target.value}))} placeholder="custodial / non-custodial / hybrid" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Travel Rule Protocol</label><input value={vaspInput.travelRuleProtocol} onChange={(e) => setVaspInput((p) => ({...p, travelRuleProtocol: e.target.value}))} placeholder="e.g. TRISA, OpenVASP, Notabene, none" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Licence Number</label><input value={vaspInput.licenceNumber} onChange={(e) => setVaspInput((p) => ({...p, licenceNumber: e.target.value}))} placeholder="VARA / ADGM licence ref if known" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Blockchain Analytics Tool</label><input value={vaspInput.blockchainAnalyticsTool} onChange={(e) => setVaspInput((p) => ({...p, blockchainAnalyticsTool: e.target.value}))} placeholder="Chainalysis / Elliptic / TRM Labs / none" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Geographic Reach</label><input value={vaspInput.geographicReach} onChange={(e) => setVaspInput((p) => ({...p, geographicReach: e.target.value}))} placeholder="Countries served, high-risk jurisdictions" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runVaspRisk()} disabled={vaspLoading || !vaspInput.vaspName.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{vaspLoading ? "Assessing…" : "Assess VASP Risk"}</button>
                {vaspResult && (() => {
                  const vr = vaspResult;
                  const riskCls = vr.overallRisk === "critical" ? "bg-red text-white" : vr.overallRisk === "high" ? "bg-amber-dim text-amber" : vr.overallRisk === "medium" ? "bg-yellow-dim text-yellow-600" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>VASP Risk: {vr.overallRisk}</span>
                        <span className={`font-mono text-11 px-2 py-px rounded ${vr.varaLicensed ? "bg-green-dim text-green" : "bg-red text-white"}`}>{vr.varaLicensed ? "VARA Licensed" : "Not VARA Licensed"}</span>
                        <span className={`font-mono text-11 px-2 py-px rounded ${vr.travelRuleCompliant ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>{vr.travelRuleCompliant ? "Travel Rule ✓" : "Travel Rule ✗"}</span>
                        {vr.sanctionedExposure && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">Sanctions exposure</span>}
                      </div>
                      <p className="text-12 text-ink-1">{vr.travelRuleAssessment}</p>
                      {vr.highRiskJurisdictions.length > 0 && <div className="flex flex-wrap gap-1.5">{vr.highRiskJurisdictions.map((j, i) => <span key={i} className="text-10 font-mono px-2 py-px rounded bg-amber-dim text-amber">⚠ {j}</span>)}</div>}
                      {vr.riskIndicators.length > 0 && <div className="space-y-1.5">{vr.riskIndicators.map((ri, i) => <div key={i} className={`border rounded p-2 text-11 ${ri.severity === "critical" ? "border-red bg-red-dim" : ri.severity === "high" ? "border-amber bg-amber-dim" : "border-hair-2 bg-bg-panel"}`}><div className="font-semibold text-ink-0">{ri.indicator}</div><div className="text-10 text-ink-3 mt-0.5">{ri.detail}</div></div>)}</div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{vr.actionRationale}</div>
                      {vr.requiredDocumentation.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Documentation</div><ul className="space-y-0.5">{vr.requiredDocumentation.map((d, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{d}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{vr.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "goaml-validator" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">goAML STR Validator · UAE FIU · FDL 10/2025 Art.26</div>
                <p className="text-11 text-ink-3">Validates an STR draft against UAE FIU goAML schema requirements before filing. Checks field completeness, narrative quality, and suspicion crystallisation date. Outputs a corrected narrative, critical issues, and an improved draft paragraph ready for submission.</p>
                <div className="space-y-3">
                  <div><label className="block text-10 text-ink-3 mb-1">STR Narrative Draft *</label><textarea value={goAmlInput.narrative} onChange={(e) => setGoAmlInput((p) => ({...p, narrative: e.target.value}))} rows={5} placeholder="Paste your draft STR narrative here for validation..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={goAmlInput.subjectName} onChange={(e) => setGoAmlInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Subject full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Subject ID Number</label><input value={goAmlInput.subjectIdNumber} onChange={(e) => setGoAmlInput((p) => ({...p, subjectIdNumber: e.target.value}))} placeholder="Emirates ID / passport number" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Account Numbers</label><input value={goAmlInput.accountNumbers} onChange={(e) => setGoAmlInput((p) => ({...p, accountNumbers: e.target.value}))} placeholder="All relevant account numbers" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Reporting Entity</label><input value={goAmlInput.reportingEntityName} onChange={(e) => setGoAmlInput((p) => ({...p, reportingEntityName: e.target.value}))} placeholder="Your institution name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">MLRO Name</label><input value={goAmlInput.mlroName} onChange={(e) => setGoAmlInput((p) => ({...p, mlroName: e.target.value}))} placeholder="MLRO full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Transaction Summary</label><input value={goAmlInput.transactionSummary} onChange={(e) => setGoAmlInput((p) => ({...p, transactionSummary: e.target.value}))} placeholder="Brief transaction summary" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runGoAmlValidator()} disabled={goAmlLoading || !goAmlInput.narrative.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{goAmlLoading ? "Validating…" : "Validate STR for goAML"}</button>
                {goAmlResult && (() => {
                  const gv = goAmlResult;
                  const statusCls = gv.overallStatus === "ready_to_file" ? "bg-green-dim text-green" : gv.overallStatus === "rejected" ? "bg-red text-white" : "bg-amber-dim text-amber";
                  const nqCls = gv.narrativeQuality === "excellent" || gv.narrativeQuality === "good" ? "text-green" : gv.narrativeQuality === "adequate" ? "text-amber" : "text-red";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${statusCls}`}>{gv.overallStatus.replace(/_/g, " ")}</span>
                        <span className="font-mono text-11 text-ink-2">Completeness: {gv.completenessScore}%</span>
                        <span className={`font-mono text-11 ${nqCls}`}>Narrative: {gv.narrativeQuality}</span>
                      </div>
                      {gv.criticalIssues.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-red mb-1">Critical Issues ({gv.criticalIssues.length})</div><ul className="space-y-0.5">{gv.criticalIssues.map((i, idx) => <li key={idx} className="text-11 text-red flex gap-1.5"><span>✗</span>{i}</li>)}</ul></div>}
                      {gv.warnings.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-amber mb-1">Warnings</div><ul className="space-y-0.5">{gv.warnings.map((w, i) => <li key={i} className="text-11 text-amber flex gap-1.5"><span>⚠</span>{w}</li>)}</ul></div>}
                      {gv.fieldChecks.length > 0 && (
                        <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">Field Checklist</div>
                        <div className="grid grid-cols-2 gap-1">{gv.fieldChecks.map((fc, i) => <div key={i} className={`text-10 px-2 py-1 rounded ${fc.status === "complete" ? "bg-green-dim text-green" : fc.status === "missing" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{fc.status === "complete" ? "✓" : fc.status === "missing" ? "✗" : "~"} {fc.field}</div>)}</div></div>
                      )}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Narrative Feedback</div>{gv.narrativeFeedback}</div>
                      {gv.narrativeWeaknesses.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Narrative Weaknesses</div><ul className="space-y-0.5">{gv.narrativeWeaknesses.map((w, i) => <li key={i} className="text-11 text-amber flex gap-1.5"><span>→</span>{w}</li>)}</ul></div>}
                      {gv.improvedNarrativeSuggestion && <div className="bg-bg-0 border border-brand rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-brand mb-1">Improved Narrative Draft</div><p className="text-11 text-ink-1 leading-relaxed">{gv.improvedNarrativeSuggestion}</p></div>}
                      <div className="text-10 font-mono text-ink-3">{gv.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "pep-edd" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">PEP EDD Package Generator · UAE FDL 10/2025 Art.14(2) · FATF R.12</div>
                <p className="text-11 text-ink-3">Generates a complete Politically Exposed Person EDD package: classification, risk rating, full EDD questionnaire, SOW/SOF assessment, required documentation list, ongoing monitoring plan, and a signed MLRO memo template. Senior management approval requirements automatically flagged.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">PEP Name *</label><input value={pepEddInput.pepName} onChange={(e) => setPepEddInput((p) => ({...p, pepName: e.target.value}))} placeholder="Full name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">PEP Role / Position</label><input value={pepEddInput.pepRole} onChange={(e) => setPepEddInput((p) => ({...p, pepRole: e.target.value}))} placeholder="e.g. Minister of Finance, Ambassador, CEO of SOE" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">PEP Jurisdiction</label><input value={pepEddInput.pepJurisdiction} onChange={(e) => setPepEddInput((p) => ({...p, pepJurisdiction: e.target.value}))} placeholder="Country of political role" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">PEP Classification</label><input value={pepEddInput.pepClassification} onChange={(e) => setPepEddInput((p) => ({...p, pepClassification: e.target.value}))} placeholder="domestic / foreign / IO / former / family / associate" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Proposed Relationship</label><input value={pepEddInput.relationshipType} onChange={(e) => setPepEddInput((p) => ({...p, relationshipType: e.target.value}))} placeholder="e.g. current account, trade finance, investment" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Known Wealth / Income</label><input value={pepEddInput.knownWealth} onChange={(e) => setPepEddInput((p) => ({...p, knownWealth: e.target.value}))} placeholder="e.g. declared salary, known business interests" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><textarea value={pepEddInput.context} onChange={(e) => setPepEddInput((p) => ({...p, context: e.target.value}))} rows={2} placeholder="Any additional relevant context..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runPepEdd()} disabled={pepEddLoading || !pepEddInput.pepName.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{pepEddLoading ? "Generating…" : "Generate PEP EDD Package"}</button>
                {pepEddResult && (() => {
                  const pe = pepEddResult;
                  const riskCls = pe.riskRating === "very_high" ? "bg-red text-white" : pe.riskRating === "high" ? "bg-amber-dim text-amber" : "bg-yellow-dim text-yellow-600";
                  const actionCls = pe.recommendedAction === "decline" || pe.recommendedAction === "exit_relationship" ? "bg-red text-white" : pe.recommendedAction === "refer_senior_management" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>{pe.riskRating.replace("_", " ")} RISK</span>
                        <span className={`font-mono text-11 px-3 py-1 rounded uppercase ${actionCls}`}>{pe.recommendedAction.replace(/_/g, " ")}</span>
                        {pe.seniorManagementApproval && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">Senior mgmt approval required</span>}
                      </div>
                      <div className="text-11 text-ink-1"><span className="font-semibold">Classification:</span> {pe.pepClassification.replace(/_/g, " ")} · {pe.pepRole} · {pe.pepJurisdiction}</div>
                      <div className="text-11 text-amber font-semibold">{pe.approvalLevel}</div>
                      {pe.eddQuestionnaire.length > 0 && (
                        <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-2">EDD Questionnaire ({pe.eddQuestionnaire.length} questions)</div>
                        <div className="space-y-2">{pe.eddQuestionnaire.map((q, i) => <div key={i} className="border border-hair-2 rounded p-2.5 bg-bg-panel"><div className="text-10 font-semibold text-brand uppercase">{q.category}</div><div className="text-11 text-ink-0 mt-1">{q.question}</div><div className="text-10 text-ink-3 mt-1">{q.purpose}</div>{q.documentaryEvidence && <div className="text-10 font-mono text-ink-3">Evidence: {q.documentaryEvidence}</div>}</div>)}</div></div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">SOW Assessment</div><p className="text-11 text-ink-1">{pe.sourceOfWealthAssessment}</p></div>
                        <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">SOF Assessment</div><p className="text-11 text-ink-1">{pe.sourceOfFundsAssessment}</p></div>
                      </div>
                      {pe.requiredDocumentation.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Documentation</div><ul className="space-y-0.5">{pe.requiredDocumentation.map((d, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{d}</li>)}</ul></div>}
                      <div className="bg-bg-0 border border-brand rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-brand mb-1">MLRO Memo Template</div><pre className="text-10 text-ink-1 font-mono whitespace-pre-wrap leading-relaxed">{pe.pepMemo}</pre></div>
                      <div className="text-11 text-ink-1"><span className="font-semibold">Monitoring:</span> {pe.ongoingMonitoringFrequency}</div>
                      <div className="text-10 font-mono text-ink-3">{pe.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {superToolsTab === "sanctions-mapper" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Sanctions Exposure Mapper · EOCN · OFAC · UN · EU · HMT</div>
                <p className="text-11 text-ink-3">Multi-list sanctions exposure map for a named entity. Assesses exposure across UAE EOCN, OFAC SDN, UN Consolidated List, EU, HMT, and DFAT with per-list hit status, asset freeze obligations, dealing prohibitions, and reporting deadlines. Immediate freeze triggered for EOCN/UN hits.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 text-ink-3 mb-1">Entity Name *</label><input value={sanctionsMapInput.entityName} onChange={(e) => setSanctionsMapInput((p) => ({...p, entityName: e.target.value}))} placeholder="Full name to screen" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Entity Type</label><input value={sanctionsMapInput.entityType} onChange={(e) => setSanctionsMapInput((p) => ({...p, entityType: e.target.value}))} placeholder="individual / corporate / vessel / aircraft" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Nationality / Country</label><input value={sanctionsMapInput.nationality} onChange={(e) => setSanctionsMapInput((p) => ({...p, nationality: e.target.value}))} placeholder="Nationality or country of incorporation" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Date of Birth</label><input value={sanctionsMapInput.dob} onChange={(e) => setSanctionsMapInput((p) => ({...p, dob: e.target.value}))} placeholder="DD/MM/YYYY (individuals)" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Passport / ID Number</label><input value={sanctionsMapInput.passportNumber} onChange={(e) => setSanctionsMapInput((p) => ({...p, passportNumber: e.target.value}))} placeholder="Document number" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Known Aliases</label><input value={sanctionsMapInput.aliases} onChange={(e) => setSanctionsMapInput((p) => ({...p, aliases: e.target.value}))} placeholder="Alternative names, transliterations" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={sanctionsMapInput.context} onChange={(e) => setSanctionsMapInput((p) => ({...p, context: e.target.value}))} placeholder="Jurisdiction of activity, transaction context, counterparties..." className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runSanctionsMapper()} disabled={sanctionsMapLoading || !sanctionsMapInput.entityName.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{sanctionsMapLoading ? "Mapping…" : "Map Sanctions Exposure"}</button>
                {sanctionsMapResult && (() => {
                  const sm = sanctionsMapResult;
                  const expCls = sm.overallExposure === "confirmed_hit" ? "bg-red text-white" : sm.overallExposure === "high" ? "bg-amber-dim text-amber" : sm.overallExposure === "medium" ? "bg-yellow-dim text-yellow-600" : sm.overallExposure === "none" ? "bg-green-dim text-green" : "bg-bg-2 text-ink-2";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${expCls}`}>Exposure: {sm.overallExposure.replace("_", " ")}</span>
                        {sm.immediateFreeze && <span className="font-mono text-11 px-3 py-1 rounded bg-red text-white font-bold animate-pulse">⚠️ FREEZE NOW</span>}
                        {sm.dealingProhibition && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">Dealing prohibited</span>}
                        {sm.tippingOffRisk && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">Tipping-off risk</span>}
                      </div>
                      {sm.immediateFreeze && <div className="bg-red text-white rounded p-3 text-11 font-semibold">{sm.freezeBasis}</div>}
                      <div className="border border-hair-2 rounded overflow-hidden">
                        <table className="w-full text-11">
                          <thead><tr className="bg-bg-panel border-b border-hair-2"><th className="text-left px-2 py-1.5 text-10 text-ink-3">List</th><th className="text-left px-2 py-1.5 text-10 text-ink-3">Authority</th><th className="text-center px-2 py-1.5 text-10 text-ink-3">Hit</th><th className="text-center px-2 py-1.5 text-10 text-ink-3">Freeze</th></tr></thead>
                          <tbody>{sm.listHits.map((lh, i) => <tr key={i} className={`border-b border-hair-2 ${lh.hitType === "confirmed" ? "bg-red-dim" : lh.hitType === "possible" ? "bg-amber-dim" : ""}`}><td className="px-2 py-1.5 font-mono text-10 font-semibold">{lh.list}</td><td className="px-2 py-1.5 text-10 text-ink-3">{lh.listAuthority}</td><td className="px-2 py-1.5 text-center"><span className={`text-10 font-mono px-1.5 py-px rounded ${lh.hitType === "confirmed" ? "bg-red text-white" : lh.hitType === "possible" ? "bg-amber-dim text-amber" : lh.hitType === "name_match" ? "bg-yellow-dim text-yellow-700" : "bg-green-dim text-green"}`}>{lh.hitType}</span></td><td className="px-2 py-1.5 text-center font-mono text-10">{lh.assetFreezeRequired ? <span className="text-red font-bold">FREEZE</span> : "—"}</td></tr>)}</tbody>
                        </table>
                      </div>
                      {sm.complianceObligations.length > 0 && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Compliance Obligations</div><ul className="space-y-0.5">{sm.complianceObligations.map((ob, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{ob}</li>)}</ul></div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{sm.actionRationale}</div>
                      {sm.frozenAssetReportingDeadline && <div className="text-11 text-red font-semibold">Frozen Asset Report Deadline: {sm.frozenAssetReportingDeadline}</div>}
                      <div className="text-10 font-mono text-ink-3">{sm.regulatoryBasis}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Wave 3 Panels ─────────────────────────────────────────────── */}

            {/* Layering Detector */}
            {superToolsTab === "layering-detector" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Layering Detector · Placement / Layering / Integration</div>
                <p className="text-11 text-ink-3">Analyses transaction descriptions to detect all three ML stages — placement, layering, and integration — including account hopping, round-trip structures, and structuring patterns per UAE FDL 10/2025 and FATF typologies.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Transaction Description *</label><textarea value={layeringInput.transactions} onChange={(e) => setLayeringInput((p) => ({...p, transactions: e.target.value}))} rows={4} placeholder="Describe the transaction pattern, amounts, account movements…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={layeringInput.subjectName} onChange={(e) => setLayeringInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Full subject name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Account References</label><input value={layeringInput.accountRefs} onChange={(e) => setLayeringInput((p) => ({...p, accountRefs: e.target.value}))} placeholder="Account IDs involved" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Period (days)</label><input value={layeringInput.periodDays} onChange={(e) => setLayeringInput((p) => ({...p, periodDays: e.target.value}))} placeholder="e.g. 30" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={layeringInput.context} onChange={(e) => setLayeringInput((p) => ({...p, context: e.target.value}))} placeholder="Any other context" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runLayeringDetector()} disabled={layeringLoading || !layeringInput.transactions.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{layeringLoading ? "Analysing…" : "Detect Layering Stages"}</button>
                {layeringResult && (() => {
                  const r = layeringResult as Record<string, unknown>;
                  const risk = r["layeringRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>Layering Risk: {risk}</span>
                        <span className="font-mono text-11 px-2 py-px rounded bg-brand-dim text-brand-deep">Stage: {String(r["stageDetected"]).replace(/_/g, " ")}</span>
                        <span className="font-mono text-11 px-2 py-px rounded bg-bg-2 text-ink-2">Action: {String(r["recommendedAction"]).replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{String(r["velocityAnalysis"] ?? "")}</p>
                      {Array.isArray(r["indicators"]) && (r["indicators"] as Array<Record<string,unknown>>).map((ind, i) => (
                        <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-9 font-mono px-1.5 py-px rounded uppercase ${ind["severity"] === "critical" ? "bg-red text-white" : ind["severity"] === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{String(ind["severity"])}</span>
                            <span className="text-11 font-semibold text-ink-0">{String(ind["indicator"])}</span>
                            <span className="text-10 text-ink-3 font-mono">{String(ind["stage"])}</span>
                          </div>
                          <p className="text-11 text-ink-2">{String(ind["detail"])}</p>
                        </div>
                      ))}
                      {Array.isArray(r["requiredActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div><ul className="space-y-0.5">{(r["requiredActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Real Estate ML Analyzer */}
            {superToolsTab === "real-estate-ml" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Real Estate ML Analyzer · DLD / RERA / FATF R.22</div>
                <p className="text-11 text-ink-3">Screens UAE real estate transactions for ML red flags: price manipulation, all-cash purchases, third-party payments, rapid flipping, off-plan structuring, and beneficial ownership opacity per FATF 2022 Real Estate Guidance and UAE FDL 10/2025 DNFBP requirements.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Property Details *</label><textarea value={realEstateMlInput.propertyDetails} onChange={(e) => setRealEstateMlInput((p) => ({...p, propertyDetails: e.target.value}))} rows={3} placeholder="Property type, location, development name, transaction structure…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Buyer Name</label><input value={realEstateMlInput.buyerName} onChange={(e) => setRealEstateMlInput((p) => ({...p, buyerName: e.target.value}))} placeholder="Full buyer name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Buyer Nationality</label><input value={realEstateMlInput.buyerNationality} onChange={(e) => setRealEstateMlInput((p) => ({...p, buyerNationality: e.target.value}))} placeholder="Nationality" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Payment Method</label><input value={realEstateMlInput.paymentMethod} onChange={(e) => setRealEstateMlInput((p) => ({...p, paymentMethod: e.target.value}))} placeholder="cash / bank transfer / mortgage / mixed" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Purchase Price (AED)</label><input value={realEstateMlInput.purchasePrice} onChange={(e) => setRealEstateMlInput((p) => ({...p, purchasePrice: e.target.value}))} placeholder="e.g. 3,800,000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Market Value / Benchmark</label><input value={realEstateMlInput.marketValue} onChange={(e) => setRealEstateMlInput((p) => ({...p, marketValue: e.target.value}))} placeholder="e.g. 4,850,000" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Agent / Broker Name</label><input value={realEstateMlInput.agentName} onChange={(e) => setRealEstateMlInput((p) => ({...p, agentName: e.target.value}))} placeholder="RERA-registered agent" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={realEstateMlInput.context} onChange={(e) => setRealEstateMlInput((p) => ({...p, context: e.target.value}))} placeholder="Third-party payments, flipping history…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runRealEstateMl()} disabled={realEstateMlLoading || !realEstateMlInput.propertyDetails.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{realEstateMlLoading ? "Analysing…" : "Analyse Real Estate Transaction"}</button>
                {realEstateMlResult && (() => {
                  const r = realEstateMlResult as Record<string, unknown>;
                  const risk = r["mlRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>ML Risk: {risk}</span>
                        <span className="font-mono text-11 px-2 py-px rounded bg-brand-dim text-brand-deep">Action: {String(r["recommendedAction"]).replace(/_/g, " ")}</span>
                        {Boolean(r["priceManipulation"]) && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">Price Manipulation</span>}
                        {Boolean(r["rapidFlipping"]) && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">Rapid Flipping</span>}
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{String(r["actionRationale"] ?? "")}</p>
                      {Array.isArray(r["indicators"]) && (r["indicators"] as Array<Record<string,unknown>>).map((ind, i) => (
                        <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-9 font-mono px-1.5 py-px rounded uppercase ${ind["severity"] === "critical" ? "bg-red text-white" : ind["severity"] === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{String(ind["severity"])}</span>
                            <span className="text-11 font-semibold text-ink-0">{String(ind["indicator"])}</span>
                          </div>
                          <div className="text-10 font-mono text-ink-3 mb-0.5">{String(ind["fatfRef"] ?? "")}</div>
                          <p className="text-11 text-ink-2">{String(ind["detail"])}</p>
                        </div>
                      ))}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Asset Tracer */}
            {superToolsTab === "asset-tracer" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Asset Tracer · ML Stage-by-Stage Fund Tracing</div>
                <p className="text-11 text-ink-3">Traces fund flows through ML stages (placement → layering → integration), identifies traceable assets, assesses confiscation potential, and outlines investigative and MLAT requirements per UAE Federal Law 4/2002 and UNCAC asset recovery provisions.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Initial Funds Description *</label><textarea value={assetTracerInput.initialFunds} onChange={(e) => setAssetTracerInput((p) => ({...p, initialFunds: e.target.value}))} rows={3} placeholder="Describe the initial funds — origin, amount, form (cash, wire, crypto)…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Suspected Criminal Source</label><input value={assetTracerInput.suspectedSource} onChange={(e) => setAssetTracerInput((p) => ({...p, suspectedSource: e.target.value}))} placeholder="e.g. fraud, bribery, drug trafficking" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Tracing Period</label><input value={assetTracerInput.tracingPeriod} onChange={(e) => setAssetTracerInput((p) => ({...p, tracingPeriod: e.target.value}))} placeholder="e.g. Jan 2023 – Dec 2024" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={assetTracerInput.subjectName} onChange={(e) => setAssetTracerInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Subject / defendant name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Jurisdictions Involved</label><input value={assetTracerInput.jurisdictions} onChange={(e) => setAssetTracerInput((p) => ({...p, jurisdictions: e.target.value}))} placeholder="UAE, BVI, Cyprus…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runAssetTracer()} disabled={assetTracerLoading || !assetTracerInput.initialFunds.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{assetTracerLoading ? "Tracing…" : "Trace Assets"}</button>
                {assetTracerResult && (() => {
                  const r = assetTracerResult as Record<string, unknown>;
                  const risk = r["tracingRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>Tracing Risk: {risk}</span>
                        {Boolean(r["confiscationPotential"]) && <span className="font-mono text-11 px-2 py-px rounded bg-red-dim text-red">Confiscation Potential</span>}
                        {Boolean(r["mutualLegalAssistanceRequired"]) && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">MLAT Required</span>}
                      </div>
                      {Array.isArray(r["tracingStages"]) && (r["tracingStages"] as Array<Record<string,unknown>>).map((stage, i) => (
                        <div key={i} className="border border-hair-2 rounded p-3 bg-bg-panel">
                          <div className="text-11 font-semibold text-ink-0 mb-1">Stage {String(stage["stage"])}: {String(stage["description"]).slice(0, 120)}…</div>
                          <div className="text-10 font-mono text-ink-3">Jurisdictions: {Array.isArray(stage["jurisdictions"]) ? (stage["jurisdictions"] as string[]).join(", ") : ""}</div>
                          <div className="text-10 font-mono text-ink-3">Amount: AED {Number(stage["amountAed"] ?? 0).toLocaleString()}</div>
                          <div className="text-10 text-ink-3 mt-0.5">{String(stage["evidenceType"] ?? "")}</div>
                        </div>
                      ))}
                      {Boolean(r["confiscationBasis"]) && <div className="bg-red-dim rounded p-3 text-11 text-red">{String(r["confiscationBasis"])}</div>}
                      {Array.isArray(r["investigativeSteps"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Investigative Steps</div><ul className="space-y-0.5">{(r["investigativeSteps"] as string[]).map((s, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{s}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SOW Calculator */}
            {superToolsTab === "sow-calculator" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Source of Wealth Calculator · PEP / Illicit Enrichment</div>
                <p className="text-11 text-ink-3">Reconciles declared income streams against declared assets to identify unexplained wealth gaps and illicit enrichment risk per UNCAC Art.20, UAE FDL 10/2025 EDD requirements, and FATF R.12 PEP SOW/SOF standards.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Declared Income (description) *</label><textarea value={sowInput.declaredIncome} onChange={(e) => setSowInput((p) => ({...p, declaredIncome: e.target.value}))} rows={3} placeholder="Describe income sources — salary, business income, rental, investments, inheritance…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={sowInput.subjectName} onChange={(e) => setSowInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Full subject name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Review Period (years)</label><input value={sowInput.periodYears} onChange={(e) => setSowInput((p) => ({...p, periodYears: e.target.value}))} placeholder="e.g. 7" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                  <div><label className="block text-10 text-ink-3 mb-1">Declared Assets</label><textarea value={sowInput.declaredAssets} onChange={(e) => setSowInput((p) => ({...p, declaredAssets: e.target.value}))} rows={2} placeholder="Properties, vehicles, investments, bank balances…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Known Expenditures</label><input value={sowInput.knownExpenditures} onChange={(e) => setSowInput((p) => ({...p, knownExpenditures: e.target.value}))} placeholder="School fees, rent, club memberships…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runSowCalculator()} disabled={sowLoading || !sowInput.declaredIncome.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{sowLoading ? "Calculating…" : "Calculate SOW Gap"}</button>
                {sowResult && (() => {
                  const r = sowResult as Record<string, unknown>;
                  const risk = r["sowRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>SOW Risk: {risk}</span>
                        {Boolean(r["illicitEnrichmentRisk"]) && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">Illicit Enrichment Risk</span>}
                        <span className="font-mono text-11 px-2 py-px rounded bg-bg-2 text-ink-2">Unexplained: AED {Number(r["unexplainedWealthAed"] ?? 0).toLocaleString()} ({String(r["unexplainedWealthPct"] ?? 0)}%)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="border border-hair-2 rounded p-2 text-center"><div className="text-10 text-ink-3 mb-0.5">Declared Income</div><div className="font-mono text-12 font-semibold text-ink-0">AED {Number(r["totalDeclaredIncomeAed"] ?? 0).toLocaleString()}</div></div>
                        <div className="border border-hair-2 rounded p-2 text-center"><div className="text-10 text-ink-3 mb-0.5">Declared Assets</div><div className="font-mono text-12 font-semibold text-ink-0">AED {Number(r["totalDeclaredAssetsAed"] ?? 0).toLocaleString()}</div></div>
                        <div className={`border rounded p-2 text-center ${risk === "critical" || risk === "high" ? "border-red-dim bg-red-dim" : "border-hair-2"}`}><div className="text-10 text-ink-3 mb-0.5">Unexplained Gap</div><div className="font-mono text-12 font-semibold text-red">AED {Number(r["unexplainedWealthAed"] ?? 0).toLocaleString()}</div></div>
                      </div>
                      {Array.isArray(r["redFlags"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Red Flags</div><ul className="space-y-0.5">{(r["redFlags"] as string[]).map((f, i) => <li key={i} className="text-11 text-red flex gap-1.5"><span>⚠</span>{f}</li>)}</ul></div>}
                      <div className="bg-bg-panel border border-hair-2 rounded p-3 text-11 text-ink-1">{String(r["recommendation"] ?? "")}</div>
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Insider Threat Screen */}
            {superToolsTab === "insider-threat-screen" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Insider Threat Screen · Tipping-Off · Financial Crime Facilitation</div>
                <p className="text-11 text-ink-3">Assesses employee behaviour, lifestyle indicators, system access patterns, and financial circumstances for insider threat categories including financial crime facilitation, tipping off (FDL 10/2025 Art.20), fraud, and bribery. Provides coordinated HR and compliance action recommendations.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Employee Name</label><input value={insiderInput.employeeName} onChange={(e) => setInsiderInput((p) => ({...p, employeeName: e.target.value}))} placeholder="Full employee name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Employee Role *</label><input value={insiderInput.employeeRole} onChange={(e) => setInsiderInput((p) => ({...p, employeeRole: e.target.value}))} placeholder="e.g. Relationship Manager, MLRO" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Observed Behaviours *</label><textarea value={insiderInput.observedBehaviours} onChange={(e) => setInsiderInput((p) => ({...p, observedBehaviours: e.target.value}))} rows={3} placeholder="Describe observed behaviours, access anomalies, system logs, communications…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">System Access Level</label><input value={insiderInput.accessLevel} onChange={(e) => setInsiderInput((p) => ({...p, accessLevel: e.target.value}))} placeholder="e.g. MLRO case system, customer data, treasury" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Financial Circumstances</label><input value={insiderInput.financialCircumstances} onChange={(e) => setInsiderInput((p) => ({...p, financialCircumstances: e.target.value}))} placeholder="Salary, lifestyle observations, unexplained wealth" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={insiderInput.context} onChange={(e) => setInsiderInput((p) => ({...p, context: e.target.value}))} placeholder="Any other relevant context" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runInsiderThreat()} disabled={insiderLoading || (!insiderInput.observedBehaviours.trim() && !insiderInput.employeeRole.trim())} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{insiderLoading ? "Screening…" : "Screen Insider Threat"}</button>
                {insiderResult && (() => {
                  const r = insiderResult as Record<string, unknown>;
                  const risk = r["threatRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>Threat Risk: {risk}</span>
                        <span className="font-mono text-11 px-2 py-px rounded bg-brand-dim text-brand-deep">Action: {String(r["recommendedAction"]).replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-12 text-ink-1 leading-relaxed">{String(r["actionRationale"] ?? "")}</p>
                      {Array.isArray(r["lifestyleRiskFlags"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Lifestyle Risk Flags</div><ul className="space-y-0.5">{(r["lifestyleRiskFlags"] as string[]).map((f, i) => <li key={i} className="text-11 text-amber flex gap-1.5"><span>⚠</span>{f}</li>)}</ul></div>}
                      {Array.isArray(r["complianceActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Compliance Actions</div><ul className="space-y-0.5">{(r["complianceActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Board AML Report */}
            {superToolsTab === "board-aml-report" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Board AML Report Generator · Quarterly MIS · FDL 10/2025 Art.5(2)</div>
                <p className="text-11 text-ink-3">Generates comprehensive quarterly Board AML/CFT reports including executive summaries, KPI commentary, MLRO updates, regulatory highlights, open audit findings, upcoming obligations, and board recommendations per CBUAE AML/CFT Guidelines §3.2.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Name</label><input value={boardAmlInput.institutionName} onChange={(e) => setBoardAmlInput((p) => ({...p, institutionName: e.target.value}))} placeholder="Institution / entity name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Reporting Period *</label><input value={boardAmlInput.reportingPeriod} onChange={(e) => setBoardAmlInput((p) => ({...p, reportingPeriod: e.target.value}))} placeholder="e.g. Q1 2026" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">STR Count</label><input value={boardAmlInput.strCount} onChange={(e) => setBoardAmlInput((p) => ({...p, strCount: e.target.value}))} placeholder="e.g. 8 STRs filed" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">CTR Count</label><input value={boardAmlInput.ctrCount} onChange={(e) => setBoardAmlInput((p) => ({...p, ctrCount: e.target.value}))} placeholder="e.g. 124 CTRs filed" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Training Completion</label><input value={boardAmlInput.trainingCompletion} onChange={(e) => setBoardAmlInput((p) => ({...p, trainingCompletion: e.target.value}))} placeholder="e.g. 87% (43/50 staff)" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Open Audit Findings</label><input value={boardAmlInput.openFindings} onChange={(e) => setBoardAmlInput((p) => ({...p, openFindings: e.target.value}))} placeholder="Summary of open findings" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={boardAmlInput.context} onChange={(e) => setBoardAmlInput((p) => ({...p, context: e.target.value}))} placeholder="Regulatory developments, key incidents, programme changes…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runBoardAmlReport()} disabled={boardAmlLoading || (!boardAmlInput.reportingPeriod.trim() && !boardAmlInput.institutionName.trim())} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{boardAmlLoading ? "Generating…" : "Generate Board AML Report"}</button>
                {boardAmlResult && (() => {
                  const r = boardAmlResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5">Executive Summary</div><p className="text-12 text-ink-0 leading-relaxed whitespace-pre-wrap">{String(r["executiveSummary"] ?? "")}</p></div>
                      {Array.isArray(r["keyMetrics"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Key Metrics</div><div className="space-y-2">{(r["keyMetrics"] as Array<Record<string,unknown>>).map((m, i) => <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel"><div className="flex items-center justify-between mb-1"><span className="text-11 font-semibold text-ink-0">{String(m["metric"])}</span><span className="font-mono text-10 text-brand">{String(m["value"])}</span></div><p className="text-11 text-ink-2">{String(m["commentary"] ?? "")}</p></div>)}</div></div>}
                      {Array.isArray(r["boardRecommendations"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Board Recommendations</div><ul className="space-y-0.5">{(r["boardRecommendations"] as string[]).map((rec, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{rec}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Enforcement Exposure */}
            {superToolsTab === "enforcement-exposure" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Enforcement Exposure Estimator · Penalties · Criminal Liability</div>
                <p className="text-11 text-ink-3">Estimates regulatory enforcement exposure including penalty ranges, likely penalties, mitigating/aggravating factors, precedent cases, criminal exposure, MLRO personal liability, and self-reporting benefits per UAE FDL 10/2025 and CBUAE enforcement framework.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Violation Description *</label><textarea value={enforcementInput.violation} onChange={(e) => setEnforcementInput((p) => ({...p, violation: e.target.value}))} rows={3} placeholder="Describe the AML/CFT violation or compliance failure in detail…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type</label><input value={enforcementInput.institutionType} onChange={(e) => setEnforcementInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / real estate agent…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Violation Period</label><input value={enforcementInput.violationPeriod} onChange={(e) => setEnforcementInput((p) => ({...p, violationPeriod: e.target.value}))} placeholder="e.g. 6 months / 2 years" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Self-Reported?</label><input value={enforcementInput.selfReported} onChange={(e) => setEnforcementInput((p) => ({...p, selfReported: e.target.value}))} placeholder="yes / no / voluntary disclosure" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Prior Enforcement History</label><input value={enforcementInput.priorHistory} onChange={(e) => setEnforcementInput((p) => ({...p, priorHistory: e.target.value}))} placeholder="none / 1 prior warning / prior fine…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={enforcementInput.context} onChange={(e) => setEnforcementInput((p) => ({...p, context: e.target.value}))} placeholder="Remediation taken, board engagement…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runEnforcementExposure()} disabled={enforcementLoading || !enforcementInput.violation.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{enforcementLoading ? "Estimating…" : "Estimate Enforcement Exposure"}</button>
                {enforcementResult && (() => {
                  const r = enforcementResult as Record<string, unknown>;
                  const penRange = r["penaltyRange"] as Record<string,string> | undefined;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-12 font-bold px-3 py-1 rounded bg-red-dim text-red uppercase">{String(r["violationCategory"] ?? "")}</span>
                        {Boolean(r["criminalExposure"]) && <span className="font-mono text-11 px-2 py-px rounded bg-red text-white">Criminal Exposure</span>}
                        {Boolean(r["mlroPersonalLiability"]) && <span className="font-mono text-11 px-2 py-px rounded bg-amber-dim text-amber">MLRO Personal Liability</span>}
                      </div>
                      {penRange && <div className="grid grid-cols-3 gap-2"><div className="border border-hair-2 rounded p-2 text-center"><div className="text-10 text-ink-3 mb-0.5">Min Penalty</div><div className="font-mono text-12 font-semibold text-ink-0">{penRange["min"]} {penRange["currency"]}</div></div><div className="border border-red-dim bg-red-dim rounded p-2 text-center"><div className="text-10 text-ink-3 mb-0.5">Likely Penalty</div><div className="font-mono text-12 font-semibold text-red">{String(r["likelyPenalty"] ?? "")}</div></div><div className="border border-hair-2 rounded p-2 text-center"><div className="text-10 text-ink-3 mb-0.5">Max Penalty</div><div className="font-mono text-12 font-semibold text-ink-0">{penRange["max"]} {penRange["currency"]}</div></div></div>}
                      {Array.isArray(r["mitigatingFactors"]) && <div><div className="text-10 uppercase tracking-wide-3 text-green mb-1">Mitigating Factors</div><ul className="space-y-0.5">{(r["mitigatingFactors"] as string[]).map((f, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-green">+</span>{f}</li>)}</ul></div>}
                      {Array.isArray(r["aggravatingFactors"]) && <div><div className="text-10 uppercase tracking-wide-3 text-red mb-1">Aggravating Factors</div><ul className="space-y-0.5">{(r["aggravatingFactors"] as string[]).map((f, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-red">−</span>{f}</li>)}</ul></div>}
                      <div className="bg-brand-dim rounded p-3 text-11 text-brand-deep">{String(r["selfReportingBenefit"] ?? "")}</div>
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Inter-Agency Referral */}
            {superToolsTab === "inter-agency-referral" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Inter-Agency Referral Builder · FIU · Law Enforcement · CBUAE</div>
                <p className="text-11 text-ink-3">Generates structured inter-agency referrals and intelligence disclosures to UAE FIU, law enforcement, and regulatory bodies, with evidence summaries, legal basis, and recommended referral pathways per UAE FDL 10/2025 and international cooperation frameworks.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Case Description *</label><textarea value={referralInput.caseDescription} onChange={(e) => setReferralInput((p) => ({...p, caseDescription: e.target.value}))} rows={4} placeholder="Describe the case, suspicious activity, and grounds for referral…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Suspected Offence</label><input value={referralInput.suspectedOffence} onChange={(e) => setReferralInput((p) => ({...p, suspectedOffence: e.target.value}))} placeholder="e.g. money laundering, fraud, bribery" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Subject Name</label><input value={referralInput.subjectName} onChange={(e) => setReferralInput((p) => ({...p, subjectName: e.target.value}))} placeholder="Full subject name" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Subject ID</label><input value={referralInput.subjectId} onChange={(e) => setReferralInput((p) => ({...p, subjectId: e.target.value}))} placeholder="Passport / Emirates ID / account" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={referralInput.context} onChange={(e) => setReferralInput((p) => ({...p, context: e.target.value}))} placeholder="Urgency, related cases, prior disclosures" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                  <div><label className="block text-10 text-ink-3 mb-1">Evidence Summary</label><textarea value={referralInput.evidenceSummary} onChange={(e) => setReferralInput((p) => ({...p, evidenceSummary: e.target.value}))} rows={2} placeholder="Key evidence available — bank records, CCTV, documents…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runInterAgencyReferral()} disabled={referralLoading || !referralInput.caseDescription.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{referralLoading ? "Building…" : "Build Referral"}</button>
                {referralResult && (() => {
                  const r = referralResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["referralNarrative"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5">Referral Narrative</div><p className="text-12 text-ink-0 leading-relaxed whitespace-pre-wrap">{String(r["referralNarrative"])}</p></div>}
                      {Boolean(r["recommendedRecipient"]) && <div className="flex items-center gap-2"><span className="text-10 uppercase tracking-wide-3 text-ink-3">Recommended Recipient:</span><span className="font-mono text-11 font-semibold text-brand">{String(r["recommendedRecipient"])}</span></div>}
                      {Array.isArray(r["requiredActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div><ul className="space-y-0.5">{(r["requiredActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Policy Reviewer */}
            {superToolsTab === "policy-reviewer" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Policy Reviewer · AML/CFT Policy Gap Analysis</div>
                <p className="text-11 text-ink-3">Reviews AML/CFT policy documents against UAE FDL 10/2025, CBUAE AML/CFT Guidelines, and FATF Recommendations. Identifies gaps, outdated provisions, missing mandatory elements, and drafts recommended amendments.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Policy Text *</label><textarea value={policyInput.policyText} onChange={(e) => setPolicyInput((p) => ({...p, policyText: e.target.value}))} rows={6} placeholder="Paste your AML/CFT policy text for review…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Policy Type</label><input value={policyInput.policyType} onChange={(e) => setPolicyInput((p) => ({...p, policyType: e.target.value}))} placeholder="e.g. CDD Policy, STR Policy, Training Policy" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Institution Type</label><input value={policyInput.institutionType} onChange={(e) => setPolicyInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Last Review Date</label><input value={policyInput.lastReviewDate} onChange={(e) => setPolicyInput((p) => ({...p, lastReviewDate: e.target.value}))} placeholder="e.g. January 2024" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={policyInput.context} onChange={(e) => setPolicyInput((p) => ({...p, context: e.target.value}))} placeholder="Regulatory changes since last review…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runPolicyReviewer()} disabled={policyLoading || !policyInput.policyText.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{policyLoading ? "Reviewing…" : "Review Policy"}</button>
                {policyResult && (() => {
                  const r = policyResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["overallAssessment"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Overall Assessment</div><p className="text-12 text-ink-0">{String(r["overallAssessment"])}</p></div>}
                      {Array.isArray(r["criticalGaps"]) && <div><div className="text-10 uppercase tracking-wide-3 text-red mb-1">Critical Gaps</div><ul className="space-y-0.5">{(r["criticalGaps"] as string[]).map((g, i) => <li key={i} className="text-11 text-red flex gap-1.5"><span>✗</span>{g}</li>)}</ul></div>}
                      {Array.isArray(r["recommendedAmendments"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Recommended Amendments</div><ul className="space-y-0.5">{(r["recommendedAmendments"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Compliance Test Planner */}
            {superToolsTab === "compliance-test-planner" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Compliance Test Planner · AML Testing Programme Builder</div>
                <p className="text-11 text-ink-3">Generates structured AML/CFT compliance testing programmes tailored to institution type, risk focus, and testing area. Covers transaction monitoring testing, CDD file reviews, STR quality reviews, training assessments, and controls testing per FATF R.18 and CBUAE requirements.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type *</label><input value={compTestInput.institutionType} onChange={(e) => setCompTestInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Testing Area</label><input value={compTestInput.testingArea} onChange={(e) => setCompTestInput((p) => ({...p, testingArea: e.target.value}))} placeholder="e.g. CDD, TM, STR quality, training" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Risk Focus</label><input value={compTestInput.riskFocus} onChange={(e) => setCompTestInput((p) => ({...p, riskFocus: e.target.value}))} placeholder="e.g. PEP, high-risk jurisdictions, TBML" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Staff Count</label><input value={compTestInput.staffCount} onChange={(e) => setCompTestInput((p) => ({...p, staffCount: e.target.value}))} placeholder="e.g. 50" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={compTestInput.context} onChange={(e) => setCompTestInput((p) => ({...p, context: e.target.value}))} placeholder="Recent audit findings, regulatory focus areas…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runComplianceTestPlanner()} disabled={compTestLoading || !compTestInput.institutionType.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{compTestLoading ? "Building…" : "Build Test Plan"}</button>
                {compTestResult && (() => {
                  const r = compTestResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["testingObjective"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Testing Objective</div><p className="text-12 text-ink-0">{String(r["testingObjective"])}</p></div>}
                      {Array.isArray(r["testingModules"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Testing Modules</div><div className="space-y-2">{(r["testingModules"] as Array<Record<string,unknown>>).map((m, i) => <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel"><div className="text-11 font-semibold text-ink-0 mb-1">{String(m["moduleName"] ?? m["name"] ?? `Module ${i+1}`)}</div>{Array.isArray(m["testSteps"]) && <ul className="space-y-0.5">{(m["testSteps"] as string[]).map((s, j) => <li key={j} className="text-11 text-ink-2 flex gap-1.5"><span className="text-brand">→</span>{s}</li>)}</ul>}</div>)}</div></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SWIFT / LC Analyzer */}
            {superToolsTab === "swift-lc-analyzer" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">SWIFT / Letter of Credit Analyzer · TBML · AML Red Flags</div>
                <p className="text-11 text-ink-3">Analyses SWIFT MT messages and Letters of Credit for AML/CFT red flags including TBML indicators, sanctions nexus, inconsistent documentation, correspondent banking risks, and regulatory obligations per FATF trade finance guidance and UAE AML requirements.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">SWIFT Message / LC Details *</label><textarea value={swiftLcInput.swiftMessage} onChange={(e) => setSwiftLcInput((p) => ({...p, swiftMessage: e.target.value}))} rows={5} placeholder="Paste SWIFT MT message text or LC details…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Message Type</label><input value={swiftLcInput.messageType} onChange={(e) => setSwiftLcInput((p) => ({...p, messageType: e.target.value}))} placeholder="e.g. MT103, MT202, MT700" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Goods Description</label><input value={swiftLcInput.goodsDescription} onChange={(e) => setSwiftLcInput((p) => ({...p, goodsDescription: e.target.value}))} placeholder="What goods / services are described" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Beneficiary Country</label><input value={swiftLcInput.beneficiaryCountry} onChange={(e) => setSwiftLcInput((p) => ({...p, beneficiaryCountry: e.target.value}))} placeholder="e.g. UAE, China, Turkey" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Applicant Country</label><input value={swiftLcInput.applicantCountry} onChange={(e) => setSwiftLcInput((p) => ({...p, applicantCountry: e.target.value}))} placeholder="e.g. US, Germany, Pakistan" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={swiftLcInput.context} onChange={(e) => setSwiftLcInput((p) => ({...p, context: e.target.value}))} placeholder="Customer relationship, prior transactions, concerns…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runSwiftLcAnalyzer()} disabled={swiftLcLoading || !swiftLcInput.swiftMessage.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{swiftLcLoading ? "Analysing…" : "Analyse SWIFT / LC"}</button>
                {swiftLcResult && (() => {
                  const r = swiftLcResult as Record<string, unknown>;
                  const risk = r["amlRisk"] as string ?? r["overallRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {risk && <span className={`inline-flex font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>AML Risk: {risk}</span>}
                      {Boolean(r["analysisNarrative"]) && <p className="text-12 text-ink-1 leading-relaxed">{String(r["analysisNarrative"])}</p>}
                      {Boolean(r["recommendedAction"]) && <div className="flex items-center gap-2"><span className="text-10 text-ink-3">Action:</span><span className="font-mono text-11 font-semibold text-brand">{String(r["recommendedAction"]).replace(/_/g, " ")}</span></div>}
                      {Array.isArray(r["redFlags"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Red Flags</div><ul className="space-y-0.5">{(r["redFlags"] as string[]).map((f, i) => <li key={i} className="text-11 text-amber flex gap-1.5"><span>⚠</span>{f}</li>)}</ul></div>}
                      {Array.isArray(r["requiredActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Actions</div><ul className="space-y-0.5">{(r["requiredActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Regulatory Calendar */}
            {superToolsTab === "regulatory-calendar" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Regulatory Calendar · UAE AML/CFT Obligation Deadlines</div>
                <p className="text-11 text-ink-3">Generates a structured regulatory calendar of AML/CFT reporting deadlines, review cycles, and compliance obligations for UAE regulated entities per FDL 10/2025, CBUAE guidelines, goAML filing requirements, and international frameworks.</p>
                <div><label className="block text-10 text-ink-3 mb-1">Institution Type</label><input value={regCalInput.institutionType} onChange={(e) => setRegCalInput({ institutionType: e.target.value })} placeholder="bank / DPMS / VASP / real estate agent / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                <button type="button" onClick={() => void runRegulatoryCalendar()} disabled={regCalLoading} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{regCalLoading ? "Generating…" : "Generate Regulatory Calendar"}</button>
                {regCalResult && (() => {
                  const r = regCalResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["calendarSummary"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Calendar Summary</div><p className="text-12 text-ink-0">{String(r["calendarSummary"])}</p></div>}
                      {Array.isArray(r["obligations"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Key Obligations</div><div className="space-y-2">{(r["obligations"] as Array<Record<string,unknown>>).slice(0, 15).map((ob, i) => <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel flex items-start gap-3"><div className="font-mono text-10 text-brand-deep shrink-0 w-20">{String(ob["deadline"] ?? ob["frequency"] ?? "")}</div><div><div className="text-11 font-semibold text-ink-0">{String(ob["obligation"] ?? ob["name"] ?? "")}</div><div className="text-10 font-mono text-ink-3">{String(ob["legalBasis"] ?? ob["basis"] ?? "")}</div></div></div>)}</div></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* EWRA Generator */}
            {superToolsTab === "ewra-generator" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">EWRA Generator · Enterprise-Wide Risk Assessment</div>
                <p className="text-11 text-ink-3">Generates a structured Enterprise-Wide Risk Assessment (EWRA) covering inherent ML/TF/PF risks, control effectiveness, residual risk ratings, and methodology per UAE FDL 10/2025, FATF guidance on national and institutional risk assessments, and CBUAE EWRA requirements.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type *</label><input value={ewraInput.institutionType} onChange={(e) => setEwraInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Products & Services</label><input value={ewraInput.productsServices} onChange={(e) => setEwraInput((p) => ({...p, productsServices: e.target.value}))} placeholder="e.g. trade finance, retail banking, gold trading" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Customer Base</label><input value={ewraInput.customerBase} onChange={(e) => setEwraInput((p) => ({...p, customerBase: e.target.value}))} placeholder="e.g. retail, corporate, PEPs, DNFBPs" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Geographic Footprint</label><input value={ewraInput.geographicFootprint} onChange={(e) => setEwraInput((p) => ({...p, geographicFootprint: e.target.value}))} placeholder="UAE only / multi-jurisdiction…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Transaction Volume</label><input value={ewraInput.transactionVolume} onChange={(e) => setEwraInput((p) => ({...p, transactionVolume: e.target.value}))} placeholder="e.g. AED 500M/year, 10,000 transactions/month" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={ewraInput.context} onChange={(e) => setEwraInput((p) => ({...p, context: e.target.value}))} placeholder="Recent regulatory changes, known gaps…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runEwraGenerator()} disabled={ewraLoading || !ewraInput.institutionType.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{ewraLoading ? "Generating…" : "Generate EWRA"}</button>
                {ewraResult && (() => {
                  const r = ewraResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["overallResidualRisk"]) && <div className="flex items-center gap-2"><span className="text-10 uppercase tracking-wide-3 text-ink-3">Overall Residual Risk:</span><span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${r["overallResidualRisk"] === "high" || r["overallResidualRisk"] === "critical" ? "bg-red-dim text-red" : r["overallResidualRisk"] === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(r["overallResidualRisk"])}</span></div>}
                      {Array.isArray(r["riskCategories"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Risk Categories</div><div className="space-y-2">{(r["riskCategories"] as Array<Record<string,unknown>>).map((cat, i) => <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel"><div className="flex items-center justify-between mb-1"><span className="text-11 font-semibold text-ink-0">{String(cat["category"] ?? cat["name"] ?? "")}</span><span className={`text-9 font-mono px-1.5 py-px rounded uppercase ${cat["residualRisk"] === "high" ? "bg-red-dim text-red" : cat["residualRisk"] === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(cat["residualRisk"] ?? cat["risk"] ?? "")}</span></div><p className="text-11 text-ink-2">{String(cat["commentary"] ?? cat["description"] ?? "")}</p></div>)}</div></div>}
                      {Array.isArray(r["recommendedActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Recommended Actions</div><ul className="space-y-0.5">{(r["recommendedActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* AML Programme Gap */}
            {superToolsTab === "aml-programme-gap" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">AML Programme Gap Analyser · FATF R.18 · CBUAE Compliance</div>
                <p className="text-11 text-ink-3">Conducts a structured gap analysis of an institution&apos;s AML/CFT programme against UAE FDL 10/2025, CBUAE AML/CFT Guidelines, and FATF R.18 internal control requirements. Identifies missing mandatory elements and prioritises remediation actions.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type *</label><input value={amlGapInput.institutionType} onChange={(e) => setAmlGapInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Staff Count</label><input value={amlGapInput.staffCount} onChange={(e) => setAmlGapInput((p) => ({...p, staffCount: e.target.value}))} placeholder="e.g. 50" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Programme Description</label><textarea value={amlGapInput.programmeDescription} onChange={(e) => setAmlGapInput((p) => ({...p, programmeDescription: e.target.value}))} rows={2} placeholder="Describe current AML programme elements (policies, training, TM, CDD, reporting…)" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Current Controls</label><input value={amlGapInput.currentControls} onChange={(e) => setAmlGapInput((p) => ({...p, currentControls: e.target.value}))} placeholder="Transaction monitoring, screening tools…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Last Audit Date</label><input value={amlGapInput.lastAuditDate} onChange={(e) => setAmlGapInput((p) => ({...p, lastAuditDate: e.target.value}))} placeholder="e.g. Q4 2024" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={amlGapInput.context} onChange={(e) => setAmlGapInput((p) => ({...p, context: e.target.value}))} placeholder="Known weaknesses, recent regulatory feedback…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runAmlProgrammeGap()} disabled={amlGapLoading || !amlGapInput.institutionType.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{amlGapLoading ? "Analysing…" : "Analyse AML Programme Gaps"}</button>
                {amlGapResult && (() => {
                  const r = amlGapResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["overallMaturity"]) && <div className="flex items-center gap-2"><span className="text-10 uppercase tracking-wide-3 text-ink-3">Programme Maturity:</span><span className="font-mono text-12 font-bold px-3 py-1 rounded bg-brand-dim text-brand-deep">{String(r["overallMaturity"])}</span></div>}
                      {Array.isArray(r["criticalGaps"]) && <div><div className="text-10 uppercase tracking-wide-3 text-red mb-1">Critical Gaps</div><ul className="space-y-0.5">{(r["criticalGaps"] as string[]).map((g, i) => <li key={i} className="text-11 text-red flex gap-1.5"><span>✗</span>{g}</li>)}</ul></div>}
                      {Array.isArray(r["remediationPriorities"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Remediation Priorities</div><ul className="space-y-0.5">{(r["remediationPriorities"] as string[]).map((p, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{p}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Trade Invoice Analyzer */}
            {superToolsTab === "trade-invoice-analyzer" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Trade Invoice Analyzer · TBML · Over/Under-Invoicing · Dual-Use</div>
                <p className="text-11 text-ink-3">Analyses trade invoices for TBML indicators including over/under-invoicing, phantom shipments, multiple invoicing, dual-use goods, and pricing anomalies. References FATF Trade-Based ML Guidance (2020), ICC guidance, and UAE AML requirements for trade finance.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Invoice Details *</label><textarea value={tradeInvoiceInput.invoiceDetails} onChange={(e) => setTradeInvoiceInput((p) => ({...p, invoiceDetails: e.target.value}))} rows={4} placeholder="Paste invoice data — line items, amounts, quantities, parties, payment terms…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Commodity Type</label><input value={tradeInvoiceInput.commodityType} onChange={(e) => setTradeInvoiceInput((p) => ({...p, commodityType: e.target.value}))} placeholder="e.g. electronics, chemicals, textiles, gold" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">HS Code</label><input value={tradeInvoiceInput.hsCode} onChange={(e) => setTradeInvoiceInput((p) => ({...p, hsCode: e.target.value}))} placeholder="e.g. 8541.10" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Exporter Country</label><input value={tradeInvoiceInput.exporterCountry} onChange={(e) => setTradeInvoiceInput((p) => ({...p, exporterCountry: e.target.value}))} placeholder="Country of export" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Importer Country</label><input value={tradeInvoiceInput.importerCountry} onChange={(e) => setTradeInvoiceInput((p) => ({...p, importerCountry: e.target.value}))} placeholder="Country of import" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={tradeInvoiceInput.context} onChange={(e) => setTradeInvoiceInput((p) => ({...p, context: e.target.value}))} placeholder="Payment route, prior relationship, market price comparison…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runTradeInvoiceAnalyzer()} disabled={tradeInvoiceLoading || !tradeInvoiceInput.invoiceDetails.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{tradeInvoiceLoading ? "Analysing…" : "Analyse Invoice"}</button>
                {tradeInvoiceResult && (() => {
                  const r = tradeInvoiceResult as Record<string, unknown>;
                  const risk = r["tbmlRisk"] as string ?? r["overallRisk"] as string;
                  const riskCls = risk === "critical" ? "bg-red text-white" : risk === "high" ? "bg-red-dim text-red" : risk === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green";
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {risk && <span className={`inline-flex font-mono text-12 font-bold px-3 py-1 rounded uppercase ${riskCls}`}>TBML Risk: {risk}</span>}
                      {Boolean(r["actionRationale"]) && <p className="text-12 text-ink-1 leading-relaxed">{String(r["actionRationale"])}</p>}
                      {Array.isArray(r["indicators"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Indicators</div><div className="space-y-1">{(r["indicators"] as Array<Record<string,unknown>>).map((ind, i) => <div key={i} className="border border-hair-2 rounded p-2 bg-bg-panel"><div className="flex items-center gap-2 mb-0.5"><span className={`text-9 font-mono px-1.5 py-px rounded uppercase ${ind["severity"] === "critical" ? "bg-red text-white" : ind["severity"] === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{String(ind["severity"])}</span><span className="text-11 font-semibold text-ink-0">{String(ind["indicator"])}</span></div><div className="text-10 font-mono text-ink-3">{String(ind["fatfRef"] ?? "")}</div></div>)}</div></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Network Mapper */}
            {superToolsTab === "network-mapper" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Network Mapper · Entity Relationship & ML Network Analysis</div>
                <p className="text-11 text-ink-3">Maps relationships between entities using shared addresses, directors, accounts, and transaction links to identify ML network structures, conduit entities, and beneficial ownership chains per FATF R.24-25 and UAE UBO requirements.</p>
                <div className="space-y-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Entities *</label><textarea value={networkMapInput.entities} onChange={(e) => setNetworkMapInput((p) => ({...p, entities: e.target.value}))} rows={3} placeholder="List entities / individuals in the network — names, types, countries…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 resize-none focus:outline-none focus:border-brand" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-10 text-ink-3 mb-1">Shared Addresses</label><input value={networkMapInput.sharedAddresses} onChange={(e) => setNetworkMapInput((p) => ({...p, sharedAddresses: e.target.value}))} placeholder="Common registered / business addresses" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Shared Directors</label><input value={networkMapInput.sharedDirectors} onChange={(e) => setNetworkMapInput((p) => ({...p, sharedDirectors: e.target.value}))} placeholder="Common directors / shareholders" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Shared Accounts</label><input value={networkMapInput.sharedAccounts} onChange={(e) => setNetworkMapInput((p) => ({...p, sharedAccounts: e.target.value}))} placeholder="Linked bank accounts" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div><label className="block text-10 text-ink-3 mb-1">Transaction Links</label><input value={networkMapInput.transactionLinks} onChange={(e) => setNetworkMapInput((p) => ({...p, transactionLinks: e.target.value}))} placeholder="Inter-entity transaction flows" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                    <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={networkMapInput.context} onChange={(e) => setNetworkMapInput((p) => ({...p, context: e.target.value}))} placeholder="Time period, geographic focus, suspected purpose…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  </div>
                </div>
                <button type="button" onClick={() => void runNetworkMapper()} disabled={networkMapLoading || !networkMapInput.entities.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{networkMapLoading ? "Mapping…" : "Map Network"}</button>
                {networkMapResult && (() => {
                  const r = networkMapResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["networkRisk"]) && <div className="flex items-center gap-2"><span className="text-10 uppercase tracking-wide-3 text-ink-3">Network Risk:</span><span className={`font-mono text-12 font-bold px-3 py-1 rounded uppercase ${r["networkRisk"] === "critical" || r["networkRisk"] === "high" ? "bg-red-dim text-red" : r["networkRisk"] === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(r["networkRisk"])}</span></div>}
                      {Boolean(r["networkSummary"]) && <p className="text-12 text-ink-1 leading-relaxed">{String(r["networkSummary"])}</p>}
                      {Array.isArray(r["relationships"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Key Relationships</div><ul className="space-y-0.5">{(r["relationships"] as Array<Record<string,unknown>>).slice(0, 10).map((rel, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{String(rel["description"] ?? rel["link"] ?? JSON.stringify(rel))}</li>)}</ul></div>}
                      {Array.isArray(r["investigativeActions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Investigative Actions</div><ul className="space-y-0.5">{(r["investigativeActions"] as string[]).map((a, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{a}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Risk Appetite Builder */}
            {superToolsTab === "risk-appetite-builder" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Risk Appetite Builder · Board-Approved AML/CFT Risk Appetite Statement</div>
                <p className="text-11 text-ink-3">Generates a structured AML/CFT Risk Appetite Statement (RAS) for Board approval covering ML/TF/PF risk tolerance thresholds, prohibited activities, acceptable risk boundaries, and monitoring metrics per UAE FDL 10/2025 Art.5 Board accountability requirements and FATF governance guidance.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type *</label><input value={riskAppInput.institutionType} onChange={(e) => setRiskAppInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Key Products</label><input value={riskAppInput.keyProducts} onChange={(e) => setRiskAppInput((p) => ({...p, keyProducts: e.target.value}))} placeholder="e.g. trade finance, private banking, crypto" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Risk Profile</label><input value={riskAppInput.riskProfile} onChange={(e) => setRiskAppInput((p) => ({...p, riskProfile: e.target.value}))} placeholder="conservative / moderate / higher-risk" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Board Position</label><input value={riskAppInput.boardPosition} onChange={(e) => setRiskAppInput((p) => ({...p, boardPosition: e.target.value}))} placeholder="e.g. zero tolerance for sanctions violations" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={riskAppInput.context} onChange={(e) => setRiskAppInput((p) => ({...p, context: e.target.value}))} placeholder="Regulatory feedback, known risk areas, strategic focus…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runRiskAppetiteBuilder()} disabled={riskAppLoading || !riskAppInput.institutionType.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{riskAppLoading ? "Building…" : "Build Risk Appetite Statement"}</button>
                {riskAppResult && (() => {
                  const r = riskAppResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["riskAppetiteStatement"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5">Risk Appetite Statement</div><p className="text-12 text-ink-0 leading-relaxed whitespace-pre-wrap">{String(r["riskAppetiteStatement"])}</p></div>}
                      {Array.isArray(r["prohibitedActivities"]) && <div><div className="text-10 uppercase tracking-wide-3 text-red mb-1">Prohibited Activities (Zero Tolerance)</div><ul className="space-y-0.5">{(r["prohibitedActivities"] as string[]).map((p, i) => <li key={i} className="text-11 text-red flex gap-1.5"><span>✗</span>{p}</li>)}</ul></div>}
                      {Array.isArray(r["riskToleranceThresholds"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Risk Tolerance Thresholds</div><ul className="space-y-0.5">{(r["riskToleranceThresholds"] as string[]).map((t, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{t}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Regulatory Exam Prep */}
            {superToolsTab === "regulatory-exam-prep" && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-3">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Regulatory Exam Prep · CBUAE / FATF Inspection Readiness</div>
                <p className="text-11 text-ink-3">Generates structured regulatory examination preparation packs covering common examiner questions, expected evidence, self-assessment checklists, and remediation priorities for CBUAE AML/CFT inspections and FATF mutual evaluation preparation per UAE FDL 10/2025 and FATF Recommendations.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="block text-10 text-ink-3 mb-1">Exam Area *</label><input value={examPrepInput.examArea} onChange={(e) => setExamPrepInput((p) => ({...p, examArea: e.target.value}))} placeholder="e.g. CDD, TM, STR quality, EWRA, PEP, sanctions…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:outline-none focus:border-brand" /></div>
                  <div><label className="block text-10 text-ink-3 mb-1">Institution Type</label><input value={examPrepInput.institutionType} onChange={(e) => setExamPrepInput((p) => ({...p, institutionType: e.target.value}))} placeholder="bank / DPMS / VASP / law firm…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                  <div className="col-span-2"><label className="block text-10 text-ink-3 mb-1">Additional Context</label><input value={examPrepInput.context} onChange={(e) => setExamPrepInput((p) => ({...p, context: e.target.value}))} placeholder="Upcoming inspection focus, known weaknesses, recent regulatory changes…" className="w-full text-12 px-2.5 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0" /></div>
                </div>
                <button type="button" onClick={() => void runRegulatoryExamPrep()} disabled={examPrepLoading || !examPrepInput.examArea.trim()} className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">{examPrepLoading ? "Preparing…" : "Generate Exam Prep Pack"}</button>
                {examPrepResult && (() => {
                  const r = examPrepResult as Record<string, unknown>;
                  return (
                    <div className="mt-3 border border-hair-2 rounded-lg p-4 space-y-3 bg-bg-1">
                      {Boolean(r["examinerFocus"]) && <div className="bg-bg-panel border border-hair-2 rounded p-3"><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Examiner Focus Areas</div><p className="text-12 text-ink-0">{String(r["examinerFocus"])}</p></div>}
                      {Array.isArray(r["keyQuestions"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Likely Examiner Questions</div><ul className="space-y-1">{(r["keyQuestions"] as string[]).map((q, i) => <li key={i} className="text-11 text-ink-1 border border-hair-2 rounded p-2 bg-bg-panel">{q}</li>)}</ul></div>}
                      {Array.isArray(r["requiredEvidence"]) && <div><div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Required Evidence / Documentation</div><ul className="space-y-0.5">{(r["requiredEvidence"] as string[]).map((e, i) => <li key={i} className="text-11 text-ink-1 flex gap-1.5"><span className="text-brand">→</span>{e}</li>)}</ul></div>}
                      {Array.isArray(r["remediationPriorities"]) && <div><div className="text-10 uppercase tracking-wide-3 text-amber mb-1">Pre-Exam Remediation Priorities</div><ul className="space-y-0.5">{(r["remediationPriorities"] as string[]).map((p, i) => <li key={i} className="text-11 text-amber flex gap-1.5"><span>⚠</span>{p}</li>)}</ul></div>}
                      <div className="text-10 font-mono text-ink-3">{String(r["regulatoryBasis"] ?? "")}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* NPO Risk */}
            {superToolsTab === "npo-risk" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Non-Profit Organisation Risk Assessment</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.8 · UAE Cabinet Decision 74/2020 · NPO/NGO ML/TF vulnerability assessment</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">NPO Name</label><input value={npoInput.npoName} onChange={e => setNpoInput(p => ({...p, npoName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Organisation name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Country</label><input value={npoInput.country} onChange={e => setNpoInput(p => ({...p, country: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Registration country" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Sector / Activity</label><input value={npoInput.sector} onChange={e => setNpoInput(p => ({...p, sector: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Humanitarian, religious, education…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Funding Sources</label><input value={npoInput.fundingSource} onChange={e => setNpoInput(p => ({...p, fundingSource: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Donor countries, anonymous, grants…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Beneficiary Regions</label><input value={npoInput.beneficiaryRegion} onChange={e => setNpoInput(p => ({...p, beneficiaryRegion: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries or regions where funds are deployed" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={npoInput.context} onChange={e => setNpoInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runNpoRisk()} disabled={npoLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{npoLoading ? "◌ Analysing…" : "Run NPO Risk Assessment"}</button>
                {npoResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(npoResult["riskRating"]) === "critical" ? "bg-red-dim text-red" : String(npoResult["riskRating"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(npoResult["riskRating"] ?? "")}</span>
                      <span className="text-12 font-semibold text-ink-0">Risk Rating</span>
                    </div>
                    {Boolean(npoResult["keyRedFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Key Red Flags</div><ul className="space-y-1">{(npoResult["keyRedFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-red shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(npoResult["tfIndicators"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">TF Indicators</div><ul className="space-y-1">{(npoResult["tfIndicators"] as string[]).map((f,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">☢</span>{f}</li>)}</ul></div>}
                    {Boolean(npoResult["dueDiligenceSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Due Diligence Steps</div><ul className="space-y-1">{(npoResult["dueDiligenceSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    <div className="text-10 font-mono text-ink-3 border-t border-hair-2 pt-2">{String(npoResult["regulatoryBasis"] ?? "")}</div>
                  </div>
                )}
              </div>
            )}

            {/* Correspondent Bank */}
            {superToolsTab === "correspondent-bank" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Correspondent Bank Risk Assessment</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.13 · BCBS Guidelines · Correspondent banking ML/TF risk and shell-bank prohibition</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Bank Name</label><input value={corrBankInput.bankName} onChange={e => setCorrBankInput(p => ({...p, bankName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Correspondent bank name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Country</label><input value={corrBankInput.country} onChange={e => setCorrBankInput(p => ({...p, country: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Jurisdiction of incorporation" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Regulatory Body</label><input value={corrBankInput.regulatoryBody} onChange={e => setCorrBankInput(p => ({...p, regulatoryBody: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. OCC, FCA, SAMA" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Last KYC Date</label><input value={corrBankInput.lastKycDate} onChange={e => setCorrBankInput(p => ({...p, lastKycDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="YYYY-MM-DD" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">AML Programme Status</label><input value={corrBankInput.amlProgrammeStatus} onChange={e => setCorrBankInput(p => ({...p, amlProgrammeStatus: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. Wolfsberg certified, recent enforcement action…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={corrBankInput.context} onChange={e => setCorrBankInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runCorrBank()} disabled={corrBankLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{corrBankLoading ? "◌ Analysing…" : "Run Correspondent Bank Assessment"}</button>
                {corrBankResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(corrBankResult["riskRating"]) === "critical" ? "bg-red-dim text-red" : String(corrBankResult["riskRating"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(corrBankResult["riskRating"] ?? "")}</span>
                      <span className="text-12 font-semibold text-ink-0">Risk Rating</span>
                    </div>
                    {Boolean(corrBankResult["kycStatus"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">KYC Status</div><p className="text-12 text-ink-1">{String(corrBankResult["kycStatus"])}</p></div>}
                    {Boolean(corrBankResult["amlProgrammeAssessment"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">AML Programme Assessment</div><p className="text-12 text-ink-1 leading-relaxed">{String(corrBankResult["amlProgrammeAssessment"])}</p></div>}
                    <div className="flex gap-3 flex-wrap">
                      {corrBankResult["shellBankRisk"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${corrBankResult["shellBankRisk"] ? "bg-red-dim text-red" : "bg-green-dim text-green"}`}>Shell Bank Risk: {corrBankResult["shellBankRisk"] ? "YES" : "NO"}</span>}
                      {corrBankResult["payableThrough"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${corrBankResult["payableThrough"] ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Payable-Through: {corrBankResult["payableThrough"] ? "YES" : "NO"}</span>}
                    </div>
                    {Boolean(corrBankResult["requiredEnhancements"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Enhancements</div><ul className="space-y-1">{(corrBankResult["requiredEnhancements"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* Mixed Funds */}
            {superToolsTab === "mixed-funds" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Mixed Funds / Commingling Analysis</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.3 · POCA 2002 (UK) · UAE AML Law Art.2 · Taint percentage and confiscation risk</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Account Holder</label><input value={mixedFundsInput.accountHolder} onChange={e => setMixedFundsInput(p => ({...p, accountHolder: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Name or entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Total Balance</label><input value={mixedFundsInput.totalBalance} onChange={e => setMixedFundsInput(p => ({...p, totalBalance: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 5,000,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Suspected Proceeds Amount</label><input value={mixedFundsInput.suspectedProceedsAmount} onChange={e => setMixedFundsInput(p => ({...p, suspectedProceedsAmount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 2,000,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Legitimate Funds Amount</label><input value={mixedFundsInput.legitimateFundsAmount} onChange={e => setMixedFundsInput(p => ({...p, legitimateFundsAmount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 3,000,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Mixing Period</label><input value={mixedFundsInput.mixingPeriod} onChange={e => setMixedFundsInput(p => ({...p, mixingPeriod: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 6 months, Jan–Jun 2024" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={mixedFundsInput.context} onChange={e => setMixedFundsInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runMixedFunds()} disabled={mixedFundsLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{mixedFundsLoading ? "◌ Analysing…" : "Run Mixed Funds Analysis"}</button>
                {mixedFundsResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(mixedFundsResult["taintPercentage"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(mixedFundsResult["taintPercentage"])}%</div><div className="text-10 font-mono text-ink-3 uppercase">Taint %</div></div>}
                      {Boolean(mixedFundsResult["taintRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(mixedFundsResult["taintRating"]) === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{String(mixedFundsResult["taintRating"])}</span>}
                    </div>
                    <div className="flex gap-3 flex-wrap text-12 text-ink-1">
                      {Boolean(mixedFundsResult["taintedAmount"]) && <span>Tainted: <span className="font-semibold text-red">{String(mixedFundsResult["taintedAmount"])}</span></span>}
                      {Boolean(mixedFundsResult["cleanAmount"]) && <span>Clean: <span className="font-semibold text-green">{String(mixedFundsResult["cleanAmount"])}</span></span>}
                    </div>
                    {Boolean(mixedFundsResult["tracingMethod"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Tracing Method</div><span className="font-mono text-11 px-2 py-0.5 rounded bg-brand-dim text-brand-deep">{String(mixedFundsResult["tracingMethod"])}</span></div>}
                    {Boolean(mixedFundsResult["legalAnalysis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Legal Analysis</div><p className="text-12 text-ink-1 leading-relaxed">{String(mixedFundsResult["legalAnalysis"])}</p></div>}
                    {mixedFundsResult["confiscationRisk"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${mixedFundsResult["confiscationRisk"] ? "bg-red-dim text-red" : "bg-green-dim text-green"}`}>Confiscation Risk: {mixedFundsResult["confiscationRisk"] ? "YES" : "NO"}</span>}
                    {Boolean(mixedFundsResult["investigativeSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Investigative Steps</div><ul className="space-y-1">{(mixedFundsResult["investigativeSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* Sanctions Breach */}
            {superToolsTab === "sanctions-breach" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Sanctions Breach Response Advisor</div>
                  <div className="text-11 text-ink-2 mt-0.5">OFAC · EU Regulation 833/2014 · UAE Cabinet Decision 99/2024 · Voluntary disclosure strategy</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Counterparty</label><input value={sanctionsBreachInput.counterparty} onChange={e => setSanctionsBreachInput(p => ({...p, counterparty: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Name of sanctioned entity/individual" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Amount</label><input value={sanctionsBreachInput.transactionAmount} onChange={e => setSanctionsBreachInput(p => ({...p, transactionAmount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. USD 500,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Sanctions List</label><input value={sanctionsBreachInput.sanctionsList} onChange={e => setSanctionsBreachInput(p => ({...p, sanctionsList: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="OFAC SDN, EU, UN, UAEI…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Discovery Date</label><input value={sanctionsBreachInput.discoveryDate} onChange={e => setSanctionsBreachInput(p => ({...p, discoveryDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="YYYY-MM-DD" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Breach Duration</label><input value={sanctionsBreachInput.breachDuration} onChange={e => setSanctionsBreachInput(p => ({...p, breachDuration: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. single transaction, ongoing 3 months" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={sanctionsBreachInput.context} onChange={e => setSanctionsBreachInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runSanctionsBreach()} disabled={sanctionsBreachLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{sanctionsBreachLoading ? "◌ Analysing…" : "Run Sanctions Breach Analysis"}</button>
                {sanctionsBreachResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(sanctionsBreachResult["breachSeverity"]) === "critical" ? "bg-red-dim text-red" : String(sanctionsBreachResult["breachSeverity"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(sanctionsBreachResult["breachSeverity"] ?? "")}</span>
                      {sanctionsBreachResult["voluntaryDisclosureRecommended"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${sanctionsBreachResult["voluntaryDisclosureRecommended"] ? "bg-brand-dim text-brand-deep" : "bg-bg-2 text-ink-2"}`}>Voluntary Disclosure: {sanctionsBreachResult["voluntaryDisclosureRecommended"] ? "RECOMMENDED" : "NOT required"}</span>}
                    </div>
                    {Boolean(sanctionsBreachResult["estimatedPenaltyRange"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Estimated Penalty Range</div><p className="text-12 font-semibold text-red">{String(sanctionsBreachResult["estimatedPenaltyRange"])}</p></div>}
                    {Boolean(sanctionsBreachResult["mitigatingFactors"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Mitigating Factors</div><ul className="space-y-1">{(sanctionsBreachResult["mitigatingFactors"] as string[]).map((f,i) => <li key={i} className="text-12 text-green flex gap-2"><span className="shrink-0">✓</span>{f}</li>)}</ul></div>}
                    {Boolean(sanctionsBreachResult["aggravatingFactors"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Aggravating Factors</div><ul className="space-y-1">{(sanctionsBreachResult["aggravatingFactors"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{f}</li>)}</ul></div>}
                    {Boolean(sanctionsBreachResult["immediateActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Immediate Actions</div><ul className="space-y-1">{(sanctionsBreachResult["immediateActions"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    {Boolean(sanctionsBreachResult["disclosureDraft"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Disclosure Draft</div><pre className="text-11 text-ink-1 bg-bg-panel border border-hair-2 rounded p-3 whitespace-pre-wrap leading-relaxed">{String(sanctionsBreachResult["disclosureDraft"])}</pre></div>}
                  </div>
                )}
              </div>
            )}

            {/* Freeze / Seizure */}
            {superToolsTab === "freeze-seizure" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Asset Freeze / Seizure Advisor</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE AML Law Art.14 · FATF R.4 · Egmont Group · Freeze order drafting and procedure</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={freezeSeizureInput.subjectName} onChange={e => setFreezeSeizureInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual or entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Asset Description</label><input value={freezeSeizureInput.assetDescription} onChange={e => setFreezeSeizureInput(p => ({...p, assetDescription: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Bank accounts, property, vehicles…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Legal Basis Cited</label><input value={freezeSeizureInput.legalBasisCited} onChange={e => setFreezeSeizureInput(p => ({...p, legalBasisCited: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. UAE AML Art.14, court order no." /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Estimated Value</label><input value={freezeSeizureInput.estimatedValue} onChange={e => setFreezeSeizureInput(p => ({...p, estimatedValue: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 10,000,000" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={freezeSeizureInput.jurisdictions} onChange={e => setFreezeSeizureInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries where assets are held" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={freezeSeizureInput.context} onChange={e => setFreezeSeizureInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runFreezeSeizure()} disabled={freezeSeizureLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{freezeSeizureLoading ? "◌ Analysing…" : "Run Freeze / Seizure Analysis"}</button>
                {freezeSeizureResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(freezeSeizureResult["legalBasis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Legal Basis</div><p className="text-12 text-ink-1 leading-relaxed">{String(freezeSeizureResult["legalBasis"])}</p></div>}
                    {Boolean(freezeSeizureResult["eligibleAssets"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Eligible Assets</div><ul className="space-y-1">{(freezeSeizureResult["eligibleAssets"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">→</span>{a}</li>)}</ul></div>}
                    {Boolean(freezeSeizureResult["freezeOrderDraft"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Freeze Order Draft</div><pre className="text-11 text-ink-1 bg-bg-panel border border-hair-2 rounded p-3 whitespace-pre-wrap leading-relaxed">{String(freezeSeizureResult["freezeOrderDraft"])}</pre></div>}
                    {Boolean(freezeSeizureResult["procedureSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Procedure Steps</div><ul className="space-y-1">{(freezeSeizureResult["procedureSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    {Boolean(freezeSeizureResult["timeConstraints"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Time Constraints</div><p className="text-12 text-amber">{String(freezeSeizureResult["timeConstraints"])}</p></div>}
                    {freezeSeizureResult["internationalCooperation"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${freezeSeizureResult["internationalCooperation"] ? "bg-brand-dim text-brand-deep" : "bg-bg-2 text-ink-2"}`}>International Cooperation: {freezeSeizureResult["internationalCooperation"] ? "REQUIRED" : "Not required"}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Audit Response */}
            {superToolsTab === "audit-response" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Audit Response Generator</div>
                  <div className="text-11 text-ink-2 mt-0.5">CBUAE Notice 2023 · IIA Standards · Structured management responses to AML/CFT audit findings</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Auditor / Body Name</label><input value={auditResponseInput.auditorName} onChange={e => setAuditResponseInput(p => ({...p, auditorName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. Internal Audit, CBUAE, KPMG" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Audit Date</label><input value={auditResponseInput.auditDate} onChange={e => setAuditResponseInput(p => ({...p, auditDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="YYYY-MM-DD" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Institution Type</label><input value={auditResponseInput.institutionType} onChange={e => setAuditResponseInput(p => ({...p, institutionType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="bank / DPMS / VASP…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Audit Findings</label><textarea value={auditResponseInput.findings} onChange={e => setAuditResponseInput(p => ({...p, findings: e.target.value}))} rows={4} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Paste the audit findings / observations here…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={auditResponseInput.context} onChange={e => setAuditResponseInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runAuditResponse()} disabled={auditResponseLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{auditResponseLoading ? "◌ Generating…" : "Generate Audit Response"}</button>
                {auditResponseResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(auditResponseResult["overallRating"]) && <div className="flex items-center gap-3"><span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(auditResponseResult["overallRating"]) === "unsatisfactory" ? "bg-red-dim text-red" : String(auditResponseResult["overallRating"]) === "needs improvement" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(auditResponseResult["overallRating"])}</span><span className="text-12 font-semibold text-ink-0">Overall Rating</span></div>}
                    {Array.isArray(auditResponseResult["responses"]) && (auditResponseResult["responses"] as Array<Record<string,string>>).map((resp, i) => (
                      <div key={i} className="border border-hair-2 rounded-lg p-3 space-y-2 bg-bg-panel">
                        <div className="text-12 font-semibold text-ink-0">{resp["finding"]}</div>
                        {Boolean(resp["response"]) && <p className="text-12 text-ink-1 leading-relaxed">{resp["response"]}</p>}
                        {Boolean(resp["rootCause"]) && <div><span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Root Cause: </span><span className="text-11 text-ink-2">{resp["rootCause"]}</span></div>}
                        {Boolean(resp["remediation"]) && <div><span className="text-10 font-mono uppercase tracking-wide-3 text-ink-3">Remediation: </span><span className="text-11 text-ink-1">{resp["remediation"]}</span></div>}
                        <div className="flex gap-4 text-11 text-ink-3">
                          {Boolean(resp["owner"]) && <span>Owner: <span className="text-ink-1">{resp["owner"]}</span></span>}
                          {Boolean(resp["deadline"]) && <span>Deadline: <span className="text-amber">{resp["deadline"]}</span></span>}
                        </div>
                      </div>
                    ))}
                    {Boolean(auditResponseResult["coveringLetter"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Covering Letter</div><pre className="text-11 text-ink-1 bg-bg-panel border border-hair-2 rounded p-3 whitespace-pre-wrap leading-relaxed">{String(auditResponseResult["coveringLetter"])}</pre></div>}
                  </div>
                )}
              </div>
            )}

            {/* High Net Worth */}
            {superToolsTab === "high-net-worth" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">High Net Worth Individual Profile</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.10 · UAE AML Art.16 · EDD requirements for HNWI and source-of-wealth verification</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={hnwInput.subjectName} onChange={e => setHnwInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Nationality</label><input value={hnwInput.nationality} onChange={e => setHnwInput(p => ({...p, nationality: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Country of nationality" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Wealth Estimate (AED)</label><input value={hnwInput.wealthEstimateAed} onChange={e => setHnwInput(p => ({...p, wealthEstimateAed: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 500,000,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">PEP Status</label><input value={hnwInput.pepStatus} onChange={e => setHnwInput(p => ({...p, pepStatus: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="None / Tier 1 / Tier 2 / Family member" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Wealth Sources</label><input value={hnwInput.wealthSources} onChange={e => setHnwInput(p => ({...p, wealthSources: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Business, inheritance, investments, real estate…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={hnwInput.jurisdictions} onChange={e => setHnwInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries of residence / business / asset holding" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={hnwInput.context} onChange={e => setHnwInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runHnw()} disabled={hnwLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{hnwLoading ? "◌ Analysing…" : "Run HNW Profile Analysis"}</button>
                {hnwResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(hnwResult["riskScore"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(hnwResult["riskScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Risk Score</div></div>}
                      {Boolean(hnwResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(hnwResult["riskRating"]) === "critical" ? "bg-red-dim text-red" : String(hnwResult["riskRating"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(hnwResult["riskRating"])}</span>}
                      {hnwResult["wealthSourceVerified"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${hnwResult["wealthSourceVerified"] ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>SOW Verified: {hnwResult["wealthSourceVerified"] ? "YES" : "NO"}</span>}
                    </div>
                    {Boolean(hnwResult["wealthSourceGaps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Wealth Source Gaps</div><ul className="space-y-1">{(hnwResult["wealthSourceGaps"] as string[]).map((g,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">⚠</span>{g}</li>)}</ul></div>}
                    {Boolean(hnwResult["keyRiskFactors"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Key Risk Factors</div><ul className="space-y-1">{(hnwResult["keyRiskFactors"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(hnwResult["eddRequirements"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">EDD Requirements</div><ul className="space-y-1">{(hnwResult["eddRequirements"] as string[]).map((r,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{r}</li>)}</ul></div>}
                    {Boolean(hnwResult["ongoingMonitoringPlan"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Ongoing Monitoring Plan</div><p className="text-12 text-ink-1 leading-relaxed">{String(hnwResult["ongoingMonitoringPlan"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Cash-Intensive */}
            {superToolsTab === "cash-intensive" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Cash-Intensive Business Risk Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.10 · UAE AML Law Art.3 · Structuring typologies and cash deposit pattern analysis</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Business Name</label><input value={cashIntensiveInput.businessName} onChange={e => setCashIntensiveInput(p => ({...p, businessName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Legal entity name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Business Type</label><input value={cashIntensiveInput.businessType} onChange={e => setCashIntensiveInput(p => ({...p, businessType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Restaurant, car wash, retail…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Monthly Revenue</label><input value={cashIntensiveInput.monthlyRevenue} onChange={e => setCashIntensiveInput(p => ({...p, monthlyRevenue: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 200,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Cash % of Revenue</label><input value={cashIntensiveInput.cashPct} onChange={e => setCashIntensiveInput(p => ({...p, cashPct: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 80%" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Deposit Pattern</label><input value={cashIntensiveInput.depositPattern} onChange={e => setCashIntensiveInput(p => ({...p, depositPattern: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. daily small deposits, round numbers, just below threshold" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={cashIntensiveInput.context} onChange={e => setCashIntensiveInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runCashIntensive()} disabled={cashIntensiveLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{cashIntensiveLoading ? "◌ Analysing…" : "Run Cash-Intensive Analysis"}</button>
                {cashIntensiveResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(cashIntensiveResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(cashIntensiveResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(cashIntensiveResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(cashIntensiveResult["riskRating"])}</span>}
                      {Boolean(cashIntensiveResult["cashRiskScore"]) && <div className="text-center"><div className="text-24 font-bold text-amber">{String(cashIntensiveResult["cashRiskScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Cash Risk Score</div></div>}
                    </div>
                    {Boolean(cashIntensiveResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(cashIntensiveResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-red shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(cashIntensiveResult["typologiesMatched"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Typologies Matched</div><div className="flex flex-wrap gap-1.5">{(cashIntensiveResult["typologiesMatched"] as string[]).map((t,i) => <span key={i} className="font-mono text-11 px-2 py-0.5 rounded bg-brand-dim text-brand-deep">{t}</span>)}</div></div>}
                    {Boolean(cashIntensiveResult["controlGaps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Control Gaps</div><ul className="space-y-1">{(cashIntensiveResult["controlGaps"] as string[]).map((g,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">⚠</span>{g}</li>)}</ul></div>}
                    {Boolean(cashIntensiveResult["enhancedMeasures"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Enhanced Measures</div><ul className="space-y-1">{(cashIntensiveResult["enhancedMeasures"] as string[]).map((m,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{m}</li>)}</ul></div>}
                    {Boolean(cashIntensiveResult["reportingObligations"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Reporting Obligations</div><ul className="space-y-1">{(cashIntensiveResult["reportingObligations"] as string[]).map((o,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">→</span>{o}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* Trust Structures */}
            {superToolsTab === "trust-structures" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Trust & Complex Structure Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.25 · UAE FDL 10/2025 Art.7 · UBO identification and opacity risk in layered structures</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity Name</label><input value={trustStructInput.entityName} onChange={e => setTrustStructInput(p => ({...p, entityName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Trust / foundation / holding name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Structure Type</label><input value={trustStructInput.structureType} onChange={e => setTrustStructInput(p => ({...p, structureType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Discretionary trust, foundation, LLC chain…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={trustStructInput.jurisdictions} onChange={e => setTrustStructInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="BVI, Cayman, UAE, Jersey…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Layer Count</label><input value={trustStructInput.layerCount} onChange={e => setTrustStructInput(p => ({...p, layerCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of structural layers" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Stated Purpose</label><input value={trustStructInput.purposeStated} onChange={e => setTrustStructInput(p => ({...p, purposeStated: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Estate planning, asset protection, charity…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={trustStructInput.context} onChange={e => setTrustStructInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runTrustStruct()} disabled={trustStructLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{trustStructLoading ? "◌ Analysing…" : "Run Trust Structure Analysis"}</button>
                {trustStructResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(trustStructResult["opacityScore"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(trustStructResult["opacityScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Opacity Score</div></div>}
                      {Boolean(trustStructResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(trustStructResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(trustStructResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(trustStructResult["riskRating"])}</span>}
                      {trustStructResult["uboIdentified"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${trustStructResult["uboIdentified"] ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>UBO Identified: {trustStructResult["uboIdentified"] ? "YES" : "NO"}</span>}
                    </div>
                    {Boolean(trustStructResult["jurisdictionRisk"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction Risk</div><p className="text-12 text-ink-1 leading-relaxed">{String(trustStructResult["jurisdictionRisk"])}</p></div>}
                    {Boolean(trustStructResult["layersCount"]) && <div className="text-12 text-ink-2">Structural layers: <span className="font-semibold text-ink-0">{String(trustStructResult["layersCount"])}</span></div>}
                    {Boolean(trustStructResult["structureRedFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Structure Red Flags</div><ul className="space-y-1">{(trustStructResult["structureRedFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(trustStructResult["uboVerificationSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">UBO Verification Steps</div><ul className="space-y-1">{(trustStructResult["uboVerificationSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* Cross-Border Wire */}
            {superToolsTab === "cross-border-wire" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Cross-Border Wire Transfer Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.16 · UAE Cabinet Decision 10/2019 · Travel Rule compliance and corridor risk</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Originator Name</label><input value={crossBorderInput.originatorName} onChange={e => setCrossBorderInput(p => ({...p, originatorName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Sending party name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Beneficiary Name</label><input value={crossBorderInput.beneficiaryName} onChange={e => setCrossBorderInput(p => ({...p, beneficiaryName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Receiving party name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Amount</label><input value={crossBorderInput.amount} onChange={e => setCrossBorderInput(p => ({...p, amount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 250,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Currency</label><input value={crossBorderInput.currency} onChange={e => setCrossBorderInput(p => ({...p, currency: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="USD / AED / EUR…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Origin Country</label><input value={crossBorderInput.originCountry} onChange={e => setCrossBorderInput(p => ({...p, originCountry: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Sending country" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Destination Country</label><input value={crossBorderInput.destinationCountry} onChange={e => setCrossBorderInput(p => ({...p, destinationCountry: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Receiving country" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Purpose</label><input value={crossBorderInput.purpose} onChange={e => setCrossBorderInput(p => ({...p, purpose: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Stated purpose of transfer" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={crossBorderInput.context} onChange={e => setCrossBorderInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runCrossBorder()} disabled={crossBorderLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{crossBorderLoading ? "◌ Analysing…" : "Run Cross-Border Wire Analysis"}</button>
                {crossBorderResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {Boolean(crossBorderResult["corridorRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(crossBorderResult["corridorRisk"]) === "high" ? "bg-red-dim text-red" : String(crossBorderResult["corridorRisk"]) === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(crossBorderResult["corridorRisk"])} Corridor Risk</span>}
                      {Boolean(crossBorderResult["r16ComplianceStatus"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(crossBorderResult["r16ComplianceStatus"]) === "non-compliant" ? "bg-red-dim text-red" : String(crossBorderResult["r16ComplianceStatus"]) === "partial" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>R.16: {String(crossBorderResult["r16ComplianceStatus"])}</span>}
                      {Boolean(crossBorderResult["recommendedAction"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(crossBorderResult["recommendedAction"]) === "hold-investigate" ? "bg-red-dim text-red" : String(crossBorderResult["recommendedAction"]) === "proceed" ? "bg-green-dim text-green" : "bg-amber-dim text-amber"}`}>{String(crossBorderResult["recommendedAction"])}</span>}
                    </div>
                    {Boolean(crossBorderResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(crossBorderResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-red shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(crossBorderResult["missingOriginatorInfo"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Missing Originator Info</div><ul className="space-y-1">{(crossBorderResult["missingOriginatorInfo"] as string[]).map((f,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">→</span>{f}</li>)}</ul></div>}
                    {Boolean(crossBorderResult["missingBeneficiaryInfo"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Missing Beneficiary Info</div><ul className="space-y-1">{(crossBorderResult["missingBeneficiaryInfo"] as string[]).map((f,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">→</span>{f}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* FIU Feedback */}
            {superToolsTab === "fiu-feedback" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">FIU Feedback Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FIU · Egmont Group · goAML feedback loop — structured response to FIU feedback on STRs</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">FIU Reference</label><input value={fiuFeedbackInput.fiuRef} onChange={e => setFiuFeedbackInput(p => ({...p, fiuRef: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="FIU feedback reference number" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Feedback Date</label><input value={fiuFeedbackInput.feedbackDate} onChange={e => setFiuFeedbackInput(p => ({...p, feedbackDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="YYYY-MM-DD" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Original STR Reference</label><input value={fiuFeedbackInput.originalStrRef} onChange={e => setFiuFeedbackInput(p => ({...p, originalStrRef: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="STR / goAML reference" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Feedback Content</label><textarea value={fiuFeedbackInput.feedbackContent} onChange={e => setFiuFeedbackInput(p => ({...p, feedbackContent: e.target.value}))} rows={4} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Paste the FIU feedback message here…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={fiuFeedbackInput.context} onChange={e => setFiuFeedbackInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runFiuFeedback()} disabled={fiuFeedbackLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{fiuFeedbackLoading ? "◌ Analysing…" : "Analyse FIU Feedback"}</button>
                {fiuFeedbackResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {Boolean(fiuFeedbackResult["feedbackType"]) && <span className="font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded bg-brand-dim text-brand-deep">{String(fiuFeedbackResult["feedbackType"])}</span>}
                      {Boolean(fiuFeedbackResult["deadlineDays"]) && <span className="font-mono text-11 px-2 py-0.5 rounded bg-red-dim text-red">Respond within {String(fiuFeedbackResult["deadlineDays"])} days</span>}
                    </div>
                    {Boolean(fiuFeedbackResult["keyPoints"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Key Points</div><ul className="space-y-1">{(fiuFeedbackResult["keyPoints"] as string[]).map((p,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">→</span>{p}</li>)}</ul></div>}
                    {Boolean(fiuFeedbackResult["requiredActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Actions</div><ul className="space-y-1">{(fiuFeedbackResult["requiredActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">⚠</span>{a}</li>)}</ul></div>}
                    {Boolean(fiuFeedbackResult["responseDraft"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Response Draft</div><pre className="text-11 text-ink-1 bg-bg-panel border border-hair-2 rounded p-3 whitespace-pre-wrap leading-relaxed">{String(fiuFeedbackResult["responseDraft"])}</pre></div>}
                  </div>
                )}
              </div>
            )}

            {/* De-Risking Impact */}
            {superToolsTab === "derisking-impact" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">De-Risking Impact Assessment</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF Guidance on De-Risking · Basel Committee · Proportionality and financial inclusion obligations</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Customer Segment</label><input value={deriskingInput.customerSegment} onChange={e => setDeriskingInput(p => ({...p, customerSegment: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. MSBs, NPOs, crypto exchanges" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Affected Customer Count</label><input value={deriskingInput.affectedCount} onChange={e => setDeriskingInput(p => ({...p, affectedCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of affected customers" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Institution Type</label><input value={deriskingInput.institutionType} onChange={e => setDeriskingInput(p => ({...p, institutionType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="bank / VASP / DPMS…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Risk Justification</label><textarea value={deriskingInput.riskJustification} onChange={e => setDeriskingInput(p => ({...p, riskJustification: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="State the risk rationale for de-risking this segment…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={deriskingInput.context} onChange={e => setDeriskingInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runDerisking()} disabled={deriskingLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{deriskingLoading ? "◌ Analysing…" : "Run De-Risking Assessment"}</button>
                {deriskingResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {Boolean(deriskingResult["justificationStrength"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(deriskingResult["justificationStrength"]) === "weak" ? "bg-red-dim text-red" : String(deriskingResult["justificationStrength"]) === "moderate" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(deriskingResult["justificationStrength"])} Justification</span>}
                      {deriskingResult["fatfConformant"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${deriskingResult["fatfConformant"] ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>FATF Conformant: {deriskingResult["fatfConformant"] ? "YES" : "NO"}</span>}
                      {Boolean(deriskingResult["reputationalRisk"]) && <span className={`font-mono text-11 px-2 py-0.5 rounded ${String(deriskingResult["reputationalRisk"]) === "high" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>Reputational Risk: {String(deriskingResult["reputationalRisk"])}</span>}
                    </div>
                    {Boolean(deriskingResult["affectedCustomerCount"]) && <div className="text-12 text-ink-2">Affected customers: <span className="font-semibold text-ink-0">{String(deriskingResult["affectedCustomerCount"])}</span></div>}
                    {Boolean(deriskingResult["alternativesMitigants"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Alternatives / Mitigants</div><ul className="space-y-1">{(deriskingResult["alternativesMitigants"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">→</span>{a}</li>)}</ul></div>}
                    {Boolean(deriskingResult["exitProcessRequirements"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Exit Process Requirements</div><ul className="space-y-1">{(deriskingResult["exitProcessRequirements"] as string[]).map((r,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{r}</li>)}</ul></div>}
                    {Boolean(deriskingResult["documentationRequired"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Documentation Required</div><ul className="space-y-1">{(deriskingResult["documentationRequired"] as string[]).map((d,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">→</span>{d}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* Legal Privilege */}
            {superToolsTab === "legal-privilege" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Legal Professional Privilege Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.23 · UAE Federal Decree 26/2021 · LPP scope, tipping-off risk, and disclosure obligations</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Type</label><input value={legalPrivInput.subjectType} onChange={e => setLegalPrivInput(p => ({...p, subjectType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="law firm, in-house counsel, barrister…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Communication Type</label><input value={legalPrivInput.communicationType} onChange={e => setLegalPrivInput(p => ({...p, communicationType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="legal advice, litigation support, transactional…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Legal Relationship</label><input value={legalPrivInput.legalRelationship} onChange={e => setLegalPrivInput(p => ({...p, legalRelationship: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Describe the client–lawyer relationship and instruction" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={legalPrivInput.context} onChange={e => setLegalPrivInput(p => ({...p, context: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runLegalPriv()} disabled={legalPrivLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{legalPrivLoading ? "◌ Analysing…" : "Analyse Legal Privilege"}</button>
                {legalPrivResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {legalPrivResult["privilegeApplies"] !== undefined && <span className={`font-mono text-13 font-bold uppercase px-3 py-1 rounded ${legalPrivResult["privilegeApplies"] ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>Privilege {legalPrivResult["privilegeApplies"] ? "APPLIES" : "DOES NOT APPLY"}</span>}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {Boolean(legalPrivResult["tippingOffRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(legalPrivResult["tippingOffRisk"]) === "high" ? "bg-red-dim text-red" : String(legalPrivResult["tippingOffRisk"]) === "medium" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Tipping-Off Risk: {String(legalPrivResult["tippingOffRisk"])}</span>}
                      {legalPrivResult["disclosurePermitted"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${legalPrivResult["disclosurePermitted"] ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>Disclosure: {legalPrivResult["disclosurePermitted"] ? "PERMITTED" : "NOT PERMITTED"}</span>}
                      {legalPrivResult["legalCounselRequired"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${legalPrivResult["legalCounselRequired"] ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>Legal Counsel: {legalPrivResult["legalCounselRequired"] ? "REQUIRED" : "Optional"}</span>}
                    </div>
                    {Boolean(legalPrivResult["safeProcedureSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Safe Procedure Steps</div><ul className="space-y-1">{(legalPrivResult["safeProcedureSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            )}

            {/* ML Scenario */}
            {superToolsTab === "ml-scenario" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Money Laundering Scenario Builder</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF 40 Recommendations · UNODC · Placement / Layering / Integration typology mapping</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={mlScenarioInput.subjectName} onChange={e => setMlScenarioInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual or entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Predicate Offence</label><input value={mlScenarioInput.predicateOffence} onChange={e => setMlScenarioInput(p => ({...p, predicateOffence: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Fraud, corruption, drug trafficking…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Estimated Amount</label><input value={mlScenarioInput.estimatedAmount} onChange={e => setMlScenarioInput(p => ({...p, estimatedAmount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 25,000,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Sectors Involved</label><input value={mlScenarioInput.sectors} onChange={e => setMlScenarioInput(p => ({...p, sectors: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Real estate, banking, crypto…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={mlScenarioInput.jurisdictions} onChange={e => setMlScenarioInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries involved in the scenario" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={mlScenarioInput.context} onChange={e => setMlScenarioInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runMlScenario()} disabled={mlScenarioLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{mlScenarioLoading ? "◌ Building…" : "Build ML Scenario"}</button>
                {mlScenarioResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(mlScenarioResult["scenarioTitle"]) && <div className="text-14 font-bold text-ink-0">{String(mlScenarioResult["scenarioTitle"])}</div>}
                    <div className="grid grid-cols-1 gap-3">
                      {Boolean(mlScenarioResult["predicate"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Predicate Offence</div><p className="text-12 text-ink-1 leading-relaxed">{String(mlScenarioResult["predicate"])}</p></div>}
                      {Boolean(mlScenarioResult["placement"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Placement</div><p className="text-12 text-ink-1 leading-relaxed">{String(mlScenarioResult["placement"])}</p></div>}
                      {Boolean(mlScenarioResult["layering"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Layering</div><p className="text-12 text-ink-1 leading-relaxed">{String(mlScenarioResult["layering"])}</p></div>}
                      {Boolean(mlScenarioResult["integration"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Integration</div><p className="text-12 text-ink-1 leading-relaxed">{String(mlScenarioResult["integration"])}</p></div>}
                    </div>
                    {Boolean(mlScenarioResult["totalAmountAed"]) && <div className="text-12 text-ink-2">Total Amount: <span className="font-semibold text-ink-0">{String(mlScenarioResult["totalAmountAed"])}</span></div>}
                    {Boolean(mlScenarioResult["keyVehicles"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Key Vehicles</div><div className="flex flex-wrap gap-1.5">{(mlScenarioResult["keyVehicles"] as string[]).map((v,i) => <span key={i} className="font-mono text-11 px-2 py-0.5 rounded bg-brand-dim text-brand-deep">{v}</span>)}</div></div>}
                    {Boolean(mlScenarioResult["redFlagSummary"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flag Summary</div><ul className="space-y-1">{(mlScenarioResult["redFlagSummary"] as string[]).map((f,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-red shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(mlScenarioResult["typologyCode"]) && <span className="font-mono text-11 px-2 py-0.5 rounded bg-bg-2 text-ink-2">Typology: {String(mlScenarioResult["typologyCode"])}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Staff Alert */}
            {superToolsTab === "staff-alert" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Staff Alert / Internal Whistleblower Adviser</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.24 · FATF R.18 · Internal alert credibility and MLRO action protocol</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Alert Source</label><input value={staffAlertInput.alertSource} onChange={e => setStaffAlertInput(p => ({...p, alertSource: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Anonymous tip, line manager, hotline…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Employee Name</label><input value={staffAlertInput.employeeName} onChange={e => setStaffAlertInput(p => ({...p, employeeName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Subject employee (if known)" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Employee Role</label><input value={staffAlertInput.employeeRole} onChange={e => setStaffAlertInput(p => ({...p, employeeRole: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Relationship manager, teller, analyst…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Allegation</label><input value={staffAlertInput.allegation} onChange={e => setStaffAlertInput(p => ({...p, allegation: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Nature of alleged misconduct" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Evidence Described</label><textarea value={staffAlertInput.evidenceDescribed} onChange={e => setStaffAlertInput(p => ({...p, evidenceDescribed: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe any evidence mentioned in the alert…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={staffAlertInput.context} onChange={e => setStaffAlertInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runStaffAlert()} disabled={staffAlertLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{staffAlertLoading ? "◌ Analysing…" : "Analyse Staff Alert"}</button>
                {staffAlertResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(staffAlertResult["credibilityScore"]) && <div className="text-center"><div className="text-32 font-bold text-amber">{String(staffAlertResult["credibilityScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Credibility Score</div></div>}
                      {Boolean(staffAlertResult["urgencyLevel"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(staffAlertResult["urgencyLevel"]) === "critical" ? "bg-red-dim text-red" : String(staffAlertResult["urgencyLevel"]) === "high" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(staffAlertResult["urgencyLevel"])} Urgency</span>}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {staffAlertResult["hrCoordinationRequired"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${staffAlertResult["hrCoordinationRequired"] ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>HR Coordination: {staffAlertResult["hrCoordinationRequired"] ? "REQUIRED" : "Not required"}</span>}
                      {staffAlertResult["regulatoryReportingRequired"] !== undefined && <span className={`font-mono text-11 px-2 py-0.5 rounded ${staffAlertResult["regulatoryReportingRequired"] ? "bg-red-dim text-red" : "bg-bg-2 text-ink-2"}`}>Regulatory Reporting: {staffAlertResult["regulatoryReportingRequired"] ? "REQUIRED" : "Not required"}</span>}
                    </div>
                    {Boolean(staffAlertResult["verificationSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Verification Steps</div><ul className="space-y-1">{(staffAlertResult["verificationSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    {Boolean(staffAlertResult["mlroActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">MLRO Actions</div><ul className="space-y-1">{(staffAlertResult["mlroActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">⚠</span>{a}</li>)}</ul></div>}
                    {Boolean(staffAlertResult["confidentialityProtocol"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Confidentiality Protocol</div><p className="text-12 text-ink-1 leading-relaxed">{String(staffAlertResult["confidentialityProtocol"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* STR Quality Scorer */}
            {superToolsTab === "str-quality" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">STR Quality Scorer</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.15 · FATF R.20 · goAML quality gate — score your STR narrative before submission</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={strQualityInput.subjectName} onChange={e => setStrQualityInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Reporting subject" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Total Amount</label><input value={strQualityInput.totalAmount} onChange={e => setStrQualityInput(p => ({...p, totalAmount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. AED 500,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Count</label><input value={strQualityInput.transactionCount} onChange={e => setStrQualityInput(p => ({...p, transactionCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of transactions" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Suspected Offence</label><input value={strQualityInput.suspectedOffence} onChange={e => setStrQualityInput(p => ({...p, suspectedOffence: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="ML, fraud, structuring…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Narrative Text</label><textarea value={strQualityInput.narrativeText} onChange={e => setStrQualityInput(p => ({...p, narrativeText: e.target.value}))} rows={4} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Paste the STR narrative text to be scored…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={strQualityInput.context} onChange={e => setStrQualityInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runStrQuality()} disabled={strQualityLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{strQualityLoading ? "◌ Scoring…" : "Score STR Quality"}</button>
                {strQualityResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(strQualityResult["qualityScore"]) && <div className="text-center"><div className="text-32 font-bold text-brand">{String(strQualityResult["qualityScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Quality Score</div></div>}
                      {Boolean(strQualityResult["grade"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(strQualityResult["grade"]) === "A" ? "bg-green-dim text-green" : String(strQualityResult["grade"]) === "B" ? "bg-brand-dim text-brand" : String(strQualityResult["grade"]) === "C" ? "bg-amber-dim text-amber" : "bg-red-dim text-red"}`}>Grade {String(strQualityResult["grade"])}</span>}
                    </div>
                    {Boolean(strQualityResult["deficiencies"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Deficiencies</div><ul className="space-y-1">{(strQualityResult["deficiencies"] as string[]).map((d,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{d}</li>)}</ul></div>}
                    {Boolean(strQualityResult["improvements"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Recommended Improvements</div><ul className="space-y-1">{(strQualityResult["improvements"] as string[]).map((imp,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{imp}</li>)}</ul></div>}
                    {Boolean(strQualityResult["summary"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Summary</div><p className="text-12 text-ink-1 leading-relaxed">{String(strQualityResult["summary"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Hawala Detector */}
            {superToolsTab === "hawala-detector" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Hawala / Informal Value Transfer Detector</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.14 · UAE FDL 10/2025 · Informal value transfer typology indicators and risk assessment</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={hawalaInput.subjectName} onChange={e => setHawalaInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual or business" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Business Type</label><input value={hawalaInput.businessType} onChange={e => setHawalaInput(p => ({...p, businessType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Exchange, trading, retail…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Cash Volume</label><input value={hawalaInput.cashVolume} onChange={e => setHawalaInput(p => ({...p, cashVolume: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Monthly cash turnover" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Counterparties</label><input value={hawalaInput.counterparties} onChange={e => setHawalaInput(p => ({...p, counterparties: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries or names of counterparts" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Pattern</label><textarea value={hawalaInput.transactionPattern} onChange={e => setHawalaInput(p => ({...p, transactionPattern: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe the observed transaction patterns…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={hawalaInput.context} onChange={e => setHawalaInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runHawala()} disabled={hawalaLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{hawalaLoading ? "◌ Detecting…" : "Detect Hawala Risk"}</button>
                {hawalaResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(hawalaResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(hawalaResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(hawalaResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(hawalaResult["riskRating"])} Risk</span>}
                      {Boolean(hawalaResult["hawalaLikelihood"]) && <div className="text-center"><div className="text-32 font-bold text-amber">{String(hawalaResult["hawalaLikelihood"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Hawala Likelihood</div></div>}
                    </div>
                    {Boolean(hawalaResult["indicators"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Indicators Detected</div><ul className="space-y-1">{(hawalaResult["indicators"] as string[]).map((ind,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">▸</span>{ind}</li>)}</ul></div>}
                    {Boolean(hawalaResult["recommendedActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Recommended Actions</div><ul className="space-y-1">{(hawalaResult["recommendedActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{a}</li>)}</ul></div>}
                    {Boolean(hawalaResult["regulatoryBasis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Regulatory Basis</div><p className="text-12 text-ink-1 leading-relaxed">{String(hawalaResult["regulatoryBasis"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Nominee Risk */}
            {superToolsTab === "nominee-risk" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Nominee Director / Shareholder Risk Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.24 · UAE Commercial Companies Law · Nominee arrangement risk and beneficial ownership assessment</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Company Name</label><input value={nomineeInput.companyName} onChange={e => setNomineeInput(p => ({...p, companyName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Legal entity name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Director Name</label><input value={nomineeInput.directorName} onChange={e => setNomineeInput(p => ({...p, directorName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Nominee director name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Incorporation Date</label><input value={nomineeInput.incorporationDate} onChange={e => setNomineeInput(p => ({...p, incorporationDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 2021-03-15" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Business Activity</label><input value={nomineeInput.businessActivity} onChange={e => setNomineeInput(p => ({...p, businessActivity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Stated business activity" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Controller Details</label><textarea value={nomineeInput.controllerDetails} onChange={e => setNomineeInput(p => ({...p, controllerDetails: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Known or suspected controller information…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={nomineeInput.context} onChange={e => setNomineeInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runNominee()} disabled={nomineeLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{nomineeLoading ? "◌ Analysing…" : "Analyse Nominee Risk"}</button>
                {nomineeResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(nomineeResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(nomineeResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(nomineeResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(nomineeResult["riskRating"])} Risk</span>}
                      {Boolean(nomineeResult["nomineeConfidence"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(nomineeResult["nomineeConfidence"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Nominee Confidence</div></div>}
                    </div>
                    {Boolean(nomineeResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(nomineeResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{f}</li>)}</ul></div>}
                    {Boolean(nomineeResult["requiredActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Actions</div><ul className="space-y-1">{(nomineeResult["requiredActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{a}</li>)}</ul></div>}
                    {Boolean(nomineeResult["analysis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Analysis</div><p className="text-12 text-ink-1 leading-relaxed">{String(nomineeResult["analysis"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* PEP Corporate */}
            {superToolsTab === "pep-corporate" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">PEP Corporate Nexus Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.12 · UAE FDL 10/2025 · PEP-linked corporate ownership risk and enhanced due diligence requirements</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Company Name</label><input value={pepCorpInput.companyName} onChange={e => setPepCorpInput(p => ({...p, companyName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Corporate entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">PEP Name</label><input value={pepCorpInput.pepName} onChange={e => setPepCorpInput(p => ({...p, pepName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Politically exposed person" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">PEP Role</label><input value={pepCorpInput.pepRole} onChange={e => setPepCorpInput(p => ({...p, pepRole: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Minister, MP, senior official…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Ownership %</label><input value={pepCorpInput.ownershipPct} onChange={e => setPepCorpInput(p => ({...p, ownershipPct: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 25%" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Industry Context</label><textarea value={pepCorpInput.industryContext} onChange={e => setPepCorpInput(p => ({...p, industryContext: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Industry, sector, and relevant government contracts…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={pepCorpInput.context} onChange={e => setPepCorpInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runPepCorp()} disabled={pepCorpLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{pepCorpLoading ? "◌ Analysing…" : "Analyse PEP Corporate Nexus"}</button>
                {pepCorpResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(pepCorpResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(pepCorpResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(pepCorpResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(pepCorpResult["riskRating"])} Risk</span>}
                      {Boolean(pepCorpResult["eddRequired"]) && <span className={`font-mono text-11 px-2 py-0.5 rounded ${pepCorpResult["eddRequired"] ? "bg-red-dim text-red" : "bg-bg-2 text-ink-2"}`}>EDD: {pepCorpResult["eddRequired"] ? "REQUIRED" : "Not required"}</span>}
                    </div>
                    {Boolean(pepCorpResult["riskFactors"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Risk Factors</div><ul className="space-y-1">{(pepCorpResult["riskFactors"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{f}</li>)}</ul></div>}
                    {Boolean(pepCorpResult["eddMeasures"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">EDD Measures</div><ul className="space-y-1">{(pepCorpResult["eddMeasures"] as string[]).map((m,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{m}</li>)}</ul></div>}
                    {Boolean(pepCorpResult["conclusion"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Conclusion</div><p className="text-12 text-ink-1 leading-relaxed">{String(pepCorpResult["conclusion"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Crypto Mixing */}
            {superToolsTab === "crypto-mixing" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Crypto Mixing / Obfuscation Detector</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.15 · VA Guidance · Cryptocurrency mixing, tumbling, and chain-hopping typology detection</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Wallet Address</label><input value={cryptoMixInput.walletAddress} onChange={e => setCryptoMixInput(p => ({...p, walletAddress: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Blockchain wallet address" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Crypto Type</label><input value={cryptoMixInput.cryptoType} onChange={e => setCryptoMixInput(p => ({...p, cryptoType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="BTC, ETH, XMR…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Amount (USD)</label><input value={cryptoMixInput.amountUsd} onChange={e => setCryptoMixInput(p => ({...p, amountUsd: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Estimated USD value" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Exchange Context</label><input value={cryptoMixInput.exchangeContext} onChange={e => setCryptoMixInput(p => ({...p, exchangeContext: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="VASP or DEX name" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Hashes</label><textarea value={cryptoMixInput.transactionHashes} onChange={e => setCryptoMixInput(p => ({...p, transactionHashes: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Known transaction hashes (comma-separated)…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={cryptoMixInput.context} onChange={e => setCryptoMixInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runCryptoMix()} disabled={cryptoMixLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{cryptoMixLoading ? "◌ Detecting…" : "Detect Mixing Activity"}</button>
                {cryptoMixResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(cryptoMixResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(cryptoMixResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(cryptoMixResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(cryptoMixResult["riskRating"])} Risk</span>}
                      {Boolean(cryptoMixResult["mixingProbability"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(cryptoMixResult["mixingProbability"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Mixing Probability</div></div>}
                    </div>
                    {Boolean(cryptoMixResult["obfuscationTechniques"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Obfuscation Techniques</div><ul className="space-y-1">{(cryptoMixResult["obfuscationTechniques"] as string[]).map((t,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{t}</li>)}</ul></div>}
                    {Boolean(cryptoMixResult["recommendedActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Recommended Actions</div><ul className="space-y-1">{(cryptoMixResult["recommendedActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{a}</li>)}</ul></div>}
                    {Boolean(cryptoMixResult["analysis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Analysis</div><p className="text-12 text-ink-1 leading-relaxed">{String(cryptoMixResult["analysis"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Ghost Company */}
            {superToolsTab === "ghost-company" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Ghost / Shell Company Identifier</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.24 · UAE Commercial Companies Law · Ghost company indicators and substance evaluation</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Company Name</label><input value={ghostCoInput.companyName} onChange={e => setGhostCoInput(p => ({...p, companyName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Legal entity name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Incorporation Date</label><input value={ghostCoInput.incorporationDate} onChange={e => setGhostCoInput(p => ({...p, incorporationDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 2020-01-10" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Employee Count</label><input value={ghostCoInput.employeeCount} onChange={e => setGhostCoInput(p => ({...p, employeeCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Known or stated headcount" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Physical Address</label><input value={ghostCoInput.physicalAddress} onChange={e => setGhostCoInput(p => ({...p, physicalAddress: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Registered / operating address" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Trade Activity</label><textarea value={ghostCoInput.tradeActivity} onChange={e => setGhostCoInput(p => ({...p, tradeActivity: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Described trade or business activity…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={ghostCoInput.context} onChange={e => setGhostCoInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runGhostCo()} disabled={ghostCoLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{ghostCoLoading ? "◌ Analysing…" : "Identify Ghost Company"}</button>
                {ghostCoResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(ghostCoResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(ghostCoResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(ghostCoResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(ghostCoResult["riskRating"])} Risk</span>}
                      {Boolean(ghostCoResult["ghostScore"]) && <div className="text-center"><div className="text-32 font-bold text-red">{String(ghostCoResult["ghostScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Ghost Score</div></div>}
                    </div>
                    {Boolean(ghostCoResult["substanceDeficiencies"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Substance Deficiencies</div><ul className="space-y-1">{(ghostCoResult["substanceDeficiencies"] as string[]).map((d,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{d}</li>)}</ul></div>}
                    {Boolean(ghostCoResult["requiredEvidence"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Evidence</div><ul className="space-y-1">{(ghostCoResult["requiredEvidence"] as string[]).map((e,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{e}</li>)}</ul></div>}
                    {Boolean(ghostCoResult["conclusion"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Conclusion</div><p className="text-12 text-ink-1 leading-relaxed">{String(ghostCoResult["conclusion"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* pKYC Planner */}
            {superToolsTab === "pkeyc-planner" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Periodic KYC Review Planner</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.13 · FATF R.10 · Periodic CDD review cycle planning and overdue queue prioritisation</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Institution Type</label><input value={pKycInput.institutionType} onChange={e => setPKycInput(p => ({...p, institutionType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Bank, DNFBP, VASP…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Total Customer Count</label><input value={pKycInput.customerCount} onChange={e => setPKycInput(p => ({...p, customerCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 12,000" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">High-Risk Count</label><input value={pKycInput.highRiskCount} onChange={e => setPKycInput(p => ({...p, highRiskCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of high-risk customers" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">PEP Count</label><input value={pKycInput.pepCount} onChange={e => setPKycInput(p => ({...p, pepCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of PEP customers" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Overdue Reviews</label><input value={pKycInput.overdueCount} onChange={e => setPKycInput(p => ({...p, overdueCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Count of overdue pKYC reviews" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={pKycInput.context} onChange={e => setPKycInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runPKyc()} disabled={pKycLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{pKycLoading ? "◌ Planning…" : "Generate pKYC Plan"}</button>
                {pKycResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(pKycResult["reviewSchedule"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Review Schedule</div><p className="text-12 text-ink-1 leading-relaxed">{String(pKycResult["reviewSchedule"])}</p></div>}
                    {Boolean(pKycResult["priorityQueue"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Priority Queue</div><ul className="space-y-1">{(pKycResult["priorityQueue"] as string[]).map((q,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{q}</li>)}</ul></div>}
                    {Boolean(pKycResult["complianceGaps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Compliance Gaps</div><ul className="space-y-1">{(pKycResult["complianceGaps"] as string[]).map((g,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{g}</li>)}</ul></div>}
                    {Boolean(pKycResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(pKycResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Whistleblower */}
            {superToolsTab === "whistleblower" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Whistleblower Report Handler</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.24 · FATF R.18 · Whistleblower allegation triage, credibility assessment, and MLRO response protocol</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Report Source</label><input value={whistleInput.reportSource} onChange={e => setWhistleInput(p => ({...p, reportSource: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Anonymous, employee, regulator…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Accused Role</label><input value={whistleInput.accusedRole} onChange={e => setWhistleInput(p => ({...p, accusedRole: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Director, compliance officer, teller…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Affected Customers</label><input value={whistleInput.affectedCustomers} onChange={e => setWhistleInput(p => ({...p, affectedCustomers: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number or names of affected customers" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Allegation</label><textarea value={whistleInput.allegation} onChange={e => setWhistleInput(p => ({...p, allegation: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Nature and details of the allegation…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Evidence Described</label><textarea value={whistleInput.evidenceDescribed} onChange={e => setWhistleInput(p => ({...p, evidenceDescribed: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe any evidence mentioned…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={whistleInput.context} onChange={e => setWhistleInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runWhistle()} disabled={whistleLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{whistleLoading ? "◌ Triaging…" : "Triage Whistleblower Report"}</button>
                {whistleResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(whistleResult["credibilityScore"]) && <div className="text-center"><div className="text-32 font-bold text-amber">{String(whistleResult["credibilityScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Credibility Score</div></div>}
                      {Boolean(whistleResult["urgencyLevel"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(whistleResult["urgencyLevel"]) === "critical" ? "bg-red-dim text-red" : String(whistleResult["urgencyLevel"]) === "high" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(whistleResult["urgencyLevel"])} Urgency</span>}
                    </div>
                    {Boolean(whistleResult["mlroActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">MLRO Actions</div><ul className="space-y-1">{(whistleResult["mlroActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">⚠</span>{a}</li>)}</ul></div>}
                    {Boolean(whistleResult["verificationSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Verification Steps</div><ul className="space-y-1">{(whistleResult["verificationSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    {Boolean(whistleResult["protectionMeasures"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Protection Measures</div><p className="text-12 text-ink-1 leading-relaxed">{String(whistleResult["protectionMeasures"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Trade Finance RF */}
            {superToolsTab === "trade-finance-rf" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Trade Finance Red Flag Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF TBML Guidance · UAE FDL 10/2025 · Trade-based money laundering indicators in trade finance transactions</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Type</label><input value={tradeFinRfInput.transactionType} onChange={e => setTradeFinRfInput(p => ({...p, transactionType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="LC, documentary collection, open account…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Commodity</label><input value={tradeFinRfInput.commodity} onChange={e => setTradeFinRfInput(p => ({...p, commodity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Goods being traded" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Importer Name</label><input value={tradeFinRfInput.importerName} onChange={e => setTradeFinRfInput(p => ({...p, importerName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Importing party" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Exporter Name</label><input value={tradeFinRfInput.exporterName} onChange={e => setTradeFinRfInput(p => ({...p, exporterName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Exporting party" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Invoice Value</label><input value={tradeFinRfInput.invoiceValue} onChange={e => setTradeFinRfInput(p => ({...p, invoiceValue: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Stated invoice value" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Market Value</label><input value={tradeFinRfInput.marketValue} onChange={e => setTradeFinRfInput(p => ({...p, marketValue: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Fair market value estimate" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Shipping Route</label><input value={tradeFinRfInput.shippingRoute} onChange={e => setTradeFinRfInput(p => ({...p, shippingRoute: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Origin → transit → destination countries" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={tradeFinRfInput.context} onChange={e => setTradeFinRfInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runTradeFinRf()} disabled={tradeFinRfLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{tradeFinRfLoading ? "◌ Analysing…" : "Analyse Trade Finance Risk"}</button>
                {tradeFinRfResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(tradeFinRfResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(tradeFinRfResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(tradeFinRfResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(tradeFinRfResult["riskRating"])} Risk</span>}
                      {Boolean(tradeFinRfResult["pricingVariance"]) && <div className="text-center"><div className="text-24 font-bold text-amber">{String(tradeFinRfResult["pricingVariance"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Pricing Variance</div></div>}
                    </div>
                    {Boolean(tradeFinRfResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(tradeFinRfResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{f}</li>)}</ul></div>}
                    {Boolean(tradeFinRfResult["requiredDocuments"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Documents</div><ul className="space-y-1">{(tradeFinRfResult["requiredDocuments"] as string[]).map((d,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{d}</li>)}</ul></div>}
                    {Boolean(tradeFinRfResult["conclusion"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Conclusion</div><p className="text-12 text-ink-1 leading-relaxed">{String(tradeFinRfResult["conclusion"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Sanctions Exposure Calc */}
            {superToolsTab === "sanctions-exposure-calc" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Sanctions Exposure Calculator</div>
                  <div className="text-11 text-ink-2 mt-0.5">OFAC · UN · EU · UAE SFO — Quantify entity sanctions exposure across multiple regimes and jurisdictions</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity Name</label><input value={sanctionsExpInput.entityName} onChange={e => setSanctionsExpInput(p => ({...p, entityName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual or corporate entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity Type</label><input value={sanctionsExpInput.entityType} onChange={e => setSanctionsExpInput(p => ({...p, entityType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Individual, corporate, vessel, aircraft…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={sanctionsExpInput.jurisdictions} onChange={e => setSanctionsExpInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries of nexus (comma-separated)" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Count</label><input value={sanctionsExpInput.transactionCount} onChange={e => setSanctionsExpInput(p => ({...p, transactionCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of transactions" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Total Value (USD)</label><input value={sanctionsExpInput.totalValueUsd} onChange={e => setSanctionsExpInput(p => ({...p, totalValueUsd: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Total USD equivalent" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={sanctionsExpInput.context} onChange={e => setSanctionsExpInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runSanctionsExp()} disabled={sanctionsExpLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{sanctionsExpLoading ? "◌ Calculating…" : "Calculate Sanctions Exposure"}</button>
                {sanctionsExpResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(sanctionsExpResult["exposureLevel"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(sanctionsExpResult["exposureLevel"]) === "critical" ? "bg-red-dim text-red" : String(sanctionsExpResult["exposureLevel"]) === "high" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(sanctionsExpResult["exposureLevel"])} Exposure</span>}
                      {Boolean(sanctionsExpResult["estimatedPenalty"]) && <div className="text-center"><div className="text-24 font-bold text-red">{String(sanctionsExpResult["estimatedPenalty"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Est. Penalty Range</div></div>}
                    </div>
                    {Boolean(sanctionsExpResult["regimesTriggered"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Regimes Triggered</div><ul className="space-y-1">{(sanctionsExpResult["regimesTriggered"] as string[]).map((r,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{r}</li>)}</ul></div>}
                    {Boolean(sanctionsExpResult["mitigationSteps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Mitigation Steps</div><ul className="space-y-1">{(sanctionsExpResult["mitigationSteps"] as string[]).map((s,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{s}</li>)}</ul></div>}
                    {Boolean(sanctionsExpResult["conclusion"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Conclusion</div><p className="text-12 text-ink-1 leading-relaxed">{String(sanctionsExpResult["conclusion"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* Customer Lifecycle */}
            {superToolsTab === "customer-lifecycle" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Customer Lifecycle Risk Monitor</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.13 · FATF R.10 · Ongoing monitoring and risk rating evolution throughout the customer lifecycle</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Customer Name</label><input value={custLifeInput.customerName} onChange={e => setCustLifeInput(p => ({...p, customerName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Customer or entity name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Onboarding Date</label><input value={custLifeInput.onboardingDate} onChange={e => setCustLifeInput(p => ({...p, onboardingDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 2022-06-01" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Current Risk Rating</label><input value={custLifeInput.currentRiskRating} onChange={e => setCustLifeInput(p => ({...p, currentRiskRating: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Low, medium, high" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Volume</label><input value={custLifeInput.transactionVolume} onChange={e => setCustLifeInput(p => ({...p, transactionVolume: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Monthly or annual volume" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Recent Changes</label><textarea value={custLifeInput.recentChanges} onChange={e => setCustLifeInput(p => ({...p, recentChanges: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Changes in behaviour, ownership, activity…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={custLifeInput.context} onChange={e => setCustLifeInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runCustLife()} disabled={custLifeLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{custLifeLoading ? "◌ Monitoring…" : "Monitor Customer Lifecycle"}</button>
                {custLifeResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(custLifeResult["revisedRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(custLifeResult["revisedRating"]) === "high" ? "bg-red-dim text-red" : String(custLifeResult["revisedRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>Revised: {String(custLifeResult["revisedRating"])}</span>}
                      {Boolean(custLifeResult["reviewRequired"]) && <span className={`font-mono text-11 px-2 py-0.5 rounded ${custLifeResult["reviewRequired"] ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>Review: {custLifeResult["reviewRequired"] ? "REQUIRED" : "Not required"}</span>}
                    </div>
                    {Boolean(custLifeResult["triggers"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Risk Triggers</div><ul className="space-y-1">{(custLifeResult["triggers"] as string[]).map((t,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">▸</span>{t}</li>)}</ul></div>}
                    {Boolean(custLifeResult["actions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Recommended Actions</div><ul className="space-y-1">{(custLifeResult["actions"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{a}</li>)}</ul></div>}
                    {Boolean(custLifeResult["summary"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Summary</div><p className="text-12 text-ink-1 leading-relaxed">{String(custLifeResult["summary"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* PEP Enhanced Screening */}
            {superToolsTab === "pep-screening-enhance" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Enhanced PEP Screening</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.12 · UAE FDL 10/2025 · Enhanced due diligence for politically exposed persons including wealth and connections analysis</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Subject Name</label><input value={pepEnhInput.subjectName} onChange={e => setPepEnhInput(p => ({...p, subjectName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="PEP full name" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Current Role</label><input value={pepEnhInput.currentRole} onChange={e => setPepEnhInput(p => ({...p, currentRole: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Current political or senior position" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={pepEnhInput.jurisdiction} onChange={e => setPepEnhInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Country of political position" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Wealth Estimate</label><input value={pepEnhInput.wealthEstimate} onChange={e => setPepEnhInput(p => ({...p, wealthEstimate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Known or estimated net worth" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Known Connections</label><textarea value={pepEnhInput.knownConnections} onChange={e => setPepEnhInput(p => ({...p, knownConnections: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Family members, associates, business interests…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={pepEnhInput.context} onChange={e => setPepEnhInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runPepEnh()} disabled={pepEnhLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{pepEnhLoading ? "◌ Screening…" : "Run Enhanced PEP Screening"}</button>
                {pepEnhResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(pepEnhResult["riskRating"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(pepEnhResult["riskRating"]) === "high" ? "bg-red-dim text-red" : String(pepEnhResult["riskRating"]) === "medium" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>{String(pepEnhResult["riskRating"])} Risk</span>}
                      {Boolean(pepEnhResult["eddRequired"]) && <span className={`font-mono text-11 px-2 py-0.5 rounded ${pepEnhResult["eddRequired"] ? "bg-red-dim text-red" : "bg-bg-2 text-ink-2"}`}>EDD: {pepEnhResult["eddRequired"] ? "REQUIRED" : "Not required"}</span>}
                    </div>
                    {Boolean(pepEnhResult["concernAreas"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Areas of Concern</div><ul className="space-y-1">{(pepEnhResult["concernAreas"] as string[]).map((c,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">▸</span>{c}</li>)}</ul></div>}
                    {Boolean(pepEnhResult["eddChecklist"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">EDD Checklist</div><ul className="space-y-1">{(pepEnhResult["eddChecklist"] as string[]).map((item,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{item}</li>)}</ul></div>}
                    {Boolean(pepEnhResult["analysis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Analysis</div><p className="text-12 text-ink-1 leading-relaxed">{String(pepEnhResult["analysis"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* AML Training Gap */}
            {superToolsTab === "aml-training-gap" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">AML Training Gap Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 Art.19 · FATF R.18 · Identify AML/CFT training gaps and build a remediation programme</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Total Staff Count</label><input value={amlTrainInput.staffCount} onChange={e => setAmlTrainInput(p => ({...p, staffCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Total number of staff" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Completion Rate (%)</label><input value={amlTrainInput.completionRate} onChange={e => setAmlTrainInput(p => ({...p, completionRate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 72%" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">High-Risk Roles</label><input value={amlTrainInput.highRiskRoles} onChange={e => setAmlTrainInput(p => ({...p, highRiskRoles: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Roles requiring priority training" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Overdue Count</label><input value={amlTrainInput.overdueCount} onChange={e => setAmlTrainInput(p => ({...p, overdueCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Staff with overdue training" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Last Training Date</label><input value={amlTrainInput.lastTrainingDate} onChange={e => setAmlTrainInput(p => ({...p, lastTrainingDate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Date of last institution-wide training" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={amlTrainInput.context} onChange={e => setAmlTrainInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runAmlTrain()} disabled={amlTrainLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{amlTrainLoading ? "◌ Analysing…" : "Analyse Training Gaps"}</button>
                {amlTrainResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(amlTrainResult["complianceStatus"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(amlTrainResult["complianceStatus"]) === "non-compliant" ? "bg-red-dim text-red" : String(amlTrainResult["complianceStatus"]) === "partial" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(amlTrainResult["complianceStatus"])}</span>}
                    </div>
                    {Boolean(amlTrainResult["gaps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Training Gaps</div><ul className="space-y-1">{(amlTrainResult["gaps"] as string[]).map((g,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{g}</li>)}</ul></div>}
                    {Boolean(amlTrainResult["remediationPlan"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Remediation Plan</div><ul className="space-y-1">{(amlTrainResult["remediationPlan"] as string[]).map((step,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{step}</li>)}</ul></div>}
                    {Boolean(amlTrainResult["regulatoryRisk"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Regulatory Risk</div><p className="text-12 text-ink-1 leading-relaxed">{String(amlTrainResult["regulatoryRisk"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* UBO Verify */}
            {superToolsTab === "beneficial-owner-verify" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Beneficial Owner Verification</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.24/R.25 · UAE Federal Law 32 of 2021 · Verify and document ultimate beneficial ownership through complex structures</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity Name</label><input value={uboVerifyInput.entityName} onChange={e => setUboVerifyInput(p => ({...p, entityName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Corporate entity to investigate" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">UBO Name</label><input value={uboVerifyInput.uboName} onChange={e => setUboVerifyInput(p => ({...p, uboName: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Claimed ultimate beneficial owner" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={uboVerifyInput.jurisdictions} onChange={e => setUboVerifyInput(p => ({...p, jurisdictions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Countries in the structure" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Layer Count</label><input value={uboVerifyInput.layerCount} onChange={e => setUboVerifyInput(p => ({...p, layerCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Number of ownership layers" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Ownership Structure</label><textarea value={uboVerifyInput.ownershipStructure} onChange={e => setUboVerifyInput(p => ({...p, ownershipStructure: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe the ownership chain and percentages…" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={uboVerifyInput.context} onChange={e => setUboVerifyInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runUboVerify()} disabled={uboVerifyLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{uboVerifyLoading ? "◌ Verifying…" : "Verify Beneficial Owner"}</button>
                {uboVerifyResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(uboVerifyResult["verificationStatus"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(uboVerifyResult["verificationStatus"]) === "failed" ? "bg-red-dim text-red" : String(uboVerifyResult["verificationStatus"]) === "partial" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(uboVerifyResult["verificationStatus"])}</span>}
                      {Boolean(uboVerifyResult["complexityRating"]) && <span className={`font-mono text-11 px-2 py-0.5 rounded bg-bg-2 text-ink-2`}>Complexity: {String(uboVerifyResult["complexityRating"])}</span>}
                    </div>
                    {Boolean(uboVerifyResult["gaps"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Verification Gaps</div><ul className="space-y-1">{(uboVerifyResult["gaps"] as string[]).map((g,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{g}</li>)}</ul></div>}
                    {Boolean(uboVerifyResult["additionalDocuments"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Additional Documents Required</div><ul className="space-y-1">{(uboVerifyResult["additionalDocuments"] as string[]).map((d,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{d}</li>)}</ul></div>}
                    {Boolean(uboVerifyResult["conclusion"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Conclusion</div><p className="text-12 text-ink-1 leading-relaxed">{String(uboVerifyResult["conclusion"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* AML KPI Dashboard */}
            {superToolsTab === "aml-kpi-dashboard" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">AML KPI Dashboard Generator</div>
                  <div className="text-11 text-ink-2 mt-0.5">UAE FDL 10/2025 · FATF R.33 · Generate a comprehensive AML programme KPI assessment for board and regulator reporting</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Institution Type</label><input value={amlKpiInput.institutionType} onChange={e => setAmlKpiInput(p => ({...p, institutionType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Bank, DNFBP, VASP, insurer…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">STR Count (Annual)</label><input value={amlKpiInput.strCount} onChange={e => setAmlKpiInput(p => ({...p, strCount: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Annual STR filings" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">False Positive Rate (%)</label><input value={amlKpiInput.falsePositiveRate} onChange={e => setAmlKpiInput(p => ({...p, falsePositiveRate: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 85%" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Training Completion (%)</label><input value={amlKpiInput.trainingCompletion} onChange={e => setAmlKpiInput(p => ({...p, trainingCompletion: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 78%" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Open Findings</label><input value={amlKpiInput.openFindings} onChange={e => setAmlKpiInput(p => ({...p, openFindings: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Outstanding audit or exam findings" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Context</label><textarea value={amlKpiInput.context} onChange={e => setAmlKpiInput(p => ({...p, context: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" /></div>
                </div>
                <button type="button" onClick={() => void runAmlKpi()} disabled={amlKpiLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{amlKpiLoading ? "◌ Generating…" : "Generate AML KPI Report"}</button>
                {amlKpiResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      {Boolean(amlKpiResult["overallScore"]) && <div className="text-center"><div className="text-32 font-bold text-brand">{String(amlKpiResult["overallScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Overall AML Score</div></div>}
                      {Boolean(amlKpiResult["programmeHealth"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(amlKpiResult["programmeHealth"]) === "poor" ? "bg-red-dim text-red" : String(amlKpiResult["programmeHealth"]) === "adequate" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(amlKpiResult["programmeHealth"])} Health</span>}
                    </div>
                    {Boolean(amlKpiResult["kpis"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Key Performance Indicators</div><ul className="space-y-1">{(amlKpiResult["kpis"] as string[]).map((kpi,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">▸</span>{kpi}</li>)}</ul></div>}
                    {Boolean(amlKpiResult["redAreas"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Areas Requiring Attention</div><ul className="space-y-1">{(amlKpiResult["redAreas"] as string[]).map((area,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{area}</li>)}</ul></div>}
                    {Boolean(amlKpiResult["recommendations"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Recommendations</div><ul className="space-y-1">{(amlKpiResult["recommendations"] as string[]).map((rec,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{rec}</li>)}</ul></div>}
                    {Boolean(amlKpiResult["boardSummary"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Board Summary</div><p className="text-12 text-ink-1 leading-relaxed">{String(amlKpiResult["boardSummary"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* ── Wave 6 Panels ─────────────────────────────────────────────── */}

            {/* W6: Virtual Asset Risk */}
            {superToolsTab === "w6-virtual-asset-risk" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Virtual Asset Risk Assessor</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.15/R.16 · UAE VARA · Travel Rule · VASP CDD — Assess Virtual Asset Service Provider AML/CFT risk</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">VASP Name</label><input value={w6VaspInput.vasp} onChange={e => setW6VaspInput(p => ({...p, vasp: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Name of the VASP" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={w6VaspInput.jurisdiction} onChange={e => setW6VaspInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Registration jurisdiction" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Monthly Volume (USD)</label><input value={w6VaspInput.volumes} onChange={e => setW6VaspInput(p => ({...p, volumes: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. 50,000,000" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Products/Services</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {["Exchange","Wallet","DeFi","NFT"].map(prod => (
                        <label key={prod} className="flex items-center gap-1 text-11 text-ink-1 cursor-pointer">
                          <input type="checkbox" checked={w6VaspInput.products.includes(prod)} onChange={e => setW6VaspInput(p => ({...p, products: e.target.checked ? [...p.products, prod] : p.products.filter(x => x !== prod)}))} className="accent-brand" />
                          {prod}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void runW6Vasp()} disabled={w6VaspLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6VaspLoading ? "◌ Assessing…" : "Assess VASP Risk"}</button>
                {w6VaspResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6VaspResult["riskTier"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6VaspResult["riskTier"]) === "critical" ? "bg-red-dim text-red" : String(w6VaspResult["riskTier"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>{String(w6VaspResult["riskTier"])} Risk</span>}
                    {Boolean(w6VaspResult["fatfCompliance"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">FATF R.15/16 Compliance</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6VaspResult["fatfCompliance"])}</p></div>}
                    {Boolean(w6VaspResult["travelRuleStatus"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Travel Rule Status</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6VaspResult["travelRuleStatus"])}</p></div>}
                    {Boolean(w6VaspResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(w6VaspResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{f}</li>)}</ul></div>}
                    {Boolean(w6VaspResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6VaspResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Proliferation Finance */}
            {superToolsTab === "w6-prolif-finance" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Proliferation Finance Risk Screener</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.7 · UN WMD Sanctions · UAE FDL 10/2025 Art.21(3) · Dual-use goods · DPRK/Iran/Syria nexus detection</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity Name</label><input value={w6ProlifInput.entity} onChange={e => setW6ProlifInput(p => ({...p, entity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Entity or individual to assess" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={w6ProlifInput.jurisdiction} onChange={e => setW6ProlifInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Country or jurisdiction" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Sectors / Goods</label><input value={w6ProlifInput.sectors} onChange={e => setW6ProlifInput(p => ({...p, sectors: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. machine tools, electronics, chemicals" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Patterns / Context</label><textarea value={w6ProlifInput.transactionPatterns} onChange={e => setW6ProlifInput(p => ({...p, transactionPatterns: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe transaction patterns, counterparties, routing…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Prolif()} disabled={w6ProlifLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6ProlifLoading ? "◌ Screening…" : "Screen for PF Risk"}</button>
                {w6ProlifResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6ProlifResult["pfRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6ProlifResult["pfRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6ProlifResult["pfRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>PF Risk: {String(w6ProlifResult["pfRisk"])}</span>}
                    {Boolean(w6ProlifResult["wmdNexus"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ml-2 ${String(w6ProlifResult["wmdNexus"]) === "confirmed" ? "bg-red-dim text-red" : String(w6ProlifResult["wmdNexus"]) === "possible" ? "bg-amber-dim text-amber" : "bg-bg-2 text-ink-2"}`}>WMD Nexus: {String(w6ProlifResult["wmdNexus"])}</span>}
                    {Boolean(w6ProlifResult["primaryConcern"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Primary Concern</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6ProlifResult["primaryConcern"])}</p></div>}
                    {Boolean(w6ProlifResult["requiredActions"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Required Actions</div><ul className="space-y-1">{(w6ProlifResult["requiredActions"] as string[]).map((a,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">{i+1}.</span>{a}</li>)}</ul></div>}
                    {Boolean(w6ProlifResult["actionRationale"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Rationale</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6ProlifResult["actionRationale"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Environmental Crime */}
            {superToolsTab === "w6-environmental-crime" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Environmental Crime ML Risk</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.3 · FATF Environmental Crime Guidance (2021) · CITES · Illegal wildlife, logging, mining, carbon fraud</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity</label><input value={w6EnvInput.entity} onChange={e => setW6EnvInput(p => ({...p, entity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Entity or individual" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={w6EnvInput.jurisdiction} onChange={e => setW6EnvInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Operating jurisdiction" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Commodities</label><input value={w6EnvInput.commodities} onChange={e => setW6EnvInput(p => ({...p, commodities: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. timber, ivory, carbon credits, gold" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Trade Routes</label><input value={w6EnvInput.tradeRoutes} onChange={e => setW6EnvInput(p => ({...p, tradeRoutes: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Origin, transit, destination countries" /></div>
                </div>
                <button type="button" onClick={() => void runW6Env()} disabled={w6EnvLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6EnvLoading ? "◌ Assessing…" : "Assess Environmental Crime Risk"}</button>
                {w6EnvResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6EnvResult["environmentalRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6EnvResult["environmentalRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6EnvResult["environmentalRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Risk: {String(w6EnvResult["environmentalRisk"])}</span>}
                    {Boolean(w6EnvResult["crimeTypes"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Crime Typologies</div><ul className="space-y-1">{(w6EnvResult["crimeTypes"] as string[]).map((c,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">▸</span>{c}</li>)}</ul></div>}
                    {Boolean(w6EnvResult["fatfRef"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Regulatory References</div><p className="text-12 text-ink-2 leading-relaxed font-mono">{String(w6EnvResult["fatfRef"])}</p></div>}
                    {Boolean(w6EnvResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6EnvResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Crypto Tracing */}
            {superToolsTab === "w6-crypto-tracing" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Crypto Blockchain Tracing</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.15/16 · Mixer/tumbler detection · Darknet market links · Ransomware wallet proximity · Exchange risk</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Wallet Address</label><input value={w6CryptoInput.walletAddress} onChange={e => setW6CryptoInput(p => ({...p, walletAddress: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand font-mono" placeholder="0x… or bc1… or T…" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Blockchain</label>
                    <select value={w6CryptoInput.blockchain} onChange={e => setW6CryptoInput(p => ({...p, blockchain: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand">
                      {["BTC","ETH","TRX","XMR","BNB","SOL","LTC"].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction History / Counterparties</label><textarea value={w6CryptoInput.transactionHistory} onChange={e => setW6CryptoInput(p => ({...p, transactionHistory: e.target.value}))} rows={4} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none font-mono" placeholder="Paste transaction hashes, counterparty addresses, or describe patterns…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Crypto()} disabled={w6CryptoLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6CryptoLoading ? "◌ Tracing…" : "Trace & Assess Risk"}</button>
                {w6CryptoResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6CryptoResult["riskScore"]) && <div className="flex items-center gap-3"><div className="text-32 font-bold text-brand">{String(w6CryptoResult["riskScore"])}</div><div className="text-10 font-mono text-ink-3 uppercase">Risk Score / 100</div></div>}
                    {Boolean(w6CryptoResult["mixerExposure"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Mixer/Tumbler Exposure</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CryptoResult["mixerExposure"])}</p></div>}
                    {Boolean(w6CryptoResult["darknetLinks"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Darknet Market Links</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CryptoResult["darknetLinks"])}</p></div>}
                    {Boolean(w6CryptoResult["ransomwareLinks"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Ransomware Links</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CryptoResult["ransomwareLinks"])}</p></div>}
                    {Boolean(w6CryptoResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CryptoResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Human Trafficking */}
            {superToolsTab === "w6-human-trafficking" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Human Trafficking ML Indicators</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF Guidance on ML from Human Trafficking (2018) · FATF R.3 · Cash-intensive · Escort/hospitality · Cross-border corridors</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity / Subject</label><input value={w6HtInput.entity} onChange={e => setW6HtInput(p => ({...p, entity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Entity or individual name" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Indicators Present</label>
                    <div className="flex flex-col gap-1.5 mt-1">
                      {["Cash-intensive business","Escort / hospitality sector","Cross-border transfers to high-risk corridors","Multiple accounts / third-party control"].map(ind => (
                        <label key={ind} className="flex items-center gap-2 text-11 text-ink-1 cursor-pointer">
                          <input type="checkbox" checked={w6HtInput.indicators.includes(ind)} onChange={e => setW6HtInput(p => ({...p, indicators: e.target.checked ? [...p.indicators, ind] : p.indicators.filter(x => x !== ind)}))} className="accent-brand" />
                          {ind}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Patterns</label><textarea value={w6HtInput.transactionPatterns} onChange={e => setW6HtInput(p => ({...p, transactionPatterns: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe cash flow patterns, volumes, counterparties…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Ht()} disabled={w6HtLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6HtLoading ? "◌ Assessing…" : "Assess HT Risk"}</button>
                {w6HtResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6HtResult["htRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6HtResult["htRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6HtResult["htRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>HT Risk: {String(w6HtResult["htRisk"])}</span>}
                    {Boolean(w6HtResult["indicators"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Indicators Identified</div><ul className="space-y-1">{(w6HtResult["indicators"] as string[]).map((ind,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">⚠</span>{ind}</li>)}</ul></div>}
                    {Boolean(w6HtResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(w6HtResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{f}</li>)}</ul></div>}
                    {Boolean(w6HtResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6HtResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Tax Evasion */}
            {superToolsTab === "w6-tax-evasion" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Tax Evasion ML Risk Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.3 (tax crimes as predicate) · OECD BEPS · CRS/AEOI · Round-tripping · Treaty shopping · Transfer pricing</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity</label><input value={w6TaxInput.entity} onChange={e => setW6TaxInput(p => ({...p, entity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Entity or individual" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction(s)</label><input value={w6TaxInput.jurisdiction} onChange={e => setW6TaxInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Home and offshore jurisdictions" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Structure Type</label>
                    <select value={w6TaxInput.structureType} onChange={e => setW6TaxInput(p => ({...p, structureType: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand">
                      <option value="">Select structure…</option>
                      <option value="Holding company">Holding company</option>
                      <option value="Trust arrangement">Trust arrangement</option>
                      <option value="Foundation">Foundation</option>
                      <option value="Shell company">Shell company</option>
                      <option value="Partnership">Partnership</option>
                      <option value="Individual">Individual</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Transaction Description</label><textarea value={w6TaxInput.transactions} onChange={e => setW6TaxInput(p => ({...p, transactions: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe intercompany flows, offshore transfers, loan-backs…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Tax()} disabled={w6TaxLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6TaxLoading ? "◌ Analysing…" : "Analyse Tax Evasion Risk"}</button>
                {w6TaxResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6TaxResult["taxEvasionRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6TaxResult["taxEvasionRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6TaxResult["taxEvasionRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Risk: {String(w6TaxResult["taxEvasionRisk"])}</span>}
                    {Boolean(w6TaxResult["typologies"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Tax Evasion Typologies</div><ul className="space-y-1">{(w6TaxResult["typologies"] as string[]).map((t,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className="text-brand shrink-0">▸</span>{t}</li>)}</ul></div>}
                    {Boolean(w6TaxResult["jurisdictionRisk"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction Risk</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6TaxResult["jurisdictionRisk"])}</p></div>}
                    {Boolean(w6TaxResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6TaxResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Corruption Risk */}
            {superToolsTab === "w6-corruption-risk" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Corruption & Bribery Risk Assessor</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.12 (PEPs) · FATF R.3 (corruption as predicate) · UNCAC · FCPA · UK Bribery Act 2010 · Public procurement red flags</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Entity</label><input value={w6CorrInput.entity} onChange={e => setW6CorrInput(p => ({...p, entity: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Entity or individual" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={w6CorrInput.jurisdiction} onChange={e => setW6CorrInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Operating jurisdiction" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Sector</label><input value={w6CorrInput.sector} onChange={e => setW6CorrInput(p => ({...p, sector: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. government contracting, defence, energy" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">PEP Status</label>
                    <select value={w6CorrInput.pepStatus} onChange={e => setW6CorrInput(p => ({...p, pepStatus: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand">
                      <option value="No">Not a PEP</option>
                      <option value="Direct PEP">Direct PEP</option>
                      <option value="PEP family member">PEP family member</option>
                      <option value="PEP associate">PEP close associate</option>
                      <option value="Former PEP">Former PEP (&lt;12 months)</option>
                    </select>
                  </div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Contract Types / Procurement Activity</label><textarea value={w6CorrInput.contractTypes} onChange={e => setW6CorrInput(p => ({...p, contractTypes: e.target.value}))} rows={2} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="e.g. government infrastructure, defence procurement, licences…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Corr()} disabled={w6CorrLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6CorrLoading ? "◌ Assessing…" : "Assess Corruption Risk"}</button>
                {w6CorrResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6CorrResult["corruptionRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6CorrResult["corruptionRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6CorrResult["corruptionRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Risk: {String(w6CorrResult["corruptionRisk"])}</span>}
                    {Boolean(w6CorrResult["pepExposure"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">PEP Exposure</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CorrResult["pepExposure"])}</p></div>}
                    {Boolean(w6CorrResult["redFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Red Flags</div><ul className="space-y-1">{(w6CorrResult["redFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-red flex gap-2"><span className="shrink-0">✗</span>{f}</li>)}</ul></div>}
                    {Boolean(w6CorrResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6CorrResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Real Estate ML */}
            {superToolsTab === "w6-real-estate-ml" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Real Estate ML Risk (Wave 6)</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.22 · UAE DNFBP obligations · All-cash transactions · Anonymous buyers · Price manipulation · Dubai DLD risk</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Property Address / Details</label><input value={w6ReInput.property} onChange={e => setW6ReInput(p => ({...p, property: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Property description or address" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label><input value={w6ReInput.jurisdiction} onChange={e => setW6ReInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. Dubai, London, Cyprus" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Buyer</label><input value={w6ReInput.buyer} onChange={e => setW6ReInput(p => ({...p, buyer: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Buyer name or entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Seller</label><input value={w6ReInput.seller} onChange={e => setW6ReInput(p => ({...p, seller: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Seller name or entity" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Purchase Price (USD)</label><input value={w6ReInput.price} onChange={e => setW6ReInput(p => ({...p, price: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Transaction value" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Payment Method</label>
                    <select value={w6ReInput.paymentMethod} onChange={e => setW6ReInput(p => ({...p, paymentMethod: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand">
                      <option value="">Select…</option>
                      <option value="All cash">All cash</option>
                      <option value="Mortgage">Mortgage / bank finance</option>
                      <option value="Crypto">Cryptocurrency</option>
                      <option value="Third-party funds">Third-party funds</option>
                      <option value="Mixed">Mixed / unclear</option>
                    </select>
                  </div>
                </div>
                <button type="button" onClick={() => void runW6Re()} disabled={w6ReLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6ReLoading ? "◌ Assessing…" : "Assess Real Estate ML Risk"}</button>
                {w6ReResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6ReResult["mlRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6ReResult["mlRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6ReResult["mlRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>ML Risk: {String(w6ReResult["mlRisk"])}</span>}
                    {Boolean(w6ReResult["indicators"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">ML Indicators</div><ul className="space-y-1">{(w6ReResult["indicators"] as Array<{indicator: string; severity: string; detail: string}>).map((ind,i) => <li key={i} className="text-12 text-ink-1 flex gap-2"><span className={`shrink-0 font-mono text-10 uppercase ${ind.severity === "critical" || ind.severity === "high" ? "text-red" : "text-amber"}`}>[{ind.severity}]</span>{ind.indicator} — {ind.detail}</li>)}</ul></div>}
                    {Boolean(w6ReResult["recommendedAction"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommended Action</div><p className="text-12 text-ink-1 font-semibold">{String(w6ReResult["recommendedAction"]).replace(/_/g, " ")}</p></div>}
                    {Boolean(w6ReResult["actionRationale"]) && <p className="text-12 text-ink-1 leading-relaxed">{String(w6ReResult["actionRationale"])}</p>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Trade Finance Risk */}
            {superToolsTab === "w6-trade-finance" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Trade Finance ML Risk Analyser</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF TBML Guidance (2021) · FATF R.3/R.7/R.8 · Invoice fraud · Over/under-invoicing · Phantom shipments · Dual-use goods</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Trade Flow Description</label><textarea value={w6TfInput.tradeFlow} onChange={e => setW6TfInput(p => ({...p, tradeFlow: e.target.value}))} rows={3} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe the trade transaction structure, routing, financing type (LC, documentary collection, open account)…" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Goods / Commodities</label><input value={w6TfInput.goods} onChange={e => setW6TfInput(p => ({...p, goods: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. electronics, machinery, chemicals, textiles" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Parties</label><input value={w6TfInput.parties} onChange={e => setW6TfInput(p => ({...p, parties: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Buyer, seller, intermediaries, banks" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdictions</label><input value={w6TfInput.jurisdiction} onChange={e => setW6TfInput(p => ({...p, jurisdiction: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Origin, transit, destination" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Documents Available</label><input value={w6TfInput.documents} onChange={e => setW6TfInput(p => ({...p, documents: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. LC, invoice, bill of lading, certificate of origin" /></div>
                </div>
                <button type="button" onClick={() => void runW6Tf()} disabled={w6TfLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6TfLoading ? "◌ Analysing…" : "Analyse Trade Finance Risk"}</button>
                {w6TfResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {Boolean(w6TfResult["tbmlRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6TfResult["tbmlRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6TfResult["tbmlRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>TBML Risk: {String(w6TfResult["tbmlRisk"])}</span>}
                      {Boolean(w6TfResult["invoiceAnomalyScore"]) && <span className="font-mono text-11 px-2 py-0.5 rounded bg-bg-2 text-ink-2">Invoice Anomaly Score: {String(w6TfResult["invoiceAnomalyScore"])}/100</span>}
                    </div>
                    {Boolean(w6TfResult["sanctionedParties"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Sanctioned Parties Analysis</div><p className="text-12 text-red leading-relaxed">{String(w6TfResult["sanctionedParties"])}</p></div>}
                    {Boolean(w6TfResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6TfResult["recommendation"])}</p></div>}
                  </div>
                )}
              </div>
            )}

            {/* W6: Insider Threat */}
            {superToolsTab === "w6-insider-threat" && (
              <div className="space-y-4">
                <div>
                  <div className="text-13 font-semibold text-ink-0">Insider Threat ML Risk</div>
                  <div className="text-11 text-ink-2 mt-0.5">FATF R.18 · UAE FDL 10/2025 Art.20 · CBUAE AML Standards §7 · Unusual access · Unexplained wealth · Bribery indicators</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Employee Name / ID</label><input value={w6InsiderInput.employee} onChange={e => setW6InsiderInput(p => ({...p, employee: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="Employee reference (anonymise if needed)" /></div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Role / Department</label><input value={w6InsiderInput.role} onChange={e => setW6InsiderInput(p => ({...p, role: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. Compliance Officer, Relationship Manager" /></div>
                  <div>
                    <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">System Access Level</label>
                    <select value={w6InsiderInput.access} onChange={e => setW6InsiderInput(p => ({...p, access: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand">
                      <option value="">Select access level…</option>
                      <option value="Standard">Standard user</option>
                      <option value="Elevated">Elevated / privileged</option>
                      <option value="Administrator">System administrator</option>
                      <option value="MLRO-level">MLRO-level (SAR/STR access)</option>
                    </select>
                  </div>
                  <div><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Personal Transaction Anomalies</label><input value={w6InsiderInput.transactions} onChange={e => setW6InsiderInput(p => ({...p, transactions: e.target.value}))} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" placeholder="e.g. large cash deposits, offshore wires, lifestyle changes" /></div>
                  <div className="col-span-2"><label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Observed Behaviours</label><textarea value={w6InsiderInput.behaviours} onChange={e => setW6InsiderInput(p => ({...p, behaviours: e.target.value}))} rows={4} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" placeholder="Describe concerning behaviours: unusual after-hours access, accessing unrelated client records, resistance to audit, relationship with external parties…" /></div>
                </div>
                <button type="button" onClick={() => void runW6Insider()} disabled={w6InsiderLoading} className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 disabled:opacity-60">{w6InsiderLoading ? "◌ Assessing…" : "Assess Insider Threat Risk"}</button>
                {w6InsiderResult && (
                  <div className="mt-3 space-y-3 bg-bg-1 rounded-lg p-4">
                    {Boolean(w6InsiderResult["insiderRisk"]) && <span className={`font-mono text-11 font-semibold uppercase px-2 py-0.5 rounded ${String(w6InsiderResult["insiderRisk"]) === "critical" ? "bg-red-dim text-red" : String(w6InsiderResult["insiderRisk"]) === "high" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"}`}>Risk: {String(w6InsiderResult["insiderRisk"])}</span>}
                    {Boolean(w6InsiderResult["behaviourFlags"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1.5">Behaviour Flags</div><ul className="space-y-1">{(w6InsiderResult["behaviourFlags"] as string[]).map((f,i) => <li key={i} className="text-12 text-amber flex gap-2"><span className="shrink-0">⚠</span>{f}</li>)}</ul></div>}
                    {Boolean(w6InsiderResult["recommendation"]) && <div><div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Recommendation</div><p className="text-12 text-ink-1 leading-relaxed">{String(w6InsiderResult["recommendation"])}</p></div>}
                  </div>
                )}
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
