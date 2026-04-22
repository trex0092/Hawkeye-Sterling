import { describe, expect, it } from 'vitest';
import { calibrateConfidence, type DisambiguatorState } from '../confidence.js';
import { matchEnsemble } from '../matching.js';

function dstate(overrides: Partial<DisambiguatorState> = {}): DisambiguatorState {
  return {
    strong: { present: [], absent: [], conflicting: [] },
    contextual: { present: [], absent: [] },
    commonName: false,
    transliterated: false,
    nativeScriptCorroborated: false,
    ...overrides,
  };
}

describe('confidence calibrator — charter caps', () => {
  it('name-only match caps at WEAK', () => {
    const e = matchEnsemble('Mohammed Ali', 'Mohammed Ali');
    const c = calibrateConfidence(e, dstate());
    expect(c.level).toBe('WEAK');
    expect(c.caps).toContain('name-only-capped-at-weak');
  });

  it('common name without strong IDs caps at POSSIBLE', () => {
    const e = matchEnsemble('Mohammed', 'Mohammed');
    const c = calibrateConfidence(e, dstate({ commonName: true, contextual: { present: ['country_only'], absent: [] } }));
    expect(c.level).toBe('POSSIBLE');
  });

  it('transliterated match without native-script corroboration caps at POSSIBLE', () => {
    const e = matchEnsemble('Mohammed Ali', 'Mohamed Aly');
    const c = calibrateConfidence(e, dstate({
      transliterated: true,
      nativeScriptCorroborated: false,
      strong: { present: ['nationality'], absent: [], conflicting: [] },
    }));
    expect(c.level).toBe('POSSIBLE');
  });

  it('EXACT requires two strong identifiers', () => {
    const e = matchEnsemble('Ivan Ivanov', 'Ivan Ivanov');
    const withOne = calibrateConfidence(e, dstate({
      strong: { present: ['dob'], absent: ['passport_number'], conflicting: [] },
    }));
    expect(['STRONG', 'POSSIBLE']).toContain(withOne.level);

    const withTwo = calibrateConfidence(e, dstate({
      strong: { present: ['dob', 'passport_number'], absent: [], conflicting: [] },
    }));
    expect(withTwo.level).toBe('EXACT');
  });

  it('strong-identifier conflict caps at POSSIBLE', () => {
    const e = matchEnsemble('Ivan Ivanov', 'Ivan Ivanov');
    const c = calibrateConfidence(e, dstate({
      strong: { present: ['dob'], absent: [], conflicting: ['passport_number'] },
    }));
    expect(c.level).toBe('POSSIBLE');
    expect(c.caps).toContain('conflict-capped-at-possible');
  });
});
