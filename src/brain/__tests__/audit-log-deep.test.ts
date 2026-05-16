// Deep coverage tests for registry/audit-log.ts
// Covers: AuditLogStore.append(), verify(), query() compound filters,
//         setFeedback() chain re-hash, snapshot/fromSnapshot, countCompletionDefectsBySection,
//         persistedSourceFromChunk(), ESCALATING_VERDICTS derivation.

import { describe, it, expect } from 'vitest';
import {
  AuditLogStore,
  persistedSourceFromChunk,
  type AuditEntryInput,
  type UserFeedback,
} from '../registry/audit-log.js';
import { buildSeedRegistry, retrieve } from '../registry/index.js';
import type { AdvisorResponseV1, Verdict } from '../registry/response-schema.js';
import type { RegistryChunk } from '../registry/types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeAnswer(verdict: Verdict, confidence: 1 | 2 | 3 | 4 | 5): AdvisorResponseV1 {
  return {
    schemaVersion: 1,
    facts: { bullets: ['Test fact'] },
    redFlags: { flags: verdict === 'proceed' ? [] : [{ indicator: 'test-flag', typology: 'cdd_doctrine' }] },
    frameworkCitations: { byClass: { A: ['FDL 10/2025 Art.16'] } },
    decision: { verdict, oneLineRationale: 'test rationale' },
    confidence: { score: confidence, ...(confidence < 5 ? { reason: 'uncertainty' } : {}) },
    counterArgument: { inspectorChallenge: 'challenge', rebuttal: 'rebuttal' },
    auditTrail: {
      charterVersionHash: 'charter-v1',
      directivesInvoked: ['P3'],
      doctrinesApplied: ['cdd_doctrine'],
      retrievedSources: [{ class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.16' }],
      timestamp: '2026-01-01T10:00:00Z',
      userId: 'mlro-01',
      mode: 'deep',
      modelVersions: { sonnet: 'sonnet-4-6' },
    },
    escalationPath: {
      responsible: 'Compliance',
      accountable: 'MLRO',
      consulted: [],
      informed: [],
      nextAction: 'Continue per process',
    },
  };
}

function baseInput(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, { text: 'CDD FDL 10/2025', topK: 5 });
  return {
    userId: 'mlro-01',
    mode: 'deep',
    questionText: 'CDD obligation under FDL 10/2025',
    modelVersions: { sonnet: 'sonnet-4-6' },
    charterVersionHash: 'charter-v1',
    directivesInvoked: ['P3'],
    doctrinesApplied: ['cdd_doctrine'],
    retrievedSources: retrieved.chunks.map(persistedSourceFromChunk),
    reasoningTrace: [{ role: 'executor', modelBuild: 'sonnet-4-6', text: 'reasoning turn' }],
    finalAnswer: makeAnswer('proceed', 5),
    ...overrides,
  };
}

// ── AuditLogStore: size() and append() ───────────────────────────────────────

describe('AuditLogStore: append and size', () => {
  it('starts with size 0', () => {
    const log = new AuditLogStore();
    expect(log.size()).toBe(0);
  });

  it('size increments with each append', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    expect(log.size()).toBe(1);
    log.append(baseInput());
    expect(log.size()).toBe(2);
  });

  it('returned entry has correct seq number', () => {
    const log = new AuditLogStore();
    const e1 = log.append(baseInput());
    const e2 = log.append(baseInput());
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
  });

  it('first entry prevHash is all zeros (64 chars)', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput());
    expect(e.prevHash).toMatch(/^0{64}$/);
  });

  it('subsequent entries prevHash matches prior entryHash', () => {
    const log = new AuditLogStore();
    const e1 = log.append(baseInput());
    const e2 = log.append(baseInput());
    expect(e2.prevHash).toBe(e1.entryHash);
  });

  it('entryHash is a 64-char hex string', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput());
    expect(e.entryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('timestamp uses the provided now() override', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput(), { now: () => '2026-05-16T00:00:00Z' });
    expect(e.timestamp).toBe('2026-05-16T00:00:00Z');
  });

  it('verdict and confidence are derived from finalAnswer', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput({ finalAnswer: makeAnswer('escalate', 3) }));
    expect(e.verdict).toBe('escalate');
    expect(e.confidence).toBe(3);
    expect(e.escalated).toBe(true);
  });

  it('escalated is false for non-escalating verdicts', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput({ finalAnswer: makeAnswer('proceed', 5) }));
    expect(e.escalated).toBe(false);
  });

  it('escalated is true for freeze verdict', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput({ finalAnswer: makeAnswer('freeze', 2) }));
    expect(e.escalated).toBe(true);
  });

  it('escalated is true for file_str verdict', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput({ finalAnswer: makeAnswer('file_str', 2) }));
    expect(e.escalated).toBe(true);
  });

  it('verdict and confidence are absent when finalAnswer is null', () => {
    const log = new AuditLogStore();
    const e = log.append(baseInput({ finalAnswer: null }));
    expect(e.verdict).toBeUndefined();
    expect(e.confidence).toBeUndefined();
    expect(e.escalated).toBe(false);
  });
});

// ── AuditLogStore: verify() ───────────────────────────────────────────────────

describe('AuditLogStore: verify', () => {
  it('verify returns ok=true on empty store', () => {
    const log = new AuditLogStore();
    expect(log.verify()).toEqual({ ok: true, firstMutatedSeq: null });
  });

  it('verify returns ok=true after clean appends', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 5; i++) log.append(baseInput());
    expect(log.verify().ok).toBe(true);
  });

  it('detects tampering when questionText is mutated', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    log.append(baseInput());
    // Directly mutate internal state via list() reference
    log.list()[1]!.questionText = 'TAMPERED';
    const v = log.verify();
    expect(v.ok).toBe(false);
    expect(v.firstMutatedSeq).toBe(2);
  });

  it('identifies the earliest mutated seq', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 4; i++) log.append(baseInput());
    log.list()[1]!.questionText = 'TAMPER-SEQ2'; // mutate seq 2
    const v = log.verify();
    expect(v.ok).toBe(false);
    expect(v.firstMutatedSeq).toBe(2);
  });
});

// ── AuditLogStore: setFeedback() ──────────────────────────────────────────────

describe('AuditLogStore: setFeedback', () => {
  it('adds feedback to the target entry', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const fb: UserFeedback = { verdict: 'thumbs_down', correction: 'Wrong article cited', at: '2026-05-16T00:00:00Z' };
    log.setFeedback(1, fb);
    expect(log.list()[0]!.feedback?.verdict).toBe('thumbs_down');
    expect(log.list()[0]!.feedback?.correction).toBe('Wrong article cited');
  });

  it('verify still passes after setFeedback (chain re-hashed)', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    log.append(baseInput());
    log.setFeedback(1, { verdict: 'thumbs_up', at: '2026-05-16T00:00:00Z' });
    expect(log.verify().ok).toBe(true);
  });

  it('forward chain is rehashed when intermediate entry gets feedback', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 3; i++) log.append(baseInput());
    const e3Before = log.list()[2]!.entryHash;
    log.setFeedback(1, { verdict: 'thumbs_down', at: '2026-05-16T00:00:00Z' });
    const e3After = log.list()[2]!.entryHash;
    // e3's prevHash (via e2's new hash) changed, so e3 hash must differ
    expect(e3After).not.toBe(e3Before);
  });

  it('throws when seq not found', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    expect(() => log.setFeedback(99, { verdict: 'thumbs_up', at: '2026-05-16T00:00:00Z' })).toThrow(/seq 99/);
  });
});

// ── AuditLogStore: list() ─────────────────────────────────────────────────────

describe('AuditLogStore: list', () => {
  it('returns a copy, not the internal array', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const list1 = log.list();
    const list2 = log.list();
    expect(list1).not.toBe(list2);
  });

  it('returns all appended entries in order', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 3; i++) log.append(baseInput());
    const list = log.list();
    expect(list.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

// ── AuditLogStore: snapshot and fromSnapshot ──────────────────────────────────

describe('AuditLogStore: snapshot / fromSnapshot', () => {
  it('snapshot has correct schemaVersion and logHash', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const snap = log.snapshot();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.logHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fromSnapshot restores all entries and verifies clean chain', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 3; i++) log.append(baseInput());
    const snap = log.snapshot();
    const back = AuditLogStore.fromSnapshot(snap);
    expect(back.size()).toBe(3);
    expect(back.verify().ok).toBe(true);
  });

  it('fromSnapshot throws on tampered snapshot logHash', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const snap = log.snapshot();
    snap.entries[0]!.questionText = 'TAMPERED';
    expect(() => AuditLogStore.fromSnapshot(snap)).toThrow(/mismatch|broken/i);
  });

  it('generatedAt is populated in snapshot', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const snap = log.snapshot();
    expect(snap.generatedAt).toMatch(/^\d{4}-/);
  });
});

// ── AuditLogStore: query() compound filters ───────────────────────────────────

describe('AuditLogStore: query', () => {
  function buildTestLog(): AuditLogStore {
    const log = new AuditLogStore();
    const months = ['2026-01', '2026-03', '2026-07', '2026-09'];
    const verdicts: Verdict[] = ['proceed', 'escalate', 'file_str', 'freeze'];
    for (let i = 0; i < 20; i++) {
      const month = months[i % 4]!;
      const ts = `${month}-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`;
      const verdict = verdicts[i % 4]!;
      const conf = ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      log.append({
        ...baseInput({ finalAnswer: makeAnswer(verdict, conf) }),
        mode: i % 2 === 0 ? 'deep' : 'quick',
        userId: i % 3 === 0 ? 'mlro-01' : 'mlro-02',
        questionText: i % 5 === 0 ? 'West African origin gold supplier CAHRA' : 'Standard CDD onboarding query',
      }, { now: () => ts });
    }
    return log;
  }

  it('returns all entries when no filter specified', () => {
    const log = buildTestLog();
    const r = log.query({});
    expect(r.total).toBe(20);
    expect(r.truncated).toBe(false);
  });

  it('filters by fromTimestamp', () => {
    const log = buildTestLog();
    const r = log.query({ fromTimestamp: '2026-07-01T00:00:00Z' });
    for (const e of r.entries) {
      expect(e.timestamp >= '2026-07-01T00:00:00Z').toBe(true);
    }
  });

  it('filters by toTimestamp', () => {
    const log = buildTestLog();
    const r = log.query({ toTimestamp: '2026-03-31T23:59:59Z' });
    for (const e of r.entries) {
      expect(e.timestamp <= '2026-03-31T23:59:59Z').toBe(true);
    }
  });

  it('filters by fromTimestamp AND toTimestamp (Q3 2026)', () => {
    const log = buildTestLog();
    const r = log.query({ fromTimestamp: '2026-07-01T00:00:00Z', toTimestamp: '2026-09-30T23:59:59Z' });
    expect(r.total).toBeGreaterThan(0);
    for (const e of r.entries) {
      expect(e.timestamp >= '2026-07-01T00:00:00Z').toBe(true);
      expect(e.timestamp <= '2026-09-30T23:59:59Z').toBe(true);
    }
  });

  it('filters by mode', () => {
    const log = buildTestLog();
    const r = log.query({ modes: ['deep'] });
    for (const e of r.entries) expect(e.mode).toBe('deep');
  });

  it('filters by verdict', () => {
    const log = buildTestLog();
    const r = log.query({ verdicts: ['escalate'] });
    for (const e of r.entries) expect(e.verdict).toBe('escalate');
  });

  it('filters by userId', () => {
    const log = buildTestLog();
    const r = log.query({ userId: 'mlro-01' });
    for (const e of r.entries) expect(e.userId).toBe('mlro-01');
  });

  it('filters by confidenceBelow', () => {
    const log = buildTestLog();
    const r = log.query({ confidenceBelow: 3 });
    for (const e of r.entries) {
      expect(e.confidence).toBeDefined();
      expect(e.confidence!).toBeLessThan(3);
    }
  });

  it('filters by confidenceAbove', () => {
    const log = buildTestLog();
    const r = log.query({ confidenceAbove: 3 });
    for (const e of r.entries) {
      expect(e.confidence).toBeDefined();
      expect(e.confidence!).toBeGreaterThan(3);
    }
  });

  it('filters by completionGateTripped=true', () => {
    const log = new AuditLogStore();
    log.append(baseInput({ finalAnswer: null, completionDefects: [{ section: 'confidence', failure: 'missing', detail: 'x' }] }));
    log.append(baseInput());
    const r = log.query({ completionGateTripped: true });
    expect(r.total).toBe(1);
    expect(r.entries[0]!.finalAnswer).toBeNull();
  });

  it('filters by completionGateTripped=false', () => {
    const log = new AuditLogStore();
    log.append(baseInput({ finalAnswer: null }));
    log.append(baseInput());
    const r = log.query({ completionGateTripped: false });
    expect(r.total).toBe(1);
    expect(r.entries[0]!.finalAnswer).not.toBeNull();
  });

  it('filters by validationFailed=true', () => {
    const log = new AuditLogStore();
    log.append(baseInput({
      validation: {
        citations: [],
        defects: [{ citation: {} as never, failure: 'no_matching_chunk', detail: 'x' }],
        ungroundedClaims: [],
        passed: false,
        summary: { citationCount: 0, matchedCount: 0, defectCount: 1, ungroundedClaimCount: 0 },
      },
    }));
    log.append(baseInput({
      validation: {
        citations: [],
        defects: [],
        ungroundedClaims: [],
        passed: true,
        summary: { citationCount: 0, matchedCount: 0, defectCount: 0, ungroundedClaimCount: 0 },
      },
    }));
    const r = log.query({ validationFailed: true });
    expect(r.total).toBe(1);
  });

  it('filters by hasFeedback=true', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    log.append(baseInput());
    log.setFeedback(1, { verdict: 'thumbs_up', at: '2026-05-16T00:00:00Z' });
    const r = log.query({ hasFeedback: true });
    expect(r.total).toBe(1);
    expect(r.entries[0]!.seq).toBe(1);
  });

  it('filters by feedbackVerdicts', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    log.append(baseInput());
    log.setFeedback(1, { verdict: 'thumbs_up', at: '2026-05-16T00:00:00Z' });
    log.setFeedback(2, { verdict: 'thumbs_down', at: '2026-05-16T00:00:00Z' });
    const r = log.query({ feedbackVerdicts: ['thumbs_down'] });
    expect(r.total).toBe(1);
    expect(r.entries[0]!.feedback?.verdict).toBe('thumbs_down');
  });

  it('textOrSubjectMatches filters on questionText', () => {
    const log = buildTestLog();
    const r = log.query({ textOrSubjectMatches: ['west african'] });
    expect(r.total).toBeGreaterThan(0);
    for (const e of r.entries) {
      expect(e.questionText.toLowerCase()).toContain('west african');
    }
  });

  it('pagination with limit and offset works', () => {
    const log = buildTestLog();
    const full = log.query({});
    const page = log.query({ limit: 5, offset: 0 });
    expect(page.entries.length).toBe(5);
    expect(page.total).toBe(full.total);
    expect(page.truncated).toBe(true);
  });

  it('queryMs is populated and non-negative', () => {
    const log = buildTestLog();
    const r = log.query({});
    expect(r.queryMs).toBeGreaterThanOrEqual(0);
  });

  it('compound filter: mode + verdict + confidenceBelow', () => {
    const log = buildTestLog();
    const r = log.query({ modes: ['deep'], verdicts: ['escalate'], confidenceBelow: 4 });
    for (const e of r.entries) {
      expect(e.mode).toBe('deep');
      expect(e.verdict).toBe('escalate');
      expect(e.confidence!).toBeLessThan(4);
    }
  });
});

// ── AuditLogStore: countCompletionDefectsBySection ────────────────────────────

describe('AuditLogStore: countCompletionDefectsBySection', () => {
  it('returns empty object when no entries have completionDefects', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const counts = log.countCompletionDefectsBySection();
    expect(Object.keys(counts)).toHaveLength(0);
  });

  it('counts defects per section', () => {
    const log = new AuditLogStore();
    log.append(baseInput({
      finalAnswer: null,
      completionDefects: [
        { section: 'confidence', failure: 'missing', detail: 'x' },
        { section: 'auditTrail', failure: 'empty', detail: 'y' },
      ],
    }));
    log.append(baseInput({
      finalAnswer: null,
      completionDefects: [
        { section: 'confidence', failure: 'missing', detail: 'z' },
      ],
    }));
    const counts = log.countCompletionDefectsBySection();
    expect(counts.confidence).toBe(2);
    expect(counts.auditTrail).toBe(1);
  });
});

// ── persistedSourceFromChunk ──────────────────────────────────────────────────

describe('persistedSourceFromChunk', () => {
  function makeChunk(overrides: Partial<RegistryChunk['metadata']> = {}): RegistryChunk {
    return {
      id: 'chunk-001',
      text: 'Article 22 requires STR filing without delay.',
      metadata: {
        class: 'A',
        classLabel: 'Primary Law',
        sourceId: 'FDL-10-2025',
        articleRef: 'Art.22',
        articleNumber: 22,
        version: '1.0',
        contentHash: 'a'.repeat(64),
        subjectTags: ['cdd', 'sanctions'],
        ...overrides,
      },
    } as RegistryChunk;
  }

  it('copies class, classLabel, sourceId, articleRef, version, contentHash', () => {
    const chunk = makeChunk();
    const ps = persistedSourceFromChunk(chunk);
    expect(ps.class).toBe('A');
    expect(ps.classLabel).toBe('Primary Law');
    expect(ps.sourceId).toBe('FDL-10-2025');
    expect(ps.articleRef).toBe('Art.22');
    expect(ps.version).toBe('1.0');
    expect(ps.contentHash).toBe('a'.repeat(64));
  });

  it('copies full text of the chunk', () => {
    const chunk = makeChunk();
    const ps = persistedSourceFromChunk(chunk);
    expect(ps.text).toBe(chunk.text);
  });

  it('copies subjectTags as a new array (not a reference)', () => {
    const chunk = makeChunk();
    const ps = persistedSourceFromChunk(chunk);
    expect(ps.subjectTags).toEqual(['cdd', 'sanctions']);
    // Mutating the source should not affect the persisted snapshot
    chunk.metadata.subjectTags.push('gold');
    expect(ps.subjectTags).not.toContain('gold');
  });

  it('produces a snapshot that works in retrievedClasses filter', () => {
    const log = new AuditLogStore();
    const chunk = makeChunk({ class: 'B', classLabel: 'Executive Regulations', sourceId: 'CD-134-2025' });
    const ps = persistedSourceFromChunk(chunk);
    log.append(baseInput({ retrievedSources: [ps] }));
    const r = log.query({ retrievedClasses: ['B'] });
    expect(r.total).toBe(1);
  });

  it('works with real seed registry chunks', () => {
    const store = buildSeedRegistry();
    const result = retrieve(store, { text: 'STR filing obligation', topK: 3 });
    const persisted = result.chunks.map(persistedSourceFromChunk);
    expect(persisted.length).toBeGreaterThan(0);
    for (const ps of persisted) {
      expect(ps.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(ps.subjectTags.length).toBeGreaterThanOrEqual(0);
    }
  });
});
