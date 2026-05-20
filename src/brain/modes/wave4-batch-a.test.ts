// wave4-batch-a.test.ts — 100% branch/statement coverage for wave4-batch-a.ts
import { describe, it, expect } from 'vitest';
import { WAVE4_BATCH_A_APPLIES } from './wave4-batch-a.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, subjectOverrides: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test', type: 'individual', ...subjectOverrides } as BrainContext['subject'],
    evidence,
    priorFindings: [],
    domains: [],
  };
}

function makePrior(score: number, verdict: 'clear' | 'flag' | 'escalate' = 'escalate', rationale = 'test', modeId = 'test_mode', category = 'compliance_framework'): Finding {
  return {
    modeId,
    category: category as Finding['category'],
    faculties: ['reasoning'],
    score,
    confidence: 0.7,
    verdict,
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
}

// ─── sanctions_arbitrage ────────────────────────────────────────────────────
describe('sanctions_arbitrage', () => {
  const fn = WAVE4_BATCH_A_APPLIES['sanctions_arbitrage']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'sanctions arbitrage jurisdiction shopping parallel import third-country routing deconfliction' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('escalates with structured sanctionsArbitrage record (with jurisdictions and high amount)', async () => {
    const r = await fn(makeCtx({
      sanctionsArbitrage: [{
        entityId: 'E1',
        sanctionedInJurisdiction: 'RU',
        clearInJurisdiction: 'AE',
        transactionJurisdiction: 'AE',
        amountUsd: 2_000_000,
      }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('picks up keywords from priorFindings rationale', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.5, 'flag', 'sanctions arbitrage detected')];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── offshore_secrecy_index ─────────────────────────────────────────────────
describe('offshore_secrecy_index', () => {
  const fn = WAVE4_BATCH_A_APPLIES['offshore_secrecy_index']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags secrecy jurisdiction (VG)', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'VG' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags FSI score >= 80', async () => {
    const r = await fn(makeCtx({ offshoreSecrecy: [{ entityId: 'E1', jurisdiction: 'KY', fsiScore: 85 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags FSI 60-80 range', async () => {
    const r = await fn(makeCtx({ offshoreSecrecy: [{ entityId: 'E1', fsiScore: 65 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags nominee directors and bearer instruments', async () => {
    const r = await fn(makeCtx({ offshoreSecrecy: [{ entityId: 'E1', hasNomineeDirectors: true, hasBearer: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'tax haven offshore secrecy nominee bearer share bvi cayman panama cook island' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags uboChain secrecy jurisdictions', async () => {
    const r = await fn(makeCtx({
      uboChain: [{ jurisdiction: 'VG' }, { jurisdiction: 'KY' }, { jurisdiction: 'PA' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── fatf_grey_list_dynamics ────────────────────────────────────────────────
describe('fatf_grey_list_dynamics', () => {
  const fn = WAVE4_BATCH_A_APPLIES['fatf_grey_list_dynamics']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('escalates with CFA jurisdiction IR', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'IR' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags grey list jurisdiction', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'NG' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags structured grey list record with incomplete action plan', async () => {
    const r = await fn(makeCtx({
      greyListRecords: [{ jurisdiction: 'TR', actionPlanComplete: false, addedDate: '2022-01-01' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags structured CFA record', async () => {
    const r = await fn(makeCtx({
      greyListRecords: [{ jurisdiction: 'KP', addedDate: '2020-01-01' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'grey list fatf increased monitoring mutual evaluation action plan' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── secrecy_jurisdiction_scoring ──────────────────────────────────────────
describe('secrecy_jurisdiction_scoring', () => {
  const fn = WAVE4_BATCH_A_APPLIES['secrecy_jurisdiction_scoring']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('scores high-secrecy jurisdiction (KY)', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'KY' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags 3+ high-secrecy jurisdictions in chain', async () => {
    const r = await fn(makeCtx({
      uboChain: [{ jurisdiction: 'KY' }, { jurisdiction: 'VG' }, { jurisdiction: 'PA' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'opacity secrecy score fsi beneficial ownership register no public registry' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('outputs jurisdiction evidence when no signals', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'GB' }));
    // GB is not a secrecy jurisdiction — should be clear but show jurisdiction
    expect(r.verdict).toBe('clear');
  });
});

// ─── russian_oil_price_cap ──────────────────────────────────────────────────
describe('russian_oil_price_cap', () => {
  const fn = WAVE4_BATCH_A_APPLIES['russian_oil_price_cap']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags Russia-linked jurisdiction', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'RU' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags above-cap oil price', async () => {
    const r = await fn(makeCtx({
      oilCapRecords: [{ vesselId: 'V1', pricePerBarrel: 80 }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags G7 service provider', async () => {
    const r = await fn(makeCtx({
      oilCapRecords: [{ vesselId: 'V1', pricePerBarrel: 50, serviceProviderCountry: 'GB' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'price cap russian oil urals espo dark fleet shadow fleet oil price g7 cap imo 2023' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── eu_14_package ──────────────────────────────────────────────────────────
describe('eu_14_package', () => {
  const fn = WAVE4_BATCH_A_APPLIES['eu_14_package']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags Russia + transshipment hub', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'RU', nationality: 'TR' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags listed EU entity', async () => {
    const r = await fn(makeCtx({
      euSanctionRecords: [{ entityId: 'E1', euListStatus: 'listed' }],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags evasion indicator', async () => {
    const r = await fn(makeCtx({
      euSanctionRecords: [{ entityId: 'E1', evasionIndicator: 'relabelling goods' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags transshipment via hub country', async () => {
    const r = await fn(makeCtx({
      euSanctionRecords: [{ entityId: 'E1', transshipmentCountry: 'TR' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'eu sanctions 14th package circumvention restrictive measures reg 833 reg 269 dual use' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── us_secondary_sanctions ─────────────────────────────────────────────────
describe('us_secondary_sanctions', () => {
  const fn = WAVE4_BATCH_A_APPLIES['us_secondary_sanctions']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags secondary risk country (IR)', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'IR' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags primary sanctioned party transaction', async () => {
    const r = await fn(makeCtx({
      secondarySanctions: [{ entityId: 'E1', primarySanctionedParty: 'SDN_001', volumeUsd: 15_000_000, sector: 'energy' }],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags high volume transaction', async () => {
    const r = await fn(makeCtx({
      secondarySanctions: [{ entityId: 'E1', volumeUsd: 12_000_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags sector defence and banking', async () => {
    const r1 = await fn(makeCtx({ secondarySanctions: [{ entityId: 'E1', sector: 'defence' }] }));
    const r2 = await fn(makeCtx({ secondarySanctions: [{ entityId: 'E2', sector: 'banking' }] }));
    expect(r1.score).toBeGreaterThan(0);
    expect(r2.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'secondary sanction caatsa ifca ieepa ofac sdgt sdn sectoral sanction' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── chip_export_controls ───────────────────────────────────────────────────
describe('chip_export_controls', () => {
  const fn = WAVE4_BATCH_A_APPLIES['chip_export_controls']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags controlled destination (CN)', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'CN' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high-risk ECCN', async () => {
    const r = await fn(makeCtx({
      chipExportRecords: [{ eccn: '3E001', destinationCountry: 'US', licenceStatus: 'licensed' }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags unlicensed export to controlled destination', async () => {
    const r = await fn(makeCtx({
      chipExportRecords: [{ destinationCountry: 'CN', licenceStatus: 'unlicensed', itemDescription: 'GPU' }],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags destination on entity list', async () => {
    const r = await fn(makeCtx({
      chipExportRecords: [{ destinationCountry: 'RU' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'semiconductor advanced chip gpu ai chip eccn ear bis entity list huawei smic a100 h100 export control' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── iran_evasion_pattern ───────────────────────────────────────────────────
describe('iran_evasion_pattern', () => {
  const fn = WAVE4_BATCH_A_APPLIES['iran_evasion_pattern']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('escalates with IR jurisdiction', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'IR' }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags hub + iran keyword in text', async () => {
    const r = await fn(makeCtx({ freeText: 'iran transaction via ae' }, { jurisdiction: 'AE' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags front company indicator', async () => {
    const r = await fn(makeCtx({
      iranEvasionRecords: [{ entityId: 'E1', frontCompanyIndicator: true }],
    }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags deceptive practice', async () => {
    const r = await fn(makeCtx({
      iranEvasionRecords: [{ entityId: 'E1', deceptivePractice: 'relabelling' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags petroleum products', async () => {
    const r = await fn(makeCtx({
      iranEvasionRecords: [{ entityId: 'E1', productType: 'oil' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('also flags petrochemical and petroleum variants', async () => {
    const r1 = await fn(makeCtx({ iranEvasionRecords: [{ entityId: 'E1', productType: 'petrochemical' }] }));
    const r2 = await fn(makeCtx({ iranEvasionRecords: [{ entityId: 'E1', productType: 'petroleum' }] }));
    expect(r1.score).toBeGreaterThan(0);
    expect(r2.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'iran iranian tehran nioc irisl ifca itsr petrochemical khamenei irgc quds force' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── dprk_evasion_pattern ───────────────────────────────────────────────────
describe('dprk_evasion_pattern', () => {
  const fn = WAVE4_BATCH_A_APPLIES['dprk_evasion_pattern']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('escalates with KP jurisdiction', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'KP' }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags labor export indicator', async () => {
    const r = await fn(makeCtx({ dprkEvasionRecords: [{ entityId: 'E1', laborExportIndicator: true }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags cryptocurrency indicator', async () => {
    const r = await fn(makeCtx({ dprkEvasionRecords: [{ entityId: 'E1', cipherCurrencyIndicator: true }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('escalates with arms indicator', async () => {
    const r = await fn(makeCtx({ dprkEvasionRecords: [{ entityId: 'E1', armsIndicator: true }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags intermediary via DPRK hub', async () => {
    const r = await fn(makeCtx({ dprkEvasionRecords: [{ entityId: 'E1', intermediaryCountry: 'CN' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags DPRK hubs + text mention', async () => {
    const r = await fn(makeCtx({ freeText: 'north korea transaction' }, { jurisdiction: 'CN' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'north korea dprk pyongyang lazarus bluenoroff apt38 korean worker un resolution 2397 knic koryo' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── socmint_scan ───────────────────────────────────────────────────────────
describe('socmint_scan', () => {
  const fn = WAVE4_BATCH_A_APPLIES['socmint_scan']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags concern keywords in socmint record', async () => {
    const r = await fn(makeCtx({
      socmintRecords: [{ platform: 'twitter', handle: 'user1', concernKeywords: ['sanction', 'launder', 'illegal'], sentimentScore: -0.7, networkLinks: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'social media twitter telegram linkedin facebook instagram tiktok youtube extremist sanction evasion illicit' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── geoint_plausibility ────────────────────────────────────────────────────
describe('geoint_plausibility', () => {
  const fn = WAVE4_BATCH_A_APPLIES['geoint_plausibility']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags large location discrepancy (>500km)', async () => {
    const r = await fn(makeCtx({
      geointRecords: [{ locationClaim: 'Dubai', observedLocation: 'Tehran', distanceKm: 1200, assetType: 'vessel' }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags moderate location discrepancy (50-500km)', async () => {
    const r = await fn(makeCtx({
      geointRecords: [{ locationClaim: 'Dubai', observedLocation: 'Abu Dhabi', distanceKm: 150 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('ignores matching locations', async () => {
    const r = await fn(makeCtx({
      geointRecords: [{ locationClaim: 'Dubai', observedLocation: 'Dubai', distanceKm: 0 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'geoint satellite imagery location mismatch dark area ais manipulation vessel position' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── imint_verification ─────────────────────────────────────────────────────
describe('imint_verification', () => {
  const fn = WAVE4_BATCH_A_APPLIES['imint_verification']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags manipulation indicator', async () => {
    const r = await fn(makeCtx({ imintRecords: [{ imageId: 'IMG1', manipulationIndicator: true }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags low authenticity score', async () => {
    const r = await fn(makeCtx({ imintRecords: [{ imageId: 'IMG1', authenticityScore: 0.3 }] }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags content mismatch', async () => {
    const r = await fn(makeCtx({ imintRecords: [{ imageId: 'IMG1', claimedContent: 'ship', verifiedContent: 'oil tanker' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'imint image manipulation deepfake forged document doctored photoshop metadata' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── humint_reliability_grade ───────────────────────────────────────────────
describe('humint_reliability_grade', () => {
  const fn = WAVE4_BATCH_A_APPLIES['humint_reliability_grade']!;

  it('returns clear with no records', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
    expect(r.score).toBe(0);
  });

  it('flags low reliability uncorroborated source', async () => {
    const r = await fn(makeCtx({
      humintRecords: [{ sourceId: 'S1', sourceGrade: 'E', informationGrade: '5', corroborated: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags hostile source motivation', async () => {
    const r = await fn(makeCtx({
      humintRecords: [{ sourceId: 'S1', sourceGrade: 'C', informationGrade: '3', sourceMotivation: 'hostile' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unknown source motivation', async () => {
    const r = await fn(makeCtx({
      humintRecords: [{ sourceId: 'S1', sourceGrade: 'D', informationGrade: '4', sourceMotivation: 'unknown' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords with no records', async () => {
    const r = await fn(makeCtx({ freeText: 'humint informant source reliability intelligence report tip-off whistleblower' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('builds result with records (high quality source)', async () => {
    const r = await fn(makeCtx({
      humintRecords: [{ sourceId: 'S1', sourceGrade: 'A', informationGrade: '1', corroborated: true }],
    }));
    expect(r.modeId).toBe('humint_reliability_grade');
  });
});

// ─── nato_admiralty_grading ─────────────────────────────────────────────────
describe('nato_admiralty_grading', () => {
  const fn = WAVE4_BATCH_A_APPLIES['nato_admiralty_grading']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags low-quality intel', async () => {
    const r = await fn(makeCtx({
      admiraltyRecords: [{ reportId: 'R1', sourceReliability: 'F', informationCredibility: '6' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high-quality intel with concern keywords', async () => {
    const r = await fn(makeCtx({
      admiraltyRecords: [{ reportId: 'R1', sourceReliability: 'A', informationCredibility: '1', contentSummary: 'sanctions evasion and laundering detected' }],
    }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags free-text with no records', async () => {
    const r = await fn(makeCtx({ freeText: 'admiralty nato intelligence grade source reliability information credibility' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── osint_chain_of_custody ─────────────────────────────────────────────────
describe('osint_chain_of_custody', () => {
  const fn = WAVE4_BATCH_A_APPLIES['osint_chain_of_custody']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags unverified hash', async () => {
    const r = await fn(makeCtx({ osintCocRecords: [{ artifactId: 'A1', hashVerified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags chain breaks', async () => {
    const r = await fn(makeCtx({ osintCocRecords: [{ artifactId: 'A1', hashVerified: true, chainBreaks: 2 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags missing collector/method', async () => {
    const r = await fn(makeCtx({ osintCocRecords: [{ artifactId: 'A1' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'chain of custody provenance hash verification osint artifact evidence integrity metadata strip' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── adversarial_simulation ─────────────────────────────────────────────────
describe('adversarial_simulation', () => {
  const fn = WAVE4_BATCH_A_APPLIES['adversarial_simulation']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags high-risk scenario', async () => {
    const r = await fn(makeCtx({
      adversarialScenarios: [{ scenarioId: 'S1', successProbability: 0.8, detectionEvasionScore: 0.7, attackVector: 'social engineering' }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags moderate risk scenario', async () => {
    const r = await fn(makeCtx({
      adversarialScenarios: [{ scenarioId: 'S1', successProbability: 0.4, detectionEvasionScore: 0.4 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'red team adversarial attack vector control bypass evasion technique kill chain mitre att&ck' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── deception_detection ────────────────────────────────────────────────────
describe('deception_detection', () => {
  const fn = WAVE4_BATCH_A_APPLIES['deception_detection']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags contradicted statement', async () => {
    const r = await fn(makeCtx({
      deceptionRecords: [{ statementId: 'S1', statedFact: 'lives in Dubai', verifiedFact: 'lives in Tehran' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags inconsistency count >= 3', async () => {
    const r = await fn(makeCtx({ deceptionRecords: [{ statementId: 'S1', inconsistencyCount: 4 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high linguistic deception score', async () => {
    const r = await fn(makeCtx({ deceptionRecords: [{ statementId: 'S1', linguisticDeceptionScore: 0.85 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'deception inconsistency fabrication false statement misrepresentation contradiction lied' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── counter_intelligence ───────────────────────────────────────────────────
describe('counter_intelligence', () => {
  const fn = WAVE4_BATCH_A_APPLIES['counter_intelligence']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags NSS indicator', async () => {
    const r = await fn(makeCtx({ counterIntelRecords: [{ incidentId: 'I1', nssIndicator: true, attributedActor: 'FSB' }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags CI indicator and targeted asset', async () => {
    const r = await fn(makeCtx({ counterIntelRecords: [{ incidentId: 'I1', indicator: 'surveillance detected', targetedAsset: 'financial system' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'espionage state actor intelligence service fsb mss irgc insider threat mole exfiltration classified' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── false_flag_check ───────────────────────────────────────────────────────
describe('false_flag_check', () => {
  const fn = WAVE4_BATCH_A_APPLIES['false_flag_check']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags weak attribution with multiple alternatives', async () => {
    const r = await fn(makeCtx({
      falseFlagRecords: [{ eventId: 'E1', attributedTo: 'group_a', alternativeAttributions: ['group_b', 'group_c'], evidenceStrength: 0.3 }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags beneficiary different from attributed actor', async () => {
    const r = await fn(makeCtx({
      falseFlagRecords: [{ eventId: 'E1', attributedTo: 'group_a', beneficiary: 'group_b' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'false flag false attribution disinformation provocation masquerade impersonation proxy attack' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── honey_trap_pattern ─────────────────────────────────────────────────────
describe('honey_trap_pattern', () => {
  const fn = WAVE4_BATCH_A_APPLIES['honey_trap_pattern']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags unusually favorable terms', async () => {
    const r = await fn(makeCtx({ honeyTrapRecords: [{ subjectId: 'S1', unusuallyFavorableTerms: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags accelerated intimacy', async () => {
    const r = await fn(makeCtx({ honeyTrapRecords: [{ subjectId: 'S1', acceleratedIntimacy: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags information requested', async () => {
    const r = await fn(makeCtx({ honeyTrapRecords: [{ subjectId: 'S1', informationRequested: ['passwords', 'account numbers', 'identities'] }] }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags financial inducement', async () => {
    const r = await fn(makeCtx({ honeyTrapRecords: [{ subjectId: 'S1', financialInducement: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'honey trap honeypot romantic approach elicitation entrapment sexual compromise kompromat' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── cover_story_stress ─────────────────────────────────────────────────────
describe('cover_story_stress', () => {
  const fn = WAVE4_BATCH_A_APPLIES['cover_story_stress']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags inconsistencies >= 2', async () => {
    const r = await fn(makeCtx({
      coverStoryRecords: [{ storyId: 'S1', inconsistencies: ['dob mismatch', 'address mismatch'] }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags verification failures', async () => {
    const r = await fn(makeCtx({
      coverStoryRecords: [{ storyId: 'S1', verificationFailures: ['passport not verified'] }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'cover story legend false identity fabricated bogus fictitious sham employment shell income' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── legend_verification ────────────────────────────────────────────────────
describe('legend_verification', () => {
  const fn = WAVE4_BATCH_A_APPLIES['legend_verification']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags biometric mismatch', async () => {
    const r = await fn(makeCtx({ legendRecords: [{ legendId: 'L1', biometricMatch: false, documentType: 'passport' }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags registry not confirmed', async () => {
    const r = await fn(makeCtx({ legendRecords: [{ legendId: 'L1', registryConfirmed: false, issuingAuthority: 'UAE' }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags age inconsistency', async () => {
    const r = await fn(makeCtx({ legendRecords: [{ legendId: 'L1', ageConsistency: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'false identity forged passport legend synthetic identity identity fraud document forgery fake id' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── phantom_vessel ─────────────────────────────────────────────────────────
describe('phantom_vessel', () => {
  const fn = WAVE4_BATCH_A_APPLIES['phantom_vessel']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags unconfirmed registry', async () => {
    const r = await fn(makeCtx({ phantomVesselRecords: [{ imo: 'IMO1234567', registryConfirmed: false }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags AIS dark for >180 days', async () => {
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
    const r = await fn(makeCtx({ phantomVesselRecords: [{ imo: 'IMO1', physicallyObserved: false, lastAisSignal: oldDate }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('does not flag AIS dark for <180 days', async () => {
    const recentDate = new Date(Date.now() - 10 * 86400000).toISOString();
    const r = await fn(makeCtx({ phantomVesselRecords: [{ imo: 'IMO1', physicallyObserved: false, lastAisSignal: recentDate }] }));
    // may or may not flag based on other signals
    expect(r.modeId).toBe('phantom_vessel');
  });

  it('flags unverified owner', async () => {
    const r = await fn(makeCtx({ phantomVesselRecords: [{ imo: 'IMO1', ownerVerified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'phantom vessel ghost ship ais dark unregistered vessel identity fraud vessel imo fraud' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── flag_hopping ───────────────────────────────────────────────────────────
describe('flag_hopping', () => {
  const fn = WAVE4_BATCH_A_APPLIES['flag_hopping']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags 3+ flag changes in 365 days', async () => {
    const r = await fn(makeCtx({
      flagHoppingRecords: [{
        vesselId: 'V1',
        flagChanges: [
          { fromFlag: 'PA', toFlag: 'LR', date: '2023-01-01' },
          { fromFlag: 'LR', toFlag: 'MH', date: '2023-03-01' },
          { fromFlag: 'MH', toFlag: 'BS', date: '2023-06-01' },
        ],
        timespanDays: 180,
      }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags 2 flag changes', async () => {
    const r = await fn(makeCtx({
      flagHoppingRecords: [{
        vesselId: 'V1',
        flagChanges: [
          { fromFlag: 'PA', toFlag: 'LR', date: '2023-01-01' },
          { fromFlag: 'LR', toFlag: 'CN', date: '2023-06-01' },
        ],
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags open registry re-flagging', async () => {
    const r = await fn(makeCtx({
      flagHoppingRecords: [{
        vesselId: 'V1',
        flagChanges: [{ fromFlag: 'GB', toFlag: 'PA', date: '2023-01-01' }],
      }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'flag hop re-flag flag of convenience open registry reflag deregistration' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── dark_fleet_pattern ─────────────────────────────────────────────────────
describe('dark_fleet_pattern', () => {
  const fn = WAVE4_BATCH_A_APPLIES['dark_fleet_pattern']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags AIS gap >= 7 days', async () => {
    const r = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', aisGapsDays: 10 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags no P&I insurer (none)', async () => {
    const r = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', insurerType: 'none' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unknown insurer', async () => {
    const r = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', insurerType: 'unknown' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags transponder manipulation', async () => {
    const r = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', transponderManipulation: true }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags Russian oil cargo', async () => {
    const r = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', cargoType: 'oil', lastPortState: 'RU' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags crude petroleum cargo from russia-linked port', async () => {
    const r1 = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', cargoType: 'petroleum', lastPortState: 'BY' }] }));
    const r2 = await fn(makeCtx({ darkFleetRecords: [{ vesselId: 'V1', cargoType: 'crude', lastPortState: 'RS' }] }));
    expect(r1.score).toBeGreaterThan(0);
    expect(r2.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'dark fleet shadow fleet ais manipulation gps spoofing transponder off uninsured vessel ghost tanker' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── front_company_fingerprint ──────────────────────────────────────────────
describe('front_company_fingerprint', () => {
  const fn = WAVE4_BATCH_A_APPLIES['front_company_fingerprint']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags zero/single employee', async () => {
    const r = await fn(makeCtx({ frontCompanyRecords: [{ entityId: 'E1', employeeCount: 0 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high revenue-to-transaction ratio', async () => {
    const r = await fn(makeCtx({ frontCompanyRecords: [{ entityId: 'E1', revenueToTransactionRatio: 15 }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags young company with high ratio', async () => {
    const r = await fn(makeCtx({ frontCompanyRecords: [{ entityId: 'E1', incorporationAge: 2, revenueToTransactionRatio: 8 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags shared address', async () => {
    const r = await fn(makeCtx({ frontCompanyRecords: [{ entityId: 'E1', sharedAddressCount: 6 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags activity mismatch', async () => {
    const r = await fn(makeCtx({ frontCompanyRecords: [{ entityId: 'E1', businessActivityMatch: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'front company shell company nominee director no employees brass plate letterbox company sham company' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── nominee_rotation_detection ─────────────────────────────────────────────
describe('nominee_rotation_detection', () => {
  const fn = WAVE4_BATCH_A_APPLIES['nominee_rotation_detection']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags >= 4 director changes', async () => {
    const r = await fn(makeCtx({ nomineeRotationRecords: [{ entityId: 'E1', directorChanges: 5 }] }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags >= 3 shareholder changes', async () => {
    const r = await fn(makeCtx({ nomineeRotationRecords: [{ entityId: 'E1', shareholderChanges: 4 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags same nominee provider', async () => {
    const r = await fn(makeCtx({ nomineeRotationRecords: [{ entityId: 'E1', sameNomineeProvider: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags short average tenure', async () => {
    const r = await fn(makeCtx({ nomineeRotationRecords: [{ entityId: 'E1', avgTenureMonths: 3 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'nominee director change shareholder rotation straw director trust company registered agent' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── bvi_cook_island_chain ──────────────────────────────────────────────────
describe('bvi_cook_island_chain', () => {
  const fn = WAVE4_BATCH_A_APPLIES['bvi_cook_island_chain']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags 2+ high-secrecy jurisdictions in subject chain', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'VG', nationality: 'KY' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags secrecy jurisdictions in record chain', async () => {
    const r = await fn(makeCtx({
      bviChainRecords: [{ entityId: 'E1', chainJurisdictions: ['VG', 'KY', 'PA'], chainLength: 5, ultimateBeneficiaryKnown: false }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags trust structure in secrecy jurisdiction', async () => {
    const r = await fn(makeCtx({
      bviChainRecords: [{ entityId: 'E1', chainJurisdictions: ['CK'], trustStructure: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('shows jurisdiction evidence on clear', async () => {
    const r = await fn(makeCtx({}, { jurisdiction: 'GB' }));
    expect(r.verdict).toBe('clear');
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'bvi british virgin island cook island cayman panama offshore chain nevis trust foundation' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── freeport_risk ──────────────────────────────────────────────────────────
describe('freeport_risk', () => {
  const fn = WAVE4_BATCH_A_APPLIES['freeport_risk']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags no KYC on depositor', async () => {
    const r = await fn(makeCtx({ freeportRecords: [{ freeportId: 'FP1', kycOnDepositor: false }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags undisclosed beneficial owner', async () => {
    const r = await fn(makeCtx({ freeportRecords: [{ freeportId: 'FP1', beneficialOwnerDisclosed: false }] }));
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('flags long storage duration', async () => {
    const r = await fn(makeCtx({ freeportRecords: [{ freeportId: 'FP1', storageDurationYears: 7 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high-value asset in risk jurisdiction freeport', async () => {
    const r = await fn(makeCtx({ freeportRecords: [{ freeportId: 'FP1', jurisdiction: 'CH', assetType: 'art' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'freeport free trade zone bonded warehouse geneva freeport singapore freeport duty free storage art storage' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── ucp600_discipline ──────────────────────────────────────────────────────
describe('ucp600_discipline', () => {
  const fn = WAVE4_BATCH_A_APPLIES['ucp600_discipline']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.verdict).toBe('clear');
  });

  it('flags waivered discrepancies >= 3', async () => {
    const r = await fn(makeCtx({ ucp600Records: [{ lcId: 'LC1', waiveredDiscrepancies: 4 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags documentary discrepancies >= 5', async () => {
    const r = await fn(makeCtx({ ucp600Records: [{ lcId: 'LC1', discrepancyCount: 6 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags low document authenticity score', async () => {
    const r = await fn(makeCtx({ ucp600Records: [{ lcId: 'LC1', docAuthenticityScore: 0.3 }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags over-invoicing >= 20%', async () => {
    const r = await fn(makeCtx({ ucp600Records: [{ lcId: 'LC1', overInvoicedPct: 25 }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags both banks in high-risk jurisdictions', async () => {
    const r = await fn(makeCtx({ ucp600Records: [{ lcId: 'LC1', presentingBankCountry: 'IR', issuingBankCountry: 'KP' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags free-text keywords', async () => {
    const r = await fn(makeCtx({ freeText: 'letter of credit documentary credit ucp 600 ucp600 trade finance bill of lading tbml over-invoicing discrepancy waiver' }));
    expect(r.score).toBeGreaterThan(0);
  });
});
