// Hawkeye Sterling — cognitive brain type system.
// The brain is a registry of faculties, reasoning modes, question templates, scenarios,
// and adverse-media taxonomy. Every screening run produces a Verdict whose full reasoning
// chain is persisted — that is the core differentiator vs World-Check.

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
  | 'ratiocination';

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
  | 'esg';

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

export interface Finding {
  modeId: string;
  category: ReasoningCategory;
  faculties: FacultyId[];
  score: number;        // 0..1 severity contribution
  confidence: number;   // 0..1 model confidence in this finding
  verdict: Verdict;
  rationale: string;
  evidence: string[];   // textual evidence pointers
  producedAt: number;
}

export interface ReasoningMode {
  id: string;
  name: string;
  category: ReasoningCategory;
  faculties: FacultyId[];
  wave: 1 | 2 | 3;
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
  | 'legal_criminal_regulatory';

export interface AdverseMediaCategory {
  id: AdverseMediaCategoryId;
  displayName: string;
  keywords: string[];
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
}

export interface ReasoningChainNode {
  step: number;
  modeId: string;
  faculty: FacultyId;
  summary: string;
  producedAt: number;
}
