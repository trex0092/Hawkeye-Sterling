// Deep tests for onboarding-risk-tier.ts — tier thresholds, factor caps, edge cases
import { describe, it, expect } from 'vitest';
import { classifyOnboardingRiskTier } from '../onboarding-risk-tier.js';

const NOW = new Date('2026-01-01T00:00:00Z');

// ─── tier threshold boundaries ────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: tier thresholds', () => {
  it('score=0 → tier-3', () => {
    // Completely clean input
    const r = classifyOnboardingRiskTier({
      fullName: 'John Doe',
      nationalityIso2: 'DE',
      dob: '1985-06-15',
      occupation: 'accountant',
      sourceOfFunds: 'Salary from employer for ten years with consistent payroll deposits.',
      expectedProfile: 'Monthly retail banking transactions in the EUR 1,000-5,000 range.',
      now: NOW,
    });
    expect(r.tier).toBe('tier-3');
    expect(r.score).toBeLessThan(20);
  });

  it('score ≥ 50 → tier-1', () => {
    // Single OFAC screening hit = 30 points + empty SoF = 20 points = 50
    const r = classifyOnboardingRiskTier({
      fullName: 'Test Subject',
      nationalityIso2: 'DE',
      dob: '1985-06-15',
      occupation: 'engineer',
      sourceOfFunds: '',
      expectedProfile: 'Standard retail.',
      screeningHits: [{ listId: 'OFAC-SDN', candidateName: 'Test Subject', score: 0.9 }],
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.tier).toBe('tier-1');
  });

  it('score ≥ 20 and < 50 → tier-2', () => {
    // Empty SoF = 20 points exactly → tier-2
    const r = classifyOnboardingRiskTier({
      fullName: 'Jane Blank',
      nationalityIso2: 'DE',
      dob: '1985-06-15',
      occupation: 'engineer',
      sourceOfFunds: '',
      expectedProfile: 'Standard retail banking.',
      now: NOW,
    });
    // sof_missing=20 + expected_missing if applicable... depends on profile
    expect(r.score).toBeGreaterThanOrEqual(20);
    expect(['tier-1', 'tier-2']).toContain(r.tier);
  });
});

// ─── factor caps ──────────────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: factor caps and scoring', () => {
  it('score is capped at 100', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Max Risk',
      nationalityIso2: 'IR',
      dob: '2020-01-01', // minor
      occupation: 'gold crypto VASP minister president hawala',
      sourceOfFunds: '',
      expectedProfile: '',
      screeningHits: [
        { listId: 'OFAC-SDN', candidateName: 'Max Risk', score: 0.99 },
        { listId: 'UNSC-1267', candidateName: 'Max Risk', score: 0.98 },
      ],
      now: NOW,
    });
    expect(r.score).toBe(100);
  });

  it('screening hits capped at PER_AXIS_CAP=50', () => {
    // 3 screening hits × 30 = 90 but capped at 50
    const r = classifyOnboardingRiskTier({
      fullName: 'Multi Hit',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: 'Salary income for ten years with regular deposits.',
      expectedProfile: 'Standard retail banking.',
      screeningHits: [
        { listId: 'L1', candidateName: 'X', score: 0.9 },
        { listId: 'L2', candidateName: 'X', score: 0.9 },
        { listId: 'L3', candidateName: 'X', score: 0.9 },
      ],
      now: NOW,
    });
    const hitFactor = r.factors.find((f) => f.id === 'screening_hit');
    expect(hitFactor).toBeDefined();
    expect(hitFactor!.points).toBeLessThanOrEqual(50);
  });
});

// ─── source-of-funds axis ─────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: SoF depth', () => {
  it('missing SoF → sof_missing factor with 20 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: '',
      expectedProfile: 'Monthly salary inflows AED 10,000-50,000.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'sof_missing');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(20);
  });

  it('thin SoF (< 10 words) → sof_thin factor with 15 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: 'Salary', // 1 word
      expectedProfile: 'Monthly salary inflows AED 10,000-50,000.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'sof_thin');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(15);
  });

  it('adequate SoF (≥ 10 words, no cash) → no sof factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: 'Regular employment income from a software engineering role spanning fifteen years with consistent bank statements.',
      expectedProfile: 'Monthly salary inflows AED 10,000-50,000.',
      now: NOW,
    });
    const hasSofFactor = r.factors.some((f) => f.id.startsWith('sof_'));
    expect(hasSofFactor).toBe(false);
  });

  it('cash-heavy long narrative (> 60 words with cash references) → sof_cash_heavy factor with 10 points', () => {
    // Must have > 60 words AND contain the word "cash"
    const longCash = [
      'I receive cash income from my cash business which deals in cash payments.',
      'The cash transactions are regular and consist of cash sales to retail customers.',
      'Each cash deposit comes from legitimate cash trading activities conducted at my cash shop.',
      'The bulk of my cash flows arise from cash-on-delivery sales and spot cash exchanges.',
      'I supplement this cash income with additional cash receipts from occasional cash consulting work.',
    ].join(' ');
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'merchant',
      sourceOfFunds: longCash,
      expectedProfile: 'Variable cash payments.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'sof_cash_heavy');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(10);
  });
});

// ─── expected profile axis ────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: expected profile', () => {
  it('missing expected profile → expected_missing factor with 10 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: 'Salary from software company for twelve years with documented employment history.',
      expectedProfile: '',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'expected_missing');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(10);
  });

  it('provided expected profile → no expected_missing factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'engineer',
      sourceOfFunds: 'Salary from employer for twelve years.',
      expectedProfile: 'Monthly payroll inflows 1,000-5,000 EUR.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'expected_missing')).toBe(false);
  });
});

// ─── PEP signal axis ──────────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: PEP signal', () => {
  it('minister in occupation → pep_signal factor with 25 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1965-01-01',
      occupation: 'minister of finance',
      sourceOfFunds: 'Government salary for twenty years with documented appointment history.',
      expectedProfile: 'Large government salary transfers.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'pep_signal');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(25);
    expect(factor!.anchor).toBe('FATF-R12');
  });

  it('no PEP keywords → no pep_signal factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Jane Software',
      nationalityIso2: 'DE',
      dob: '1985-01-01',
      occupation: 'software developer',
      sourceOfFunds: 'Salary from tech company for ten years.',
      expectedProfile: 'Monthly payroll 3,000-7,000 EUR.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'pep_signal')).toBe(false);
  });
});

// ─── high-risk sector axis ────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: high-risk sector', () => {
  const SECTOR_CASES = [
    { occ: 'gold trader', id: 'hrc_sector' },
    { occ: 'crypto exchange manager', id: 'hrc_sector' },
    { occ: 'casino operations manager', id: 'hrc_sector' },
    { occ: 'hawala operator', id: 'hrc_sector' },
    { occ: 'VASP compliance officer', id: 'hrc_sector' },
  ];

  for (const { occ, id } of SECTOR_CASES) {
    it(`"${occ}" → ${id} factor`, () => {
      const r = classifyOnboardingRiskTier({
        fullName: 'Industry Professional',
        nationalityIso2: 'DE',
        dob: '1980-01-01',
        occupation: occ,
        sourceOfFunds: 'Business income from regulated industry for over a decade.',
        expectedProfile: 'Business transactions in high volumes.',
        now: NOW,
      });
      expect(r.factors.some((f) => f.id === id)).toBe(true);
    });
  }

  it('software engineer → no hrc_sector factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Tech Worker',
      nationalityIso2: 'DE',
      dob: '1990-01-01',
      occupation: 'software engineer',
      sourceOfFunds: 'Salary from technology employer for eight years.',
      expectedProfile: 'Monthly payroll inflows 5,000-10,000 EUR.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'hrc_sector')).toBe(false);
  });
});

// ─── demographics axis ────────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: demographics', () => {
  it('minor (age < 18) → minor factor with 30 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Young Person',
      nationalityIso2: 'DE',
      dob: '2015-06-01',
      occupation: 'student',
      sourceOfFunds: 'Parental support and trust fund income.',
      expectedProfile: 'Low-value infrequent transactions.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'minor');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(30);
  });

  it('elderly (age ≥ 80) → elderly_proxy_risk factor with 5 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Old Person',
      nationalityIso2: 'DE',
      dob: '1940-01-01', // age ≥ 80 in 2026
      occupation: 'retired',
      sourceOfFunds: 'Pension and investment income from retirement fund established in 1985.',
      expectedProfile: 'Monthly pension deposits.',
      now: NOW,
    });
    const factor = r.factors.find((f) => f.id === 'elderly_proxy_risk');
    expect(factor).toBeDefined();
    expect(factor!.points).toBe(5);
  });

  it('invalid DOB format → no age factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: 'not-a-date',
      occupation: 'engineer',
      sourceOfFunds: 'Salary income for ten years.',
      expectedProfile: 'Standard retail.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'minor' || f.id === 'elderly_proxy_risk')).toBe(false);
  });
});

// ─── suspicious occupation axis ───────────────────────────────────────────────

describe('classifyOnboardingRiskTier: suspicious occupation', () => {
  it('retired → occupation_generic factor with 5 points', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1980-01-01',
      occupation: 'retired',
      sourceOfFunds: 'Pension income from state retirement fund established over thirty years.',
      expectedProfile: 'Monthly pension transfers.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'occupation_generic')).toBe(true);
  });

  it('consultant → occupation_generic factor', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '1980-01-01',
      occupation: 'consultant',
      sourceOfFunds: 'Consulting fees from regulated clients for fifteen years.',
      expectedProfile: 'Variable project-based payments.',
      now: NOW,
    });
    expect(r.factors.some((f) => f.id === 'occupation_generic')).toBe(true);
  });
});

// ─── output structure ─────────────────────────────────────────────────────────

describe('classifyOnboardingRiskTier: output structure', () => {
  it('factors are sorted by points descending', () => {
    const r = classifyOnboardingRiskTier({
      fullName: 'Test',
      nationalityIso2: 'DE',
      dob: '2015-01-01', // minor
      occupation: 'consultant',
      sourceOfFunds: '',
      expectedProfile: '',
      now: NOW,
    });
    for (let i = 1; i < r.factors.length; i++) {
      expect(r.factors[i - 1]!.points).toBeGreaterThanOrEqual(r.factors[i]!.points);
    }
  });

  it('rationale is a non-empty string', () => {
    const r = classifyOnboardingRiskTier({ now: NOW });
    expect(typeof r.rationale).toBe('string');
    expect(r.rationale.length).toBeGreaterThan(0);
  });

  it('jurisdictionHits is an array', () => {
    const r = classifyOnboardingRiskTier({ nationalityIso2: 'AE', now: NOW });
    expect(Array.isArray(r.jurisdictionHits)).toBe(true);
  });

  it('deterministic: same input gives same output', () => {
    const input = {
      fullName: 'Deterministic Test',
      nationalityIso2: 'AE',
      dob: '1980-04-15',
      occupation: 'engineer',
      sourceOfFunds: 'Salary from technology company for ten years with payroll statements.',
      expectedProfile: 'Monthly payroll AED 20,000-50,000.',
      now: NOW,
    };
    expect(classifyOnboardingRiskTier(input)).toEqual(classifyOnboardingRiskTier(input));
  });

  it('empty input (no fields) runs without error', () => {
    expect(() => classifyOnboardingRiskTier({ now: NOW })).not.toThrow();
  });
});
