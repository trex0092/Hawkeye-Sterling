import { describe, it, expect } from 'vitest';
import { filterAuditEntries, matchesFilter, type AuditTrailEntryShape } from '../audit-trail-filters';

function mk(at: string, payload: Record<string, unknown>, seq = 1): AuditTrailEntryShape {
  return { seq, at, payload };
}

describe('matchesFilter — no filter active', () => {
  it('keeps every entry when filter is empty', () => {
    expect(matchesFilter(mk('2026-05-19T00:00:00Z', {}), {})).toBe(true);
  });
});

describe('matchesFilter — date range', () => {
  const entry = mk('2026-05-19T10:00:00Z', {});

  it('keeps entries inside fromDate..toDate', () => {
    expect(matchesFilter(entry, { fromDate: '2026-05-18T00:00:00Z', toDate: '2026-05-20T00:00:00Z' })).toBe(true);
  });

  it('excludes entries before fromDate', () => {
    expect(matchesFilter(entry, { fromDate: '2026-05-20T00:00:00Z' })).toBe(false);
  });

  it('excludes entries after toDate', () => {
    expect(matchesFilter(entry, { toDate: '2026-05-18T00:00:00Z' })).toBe(false);
  });

  it('honours fromDate alone', () => {
    expect(matchesFilter(entry, { fromDate: '2026-05-19T09:59:00Z' })).toBe(true);
    expect(matchesFilter(entry, { fromDate: '2026-05-19T10:00:01Z' })).toBe(false);
  });

  it('honours toDate alone', () => {
    expect(matchesFilter(entry, { toDate: '2026-05-19T10:00:01Z' })).toBe(true);
    expect(matchesFilter(entry, { toDate: '2026-05-19T09:59:59Z' })).toBe(false);
  });

  it('treats malformed entry.at as non-matching when a date filter is set', () => {
    expect(matchesFilter(mk('not-a-date', {}), { fromDate: '2026-05-19T00:00:00Z' })).toBe(false);
  });

  it('ignores malformed filter dates (defensive — never panic)', () => {
    // A bad fromDate becomes null → entire date-range branch is skipped.
    // The entry is included because no other filter applies.
    expect(matchesFilter(entry, { fromDate: 'gibberish' })).toBe(true);
  });
});

describe('matchesFilter — subject + event filters', () => {
  it('exact-matches subjectId', () => {
    const e = mk('2026-05-19T00:00:00Z', { subjectId: 'subj-42' });
    expect(matchesFilter(e, { subjectId: 'subj-42' })).toBe(true);
    expect(matchesFilter(e, { subjectId: 'subj-99' })).toBe(false);
    expect(matchesFilter(mk('2026-05-19T00:00:00Z', {}), { subjectId: 'subj-42' })).toBe(false);
  });

  it('case-insensitive substring-matches subjectName', () => {
    const e = mk('2026-05-19T00:00:00Z', { subjectName: 'Acme Trading LLC' });
    expect(matchesFilter(e, { subjectName: 'acme' })).toBe(true);
    expect(matchesFilter(e, { subjectName: 'TRADING' })).toBe(true);
    expect(matchesFilter(e, { subjectName: 'beta' })).toBe(false);
    expect(matchesFilter(mk('2026-05-19T00:00:00Z', {}), { subjectName: 'acme' })).toBe(false);
  });

  it('exact-matches eventType against payload.event', () => {
    const e = mk('2026-05-19T00:00:00Z', { event: 'screening.completed' });
    expect(matchesFilter(e, { eventType: 'screening.completed' })).toBe(true);
    expect(matchesFilter(e, { eventType: 'screening.false_positive' })).toBe(false);
  });

  it('combines all filters as AND', () => {
    const e = mk('2026-05-19T12:00:00Z', { subjectId: 'subj-1', subjectName: 'X', event: 'screening.completed' });
    expect(matchesFilter(e, {
      fromDate: '2026-05-19T00:00:00Z',
      toDate: '2026-05-19T23:59:59Z',
      subjectId: 'subj-1',
      subjectName: 'x',
      eventType: 'screening.completed',
    })).toBe(true);
    // Any one mismatch excludes the entry.
    expect(matchesFilter(e, { subjectId: 'subj-1', eventType: 'screening.false_positive' })).toBe(false);
  });
});

describe('filterAuditEntries', () => {
  const entries: AuditTrailEntryShape[] = [
    mk('2026-05-18T10:00:00Z', { subjectId: 'a', event: 'screening.completed' }, 1),
    mk('2026-05-19T10:00:00Z', { subjectId: 'b', event: 'screening.completed' }, 2),
    mk('2026-05-19T11:00:00Z', { subjectId: 'a', event: 'screening.false_positive' }, 3),
    mk('2026-05-20T10:00:00Z', { subjectId: 'a', event: 'screening.completed' }, 4),
  ];

  it('returns all entries when no filter is provided (defensive shortcut)', () => {
    expect(filterAuditEntries(entries, {})).toHaveLength(4);
  });

  it('returns a fresh array (no aliasing of input)', () => {
    const out = filterAuditEntries(entries, {});
    expect(out).not.toBe(entries);
    expect(out).toEqual(entries);
  });

  it('intersects multiple filters', () => {
    const out = filterAuditEntries(entries, {
      subjectId: 'a',
      fromDate: '2026-05-19T00:00:00Z',
    });
    // Subject-a entries on or after 2026-05-19: seqs 3 (FP) and 4 (completed).
    expect(out.map((e) => e.seq)).toEqual([3, 4]);
  });

  it('filters by event type', () => {
    const out = filterAuditEntries(entries, { eventType: 'screening.false_positive' });
    expect(out.map((e) => e.seq)).toEqual([3]);
  });

  it('returns empty when no entry matches', () => {
    expect(filterAuditEntries(entries, { eventType: 'no.such.event' })).toEqual([]);
  });
});
