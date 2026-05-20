// Hawkeye Sterling — regime-conflict unit tests.
// Covers primacyOf, resolveRegimeConflict with all branches.

import { describe, it, expect } from 'vitest';
import { primacyOf, resolveRegimeConflict, type RegimeFinding } from '../regime-conflict.js';
import type { SanctionRegimeId } from '../sanction-regimes.js';

describe('primacyOf', () => {
  it('returns 1.0 for UN tier-1 regimes', () => {
    expect(primacyOf('un_1267')).toBe(1.0);
    expect(primacyOf('un_1988')).toBe(1.0);
    expect(primacyOf('uae_eocn')).toBe(1.0);
    expect(primacyOf('uae_local_terrorist')).toBe(1.0);
  });

  it('returns 0.85 for OFAC SDN', () => {
    expect(primacyOf('ofac_sdn')).toBe(0.85);
  });

  it('returns 0.80 for EU and UK regimes', () => {
    expect(primacyOf('eu_consolidated')).toBe(0.80);
    expect(primacyOf('uk_ofsi')).toBe(0.80);
  });

  it('returns 0.65 for Tier-3 corroborating regimes', () => {
    expect(primacyOf('switzerland_fdfa')).toBe(0.65);
    expect(primacyOf('canada_sema')).toBe(0.65);
  });

  it('returns DEFAULT_PRIMACY (0.50) for unknown regime', () => {
    expect(primacyOf('unknown_regime' as SanctionRegimeId)).toBe(0.50);
  });
});

describe('resolveRegimeConflict', () => {
  it('returns score 0 and no conflict for empty input', () => {
    const r = resolveRegimeConflict([]);
    expect(r.score).toBe(0);
    expect(r.conflict).toBe(false);
    expect(r.cited).toHaveLength(0);
    expect(r.notes).toContain('No regime findings supplied; resolver returns score 0 (no signal).');
  });

  it('returns high score when top-primacy regime designates', () => {
    const findings: RegimeFinding[] = [
      { regime: 'un_1267', stance: 'designated', confidence: 1.0 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.score).toBeGreaterThan(0.8);
    expect(r.topDesignation).toBe('un_1267');
    expect(r.conflict).toBe(false);
  });

  it('returns 0 when all regimes clear', () => {
    const findings: RegimeFinding[] = [
      { regime: 'ofac_sdn', stance: 'cleared', confidence: 0.95 },
      { regime: 'eu_consolidated', stance: 'cleared', confidence: 0.90 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.score).toBe(0);
    expect(r.conflict).toBe(false);
    expect(r.topDesignation).toBeUndefined();
  });

  it('ignores silent stances in the score calculation', () => {
    const findings: RegimeFinding[] = [
      { regime: 'ofac_sdn', stance: 'silent', confidence: 0.5 },
      { regime: 'eu_consolidated', stance: 'silent', confidence: 0.5 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.score).toBe(0);
    expect(r.conflict).toBe(false);
  });

  it('detects conflict when designation and clearing have similar primacy', () => {
    const findings: RegimeFinding[] = [
      { regime: 'ofac_sdn', stance: 'designated', confidence: 0.9 },  // primacy 0.85
      { regime: 'eu_consolidated', stance: 'cleared', confidence: 0.95 }, // primacy 0.80
    ];
    // |0.85 - 0.80| = 0.05 ≤ 0.20 → conflict
    const r = resolveRegimeConflict(findings);
    expect(r.conflict).toBe(true);
    expect(r.notes.some((n) => n.includes('Conflict'))).toBe(true);
  });

  it('does NOT detect conflict when primacy difference > 0.20', () => {
    const findings: RegimeFinding[] = [
      { regime: 'un_1267', stance: 'designated', confidence: 0.9 },  // primacy 1.0
      { regime: 'new_zealand_mfat', stance: 'cleared', confidence: 0.9 }, // primacy 0.55
    ];
    // |1.0 - 0.55| = 0.45 > 0.20 → no conflict
    const r = resolveRegimeConflict(findings);
    expect(r.conflict).toBe(false);
  });

  it('identifies the highest primacy designation as topDesignation', () => {
    const findings: RegimeFinding[] = [
      { regime: 'canada_sema', stance: 'designated', confidence: 0.8 },   // primacy 0.65
      { regime: 'ofac_sdn', stance: 'designated', confidence: 0.9 },       // primacy 0.85
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.topDesignation).toBe('ofac_sdn');
  });

  it('includes source citations in notes when provided', () => {
    const findings: RegimeFinding[] = [
      { regime: 'un_1267', stance: 'designated', confidence: 0.95, source: 'UN Consolidated List v2026-05' },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.notes.some((n) => n.includes('UN Consolidated List'))).toBe(true);
  });

  it('cited array has correct contribution for designated stance', () => {
    const findings: RegimeFinding[] = [
      { regime: 'ofac_sdn', stance: 'designated', confidence: 1.0 }, // primacy 0.85, contribution = 0.85
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.cited).toHaveLength(1);
    expect(r.cited[0]!.contribution).toBeCloseTo(0.85, 2);
    expect(r.cited[0]!.stance).toBe('designated');
  });

  it('cited array has negative contribution for cleared stance', () => {
    const findings: RegimeFinding[] = [
      { regime: 'ofac_sdn', stance: 'cleared', confidence: 1.0 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.cited[0]!.contribution).toBeLessThan(0);
  });

  it('methodology string describes the resolution', () => {
    const findings: RegimeFinding[] = [
      { regime: 'uae_eocn', stance: 'designated', confidence: 0.9 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.methodology).toContain('Regime conflict resolver');
    expect(r.methodology).toContain('uae_eocn');
  });

  it('clamped confidence does not cause score > 1', () => {
    const findings: RegimeFinding[] = [
      { regime: 'un_1267', stance: 'designated', confidence: 2.0 }, // confidence > 1 gets clamped
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('handles mixed designated/cleared/silent correctly', () => {
    const findings: RegimeFinding[] = [
      { regime: 'un_1267', stance: 'designated', confidence: 0.95 },
      { regime: 'eu_russia', stance: 'cleared', confidence: 0.85 },
      { regime: 'singapore_mas', stance: 'silent', confidence: 0.5 },
    ];
    const r = resolveRegimeConflict(findings);
    expect(r.cited).toHaveLength(3);
    expect(r.score).toBeGreaterThan(0);
    // UN 1.0 vs EU 0.80 → |0.20| ≤ 0.20 → conflict
    expect(r.conflict).toBe(true);
  });
});
