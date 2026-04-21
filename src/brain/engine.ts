// Hawkeye Sterling — cognitive engine orchestrator.
// run(subject, evidence, domains) → BrainVerdict with full reasoning chain.
// Phase 1 stubs return inconclusive; the chain-of-reasoning shape is already real.

import { FACULTY_BY_ID } from './faculties.js';
import { REASONING_MODE_BY_ID, REASONING_MODES } from './reasoning-modes.js';
import { QUESTION_TEMPLATES } from './question-templates.js';
import type {
  BrainContext, BrainVerdict, Evidence, FacultyId,
  Finding, ReasoningChainNode, Subject, Verdict,
} from './types.js';

export interface RunOptions {
  subject: Subject;
  evidence?: Evidence;
  domains?: string[];
  maxModes?: number;
}

export async function run(options: RunOptions): Promise<BrainVerdict> {
  const { subject, evidence = {}, domains, maxModes } = options;
  const runId = cryptoRandomId();
  const startedAt = Date.now();

  const selectedDomains = domains && domains.length > 0
    ? domains
    : inferDomainsFromSubject(subject, evidence);

  const modeIds = selectReasoningModeIdsForDomains(selectedDomains, maxModes);

  const ctx: BrainContext = {
    run: { id: runId, startedAt },
    subject,
    evidence,
    priorFindings: [],
    domains: selectedDomains,
  };

  const findings: Finding[] = [];
  const chain: ReasoningChainNode[] = [];
  let step = 0;

  for (const modeId of modeIds) {
    const mode = REASONING_MODE_BY_ID.get(modeId);
    if (!mode) continue;
    const finding = await mode.apply(ctx);
    findings.push(finding);
    ctx.priorFindings.push(finding);
    for (const faculty of mode.faculties) {
      chain.push({
        step: ++step,
        modeId: mode.id,
        faculty,
        summary: `${mode.name} · ${finding.verdict} · ${finding.rationale}`,
        producedAt: finding.producedAt,
      });
    }
  }

  const aggregate = aggregateFindings(findings);

  return {
    runId,
    subject,
    outcome: aggregate.outcome,
    aggregateScore: aggregate.score,
    aggregateConfidence: aggregate.confidence,
    findings,
    chain,
    recommendedActions: recommend(aggregate.outcome),
    generatedAt: Date.now(),
  };
}

function inferDomainsFromSubject(subject: Subject, evidence: Evidence): string[] {
  const d = new Set<string>(['cdd', 'sanctions', 'pep', 'adverse_media']);
  if (subject.type === 'entity') {
    d.add('ubo');
    d.add('edd');
  }
  if (subject.type === 'wallet') {
    d.add('vasp');
  }
  if (subject.type === 'vessel') {
    d.add('tf');
  }
  if (evidence.transactions) d.add('tbml');
  if (evidence.uboChain) d.add('ubo');
  return [...d];
}

function selectReasoningModeIdsForDomains(
  domains: string[],
  maxModes: number | undefined,
): string[] {
  const set = new Set<string>();
  for (const tpl of QUESTION_TEMPLATES) {
    if (domains.includes(tpl.domain) || domains.length === 0) {
      for (const m of tpl.reasoningModes) set.add(m);
    }
  }
  // Always include core introspection and source-triangulation modes.
  for (const m of [
    'cognitive_bias_audit', 'confidence_calibration', 'popper_falsification',
    'source_triangulation', 'triangulation', 'occam_vs_conspiracy',
  ]) set.add(m);

  const ordered = [...set];
  return maxModes ? ordered.slice(0, maxModes) : ordered;
}

function aggregateFindings(findings: Finding[]): {
  outcome: Verdict; score: number; confidence: number;
} {
  if (findings.length === 0) {
    return { outcome: 'inconclusive', score: 0, confidence: 0 };
  }
  const score = avg(findings.map((f) => f.score));
  const confidence = avg(findings.map((f) => f.confidence));
  const verdicts = findings.map((f) => f.verdict);
  const outcome: Verdict = verdicts.includes('block')
    ? 'block'
    : verdicts.includes('escalate')
    ? 'escalate'
    : verdicts.includes('flag')
    ? 'flag'
    : verdicts.every((v) => v === 'inconclusive')
    ? 'inconclusive'
    : 'clear';
  return { outcome, score, confidence };
}

function recommend(outcome: Verdict): string[] {
  switch (outcome) {
    case 'block':
      return ['Immediate account freeze', 'Notify MLRO', 'File STR', 'Preserve evidence'];
    case 'escalate':
      return ['Escalate to senior compliance', 'Open EDD file', 'Extended review cadence'];
    case 'flag':
      return ['Enhanced monitoring', 'Secondary analyst review', 'Document disposition'];
    case 'inconclusive':
      return ['Request supplementary evidence', 'Defer decision pending data', 'Re-run after evidence'];
    case 'clear':
      return ['Proceed per standard cadence', 'Periodic review per risk rating'];
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function cryptoRandomId(): string {
  const a = new Uint8Array(8);
  (globalThis.crypto as Crypto).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Depth metric — prove how thoroughly the brain reasoned.
// Reports faculties touched, modes run, categories spanned, chain length.
export interface CognitiveDepth {
  facultiesTouched: FacultyId[];
  facultyCount: number;
  modesRun: number;
  categoriesSpanned: string[];
  chainLength: number;
  modesPerFaculty: Record<string, number>;
}

export function depthOf(verdict: BrainVerdict): CognitiveDepth {
  const faculties = new Set<FacultyId>();
  const categories = new Set<string>();
  const perFaculty: Record<string, number> = {};
  for (const f of verdict.findings) {
    categories.add(f.category);
    for (const fac of f.faculties) {
      faculties.add(fac);
      perFaculty[fac] = (perFaculty[fac] ?? 0) + 1;
    }
  }
  return {
    facultiesTouched: [...faculties],
    facultyCount: faculties.size,
    modesRun: verdict.findings.length,
    categoriesSpanned: [...categories],
    chainLength: verdict.chain.length,
    modesPerFaculty: perFaculty,
  };
}

export function listFacultyNames(): string[] {
  return [...FACULTY_BY_ID.values()].map((f) => f.displayName);
}

export function totalModeCount(): number {
  return REASONING_MODES.length;
}
