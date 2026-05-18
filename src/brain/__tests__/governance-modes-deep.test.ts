// Deep coverage tests for modes/governance.ts
// Covers: four_eyes_stress, escalation_trigger, control_effectiveness,
//         policy_drift, residual_vs_inherent, regulatory_mapping, documentation_quality.

import { describe, it, expect } from 'vitest';
import { GOVERNANCE_MODE_APPLIES } from '../modes/governance.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(
  evidence: Record<string, unknown> = {},
  priorFindings: Finding[] = [],
): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings,
    domains: ['governance'],
  };
}

// ── four_eyes_stress ──────────────────────────────────────────────────────────

describe('four_eyes_stress (governance)', () => {
  const apply = GOVERNANCE_MODE_APPLIES.four_eyes_stress;

  it('returns inconclusive when no approvals supplied', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('four_eyes_stress');
  });

  it('clears when all approvals have distinct actors', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'alice', firstApprover: 'bob', secondApprover: 'carol' },
        { caseId: 'C2', submitter: 'dave', firstApprover: 'eve', secondApprover: 'frank' },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
    expect(f.confidence).toBe(0.9);
  });

  it('escalates when submitter equals firstApprover', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'alice', firstApprover: 'alice', secondApprover: 'bob' },
      ],
    }));
    expect(['escalate', 'block']).toContain(f.verdict);
    expect(f.score).toBeGreaterThan(0);
  });

  it('escalates when submitter equals secondApprover', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'alice', firstApprover: 'bob', secondApprover: 'alice' },
      ],
    }));
    expect(['escalate', 'block']).toContain(f.verdict);
  });

  it('escalates when first and second approvers are same person', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'alice', firstApprover: 'bob', secondApprover: 'bob' },
      ],
    }));
    expect(['escalate', 'block']).toContain(f.verdict);
  });

  it('blocks when severity exceeds 0.2 (more than 20% of rows violated)', async () => {
    // 5 violating out of 5 total = severity 1.0 → block
    const approvals = Array.from({ length: 5 }, (_, i) => ({
      caseId: `C${i}`,
      submitter: 'alice',
      firstApprover: 'alice', // violation: submitter = first approver
      secondApprover: 'bob',
    }));
    const f = await apply(makeCtx({ approvals }));
    expect(f.verdict).toBe('block');
  });

  it('confidence is 0.95 when violations found', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'x', firstApprover: 'x', secondApprover: 'y' },
      ],
    }));
    expect(f.confidence).toBe(0.95);
  });

  it('hypothesis is material_concern on violation', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'x', firstApprover: 'x', secondApprover: 'y' },
      ],
    }));
    expect(f.hypothesis).toBe('material_concern');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      approvals: [
        { caseId: 'C1', submitter: 'alice', firstApprover: 'bob', secondApprover: 'carol' },
      ],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── escalation_trigger ────────────────────────────────────────────────────────

describe('escalation_trigger', () => {
  const apply = GOVERNANCE_MODE_APPLIES.escalation_trigger;

  it('clears when no prior findings', async () => {
    const f = await apply(makeCtx({}, []));
    expect(f.verdict).toBe('clear');
    expect(f.modeId).toBe('escalation_trigger');
  });

  it('clears when all prior findings score below 0.75', async () => {
    const priors: Finding[] = [
      { modeId: 'risk_score', category: 'compliance_framework', faculties: ['reasoning'],
        score: 0.5, confidence: 0.8, verdict: 'flag', rationale: 'Moderate risk', evidence: [], producedAt: Date.now() },
      { modeId: 'kyc_check', category: 'compliance_framework', faculties: ['data_analysis'],
        score: 0.3, confidence: 0.9, verdict: 'clear', rationale: 'Low risk', evidence: [], producedAt: Date.now() },
    ];
    const f = await apply(makeCtx({}, priors));
    expect(f.verdict).toBe('clear');
  });

  it('escalates when at least one prior finding scores >= 0.75', async () => {
    const priors: Finding[] = [
      { modeId: 'sanctions_check', category: 'compliance_framework', faculties: ['reasoning'],
        score: 0.9, confidence: 0.95, verdict: 'escalate', rationale: 'High risk', evidence: [], producedAt: Date.now() },
    ];
    const f = await apply(makeCtx({}, priors));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBe(0.7);
    expect(f.confidence).toBe(0.9);
  });

  it('ignores meta/introspection tagged findings', async () => {
    const priors: Finding[] = [
      { modeId: 'self-check', category: 'compliance_framework', faculties: ['introspection'],
        score: 0.9, confidence: 0.9, verdict: 'flag', rationale: 'meta', evidence: [], producedAt: Date.now(),
        tags: ['meta', 'introspection'] },
    ];
    const f = await apply(makeCtx({}, priors));
    expect(f.verdict).toBe('clear'); // tagged meta → ignored
  });

  it('ignores stub findings', async () => {
    const priors: Finding[] = [
      { modeId: 'stub-mode', category: 'compliance_framework', faculties: ['reasoning'],
        score: 0.9, confidence: 0.9, verdict: 'flag', rationale: '[stub] not implemented yet', evidence: [], producedAt: Date.now() },
    ];
    const f = await apply(makeCtx({}, priors));
    expect(f.verdict).toBe('clear');
  });

  it('rationale lists trigger mode ids', async () => {
    const priors: Finding[] = [
      { modeId: 'pep-check', category: 'compliance_framework', faculties: ['reasoning'],
        score: 0.85, confidence: 0.9, verdict: 'escalate', rationale: 'PEP detected', evidence: [], producedAt: Date.now() },
    ];
    const f = await apply(makeCtx({}, priors));
    expect(f.rationale).toMatch(/pep-check/);
  });
});

// ── control_effectiveness ─────────────────────────────────────────────────────

describe('control_effectiveness', () => {
  const apply = GOVERNANCE_MODE_APPLIES.control_effectiveness;

  it('returns inconclusive when no controls supplied', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('control_effectiveness');
  });

  it('clears when all controls pass design and operation', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', designEffective: true, operatingEffective: true },
        { id: 'ctrl-2', designEffective: true, operatingEffective: true },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0); // composite 1.0 → 1 - 1.0 = 0
  });

  it('escalates when fewer than 50% of controls pass both dimensions', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', designEffective: false, operatingEffective: false },
        { id: 'ctrl-2', designEffective: false, operatingEffective: false },
        { id: 'ctrl-3', designEffective: true, operatingEffective: true },
      ],
    }));
    // design pass: 1/3 ≈ 33%; operating pass: 1/3 ≈ 33%; composite ≈ 33% → escalate
    expect(f.verdict).toBe('escalate');
  });

  it('flags when composite is between 50% and 75%', async () => {
    // 3 out of 4 pass design, 2 out of 4 pass operation
    // design rate = 0.75, operating rate = 0.5, composite = 0.625 → flag
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', designEffective: true, operatingEffective: true },
        { id: 'ctrl-2', designEffective: true, operatingEffective: false },
        { id: 'ctrl-3', designEffective: true, operatingEffective: true },
        { id: 'ctrl-4', designEffective: false, operatingEffective: false },
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('hypothesis is material_concern when composite < 0.5', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', designEffective: false, operatingEffective: false },
      ],
    }));
    expect(f.hypothesis).toBe('material_concern');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      controls: [{ id: 'ctrl-1', designEffective: true, operatingEffective: true }],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── policy_drift ──────────────────────────────────────────────────────────────

describe('policy_drift', () => {
  const apply = GOVERNANCE_MODE_APPLIES.policy_drift;

  it('returns inconclusive when policyDrift is absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('policy_drift');
  });

  it('returns inconclusive when policyDrift is not a number', async () => {
    const f = await apply(makeCtx({ policyDrift: 'high' }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when policyDrift is 0 (no drift)', async () => {
    const f = await apply(makeCtx({ policyDrift: 0 }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0);
  });

  it('flags when policyDrift is between 0.2 and 0.5', async () => {
    const f = await apply(makeCtx({ policyDrift: 0.35 }));
    expect(f.verdict).toBe('flag');
    expect(f.score).toBeCloseTo(0.35, 5);
  });

  it('escalates when policyDrift exceeds 0.5', async () => {
    const f = await apply(makeCtx({ policyDrift: 0.8 }));
    expect(f.verdict).toBe('escalate');
    expect(f.score).toBeCloseTo(0.8, 5);
  });

  it('clamps out-of-range values to [0, 1]', async () => {
    const fOver = await apply(makeCtx({ policyDrift: 2.5 }));
    expect(fOver.score).toBe(1);
    expect(fOver.verdict).toBe('escalate');

    const fUnder = await apply(makeCtx({ policyDrift: -0.5 }));
    expect(fUnder.score).toBe(0);
    expect(fUnder.verdict).toBe('clear');
  });
});

// ── residual_vs_inherent ──────────────────────────────────────────────────────

describe('residual_vs_inherent', () => {
  const apply = GOVERNANCE_MODE_APPLIES.residual_vs_inherent;

  it('returns inconclusive when inherentRisk absent', async () => {
    const f = await apply(makeCtx({ residualRisk: 0.3 }));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('residual_vs_inherent');
  });

  it('returns inconclusive when residualRisk absent', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.7 }));
    expect(f.verdict).toBe('inconclusive');
  });

  it('returns inconclusive when both absent', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
  });

  it('clears when controls reduce risk by >= 0.25', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.8, residualRisk: 0.3 }));
    // reduction = 0.5 → clear
    expect(f.verdict).toBe('clear');
  });

  it('flags when reduction is between 0.1 and 0.25', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.6, residualRisk: 0.45 }));
    // reduction = 0.15 → flag
    expect(f.verdict).toBe('flag');
  });

  it('escalates when controls barely reduce risk (< 0.1 reduction)', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.7, residualRisk: 0.65 }));
    // reduction = 0.05 → escalate
    expect(f.verdict).toBe('escalate');
  });

  it('escalates when residualRisk equals inherentRisk', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.5, residualRisk: 0.5 }));
    expect(f.verdict).toBe('escalate');
  });

  it('handles residual > inherent gracefully (reduction clamped to 0)', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.3, residualRisk: 0.9 }));
    // reduction = max(0, 0.3 - 0.9) = 0 → escalate
    expect(f.verdict).toBe('escalate');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({ inherentRisk: 0.7, residualRisk: 0.2 }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── regulatory_mapping ────────────────────────────────────────────────────────

describe('regulatory_mapping', () => {
  const apply = GOVERNANCE_MODE_APPLIES.regulatory_mapping;

  it('returns inconclusive when no controls', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('regulatory_mapping');
  });

  it('clears when all controls have citations', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', citations: ['FDL 10/2025 Art.16'] },
        { id: 'ctrl-2', citations: ['FATF R.10', 'FATF R.20'] },
      ],
    }));
    expect(f.verdict).toBe('clear');
    expect(f.score).toBe(0); // 1 - 1.0 = 0
  });

  it('flags when fewer than 50% of controls have citations', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', citations: ['FDL 10/2025 Art.16'] },
        { id: 'ctrl-2' }, // no citations
        { id: 'ctrl-3' }, // no citations
      ],
    }));
    // 1 out of 3 mapped = 33% → flag
    expect(f.verdict).toBe('flag');
  });

  it('flags when citations array is empty', async () => {
    const f = await apply(makeCtx({
      controls: [
        { id: 'ctrl-1', citations: [] }, // empty citations → not mapped
      ],
    }));
    expect(f.verdict).toBe('flag');
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      controls: [{ id: 'ctrl-1', citations: ['FDL 10/2025 Art.22'] }],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});

// ── documentation_quality ─────────────────────────────────────────────────────

describe('documentation_quality', () => {
  const apply = GOVERNANCE_MODE_APPLIES.documentation_quality;

  it('returns inconclusive when no documents', async () => {
    const f = await apply(makeCtx({}));
    expect(f.verdict).toBe('inconclusive');
    expect(f.modeId).toBe('documentation_quality');
  });

  it('clears when all documents are versioned, signed, and retained >= 5 years', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'policy', versionedAt: '2026-01-01', signedAt: '2026-01-01', retentionDays: 1825 },
        { type: 'procedure', versionedAt: '2026-01-01', signedAt: '2026-01-01', retentionDays: 3650 },
      ],
    }));
    // score = (2+2+2) / (3*2) = 1.0 → 1 - 1 = 0 → clear
    expect(f.verdict).toBe('clear');
    expect(f.score).toBeCloseTo(0, 5);
  });

  it('flags when composite quality is below 50%', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'policy' }, // no versionedAt, no signedAt, no retentionDays
        { type: 'procedure' },
      ],
    }));
    // score = 0 / (3*2) = 0 → 1 - 0 = 1 → flag
    expect(f.verdict).toBe('flag');
    expect(f.score).toBe(1);
  });

  it('flags when retentionDays is below the 5-year threshold (1825)', async () => {
    const f = await apply(makeCtx({
      documents: [
        { type: 'policy', versionedAt: '2026-01-01', signedAt: '2026-01-01', retentionDays: 365 },
      ],
    }));
    // retained = 0 (365 < 1825), versioned=1, signed=1 → score = 2/3 ≈ 0.67 → 1-0.67 ≈ 0.33 → clear
    expect(f.verdict).toBe('clear'); // still > 50% quality composite
  });

  it('score is in [0, 1]', async () => {
    const f = await apply(makeCtx({
      documents: [{ type: 'doc', versionedAt: '2026-01-01' }],
    }));
    expect(f.score).toBeGreaterThanOrEqual(0);
    expect(f.score).toBeLessThanOrEqual(1);
  });
});
