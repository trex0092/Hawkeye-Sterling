import { describe, expect, it } from 'vitest';
import { SECURITIES_DPMS_OPS_BATCH_APPLIES } from './wave3-securities-dpms-ops-batch.js';
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

describe('securities-dpms-ops: insurance_premium_dump', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['insurance_premium_dump']!;

  it('returns inconclusive when no insurancePolicies', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('insurance_premium_dump');
  });

  it('flags rapid_surrender_high_premium when surrendered within 90d and premium >= 100k', async () => {
    const r = await apply(makeCtx({ insurancePolicies: [{ policyId: 'p1', premiumPaidAed: 100_000, surrenderedWithinDays: 90 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when surrendered > 90d', async () => {
    const r = await apply(makeCtx({ insurancePolicies: [{ policyId: 'p1', premiumPaidAed: 200_000, surrenderedWithinDays: 91 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when premium < 100k', async () => {
    const r = await apply(makeCtx({ insurancePolicies: [{ policyId: 'p1', premiumPaidAed: 99_999, surrenderedWithinDays: 30 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: life_policy_third_party_assignment', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['life_policy_third_party_assignment']!;

  it('returns inconclusive when no policyAssignments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags unrelated_assignee', async () => {
    const r = await apply(makeCtx({ policyAssignments: [{ policyId: 'p1', assigneeRelationship: 'unrelated' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags corporate_assignee', async () => {
    const r = await apply(makeCtx({ policyAssignments: [{ policyId: 'p1', assigneeRelationship: 'corporate' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags rapid_assignment when ownershipChangeWithinDays <= 90', async () => {
    const r = await apply(makeCtx({ policyAssignments: [{ policyId: 'p1', ownershipChangeWithinDays: 90 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_assignment when > 90d', async () => {
    const r = await apply(makeCtx({ policyAssignments: [{ policyId: 'p1', ownershipChangeWithinDays: 91 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('clear for spouse assignee with no rapid assignment', async () => {
    const r = await apply(makeCtx({ policyAssignments: [{ policyId: 'p1', assigneeRelationship: 'spouse' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: securities_swap_layering', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['securities_swap_layering']!;

  it('returns inconclusive when no swapTrades', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags offsetting_related_party when >= 3 offsetting and related', async () => {
    const r = await apply(makeCtx({ swapTrades: [{ tradeId: 't1', offsettingTrades: 3, counterpartyRelated: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when offsettingTrades < 3', async () => {
    const r = await apply(makeCtx({ swapTrades: [{ tradeId: 't1', offsettingTrades: 2, counterpartyRelated: true }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when not related party', async () => {
    const r = await apply(makeCtx({ swapTrades: [{ tradeId: 't1', offsettingTrades: 5, counterpartyRelated: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: wash_trading_securities', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['wash_trading_securities']!;

  it('returns inconclusive when no securitiesWashTrades', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags same_ubo', async () => {
    const r = await apply(makeCtx({ securitiesWashTrades: [{ tradeId: 't1', sameUboBothSides: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags price_move when |priceImpactBps| >= 50', async () => {
    const r = await apply(makeCtx({ securitiesWashTrades: [{ tradeId: 't1', priceImpactBps: 50 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags negative price_move >= 50 abs', async () => {
    const r = await apply(makeCtx({ securitiesWashTrades: [{ tradeId: 't1', priceImpactBps: -60 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag price_move < 50 bps', async () => {
    const r = await apply(makeCtx({ securitiesWashTrades: [{ tradeId: 't1', priceImpactBps: 49 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: spoofing_layering', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['spoofing_layering']!;

  it('returns inconclusive when no orderBookEvents', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags high_cancel_layered when cancellationRatio >= 0.95 and spoofedQuoteCount >= 10', async () => {
    const r = await apply(makeCtx({ orderBookEvents: [{ eventId: 'e1', cancellationRatio: 0.95, spoofedQuoteCount: 10 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when cancellationRatio < 0.95', async () => {
    const r = await apply(makeCtx({ orderBookEvents: [{ eventId: 'e1', cancellationRatio: 0.94, spoofedQuoteCount: 20 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when spoofedQuoteCount < 10', async () => {
    const r = await apply(makeCtx({ orderBookEvents: [{ eventId: 'e1', cancellationRatio: 0.99, spoofedQuoteCount: 9 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: pump_and_dump_indicator', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['pump_and_dump_indicator']!;

  it('returns inconclusive when no pumpDumpEvents', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags volume_spike when >= 10x', async () => {
    const r = await apply(makeCtx({ pumpDumpEvents: [{ tickerId: 'T1', volumeSpikeMultiplier: 10 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags price_move when >= 2x', async () => {
    const r = await apply(makeCtx({ pumpDumpEvents: [{ tickerId: 'T1', priceMoveMultiplier: 2 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags promotion detected', async () => {
    const r = await apply(makeCtx({ pumpDumpEvents: [{ tickerId: 'T1', promotionDetected: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when all below thresholds', async () => {
    const r = await apply(makeCtx({ pumpDumpEvents: [{ tickerId: 'T1', volumeSpikeMultiplier: 5, priceMoveMultiplier: 1 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: gold_smuggling_corridor', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['gold_smuggling_corridor']!;

  it('returns inconclusive when no goldCorridors', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags large_gold_movement when >= 10kg', async () => {
    const r = await apply(makeCtx({ goldCorridors: [{ shipmentId: 's1', weightKg: 10 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags conflict_origin for CD', async () => {
    const r = await apply(makeCtx({ goldCorridors: [{ shipmentId: 's1', declaredOriginIso2: 'CD' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags conflict_origin (case insensitive)', async () => {
    const r = await apply(makeCtx({ goldCorridors: [{ shipmentId: 's1', declaredOriginIso2: 'sd' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags conflict_minerals_risk', async () => {
    const r = await apply(makeCtx({ goldCorridors: [{ shipmentId: 's1', conflictMineralsRisk: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('securities-dpms-ops: dpms_fictitious_supplier', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['dpms_fictitious_supplier']!;

  it('returns inconclusive when no fictitiousSuppliers', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags not_in_registry', async () => {
    const r = await apply(makeCtx({ fictitiousSuppliers: [{ supplierId: 's1', existsInRegistry: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unverified_address', async () => {
    const r = await apply(makeCtx({ fictitiousSuppliers: [{ supplierId: 's1', addressVerified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags invalid_license', async () => {
    const r = await apply(makeCtx({ fictitiousSuppliers: [{ supplierId: 's1', tradeLicenseValid: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when all verified', async () => {
    const r = await apply(makeCtx({ fictitiousSuppliers: [{ supplierId: 's1', existsInRegistry: true, addressVerified: true, tradeLicenseValid: true }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: precious_stones_provenance_gap', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['precious_stones_provenance_gap']!;

  it('returns inconclusive when no preciousStones', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags no_provenance when provenanceCertified=false', async () => {
    const r = await apply(makeCtx({ preciousStones: [{ stoneId: 's1', provenanceCertified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags conflict_region', async () => {
    const r = await apply(makeCtx({ preciousStones: [{ stoneId: 's1', provenanceCertified: true, certifyingAuthority: 'GIA', conflictRiskRegion: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unnamed_authority when certified but no authority name', async () => {
    const r = await apply(makeCtx({ preciousStones: [{ stoneId: 's1', provenanceCertified: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when certified with authority and no conflict', async () => {
    const r = await apply(makeCtx({ preciousStones: [{ stoneId: 's1', provenanceCertified: true, certifyingAuthority: 'GIA', conflictRiskRegion: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: bullion_warehouse_anomaly', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['bullion_warehouse_anomaly']!;

  it('returns inconclusive when no bullionWarehouses', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags reconciliation_variance when |variance| >= 1kg', async () => {
    const r = await apply(makeCtx({ bullionWarehouses: [{ warehouseId: 'w1', stockReconcilationVarianceKg: 1 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags reconciliation_variance for negative variance >= 1kg abs', async () => {
    const r = await apply(makeCtx({ bullionWarehouses: [{ warehouseId: 'w1', stockReconcilationVarianceKg: -2 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags stale_audit when lastAuditDaysAgo >= 365', async () => {
    const r = await apply(makeCtx({ bullionWarehouses: [{ warehouseId: 'w1', lastAuditDaysAgo: 365 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no issues', async () => {
    const r = await apply(makeCtx({ bullionWarehouses: [{ warehouseId: 'w1', stockReconcilationVarianceKg: 0, lastAuditDaysAgo: 30 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: assay_certificate_inconsistency', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['assay_certificate_inconsistency']!;

  it('returns inconclusive when no assayCerts', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags purity_mismatch when |declared - verified| > 0.01', async () => {
    const r = await apply(makeCtx({ assayCerts: [{ certId: 'c1', declaredPurity: 0.999, verifiedPurity: 0.985 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when difference <= 0.01', async () => {
    const r = await apply(makeCtx({ assayCerts: [{ certId: 'c1', declaredPurity: 0.999, verifiedPurity: 0.990 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags unaccredited_lab when assayLabAccredited=false', async () => {
    const r = await apply(makeCtx({ assayCerts: [{ certId: 'c1', assayLabAccredited: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('skips purity check when values missing', async () => {
    const r = await apply(makeCtx({ assayCerts: [{ certId: 'c1' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: dormant_company_reactivation', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['dormant_company_reactivation']!;

  it('returns inconclusive when no companyReactivations', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags dormant_then_active when 2+ years dormant, recently reactivated, volume >= 500k', async () => {
    const r = await apply(makeCtx({ companyReactivations: [{ entityId: 'e1', dormantYears: 2, recentReactivation: true, postReactivationVolumeAed: 500_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when dormantYears < 2', async () => {
    const r = await apply(makeCtx({ companyReactivations: [{ entityId: 'e1', dormantYears: 1, recentReactivation: true, postReactivationVolumeAed: 1_000_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when not recently reactivated', async () => {
    const r = await apply(makeCtx({ companyReactivations: [{ entityId: 'e1', dormantYears: 5, recentReactivation: false, postReactivationVolumeAed: 1_000_000 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when volume < 500k', async () => {
    const r = await apply(makeCtx({ companyReactivations: [{ entityId: 'e1', dormantYears: 3, recentReactivation: true, postReactivationVolumeAed: 499_999 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: director_resignation_cluster', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['director_resignation_cluster']!;

  it('returns inconclusive when no resignationClusters', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags mass_resignation when >= 3 resignations in 90d', async () => {
    const r = await apply(makeCtx({ resignationClusters: [{ entityId: 'e1', resignationsLast90d: 3, rolesAffected: ['CEO', 'CFO', 'COO'] }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when < 3 resignations', async () => {
    const r = await apply(makeCtx({ resignationClusters: [{ entityId: 'e1', resignationsLast90d: 2 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('handles missing rolesAffected gracefully', async () => {
    const r = await apply(makeCtx({ resignationClusters: [{ entityId: 'e1', resignationsLast90d: 4 }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('securities-dpms-ops: registered_agent_concentration', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['registered_agent_concentration']!;

  it('returns inconclusive when no agentConcentrations', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags mass_client when clientCount >= 50', async () => {
    const r = await apply(makeCtx({ agentConcentrations: [{ agentId: 'a1', clientCount: 50 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags filing_bounces when bouncedFilingsLast90d >= 5', async () => {
    const r = await apply(makeCtx({ agentConcentrations: [{ agentId: 'a1', bouncedFilingsLast90d: 5 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when below thresholds', async () => {
    const r = await apply(makeCtx({ agentConcentrations: [{ agentId: 'a1', clientCount: 49, bouncedFilingsLast90d: 4 }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('securities-dpms-ops: mass_filing_same_day', () => {
  const apply = SECURITIES_DPMS_OPS_BATCH_APPLIES['mass_filing_same_day']!;

  it('returns inconclusive when no massFilings', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags same_day_burst when >= 20 filings by same agent', async () => {
    const r = await apply(makeCtx({ massFilings: [{ filingDate: '2024-01-01', filingsCount: 20, sameAgent: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when filingsCount < 20', async () => {
    const r = await apply(makeCtx({ massFilings: [{ filingDate: '2024-01-01', filingsCount: 19, sameAgent: true }] }));
    expect(r.verdict).toBe('clear');
  });

  it('does not flag when sameAgent=false', async () => {
    const r = await apply(makeCtx({ massFilings: [{ filingDate: '2024-01-01', filingsCount: 50, sameAgent: false }] }));
    expect(r.verdict).toBe('clear');
  });
});
