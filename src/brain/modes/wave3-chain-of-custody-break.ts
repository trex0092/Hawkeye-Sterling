// Hawkeye Sterling — wave-3 mode: chain_of_custody_break
// Detects breaks in physical chain-of-custody for precious-metals and
// mineral shipments — temporal gaps, custody handoffs without seal
// continuity, or refinery-mass discrepancies.
// Anchors: LBMA RGG v9 (chain-of-custody requirements), OECD DDG
// (5-step framework — Step 4 audit), LBMA Good Delivery Rules,
// UAE MoE Circular 2/2024.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface CustodyEvent {
  custodianName?: string;
  receivedAt?: string;          // ISO datetime
  releasedAt?: string;          // ISO datetime
  receivedMassGrams?: number;
  releasedMassGrams?: number;
  sealNumber?: string;
  sealIntact?: boolean;
}

interface ChainOfCustodyBatch {
  batchId?: string;
  events?: CustodyEvent[];
  declaredMassGrams?: number;
  finalRefinedMassGrams?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; severity: 'flag' | 'escalate'; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// LBMA RGG v9 best practice: temporal gaps between custodian release
// and next receipt > 48h require explanation. Mass loss > 0.5% in
// transit requires audit.
const TEMPORAL_GAP_FLAG_HOURS = 48;
const MASS_LOSS_FLAG_PCT = 0.005;
const MASS_LOSS_ESCALATE_PCT = 0.02;

export const chainOfCustodyBreakApply = async (ctx: BrainContext): Promise<Finding> => {
  const batches = typedEvidence<ChainOfCustodyBatch>(ctx, 'chainOfCustodyBatches');
  if (batches.length === 0) {
    return {
      modeId: 'chain_of_custody_break',
      category: 'forensic' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No chainOfCustodyBatches evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  for (const b of batches) {
    const ref = b.batchId ?? '(unidentified)';
    const events = b.events ?? [];

    // Temporal-gap detection (released → next received > N hours).
    for (let i = 0; i < events.length - 1; i++) {
      const released = events[i]?.releasedAt ? Date.parse(events[i]!.releasedAt!) : NaN;
      const nextRcv = events[i + 1]?.receivedAt ? Date.parse(events[i + 1]!.receivedAt!) : NaN;
      if (!Number.isNaN(released) && !Number.isNaN(nextRcv)) {
        const gapHours = (nextRcv - released) / (1000 * 60 * 60);
        if (gapHours > TEMPORAL_GAP_FLAG_HOURS) {
          hits.push({ id: 'temporal_gap', label: `Custody gap ${gapHours.toFixed(1)}h between ${events[i]?.custodianName ?? '?'} and ${events[i + 1]?.custodianName ?? '?'} (>${TEMPORAL_GAP_FLAG_HOURS}h)`, weight: 0.35, evidence: ref, severity: 'flag' });
        }
      }
    }

    // Seal-integrity break.
    const brokenSeals = events.filter((e) => e.sealIntact === false);
    if (brokenSeals.length > 0) {
      hits.push({ id: 'broken_seal', label: `${brokenSeals.length} broken-seal event(s) in chain`, weight: 0.5, evidence: ref, severity: 'escalate' });
    }

    // Per-handoff mass discrepancy.
    for (let i = 0; i < events.length - 1; i++) {
      const released = events[i]?.releasedMassGrams ?? 0;
      const nextReceived = events[i + 1]?.receivedMassGrams ?? 0;
      if (released > 0 && nextReceived > 0) {
        const lossPct = Math.abs(released - nextReceived) / released;
        if (lossPct >= MASS_LOSS_ESCALATE_PCT) {
          hits.push({ id: 'mass_loss_critical', label: `${(lossPct * 100).toFixed(2)}% mass discrepancy ${events[i]?.custodianName ?? '?'} → ${events[i + 1]?.custodianName ?? '?'}`, weight: 0.55, evidence: ref, severity: 'escalate' });
        } else if (lossPct >= MASS_LOSS_FLAG_PCT) {
          hits.push({ id: 'mass_loss_flag', label: `${(lossPct * 100).toFixed(2)}% mass discrepancy ${events[i]?.custodianName ?? '?'} → ${events[i + 1]?.custodianName ?? '?'}`, weight: 0.3, evidence: ref, severity: 'flag' });
        }
      }
    }

    // End-to-end declared vs final-refined.
    if (b.declaredMassGrams && b.finalRefinedMassGrams && b.declaredMassGrams > 0) {
      const totalLossPct = Math.abs(b.declaredMassGrams - b.finalRefinedMassGrams) / b.declaredMassGrams;
      if (totalLossPct >= MASS_LOSS_ESCALATE_PCT) {
        hits.push({ id: 'end_to_end_loss', label: `${(totalLossPct * 100).toFixed(2)}% end-to-end mass loss (declared vs refined)`, weight: 0.5, evidence: ref, severity: 'escalate' });
      }
    }
  }

  const score = clamp01(hits.reduce((a, h) => a + h.weight, 0));
  const verdict: Verdict = hits.some((h) => h.severity === 'escalate') ? 'escalate' : hits.length > 0 ? 'flag' : 'clear';

  return {
    modeId: 'chain_of_custody_break',
    category: 'forensic' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.92, 0.55 + 0.05 * hits.length),
    verdict,
    rationale: [
      `${batches.length} batch(es) reviewed; ${hits.length} chain-of-custody signal(s) fired.`,
      hits.length > 0 ? `Composite ${score.toFixed(2)}.` : '',
      'Anchors: LBMA RGG v9 · OECD DDG Step 4 · LBMA Good Delivery Rules · UAE MoE Circular 2/2024.',
    ].filter(Boolean).join(' '),
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default chainOfCustodyBreakApply;
