// Hawkeye Sterling — typology-priors unit tests.

import { describe, it, expect } from 'vitest';
import { TYPOLOGY_PRIORS, priorFor, hasCalibratedPrior } from '../typology-priors.js';
import type { TypologyId } from '../typologies.js';

describe('TYPOLOGY_PRIORS catalogue', () => {
  it('is a frozen object (immutable)', () => {
    expect(Object.isFrozen(TYPOLOGY_PRIORS)).toBe(true);
  });

  it('has valid probability values (0 < p <= 1) for all entries', () => {
    for (const [_id, p] of Object.entries(TYPOLOGY_PRIORS)) {
      expect(typeof p).toBe('number');
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('sanctions_evasion prior is higher than structuring (pre-filtered queue)', () => {
    expect(TYPOLOGY_PRIORS['sanctions_evasion']).toBeGreaterThan(TYPOLOGY_PRIORS['structuring']!);
  });

  it('pep prior is the highest in the catalogue', () => {
    const pepPrior = TYPOLOGY_PRIORS['pep']!;
    for (const p of Object.values(TYPOLOGY_PRIORS)) {
      expect(pepPrior).toBeGreaterThanOrEqual(p!);
    }
  });
});

describe('priorFor', () => {
  it('returns the calibrated prior for a known typology', () => {
    expect(priorFor('structuring')).toBe(0.030);
    expect(priorFor('pep')).toBe(0.080);
    expect(priorFor('vasp')).toBe(0.045);
  });

  it('returns the DEFAULT_PRIOR (0.01) for an unknown typology', () => {
    expect(priorFor('unknown_typology' as TypologyId)).toBe(0.01);
  });

  it('returns the override value when a valid override is provided', () => {
    expect(priorFor('structuring', 0.5)).toBe(0.5);
    expect(priorFor('unknown_typology' as TypologyId, 0.25)).toBe(0.25);
  });

  it('returns 0 override when explicitly set (zero is valid)', () => {
    expect(priorFor('pep', 0)).toBe(0);
  });

  it('ignores override > 1 and falls back to registered prior', () => {
    expect(priorFor('structuring', 1.5)).toBe(0.030);
  });

  it('ignores negative override and falls back to registered prior', () => {
    expect(priorFor('structuring', -0.1)).toBe(0.030);
  });

  it('ignores non-numeric override and falls back to registered prior', () => {
    expect(priorFor('structuring', undefined)).toBe(0.030);
  });

  it('covers all typologies in the catalogue with correct values', () => {
    for (const [id, expectedPrior] of Object.entries(TYPOLOGY_PRIORS)) {
      expect(priorFor(id as TypologyId)).toBe(expectedPrior);
    }
  });
});

describe('hasCalibratedPrior', () => {
  it('returns true for a known typology', () => {
    expect(hasCalibratedPrior('structuring')).toBe(true);
    expect(hasCalibratedPrior('pep')).toBe(true);
    expect(hasCalibratedPrior('crypto_ransomware')).toBe(true);
  });

  it('returns false for an unknown typology', () => {
    expect(hasCalibratedPrior('nonexistent_typology' as TypologyId)).toBe(false);
  });

  it('returns true for every entry in the TYPOLOGY_PRIORS catalogue', () => {
    for (const id of Object.keys(TYPOLOGY_PRIORS)) {
      expect(hasCalibratedPrior(id as TypologyId)).toBe(true);
    }
  });
});
