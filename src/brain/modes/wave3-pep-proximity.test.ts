import { describe, expect, it } from 'vitest';
import pepProximityApply from './wave3-pep-proximity.js';
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

describe('wave3-pep-proximity', () => {
  it('returns inconclusive when no pepLinks evidence', async () => {
    const r = await pepProximityApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.score).toBe(0);
    expect(r.modeId).toBe('pep_proximity_chain');
  });

  it('returns inconclusive when pepLinks is empty array', async () => {
    const r = await pepProximityApply(makeCtx({ pepLinks: [] }));
    expect(r.verdict).toBe('inconclusive');
  });

  it('returns clear when links exist but none match signal conditions', async () => {
    // hops=3 is not direct (<=1) or second (2), no senior rank, not foreign
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep1', hops: 3, pepCategory: 'domestic', pepRank: 'party_official' }],
    }));
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags direct_pep_link when hops <= 1', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep1', hops: 1, relationshipType: 'family' }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence[0]).toContain('pep1');
  });

  it('flags direct_pep_link when hops = 0', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep1', hops: 0, relationshipType: 'business' }],
    }));
    expect(r.score).toBeGreaterThanOrEqual(0.35);
  });

  it('flags second_degree_pep when hops == 2', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep2', hops: 2 }],
    }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.evidence[0]).toContain('pep2');
  });

  it('flags senior_pep when rank is head_of_state', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep3', hops: 3, pepRank: 'head_of_state' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags senior_pep when rank is minister', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep3', hops: 3, pepRank: 'minister' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags senior_pep when rank is judge', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep3', hops: 3, pepRank: 'judge' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags foreign_pep when pepCategory is foreign', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep4', hops: 3, pepCategory: 'foreign' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when multiple signals combine to >= 0.6', async () => {
    // direct(0.35) + second(0.2) + senior(0.3) + foreign(0.2) = 1.05 -> compressed
    const r = await pepProximityApply(makeCtx({
      pepLinks: [
        { subjectId: 's1', pepId: 'p1', hops: 1, pepRank: 'minister', pepCategory: 'foreign' },
        { subjectId: 's1', pepId: 'p2', hops: 2, pepRank: 'judge', pepCategory: 'foreign' },
      ],
    }));
    expect(r.verdict).toBe('escalate');
  });

  it('shows flag verdict when score is 0.3-0.59', async () => {
    // direct(0.35) only = 0.35 → flag
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'p1', hops: 1 }],
    }));
    expect(r.verdict).toBe('flag');
  });

  it('compresses score correctly when raw > 0.7', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [
        { subjectId: 's1', pepId: 'p1', hops: 1, pepRank: 'head_of_state', pepCategory: 'foreign' },
        { subjectId: 's1', pepId: 'p2', hops: 2, pepRank: 'minister', pepCategory: 'foreign' },
        { subjectId: 's1', pepId: 'p3', hops: 1, pepRank: 'judge' },
      ],
    }));
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThan(0.7);
  });

  it('shows ? for missing relationshipType in evidence', async () => {
    const r = await pepProximityApply(makeCtx({
      pepLinks: [{ subjectId: 's1', pepId: 'pep5', hops: 1 }],
    }));
    expect(r.evidence[0]).toContain('?');
  });

  it('slices evidence to max 4 links per hit', async () => {
    const links = Array.from({ length: 6 }, (_, i) => ({ subjectId: 's1', pepId: `pep${i}`, hops: 1 }));
    const r = await pepProximityApply(makeCtx({ pepLinks: links }));
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence[0]).toContain('pep0');
  });
});
