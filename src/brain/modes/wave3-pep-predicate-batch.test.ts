import { describe, expect, it } from 'vitest';
import { PEP_PREDICATE_BATCH_APPLIES } from './wave3-pep-predicate-batch.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'individual' },
    evidence,
    priorFindings: [],
    domains: [],
  };
}

describe('wave3-pep-predicate-batch: domestic_pep_concentration', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['domestic_pep_concentration']!;

  it('returns inconclusive when no domesticPeps evidence', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('domestic_pep_concentration');
  });

  it('returns clear when no thresholds hit', async () => {
    const r = await apply(makeCtx({ domesticPeps: [{ pepId: 'p1', concentratedAccounts: 2, familyMemberCount: 2 }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags account_cluster when concentratedAccounts >= 5', async () => {
    const r = await apply(makeCtx({ domesticPeps: [{ pepId: 'p1', concentratedAccounts: 5 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags family_cluster when familyMemberCount >= 5', async () => {
    const r = await apply(makeCtx({ domesticPeps: [{ pepId: 'p1', familyMemberCount: 5 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates with combined signals >= 0.6', async () => {
    // account_cluster (0.35) + family_cluster (0.25) = 0.60 → escalate
    const r = await apply(makeCtx({ domesticPeps: [{ pepId: 'p1', concentratedAccounts: 10, familyMemberCount: 8 }] }));
    expect(r.verdict).toBe('escalate');
  });
});

describe('wave3-pep-predicate-batch: soe_executive_payout', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['soe_executive_payout']!;

  it('returns inconclusive when no soeExecs', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags large_soe_payout when payoutAed >= 500000', async () => {
    const r = await apply(makeCtx({ soeExecs: [{ execId: 'e1', payoutAed: 500_000, soeName: 'TestSOE' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags tender_linked when relatedToTender is true', async () => {
    const r = await apply(makeCtx({ soeExecs: [{ execId: 'e1', relatedToTender: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when payout below threshold and no tender', async () => {
    const r = await apply(makeCtx({ soeExecs: [{ execId: 'e1', payoutAed: 100_000, relatedToTender: false }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags large_soe_payout with missing soeName (uses ? fallback in label)', async () => {
    const r = await apply(makeCtx({ soeExecs: [{ execId: 'e1', payoutAed: 600_000 }] }));
    // soeName ?? '?' → '?' in label
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('wave3-pep-predicate-batch: electoral_window_anomaly', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['electoral_window_anomaly']!;

  it('returns inconclusive when no electoralWindows', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags election_window_pep_flow when within ±60d and PEP-linked', async () => {
    const r = await apply(makeCtx({ electoralWindows: [{ jurisdictionIso2: 'AE', daysFromElection: 30, flowAed: 100_000, recipientPepLinked: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when outside 60d window', async () => {
    const r = await apply(makeCtx({ electoralWindows: [{ jurisdictionIso2: 'AE', daysFromElection: 90, recipientPepLinked: true }] }));
    expect(r.verdict).toBe('clear');
  });

  it('clear when not PEP-linked even if within 60d', async () => {
    const r = await apply(makeCtx({ electoralWindows: [{ jurisdictionIso2: 'AE', daysFromElection: 10, recipientPepLinked: false }] }));
    expect(r.verdict).toBe('clear');
  });

  it('flags when daysFromElection is negative (before election)', async () => {
    const r = await apply(makeCtx({ electoralWindows: [{ jurisdictionIso2: 'AE', daysFromElection: -30, recipientPepLinked: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when daysFromElection is undefined (defaults to 999, > 60)', async () => {
    const r = await apply(makeCtx({ electoralWindows: [{ jurisdictionIso2: 'AE', recipientPepLinked: true }] }));
    // daysFromElection ?? 999 → |999| > 60 → no flag
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: judicial_payment_correlation', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['judicial_payment_correlation']!;

  it('returns inconclusive when no judicialPayments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags ruling_proximity within ±30d and linked to bench', async () => {
    const r = await apply(makeCtx({ judicialPayments: [{ paymentId: 'p1', daysFromRulingFavoring: 10, recipientLinkedToBench: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when outside 30d window', async () => {
    const r = await apply(makeCtx({ judicialPayments: [{ paymentId: 'p1', daysFromRulingFavoring: 60, recipientLinkedToBench: true }] }));
    expect(r.verdict).toBe('clear');
  });

  it('clear when not linked to bench', async () => {
    const r = await apply(makeCtx({ judicialPayments: [{ paymentId: 'p1', daysFromRulingFavoring: 5, recipientLinkedToBench: false }] }));
    expect(r.verdict).toBe('clear');
  });

  it('clear when daysFromRulingFavoring is undefined (defaults to 999, > 30)', async () => {
    const r = await apply(makeCtx({ judicialPayments: [{ paymentId: 'p1', recipientLinkedToBench: true }] }));
    // daysFromRulingFavoring ?? 999 → |999| > 30 → no flag
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: procurement_kickback_pattern', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['procurement_kickback_pattern']!;

  it('returns inconclusive when no procurementRecords', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags no_competition when declaredCompetitiveBids <= 1', async () => {
    const r = await apply(makeCtx({ procurementRecords: [{ tenderId: 't1', declaredCompetitiveBids: 1 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags fresh_winner when winnerNewlyIncorporated', async () => {
    const r = await apply(makeCtx({ procurementRecords: [{ tenderId: 't1', winnerNewlyIncorporated: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags official_link when winnerLinkedToOfficial', async () => {
    const r = await apply(makeCtx({ procurementRecords: [{ tenderId: 't1', winnerLinkedToOfficial: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when all good', async () => {
    const r = await apply(makeCtx({ procurementRecords: [{ tenderId: 't1', declaredCompetitiveBids: 5, winnerNewlyIncorporated: false, winnerLinkedToOfficial: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: extractive_payment_opacity', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['extractive_payment_opacity']!;

  it('returns inconclusive when no extractivePayments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags non_eiti_extractive when oilGasMining and not eiti compliant', async () => {
    const r = await apply(makeCtx({ extractivePayments: [{ paymentId: 'p1', sectorOilGasMining: true, eitiCompliant: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags opaque_intermediary', async () => {
    const r = await apply(makeCtx({ extractivePayments: [{ paymentId: 'p1', opaqueIntermediary: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when compliant and no intermediary', async () => {
    const r = await apply(makeCtx({ extractivePayments: [{ paymentId: 'p1', sectorOilGasMining: true, eitiCompliant: true, opaqueIntermediary: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: human_trafficking_pattern', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['human_trafficking_pattern']!;

  it('returns inconclusive when no traffickingSignals', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags high_risk_corridor', async () => {
    const r = await apply(makeCtx({ traffickingSignals: [{ caseId: 'c1', recipientLocationsHighRisk: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags micro_transfers', async () => {
    const r = await apply(makeCtx({ traffickingSignals: [{ caseId: 'c1', massiveSmallTransfers: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags pseudonym_recipients', async () => {
    const r = await apply(makeCtx({ traffickingSignals: [{ caseId: 'c1', pseudonymPattern: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ traffickingSignals: [{ caseId: 'c1' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: wildlife_trafficking_indicator', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['wildlife_trafficking_indicator']!;

  it('returns inconclusive when no wildlifeFlows', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags cites_appendix_i', async () => {
    const r = await apply(makeCtx({ wildlifeFlows: [{ flowId: 'f1', cargoSpeciesCitesListed: 'I' }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags cites_appendix_ii', async () => {
    const r = await apply(makeCtx({ wildlifeFlows: [{ flowId: 'f1', cargoSpeciesCitesListed: 'II' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags african_asian_corridor', async () => {
    const r = await apply(makeCtx({ wildlifeFlows: [{ flowId: 'f1', corridorAfricaAsia: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when species is none and no corridor', async () => {
    const r = await apply(makeCtx({ wildlifeFlows: [{ flowId: 'f1', cargoSpeciesCitesListed: 'none', corridorAfricaAsia: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: drug_proceeds_indicator', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['drug_proceeds_indicator']!;

  it('returns inconclusive when no drugProceeds', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags cash_intense deposits', async () => {
    const r = await apply(makeCtx({ drugProceeds: [{ caseId: 'c1', cashIntenseDeposits: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags production_region_nexus', async () => {
    const r = await apply(makeCtx({ drugProceeds: [{ caseId: 'c1', geoNexusToProductionRegion: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ drugProceeds: [{ caseId: 'c1' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: illegal_logging_payment', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['illegal_logging_payment']!;

  it('returns inconclusive when no loggingPayments', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags no_flegt_high_risk when high deforestation and not FLEGT certified', async () => {
    const r = await apply(makeCtx({ loggingPayments: [{ flowId: 'f1', recipientCountryHighDeforestation: true, flegtCertified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when FLEGT certified', async () => {
    const r = await apply(makeCtx({ loggingPayments: [{ flowId: 'f1', recipientCountryHighDeforestation: true, flegtCertified: true }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: tax_evasion_offshore', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['tax_evasion_offshore']!;

  it('returns inconclusive when no offshoreTaxRecords', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags high_offshore_share when >= 0.7', async () => {
    const r = await apply(makeCtx({ offshoreTaxRecords: [{ entityId: 'e1', offshoreSubsidiaryShare: 0.8 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags low_tax_jur when declared', async () => {
    const r = await apply(makeCtx({ offshoreTaxRecords: [{ entityId: 'e1', lowTaxJurDeclared: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when below thresholds', async () => {
    const r = await apply(makeCtx({ offshoreTaxRecords: [{ entityId: 'e1', offshoreSubsidiaryShare: 0.3, lowTaxJurDeclared: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: fraud_419_pattern', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['fraud_419_pattern']!;

  it('returns inconclusive when no fraudSignals', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags advance_fee pattern', async () => {
    const r = await apply(makeCtx({ fraudSignals: [{ caseId: 'c1', advanceFeePattern: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags impersonation pattern', async () => {
    const r = await apply(makeCtx({ fraudSignals: [{ caseId: 'c1', impersonationPattern: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ fraudSignals: [{ caseId: 'c1' }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: counterfeit_supply_chain', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['counterfeit_supply_chain']!;

  it('returns inconclusive when no counterfeitFlows', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags brand_flag', async () => {
    const r = await apply(makeCtx({ counterfeitFlows: [{ shipmentId: 's1', brandFlagged: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags known_hub route', async () => {
    const r = await apply(makeCtx({ counterfeitFlows: [{ shipmentId: 's1', routeViaKnownHub: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ counterfeitFlows: [{ shipmentId: 's1', brandFlagged: false, routeViaKnownHub: false }] }));
    expect(r.verdict).toBe('clear');
  });
});

describe('wave3-pep-predicate-batch: smuggling_corridor_uae', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['smuggling_corridor_uae']!;

  it('returns inconclusive when no smugglingFlows', async () => {
    const r = await apply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
  });

  it('flags declaration_discrepancy', async () => {
    const r = await apply(makeCtx({ smugglingFlows: [{ eventId: 'e1', uaeBorderPort: 'DXB', declarationDiscrepancy: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags concealment_method', async () => {
    const r = await apply(makeCtx({ smugglingFlows: [{ eventId: 'e1', concealmentMethodFlagged: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('clear when no signals', async () => {
    const r = await apply(makeCtx({ smugglingFlows: [{ eventId: 'e1', declarationDiscrepancy: false, concealmentMethodFlagged: false }] }));
    expect(r.verdict).toBe('clear');
  });

  it('handles missing uaeBorderPort gracefully', async () => {
    const r = await apply(makeCtx({ smugglingFlows: [{ eventId: 'e1', declarationDiscrepancy: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('wave3-pep-predicate-batch: build() score compression', () => {
  const apply = PEP_PREDICATE_BATCH_APPLIES['procurement_kickback_pattern']!;

  it('compresses score when raw > 0.7', async () => {
    // declaredCompetitiveBids=0 (0.3) + freshWinner (0.3) + officialLink (0.4) = 1.0
    const r = await apply(makeCtx({ procurementRecords: [
      { tenderId: 't1', declaredCompetitiveBids: 0, winnerNewlyIncorporated: true, winnerLinkedToOfficial: true }
    ]}));
    expect(r.score).toBeLessThan(1);
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.verdict).toBe('escalate');
  });
});
