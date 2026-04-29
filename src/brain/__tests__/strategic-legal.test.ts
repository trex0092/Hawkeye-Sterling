import { describe, expect, it } from 'vitest';
import { STRATEGIC_LEGAL_MODE_APPLIES } from '../modes/strategic_legal.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'r-sl', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains: ['cdd'],
  };
}

describe('adversarial_collaboration', () => {
  it('inconclusive without tests', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.adversarial_collaboration!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('clears when agreed discriminating test exists', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.adversarial_collaboration!(makeCtx({
      acTests: [{ proposedBy: 'joint', test: 'independent source check', discriminates: true, agreedBy: ['proponent', 'opponent'], sourceRef: 'ac-1' }],
    }));
    expect(out.verdict).toBe('clear');
  });
  it('flags when discriminating test proposed but not agreed', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.adversarial_collaboration!(makeCtx({
      acTests: [{ proposedBy: 'proponent', test: 'ledger audit', discriminates: true, agreedBy: ['proponent'], sourceRef: 'ac-2' }],
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('counterexample_search', () => {
  it('inconclusive without examples', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.counterexample_search!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on strong unrefuted counterexample', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.counterexample_search!(makeCtx({
      counterexamples: [{ description: 'entity settled all debts', strength: 'strong', refuted: false, sourceRef: 'ce-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all counterexamples refuted', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.counterexample_search!(makeCtx({
      counterexamples: [{ description: 'entity settled all debts', strength: 'strong', refuted: true, refutationNote: 'court record shows otherwise', sourceRef: 'ce-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('analogical_precedent', () => {
  it('inconclusive without precedents', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.analogical_precedent!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags when binding high-similarity precedent supports claim', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.analogical_precedent!(makeCtx({
      precedents: [{ caseRef: 'ABC v FIU [2022]', similarity: 0.85, supportsClaim: true, binding: true, sourceRef: 'ap-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
});

describe('policy_vs_rule', () => {
  it('inconclusive without question', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.policy_vs_rule!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags purposive interpretation of bright-line rule', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.policy_vs_rule!(makeCtx({
      legalQuestion: { question: 'USD 10k threshold', isRuleBased: true, interpretationApplied: 'purposive', sourceRef: 'pv-1' },
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears when literal interpretation applied to rule', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.policy_vs_rule!(makeCtx({
      legalQuestion: { question: 'USD 10k threshold', isRuleBased: true, interpretationApplied: 'literal', sourceRef: 'pv-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('burden_of_proof', () => {
  it('inconclusive without items', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.burden_of_proof!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags when burden not met', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.burden_of_proof!(makeCtx({
      burdenItems: [{ claim: 'source of funds legitimate', bearerRole: 'customer', standard: 'balance', evidenceMet: false, sourceRef: 'bp-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears when all burdens met', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.burden_of_proof!(makeCtx({
      burdenItems: [{ claim: 'no sanctions match', bearerRole: 'compliance officer', standard: 'reasonable_suspicion', evidenceMet: true, sourceRef: 'bp-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('art_dealer', () => {
  it('inconclusive without transactions', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.art_dealer!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on multiple high-risk indicators', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.art_dealer!(makeCtx({
      artTransactions: [
        { transactionType: 'private_sale', buyerKnown: false, freePorted: true, valuationGapRatio: 3, thirdPartyPayment: true, sourceRef: 'ad-1' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on clean auction with known buyer', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.art_dealer!(makeCtx({
      artTransactions: [
        { transactionType: 'auction', buyerKnown: true, freePorted: false, valuationGapRatio: 1.1, thirdPartyPayment: false, sourceRef: 'ad-2' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('minimum_viable_compliance', () => {
  it('inconclusive without sets', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.minimum_viable_compliance!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when no set meets coverage threshold', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.minimum_viable_compliance!(makeCtx({
      controlSets: [{ id: 'A', controlCount: 5, coveragePercent: 60, gapRisks: ['wire fraud'], chosen: true, sourceRef: 'mvc-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when chosen set is MVC', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.minimum_viable_compliance!(makeCtx({
      controlSets: [
        { id: 'A', controlCount: 8, coveragePercent: 85, gapRisks: [], chosen: true, sourceRef: 'mvc-2' },
        { id: 'B', controlCount: 15, coveragePercent: 92, gapRisks: [], chosen: false, sourceRef: 'mvc-3' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('retention_audit', () => {
  it('inconclusive without items', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.retention_audit!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on premature destruction', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.retention_audit!(makeCtx({
      retentionItems: [{ recordType: 'CDD file', requiredYears: 5, actualAgeYears: 2, destroyed: true, sourceRef: 'ra-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags missing record', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.retention_audit!(makeCtx({
      retentionItems: [{ recordType: 'transaction log', requiredYears: 7, actualAgeYears: null, destroyed: false, sourceRef: 'ra-2' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears when records properly retained', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.retention_audit!(makeCtx({
      retentionItems: [{ recordType: 'CDD file', requiredYears: 5, actualAgeYears: 3, destroyed: false, sourceRef: 'ra-3' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('peer_benchmark', () => {
  it('inconclusive without items', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.peer_benchmark!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on >30pt gap', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.peer_benchmark!(makeCtx({
      benchmarkItems: [{ control: 'SAR filing rate', peerMedianScore: 80, ownScore: 40, sourceRef: 'pb-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when at or above peer median', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.peer_benchmark!(makeCtx({
      benchmarkItems: [{ control: 'SAR filing rate', peerMedianScore: 75, ownScore: 80, sourceRef: 'pb-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('portfolio_view', () => {
  it('inconclusive without positions', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.portfolio_view!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on high weighted risk', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.portfolio_view!(makeCtx({
      portfolioPositions: [
        { entityId: 'E1', riskScore: 0.9, exposure: 0.6, sourceRef: 'pf-1' },
        { entityId: 'E2', riskScore: 0.8, exposure: 0.4, sourceRef: 'pf-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on low aggregate risk', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.portfolio_view!(makeCtx({
      portfolioPositions: [
        { entityId: 'E1', riskScore: 0.2, exposure: 0.5, sourceRef: 'pf-3' },
        { entityId: 'E2', riskScore: 0.1, exposure: 0.5, sourceRef: 'pf-4' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('risk_appetite_check', () => {
  it('inconclusive without exposure', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.risk_appetite_check!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates above escalation limit', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.risk_appetite_check!(makeCtx({
      riskExposure: { metricName: 'PEP exposure count', currentValue: 150, appetiteLimit: 100, escalationLimit: 120, sourceRef: 'rac-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags between appetite and escalation', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.risk_appetite_check!(makeCtx({
      riskExposure: { metricName: 'PEP exposure count', currentValue: 110, appetiteLimit: 100, escalationLimit: 120, sourceRef: 'rac-2' },
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears below appetite', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.risk_appetite_check!(makeCtx({
      riskExposure: { metricName: 'PEP exposure count', currentValue: 80, appetiteLimit: 100, escalationLimit: 120, sourceRef: 'rac-3' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('risk_based_approach', () => {
  it('inconclusive without mappings', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.risk_based_approach!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on high-risk segment with simplified controls', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.risk_based_approach!(makeCtx({
      rbaMappings: [{ segment: 'PEP private banking', riskRating: 'high', assignedControlTier: 'simplified', sourceRef: 'rba-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all segments appropriately controlled', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.risk_based_approach!(makeCtx({
      rbaMappings: [
        { segment: 'retail low-value', riskRating: 'low', assignedControlTier: 'simplified', sourceRef: 'rba-2' },
        { segment: 'corporate', riskRating: 'medium', assignedControlTier: 'standard', sourceRef: 'rba-3' },
        { segment: 'PEP', riskRating: 'high', assignedControlTier: 'enhanced', sourceRef: 'rba-4' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('exception_log', () => {
  it('inconclusive without exceptions', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.exception_log!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on expired-open exception', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.exception_log!(makeCtx({
      exceptions: [{ id: 'EX-01', policy: 'CDD policy', justification: 'legacy client', approvedBy: 'MLRO', expiresAt: '2024-01-01', status: 'expired', sourceRef: 'el-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('escalates on unjustified exception', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.exception_log!(makeCtx({
      exceptions: [{ id: 'EX-02', policy: 'EDD policy', justification: null, approvedBy: null, expiresAt: '2026-12-31', status: 'open', sourceRef: 'el-2' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags perpetual open exception', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.exception_log!(makeCtx({
      exceptions: [{ id: 'EX-03', policy: 'correspondent banking policy', justification: 'strategic relationship', approvedBy: 'Board', expiresAt: null, status: 'open', sourceRef: 'el-3' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears when all exceptions valid and dated', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.exception_log!(makeCtx({
      exceptions: [{ id: 'EX-04', policy: 'CDD policy', justification: 'diplomatic immunity', approvedBy: 'MLRO', expiresAt: '2027-06-30', status: 'open', sourceRef: 'el-4' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('five_pillars', () => {
  it('inconclusive without pillars', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.five_pillars!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on absent pillar', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.five_pillars!(makeCtx({
      pillars: [
        { pillar: 'policies', status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-1' },
        { pillar: 'compliance_officer', status: 'absent', lastReviewDate: null, sourceRef: 'fp-2' },
        { pillar: 'training', status: 'partial', lastReviewDate: '2024-06-01', sourceRef: 'fp-3' },
        { pillar: 'independent_testing', status: 'adequate', lastReviewDate: '2025-03-01', sourceRef: 'fp-4' },
        { pillar: 'cdd', status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-5' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all five pillars adequate', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.five_pillars!(makeCtx({
      pillars: [
        { pillar: 'policies',            status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-a' },
        { pillar: 'compliance_officer',  status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-b' },
        { pillar: 'training',            status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-c' },
        { pillar: 'independent_testing', status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-d' },
        { pillar: 'cdd',                 status: 'adequate', lastReviewDate: '2025-01-01', sourceRef: 'fp-e' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

describe('ooda', () => {
  it('inconclusive without phases', async () => {
    expect((await STRATEGIC_LEGAL_MODE_APPLIES.ooda!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing phase', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.ooda!(makeCtx({
      oodaPhases: [
        { phase: 'observe', complete: true,  evidenceItems: 5, lagDays: 0, sourceRef: 'od-1' },
        { phase: 'orient',  complete: true,  evidenceItems: 3, lagDays: 1, sourceRef: 'od-2' },
        // decide and act missing
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags incomplete phase', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.ooda!(makeCtx({
      oodaPhases: [
        { phase: 'observe', complete: true,  evidenceItems: 5, lagDays: 0, sourceRef: 'od-3' },
        { phase: 'orient',  complete: false, evidenceItems: 1, lagDays: 2, sourceRef: 'od-4' },
        { phase: 'decide',  complete: true,  evidenceItems: 2, lagDays: 0, sourceRef: 'od-5' },
        { phase: 'act',     complete: true,  evidenceItems: 1, lagDays: 0, sourceRef: 'od-6' },
      ],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on complete loop with low lag', async () => {
    const out = await STRATEGIC_LEGAL_MODE_APPLIES.ooda!(makeCtx({
      oodaPhases: [
        { phase: 'observe', complete: true, evidenceItems: 8, lagDays: 1, sourceRef: 'od-7' },
        { phase: 'orient',  complete: true, evidenceItems: 5, lagDays: 1, sourceRef: 'od-8' },
        { phase: 'decide',  complete: true, evidenceItems: 3, lagDays: 0, sourceRef: 'od-9' },
        { phase: 'act',     complete: true, evidenceItems: 2, lagDays: 0, sourceRef: 'od-10' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});
