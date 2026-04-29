import { describe, expect, it } from 'vitest';
import { MARKET_GOVERNANCE_MODE_APPLIES } from '../modes/market_governance.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'r-mg', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains: ['cdd'],
  };
}

// ── wash_trade ────────────────────────────────────────────────────────
describe('wash_trade', () => {
  it('inconclusive without legs', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.wash_trade!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags single matched wash leg', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.wash_trade!(makeCtx({
      washLegs: [{ tradeId: 'T1', buySideEntityId: 'E1', sellSideEntityId: 'E1', sameBeneficialOwner: true, priceDiff: 0.001, timeDiffSeconds: 60, notionalUsd: 500000, sourceRef: 'w-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('escalates on 3+ matched wash legs', async () => {
    const legs = Array.from({ length: 3 }, (_, i) => ({
      tradeId: `T${i}`, buySideEntityId: 'E1', sellSideEntityId: 'E1',
      sameBeneficialOwner: true, priceDiff: 0.001, timeDiffSeconds: 100,
      notionalUsd: 200000, sourceRef: `w-${i}`,
    }));
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.wash_trade!(makeCtx({ washLegs: legs }))).verdict).toBe('escalate');
  });
  it('clears on different beneficial owners', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.wash_trade!(makeCtx({
      washLegs: [{ tradeId: 'T1', buySideEntityId: 'E1', sellSideEntityId: 'E2', sameBeneficialOwner: false, priceDiff: 0.001, timeDiffSeconds: 60, notionalUsd: 500000, sourceRef: 'w-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── spoofing ──────────────────────────────────────────────────────────
describe('spoofing', () => {
  it('inconclusive without orders', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.spoofing!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags rapid-cancel order with price impact', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.spoofing!(makeCtx({
      spooferOrders: [{ orderId: 'O1', side: 'buy', sizeUsd: 1000000, cancelled: true, millisToCancel: 800, priceImpactBps: 8, executed: false, sourceRef: 's-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('escalates on 3+ impactful rapid-cancel orders', async () => {
    const orders = Array.from({ length: 3 }, (_, i) => ({
      orderId: `O${i}`, side: 'sell' as const, sizeUsd: 500000,
      cancelled: true, millisToCancel: 500, priceImpactBps: 10,
      executed: false, sourceRef: `s-${i}`,
    }));
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.spoofing!(makeCtx({ spooferOrders: orders }))).verdict).toBe('escalate');
  });
  it('clears on slow cancellation with no impact', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.spoofing!(makeCtx({
      spooferOrders: [{ orderId: 'O1', side: 'buy', sizeUsd: 100000, cancelled: true, millisToCancel: 60000, priceImpactBps: 1, executed: false, sourceRef: 's-3' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── self_dealing ──────────────────────────────────────────────────────
describe('self_dealing', () => {
  it('inconclusive without transactions', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.self_dealing!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on undisclosed related-party transaction', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.self_dealing!(makeCtx({
      selfDealTxns: [{ transactionId: 'SD-1', counterpartyRole: 'director', disclosed: false, boardApproved: null, valueUsd: 500000, atMarketPrice: null, sourceRef: 'sd-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags unapproved related-party transaction', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.self_dealing!(makeCtx({
      selfDealTxns: [{ transactionId: 'SD-2', counterpartyRole: 'shareholder', disclosed: true, boardApproved: false, valueUsd: 100000, atMarketPrice: true, sourceRef: 'sd-2' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on disclosed board-approved at-market transaction', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.self_dealing!(makeCtx({
      selfDealTxns: [{ transactionId: 'SD-3', counterpartyRole: 'director', disclosed: true, boardApproved: true, valueUsd: 200000, atMarketPrice: true, sourceRef: 'sd-3' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── circular_walk ─────────────────────────────────────────────────────
describe('circular_walk', () => {
  it('inconclusive without circulars', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.circular_walk!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on circular with unmet obligations', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.circular_walk!(makeCtx({
      regulatoryCirculars: [{ circularId: 'CBUAE-2024-01', issuedAt: '2024-01-15', topic: 'CDD', supersedes: [], obligationsMet: false, sourceRef: 'c-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all obligations met', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.circular_walk!(makeCtx({
      regulatoryCirculars: [{ circularId: 'CBUAE-2024-01', issuedAt: '2024-01-15', topic: 'CDD', supersedes: [], obligationsMet: true, sourceRef: 'c-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── three_lines_defence ───────────────────────────────────────────────
describe('three_lines_defence', () => {
  it('inconclusive without assessments', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.three_lines_defence!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when line responsibilities not defined', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.three_lines_defence!(makeCtx({
      lineAssessments: [{ line: 2, responsibilitiesDefined: false, independenceAdequate: true, reportingLineClean: true, lastReviewDate: null, sourceRef: 'l-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when all three lines adequate', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.three_lines_defence!(makeCtx({
      lineAssessments: [
        { line: 1, responsibilitiesDefined: true, independenceAdequate: true, reportingLineClean: true, lastReviewDate: '2025-01-01', sourceRef: 'l-2' },
        { line: 2, responsibilitiesDefined: true, independenceAdequate: true, reportingLineClean: true, lastReviewDate: '2025-01-01', sourceRef: 'l-3' },
        { line: 3, responsibilitiesDefined: true, independenceAdequate: true, reportingLineClean: true, lastReviewDate: '2025-01-01', sourceRef: 'l-4' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── wolfsberg_faq ─────────────────────────────────────────────────────
describe('wolfsberg_faq', () => {
  it('inconclusive without items', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.wolfsberg_faq!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('flags single Wolfsberg gap', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.wolfsberg_faq!(makeCtx({
      wolfsbergItems: [{ principle: 'PEP', status: 'gap', gapDescription: 'no EDD procedure', sourceRef: 'wf-1' }],
    }));
    expect(out.verdict).toBe('flag');
  });
  it('escalates on 3+ gaps', async () => {
    const items = ['CDD', 'EDD', 'STR'].map((p, i) => ({
      principle: p, status: 'gap' as const, gapDescription: 'missing', sourceRef: `wf-${i}`,
    }));
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.wolfsberg_faq!(makeCtx({ wolfsbergItems: items }))).verdict).toBe('escalate');
  });
  it('clears when all principles compliant', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.wolfsberg_faq!(makeCtx({
      wolfsbergItems: [{ principle: 'CDD', status: 'compliant', gapDescription: null, sourceRef: 'wf-4' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── presumption_innocence ─────────────────────────────────────────────
describe('presumption_innocence', () => {
  it('inconclusive without checks', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.presumption_innocence!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on conclusion with no evidence', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.presumption_innocence!(makeCtx({
      presumptionChecks: [{ conclusion: 'entity is laundering', supportingEvidenceCount: 0, evidenceStrength: 'none', rebuttalEvidenceCount: 0, sourceRef: 'pi-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on strong evidence supporting conclusion', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.presumption_innocence!(makeCtx({
      presumptionChecks: [{ conclusion: 'unusual cash pattern', supportingEvidenceCount: 8, evidenceStrength: 'strong', rebuttalEvidenceCount: 1, sourceRef: 'pi-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── saturation ────────────────────────────────────────────────────────
describe('saturation', () => {
  it('inconclusive without rounds', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.saturation!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('clears on saturated evidence (tiny last delta)', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.saturation!(makeCtx({
      evidenceRounds: [
        { round: 1, conclusionScore: 0.5, newEvidenceItems: 5, sourceRef: 'sr-1' },
        { round: 2, conclusionScore: 0.7, newEvidenceItems: 3, sourceRef: 'sr-2' },
        { round: 3, conclusionScore: 0.71, newEvidenceItems: 1, sourceRef: 'sr-3' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
  it('flags highly unstable evidence', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.saturation!(makeCtx({
      evidenceRounds: [
        { round: 1, conclusionScore: 0.2, newEvidenceItems: 4, sourceRef: 'sr-4' },
        { round: 2, conclusionScore: 0.7, newEvidenceItems: 6, sourceRef: 'sr-5' },
        { round: 3, conclusionScore: 0.1, newEvidenceItems: 3, sourceRef: 'sr-6' },
      ],
    }));
    expect(out.verdict).toBe('flag');
  });
});

// ── toulmin ───────────────────────────────────────────────────────────
describe('toulmin', () => {
  it('inconclusive without argument', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.toulmin!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing claim and warrant', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.toulmin!(makeCtx({
      toulminArgument: { claim: null, ground: 'unusual cash', warrant: null, backing: null, qualifier: null, rebuttal: null, sourceRef: 't-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on complete argument', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.toulmin!(makeCtx({
      toulminArgument: { claim: 'high risk', ground: 'cash pattern', warrant: 'FATF typology', backing: 'FATF R.29', qualifier: 'probable', rebuttal: 'no sanctions', sourceRef: 't-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── irac ──────────────────────────────────────────────────────────────
describe('irac', () => {
  it('inconclusive without memo', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.irac!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on missing rule and application', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.irac!(makeCtx({
      iracMemo: { issue: 'Is EDD required?', rule: null, application: null, conclusion: 'yes', conclusionFirstFlag: true, sourceRef: 'ir-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('flags conclusion-first reasoning', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.irac!(makeCtx({
      iracMemo: { issue: 'Is EDD required?', rule: 'CBUAE Circular 24/2023', application: 'Customer is PEP', conclusion: 'EDD required', conclusionFirstFlag: true, sourceRef: 'ir-2' },
    }));
    expect(out.verdict).toBe('flag');
  });
  it('clears on complete correct IRAC', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.irac!(makeCtx({
      iracMemo: { issue: 'Is EDD required?', rule: 'CBUAE Circular 24/2023', application: 'Customer is PEP tier 1', conclusion: 'EDD required', conclusionFirstFlag: false, sourceRef: 'ir-3' },
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── swot ──────────────────────────────────────────────────────────────
describe('swot', () => {
  it('inconclusive without items', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.swot!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on high threat + missing quadrant', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.swot!(makeCtx({
      swotItems: [
        { quadrant: 'threat', description: 'regulatory action', severity: 0.9, sourceRef: 'sw-1' },
        { quadrant: 'threat', description: 'sanctions exposure', severity: 0.85, sourceRef: 'sw-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on balanced low-risk SWOT', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.swot!(makeCtx({
      swotItems: [
        { quadrant: 'strength',    description: 'strong controls', severity: 0.1, sourceRef: 'sw-3' },
        { quadrant: 'weakness',    description: 'manual process', severity: 0.2, sourceRef: 'sw-4' },
        { quadrant: 'opportunity', description: 'new market',     severity: 0.1, sourceRef: 'sw-5' },
        { quadrant: 'threat',      description: 'low risk area',  severity: 0.15, sourceRef: 'sw-6' },
      ],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── war_game ──────────────────────────────────────────────────────────
describe('war_game', () => {
  it('inconclusive without rounds', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.war_game!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when red wins ≥60%', async () => {
    const rounds = Array.from({ length: 5 }, (_, i) => ({
      round: i + 1, redAction: 'phishing', blueCounterMeasure: i < 3 ? null : 'email filter',
      redSucceeded: i < 4, sourceRef: `wg-${i}`,
    }));
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.war_game!(makeCtx({ warGameRounds: rounds }))).verdict).toBe('escalate');
  });
  it('clears when blue team holds', async () => {
    const rounds = Array.from({ length: 4 }, (_, i) => ({
      round: i + 1, redAction: 'phishing', blueCounterMeasure: 'email filter',
      redSucceeded: i === 0, sourceRef: `wg-c-${i}`,
    }));
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.war_game!(makeCtx({ warGameRounds: rounds }))).verdict).toBe('clear');
  });
});

// ── monte_carlo ───────────────────────────────────────────────────────
describe('monte_carlo', () => {
  it('inconclusive without results', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.monte_carlo!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when p95 exceeds tolerance', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.monte_carlo!(makeCtx({
      monteCarloResults: [{ metric: 'loss exposure', p5: 100000, p50: 500000, p95: 2500000, tolerance: 1000000, unit: 'USD', sourceRef: 'mc-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when p95 within tolerance', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.monte_carlo!(makeCtx({
      monteCarloResults: [{ metric: 'loss exposure', p5: 10000, p50: 50000, p95: 80000, tolerance: 100000, unit: 'USD', sourceRef: 'mc-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── cvar ──────────────────────────────────────────────────────────────
describe('cvar', () => {
  it('inconclusive without assessments', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.cvar!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates when CVaR exceeds risk budget', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.cvar!(makeCtx({
      cvarAssessments: [{ portfolio: 'Crypto desk', confidenceLevel: 0.95, var: 500000, cvar: 1800000, riskBudget: 1000000, currency: 'USD', sourceRef: 'cv-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears when CVaR within budget', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.cvar!(makeCtx({
      cvarAssessments: [{ portfolio: 'FX desk', confidenceLevel: 0.95, var: 100000, cvar: 300000, riskBudget: 500000, currency: 'USD', sourceRef: 'cv-2' }],
    }));
    expect(out.verdict).toBe('clear');
  });
});

// ── post_mortem ───────────────────────────────────────────────────────
describe('post_mortem', () => {
  it('inconclusive without finding', async () => {
    expect((await MARKET_GOVERNANCE_MODE_APPLIES.post_mortem!(makeCtx())).verdict).toBe('inconclusive');
  });
  it('escalates on preventable incident with multiple control failures', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.post_mortem!(makeCtx({
      postMortem: { incidentId: 'INC-001', rootCauses: ['weak CDD', 'no 4-eyes'], missedSignals: ['velocity spike', 'cash structuring'], controlFailures: ['SAR late', 'EDD skipped'], timeToDetectDays: 45, timeToContainDays: 7, preventable: true, sourceRef: 'pm-1' },
    }));
    expect(out.verdict).toBe('escalate');
  });
  it('clears on non-preventable incident with no control failures', async () => {
    const out = await MARKET_GOVERNANCE_MODE_APPLIES.post_mortem!(makeCtx({
      postMortem: { incidentId: 'INC-002', rootCauses: ['market shock'], missedSignals: [], controlFailures: [], timeToDetectDays: 2, timeToContainDays: 1, preventable: false, sourceRef: 'pm-2' },
    }));
    expect(out.verdict).toBe('clear');
  });
});
