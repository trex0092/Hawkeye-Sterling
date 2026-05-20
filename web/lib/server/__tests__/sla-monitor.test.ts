import { describe, it, expect } from 'vitest';
import { classifyCasesBySla, formatSlaAlert, type SlaCaseShape } from '../sla-monitor';

const NOW = new Date('2026-05-20T12:00:00.000Z');

function mk(
  id: string,
  riskCategory: SlaCaseShape['riskCategory'],
  deadlineHoursFromNow: number,
  overrides: Partial<SlaCaseShape> = {},
): SlaCaseShape {
  return {
    caseId: id,
    subjectName: `Subject ${id}`,
    riskCategory,
    status: 'open',
    slaDeadline: new Date(NOW.getTime() + deadlineHoursFromNow * 3600_000).toISOString(),
    ...overrides,
  };
}

describe('classifyCasesBySla', () => {
  it('buckets breached vs approaching vs out-of-window for CRITICAL/HIGH cases', () => {
    const cases = [
      mk('A', 'CRITICAL', -24),  // 24h past deadline → breached
      mk('B', 'HIGH', -1),       // 1h past deadline → breached
      mk('C', 'CRITICAL', 12),   // 12h until deadline → approaching
      mk('D', 'HIGH', 47.5),     // 47.5h → approaching (inside 48h window)
      mk('E', 'HIGH', 100),      // outside window → skipped
    ];
    const r = classifyCasesBySla(cases, NOW);
    expect(r.breached.map((b) => b.case_.caseId)).toEqual(['A', 'B']);
    expect(r.approaching.map((a) => a.case_.caseId)).toEqual(['C', 'D']);
    expect(r.skipped).toBe(1);
  });

  it('skips closed cases', () => {
    const r = classifyCasesBySla([mk('A', 'CRITICAL', -24, { status: 'closed' })], NOW);
    expect(r.breached).toEqual([]);
    expect(r.approaching).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it('skips MEDIUM and LOW by default (only CRITICAL/HIGH alert)', () => {
    const r = classifyCasesBySla([
      mk('M', 'MEDIUM', -24),
      mk('L', 'LOW', -24),
    ], NOW);
    expect(r.breached).toEqual([]);
    expect(r.skipped).toBe(2);
  });

  it('honours custom alertCategories', () => {
    const r = classifyCasesBySla(
      [mk('M', 'MEDIUM', -24), mk('L', 'LOW', -24)],
      NOW,
      { alertCategories: ['MEDIUM', 'LOW'] },
    );
    expect(r.breached.length).toBe(2);
  });

  it('respects custom approachWindowHours', () => {
    const cases = [mk('A', 'CRITICAL', 23), mk('B', 'CRITICAL', 25)];
    const r24 = classifyCasesBySla(cases, NOW, { approachWindowHours: 24 });
    expect(r24.approaching.map((a) => a.case_.caseId)).toEqual(['A']);
    expect(r24.skipped).toBe(1);
  });

  it('skips cases with breachLogged already set by default', () => {
    const r = classifyCasesBySla(
      [mk('A', 'CRITICAL', -24, { breachLogged: true })],
      NOW,
    );
    expect(r.breached).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it('honours skipAlreadyBreached: false', () => {
    const r = classifyCasesBySla(
      [mk('A', 'CRITICAL', -24, { breachLogged: true })],
      NOW,
      { skipAlreadyBreached: false },
    );
    expect(r.breached.length).toBe(1);
  });

  it('skips cases with malformed slaDeadline (defensive)', () => {
    const cases = [
      mk('A', 'CRITICAL', 0, { slaDeadline: 'not-a-date' }),
      mk('B', 'CRITICAL', -24),
    ];
    const r = classifyCasesBySla(cases, NOW);
    expect(r.breached.map((b) => b.case_.caseId)).toEqual(['B']);
    expect(r.skipped).toBe(1);
  });

  it('sorts breached worst-overdue-first', () => {
    const r = classifyCasesBySla([
      mk('A', 'CRITICAL', -24),
      mk('B', 'CRITICAL', -100),
      mk('C', 'CRITICAL', -1),
    ], NOW);
    expect(r.breached.map((b) => b.case_.caseId)).toEqual(['B', 'A', 'C']);
  });

  it('sorts approaching nearest-deadline-first', () => {
    const r = classifyCasesBySla([
      mk('A', 'CRITICAL', 47),
      mk('B', 'CRITICAL', 1),
      mk('C', 'CRITICAL', 24),
    ], NOW);
    expect(r.approaching.map((a) => a.case_.caseId)).toEqual(['B', 'C', 'A']);
  });

  it('returns hoursOverdue and hoursRemaining with the right sign', () => {
    const r = classifyCasesBySla([
      mk('A', 'CRITICAL', -3),   // 3h overdue
      mk('B', 'CRITICAL', 5),    // 5h remaining
    ], NOW);
    expect(r.breached[0]!.hoursOverdue).toBeCloseTo(3, 5);
    expect(r.approaching[0]!.hoursRemaining).toBeCloseTo(5, 5);
  });

  it('treats deadline exactly at "now" as breached (boundary)', () => {
    const r = classifyCasesBySla([mk('A', 'CRITICAL', 0)], NOW);
    expect(r.breached.length).toBe(1);
    expect(r.approaching.length).toBe(0);
  });

  it('returns empty buckets for an empty input', () => {
    const r = classifyCasesBySla([], NOW);
    expect(r).toEqual({ breached: [], approaching: [], skipped: 0 });
  });
});

describe('formatSlaAlert', () => {
  it('renders breached + approaching sections with counts', () => {
    const cases = [
      mk('A', 'CRITICAL', -24),
      mk('B', 'HIGH', 12),
    ];
    const cls = classifyCasesBySla(cases, NOW);
    const out = formatSlaAlert(cls, NOW);
    expect(out.totalBreached).toBe(1);
    expect(out.totalApproaching).toBe(1);
    expect(out.text).toContain('IMMEDIATE ACTION REQUIRED');
    expect(out.text).toContain('APPROACHING DEADLINE');
    expect(out.text).toContain('A  Subject A  [CRITICAL]');
    expect(out.text).toContain('B  Subject B  [HIGH]');
    expect(out.detectedAt).toBe(NOW.toISOString());
  });

  it('omits the breached section when there are no breaches', () => {
    const cls = classifyCasesBySla([mk('A', 'CRITICAL', 24)], NOW);
    const out = formatSlaAlert(cls, NOW);
    expect(out.text).not.toContain('IMMEDIATE ACTION REQUIRED');
    expect(out.text).toContain('APPROACHING DEADLINE');
  });

  it('omits the approaching section when there are none approaching', () => {
    const cls = classifyCasesBySla([mk('A', 'CRITICAL', -24)], NOW);
    const out = formatSlaAlert(cls, NOW);
    expect(out.text).toContain('IMMEDIATE ACTION REQUIRED');
    expect(out.text).not.toContain('APPROACHING DEADLINE');
  });

  it('truncates each section to the sampleSize and notes the remainder', () => {
    // 12 breached + 12 approaching with sampleSize=3
    const breachedCases = Array.from({ length: 12 }, (_, i) => mk(`b${i}`, 'CRITICAL', -1 - i));
    const approachingCases = Array.from({ length: 12 }, (_, i) => mk(`a${i}`, 'CRITICAL', 1 + i));
    const cls = classifyCasesBySla([...breachedCases, ...approachingCases], NOW);
    const out = formatSlaAlert(cls, NOW, 3);
    expect(out.text).toContain('and 9 more'); // 12 - 3 = 9 in each section
  });

  it('produces a sensible header even with empty input', () => {
    const cls = classifyCasesBySla([], NOW);
    const out = formatSlaAlert(cls, NOW);
    expect(out.totalBreached).toBe(0);
    expect(out.totalApproaching).toBe(0);
    expect(out.text).toContain('HAWKEYE STERLING');
  });
});
