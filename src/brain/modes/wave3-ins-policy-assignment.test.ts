import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import insPolicyAssignmentApply from './wave3-ins-policy-assignment.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('ins_policy_assignment', () => {
  it('returns inconclusive when no policyAssignments provided', async () => {
    const result = await insPolicyAssignmentApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('ins_policy_assignment');
  });

  it('returns inconclusive when policyAssignments is empty', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({ policyAssignments: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'spouse', cddOnAssigneeCompleted: true, policyAgeAtAssignmentDays: 200 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires no_assignee_cdd when cddOnAssigneeCompleted is false', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', cddOnAssigneeCompleted: false },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire no_assignee_cdd when cddOnAssigneeCompleted is true', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.rationale).not.toContain('no_assignee_cdd');
  });

  it('fires unrelated_below_fair_value when unrelated + discount >= 50%', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'unrelated', policyValueAed: 100000, considerationPaidAed: 40000 },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires unrelated_discount when unrelated + 20% <= discount < 50%', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'unrelated', policyValueAed: 100000, considerationPaidAed: 70000 },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does NOT fire discount signal when discount < 20%', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'unrelated', policyValueAed: 100000, considerationPaidAed: 90000 },
      ],
    }));
    expect(result.rationale).not.toContain('unrelated_discount');
    expect(result.rationale).not.toContain('unrelated_below_fair_value');
  });

  it('does NOT fire discount signal for non-unrelated assignee', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'spouse', policyValueAed: 100000, considerationPaidAed: 40000 },
      ],
    }));
    expect(result.rationale).not.toContain('unrelated_below_fair_value');
    expect(result.rationale).not.toContain('unrelated_discount');
  });

  it('discount is 0 when policyValueAed is 0', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeRelationship: 'unrelated', policyValueAed: 0, considerationPaidAed: 0 },
      ],
    }));
    // discount = 0, below 20% threshold
    expect(result.rationale).not.toContain('unrelated_discount');
  });

  it('fires pep_assignee when assigneeIsPep is true', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeIsPep: true, cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires high_risk_jurisdiction_assignee when assigneeJurisdictionFatfHighRisk is true', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', assigneeJurisdictionFatfHighRisk: true, assigneeJurisdiction: 'IR', cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThan(0);
  });

  it('fires quick_flip_assignment when policyAgeAtAssignmentDays < 90', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', policyAgeAtAssignmentDays: 30, cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.verdict).toBe('flag');
  });

  it('does NOT fire quick_flip_assignment when policyAgeAtAssignmentDays >= 90', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', policyAgeAtAssignmentDays: 90, cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.rationale).not.toContain('quick_flip_assignment');
  });

  it('does NOT fire quick_flip when policyAgeAtAssignmentDays is undefined', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', cddOnAssigneeCompleted: true },
      ],
    }));
    expect(result.rationale).not.toContain('quick_flip_assignment');
  });

  it('uses assignmentId for ref when present', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { assignmentId: 'A99', cddOnAssigneeCompleted: false },
      ],
    }));
    expect(result.evidence).toContain('A99');
  });

  it('uses policyId as fallback when assignmentId absent', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P99', cddOnAssigneeCompleted: false },
      ],
    }));
    expect(result.evidence).toContain('P99');
  });

  it('confidence increases with multiple hits', async () => {
    const result = await insPolicyAssignmentApply(makeCtx({
      policyAssignments: [
        { policyId: 'P1', assignmentId: 'A1', cddOnAssigneeCompleted: false, assigneeIsPep: true, policyAgeAtAssignmentDays: 10 },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
