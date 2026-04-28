import { describe, it, expect } from 'vitest';
import { COMMON_SENSE_RULES, rulesForTopic } from '../mlro-common-sense.js';
import { ALL_MLRO_TOPICS } from '../mlro-question-classifier.js';

describe('mlro-common-sense — rule catalogue integrity', () => {
  it('every rule has a unique id', () => {
    const ids = COMMON_SENSE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rule binds to a known MlroTopic', () => {
    const topicSet = new Set<string>(ALL_MLRO_TOPICS);
    const orphans = COMMON_SENSE_RULES.filter((r) => !topicSet.has(r.topic));
    expect(orphans).toEqual([]);
  });

  it('every rule has a non-empty doctrineAnchor citation', () => {
    const missing = COMMON_SENSE_RULES.filter((r) => !r.doctrineAnchor || r.doctrineAnchor.length < 3);
    expect(missing).toEqual([]);
  });

  it('rule text never exceeds 200 chars (UI truncation budget)', () => {
    const oversize = COMMON_SENSE_RULES.filter((r) => r.rule.length > 200);
    expect(oversize).toEqual([]);
  });
});

describe('mlro-common-sense — rulesForTopic', () => {
  it('respects the limit parameter', () => {
    const all = rulesForTopic('cdd', 999);
    const capped = rulesForTopic('cdd', 2);
    expect(capped.length).toBeLessThanOrEqual(2);
    expect(capped.length).toBeLessThanOrEqual(all.length);
  });

  it('returns rules belonging to the requested topic', () => {
    const out = rulesForTopic('vasp_crypto', 5);
    for (const r of out) expect(r.topic).toBe('vasp_crypto');
  });
});
