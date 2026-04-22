import { describe, expect, it } from 'vitest';
import {
  screenEntity,
  resolveFalsePositive,
  type ScreeningCandidate,
  type ScreeningSubject,
} from '../entity-screening-engine.js';

const fixedNow = () => '2026-04-22T10:00:00.000Z';

function subject(overrides: Partial<ScreeningSubject> = {}): ScreeningSubject {
  return {
    id: 'subj-1',
    name: 'Mohammed Ali Hassan',
    entityType: 'individual',
    nationality: 'AE',
    dateOfBirth: '1980-05-15',
    identifiers: [{ kind: 'passport', number: 'A1234567' }],
    ...overrides,
  };
}

function candidate(overrides: Partial<ScreeningCandidate> = {}): ScreeningCandidate {
  return {
    listId: 'un_1267',
    listRef: 'UN-KPi.001',
    listVersionDate: '2026-04-20',
    nature: 'sanctions',
    regimes: ['un_1267'],
    record: {
      id: 'cand-1',
      name: 'Mohammed Ali Hassan',
      entityType: 'individual',
      nationality: 'AE',
      dateOfBirth: '1980-05-15',
      identifiers: [{ kind: 'passport', number: 'A1234567' }],
    },
    rawClaim: 'Designated under UNSCR 1267 — ISIL/Al-Qaida list.',
    sourceLanguage: 'en',
    ...overrides,
  };
}

describe('entity-screening-engine — three-tier pipeline', () => {
  it('full identifier + name + DOB + nationality match produces CONFIRMED/EXACT with two strong IDs', () => {
    const r = screenEntity(
      subject(),
      [candidate()],
      {},
      { authoritativeListSupplied: true, now: fixedNow },
    );
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.confidence).toBe('EXACT');
    expect(f.matchRiskTier).toBe('CONFIRMED');
    expect(f.recommendedAction).toBe('block_and_file_TFS_notification');
    expect(r.topMatchRiskTier).toBe('CONFIRMED');
  });

  it('conflicting passport numbers collapse to POSSIBLE (P6 — never merges distinct persons)', () => {
    const c = candidate({
      record: {
        id: 'cand-2',
        name: 'Mohammed Ali Hassan',
        entityType: 'individual',
        nationality: 'AE',
        dateOfBirth: '1980-05-15',
        identifiers: [{ kind: 'passport', number: 'B9999999' }],
      },
    });
    const r = screenEntity(subject(), [c], {}, { authoritativeListSupplied: true, now: fixedNow });
    const f = r.findings[0]!;
    expect(f.conflictingIdentifiers.length).toBeGreaterThan(0);
    expect(f.confidence).toBe('POSSIBLE');
    expect(f.attenuators).toContain('strong_identifier_conflict');
    expect(f.recommendedAction).toBe('EDD_and_disambiguate');
  });

  it('entity-type mismatch is never resolved as same entity', () => {
    const org = candidate({
      record: {
        id: 'cand-3',
        name: 'Mohammed Ali Hassan',
        entityType: 'organisation',
      },
    });
    const r = screenEntity(subject(), [org], {}, { authoritativeListSupplied: true, now: fixedNow });
    // Empty candidate set if filtered by floor, or FP_LIKELY if retained.
    if (r.findings.length > 0) {
      const f = r.findings[0]!;
      expect(f.attenuators).toContain('entity_type_mismatch');
      expect(f.matchRiskTier).toBe('FP_LIKELY');
    } else {
      expect(r.topMatchRiskTier).toBe('NONE');
    }
  });

  it('name-only fuzzy match without strong IDs downgrades to LOW / FP_LIKELY', () => {
    const bare = subject({ dateOfBirth: undefined, nationality: undefined, identifiers: undefined });
    const c = candidate({
      record: {
        id: 'cand-4',
        name: 'Mohamed Aly Hasan',
        entityType: 'individual',
      },
    });
    const r = screenEntity(bare, [c], {}, { authoritativeListSupplied: true, now: fixedNow });
    expect(['LOW', 'FP_LIKELY']).toContain(r.topMatchRiskTier);
    expect(r.findings[0]!.recommendedAction).toMatch(/document/);
  });

  it('transliterated match without native-script corroboration attenuates', () => {
    // Force a transliteration cap by constructing cap-bearing resolution via
    // large surname variance; confidence calibrator caps at POSSIBLE.
    const s = subject({ name: 'Mohammed Ali', dateOfBirth: undefined, identifiers: undefined });
    const c = candidate({
      record: { id: 'cand-5', name: 'Mohamed Aly', entityType: 'individual', nationality: 'AE' },
    });
    const r = screenEntity(s, [c], {}, { authoritativeListSupplied: true, now: fixedNow });
    if (r.findings.length > 0) {
      const f = r.findings[0]!;
      // At most POSSIBLE without native-script corroboration.
      expect(['POSSIBLE', 'WEAK', 'NO_MATCH']).toContain(f.confidence);
    }
  });

  it('missing authoritative-list flag refuses to recommend TFS block (P1)', () => {
    const r = screenEntity(subject(), [candidate()], {}, { now: fixedNow });
    const f = r.findings[0]!;
    expect(f.recommendedAction).toBe('refuse_no_authoritative_source');
    expect(r.gaps.some((g) => g.includes('authoritative'))).toBe(true);
  });
});

describe('entity-screening-engine — risk amplifiers & attenuators', () => {
  it('high-risk jurisdiction in transaction context lifts amplifier', () => {
    const r = screenEntity(
      subject(),
      [candidate()],
      { jurisdictionsInTransaction: ['IR'] },
      { authoritativeListSupplied: true, now: fixedNow },
    );
    expect(r.findings[0]!.amplifiers).toContain('high_risk_jurisdiction_overlap');
    expect(r.redFlags.some((f) => f.includes('High-risk jurisdiction'))).toBe(true);
  });

  it('stale list version is flagged as attenuator', () => {
    const stale = candidate({ listVersionDate: '2025-01-01' });
    const r = screenEntity(subject(), [stale], {}, { authoritativeListSupplied: true, now: fixedNow });
    expect(r.findings[0]!.attenuators).toContain('list_version_stale');
  });

  it('sanctioned regime in scope amplifies', () => {
    const r = screenEntity(
      subject(),
      [candidate({ regimes: ['uae_eocn'] })],
      {},
      { authoritativeListSupplied: true, now: fixedNow },
    );
    expect(r.findings[0]!.amplifiers).toContain('sanctioned_regime_in_scope');
    expect(r.findings[0]!.regimeAuthorities.length).toBeGreaterThan(0);
  });
});

describe('entity-screening-engine — output envelope (P7)', () => {
  it('emits scope declaration, gaps, red flags, next steps, and audit line even with zero candidates', () => {
    const r = screenEntity(subject(), [], {}, { authoritativeListSupplied: true, now: fixedNow });
    expect(r.scopeDeclaration.candidatesScreened).toBe(0);
    expect(r.scopeDeclaration.authoritativeListSupplied).toBe(true);
    expect(r.gaps).toContain('No candidate rows supplied; engine screened against an empty scope.');
    expect(r.findings).toHaveLength(0);
    expect(r.topMatchRiskTier).toBe('NONE');
    expect(r.auditLine.engineVersion).toBeTruthy();
    expect(r.auditLine.scopeHash).toMatch(/^scope-[0-9a-f]{16}$/);
    expect(r.auditLine.decisionSupportOnly).toContain('MLRO review required');
  });

  it('emits one alert per non-FP finding', () => {
    const r = screenEntity(
      subject(),
      [candidate(), candidate({ listRef: 'UN-KPi.002' })],
      {},
      { authoritativeListSupplied: true, now: fixedNow },
    );
    expect(r.alerts).toHaveLength(2);
    expect(r.alerts[0]!.kind).toBe('sanctions_match');
  });

  it('FP_LIKELY findings do not raise alerts', () => {
    const mismatch = candidate({
      record: {
        id: 'cand-7',
        name: 'Mohammed Ali Hassan',
        entityType: 'organisation',
        identifiers: [{ kind: 'passport', number: 'DIFF000' }],
      },
    });
    const r = screenEntity(subject(), [mismatch], {}, { authoritativeListSupplied: true, now: fixedNow });
    expect(r.alerts).toHaveLength(0);
  });
});

describe('entity-screening-engine — false positive resolution', () => {
  it('records resolution on the correct finding without mutating others', () => {
    const r = screenEntity(
      subject(),
      [candidate(), candidate({ listRef: 'UN-KPi.002' })],
      {},
      { authoritativeListSupplied: true, now: fixedNow },
    );
    const resolved = resolveFalsePositive(r, {
      candidateIndex: 1,
      resolvedBy: 'mlro-001',
      resolvedAt: '2026-04-22T12:00:00.000Z',
      reason: 'DOB differs by 20 years on confirmatory passport scan.',
    });
    const target = resolved.findings.find((f) => f.candidateIndex === 1)!;
    const untouched = resolved.findings.find((f) => f.candidateIndex === 0)!;
    expect(target.resolution?.resolvedBy).toBe('mlro-001');
    expect(untouched.resolution).toBeUndefined();
  });
});
