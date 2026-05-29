// Tests for multiSourceConsensus — the weighted-vote consensus engine that
// fuses signals from heterogeneous source types (sanctions lists, PEP vendors,
// adverse-media outlets). Verifies the noDataProvided fix and score computation.

import { describe, expect, it } from 'vitest';
import { multiSourceConsensus } from '../screeningReasoning';

describe('multiSourceConsensus — empty inputs', () => {
  it('returns noDataProvided:true when input array is empty', () => {
    const r = multiSourceConsensus([]);
    expect(r.noDataProvided).toBe(true);
  });

  it('returns unified:0 when no inputs — NOT a confirmed clear, caller must check noDataProvided', () => {
    const r = multiSourceConsensus([]);
    expect(r.unified).toBe(0);
  });

  it('returns confidence.high=100 for empty inputs — epistemic uncertainty, not a tight clear interval', () => {
    const r = multiSourceConsensus([]);
    expect(r.confidence.high).toBe(100);
  });

  it('returns agreementLevel "weak" for empty inputs', () => {
    const r = multiSourceConsensus([]);
    expect(r.agreementLevel).toBe('weak');
  });

  it('returns zero for all source counts when no inputs', () => {
    const r = multiSourceConsensus([]);
    expect(r.sourcesFor).toBe(0);
    expect(r.sourcesAgainst).toBe(0);
    expect(r.sourcesUncertain).toBe(0);
  });
});

describe('multiSourceConsensus — single affirming source', () => {
  it('scores above 0 when one tier-1 source affirms', () => {
    const r = multiSourceConsensus([{ source: 'ofac-sdn', evidence: 'match', rawScore: 95 }]);
    expect(r.noDataProvided).toBeUndefined();
    expect(r.unified).toBeGreaterThan(0);
  });

  it('does not set noDataProvided when inputs are present', () => {
    const r = multiSourceConsensus([{ source: 'ofac-sdn', evidence: 'match' }]);
    expect(r.noDataProvided).toBeUndefined();
  });

  it('marks agreementLevel "weak" for single affirming source (not enough corroboration)', () => {
    const r = multiSourceConsensus([{ source: 'ofac-sdn', evidence: 'match' }]);
    expect(r.agreementLevel).toBe('weak');
  });
});

describe('multiSourceConsensus — multiple affirming sources', () => {
  it('reaches "moderate" agreement with 2 affirming tier-1 sources', () => {
    const r = multiSourceConsensus([
      { source: 'ofac-sdn',    evidence: 'match' },
      { source: 'un-sc',       evidence: 'match' },
    ]);
    expect(r.agreementLevel).toBe('moderate');
  });

  it('reaches "strong" agreement with 3+ affirming tier-1 sources', () => {
    const r = multiSourceConsensus([
      { source: 'ofac-sdn',    evidence: 'match' },
      { source: 'un-sc',       evidence: 'match' },
      { source: 'hmt-ofsi',    evidence: 'match' },
    ]);
    expect(r.agreementLevel).toBe('strong');
  });

  it('unified score saturates at 100, never exceeds it', () => {
    const many = Array.from({ length: 20 }, (_, _i) =>
      ({ source: `ofac-sdn`, evidence: 'match' as const, rawScore: 100 }),
    );
    const r = multiSourceConsensus(many);
    expect(r.unified).toBeLessThanOrEqual(100);
  });
});

describe('multiSourceConsensus — uncertain inputs (no positive/negative evidence)', () => {
  it('does NOT set noDataProvided when inputs have uncertain evidence (sources were consulted)', () => {
    const r = multiSourceConsensus([
      { source: 'opensanctions', evidence: 'uncertain' },
      { source: 'lseg-world-check', evidence: 'uncertain' },
    ]);
    // These sources were consulted but found nothing — different from no data provided
    expect(r.noDataProvided).toBeUndefined();
    expect(r.sourcesUncertain).toBe(2);
  });

  it('unified stays 0 when all inputs are uncertain — correctly ambiguous, not confirmed clear', () => {
    const r = multiSourceConsensus([
      { source: 'opensanctions', evidence: 'uncertain' },
    ]);
    expect(r.unified).toBe(0);
    // noDataProvided is undefined — the source WAS consulted, just found nothing
    expect(r.noDataProvided).toBeUndefined();
  });
});

describe('multiSourceConsensus — split evidence', () => {
  it('detects split agreement when sources disagree', () => {
    const r = multiSourceConsensus([
      { source: 'ofac-sdn',    evidence: 'match'    },
      { source: 'hmt-ofsi',    evidence: 'match'    },
      { source: 'eu-eba',      evidence: 'no_match' },
      { source: 'un-sc',       evidence: 'no_match' },
    ]);
    expect(r.agreementLevel).toBe('split');
  });

  it('returns non-zero sourcesAgainst when denial evidence exists', () => {
    const r = multiSourceConsensus([
      { source: 'hmt-ofsi',  evidence: 'delisted'  },
    ]);
    expect(r.sourcesAgainst).toBe(1);
  });
});
