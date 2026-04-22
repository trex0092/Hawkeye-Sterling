import { describe, it, expect } from 'vitest';
import {
  quickScreen,
  severityFromScore,
  type QuickScreenCandidate,
  type QuickScreenSubject,
} from '../quick-screen.js';

const CANDIDATES: QuickScreenCandidate[] = [
  {
    listId: 'ofac_sdn',
    listRef: 'OFAC-SDN-28841',
    name: 'Dmitri Sergeyevich Volkov',
    aliases: ['Dmitri Volkov', 'D. Volkov'],
    entityType: 'individual',
    jurisdiction: 'RU',
    programs: ['E.O. 14024'],
  },
  {
    listId: 'eu_consolidated',
    listRef: 'EU-CFSP-2014/145',
    name: 'VOLKOV, D.',
    entityType: 'individual',
    jurisdiction: 'RU',
    programs: ['CFSP 2014/145'],
  },
  {
    listId: 'ofac_sdn',
    listRef: 'OFAC-SDN-00001',
    name: 'Kim Jong Un',
    entityType: 'individual',
    jurisdiction: 'KP',
  },
];

describe('severityFromScore', () => {
  it('returns clear when no hits', () => {
    expect(severityFromScore(0, 0)).toBe('clear');
    expect(severityFromScore(90, 0)).toBe('clear');
  });
  it('bucketizes above zero hits correctly', () => {
    expect(severityFromScore(55, 1)).toBe('low');
    expect(severityFromScore(70, 1)).toBe('medium');
    expect(severityFromScore(85, 1)).toBe('high');
    expect(severityFromScore(95, 1)).toBe('critical');
    expect(severityFromScore(100, 1)).toBe('critical');
  });
});

describe('quickScreen', () => {
  const clock = () => 1_000_000;
  const now = () => '2026-04-22T10:00:00.000Z';

  it('returns clear with no hits when subject does not match any candidate', () => {
    const subject: QuickScreenSubject = { name: 'Jane Smith', entityType: 'individual' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    expect(result.hits).toHaveLength(0);
    expect(result.severity).toBe('clear');
    expect(result.topScore).toBe(0);
    expect(result.listsChecked).toBe(2);
    expect(result.candidatesChecked).toBe(3);
    expect(result.generatedAt).toBe('2026-04-22T10:00:00.000Z');
  });

  it('flags exact-name matches at the highest severity', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Sergeyevich Volkov' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.severity).toBe('critical');
    expect(result.topScore).toBe(100);
    expect(result.hits[0]?.listRef).toBe('OFAC-SDN-28841');
  });

  it('matches via alias when primary name differs', () => {
    const subject: QuickScreenSubject = { name: 'D. Volkov' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    const ofacHit = result.hits.find((h) => h.listRef === 'OFAC-SDN-28841');
    expect(ofacHit).toBeDefined();
    expect(ofacHit?.matchedAlias).toBe('D. Volkov');
  });

  it('detects phonetic agreement for transliterated variants', () => {
    const subject: QuickScreenSubject = { name: 'Dmitry Volkov' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    const ofacHit = result.hits.find((h) => h.listRef === 'OFAC-SDN-28841');
    expect(ofacHit).toBeDefined();
    expect(ofacHit?.phoneticAgreement).toBe(true);
  });

  it('hits come back sorted by descending score', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i - 1]!.score).toBeGreaterThanOrEqual(result.hits[i]!.score);
    }
  });

  it('respects maxHits truncation', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov' };
    const result = quickScreen(subject, CANDIDATES, { clock, now, maxHits: 1 });
    expect(result.hits.length).toBeLessThanOrEqual(1);
  });

  it('respects scoreThreshold', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov' };
    const strict = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.99 });
    const loose = quickScreen(subject, CANDIDATES, { clock, now, scoreThreshold: 0.5 });
    expect(loose.hits.length).toBeGreaterThanOrEqual(strict.hits.length);
  });

  it('records the list count as distinct listIds seen', () => {
    const subject: QuickScreenSubject = { name: 'Nobody' };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    expect(result.listsChecked).toBe(2);
  });

  it('durationMs is non-negative and uses injected clock', () => {
    let t = 0;
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov' };
    const result = quickScreen(subject, CANDIDATES, {
      clock: () => {
        const v = t;
        t += 5;
        return v;
      },
      now,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reason strings include jurisdiction and entity-type when they agree', () => {
    const subject: QuickScreenSubject = {
      name: 'Dmitri Volkov',
      entityType: 'individual',
      jurisdiction: 'RU',
    };
    const result = quickScreen(subject, CANDIDATES, { clock, now });
    const top = result.hits[0];
    expect(top?.reason).toMatch(/jurisdiction RU/);
    expect(top?.reason).toMatch(/entity type individual/);
  });

  it('ignores empty subject aliases without throwing', () => {
    const subject: QuickScreenSubject = { name: 'Dmitri Volkov', aliases: ['', '  '] };
    expect(() => quickScreen(subject, CANDIDATES, { clock, now })).not.toThrow();
  });
});
