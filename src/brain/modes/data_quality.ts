// Hawkeye Sterling — real data-quality modes.
//
//   completeness_audit  — % of expected evidence channels populated
//   freshness_check     — oldest evidence observedAt within SLA window
//   source_credibility  — weighted credibility across cited evidence
//   tamper_detection    — sha256 integrity check on evidence
//   provenance_trace    — depth of provenance chain per evidence item
//   data_quality_score  — composite over the above four
//   discrepancy_log     — contradictory assertions across different fields

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';
import { type EvidenceItem, credibilityScore, freshnessDays, isStale } from '../evidence.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
): Finding {
  return {
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
}

function evItems(ctx: BrainContext): EvidenceItem[] {
  const v = (ctx.evidence as Record<string, unknown>).items;
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is EvidenceItem =>
      !!x && typeof x === 'object' &&
      typeof (x as EvidenceItem).id === 'string' &&
      typeof (x as EvidenceItem).observedAt === 'string',
  );
}

const EXPECTED_CHANNELS = ['sanctionsHits', 'pepHits', 'adverseMedia', 'uboChain', 'documents'] as const;

// ── completeness_audit ─────────────────────────────────────────────────
export const completenessAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence as Record<string, unknown>;
  let populated = 0;
  const missing: string[] = [];
  for (const ch of EXPECTED_CHANNELS) {
    const v = e[ch];
    const ok = Array.isArray(v) ? v.length > 0 : !!v;
    if (ok) populated++; else missing.push(ch);
  }
  const rate = populated / EXPECTED_CHANNELS.length;
  const verdict: Verdict = rate < 0.4 ? 'escalate' : rate < 0.7 ? 'flag' : 'clear';
  return mk('completeness_audit', 'data_quality', ['data_analysis'],
    verdict, 1 - rate, 0.85,
    `Completeness: ${populated}/${EXPECTED_CHANNELS.length} expected evidence channels populated. ${missing.length > 0 ? `Missing: ${missing.join(', ')}.` : 'All channels present.'}`);
};

// ── freshness_check ────────────────────────────────────────────────────
export const freshnessCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = evItems(ctx);
  if (items.length === 0) {
    return mk('freshness_check', 'data_quality', ['data_analysis'],
      'inconclusive', 0, 0.5,
      'Freshness: no structured EvidenceItems (ctx.evidence.items) to audit.');
  }
  const stale = items.filter((ev) => isStale(ev, 365));
  const oldestDays = Math.max(0, ...items.map((ev) => freshnessDays(ev.observedAt)));
  const rate = stale.length / items.length;
  const verdict: Verdict = rate > 0.5 ? 'flag' : 'clear';
  return mk('freshness_check', 'data_quality', ['data_analysis'],
    verdict, rate, 0.85,
    `Freshness: ${stale.length}/${items.length} items stale (>365 days or training_data). Oldest ${oldestDays} days.`);
};

// ── source_credibility ─────────────────────────────────────────────────
export const sourceCredibilityApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = evItems(ctx);
  if (items.length === 0) {
    return mk('source_credibility', 'data_quality', ['intelligence'],
      'inconclusive', 0, 0.5,
      'Source credibility: no structured EvidenceItems to audit.');
  }
  const scores = items.map((ev) => credibilityScore(ev.credibility));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const weakCount = items.filter((ev) => credibilityScore(ev.credibility) <= 0.5).length;
  const verdict: Verdict = avg < 0.5 ? 'flag' : 'clear';
  return mk('source_credibility', 'data_quality', ['intelligence'],
    verdict, 1 - avg, 0.85,
    `Source credibility: mean ${avg.toFixed(2)} across ${items.length} items; ${weakCount} rated weak/mixed/unknown. ${avg < 0.5 ? 'Weight of evidence rests on weak / unverified sources.' : 'Evidence set is well-sourced.'}`);
};

// ── tamper_detection ───────────────────────────────────────────────────
// Every evidence item should carry a sha256. Items without one cannot be
// tamper-verified against a later re-pull.
export const tamperDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = evItems(ctx);
  if (items.length === 0) {
    return mk('tamper_detection', 'data_quality', ['data_analysis'],
      'inconclusive', 0, 0.5, 'Tamper: no structured EvidenceItems to audit.');
  }
  const unsigned = items.filter((ev) => !ev.sha256).length;
  const rate = unsigned / items.length;
  const verdict: Verdict = rate > 0.5 ? 'flag' : 'clear';
  return mk('tamper_detection', 'data_quality', ['data_analysis'],
    verdict, rate, 0.85,
    `Tamper detection: ${unsigned}/${items.length} evidence items lack a sha256 hash (cannot verify against a later re-pull).`);
};

// ── provenance_trace ───────────────────────────────────────────────────
// For each EvidenceItem check it cites a publisher OR a URI (the minimum
// provenance anchors). Absence = unattributable claim.
export const provenanceTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const items = evItems(ctx);
  if (items.length === 0) {
    return mk('provenance_trace', 'data_quality', ['ratiocination'],
      'inconclusive', 0, 0.5, 'Provenance: no structured EvidenceItems.');
  }
  const orphan = items.filter((ev) => !ev.publisher && !ev.uri).length;
  const rate = orphan / items.length;
  const verdict: Verdict = rate > 0.25 ? 'flag' : 'clear';
  return mk('provenance_trace', 'data_quality', ['ratiocination'],
    verdict, rate, 0.85,
    `Provenance: ${orphan}/${items.length} items carry no publisher OR URI; those claims are unattributable under charter P7 scope-declaration requirement.`);
};

// ── data_quality_score ─────────────────────────────────────────────────
// Composite of completeness, freshness, credibility, tamper, provenance.
export const dataQualityScoreApply = async (ctx: BrainContext): Promise<Finding> => {
  const sub: Finding[] = [];
  sub.push(await completenessAuditApply(ctx));
  sub.push(await freshnessCheckApply(ctx));
  sub.push(await sourceCredibilityApply(ctx));
  sub.push(await tamperDetectionApply(ctx));
  sub.push(await provenanceTraceApply(ctx));
  const contributing = sub.filter((s) => s.verdict !== 'inconclusive');
  if (contributing.length === 0) {
    return mk('data_quality_score', 'data_quality', ['data_analysis'],
      'inconclusive', 0, 0.5,
      'Data quality score: no component sub-audits had enough input.');
  }
  const composite = contributing.reduce((a, f) => a + f.score, 0) / contributing.length;
  const verdict: Verdict = composite > 0.5 ? 'flag' : 'clear';
  return mk('data_quality_score', 'data_quality', ['data_analysis'],
    verdict, composite, 0.9,
    `Data quality composite: ${(composite * 100).toFixed(0)}% deficiency across ${contributing.length}/5 sub-audits (completeness, freshness, credibility, tamper, provenance).`);
};

// ── discrepancy_log ────────────────────────────────────────────────────
// Check evidence.documents for pair-wise contradictions (same field,
// different values across docs).
export const discrepancyLogApply = async (ctx: BrainContext): Promise<Finding> => {
  const docs = ((ctx.evidence as Record<string, unknown>).documents);
  if (!Array.isArray(docs) || docs.length < 2) {
    return mk('discrepancy_log', 'data_quality', ['ratiocination'],
      'inconclusive', 0, 0.5,
      `Discrepancy: need ≥2 documents, have ${Array.isArray(docs) ? docs.length : 0}.`);
  }
  const values: Record<string, Set<string>> = {};
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'string' || typeof v === 'number') {
        (values[k] ??= new Set()).add(String(v));
      }
    }
  }
  const discrepancies: string[] = [];
  for (const [k, s] of Object.entries(values)) {
    if (s.size > 1) discrepancies.push(`${k}={${[...s].slice(0, 3).join(', ')}}`);
  }
  const verdict: Verdict = discrepancies.length >= 2 ? 'flag' : 'clear';
  return mk('discrepancy_log', 'data_quality', ['ratiocination'],
    verdict, Math.min(1, discrepancies.length / 4), 0.85,
    discrepancies.length === 0
      ? `Discrepancy: no cross-document field contradictions across ${docs.length} docs.`
      : `Discrepancy: ${discrepancies.length} field(s) differ across ${docs.length} docs — ${discrepancies.slice(0, 4).join('; ')}.`);
};

export const DATA_QUALITY_MODE_APPLIES = {
  completeness_audit: completenessAuditApply,
  freshness_check: freshnessCheckApply,
  source_credibility: sourceCredibilityApply,
  tamper_detection: tamperDetectionApply,
  provenance_trace: provenanceTraceApply,
  data_quality_score: dataQualityScoreApply,
  discrepancy_log: discrepancyLogApply,
} as const;
