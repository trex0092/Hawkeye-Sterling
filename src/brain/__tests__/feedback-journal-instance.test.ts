import { describe, it, expect, beforeEach } from 'vitest';
import {
  getJournal,
  recordCaseDisposition,
  hydrateJournal,
  _resetJournalForTest,
} from '../feedback-journal-instance.js';
import type { OutcomeRecord } from '../outcome-feedback.js';

function rec(partial: Partial<OutcomeRecord> & { runId: string }): OutcomeRecord {
  return {
    runId: partial.runId,
    at: partial.at ?? new Date().toISOString(),
    caseId: partial.caseId ?? 'case-x',
    modeIds: partial.modeIds ?? ['list_walk'],
    autoProposed: partial.autoProposed ?? 'D02_cleared_proceed',
    autoConfidence: partial.autoConfidence ?? 0.8,
    mlroDecided: partial.mlroDecided ?? 'D02_cleared_proceed',
    overridden: partial.overridden ?? false,
    reviewerId: partial.reviewerId ?? 'reviewer-1',
  };
}

describe('feedback-journal-instance', () => {
  beforeEach(() => _resetJournalForTest());

  it('returns a stable singleton across calls', () => {
    const a = getJournal();
    const b = getJournal();
    expect(a).toBe(b);
  });

  it('starts empty', () => {
    expect(getJournal().size()).toBe(0);
  });

  it('recordCaseDisposition appends to the singleton', () => {
    recordCaseDisposition(rec({ runId: 'r1' }));
    expect(getJournal().size()).toBe(1);
  });

  it('hydrateJournal appends every supplied record', () => {
    const n = hydrateJournal([
      rec({ runId: 'r1' }),
      rec({ runId: 'r2', overridden: true, mlroDecided: 'D05_frozen_ffr' }),
      rec({ runId: 'r3' }),
    ]);
    expect(n).toBe(3);
    expect(getJournal().size()).toBe(3);
  });

  it('agreement() reflects appended records', () => {
    recordCaseDisposition(rec({ runId: 'r1' }));
    recordCaseDisposition(rec({
      runId: 'r2',
      overridden: true,
      mlroDecided: 'D05_frozen_ffr',
    }));
    const r = getJournal().agreement();
    expect(r.total).toBe(2);
    expect(r.agreed).toBe(1);
    expect(r.overridden).toBe(1);
    expect(r.agreementRate).toBe(0.5);
  });

  it('_resetJournalForTest clears state between tests', () => {
    recordCaseDisposition(rec({ runId: 'r1' }));
    expect(getJournal().size()).toBe(1);
    _resetJournalForTest();
    expect(getJournal().size()).toBe(0);
  });
});
