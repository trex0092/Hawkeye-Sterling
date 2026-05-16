// Layer 4 acceptance tests — immutable audit log + compound query.
//
// Build-spec acceptance criterion: run a hundred queries through the
// Advisor across all four modes, then run an audit query for any of
// them and reproduce the full decision context in under one second.
// We stand in 200 entries here (4 modes × 50 each) and verify the
// "West African origin in Q3 2026 with confidence below 4" example
// resolves correctly and quickly.

import { describe, expect, it } from 'vitest';
import {
  AuditLogStore,
  persistedSourceFromChunk,
  type AuditEntryInput,
} from '../registry/audit-log.js';
import { type AdvisorResponseV1, type Verdict, buildSeedRegistry, retrieve } from '../registry/index.js';

function makeAnswer(verdict: Verdict, confidence: 1 | 2 | 3 | 4 | 5): AdvisorResponseV1 {
  return {
    schemaVersion: 1,
    facts: { bullets: ['Test fact'] },
    redFlags: { flags: verdict === 'proceed' ? [] : [{ indicator: 'flag', typology: 'cdd_doctrine' }] },
    frameworkCitations: { byClass: { A: ['FDL 10/2025 Art.16'] } },
    decision: { verdict, oneLineRationale: 'rationale' },
    confidence: { score: confidence, ...(confidence < 5 ? { reason: 'gap' } : {}) },
    counterArgument: {
      inspectorChallenge: 'An inspector would press on whether identification was completed before the threshold check fired.',
      rebuttal: 'CDD attempt logged with timestamps — verdict holds.',
    },
    auditTrail: {
      charterVersionHash: 'charter-v1',
      directivesInvoked: ['P3'],
      doctrinesApplied: ['cdd_doctrine'],
      retrievedSources: [{ class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.16' }],
      timestamp: '2026-08-15T10:00:00Z',
      userId: 'mlro-01',
      mode: 'deep',
      modelVersions: { sonnet: 'sonnet-4-6', opus: 'opus-4-7' },
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

function baseInput(overrides?: Partial<AuditEntryInput>): AuditEntryInput {
  const store = buildSeedRegistry();
  const retrieved = retrieve(store, { text: 'CDD onboarding under FDL 10/2025', topK: 5 });
  return {
    userId: 'mlro-01',
    mode: 'deep',
    questionText: 'CDD onboarding obligation under FDL 10/2025',
    modelVersions: { sonnet: 'sonnet-4-6', opus: 'opus-4-7' },
    charterVersionHash: 'charter-v1',
    directivesInvoked: ['P3'],
    doctrinesApplied: ['cdd_doctrine'],
    retrievedSources: retrieved.chunks.map(persistedSourceFromChunk),
    reasoningTrace: [{ role: 'executor', modelBuild: 'sonnet-4-6', text: 'turn 1' }],
    finalAnswer: makeAnswer('proceed', 5),
    ...(overrides ?? {}),
  };
}

describe('audit log: append + verify', () => {
  it('hash chain is intact after multiple appends', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 5; i++) log.append(baseInput());
    expect(log.verify().ok).toBe(true);
    expect(log.size()).toBe(5);
  });

  it('detects tampering — verify identifies mutated seq', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 3; i++) log.append(baseInput());
    // Mutate entry 2's questionText without rehashing — chain should break at seq 2.
    const list = log.list();
    list[1]!.questionText = 'TAMPERED';
    // We mutated the ref, so verify should fail at seq 2.
    const v = log.verify();
    expect(v.ok).toBe(false);
    expect(v.firstMutatedSeq).toBe(2);
  });

  it('snapshot round-trip verifies', () => {
    const log = new AuditLogStore();
    for (let i = 0; i < 4; i++) log.append(baseInput());
    const snap = log.snapshot();
    const back = AuditLogStore.fromSnapshot(snap);
    expect(back.size()).toBe(log.size());
    expect(back.verify().ok).toBe(true);
  });

  it('tampered snapshot is rejected at load', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const snap = log.snapshot();
    snap.entries[0]!.questionText = 'TAMPERED';
    expect(() => AuditLogStore.fromSnapshot(snap)).toThrow(/mismatch|broken/i);
  });
});

describe('audit log: persisted sources carry class metadata', () => {
  it('every retrieved source on the entry carries class + classLabel', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    const e = log.list()[0]!;
    expect(e.retrievedSources.length).toBeGreaterThan(0);
    for (const s of e.retrievedSources) {
      expect(s.class).toBeTruthy();
      expect(s.classLabel).toBeTruthy();
      expect(s.sourceId).toBeTruthy();
      expect(s.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('audit log: feedback', () => {
  it('feedback patches an entry and re-hashes the forward chain', () => {
    const log = new AuditLogStore();
    log.append(baseInput());
    log.append(baseInput());
    log.append(baseInput());
    log.setFeedback(2, { verdict: 'thumbs_down', correction: 'cited the wrong article', at: '2026-08-16T10:00:00Z' });
    expect(log.verify().ok).toBe(true);
    const e = log.list().find((x) => x.seq === 2)!;
    expect(e.feedback?.verdict).toBe('thumbs_down');
  });
});

describe('audit log: compound query (build-spec acceptance)', () => {
  function popLog(): AuditLogStore {
    const log = new AuditLogStore();
    const modes: Array<'quick' | 'speed' | 'balanced' | 'deep'> = ['quick', 'speed', 'balanced', 'deep'];
    for (let i = 0; i < 200; i++) {
      const mode = modes[i % 4]!;
      const month = (i % 9) + 1; // months 1..9 of 2026
      const day = (i % 27) + 1;
      const ts = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`;
      const verdict: Verdict = i % 3 === 0 ? 'escalate' : i % 3 === 1 ? 'proceed' : 'file_str';
      const confidence = ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      const isWestAfrican = i % 7 === 0;
      const questionText = isWestAfrican
        ? 'EDD review for a customer with West African (Mali) gold supplier — CAHRA exposure'
        : 'CDD onboarding for a UAE corporate customer';
      log.append({
        ...baseInput(),
        mode,
        questionText,
        finalAnswer: makeAnswer(verdict, confidence),
      }, { now: () => ts });
    }
    return log;
  }

  it('"West African origin in Q3 2026 with confidence below 4" — correct + sub-second', () => {
    const log = popLog();
    const t0 = Date.now();
    const r = log.query({
      textOrSubjectMatches: ['west african', 'mali', 'cahra'],
      fromTimestamp: '2026-07-01T00:00:00Z',
      toTimestamp: '2026-09-30T23:59:59Z',
      confidenceBelow: 4,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1_000); // build-spec sub-second
    expect(r.queryMs).toBeLessThan(1_000);
    expect(r.total).toBeGreaterThan(0);
    for (const e of r.entries) {
      expect(e.questionText.toLowerCase()).toMatch(/west african|cahra|mali/);
      expect(e.timestamp >= '2026-07-01T00:00:00Z' && e.timestamp <= '2026-09-30T23:59:59Z').toBe(true);
      expect(e.confidence).toBeDefined();
      expect(e.confidence!).toBeLessThan(4);
    }
  });

  it('mode + verdict compound filter', () => {
    const log = popLog();
    const r = log.query({ modes: ['deep'], verdicts: ['escalate'] });
    for (const e of r.entries) {
      expect(e.mode).toBe('deep');
      expect(e.verdict).toBe('escalate');
    }
  });

  it('completion-gate-tripped filter surfaces fail-closed entries', () => {
    const log = new AuditLogStore();
    log.append({ ...baseInput(), finalAnswer: null, completionDefects: [{ section: 'confidence', failure: 'missing', detail: 'absent' }] });
    log.append(baseInput());
    const r = log.query({ completionGateTripped: true });
    expect(r.total).toBe(1);
    expect(r.entries[0]!.finalAnswer).toBeNull();
    expect(r.entries[0]!.completionDefects?.[0]?.section).toBe('confidence');
  });

  it('escalated flag derived from verdict', () => {
    const log = new AuditLogStore();
    log.append({ ...baseInput(), finalAnswer: makeAnswer('proceed', 5) });
    log.append({ ...baseInput(), finalAnswer: makeAnswer('escalate', 3) });
    log.append({ ...baseInput(), finalAnswer: makeAnswer('freeze', 2) });
    const list = log.list();
    expect(list[0]!.escalated).toBe(false);
    expect(list[1]!.escalated).toBe(true);
    expect(list[2]!.escalated).toBe(true);
  });
});

describe('audit log: defect aggregation for Layer 7 KPIs', () => {
  it('counts completion defects by section', () => {
    const log = new AuditLogStore();
    log.append({ ...baseInput(), finalAnswer: null, completionDefects: [{ section: 'confidence', failure: 'missing', detail: 'x' }] });
    log.append({ ...baseInput(), finalAnswer: null, completionDefects: [{ section: 'confidence', failure: 'missing', detail: 'x' }, { section: 'auditTrail', failure: 'empty', detail: 'x' }] });
    const counts = log.countCompletionDefectsBySection();
    expect(counts.confidence).toBe(2);
    expect(counts.auditTrail).toBe(1);
  });
});
