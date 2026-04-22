import { describe, it, expect } from 'vitest';
import {
  jurisdictionProfile, jurisdictionCascadeRisk,
  allFatfBlack, allSanctionedRegimes, JURISDICTION_DATA_AS_OF,
} from './jurisdictions.js';

describe('jurisdictionProfile', () => {
  it('flags DPRK as black + sanctioned_regime + conflict', () => {
    const p = jurisdictionProfile('KP');
    expect(p.tiers).toContain('fatf_black');
    expect(p.tiers).toContain('sanctioned_regime');
    expect(p.riskScore).toBe(1);
  });
  it('flags KY as high-secrecy', () => {
    const p = jurisdictionProfile('KY');
    expect(p.tiers).toContain('secrecy_high');
  });
  it('returns standard for GB', () => {
    const p = jurisdictionProfile('GB');
    expect(p.tiers).toEqual(['standard']);
    expect(p.riskScore).toBeLessThan(0.1);
  });
  it('data as-of stamp present', () => {
    expect(JURISDICTION_DATA_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('jurisdictionCascadeRisk', () => {
  it('composes secrecy hops', () => {
    const r = jurisdictionCascadeRisk(['KY', 'BM', 'BS', 'GB']);
    expect(r.compositeScore).toBeGreaterThan(r.worst.riskScore - 0.01);
    expect(r.chain.length).toBe(4);
  });
  it('is 0 on empty input', () => {
    const r = jurisdictionCascadeRisk([]);
    expect(r.compositeScore).toBe(0);
  });
});

describe('registry', () => {
  it('has at least 3 FATF black jurisdictions', () => {
    expect(allFatfBlack().length).toBeGreaterThanOrEqual(3);
  });
  it('has sanctioned regimes including KP + IR + RU', () => {
    const r = allSanctionedRegimes();
    expect(r).toContain('KP');
    expect(r).toContain('IR');
    expect(r).toContain('RU');
  });
});
