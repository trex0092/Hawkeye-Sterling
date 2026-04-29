import { describe, expect, it } from 'vitest';
import { COGNITIVE_GUARDS_MODE_APPLIES } from '../modes/cognitive_guards.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = ['cdd']): BrainContext {
  return {
    run: { id: 'r-cog', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('cognitive_guards — framing_check', () => {
  it('inconclusive without probe', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.framing_check!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on heavy one-sided framing', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.framing_check!(makeCtx({
      framingProbe: { riskIndicators: 5, counterIndicators: 0, totalAvailableIndicators: 10, sourceRef: 'f-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on balanced framing', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.framing_check!(makeCtx({
      framingProbe: { riskIndicators: 3, counterIndicators: 3, totalAvailableIndicators: 7, sourceRef: 'f-1' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('cognitive_guards — anchoring_avoidance', () => {
  it('inconclusive without observation', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.anchoring_avoidance!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('flags under-update relative to new evidence', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.anchoring_avoidance!(makeCtx({
      anchorObservation: { anchorValue: 0.7, newEvidenceCount: 5, finalDisposition: 0.69, newEvidenceMagnitude: 0.4, sourceRef: 'a-1' },
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on appropriate update', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.anchoring_avoidance!(makeCtx({
      anchorObservation: { anchorValue: 0.7, newEvidenceCount: 5, finalDisposition: 0.3, newEvidenceMagnitude: 0.4, sourceRef: 'a-1' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('cognitive_guards — availability_check', () => {
  it('inconclusive without probe', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.availability_check!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on recent-case-only without base rate', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.availability_check!(makeCtx({
      availabilityProbe: { recentCaseCited: true, recentCaseAgeDays: 5, baseRateConsulted: false, decisionScore: 0.9, sourceRef: 'a-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('cognitive_guards — loss_aversion_check', () => {
  it('inconclusive without probe', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.loss_aversion_check!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('flags when chosen action diverges from expected-utility optimum', async () => {
    // baseRate 0.5, fnCost 100, fpCost 1000 → expClear=500 > expEscalate=50, optimal "clear",
    // but chosen action is "escalate" → flag
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.loss_aversion_check!(makeCtx({
      lossAversionProbe: {
        estimatedFnCost: 100, estimatedFpCost: 1000, chosenAction: 'escalate', baseRate: 0.5, sourceRef: 'l-1',
      },
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('cognitive_guards — hallucination_check', () => {
  it('inconclusive without probe', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.hallucination_check!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on dangling list-match claim', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.hallucination_check!(makeCtx({
      hallucinationProbe: {
        rationaleId: 'R1',
        suppliedEvidenceIds: ['e1', 'e2'],
        claims: [
          { claim: 'Subject matches OFAC SDN', claimType: 'list_match', sourceRef: 'c-1' },
          { claim: 'Risk score 0.7', claimType: 'numeric', citedEvidenceId: 'e1', sourceRef: 'c-2' },
        ],
        sourceRef: 'h-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all cite-required claims trace to supplied evidence', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.hallucination_check!(makeCtx({
      hallucinationProbe: {
        rationaleId: 'R1',
        suppliedEvidenceIds: ['e1', 'e2'],
        claims: [
          { claim: 'A', claimType: 'fact',         citedEvidenceId: 'e1', sourceRef: 'c-1' },
          { claim: 'B', claimType: 'numeric',      citedEvidenceId: 'e2', sourceRef: 'c-2' },
          { claim: 'C', claimType: 'legal_article', citedEvidenceId: 'e1', sourceRef: 'c-3' },
        ],
        sourceRef: 'h-1',
      },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('cognitive_guards — disparate_impact', () => {
  it('inconclusive without probes', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.disparate_impact!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on four-fifths-rule breach', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.disparate_impact!(makeCtx({
      disparateImpactProbes: [{
        attributeFamily: 'nationality',
        buckets: [
          { attribute: 'nationality:AE', total: 100, flaggedOrEscalated: 8 },
          { attribute: 'nationality:PK', total: 100, flaggedOrEscalated: 25 },
        ],
        sourceRef: 'd-1',
      }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when ratio >= 0.8', async () => {
    const out = await COGNITIVE_GUARDS_MODE_APPLIES.disparate_impact!(makeCtx({
      disparateImpactProbes: [{
        attributeFamily: 'nationality',
        buckets: [
          { attribute: 'nationality:AE', total: 100, flaggedOrEscalated: 18 },
          { attribute: 'nationality:GB', total: 100, flaggedOrEscalated: 20 },
        ],
        sourceRef: 'd-1',
      }],
    }));
    expect(out.verdict).toBe('clear');
  });
});
