// Tests the deterministic onboarding risk-tier scorer that replaces
// the inline `computeTier` in web/app/operations/onboard/page.tsx.

import { describe, expect, it } from 'vitest';
import { classifyOnboardingRiskTier } from '../onboarding-risk-tier.js';

describe('classifyOnboardingRiskTier: clean baseline → tier-3', () => {
  it('a UAE retail customer with full CDD and no hits is tier-3', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Ahmad Hassan',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'software engineer at Etisalat',
      sourceOfFunds:
        'Salary income from Etisalat for 8 years, average annual gross AED 720,000, supplemented by rental income from a single residential property in Dubai.',
      expectedProfile: 'Monthly transactions in the AED 5,000-50,000 range; standard payroll inflows; predictable utility outflows.',
      address: 'Downtown Dubai',
      screeningHits: [],
      now: new Date('2026-04-30'),
    });
    expect(r.tier).toBe('tier-3');
    expect(r.score).toBeLessThan(20);
    expect(r.factors.length).toBeLessThanOrEqual(2);
  });
});

describe('classifyOnboardingRiskTier: high-risk signals lift to tier-1', () => {
  it('Iran nationality alone lifts the tier (FATF black + UNSC + OFAC + EU)', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Ali Karimi',
      nationalityIso2: 'IR',
      dob: '1985-04-12',
      occupation: 'engineer',
      sourceOfFunds: 'Salary income from a defence-sector employer for 12 years.',
      expectedProfile: 'Monthly transactions in the AED 5,000-50,000 range.',
      now: new Date('2026-04-30'),
    });
    expect(r.tier).toBe('tier-1');
    expect(r.factors.find((f) => f.id === 'jurisdiction')).toBeTruthy();
    expect(r.jurisdictionHits.some((h) => h.classification === 'black')).toBe(true);
  });

  it('a screening hit alone is enough to push to tier-1', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test Subject',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'investor',
      sourceOfFunds: 'Inheritance plus equity portfolio income across 15 years.',
      expectedProfile: 'High-value transactions, AED 100k+.',
      screeningHits: [{ listId: 'OFAC-SDN', candidateName: 'Test Subject', score: 0.9 }],
      now: new Date('2026-04-30'),
    });
    expect(r.tier).toBe('tier-1');
    expect(r.factors[0]?.id).toBe('screening_hit');
  });

  it('PEP signal in occupation lifts the tier', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Sarah Al Mansouri',
      nationalityIso2: 'AE',
      dob: '1970-04-12',
      occupation: 'Minister of Economy in the cabinet, also senior political adviser',
      sourceOfFunds: 'Government salary plus advisory income from a sovereign wealth fund.',
      expectedProfile: 'Monthly large-value flows.',
      now: new Date('2026-04-30'),
    });
    expect(r.factors.some((f) => f.id === 'pep_signal')).toBe(true);
    expect(['tier-1', 'tier-2']).toContain(r.tier);
  });
});

describe('classifyOnboardingRiskTier: thin / missing CDD bumps risk', () => {
  it('empty source-of-funds adds 20 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'No SoF',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'consultant',
      sourceOfFunds: '',
      expectedProfile: '',
      now: new Date('2026-04-30'),
    });
    expect(r.factors.some((f) => f.id === 'sof_missing')).toBe(true);
    expect(r.factors.some((f) => f.id === 'expected_missing')).toBe(true);
  });

  it('thin source-of-funds (< 10 words) adds 15 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Thin SoF',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'engineer',
      sourceOfFunds: 'Salary',
      expectedProfile: 'Monthly transactions in the AED 5,000-50,000 range.',
      now: new Date('2026-04-30'),
    });
    expect(r.factors.some((f) => f.id === 'sof_thin')).toBe(true);
  });
});

describe('classifyOnboardingRiskTier: high-risk sector', () => {
  it('gold trader occupation lifts via WOLFSBERG-DPMS anchor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Trader',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'gold and bullion trader at DMCC',
      sourceOfFunds: 'Eight years of trading-margin income from registered DMCC bullion firm.',
      expectedProfile: 'High-value bullion transactions; monthly turnover AED 5M-20M.',
      now: new Date('2026-04-30'),
    });
    const sector = r.factors.find((f) => f.id === 'hrc_sector');
    expect(sector).toBeTruthy();
    expect(sector?.anchor).toBe('WOLFSBERG-DPMS');
  });
});

describe('classifyOnboardingRiskTier: minor escalation', () => {
  it('subject under 18 is high risk and flagged for senior review', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Young Subject',
      nationalityIso2: 'AE',
      dob: '2015-04-12',
      occupation: 'student',
      sourceOfFunds: 'Trust fund managed by parent.',
      expectedProfile: 'Low-frequency, low-value.',
      now: new Date('2026-04-30'),
    });
    expect(r.factors.some((f) => f.id === 'minor')).toBe(true);
    expect(['tier-1', 'tier-2']).toContain(r.tier);
  });
});

describe('classifyOnboardingRiskTier: deterministic + capped', () => {
  it('repeated calls produce identical output', () => {
    const input = {
      fullName: 'Determinism Test',
      nationalityIso2: 'AE',
      dob: '1985-04-12',
      occupation: 'engineer',
      sourceOfFunds: 'Salary income for 8 years; rental income from one property.',
      expectedProfile: 'Monthly AED 5,000-50,000.',
      now: new Date('2026-04-30'),
    };
    const a = classifyOnboardingRiskTier(input);
    const b = classifyOnboardingRiskTier(input);
    expect(a).toEqual(b);
  });

  it('score is capped at 100 even when many axes fire', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Worst Case',
      nationalityIso2: 'IR',
      dob: '2020-04-12', // minor
      occupation: 'gold and bullion crypto VASP minister of finance',
      sourceOfFunds: '',
      expectedProfile: '',
      screeningHits: [
        { listId: 'OFAC-SDN', candidateName: 'Worst Case', score: 0.95 },
        { listId: 'UNSC-1267', candidateName: 'Worst Case', score: 0.92 },
      ],
      now: new Date('2026-04-30'),
    });
    expect(r.score).toBe(100);
    expect(r.tier).toBe('tier-1');
  });
});
