import { describe, it, expect } from 'vitest';
import { run, depthOf, totalModeCount } from './engine.js';
import { countModesWithRealApply } from './reasoning-modes.js';

describe('engine.run', () => {
  it('produces a verdict with chain on minimal input', async () => {
    const v = await run({ subject: { name: 'Acme Ltd', type: 'entity' } });
    expect(v.runId).toBeDefined();
    expect(v.findings.length).toBeGreaterThan(0);
    expect(v.chain.length).toBeGreaterThan(0);
    expect(['clear','flag','escalate','inconclusive','block']).toContain(v.outcome);
  });

  it('elevates verdict on high-risk payload', async () => {
    const v = await run({
      subject: { name: 'Test Subject', type: 'entity', jurisdiction: 'KP' },
      evidence: {
        freeText: 'Linked to terrorist financing and designated terrorist groups; corruption allegations; accused of money laundering via shell companies.',
        transactions: Array.from({ length: 20 }, (_, i) => ({
          amount: 9800, timestamp: Date.UTC(2025, 0, 1) + i * 3600_000,
          direction: 'in', counterparty: `CP${i % 3}`,
        })),
      },
    });
    expect(['flag','escalate','block']).toContain(v.outcome);
    expect(v.aggregateScore).toBeGreaterThan(0);
  });

  it('depthOf reports faculties touched', async () => {
    const v = await run({ subject: { name: 'Acme', type: 'entity' } });
    const d = depthOf(v);
    expect(d.facultyCount).toBeGreaterThan(0);
    expect(d.modesRun).toBe(v.findings.length);
  });

  it('registry reports ≥50 real implementations', () => {
    expect(countModesWithRealApply()).toBeGreaterThanOrEqual(50);
    expect(totalModeCount()).toBeGreaterThanOrEqual(270);
  });
});
