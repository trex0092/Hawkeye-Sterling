// Hawkeye Sterling — cognitive engine orchestrator.
//
// run(subject, evidence, domains) → BrainVerdict with full reasoning chain.
//
// Pipeline:
//   1. Infer domains from subject + evidence (unless caller specifies).
//   2. Select reasoning modes the declared domains demand.
//   3. Force the six always-on meta-cognitive modes to run LAST, so they see
//      the full set of prior findings before auditing the chain.
//   4. Run each mode; collect findings + per-faculty chain nodes.
//   5. Fuse findings: Bayesian posterior + confidence-weighted score + conflict
//      detection + per-faculty activation / cognitive firepower.
//   6. Run an introspection pass over the meta findings, fusion conflicts, and
//      firepower to compute chain quality and an auditable confidence adjustment.
//   7. Apply the adjustment, build the verdict, return it.

import type { EvidenceItem } from './evidence.js';
import { FACULTY_BY_ID } from './faculties.js';
import { fuseFindings } from './fusion.js';
import { introspect } from './introspection.js';
import { REASONING_MODE_BY_ID, REASONING_MODES } from './reasoning-modes.js';
import { QUESTION_TEMPLATES } from './question-templates.js';
import type {
  BrainContext, BrainVerdict, Evidence, FacultyId, Finding, Hypothesis,
  ReasoningChainNode, Subject, Verdict,
} from './types.js';

const META_MODE_IDS: readonly string[] = [
  'cognitive_bias_audit',
  'confidence_calibration',
  'popper_falsification',
  'source_triangulation',
  'triangulation',
  'occam_vs_conspiracy',
];
const META_MODE_SET: ReadonlySet<string> = new Set(META_MODE_IDS);

export interface RunOptions {
  subject: Subject;
  evidence?: Evidence;
  domains?: string[];
  maxModes?: number;
  /** Optional index of EvidenceItems keyed by ID — used by fusion for credibility attenuation. */
  evidenceIndex?: Map<string, EvidenceItem>;
  /** Primary hypothesis for the Bayesian posterior. Defaults to 'illicit_risk'. */
  primaryHypothesis?: Hypothesis;
  /** Override the prior probability of the primary hypothesis. Defaults to 0.1. */
  prior?: number;
}

export async function run(options: RunOptions): Promise<BrainVerdict> {
  const { subject, evidence = {}, domains, maxModes, evidenceIndex, primaryHypothesis, prior } = options;
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

  const fusion = fuseFindings(findings, { evidenceIndex, primaryHypothesis, prior });
  const introspection = introspect(findings, {
    conflicts: fusion.conflicts,
    firepower: fusion.firepower,
  });
  const adjustedConfidence = clamp01(fusion.confidence + introspection.confidenceAdjustment);

  const verdict: BrainVerdict = {
    runId,
    subject,
    outcome: fusion.outcome,
    aggregateScore: fusion.score,
    aggregateConfidence: adjustedConfidence,
    findings,
    chain,
    recommendedActions: recommend(fusion.outcome, fusion.conflicts.length > 0, introspection.coverageGaps),
    generatedAt: Date.now(),
    prior: fusion.prior,
    posterior: fusion.posterior,
    primaryHypothesis: fusion.primaryHypothesis,
    posteriorsByHypothesis: fusion.posteriorsByHypothesis,
    conflicts: fusion.conflicts,
    consensus: fusion.consensus,
    introspection,
    methodology: fusion.methodology,
    firepower: fusion.firepower,
  };
  if (fusion.bayesTrace !== undefined) verdict.bayesTrace = fusion.bayesTrace;
  return verdict;
}

function inferDomainsFromSubject(subject: Subject, evidence: Evidence): string[] {
  const d = new Set<string>(['cdd', 'sanctions', 'pep', 'adverse_media']);
  if (subject.type === 'entity') {
    d.add('ubo');
    d.add('edd');
  }
  if (subject.type === 'wallet') d.add('vasp');
  if (subject.type === 'vessel') d.add('tf');
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
  // Always-on inference: bayes_theorem emits explicit likelihood ratios for
  // any evidence signals present, which lets fusion compute an auditable
  // posterior even when the domain-matched templates don't name it.
  set.add('bayes_theorem');
  // Force the six always-on meta-cognitive modes to run LAST so they see the
  // complete prior-finding set when auditing bias / calibration / falsification /
  // triangulation / Occam.
  for (const metaId of META_MODE_IDS) {
    set.delete(metaId);
    set.add(metaId);
  }

  const ordered = [...set];
  if (!maxModes) return ordered;
  if (ordered.length <= maxModes) return ordered;
  const head = ordered.filter((id) => !META_MODE_SET.has(id));
  const tail = ordered.filter((id) => META_MODE_SET.has(id));
  if (maxModes < tail.length) return tail.slice(0, maxModes);
  const headRoom = Math.max(0, maxModes - tail.length);
  return [...head.slice(0, headRoom), ...tail];
}

function recommend(outcome: Verdict, hasConflicts: boolean, coverageGaps: string[]): string[] {
  const actions: string[] = [];
  switch (outcome) {
    case 'block':
      actions.push('Immediate account freeze', 'Notify MLRO', 'Prepare STR via goAML', 'Preserve evidence (chain-of-custody)');
      break;
    case 'escalate':
      actions.push('Escalate to senior compliance', 'Open EDD file', 'Extended review cadence', 'Two-sign-off disposition');
      break;
    case 'flag':
      actions.push('Enhanced monitoring', 'Secondary analyst review', 'Document disposition with rationale');
      break;
    case 'inconclusive':
      actions.push('Request supplementary evidence per P10', 'Defer disposition', 'Re-run after evidence');
      break;
    case 'clear':
      actions.push('Proceed per standard cadence', 'Periodic review per risk rating');
      break;
  }
  if (hasConflicts) actions.push('Resolve mode-level conflicts before disposition (see verdict.conflicts[])');
  if (coverageGaps.length > 0) actions.push(`Close coverage gaps: ${coverageGaps.slice(0, 3).join(', ')}`);
  return actions;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function cryptoRandomId(): string {
  const a = new Uint8Array(8);
  (globalThis.crypto as Crypto).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── cognitive depth metric (unchanged public API) ────────────────────────

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
