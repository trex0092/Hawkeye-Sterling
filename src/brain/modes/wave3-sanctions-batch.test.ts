import { describe, expect, it } from 'vitest';
import { SANCTIONS_BATCH_APPLIES } from './wave3-sanctions-batch.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('sanctions-batch: dual_use_chemical_routing', () => {
  const apply = SANCTIONS_BATCH_APPLIES['dual_use_chemical_routing']!;

  it('returns inconclusive when no chemicalShipments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('dual_use_chemical_routing');
  });

  it('flags CWC-listed precursor', async () => {
    const r = await apply(makeCtx({ chemicalShipments: [{ shipmentId: 's1', precursorListed: 'CWC' }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags AG-listed precursor (lower weight)', async () => {
    const r = await apply(makeCtx({ chemicalShipments: [{ shipmentId: 's1', precursorListed: 'AG' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unverified_end_user', async () => {
    const r = await apply(makeCtx({ chemicalShipments: [{ shipmentId: 's1', endUserVerified: false, endUserCountryIso2: 'IR' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no precursor and end user verified', async () => {
    const r = await apply(makeCtx({ chemicalShipments: [{ shipmentId: 's1', precursorListed: 'none', endUserVerified: true }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: proliferation_finance_unscr1540', () => {
  const apply = SANCTIONS_BATCH_APPLIES['proliferation_finance_unscr1540']!;

  it('returns inconclusive when no proliferationFlows', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags listed_entity', async () => {
    const r = await apply(makeCtx({ proliferationFlows: [{ flowId: 'f1', entityListed: true }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags wmd_nexus for nuclear', async () => {
    const r = await apply(makeCtx({ proliferationFlows: [{ flowId: 'f1', programmeNexus: 'nuclear' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags wmd_nexus for missile', async () => {
    const r = await apply(makeCtx({ proliferationFlows: [{ flowId: 'f1', programmeNexus: 'missile' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags shipping_finance', async () => {
    const r = await apply(makeCtx({ proliferationFlows: [{ flowId: 'f1', financingType: 'shipping' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ proliferationFlows: [{ flowId: 'f1' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: ransomware_payment_indicator', () => {
  const apply = SANCTIONS_BATCH_APPLIES['ransomware_payment_indicator']!;

  it('returns inconclusive when no ransomEvents', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags OFAC ransomware list', async () => {
    const r = await apply(makeCtx({ ransomEvents: [{ eventId: 'e1', ofacRansomwareList: true }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags flagged crypto address', async () => {
    const r = await apply(makeCtx({ ransomEvents: [{ eventId: 'e1', cryptoAddressFlagged: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags payment_made', async () => {
    const r = await apply(makeCtx({ ransomEvents: [{ eventId: 'e1', paymentMade: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('sanctions-batch: iran_oil_sts_transfer', () => {
  const apply = SANCTIONS_BATCH_APPLIES['iran_oil_sts_transfer']!;

  it('returns inconclusive when no stsTransfers', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags AIS gap during STS >= 60min', async () => {
    const r = await apply(makeCtx({ stsTransfers: [{ transferId: 't1', vesselA: 'V1', vesselB: 'V2', aisGapMinutes: 60 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag AIS gap < 60min', async () => {
    const r = await apply(makeCtx({ stsTransfers: [{ transferId: 't1', vesselA: 'V1', vesselB: 'V2', aisGapMinutes: 59 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags crude_cargo', async () => {
    const r = await apply(makeCtx({ stsTransfers: [{ transferId: 't1', vesselA: 'V1', vesselB: 'V2', cargoType: 'CRUDE OIL' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags gulf_sts_zone when lat/lon in Persian Gulf', async () => {
    const r = await apply(makeCtx({ stsTransfers: [{ transferId: 't1', vesselA: 'V1', vesselB: 'V2', locationLat: 26, locationLon: 55 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag gulf zone when coords outside range', async () => {
    const r = await apply(makeCtx({ stsTransfers: [{ transferId: 't1', vesselA: 'V1', vesselB: 'V2', locationLat: 10, locationLon: 40 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: russia_oil_price_cap_evasion', () => {
  const apply = SANCTIONS_BATCH_APPLIES['russia_oil_price_cap_evasion']!;

  it('returns inconclusive when no oilCargo', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags above_g7_cap for Russian oil above cap', async () => {
    const r = await apply(makeCtx({ oilCargo: [{ cargoId: 'c1', declaredOriginIso2: 'RU', saleUsdPerBarrel: 70, capCeilingUsd: 60 }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('uses default cap of 60 when capCeilingUsd missing', async () => {
    const r = await apply(makeCtx({ oilCargo: [{ cargoId: 'c1', declaredOriginIso2: 'RU', saleUsdPerBarrel: 65 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when sale price <= cap', async () => {
    const r = await apply(makeCtx({ oilCargo: [{ cargoId: 'c1', declaredOriginIso2: 'RU', saleUsdPerBarrel: 60, capCeilingUsd: 60 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags no_origin_cert for RU cargo without cert', async () => {
    const r = await apply(makeCtx({ oilCargo: [{ cargoId: 'c1', declaredOriginIso2: 'RU', certificateOfOrigin: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag non-RU origin', async () => {
    const r = await apply(makeCtx({ oilCargo: [{ cargoId: 'c1', declaredOriginIso2: 'SA', saleUsdPerBarrel: 70, capCeilingUsd: 60 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: dprk_it_worker_payment', () => {
  const apply = SANCTIONS_BATCH_APPLIES['dprk_it_worker_payment']!;

  it('returns inconclusive when no dprkPayments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags flagged_dprk_worker', async () => {
    const r = await apply(makeCtx({ dprkPayments: [{ paymentId: 'p1', recipientFlaggedAsDprkItWorker: true }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags crypto_settle_dprk when crypto settled to DPRK worker', async () => {
    const r = await apply(makeCtx({ dprkPayments: [{ paymentId: 'p1', recipientFlaggedAsDprkItWorker: true, cryptoSettled: true }] }));
    expect(r.score).toBeGreaterThan(0.7);
  });

  it('does not flag crypto_settle_dprk when not DPRK worker', async () => {
    const r = await apply(makeCtx({ dprkPayments: [{ paymentId: 'p1', cryptoSettled: true, recipientFlaggedAsDprkItWorker: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: vessel_callsign_manipulation', () => {
  const apply = SANCTIONS_BATCH_APPLIES['vessel_callsign_manipulation']!;

  it('returns inconclusive when no vesselCallsigns', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags callsign_churn when callsignChangesLast90d >= 2', async () => {
    const r = await apply(makeCtx({ vesselCallsigns: [{ vesselImo: '1234567', callsignChangesLast90d: 2 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags flag_hopping when flagChangesLast365d >= 2', async () => {
    const r = await apply(makeCtx({ vesselCallsigns: [{ vesselImo: '1234567', flagChangesLast365d: 2 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags persistent_ais_off when aisOffPctLast30d >= 0.4', async () => {
    const r = await apply(makeCtx({ vesselCallsigns: [{ vesselImo: '1234567', aisOffPctLast30d: 0.4 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when all below thresholds', async () => {
    const r = await apply(makeCtx({ vesselCallsigns: [{ vesselImo: '1234567', callsignChangesLast90d: 1, flagChangesLast365d: 1, aisOffPctLast30d: 0.1 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: sanctioned_jurisdiction_layering', () => {
  const apply = SANCTIONS_BATCH_APPLIES['sanctioned_jurisdiction_layering']!;

  it('returns inconclusive when no jurisdictionLayers', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags sanctioned_layer for IR jurisdiction', async () => {
    const r = await apply(makeCtx({ jurisdictionLayers: [{ entityId: 'e1', jurisdictionIso2: 'IR' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags sanctioned_layer for KP jurisdiction (uppercase normalization)', async () => {
    const r = await apply(makeCtx({ jurisdictionLayers: [{ entityId: 'e1', jurisdictionIso2: 'kp' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags surcharge_flag', async () => {
    const r = await apply(makeCtx({ jurisdictionLayers: [{ entityId: 'e1', sanctionedSurchargeFlag: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear for non-sanctioned jurisdiction', async () => {
    const r = await apply(makeCtx({ jurisdictionLayers: [{ entityId: 'e1', jurisdictionIso2: 'AE' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('sanctions-batch: fronting_company_indicator', () => {
  const apply = SANCTIONS_BATCH_APPLIES['fronting_company_indicator']!;

  it('returns inconclusive when no frontingProfiles', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags fronting_pattern when >= 2 overlap flags', async () => {
    const r = await apply(makeCtx({ frontingProfiles: [{ entityId: 'e1', sharesAddressWithDesignated: true, sharesDirectorsWithDesignated: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when only 1 overlap flag', async () => {
    const r = await apply(makeCtx({ frontingProfiles: [{ entityId: 'e1', sharesAddressWithDesignated: true }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags with 4 overlap flags and weight capped at 0.45', async () => {
    const r = await apply(makeCtx({ frontingProfiles: [{ entityId: 'e1', sharesAddressWithDesignated: true, sharesDirectorsWithDesignated: true, sharesIndustryWithDesignated: true, isNewlyIncorporated: true }] }));
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(0.45);
  });
});
