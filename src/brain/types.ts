// Hawkeye Sterling — cognitive brain type system.
// The brain is a registry of faculties, reasoning modes, question templates, scenarios,
// and adverse-media taxonomy. Every screening run produces a Verdict whose full reasoning
// chain is persisted — that is the core differentiator vs World-Check.

export type { BayesTrace, LikelihoodRatio } from './bayesian-update.js';
import type { BayesTrace, LikelihoodRatio } from './bayesian-update.js';

export type FacultyId =
  | 'reasoning'
  | 'data_analysis'
  | 'deep_thinking'
  | 'intelligence'
  | 'smartness'
  | 'strong_brain'
  | 'inference'
  | 'argumentation'
  | 'introspection'
  | 'ratiocination'
  | 'synthesis'
  | 'anticipation'
  | 'quantum_intelligence'
  | 'forensic_accounting'
  | 'geopolitical_awareness';

export type ReasoningCategory =
  | 'logic'
  | 'cognitive_science'
  | 'decision_theory'
  | 'forensic'
  | 'compliance_framework'
  | 'legal_reasoning'
  | 'strategic'
  | 'causal'
  | 'statistical'
  | 'graph_analysis'
  | 'threat_modeling'
  | 'behavioral_signals'
  | 'data_quality'
  | 'governance'
  | 'crypto_defi'
  | 'sectoral_typology'
  | 'osint'
  | 'esg'
  | 'predicate_crime'
  | 'proliferation'
  | 'correspondent_banking'
  | 'hawala_ivt'
  | 'ftz_risk'
  | 'professional_ml'
  | 'regulatory_aml'
  | 'technology_risk'
  | 'climate_risk'
  | 'forensic_accounting'
  | 'geopolitical_risk'
  | 'market_integrity'
  | 'conduct_risk'
  | 'systemic_risk'
  | 'identity_fraud'
  | 'digital_economy'
  | 'human_rights'
  | 'asset_recovery'
  | 'intelligence_fusion'
  | 'quantum_computing'
  | 'behavioral_economics';

export type Verdict =
  | 'clear'
  | 'flag'
  | 'escalate'
  | 'inconclusive'
  | 'block';

export interface Subject {
  name: string;
  aliases?: string[];
  type: 'individual' | 'entity' | 'vessel' | 'wallet' | 'aircraft';
  jurisdiction?: string;
  nationality?: string;       // ISO 3166-1 alpha-2 citizenship/domicile (distinct from jurisdiction)
  dateOfBirth?: string;
  dateOfIncorporation?: string;
  identifiers?: Record<string, string>; // passport, trade licence, LEI, wallet addr, IMO, etc.
}

export interface Evidence {
  sanctionsHits?: unknown[];
  pepHits?: unknown[];
  adverseMedia?: unknown[];
  uboChain?: unknown[];
  transactions?: unknown[];
  documents?: unknown[];
  freeText?: string;
  [k: string]: unknown;
}

export interface BrainContext {
  run: { id: string; startedAt: number };
  subject: Subject;
  evidence: Evidence;
  priorFindings: Finding[];
  domains: string[]; // e.g. ['cdd','sanctions','ubo','dpms']
}

// Hypotheses the brain can update probabilistically. A finding states which hypothesis
// its score/LR is evidence for or against. Fusion tracks posteriors per hypothesis.
export type Hypothesis =
  | 'illicit_risk'          // default: generic illicit/suspicious risk against subject
  | 'sanctioned'            // subject is a sanctions match
  | 'pep'                   // subject is a PEP or close associate
  | 'material_concern'      // material compliance concern beyond specific typology
  | 'adverse_media_linked'  // credibly linked to adverse media
  | 'ubo_opaque';           // UBO chain is opaque or obstructive

export interface Finding {
  modeId: string;
  category: ReasoningCategory;
  faculties: FacultyId[];
  score: number;        // 0..1 severity contribution against the hypothesis
  confidence: number;   // 0..1 model confidence in this finding
  verdict: Verdict;
  rationale: string;
  evidence: string[];   // evidence IDs (resolvable against an EvidenceItem registry when present)
  producedAt: number;

  // --- optional, additive — enables Bayesian fusion, weighted aggregation, introspection ---
  likelihoodRatios?: LikelihoodRatio[]; // when present, fusion updates a posterior per hypothesis
  hypothesis?: Hypothesis;              // the hypothesis the finding is evidence for/against
  weight?: number;                      // override for aggregation weight (defaults to confidence)
  tags?: string[];                      // free-form labels (e.g. 'meta', 'introspection', 'logic')
}

export interface ReasoningMode {
  id: string;
  name: string;
  category: ReasoningCategory;
  faculties: FacultyId[];
  wave: 1 | 2 | 3 | 4;
  description: string;
  apply: (ctx: BrainContext) => Promise<Finding>;
}

export interface Faculty {
  id: FacultyId;
  displayName: string;
  describes: string;
  synonyms: string[];
  modes: string[]; // reasoning-mode ids
}

export interface QuestionTemplate {
  id: string;
  domain: string; // cdd, edd, sanctions, ubo, dpms, vasp, tbml, pep, tf, re, ins, fo, lux, pay, fund, market, fraud, ops, mlro, audit, incident, pf, cash, corresp
  title: string;
  questions: string[];
  reasoningModes: string[];
}

export interface Scenario {
  id: string;
  name: string;
  domain: string;
  narrative: string;
  templateId?: string;
  expectedFlags: string[];
}

export type AdverseMediaCategoryId =
  | 'ml_financial_crime'
  | 'terrorist_financing'
  | 'proliferation_financing'
  | 'corruption_organised_crime'
  | 'legal_criminal_regulatory'
  | 'esg'
  | 'cybercrime'
  | 'ai'
  | 'sanctions_violations'
  | 'human_trafficking_modern_slavery'
  | 'tax_crimes'
  | 'environmental_crime'
  | 'drug_trafficking';

export interface AdverseMediaCategory {
  id: AdverseMediaCategoryId;
  displayName: string;
  keywords: string[];
}

export type ConsensusLevel = 'strong' | 'weak' | 'conflicted' | 'sparse';

// Per-faculty activation. The ten faculties declared in faculties.ts must become
// first-class in every verdict — it is how the brain proves it deployed the full
// cognitive catalogue (Reasoning, Data Analysis, Deep Thinking, Intelligence,
// Smartness, Strong Brain, Inference, Argumentation, Introspection, Ratiocination).
export interface FacultyActivation {
  facultyId: FacultyId;
  modesFired: number;           // number of modes that listed this faculty and produced a finding
  weightedScore: number;        // 0..1 confidence-weighted mean severity contributed via this faculty
  weightedConfidence: number;   // 0..1 mean confidence across modes that touched this faculty
  posterior?: number;           // per-faculty posterior for the primary hypothesis (if LRs emitted)
  status: 'silent' | 'weak' | 'engaged' | 'dominant';
}

export interface CognitiveFirepower {
  activations: FacultyActivation[];      // one entry per known faculty (silent entries included)
  modesFired: number;
  facultiesEngaged: number;              // count with status != 'silent'
  categoriesSpanned: number;
  independentEvidenceCount: number;      // distinct evidence IDs cited across findings
  firepowerScore: number;                // 0..1 composite: faculties × mode density × evidence independence
}

export interface FindingConflict {
  a: string;             // modeId A
  b: string;             // modeId B
  aVerdict: Verdict;
  bVerdict: Verdict;
  aScore: number;
  bScore: number;
  delta: number;         // |aScore - bScore|
  hypothesis?: Hypothesis;
  note: string;
}

export interface FusionResult {
  outcome: Verdict;
  score: number;                       // final severity 0..1
  confidence: number;                  // final confidence 0..1 (introspection-adjusted)
  weightedScore: number;               // confidence×credibility-weighted mean of finding.score
  prior: number;                       // prior P(H) used for the primary hypothesis
  posterior: number;                   // posterior P(H|E) for the primary hypothesis
  primaryHypothesis: Hypothesis;
  bayesTrace?: BayesTrace;             // undefined if no LRs were emitted
  posteriorsByHypothesis: Partial<Record<Hypothesis, number>>;
  conflicts: FindingConflict[];
  consensus: ConsensusLevel;
  contributorCount: number;
  methodology: string;                 // plain-text description per charter P9
  firepower: CognitiveFirepower;       // per-faculty activation + composite firepower score
}

export interface IntrospectionReport {
  chainQuality: number;                // 0..1 overall quality of the chain
  biasesDetected: string[];            // bias IDs encountered
  calibrationGap: number;              // 0..1; 0 = well calibrated
  coverageGaps: string[];              // faculty/category blind spots
  confidenceAdjustment: number;        // delta applied to aggregateConfidence in [-0.2, 0.2]
  notes: string[];
  producedAt: number;
}

export interface BrainVerdict {
  runId: string;
  subject: Subject;
  outcome: Verdict;
  aggregateScore: number;
  aggregateConfidence: number;
  findings: Finding[];
  chain: ReasoningChainNode[];
  recommendedActions: string[];
  generatedAt: number;
  // --- new, additive ---
  prior?: number;
  posterior?: number;                  // posterior for primary hypothesis
  primaryHypothesis?: Hypothesis;
  bayesTrace?: BayesTrace;
  posteriorsByHypothesis?: Partial<Record<Hypothesis, number>>;
  conflicts?: FindingConflict[];
  consensus?: ConsensusLevel;
  introspection?: IntrospectionReport;
  methodology?: string;
  firepower?: CognitiveFirepower;
}

export interface ReasoningChainNode {
  step: number;
  modeId: string;
  faculty: FacultyId;
  summary: string;
  producedAt: number;
}
