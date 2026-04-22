import { describe, expect, it } from 'vitest';
import { detectConflicts } from '../mlro-conflict-detector.js';
import { CalibrationLedger } from '../mlro-calibration.js';
import { redact, redactAndSign } from '../redactor.js';
import { explainMode } from '../mlro-explainer.js';

describe('mlro-conflict-detector', () => {
  it('unanimous verdicts → no split', () => {
    const r = detectConflicts([
      { modeId: 'a', text: 'FINDINGS: APPROVED with EXACT match.' },
      { modeId: 'b', text: 'Concur. APPROVED. Confidence EXACT.' },
    ]);
    expect(r.verdictAgreement).toBe('unanimous');
    expect(r.confidenceAgreement).toBe('unanimous');
    expect(r.conflicts.filter((c) => c.kind === 'verdict').length).toBe(0);
  });

  it('split verdicts produce a conflict + divergence > 0', () => {
    const r = detectConflicts([
      { modeId: 'a', text: 'Verdict: APPROVED. EXACT match against OFAC.' },
      { modeId: 'b', text: 'Verdict: BLOCKED. POSSIBLE match, request EDD.' },
    ]);
    expect(r.verdictAgreement).toBe('split');
    expect(r.confidenceAgreement).toBe('split');
    expect(r.divergenceScore).toBeGreaterThan(0.4);
    expect(r.conflicts.some((c) => c.kind === 'verdict')).toBe(true);
  });

  it('extracts citation overlap + uniqueness', () => {
    const r = detectConflicts([
      { modeId: 'a', text: 'Cite FDL 10/2025 Art.20 and FATF R.12.' },
      { modeId: 'b', text: 'See FDL 10/2025 Art.20 and Cabinet Res 74/2020.' },
    ]);
    expect(r.citationOverlap.shared.length).toBeGreaterThanOrEqual(1);
    // Each mode should have at least one unique citation given the inputs.
    expect(r.citationOverlap.uniqueByMode.a!.length + r.citationOverlap.uniqueByMode.b!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mlro-calibration', () => {
  it('computes hit-rate + Brier + log scores with a small ledger', () => {
    const l = new CalibrationLedger();
    const base = { predictedVerdict: 'approved' as const, modeIds: ['data'] };
    l.append({ runId: 'r1', at: '2026-04-22T00:00:00Z', predictedProbability: 0.9, groundTruth: 'confirmed', ...base });
    l.append({ runId: 'r2', at: '2026-04-22T00:10:00Z', predictedProbability: 0.8, groundTruth: 'confirmed', ...base });
    l.append({ runId: 'r3', at: '2026-04-22T00:20:00Z', predictedProbability: 0.7, groundTruth: 'reversed', ...base });
    l.append({ runId: 'r4', at: '2026-04-22T00:30:00Z', predictedProbability: 0.6, groundTruth: 'pending', ...base });
    const rep = l.report();
    expect(rep.hits).toBe(2);
    expect(rep.misses).toBe(1);
    expect(rep.pending).toBe(1);
    expect(rep.hitRate).toBeCloseTo(2 / 3, 3);
    expect(rep.brierScore).toBeGreaterThan(0);
    expect(rep.byMode.data!.n).toBe(3);
  });

  it('update() flips pending → confirmed', () => {
    const l = new CalibrationLedger();
    l.append({ runId: 'r1', at: 'now', predictedVerdict: 'approved', predictedProbability: 0.9, groundTruth: 'pending', modeIds: ['x'] });
    expect(l.update('r1', 'confirmed')).toBe(true);
    expect(l.report().hits).toBe(1);
  });
});

describe('redactor', () => {
  it('masks email, phone, IBAN, wallet', () => {
    const r = redact('Contact a@b.com +971501234567 IBAN GB82WEST12345698765432 wallet 0x' + 'a'.repeat(40) + '.');
    expect(r.redacted).not.toContain('a@b.com');
    expect(r.redacted).not.toContain('971501234567');
    expect(r.redacted).not.toContain('GB82WEST12345698765432');
    expect(r.counts.email).toBeGreaterThanOrEqual(1);
  });

  it('Emirates ID pattern fully masked', () => {
    const r = redact('784-1990-1234567-0');
    expect(r.redacted).toContain('*');
    expect(r.counts.emirates_id).toBe(1);
  });

  it('kind allow-list restricts which rules run', () => {
    const r = redact('a@b.com GB82WEST12345698765432', ['iban']);
    expect(r.redacted).toContain('a@b.com');        // email untouched
    expect(r.redacted).not.toContain('GB82WEST12345698765432');
  });

  it('redactAndSign returns a stable FNV-1a fingerprint', () => {
    const a = redactAndSign('IBAN GB82WEST12345698765432');
    const b = redactAndSign('IBAN GB82WEST12345698765432');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('mlro-explainer', () => {
  it('explains a known mode id', () => {
    const e = explainMode('bayesian');
    expect(e.found).toBe(true);
    expect(e.category).toBe('quantitative');
    expect(e.engagedFaculties).toEqual(expect.arrayContaining(['data_analysis', 'inference']));
  });

  it('flags an unknown id + falls back to general', () => {
    const e = explainMode('definitely_not_a_real_mode');
    expect(e.found).toBe(false);
    expect(e.category).toBe('general');
    expect(e.warnings.some((w) => /not in catalogue/.test(w))).toBe(true);
  });

  it('includes authored-prefix preview for a known mode', () => {
    const e = explainMode('bayesian');
    expect(e.hasAuthoredPrefix).toBe(true);
    expect(e.prefixPreview).toBeDefined();
  });
});
