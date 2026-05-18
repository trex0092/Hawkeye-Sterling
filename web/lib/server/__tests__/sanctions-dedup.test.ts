import { describe, expect, it } from 'vitest';
import { dedupCandidates, dedupStats, normaliseName } from '../sanctions-dedup';
import type { QuickScreenCandidate } from '@/lib/api/quickScreen.types';

describe('normaliseName', () => {
  it('lowercases and trims', () => {
    expect(normaliseName('  John SMITH  ')).toBe('john smith');
  });

  it('strips diacritics so accented variants collapse', () => {
    expect(normaliseName('Jose Garcia')).toBe(normaliseName('José García'));
  });

  it('collapses internal whitespace', () => {
    expect(normaliseName('John    Smith')).toBe('john smith');
  });
});

describe('dedupCandidates', () => {
  function c(over: Partial<QuickScreenCandidate>): QuickScreenCandidate {
    return {
      listId: 'OFAC-SDN',
      listRef: 'OFAC-1',
      name: 'John Smith',
      entityType: 'individual',
      ...over,
    };
  }

  it('passes through a single candidate unchanged', () => {
    const out = dedupCandidates([c({})]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources).toHaveLength(1);
  });

  it('collapses identical-name same-type candidates across lists', () => {
    const out = dedupCandidates([
      c({ listId: 'OFAC-SDN', listRef: 'OFAC-1' }),
      c({ listId: 'UN-1267', listRef: 'UN-A' }),
      c({ listId: 'EU-CFSP', listRef: 'EU-X' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources).toHaveLength(3);
    expect(out[0]?.sources.map((s) => s.listId)).toEqual(['OFAC-SDN', 'UN-1267', 'EU-CFSP']);
  });

  it('does NOT collapse candidates with different entityType', () => {
    const out = dedupCandidates([
      c({ entityType: 'individual' }),
      c({ entityType: 'organisation' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does NOT collapse candidates with different normalised names', () => {
    const out = dedupCandidates([
      c({ name: 'John Smith' }),
      c({ name: 'Jane Smith' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('collapses diacritic variants of the same name', () => {
    const out = dedupCandidates([
      c({ name: 'José García', listId: 'OFAC-SDN', listRef: '1' }),
      c({ name: 'Jose Garcia', listId: 'UN-1267', listRef: '2' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sources).toHaveLength(2);
  });

  it('merges aliases from all sources without duplicates', () => {
    const out = dedupCandidates([
      c({ aliases: ['J. Smith', 'J Smith'] }),
      c({ listId: 'UN-1267', listRef: 'UN-A', aliases: ['John Smith Jr', 'J. Smith'] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.aliases.sort()).toEqual(['J Smith', 'J. Smith', 'John Smith Jr'].sort());
  });

  it('preserves jurisdiction collisions as forensic evidence', () => {
    const out = dedupCandidates([
      c({ jurisdiction: 'RU' }),
      c({ listId: 'UN-1267', listRef: 'UN-A', jurisdiction: 'IR' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.jurisdictions.sort()).toEqual(['IR', 'RU']);
  });

  it('preserves stable first-seen ordering', () => {
    const out = dedupCandidates([
      c({ name: 'A' }),
      c({ name: 'B' }),
      c({ name: 'A', listId: 'UN-1267', listRef: 'X' }),
      c({ name: 'C' }),
    ]);
    expect(out.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(out[0]?.sources).toHaveLength(2); // A merged
  });

  it('first non-empty DOB / nationality wins on merge', () => {
    const out = dedupCandidates([
      c({ dateOfBirth: undefined, nationality: undefined }),
      c({ listId: 'UN-1267', listRef: 'UN-A', dateOfBirth: '1965-01-01', nationality: 'RU' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.dateOfBirth).toBe('1965-01-01');
    expect(out[0]?.nationality).toBe('RU');
  });

  it('handles empty input', () => {
    expect(dedupCandidates([])).toEqual([]);
  });
});

describe('dedupStats', () => {
  it('reports collapse ratio for the MLRO dashboard', () => {
    const out = dedupStats([
      { listId: 'A', listRef: '1', name: 'X', entityType: 'individual' },
      { listId: 'B', listRef: '2', name: 'X', entityType: 'individual' },
      { listId: 'C', listRef: '3', name: 'X', entityType: 'individual' },
      { listId: 'D', listRef: '4', name: 'Y', entityType: 'individual' },
    ]);
    expect(out).toEqual({ inputCount: 4, dedupedCount: 2, collapsed: 2 });
  });
});
