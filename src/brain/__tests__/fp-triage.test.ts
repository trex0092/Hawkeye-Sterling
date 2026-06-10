// FP-60 — deterministic false-positive triage unit tests.
//
// Covers the knobs in fp-triage-config.ts, the auto-resolve rule extensions in
// quick-screen.ts (DOB tolerance/delta, reason codes, profile activation), and
// the critical-regime floor in entity-screening-engine.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { quickScreen, type QuickScreenCandidate } from '../quick-screen.js';
import { fpTriageConfig, fpTriageConfigSnapshot, resetFpTriageConfigForTests } from '../fp-triage-config.js';
import { screenEntity, type ScreeningCandidate } from '../entity-screening-engine.js';

const ENV_KEYS = [
  'HAWKEYE_FP_TRIAGE_ENABLED',
  'HAWKEYE_FP_AUTO_RESOLVE_PROFILE',
  'HAWKEYE_FP_DOB_DISMISS_MIN_YEARS',
  'HAWKEYE_FP_DOB_CONFLICT_TOLERANCE_YEARS',
  'HAWKEYE_FP_ENTITY_MISMATCH_DISMISS_MAX_SCORE',
  'HAWKEYE_FP_COMMON_NAME_CAP_ENABLED',
  'HAWKEYE_FP_SINGLE_TOKEN_SCORE_CAP',
  'HAWKEYE_LIST_THRESHOLDS',
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetFpTriageConfigForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetFpTriageConfigForTests();
});

// ── Config parsing ────────────────────────────────────────────────────────────

describe('fp-triage-config', () => {
  it('resolves documented defaults when no env vars are set', () => {
    const cfg = fpTriageConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.profile).toBe('standard');
    expect(cfg.dobDismissMinYears).toBe(3);
    expect(cfg.dobConflictToleranceYears).toBe(1);
    expect(cfg.entityMismatchDismissMaxScore).toBe(0.9);
    expect(cfg.commonNameCapEnabled).toBe(true);
    expect(cfg.singleTokenScoreCap).toBe(0.74);
    expect(cfg.listThresholds).toEqual({});
  });

  it('fails open to defaults on malformed env values', () => {
    process.env['HAWKEYE_FP_TRIAGE_ENABLED'] = 'banana';
    process.env['HAWKEYE_FP_DOB_DISMISS_MIN_YEARS'] = '-7';
    process.env['HAWKEYE_FP_AUTO_RESOLVE_PROFILE'] = 'aggressive';
    process.env['HAWKEYE_FP_SINGLE_TOKEN_SCORE_CAP'] = '5';
    process.env['HAWKEYE_LIST_THRESHOLDS'] = '{not json';
    resetFpTriageConfigForTests();
    const cfg = fpTriageConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.dobDismissMinYears).toBe(3);
    expect(cfg.profile).toBe('standard');
    expect(cfg.singleTokenScoreCap).toBe(0.74);
    expect(cfg.listThresholds).toEqual({});
  });

  it('honours valid env overrides', () => {
    process.env['HAWKEYE_FP_AUTO_RESOLVE_PROFILE'] = 'strict';
    process.env['HAWKEYE_FP_DOB_DISMISS_MIN_YEARS'] = '5';
    process.env['HAWKEYE_LIST_THRESHOLDS'] = '{"jp_mof":0.85,"bad":1.5}';
    resetFpTriageConfigForTests();
    const cfg = fpTriageConfig();
    expect(cfg.profile).toBe('strict');
    expect(cfg.dobDismissMinYears).toBe(5);
    expect(cfg.listThresholds).toEqual({ jp_mof: 0.85 }); // out-of-range entry dropped
  });

  it('snapshot marks overridden keys', () => {
    process.env['HAWKEYE_FP_DOB_DISMISS_MIN_YEARS'] = '5';
    resetFpTriageConfigForTests();
    const snap = fpTriageConfigSnapshot();
    const dob = snap.find((s) => s.key === 'dobDismissMinYears');
    expect(dob?.value).toBe(5);
    expect(dob?.overridden).toBe(true);
    const profile = snap.find((s) => s.key === 'profile');
    expect(profile?.overridden).toBe(false);
  });
});

// ── DOB tolerance boundaries ──────────────────────────────────────────────────

function dobHit(subjectDob: string, candidateDob: string) {
  const result = quickScreen(
    { name: 'Test Subject Name', dateOfBirth: subjectDob },
    [{ listId: 'eu_fsf', listRef: 'X-1', name: 'Test Subject Name', dateOfBirth: candidateDob }],
    { scoreThreshold: 0.5, autoResolveRules: [] },
  );
  return result.hits[0];
}

describe('DOB tolerance band', () => {
  it('delta 0 (same year, different month/day) is a year match', () => {
    expect(dobHit('1980-05-10', '1980-09-01')?.dobMatch).toBe('year');
  });

  it('delta 1 is neither confirmation nor conflict (Hijri/Gregorian safety)', () => {
    const hit = dobHit('1980-05-10', '1981-05-10');
    expect(hit?.dobMatch).toBeUndefined(); // 'none' is omitted from the hit
    expect(hit?.dobYearDelta).toBe(1);
    expect(hit?.score).toBe(hit?.baseScore); // no penalty applied
  });

  it('delta 2 is a conflict (penalised) but below the default dismissal floor', () => {
    const hit = dobHit('1980-05-10', '1982-05-10');
    expect(hit?.dobMatch).toBe('conflict');
    expect(hit?.dobYearDelta).toBe(2);
  });

  it('delta 3 is a conflict at the dismissal floor', () => {
    const hit = dobHit('1980-05-10', '1983-05-10');
    expect(hit?.dobMatch).toBe('conflict');
    expect(hit?.dobYearDelta).toBe(3);
  });

  it('tolerance is disabled when the master switch is off (legacy scoring)', () => {
    process.env['HAWKEYE_FP_TRIAGE_ENABLED'] = 'false';
    resetFpTriageConfigForTests();
    const hit = dobHit('1980-05-10', '1981-05-10');
    expect(hit?.dobMatch).toBe('conflict');
  });
});

// ── minDobYearDelta gating in the standard profile ────────────────────────────

describe('standard profile DOB dismissal floor', () => {
  const subject = { name: 'Yuri Test Petrov', dateOfBirth: '1980-01-01' };
  const candidateWithDob = (dob: string): QuickScreenCandidate => ({
    listId: 'eu_fsf', listRef: 'D-1', name: 'Yuri Test Petrov', dateOfBirth: dob,
  });

  it('delta 2 conflict is NOT dismissed (below minDobYearDelta 3)', () => {
    const result = quickScreen(subject, [candidateWithDob('1982-01-01')], { scoreThreshold: 0.5 });
    expect(result.hits[0]?.autoResolution).not.toBe('auto-dismissed');
  });

  it('delta 25 conflict on a non-critical list IS dismissed with FP_01', () => {
    const result = quickScreen(subject, [candidateWithDob('1955-01-01')], { scoreThreshold: 0.5 });
    expect(result.hits[0]?.autoResolution).toBe('auto-dismissed');
    expect(result.hits[0]?.autoResolutionReasonCode).toBe('FP_01');
    expect(result.autoDismissedCount).toBe(1);
    expect(result.fpReasonBreakdown).toEqual({ FP_01: 1 });
  });

  it('delta 25 conflict on a CRITICAL list is flagged, never dismissed', () => {
    const result = quickScreen(
      subject,
      [{ listId: 'un_1267', listRef: 'C-1', name: 'Yuri Test Petrov', dateOfBirth: '1955-01-01' }],
      { scoreThreshold: 0.5 },
    );
    expect(result.hits[0]?.autoResolution).toBe('flagged');
    expect(result.autoDismissedCount).toBeUndefined();
  });

  it('profile off via env restores legacy behaviour (no auto-resolution)', () => {
    process.env['HAWKEYE_FP_AUTO_RESOLVE_PROFILE'] = 'off';
    resetFpTriageConfigForTests();
    const result = quickScreen(subject, [candidateWithDob('1955-01-01')], { scoreThreshold: 0.5 });
    expect(result.hits[0]?.autoResolution).toBeUndefined();
  });

  it('explicit empty rule array overrides the env default profile', () => {
    const result = quickScreen(subject, [candidateWithDob('1955-01-01')], { scoreThreshold: 0.5, autoResolveRules: [] });
    expect(result.hits[0]?.autoResolution).toBeUndefined();
  });
});

// ── Entity-type mismatch dismissal ────────────────────────────────────────────

describe('entity-type mismatch dismissal (FP_07)', () => {
  it('individual ↔ vessel mismatch below 0.90 is dismissed with FP_07', () => {
    const result = quickScreen(
      { name: 'Golden Horizon', entityType: 'individual' },
      [{ listId: 'eu_fsf', listRef: 'V-1', name: 'Golden Horizon', entityType: 'vessel' }],
      { scoreThreshold: 0.6 },
    );
    expect(result.hits[0]?.entityTypeMismatch).toBe(true);
    expect(result.hits[0]?.autoResolution).toBe('auto-dismissed');
    expect(result.hits[0]?.autoResolutionReasonCode).toBe('FP_07');
  });

  it('vessel ↔ organisation pairs are exempt (multiplier 1.0 — no mismatch set)', () => {
    const result = quickScreen(
      { name: 'Golden Horizon Shipping', entityType: 'vessel' },
      [{ listId: 'eu_fsf', listRef: 'V-2', name: 'Golden Horizon Shipping', entityType: 'organisation' }],
      { scoreThreshold: 0.6 },
    );
    expect(result.hits[0]?.entityTypeMismatch).toBeUndefined();
    expect(result.hits[0]?.autoResolution).toBeUndefined();
  });
});

// ── Critical-regime floor in the entity-screening engine ──────────────────────

describe('entity-screening engine — TFS critical-regime floor', () => {
  const now = () => '2026-06-10T00:00:00.000Z';

  function screen(candidate: ScreeningCandidate) {
    return screenEntity(
      { id: 's1', name: 'Test Subject Org', entityType: 'individual' },
      [candidate],
      {},
      { now, authoritativeListSupplied: true },
    );
  }

  it('TFS-critical candidate with entity-type mismatch floors at LOW and still alerts', () => {
    const result = screen({
      listId: 'un_1267',
      listRef: 'QDi.999',
      listVersionDate: '2026-06-01',
      nature: 'sanctions',
      regimes: ['un_1267'],
      record: { id: 'c1', name: 'Test Subject Org', entityType: 'organisation' },
    });
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    expect(finding!.matchRiskTier).toBe('LOW');
    expect(finding!.matchRiskTier).not.toBe('FP_LIKELY');
    expect(result.alerts.length).toBe(1);
    expect(finding!.rationale).toContain('TFS-critical regime');
  });

  it('non-critical candidate with the same mismatch stays FP_LIKELY (no alert)', () => {
    const result = screen({
      listId: 'eu_fsf',
      listRef: 'EU.999',
      listVersionDate: '2026-06-01',
      nature: 'sanctions',
      regimes: ['eu_russia'],
      record: { id: 'c2', name: 'Test Subject Org', entityType: 'organisation' },
    });
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    expect(finding!.matchRiskTier).toBe('FP_LIKELY');
    expect(result.alerts.length).toBe(0);
  });

  it('DOB + nationality double conflict adds the deterministic_fp_multi_conflict attenuator', () => {
    const result = screenEntity(
      { id: 's2', name: 'Dmitri Sokolov', entityType: 'individual', dateOfBirth: '1962-04-11', nationality: 'MX' },
      [{
        listId: 'eu_fsf',
        listRef: 'EU.123',
        listVersionDate: '2026-06-01',
        nature: 'sanctions',
        record: { id: 'c3', name: 'Dmitri Sokolov', entityType: 'individual', dateOfBirth: '1975-09-30', nationality: 'RU' },
      }],
      {},
      { now, authoritativeListSupplied: true },
    );
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    expect(finding!.attenuators).toContain('deterministic_fp_multi_conflict');
  });
});

// ── Per-list env-default thresholds ───────────────────────────────────────────

describe('HAWKEYE_LIST_THRESHOLDS env defaults', () => {
  it('applies the per-list threshold when caller supplies none', () => {
    process.env['HAWKEYE_LIST_THRESHOLDS'] = '{"jp_mof":1.0}';
    resetFpTriageConfigForTests();
    const candidates: QuickScreenCandidate[] = [
      { listId: 'jp_mof', listRef: 'J-1', name: 'Hiroshi Tanaka Watanabe' },
    ];
    // Fuzzy variant scores below 1.0 but above the 0.82 global default.
    const result = quickScreen({ name: 'Hiroshi Tanak Watanab' }, candidates, {});
    expect(result.hits.length).toBe(0);
  });

  it('caller-supplied listThresholds still take precedence', () => {
    process.env['HAWKEYE_LIST_THRESHOLDS'] = '{"jp_mof":1.0}';
    resetFpTriageConfigForTests();
    const result = quickScreen(
      { name: 'Hiroshi Tanak Watanab' },
      [{ listId: 'jp_mof', listRef: 'J-1', name: 'Hiroshi Tanaka Watanabe' }],
      { listThresholds: { jp_mof: 0.8 } },
    );
    expect(result.hits.length).toBe(1);
  });
});
