import { describe, expect, it } from 'vitest';
import type { BrainContext, Finding } from '../types.js';
import { STATISTICAL_MODE_APPLIES } from '../modes/statistical.js';
import { BEHAVIORAL_MODE_APPLIES } from '../modes/behavioral.js';
import { GOVERNANCE_MODE_APPLIES } from '../modes/governance.js';
import { DATA_QUALITY_MODE_APPLIES } from '../modes/data_quality.js';
import { COGNITIVE_MODE_APPLIES } from '../modes/cognitive.js';
import { TYPOLOGY_MODE_APPLIES, structuringDetect, smurfingDetect } from '../modes/typology.js';
import { uboTreeWalkApply, killChainApply, narrativeCoherenceApply } from '../modes/forensic.js';

function ctx(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    run: { id: 'r', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual' },
    evidence: {},
    priorFindings: [],
    domains: ['cdd', 'sanctions'],
    ...overrides,
  };
}

function synthTx(n: number, overrides: (i: number) => Record<string, unknown>): unknown[] {
  return Array.from({ length: n }, (_, i) => overrides(i));
}

describe('statistical', () => {
  it('frequentist flags elevated rate over baseline', async () => {
    const tx = synthTx(30, (i) => ({ amount: 100, suspicious: i < 10 }));
    const r = await STATISTICAL_MODE_APPLIES.frequentist(ctx({ evidence: { transactions: tx } }));
    expect(['flag', 'escalate']).toContain(r.verdict);
  });
  it('chi_square is inconclusive on tiny input', async () => {
    const r = await STATISTICAL_MODE_APPLIES.chi_square(ctx({ evidence: { transactions: [] } }));
    expect(r.verdict).toBe('inconclusive');
  });
  it('bayesian_network emits an LR when lift is present', async () => {
    const tx = synthTx(40, (i) => ({
      amount: 100,
      highRiskJurisdiction: i < 20,
      suspicious: i < 18,
    }));
    const r = await STATISTICAL_MODE_APPLIES.bayesian_network(ctx({ evidence: { transactions: tx } }));
    expect(r.verdict).toBe('flag');
  });
});

describe('behavioral', () => {
  it('velocity_analysis flags on first-half-vs-second-half uplift', async () => {
    const day = 86_400_000;
    const tx = synthTx(20, (i) => ({
      amount: 100,
      timestamp: i < 5 ? day * i * 10 : day * 50 + day * i * 0.05,
    }));
    const r = await BEHAVIORAL_MODE_APPLIES.velocity_analysis(ctx({ evidence: { transactions: tx } }));
    expect(['flag', 'escalate']).toContain(r.verdict);
  });
  it('pattern_of_life flags suspiciously regular intervals', async () => {
    const tx = synthTx(12, (i) => ({ amount: 100, timestamp: i * 60_000 }));
    const r = await BEHAVIORAL_MODE_APPLIES.pattern_of_life(ctx({ evidence: { transactions: tx } }));
    expect(r.verdict).toBe('flag');
  });
});

describe('governance', () => {
  it('four_eyes_stress hard-stops on overlapping actors', async () => {
    const r = await GOVERNANCE_MODE_APPLIES.four_eyes_stress(ctx({
      evidence: {
        approvals: [
          { caseId: 'c1', submitter: 'alice', firstApprover: 'alice', secondApprover: 'bob' },
        ],
      },
    }));
    expect(['block', 'escalate']).toContain(r.verdict);
  });
  it('escalation_trigger clears with no high-score priors', async () => {
    const r = await GOVERNANCE_MODE_APPLIES.escalation_trigger(ctx());
    expect(r.verdict).toBe('clear');
  });
});

describe('data_quality', () => {
  it('completeness_audit flags when channels are sparse', async () => {
    const r = await DATA_QUALITY_MODE_APPLIES.completeness_audit(ctx());
    expect(['flag', 'escalate']).toContain(r.verdict);
  });
  it('source_credibility flags when items are weak', async () => {
    const items = [
      { id: 'e1', kind: 'social_media', title: 'x', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'weak' },
      { id: 'e2', kind: 'social_media', title: 'y', observedAt: new Date().toISOString(), languageIso: 'en', credibility: 'unknown' },
    ];
    const r = await DATA_QUALITY_MODE_APPLIES.source_credibility(ctx({
      evidence: { items } as unknown as BrainContext['evidence'],
    }));
    expect(r.verdict).toBe('flag');
  });
});

describe('cognitive', () => {
  it('dual_process escalates when both systems agree', async () => {
    const priors: Finding[] = [
      { modeId: 'a', category: 'logic', faculties: ['reasoning'], score: 0.8, confidence: 0.8, verdict: 'flag', rationale: 'r', evidence: ['src:1'], producedAt: Date.now() },
      { modeId: 'b', category: 'statistical', faculties: ['data_analysis'], score: 0.7, confidence: 0.8, verdict: 'flag', rationale: 'r', evidence: ['src:2'], producedAt: Date.now() },
    ];
    const r = await COGNITIVE_MODE_APPLIES.dual_process(ctx({ priorFindings: priors }));
    expect(r.verdict).toBe('escalate');
  });
  it('hindsight_check flags on post-hoc language', async () => {
    const priors: Finding[] = [
      { modeId: 'a', category: 'logic', faculties: ['reasoning'], score: 0.5, confidence: 0.7, verdict: 'flag', rationale: 'In retrospect this was obviously a red flag', evidence: [], producedAt: Date.now() },
    ];
    const r = await COGNITIVE_MODE_APPLIES.hindsight_check(ctx({ priorFindings: priors }));
    expect(r.verdict).toBe('flag');
  });
});

describe('typology', () => {
  it('ponzi_scheme inconclusive without yield + transactions', async () => {
    const r = await TYPOLOGY_MODE_APPLIES.ponzi_scheme(ctx());
    expect(r.verdict).toBe('inconclusive');
  });
  it('structuring detector flags sub-threshold band', async () => {
    const tx = synthTx(20, (i) => ({ amount: i < 12 ? 9500 : 500 }));
    const r = await structuringDetect(ctx({ evidence: { transactions: tx, reportingThreshold: 10_000 } }));
    expect(['flag', 'escalate']).toContain(r.verdict);
  });
  it('smurfing detector inconclusive on small n', async () => {
    const r = await smurfingDetect(ctx({ evidence: { transactions: [] } }));
    expect(r.verdict).toBe('inconclusive');
  });
});

describe('forensic extensions', () => {
  it('ubo_tree_walk flags high opaque share', async () => {
    const uboChain = [
      { from: 'Test', to: 'Shell-A', kind: 'entity', share: 0.6 },
      { from: 'Shell-A', to: 'Shell-B', kind: 'entity', share: 1.0 },
      { from: 'Test', to: 'Alice', kind: 'individual', share: 0.4 },
    ];
    const r = await uboTreeWalkApply(ctx({ evidence: { uboChain } }));
    expect(['flag', 'escalate']).toContain(r.verdict);
  });
  it('kill_chain clears with no transactions', async () => {
    const r = await killChainApply(ctx());
    expect(r.verdict).toBe('inconclusive');
  });
  it('narrative_coherence inconclusive without stated business', async () => {
    const r = await narrativeCoherenceApply(ctx());
    expect(r.verdict).toBe('inconclusive');
  });
});
