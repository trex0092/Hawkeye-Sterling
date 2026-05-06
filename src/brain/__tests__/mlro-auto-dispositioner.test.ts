import { describe, expect, it } from 'vitest';
import { proposeDisposition } from '../mlro-auto-dispositioner.js';
import type { AutoDispositionInput } from '../mlro-auto-dispositioner.js';

function base(overrides: Partial<AutoDispositionInput> = {}): AutoDispositionInput {
  return {
    partial: false,
    charterAllowed: true,
    tippingOffMatches: 0,
    structuralIssues: [],
    narrative: '',
    firedRedlineIds: [],
    ...overrides,
  };
}

describe('proposeDisposition — confidence threshold (HS-004 hard constraint)', () => {
  it('tipping-off path returns confidence 0.8 (above threshold, escalation to D08)', () => {
    const result = proposeDisposition(base({ tippingOffMatches: 1 }));
    expect(result.code).toBe('D08_exit_relationship');
    expect(result.confidence).toBe(0.8);
  });

  it('partial pipeline returns confidence 0.5 (≤ 0.65 → EDD required)', () => {
    const result = proposeDisposition(base({ partial: true }));
    expect(result.code).toBe('D03_edd_required');
    expect(result.confidence).toBeLessThanOrEqual(0.65);
  });

  it('charter failure returns confidence 0.55 (≤ 0.65 → EDD required)', () => {
    const result = proposeDisposition(base({ charterAllowed: false }));
    expect(result.code).toBe('D03_edd_required');
    expect(result.confidence).toBeLessThanOrEqual(0.65);
  });

  it('default no-signal path returns confidence 0.4 (≤ 0.65 → EDD required)', () => {
    const result = proposeDisposition(base());
    expect(result.code).toBe('D03_edd_required');
    expect(result.confidence).toBeLessThanOrEqual(0.65);
  });

  it('refer-to-authority path returns exactly confidence 0.65 (boundary)', () => {
    const result = proposeDisposition(base({ narrative: 'REFER TO AUTHORITY' }));
    expect(result.code).toBe('D10_refer_to_authority');
    expect(result.confidence).toBe(0.65);
  });
});

describe('proposeDisposition — disposition code coverage (D00–D10)', () => {
  it('D00: no-match cue', () => {
    expect(proposeDisposition(base({ narrative: 'NO MATCH found in declared scope' })).code).toBe('D00_no_match');
  });

  it('D02: cleared cue', () => {
    expect(proposeDisposition(base({ narrative: 'CLEARED — proceed' })).code).toBe('D02_cleared_proceed');
  });

  it('D03: default no-signal', () => {
    expect(proposeDisposition(base()).code).toBe('D03_edd_required');
  });

  it('D04: heightened monitoring cue', () => {
    expect(proposeDisposition(base({ narrative: 'HEIGHTENED_MONITORING recommended' })).code).toBe('D04_heightened_monitoring');
  });

  it('D05: confirmed sanctions redline', () => {
    const result = proposeDisposition(base({ firedRedlineIds: ['rl_ofac_sdn_confirmed'] }));
    expect(result.code).toBe('D05_frozen_ffr');
  });

  it('D06: partial sanctions match', () => {
    expect(proposeDisposition(base({ narrative: 'PNMR partial name match detected' })).code).toBe('D06_partial_match_pnmr');
  });

  it('D07: STR filed', () => {
    expect(proposeDisposition(base({ narrative: 'STR_FILED with goAML' })).code).toBe('D07_str_filed');
  });

  it('D08: exit relationship cue', () => {
    expect(proposeDisposition(base({ narrative: 'EXIT_RELATIONSHIP recommended' })).code).toBe('D08_exit_relationship');
  });

  it('D09: do-not-onboard cue', () => {
    expect(proposeDisposition(base({ narrative: 'DO_NOT_ONBOARD — decline' })).code).toBe('D09_do_not_onboard');
  });

  it('D10: refer-to-authority cue', () => {
    expect(proposeDisposition(base({ narrative: 'REFER_TO_AUTHORITY immediately' })).code).toBe('D10_refer_to_authority');
  });
});

describe('proposeDisposition — no autonomous action (HS-004 PILOT constraint)', () => {
  it('returns a proposal object only — does not mutate state or throw side effects', () => {
    const input = base({ narrative: 'CLEARED — proceed' });
    const result = proposeDisposition(input);
    // Verify it is purely a data object: no functions, no Promises.
    expect(typeof result.code).toBe('string');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.rationale).toBe('string');
    expect(Array.isArray(result.flags)).toBe(true);
  });

  it('always returns a rationale string (MLRO needs it to sign off)', () => {
    const inputs: AutoDispositionInput[] = [
      base(),
      base({ partial: true }),
      base({ tippingOffMatches: 1 }),
      base({ narrative: 'CLEARED' }),
      base({ firedRedlineIds: ['rl_un_consolidated_confirmed'] }),
    ];
    for (const input of inputs) {
      const result = proposeDisposition(input);
      expect(result.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('proposeDisposition — tipping-off hard stop (charter P4)', () => {
  it('fires D08 on tippingOffMatches > 0 regardless of narrative', () => {
    const result = proposeDisposition(base({
      tippingOffMatches: 1,
      narrative: 'CLEARED — proceed',
    }));
    expect(result.code).toBe('D08_exit_relationship');
    expect(result.flags).toContain('tipping-off risk intercepted');
  });

  it('fires D08 on rl_tipping_off_draft redline', () => {
    const result = proposeDisposition(base({ firedRedlineIds: ['rl_tipping_off_draft'] }));
    expect(result.code).toBe('D08_exit_relationship');
  });
});
