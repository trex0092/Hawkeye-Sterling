import { describe, expect, it } from 'vitest';
import type { BrainContext } from '../types.js';
import nestedDesignationApply from './wave3-nested-designation-match.js';

function makeCtx(evidence: Record<string, unknown> = {}, subject: Partial<BrainContext['subject']> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual', ...subject },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('nested_designation_match', () => {
  it('returns inconclusive when no ownershipPaths provided', async () => {
    const result = await nestedDesignationApply(makeCtx());
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.2);
    expect(result.modeId).toBe('nested_designation_match');
  });

  it('returns inconclusive when ownershipPaths is empty', async () => {
    const result = await nestedDesignationApply(makeCtx({ ownershipPaths: [] }));
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns clear when paths have no designated ancestors', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', cumulativeOwnershipPct: 60 },
      ],
    }));
    expect(result.verdict).toBe('clear');
    expect(result.confidence).toBe(0.4);
  });

  it('fires ofac_50_rule when cumulativeOwnershipPct >= 50', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 50, designationProgramme: 'OFAC' },
      ],
    }));
    // ofac_50_rule weight 0.5 => score 0.5 => flag (< 0.6 threshold for escalate)
    expect(result.verdict).toBe('flag');
    expect(result.rationale).toContain('ofac_50_rule');
  });

  it('fires eu_25_rule when 25 <= cumulativeOwnershipPct < 50', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 30 },
      ],
    }));
    expect(result.verdict).toBe('flag');
    expect(result.rationale).toContain('eu_25_rule');
  });

  it('does NOT fire ownership rules when cumulativeOwnershipPct < 25', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 20 },
      ],
    }));
    expect(result.rationale).not.toContain('ofac_50_rule');
    expect(result.rationale).not.toContain('eu_25_rule');
  });

  it('fires deep_designation_chain when hopCount >= 4', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 10, hopCount: 4 },
      ],
    }));
    expect(result.rationale).toContain('deep_designation_chain');
  });

  it('does NOT fire deep_designation_chain when hopCount < 4', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 60, hopCount: 3 },
      ],
    }));
    expect(result.rationale).not.toContain('deep_designation_chain');
  });

  it('does NOT fire deep_designation_chain when hopCount is undefined', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 60 },
      ],
    }));
    expect(result.rationale).not.toContain('deep_designation_chain');
  });

  it('skips path when designatedAncestorId is undefined', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', cumulativeOwnershipPct: 80, hopCount: 5 },
      ],
    }));
    // No designatedAncestorId => continue
    expect(result.verdict).toBe('clear');
    expect(result.rationale).not.toContain('ofac_50_rule');
    expect(result.rationale).not.toContain('deep_designation_chain');
  });

  it('escalates when multiple signals fire', async () => {
    // ofac_50_rule(0.5) + deep_designation_chain(0.2) = 0.7 => escalate
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 75, hopCount: 6, designationProgramme: 'OFAC' },
      ],
    }));
    expect(result.verdict).toBe('escalate');
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('applies diminishing returns for rawScore > 0.7', async () => {
    // Multiple paths each triggering ofac_50_rule
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 75, hopCount: 6 },
        { pathId: 'P2', rootEntityId: 'E2', designatedAncestorId: 'D2', cumulativeOwnershipPct: 60, hopCount: 5 },
      ],
    }));
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.verdict).toBe('escalate');
  });

  it('uses cumulativeOwnershipPct 0 as default when undefined', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1' },
      ],
    }));
    // own = 0, below 25
    expect(result.rationale).not.toContain('ofac_50_rule');
    expect(result.rationale).not.toContain('eu_25_rule');
  });

  it('includes designation programme in evidence when provided', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 55, designationProgramme: 'UNSCR' },
      ],
    }));
    expect(result.evidence[0]).toContain('UNSCR');
  });

  it('confidence increases with hits', async () => {
    const result = await nestedDesignationApply(makeCtx({
      ownershipPaths: [
        { pathId: 'P1', rootEntityId: 'E1', designatedAncestorId: 'D1', cumulativeOwnershipPct: 60, hopCount: 5 },
      ],
    }));
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
