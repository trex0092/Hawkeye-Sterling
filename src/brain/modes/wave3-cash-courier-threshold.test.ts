import { describe, expect, it } from 'vitest';
import cashCourierThresholdApply from './wave3-cash-courier-threshold.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-cash-courier-threshold', () => {
  it('returns inconclusive when no cashMovements supplied', async () => {
    const r = await cashCourierThresholdApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('cash_courier_threshold');
  });

  it('returns inconclusive when cashMovements is empty', async () => {
    const r = await cashCourierThresholdApply(makeCtx({ cashMovements: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when no signals fire', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv1', amountAed: 10000, carrierId: 'C1', declaredAtBorder: true },
      ],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags sub_threshold_clustering when >= 2 movements in AED 50-60k band', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv2', amountAed: 55000 },
        { movementId: 'mv3', amountAed: 52000 },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence.join(' ')).toContain('mv2');
  });

  it('does not flag sub_threshold_clustering with only 1 near-threshold movement', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [{ movementId: 'mv4', amountAed: 55000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not count amounts below 50k in the structuring band', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv5', amountAed: 49999 },
        { movementId: 'mv6', amountAed: 49000 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('does not count amounts >= 60k in the structuring band', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv7', amountAed: 60000, declaredAtBorder: true },
        { movementId: 'mv8', amountAed: 70000, declaredAtBorder: true },
      ],
    }));
    // these are >= 60k and declared → undeclared_cross_border does NOT fire; band check also excludes >= 60k
    expect(r.score).toBe(0);
  });

  it('flags undeclared_cross_border when >= 1 movement >= 60k and not declared', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv9', amountAed: 60000, declaredAtBorder: false },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence.join(' ')).toContain('mv9');
  });

  it('does not flag undeclared when movement is declared', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv10', amountAed: 60000, declaredAtBorder: true },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag undeclared when amount < 60k', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv11', amountAed: 59999, declaredAtBorder: false },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('flags carrier_concentration when carrier makes >= 4 runs', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv12', amountAed: 1000, carrierId: 'CARRIER_X' },
        { movementId: 'mv13', amountAed: 1000, carrierId: 'CARRIER_X' },
        { movementId: 'mv14', amountAed: 1000, carrierId: 'CARRIER_X' },
        { movementId: 'mv15', amountAed: 1000, carrierId: 'CARRIER_X' },
      ],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag carrier when < 4 runs', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv16', amountAed: 1000, carrierId: 'CARRIER_Y' },
        { movementId: 'mv17', amountAed: 1000, carrierId: 'CARRIER_Y' },
        { movementId: 'mv18', amountAed: 1000, carrierId: 'CARRIER_Y' },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('ignores movements with no carrierId for carrier concentration', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv19' },
        { movementId: 'mv20' },
        { movementId: 'mv21' },
        { movementId: 'mv22' },
      ],
    }));
    // No carrierId → not counted
    expect(r.score).toBe(0);
  });

  it('escalates when multiple signals fire', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv23', amountAed: 55000 },
        { movementId: 'mv24', amountAed: 52000 },
        { movementId: 'mv25', amountAed: 65000, declaredAtBorder: false },
      ],
    }));
    // sub_threshold_clustering (0.4) + undeclared_cross_border (0.45) = 0.85 → escalate
    expect(r.verdict).toBe('escalate');
  });

  it('flags verdict when score >= 0.3 but < 0.6', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'mv26', amountAed: 55000 },
        { movementId: 'mv27', amountAed: 52000 },
      ],
    }));
    // sub_threshold_clustering = 0.4 → flag (>= 0.3)
    expect(r.verdict).toBe('flag');
  });

  it('includes up to 4 movement IDs in evidence for sub_threshold_clustering', async () => {
    const r = await cashCourierThresholdApply(makeCtx({
      cashMovements: [
        { movementId: 'A', amountAed: 55000 },
        { movementId: 'B', amountAed: 52000 },
        { movementId: 'C', amountAed: 53000 },
        { movementId: 'D', amountAed: 54000 },
        { movementId: 'E', amountAed: 51000 },
      ],
    }));
    expect(r.evidence.join(' ')).toContain('A');
  });
});
