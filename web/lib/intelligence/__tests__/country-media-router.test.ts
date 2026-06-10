// Worldwide per-country adverse-media query routing tests.

import { describe, expect, it } from 'vitest';
import {
  buildWorldwideQueryPlan,
  highRiskCountryCount,
  isHighRiskCountry,
} from '../country-media-router';
import { JURISDICTION_RISK } from '@/lib/data/jurisdictions';

describe('buildWorldwideQueryPlan', () => {
  it('always starts with a global pass', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject' });
    expect(plan[0]).toEqual({ reason: 'global' });
  });

  it('includes the subject countries first, before registry countries', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject', nationality: 'BR', jurisdiction: 'AE' });
    expect(plan[1]).toMatchObject({ country: 'BR', reason: 'subject_country', language: 'pt' });
    expect(plan[2]).toMatchObject({ country: 'AE', reason: 'subject_country', language: 'ar' });
  });

  it('covers every FATF / EU AMLD / Basel very-high country in the registry', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject' });
    const planCountries = new Set(plan.filter((q) => q.country).map((q) => q.country));
    for (const j of JURISDICTION_RISK) {
      const isHigh =
        j.fatf !== 'not_listed' || j.eu === 'high_risk_third_country' || j.baselTier === 'very_high';
      if (isHigh) {
        expect(planCountries.has(j.iso2), `${j.iso2} (${j.name}) missing from plan`).toBe(true);
      }
    }
    expect(planCountries.size).toBeGreaterThanOrEqual(highRiskCountryCount());
  });

  it('assigns non-English local press languages (no English-only restriction)', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject' });
    const languages = new Set(plan.map((q) => q.language).filter(Boolean));
    // FATF/Basel registries span arabophone, persophone and francophone
    // jurisdictions — all must be queried in local language.
    for (const lang of ['ar', 'fa', 'fr']) {
      expect(languages.has(lang), `language ${lang} missing from plan`).toBe(true);
    }
  });

  it('does not duplicate a subject country that is also registry-listed', () => {
    // IR (Iran) is FATF call-for-action; as nationality it must appear once.
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject', nationality: 'IR' });
    const irEntries = plan.filter((q) => q.country === 'IR');
    expect(irEntries).toHaveLength(1);
    expect(irEntries[0]!.reason).toBe('subject_country');
  });

  it('maxCountries trims registry tail but never the subject countries', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject', nationality: 'BR', jurisdiction: 'MX' }, 5);
    expect(plan).toHaveLength(6); // global + 5 countries
    expect(plan[1]!.country).toBe('BR');
    expect(plan[2]!.country).toBe('MX');
  });

  it('maxCountries 0 means unlimited', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject' }, 0);
    expect(plan.length).toBeGreaterThan(30); // dozens of registry high-risk countries
  });

  it('ranks FATF call-for-action countries ahead of Basel-only countries', () => {
    const plan = buildWorldwideQueryPlan({ name: 'Test Subject' });
    const idx = (iso2: string) => plan.findIndex((q) => q.country === iso2);
    // KP/IR/MM are FATF call_for_action — they must precede any basel_very_high-only entry.
    const firstBaselOnly = plan.findIndex((q) => q.reason === 'basel_very_high');
    if (firstBaselOnly !== -1) {
      for (const cc of ['KP', 'IR', 'MM']) {
        const i = idx(cc);
        if (i !== -1) expect(i).toBeLessThan(firstBaselOnly);
      }
    }
  });
});

describe('isHighRiskCountry', () => {
  it('returns true for FATF call-for-action countries', () => {
    expect(isHighRiskCountry('IR')).toBe(true);
    expect(isHighRiskCountry('KP')).toBe(true);
  });

  it('returns false for low-risk countries and unknown inputs', () => {
    expect(isHighRiskCountry('NZ')).toBe(false);
    expect(isHighRiskCountry(undefined)).toBe(false);
    expect(isHighRiskCountry('ZZ')).toBe(false);
  });

  it('is case/whitespace tolerant', () => {
    expect(isHighRiskCountry(' ir ')).toBe(true);
  });
});
