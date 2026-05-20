// Hawkeye Sterling — trade finance red-flag pack unit tests.
// Covers all 8 exported functions: lcOverShipment, lcUnderShipment, blDiscrepancy,
// triangulation, freeZoneRedFlag, hsCodeMismatch, dualUseDetector, endUserCertCheck.

import { describe, it, expect } from 'vitest';
import {
  lcOverShipment,
  lcUnderShipment,
  blDiscrepancy,
  triangulation,
  freeZoneRedFlag,
  hsCodeMismatch,
  dualUseDetector,
  endUserCertCheck,
  type LcRecord,
  type BlRecord,
} from '../tradeFinance.js';

function makeLC(overrides: Partial<LcRecord> = {}): LcRecord {
  return {
    lcRef: 'LC-001',
    applicant: 'Acme Trading LLC',
    beneficiary: 'Beta Supplies Ltd',
    amountUsd: 100_000,
    goodsDescription: 'Standard industrial equipment',
    ...overrides,
  };
}

function makeBL(overrides: Partial<BlRecord> = {}): BlRecord {
  return {
    blNumber: 'BL-001',
    ...overrides,
  };
}

describe('lcOverShipment (rule 116)', () => {
  it('fires when shippedQty > 1.05 × declaredQty', () => {
    const r = lcOverShipment(makeLC({ declaredQty: 100, shippedQty: 120 }));
    expect(r.fired).toBe(true);
    expect(r.rationale).toContain('over-shipment');
  });

  it('does not fire when shipment is within tolerance', () => {
    const r = lcOverShipment(makeLC({ declaredQty: 100, shippedQty: 100 }));
    expect(r.fired).toBe(false);
    expect(r.rationale).toBe('shipment within tolerance');
  });

  it('does not fire when exactly at 1.05 ratio', () => {
    const r = lcOverShipment(makeLC({ declaredQty: 100, shippedQty: 105 }));
    expect(r.fired).toBe(false);
  });

  it('returns incomplete when qty data is missing', () => {
    expect(lcOverShipment(makeLC({ declaredQty: undefined, shippedQty: 100 })).fired).toBe(false);
    expect(lcOverShipment(makeLC({ declaredQty: 100, shippedQty: undefined })).fired).toBe(false);
    expect(lcOverShipment(makeLC()).rationale).toBe('qty data incomplete');
  });
});

describe('lcUnderShipment (rule 117)', () => {
  it('fires when shippedQty < 85% of declaredQty', () => {
    const r = lcUnderShipment(makeLC({ declaredQty: 100, shippedQty: 80 }));
    expect(r.fired).toBe(true);
    expect(r.rationale).toContain('value-transfer scheme');
  });

  it('does not fire when shipment is within tolerance', () => {
    const r = lcUnderShipment(makeLC({ declaredQty: 100, shippedQty: 90 }));
    expect(r.fired).toBe(false);
    expect(r.rationale).toBe('shipment within tolerance');
  });

  it('returns incomplete when qty data is missing', () => {
    expect(lcUnderShipment(makeLC()).rationale).toBe('qty data incomplete');
  });
});

describe('blDiscrepancy (rule 118)', () => {
  it('flags BL with no IMO number', () => {
    const lc = makeLC({ bls: [makeBL({ blNumber: 'BL-1', imo: undefined })] });
    const issues = blDiscrepancy(lc);
    expect(issues.some((i) => i.issue.includes('no IMO'))).toBe(true);
  });

  it('flags when notify-party equals consignee', () => {
    const lc = makeLC({
      bls: [makeBL({ blNumber: 'BL-1', imo: '1234567', notify: 'Acme', consignee: 'Acme' })],
    });
    const issues = blDiscrepancy(lc);
    expect(issues.some((i) => i.issue.includes('Notify-party = Consignee'))).toBe(true);
  });

  it('flags implausibly light cargo per container', () => {
    const lc = makeLC({
      bls: [makeBL({ blNumber: 'BL-1', imo: '9999999', containerCount: 10, declaredWeightKg: 5000 })],
    });
    const issues = blDiscrepancy(lc);
    expect(issues.some((i) => i.issue.includes('Implausibly light'))).toBe(true);
  });

  it('returns no issues for a clean BL', () => {
    const lc = makeLC({
      bls: [makeBL({ blNumber: 'BL-1', imo: '9999999', consignee: 'Bob', notify: 'Alice', containerCount: 2, declaredWeightKg: 5000 })],
    });
    expect(blDiscrepancy(lc)).toHaveLength(0);
  });

  it('returns empty when no BLs provided', () => {
    expect(blDiscrepancy(makeLC())).toHaveLength(0);
    expect(blDiscrepancy(makeLC({ bls: [] }))).toHaveLength(0);
  });

  it('can emit multiple issues for one BL', () => {
    const lc = makeLC({
      bls: [makeBL({
        blNumber: 'BL-1',
        imo: undefined, // no IMO
        notify: 'Same',
        consignee: 'Same', // notify = consignee
        containerCount: 5,
        declaredWeightKg: 1000, // 200kg/container < 1000 → light
      })],
    });
    const issues = blDiscrepancy(lc);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe('triangulation (rule 119)', () => {
  it('detects triangulation when loading and discharge ports differ', () => {
    const lc = makeLC({
      loadingPort: 'Jebel Ali',
      dischargePort: 'Rotterdam',
      bls: [makeBL({ shipper: 'Alpha Co', consignee: 'Beta Ltd' })],
    });
    const r = triangulation(lc);
    expect(r.triangulated).toBe(true);
    expect(r.rationale).toContain('Triangular route');
  });

  it('does not flag when shipper equals consignee', () => {
    const lc = makeLC({
      loadingPort: 'Jebel Ali',
      dischargePort: 'Rotterdam',
      bls: [makeBL({ shipper: 'Same Party', consignee: 'Same Party' })],
    });
    const r = triangulation(lc);
    expect(r.triangulated).toBe(false);
  });

  it('does not flag when loading port equals discharge port', () => {
    const lc = makeLC({
      loadingPort: 'Jebel Ali',
      dischargePort: 'Jebel Ali',
      bls: [makeBL({ shipper: 'Alpha', consignee: 'Beta' })],
    });
    expect(triangulation(lc).triangulated).toBe(false);
  });

  it('returns false when no BLs provided', () => {
    expect(triangulation(makeLC()).triangulated).toBe(false);
    expect(triangulation(makeLC({ bls: [] })).rationale).toBe('no BLs');
  });

  it('returns linear flow when BL lacks shipper/consignee/ports', () => {
    const lc = makeLC({
      loadingPort: 'A',
      dischargePort: 'B',
      bls: [makeBL({ blNumber: 'BL-1' })], // no shipper or consignee
    });
    expect(triangulation(lc).triangulated).toBe(false);
    expect(triangulation(lc).rationale).toBe('linear flow');
  });
});

describe('freeZoneRedFlag (rule 120)', () => {
  it('fires when both applicant and beneficiary are FZ entities', () => {
    const lc = makeLC({ applicant: 'Acme FZE', beneficiary: 'Beta DMCC' });
    const r = freeZoneRedFlag(lc);
    expect(r.fired).toBe(true);
    expect(r.rationale).toContain('Free-Zone entities');
  });

  it('does not fire when only applicant is a FZ entity', () => {
    const lc = makeLC({ applicant: 'Acme JAFZA', beneficiary: 'Normal Corp' });
    expect(freeZoneRedFlag(lc).fired).toBe(false);
  });

  it('does not fire when only beneficiary is a FZ entity', () => {
    const lc = makeLC({ applicant: 'Regular LLC', beneficiary: 'Beta FZCO' });
    expect(freeZoneRedFlag(lc).fired).toBe(false);
  });

  it('fires for ADGM and DIFC patterns', () => {
    const lc = makeLC({ applicant: 'Acme Ltd - ADGM', beneficiary: 'Beta Capital - DIFC' });
    expect(freeZoneRedFlag(lc).fired).toBe(true);
  });
});

describe('hsCodeMismatch (rule 121)', () => {
  const HS_LOOKUP: Record<string, RegExp> = {
    '7108': /gold|bullion|precious metal/i,
    '8401': /nuclear|reactor/i,
  };

  it('returns no mismatch when hsCode is absent', () => {
    const r = hsCodeMismatch(makeLC(), HS_LOOKUP);
    expect(r.mismatch).toBe(false);
    expect(r.rationale).toBe('no HS code');
  });

  it('returns no mismatch when hsCode is not in reference table', () => {
    const r = hsCodeMismatch(makeLC({ hsCode: '9999' }), HS_LOOKUP);
    expect(r.mismatch).toBe(false);
    expect(r.rationale).toContain('not in reference');
  });

  it('flags mismatch when goods description does not match HS code', () => {
    const lc = makeLC({ hsCode: '7108', goodsDescription: 'Spare motor parts for automotive use' });
    const r = hsCodeMismatch(lc, HS_LOOKUP);
    expect(r.mismatch).toBe(true);
    expect(r.rationale).toContain('does not match');
  });

  it('returns consistent when description matches HS code', () => {
    const lc = makeLC({ hsCode: '7108', goodsDescription: 'Gold bullion bars 999 fine' });
    const r = hsCodeMismatch(lc, HS_LOOKUP);
    expect(r.mismatch).toBe(false);
    expect(r.rationale).toBe('consistent');
  });
});

describe('dualUseDetector (rule 122)', () => {
  it('detects centrifuge equipment', () => {
    const hits = dualUseDetector('Industrial centrifuge equipment for laboratory use');
    expect(hits).toContain('centrifuge');
  });

  it('detects UAV (drone)', () => {
    const hits = dualUseDetector('Multi-rotor drone assembly with control systems');
    expect(hits.some((h) => /drone|UAV/i.test(h))).toBe(true);
  });

  it('detects night vision equipment', () => {
    expect(dualUseDetector('night vision goggles for security patrol').length).toBeGreaterThan(0);
  });

  it('detects maraging steel', () => {
    expect(dualUseDetector('maraging steel rods for precision tooling').length).toBeGreaterThan(0);
  });

  it('returns empty for innocuous goods', () => {
    expect(dualUseDetector('Standard office furniture and supplies')).toHaveLength(0);
  });

  it('detects encryption module', () => {
    expect(dualUseDetector('communication device with built-in encryption module').length).toBeGreaterThan(0);
  });

  it('detects gas turbine components', () => {
    expect(dualUseDetector('gas turbine blades for industrial generation').length).toBeGreaterThan(0);
  });
});

describe('endUserCertCheck (rule 123)', () => {
  const SENSITIVE_HS = new Set(['8401', '9013']);

  it('returns not required for non-sensitive HS code', () => {
    const lc = makeLC({ hsCode: '7108', bls: [] });
    const r = endUserCertCheck(lc, SENSITIVE_HS);
    expect(r.required).toBe(false);
    expect(r.missing).toBe(false);
  });

  it('returns not required when no HS code', () => {
    const r = endUserCertCheck(makeLC(), SENSITIVE_HS);
    expect(r.required).toBe(false);
  });

  it('flags missing EUC for sensitive HS code with no BLs', () => {
    const lc = makeLC({ hsCode: '8401', bls: [] });
    const r = endUserCertCheck(lc, SENSITIVE_HS);
    expect(r.required).toBe(true);
    expect(r.missing).toBe(true);
    expect(r.rationale).toContain('REQUIRED');
  });

  it('flags missing EUC when BLs lack endUserCertOnFile', () => {
    const lc = makeLC({
      hsCode: '8401',
      bls: [makeBL({ blNumber: 'BL-1', endUserCertOnFile: false })],
    });
    const r = endUserCertCheck(lc, SENSITIVE_HS);
    expect(r.required).toBe(true);
    expect(r.missing).toBe(true);
  });

  it('clears when at least one BL has EUC on file', () => {
    const lc = makeLC({
      hsCode: '8401',
      bls: [
        makeBL({ blNumber: 'BL-1', endUserCertOnFile: false }),
        makeBL({ blNumber: 'BL-2', endUserCertOnFile: true }),
      ],
    });
    const r = endUserCertCheck(lc, SENSITIVE_HS);
    expect(r.required).toBe(true);
    expect(r.missing).toBe(false);
    expect(r.rationale).toBe('EUC on file.');
  });
});
