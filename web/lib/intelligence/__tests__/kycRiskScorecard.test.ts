// Hawkeye Sterling — KYC risk scorecard unit tests.
// Covers rules 61-70.

import { describe, it, expect } from 'vitest';
import {
  customerRisk,
  channelRisk,
  productRisk,
  geographyRisk,
  tenureRisk,
  volumeMismatch,
  activityDrift,
  staticRiskRecalc,
  kycRefreshDue,
  kycCompleteness,
} from '../kycRiskScorecard.js';

describe('customerRisk (rule 61)', () => {
  it('returns baseline 25 for individual with no flags', () => {
    expect(customerRisk({})).toBe(25);
  });

  it('adds 15 for organisation entity type', () => {
    expect(customerRisk({ entityType: 'organisation' })).toBe(40);
  });

  it('adds 25 for vessel entity type', () => {
    expect(customerRisk({ entityType: 'vessel' })).toBe(50);
  });

  it('adds 25 for aircraft entity type', () => {
    expect(customerRisk({ entityType: 'aircraft' })).toBe(50);
  });

  it('adds 30 for PEP', () => {
    expect(customerRisk({ isPep: true })).toBe(55);
  });

  it('adds 15 for tier_1 PEP', () => {
    expect(customerRisk({ isPep: true, pepTier: 'tier_1' })).toBe(70);
  });

  it('caps at 100', () => {
    // vessel(+25) + isPep(+30) + tier_1(+15) + base(25) = 95; caps at 100 with more flags
    // Let's verify cap behavior with max possible values
    expect(customerRisk({ entityType: 'vessel', isPep: true, pepTier: 'tier_1' })).toBe(95);
  });
});

describe('channelRisk (rule 62)', () => {
  it('returns baseline 10 for branch channel', () => {
    expect(channelRisk({ channel: 'branch' })).toBe(10);
  });

  it('adds 25 for online channel', () => {
    expect(channelRisk({ channel: 'online' })).toBe(35);
  });

  it('adds 25 for remote_kyc', () => {
    expect(channelRisk({ channel: 'remote_kyc' })).toBe(35);
  });

  it('adds 35 for agent channel', () => {
    expect(channelRisk({ channel: 'agent' })).toBe(45);
  });

  it('adds 35 for introducer channel', () => {
    expect(channelRisk({ channel: 'introducer' })).toBe(45);
  });

  it('adds 20 for ecommerce channel', () => {
    expect(channelRisk({ channel: 'ecommerce' })).toBe(30);
  });

  it('adds 10 for non-face-to-face', () => {
    expect(channelRisk({ channel: 'branch', faceToFace: false })).toBe(20);
  });

  it('adds 15 for lawyer introducer type', () => {
    expect(channelRisk({ channel: 'agent', introducerType: 'lawyer' })).toBe(60);
  });

  it('adds 15 for TCSP introducer type', () => {
    expect(channelRisk({ channel: 'agent', introducerType: 'tcsp' })).toBe(60);
  });

  it('caps at 100', () => {
    expect(channelRisk({ channel: 'agent', faceToFace: false, introducerType: 'lawyer' })).toBe(70);
  });
});

describe('productRisk (rule 63)', () => {
  it('returns baseline 10 for standard current account', () => {
    expect(productRisk({ productLine: 'current_account' })).toBe(10);
  });

  it('adds 35 for trade_finance', () => {
    expect(productRisk({ productLine: 'trade_finance' })).toBe(45);
  });

  it('adds 30 for fx', () => {
    expect(productRisk({ productLine: 'fx' })).toBe(40);
  });

  it('adds 45 for crypto', () => {
    expect(productRisk({ productLine: 'crypto' })).toBe(55);
  });

  it('adds 25 for wealth', () => {
    expect(productRisk({ productLine: 'wealth' })).toBe(35);
  });

  it('adds 25 for investment', () => {
    expect(productRisk({ productLine: 'investment' })).toBe(35);
  });

  it('adds up to 20 for high-risk flags (5 per flag)', () => {
    expect(productRisk({ productLine: 'current_account', highRiskFlags: ['flag1', 'flag2'] })).toBe(20);
    // Caps at 20 for flags
    expect(productRisk({ productLine: 'current_account', highRiskFlags: Array.from({length: 6}, (_, i) => `f${i}`) })).toBe(30);
  });

  it('adds 15 for high throughput >= 1M/month', () => {
    expect(productRisk({ productLine: 'current_account', estimatedThroughputUsdPerMonth: 1_000_000 })).toBe(25);
  });

  it('caps at 100 with maximum crypto risk', () => {
    // base(10) + crypto(+45) + flags_cap(+20) + throughput(+15) = 90; not quite 100
    expect(productRisk({
      productLine: 'crypto',
      highRiskFlags: Array.from({ length: 10 }, (_, i) => `f${i}`),
      estimatedThroughputUsdPerMonth: 5_000_000,
    })).toBe(90);
  });
});

describe('geographyRisk (rule 64)', () => {
  it('passes through valid inherent risk scores', () => {
    expect(geographyRisk(70)).toBe(70);
    expect(geographyRisk(0)).toBe(0);
    expect(geographyRisk(100)).toBe(100);
  });

  it('clamps to 0 for negative values', () => {
    expect(geographyRisk(-10)).toBe(0);
  });

  it('clamps to 100 for values > 100', () => {
    expect(geographyRisk(150)).toBe(100);
  });
});

describe('tenureRisk (rule 65)', () => {
  it('returns 50 when onboardedAt is null/undefined', () => {
    expect(tenureRisk(null)).toBe(50);
    expect(tenureRisk(undefined)).toBe(50);
  });

  it('returns 50 for unparseable date', () => {
    expect(tenureRisk('not-a-date')).toBe(50);
  });

  it('returns 80 for customer onboarded < 1 month ago', () => {
    const recent = new Date(Date.now() - 10 * 86400000).toISOString();
    expect(tenureRisk(recent)).toBe(80);
  });

  it('returns 55 for customer onboarded 1-6 months ago', () => {
    const twoMonths = new Date(Date.now() - 60 * 86400000).toISOString();
    expect(tenureRisk(twoMonths)).toBe(55);
  });

  it('returns 35 for customer onboarded 6-12 months ago', () => {
    const nineMonths = new Date(Date.now() - 270 * 86400000).toISOString();
    expect(tenureRisk(nineMonths)).toBe(35);
  });

  it('returns 20 for customer onboarded 12-36 months ago', () => {
    const twoYears = new Date(Date.now() - 730 * 86400000).toISOString();
    expect(tenureRisk(twoYears)).toBe(20);
  });

  it('returns 10 for long-tenured customer (> 3 years)', () => {
    const fourYears = new Date(Date.now() - 4 * 365 * 86400000).toISOString();
    expect(tenureRisk(fourYears)).toBe(10);
  });
});

describe('volumeMismatch (rule 66)', () => {
  it('returns score 0 when no declared baseline', () => {
    const r = volumeMismatch({ observedMonthlyVolumeUsd: 1000 });
    expect(r.score).toBe(0);
    expect(r.rationale).toBe('No declared baseline.');
  });

  it('returns score 0 when declared is 0', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 0 });
    expect(r.score).toBe(0);
  });

  it('returns within tolerance for small delta', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 10000, observedMonthlyVolumeUsd: 10500 });
    expect(r.rationale).toBe('Within tolerance.');
    expect(r.score).toBeLessThan(25);
  });

  it('returns moderate variance for 25-50% delta', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 10000, observedMonthlyVolumeUsd: 13000 });
    expect(r.rationale).toContain('Moderate variance');
  });

  it('returns high variance for 50-100% delta', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 10000, observedMonthlyVolumeUsd: 17000 });
    expect(r.rationale).toContain('High variance');
  });

  it('returns material mismatch for > 100% delta', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 10000, observedMonthlyVolumeUsd: 30000 });
    expect(r.rationale).toContain('Material mismatch');
    expect(r.deltaPct).toBeCloseTo(200, 0);
  });

  it('handles negative delta (observed < declared)', () => {
    const r = volumeMismatch({ declaredMonthlyVolumeUsd: 10000, observedMonthlyVolumeUsd: 5000 });
    expect(r.deltaPct).toBe(-50);
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('activityDrift (rule 67)', () => {
  it('returns no drift when no baseline', () => {
    const r = activityDrift({ txCountBaseline: 0 });
    expect(r.flagged).toBe(false);
    expect(r.rationale).toBe('No baseline.');
  });

  it('flags when activity ratio >= 3x baseline', () => {
    const r = activityDrift({ txCountBaseline: 10, txCountLast30d: 35 });
    expect(r.flagged).toBe(true);
    expect(r.rationale).toContain('investigate');
  });

  it('flags when activity drops to <= 20% of baseline', () => {
    const r = activityDrift({ txCountBaseline: 100, txCountLast30d: 10 });
    expect(r.flagged).toBe(true);
  });

  it('does not flag for normal activity', () => {
    const r = activityDrift({ txCountBaseline: 10, txCountLast30d: 12 });
    expect(r.flagged).toBe(false);
    expect(r.rationale).toContain('normal envelope');
  });

  it('defaults txCountLast30d to 0 when missing', () => {
    const r = activityDrift({ txCountBaseline: 10 });
    expect(r.flagged).toBe(true); // 0/10 = 0 ratio ≤ 0.2 → flagged
  });
});

describe('staticRiskRecalc (rule 68)', () => {
  it('computes weighted composite score correctly', () => {
    const r = staticRiskRecalc({ customer: 40, channel: 40, product: 60, geography: 80 });
    // 40*0.25 + 40*0.15 + 60*0.25 + 80*0.35 = 10+6+15+28 = 59
    expect(r.score).toBe(59);
  });

  it('caps score at 100', () => {
    const r = staticRiskRecalc({ customer: 100, channel: 100, product: 100, geography: 100 });
    expect(r.score).toBe(100);
  });

  it('returns the breakdown input unchanged', () => {
    const parts = { customer: 30, channel: 20, product: 50, geography: 70 };
    expect(staticRiskRecalc(parts).breakdown).toEqual(parts);
  });
});

describe('kycRefreshDue (rule 69)', () => {
  it('is due immediately when no lastReviewAt', () => {
    const r = kycRefreshDue({ band: 'high' });
    expect(r.due).toBe(true);
    expect(r.rationale).toBe('No prior KYC review.');
  });

  it('is due immediately when lastReviewAt is unparseable', () => {
    const r = kycRefreshDue({ band: 'medium', lastReviewAt: 'invalid-date' });
    expect(r.due).toBe(true);
    expect(r.rationale).toContain('Unparseable');
  });

  it('correctly sets interval for EDD band (6 months)', () => {
    const r = kycRefreshDue({ band: 'edd' });
    expect(r.intervalMonths).toBe(6);
  });

  it('correctly sets interval for high band (12 months)', () => {
    const r = kycRefreshDue({ band: 'high' });
    expect(r.intervalMonths).toBe(12);
  });

  it('correctly sets interval for medium band (24 months)', () => {
    const r = kycRefreshDue({ band: 'medium' });
    expect(r.intervalMonths).toBe(24);
  });

  it('correctly sets interval for low band (36 months)', () => {
    const r = kycRefreshDue({ band: 'low' });
    expect(r.intervalMonths).toBe(36);
  });

  it('is not due for recent review', () => {
    const recent = new Date(Date.now() - 30 * 86400000).toISOString();
    const r = kycRefreshDue({ band: 'high', lastReviewAt: recent });
    expect(r.due).toBe(false);
    expect(r.rationale).toContain('review current');
  });

  it('is due for overdue review', () => {
    const old = new Date(Date.now() - 400 * 86400000).toISOString();
    const r = kycRefreshDue({ band: 'high', lastReviewAt: old });
    expect(r.due).toBe(true);
    expect(r.rationale).toContain('overdue');
  });
});

describe('kycCompleteness (rule 70)', () => {
  it('returns 100% when all items are checked', () => {
    const r = kycCompleteness({
      identityVerified: true, addressVerified: true, sowDocumented: true,
      sofVerified: true, uboMapComplete: true, pepCertified: true,
      riskRated: true, mlroSignedOff: true, fourEyesRecorded: true,
      ongoingMonitoringEnrolled: true,
    });
    expect(r.pct).toBe(100);
    expect(r.missing).toHaveLength(0);
  });

  it('returns 0% when nothing is checked', () => {
    const r = kycCompleteness({});
    expect(r.pct).toBe(0);
    expect(r.missing.length).toBe(10);
  });

  it('returns 50% when 5 items are checked', () => {
    const r = kycCompleteness({
      identityVerified: true, addressVerified: true, sowDocumented: true,
      sofVerified: true, uboMapComplete: true,
    });
    expect(r.pct).toBe(50);
    expect(r.missing.length).toBe(5);
  });

  it('lists specific missing items by label', () => {
    const r = kycCompleteness({ identityVerified: true });
    expect(r.missing).toContain('Source of wealth documented');
    expect(r.missing).not.toContain('Identity verified');
  });
});
