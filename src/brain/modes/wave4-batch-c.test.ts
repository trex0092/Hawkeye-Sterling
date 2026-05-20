// wave4-batch-c.test.ts — 100% branch/statement coverage for wave4-batch-c.ts
import { describe, it, expect } from 'vitest';
import { WAVE4_BATCH_C_APPLIES } from './wave4-batch-c.js';
import type { BrainContext, Finding } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, subjectOverrides: Record<string, unknown> = {}): BrainContext {
  return {
    run: { id: 'test', startedAt: Date.now() },
    subject: { name: 'Test Entity', type: 'individual', ...subjectOverrides } as BrainContext['subject'],
    evidence,
    priorFindings: [],
    domains: [],
  };
}

function makePrior(score: number, verdict: 'clear' | 'flag' | 'escalate' = 'escalate', rationale = 'prior test', modeId = 'test_mode', category = 'compliance_framework', confidence = 0.7): Finding {
  return {
    modeId,
    category: category as Finding['category'],
    faculties: ['reasoning'],
    score,
    confidence,
    verdict,
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
}

// ─── CRYPTO / DEFI ──────────────────────────────────────────────────────────

describe('address_poisoning', () => {
  const fn = WAVE4_BATCH_C_APPLIES['address_poisoning']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.modeId).toBe('address_poisoning');
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('flags on dust transactions (amount < 0.0001)', async () => {
    const ctx = makeCtx({ transactions: [{ toAddress: '0xABC', amount: 0.00001, note: '' }] });
    const result = await fn(ctx);
    expect(result.score).toBeGreaterThan(0);
    expect(result.evidence).toContain('1 dust transaction(s) detected (< 0.0001 units)');
  });

  it('flags on address poisoning keywords', async () => {
    const ctx = makeCtx({ freeText: 'look-alike address poison detected' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Address poisoning language in narrative');
  });

  it('flags on similar-address notes', async () => {
    const ctx = makeCtx({ transactions: [{ toAddress: '0xABC', amount: 1, note: 'similar to main wallet' }] });
    const result = await fn(ctx);
    expect(result.evidence).toContain('1 transaction(s) flagged as similar-address');
  });

  it('escalates on combined evidence', async () => {
    const ctx = makeCtx({
      freeText: 'vanity address copycat wallet',
      transactions: [
        { toAddress: '0x1', amount: 0.00001, note: 'similar' },
        { toAddress: '0x2', amount: 0.00001, note: 'similar' },
      ],
    });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

describe('chain_hopping_velocity', () => {
  const fn = WAVE4_BATCH_C_APPLIES['chain_hopping_velocity']!;

  it('returns clear with no hops', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
    expect(result.score).toBe(0);
  });

  it('flags on 3+ hops', async () => {
    const ctx = makeCtx({ chainHops: [
      { fromChain: 'ETH', toChain: 'BSC', timestampMs: 1000000, valueUsd: 100 },
      { fromChain: 'BSC', toChain: 'MATIC', timestampMs: 2000000, valueUsd: 100 },
      { fromChain: 'MATIC', toChain: 'AVAX', timestampMs: 3000000, valueUsd: 100 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('cross-chain hops detected'))).toBe(true);
  });

  it('flags on 2+ rapid hops within 10 minutes', async () => {
    const t0 = 1000000;
    const ctx = makeCtx({ chainHops: [
      { fromChain: 'ETH', toChain: 'BSC', timestampMs: t0, valueUsd: 100 },
      { fromChain: 'BSC', toChain: 'MATIC', timestampMs: t0 + 300000, valueUsd: 100 }, // 5 min gap
      { fromChain: 'MATIC', toChain: 'AVAX', timestampMs: t0 + 500000, valueUsd: 100 }, // 3 more min
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('rapid hop'))).toBe(true);
  });

  it('flags on bridge keywords', async () => {
    const ctx = makeCtx({ freeText: 'used bridge for cross-chain transfer with wormhole' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Bridge/cross-chain keywords in narrative');
  });
});

describe('cross_chain_taint', () => {
  const fn = WAVE4_BATCH_C_APPLIES['cross_chain_taint']!;

  it('returns clear with no taint', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on high taint flows (≥50%)', async () => {
    const ctx = makeCtx({ taintedFlows: [{ sourceAddress: '0xA', taintPercent: 75, chain: 'ETH' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('≥50% taint'))).toBe(true);
  });

  it('adds score for taint spanning multiple chains', async () => {
    const ctx = makeCtx({ taintedFlows: [
      { sourceAddress: '0xA', taintPercent: 30, chain: 'ETH' },
      { sourceAddress: '0xB', taintPercent: 30, chain: 'BSC' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Taint spans'))).toBe(true);
  });

  it('flags on sanctioned wallet keywords', async () => {
    const ctx = makeCtx({ freeText: 'OFAC address with tainted funds' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Sanctioned/tainted fund language in narrative');
  });

  it('escalates on combined high taint + multiple chains + keywords', async () => {
    const ctx = makeCtx({
      freeText: 'sanctioned wallet tainted funds',
      taintedFlows: [
        { sourceAddress: '0xA', taintPercent: 80, chain: 'ETH' },
        { sourceAddress: '0xB', taintPercent: 60, chain: 'BSC' },
      ],
    });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

describe('privacy_pool_exposure', () => {
  const fn = WAVE4_BATCH_C_APPLIES['privacy_pool_exposure']!;

  it('returns clear with no pools', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on privacy pool interactions', async () => {
    const ctx = makeCtx({ privacyPools: [{ poolType: 'tornado', depositValueUsd: 1000, withdrawalValueUsd: 1000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('privacy pool interaction'))).toBe(true);
  });

  it('flags on high-value pools (≥$10k)', async () => {
    const ctx = makeCtx({ privacyPools: [{ poolType: 'tornado', depositValueUsd: 15000, withdrawalValueUsd: 15000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high-value pool'))).toBe(true);
  });

  it('flags on privacy tool keywords', async () => {
    const ctx = makeCtx({ freeText: 'tornado cash mixer coinjoin' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Privacy tool keywords in narrative');
  });

  it('escalates on combined pool + high-value + keywords', async () => {
    const ctx = makeCtx({
      freeText: 'zk shield privacy pool',
      privacyPools: [{ poolType: 'zk', depositValueUsd: 50000, withdrawalValueUsd: 50000 }],
    });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

describe('change_address_heuristic', () => {
  const fn = WAVE4_BATCH_C_APPLIES['change_address_heuristic']!;

  it('returns clear with no transactions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on transactions with ≥5 inputs', async () => {
    const ctx = makeCtx({ utxoTransactions: [{ changeAddress: '0xA', changeValueBtc: 0.1, inputCount: 7 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('consolidation'))).toBe(true);
  });

  it('flags on large change outputs (> 0.5 BTC)', async () => {
    const ctx = makeCtx({ utxoTransactions: [{ changeAddress: '0xA', changeValueBtc: 1.5, inputCount: 2 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('large change output'))).toBe(true);
  });

  it('flags on consolidation keywords', async () => {
    const ctx = makeCtx({ freeText: 'consolidat peel chain change address' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Consolidation/peel-chain language');
  });
});

describe('dusting_attack_pattern', () => {
  const fn = WAVE4_BATCH_C_APPLIES['dusting_attack_pattern']!;

  it('returns clear with no dusting transactions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ dusting transactions', async () => {
    const ctx = makeCtx({ dustingTransactions: [
      { dustSatoshis: 546, recipientCount: 10, timestampMs: 1000 },
      { dustSatoshis: 546, recipientCount: 10, timestampMs: 2000 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('dusting transaction'))).toBe(true);
  });

  it('flags on broad dusting (>100 recipients)', async () => {
    const ctx = makeCtx({ dustingTransactions: [
      { dustSatoshis: 546, recipientCount: 150, timestampMs: 1000 },
      { dustSatoshis: 546, recipientCount: 200, timestampMs: 2000 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Broad dusting'))).toBe(true);
  });

  it('flags on dusting keywords', async () => {
    const ctx = makeCtx({ freeText: 'dust attack address link deanonymis' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Dusting/deanonymisation keywords');
  });
});

describe('travel_rule_gap_analysis', () => {
  const fn = WAVE4_BATCH_C_APPLIES['travel_rule_gap_analysis']!;

  it('returns clear with no transfers', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags transfers ≥$1k missing Travel Rule info', async () => {
    const ctx = makeCtx({ vaspTransfers: [
      { amountUsd: 5000, origVasp: 'VASP1', benefVasp: 'VASP2', travelRuleInfo: false },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('missing Travel Rule info'))).toBe(true);
  });

  it('does not flag transfers below $1k for missing travel rule', async () => {
    const ctx = makeCtx({ vaspTransfers: [
      { amountUsd: 500, origVasp: 'VASP1', benefVasp: 'VASP2', travelRuleInfo: false },
    ] });
    const result = await fn(ctx);
    // below $1k so no missing travel rule hit
    expect(result.evidence.some(e => e.includes('missing Travel Rule info'))).toBe(false);
  });

  it('flags transfers without originator VASP', async () => {
    const ctx = makeCtx({ vaspTransfers: [
      { amountUsd: 500, benefVasp: 'VASP2', travelRuleInfo: true },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('without originator VASP'))).toBe(true);
  });

  it('flags on travel rule gap keywords', async () => {
    const ctx = makeCtx({ freeText: 'travel rule wire transfer gap sunrise issue' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Travel Rule gap language in narrative');
  });
});

describe('crypto_ransomware_cashout', () => {
  const fn = WAVE4_BATCH_C_APPLIES['crypto_ransomware_cashout']!;

  it('returns clear with no ransomware wallets', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('escalates on ransomware wallets', async () => {
    // 1 wallet (score 0.5) + high value >1 BTC (score 0.2) = 0.7 → escalate
    const ctx = makeCtx({ ransomwareWallets: [{ walletId: 'xyz', valueBtc: 5, exchangeDestination: 'Binance' }] });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
    expect(result.evidence.some(e => e.includes('ransomware-linked wallet'))).toBe(true);
  });

  it('flags on high-value cashouts (> 1 BTC)', async () => {
    const ctx = makeCtx({ ransomwareWallets: [{ walletId: 'xyz', valueBtc: 5, exchangeDestination: 'Kraken' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high-value cashout'))).toBe(true);
  });

  it('flags on ransomware keywords', async () => {
    const ctx = makeCtx({ freeText: 'lockbit ransomware encrypt payment' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Ransomware family/terminology in narrative');
  });
});

describe('p2p_exchange_risk', () => {
  const fn = WAVE4_BATCH_C_APPLIES['p2p_exchange_risk']!;

  it('returns clear with no trades', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on unverified counterparty trades', async () => {
    const ctx = makeCtx({ p2pTrades: [{ platform: 'LocalBitcoins', amountUsd: 100, kycVerified: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('unverified counterparty'))).toBe(true);
  });

  it('flags on high-value trades (≥$5k)', async () => {
    const ctx = makeCtx({ p2pTrades: [{ platform: 'Paxful', amountUsd: 6000, kycVerified: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high-value P2P trade'))).toBe(true);
  });

  it('flags on P2P exchange keywords', async () => {
    const ctx = makeCtx({ freeText: 'localbitcoin p2p exchang unregulated' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('P2P exchange platform reference');
  });
});

// ─── PREDICATE CRIME ────────────────────────────────────────────────────────

describe('predicate_crime_cascade', () => {
  const fn = WAVE4_BATCH_C_APPLIES['predicate_crime_cascade']!;

  it('returns clear with no predicates', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on predicate offences', async () => {
    const ctx = makeCtx({ predicateOffences: [{ offenceType: 'drug_trafficking', severity: 0.5, jurisdiction: 'AE' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('predicate offence'))).toBe(true);
  });

  it('flags on severe predicates (severity ≥0.7)', async () => {
    const ctx = makeCtx({ predicateOffences: [{ offenceType: 'drug_trafficking', severity: 0.8, jurisdiction: 'AE' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('severe predicate'))).toBe(true);
  });

  it('flags on predicate offence keywords', async () => {
    const ctx = makeCtx({ freeText: 'predicate offence FATF predicate underlying crime' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Predicate offence language in narrative');
  });

  it('flags when 2+ prior escalations cascade', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.7, 'escalate'), makePrior(0.8, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('prior escalations cascade'))).toBe(true);
  });
});

describe('environmental_predicate', () => {
  const fn = WAVE4_BATCH_C_APPLIES['environmental_predicate']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on environmental crime keywords', async () => {
    const ctx = makeCtx({ freeText: 'illegal mining gold smug conflict mineral' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Environmental crime indicators in narrative');
  });

  it('flags on payments linked to environmental sectors', async () => {
    const ctx = makeCtx({ cashPayments: [{ amountUsd: 5000, purpose: 'timber export' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('linked to environmental sectors'))).toBe(true);
  });

  it('flags on CITES/enforcement references', async () => {
    const ctx = makeCtx({ freeText: 'CITES listed species WWF report' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Environmental crime enforcement reference');
  });
});

describe('tax_evasion_predicate', () => {
  const fn = WAVE4_BATCH_C_APPLIES['tax_evasion_predicate']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on tax evasion keywords', async () => {
    const ctx = makeCtx({ freeText: 'tax evas offshore account undeclared income' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Tax evasion indicators in narrative');
  });

  it('flags on offshore accounts', async () => {
    const ctx = makeCtx({ offshoreAccounts: [{ jurisdiction: 'KY', balanceUsd: 50000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('offshore account'))).toBe(true);
  });

  it('flags on tax-related FIU referrals', async () => {
    const ctx = makeCtx({ fiuReferrals: [{ reason: 'tax evasion suspected' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('FIU referral'))).toBe(true);
  });
});

describe('insider_trading_predicate', () => {
  const fn = WAVE4_BATCH_C_APPLIES['insider_trading_predicate']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on insider trading keywords', async () => {
    const ctx = makeCtx({ freeText: 'insider trad material non-public MNPI' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Insider trading language in narrative');
  });

  it('flags on suspicious trades within 5 days pre-announcement with profit', async () => {
    const ctx = makeCtx({ securitiesTrades: [{ preAnnouncementDays: 3, profitUsd: 10000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('within 5 days of announcement'))).toBe(true);
  });

  it('does not flag trades more than 5 days before announcement', async () => {
    const ctx = makeCtx({ securitiesTrades: [{ preAnnouncementDays: 10, profitUsd: 10000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('within 5 days'))).toBe(false);
  });

  it('does not flag trades with low profit', async () => {
    const ctx = makeCtx({ securitiesTrades: [{ preAnnouncementDays: 3, profitUsd: 100 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('within 5 days'))).toBe(false);
  });
});

describe('cyber_crime_predicate', () => {
  const fn = WAVE4_BATCH_C_APPLIES['cyber_crime_predicate']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on cybercrime keywords', async () => {
    const ctx = makeCtx({ freeText: 'ransomware phishing BEC business email compromise' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Cybercrime proceeds language in narrative');
  });

  it('flags on wallets flagged as cybercrime', async () => {
    const ctx = makeCtx({ cryptoWallets: [{ chainflags: ['cybercrime'] }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('flagged cybercrime'))).toBe(true);
  });

  it('does not flag wallets without cybercrime flag', async () => {
    const ctx = makeCtx({ cryptoWallets: [{ chainflags: ['fraud'] }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('flagged cybercrime'))).toBe(false);
  });
});

describe('human_trafficking_predicate', () => {
  const fn = WAVE4_BATCH_C_APPLIES['human_trafficking_predicate']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on human trafficking keywords', async () => {
    const ctx = makeCtx({ freeText: 'human traffic forced labour modern slaver' });
    const result = await fn(ctx);
    expect(result.verdict).not.toBe('clear');
    expect(result.evidence).toContain('Human trafficking language in narrative');
  });

  it('flags on salary-like regular small payments to individuals', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 300, frequencyPerMonth: 4, recipientType: 'individual' },
      { amount: 400, frequencyPerMonth: 5, recipientType: 'individual' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('potential victim/mule payments'))).toBe(true);
  });

  it('does not flag non-individual recipients', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 300, frequencyPerMonth: 4, recipientType: 'company' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('potential victim/mule payments'))).toBe(false);
  });
});

describe('threshold_split_detection', () => {
  const fn = WAVE4_BATCH_C_APPLIES['threshold_split_detection']!;

  it('returns clear with no transactions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ transactions just below $10k threshold', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 9500, timestampMs: 1000, counterpartyId: 'CP1' },
      { amount: 9700, timestampMs: 2000, counterpartyId: 'CP2' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('just below $10k threshold'))).toBe(true);
  });

  it('flags on counterparty with 3+ split transactions totalling ≥$10k', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 4000, timestampMs: 1000, counterpartyId: 'CP1' },
      { amount: 3500, timestampMs: 2000, counterpartyId: 'CP1' },
      { amount: 3000, timestampMs: 3000, counterpartyId: 'CP1' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('split tx(s) totalling'))).toBe(true);
  });

  it('does not flag counterparty splits when total < $10k', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 2000, timestampMs: 1000, counterpartyId: 'CP1' },
      { amount: 2000, timestampMs: 2000, counterpartyId: 'CP1' },
      { amount: 2000, timestampMs: 3000, counterpartyId: 'CP1' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('split tx(s) totalling'))).toBe(false);
  });

  it('flags on structuring keywords', async () => {
    const ctx = makeCtx({ freeText: 'structur smurfing split deposit threshold avoid' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Structuring language in narrative');
  });
});

describe('offshore_layering', () => {
  const fn = WAVE4_BATCH_C_APPLIES['offshore_layering']!;

  it('returns clear with no offshore accounts', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on accounts with ≥3 layering steps', async () => {
    const ctx = makeCtx({ offshoreAccounts: [{ jurisdiction: 'KY', balanceUsd: 100000, numberOfLayers: 4 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('≥3 layering steps'))).toBe(true);
  });

  it('flags on accounts spanning 3+ jurisdictions', async () => {
    const ctx = makeCtx({ offshoreAccounts: [
      { jurisdiction: 'KY', balanceUsd: 10000, numberOfLayers: 1 },
      { jurisdiction: 'BVI', balanceUsd: 10000, numberOfLayers: 1 },
      { jurisdiction: 'VG', balanceUsd: 10000, numberOfLayers: 1 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('jurisdictions'))).toBe(true);
  });

  it('flags on offshore layering keywords', async () => {
    const ctx = makeCtx({ freeText: 'shell company offshore layer nominee director round trip' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Offshore layering language in narrative');
  });
});

describe('structuring_pattern_reasoning', () => {
  const fn = WAVE4_BATCH_C_APPLIES['structuring_pattern_reasoning']!;

  it('returns clear with no transactions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on low-variance transaction pattern (5+ txns, all within 10% of mean)', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 1000, channel: 'cash' },
      { amount: 1005, channel: 'cash' },
      { amount: 995, channel: 'cash' },
      { amount: 1001, channel: 'cash' },
      { amount: 999, channel: 'cash' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Low-variance transaction pattern'))).toBe(true);
  });

  it('flags on 3+ transactions in $8k-$10k structuring band', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 8500, channel: 'cash' },
      { amount: 9000, channel: 'cash' },
      { amount: 8800, channel: 'cash' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('structuring band'))).toBe(true);
  });

  it('flags on structuring intent keywords', async () => {
    const ctx = makeCtx({ freeText: 'structur smurf break up deliberate split' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Structuring intent language');
  });

  it('does not flag high-variance transactions', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 100, channel: 'cash' },
      { amount: 5000, channel: 'cash' },
      { amount: 50000, channel: 'cash' },
      { amount: 200, channel: 'cash' },
      { amount: 3000, channel: 'cash' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Low-variance transaction pattern'))).toBe(false);
  });
});

// ─── PROLIFERATION FINANCING ─────────────────────────────────────────────────

describe('pf_red_flag_screen', () => {
  const fn = WAVE4_BATCH_C_APPLIES['pf_red_flag_screen']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on dual-use/PF keywords', async () => {
    const ctx = makeCtx({ freeText: 'dual-use export control WMD nuclear missile' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('PF/dual-use language in narrative');
  });

  it('flags on proliferation sanctions hits', async () => {
    const ctx = makeCtx({ sanctionsHits: [{ programme: 'DPRK weapons proliferation' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('proliferation-related sanctions hit'))).toBe(true);
  });

  it('does not count non-proliferation sanctions hits', async () => {
    const ctx = makeCtx({ sanctionsHits: [{ programme: 'terrorism financing' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('proliferation-related sanctions hit'))).toBe(false);
  });

  it('flags on unusual routing/transshipment', async () => {
    const ctx = makeCtx({ freeText: 'unusual route third country transship freight forwarder uncontact' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Unusual routing/transshipment indicators');
  });
});

describe('dual_use_end_user', () => {
  const fn = WAVE4_BATCH_C_APPLIES['dual_use_end_user']!;

  it('returns clear with no trade goods', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on shipments without end-use certificates', async () => {
    const ctx = makeCtx({ tradeGoods: [{ hsCode: '8471', endUser: 'ABC Corp', endUseStatement: false, destinationCountry: 'DE' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('without end-use certificate'))).toBe(true);
  });

  it('flags on shipments to sanctioned destinations', async () => {
    const ctx = makeCtx({ tradeGoods: [{ hsCode: '8471', endUser: 'XYZ', endUseStatement: true, destinationCountry: 'Iran' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('sanctioned/restricted destination'))).toBe(true);
  });

  it('flags on export control terminology', async () => {
    const ctx = makeCtx({ freeText: 'dual-use CCN ECCN export licen' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Export control terminology in narrative');
  });

  it('escalates on combined no EUC + sanctioned destination', async () => {
    const ctx = makeCtx({ tradeGoods: [
      { hsCode: '8471', endUser: 'XYZ', endUseStatement: false, destinationCountry: 'North Korea' },
    ] });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

describe('sanctions_evasion_network', () => {
  const fn = WAVE4_BATCH_C_APPLIES['sanctions_evasion_network']!;

  it('returns clear with no entities', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on directly sanctioned entities', async () => {
    const ctx = makeCtx({ networkEntities: [{ entityId: 'E1', sanctioned: true, connectedToSanctioned: false }] });
    const result = await fn(ctx);
    expect(result.verdict).not.toBe('clear');
    expect(result.evidence.some(e => e.includes('directly sanctioned'))).toBe(true);
  });

  it('flags on 2+ entities connected to sanctioned parties', async () => {
    const ctx = makeCtx({ networkEntities: [
      { entityId: 'E1', sanctioned: false, connectedToSanctioned: true },
      { entityId: 'E2', sanctioned: false, connectedToSanctioned: true },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('connected to sanctioned parties'))).toBe(true);
  });

  it('does not flag single entity connected to sanctioned (need ≥2)', async () => {
    const ctx = makeCtx({ networkEntities: [
      { entityId: 'E1', sanctioned: false, connectedToSanctioned: true },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('connected to sanctioned parties'))).toBe(false);
  });

  it('flags on evasion network keywords', async () => {
    const ctx = makeCtx({ freeText: 'front company straw party evasion network sanctions bust' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Evasion network language');
  });
});

describe('ship_flag_hop_analysis', () => {
  const fn = WAVE4_BATCH_C_APPLIES['ship_flag_hop_analysis']!;

  it('returns clear with no vessels', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on vessels with ≥3 flag changes', async () => {
    const ctx = makeCtx({ vessels: [{ mmsi: '123456789', flagHistory: ['PA', 'LR', 'MH', 'KH'], aisGapHours: 0, lastPort: 'Dubai' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('flag changes'))).toBe(true);
  });

  it('flags on vessels with AIS gap ≥24h', async () => {
    const ctx = makeCtx({ vessels: [{ mmsi: '123456789', flagHistory: ['PA'], aisGapHours: 48, lastPort: 'Dubai' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('AIS gap'))).toBe(true);
  });

  it('flags on dark fleet keywords', async () => {
    const ctx = makeCtx({ freeText: 'dark fleet flag hop AIS off phantom vessel ship-to-ship' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Dark fleet/flag-hopping language');
  });
});

// ─── CORRESPONDENT BANKING ──────────────────────────────────────────────────

describe('cbr_risk_matrix', () => {
  const fn = WAVE4_BATCH_C_APPLIES['cbr_risk_matrix']!;

  it('returns clear with no banks', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on high-risk correspondent banks (jurisdictionRisk ≥0.7)', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', jurisdictionRisk: 0.8, amlRating: 'good', payableThroughAccounts: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high-risk correspondent bank'))).toBe(true);
  });

  it('flags on banks with poor AML rating', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', jurisdictionRisk: 0.3, amlRating: 'poor', payableThroughAccounts: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high-risk correspondent bank'))).toBe(true);
  });

  it('flags on banks with payable-through accounts', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', jurisdictionRisk: 0.2, amlRating: 'good', payableThroughAccounts: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('payable-through accounts'))).toBe(true);
  });

  it('flags on CBR risk keywords', async () => {
    const ctx = makeCtx({ freeText: 'correspondent risk respondent bank weak NOSTRO vostro concern' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('CBR risk language in narrative');
  });
});

describe('nested_account_detection', () => {
  const fn = WAVE4_BATCH_C_APPLIES['nested_account_detection']!;

  it('returns clear with no accounts', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on nested account type', async () => {
    const ctx = makeCtx({ accounts: [{ accountType: 'nested', subAccountCount: 1, ultimateBeneficiary: 'John' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('nested/sub-account structure'))).toBe(true);
  });

  it('flags on accounts with ≥3 sub-accounts', async () => {
    const ctx = makeCtx({ accounts: [{ accountType: 'standard', subAccountCount: 5, ultimateBeneficiary: 'Jane' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('nested/sub-account structure'))).toBe(true);
  });

  it('flags on accounts without ultimate beneficiary', async () => {
    const ctx = makeCtx({ accounts: [{ accountType: 'standard', subAccountCount: 1 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('unknown ultimate beneficiary'))).toBe(true);
  });

  it('flags on nested account keywords', async () => {
    const ctx = makeCtx({ freeText: 'nested account VASP nested sub-account hidden' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Nested account language in narrative');
  });
});

describe('payable_through_account', () => {
  const fn = WAVE4_BATCH_C_APPLIES['payable_through_account']!;

  it('returns clear with no transactions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on PTA-routed transactions', async () => {
    const ctx = makeCtx({ transactions: [{ routedThroughThirdParty: true, ultimateOrigin: 'CompanyX', amount: 5000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('routed through third-party PTA'))).toBe(true);
  });

  it('flags on transactions with unknown ultimate origin', async () => {
    const ctx = makeCtx({ transactions: [{ routedThroughThirdParty: false, amount: 5000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('unknown ultimate origin'))).toBe(true);
  });

  it('flags on PTA keywords', async () => {
    const ctx = makeCtx({ freeText: 'payable-through PTA omnibus account pass-through banking' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('PTA language in narrative');
  });
});

describe('cbr_due_diligence_cascade', () => {
  const fn = WAVE4_BATCH_C_APPLIES['cbr_due_diligence_cascade']!;

  it('returns clear with no banks', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on banks without EDD', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', ddLevel: 'standard', lastReviewDays: 100, amlFrameworkScore: 0.8 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('without EDD'))).toBe(true);
  });

  it('flags on stale reviews (>365 days)', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', ddLevel: 'enhanced', lastReviewDays: 400, amlFrameworkScore: 0.8 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not reviewed in 12+ months'))).toBe(true);
  });

  it('flags on weak AML framework score (<0.5)', async () => {
    const ctx = makeCtx({ correspondentBanks: [{ bankId: 'B1', ddLevel: 'enhanced', lastReviewDays: 100, amlFrameworkScore: 0.3 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('weak AML framework score'))).toBe(true);
  });

  it('escalates on combined issues', async () => {
    const ctx = makeCtx({ correspondentBanks: [
      { bankId: 'B1', ddLevel: 'standard', lastReviewDays: 500, amlFrameworkScore: 0.2 },
      { bankId: 'B2', ddLevel: 'none', lastReviewDays: 400, amlFrameworkScore: 0.1 },
    ] });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

// ─── HAWALA / IVT ───────────────────────────────────────────────────────────

describe('hawala_network_map', () => {
  const fn = WAVE4_BATCH_C_APPLIES['hawala_network_map']!;

  it('returns clear with no hawaladars', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ hawaladars identified', async () => {
    const ctx = makeCtx({ hawaladars: [
      { agentId: 'H1', jurisdiction: 'AE', volumeUsd: 10000, licensed: true },
      { agentId: 'H2', jurisdiction: 'PK', volumeUsd: 5000, licensed: true },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('hawaladar'))).toBe(true);
  });

  it('flags on unlicensed hawaladars', async () => {
    const ctx = makeCtx({ hawaladars: [
      { agentId: 'H1', jurisdiction: 'AE', volumeUsd: 10000, licensed: false },
      { agentId: 'H2', jurisdiction: 'PK', volumeUsd: 5000, licensed: false },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('unlicensed hawaladar'))).toBe(true);
  });

  it('flags on hawala/IVT keywords', async () => {
    const ctx = makeCtx({ freeText: 'hawala hundi informal value transfer' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Hawala/IVT terminology in narrative');
  });
});

describe('settlement_commodity_flow', () => {
  const fn = WAVE4_BATCH_C_APPLIES['settlement_commodity_flow']!;

  it('returns clear with no commodity flows', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on mispriced commodity flows (ratio < 0.5)', async () => {
    const ctx = makeCtx({ commodityFlows: [{ commodity: 'gold', valueUsd: 4000, invoicedValueUsd: 10000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('value mismatch'))).toBe(true);
  });

  it('flags on mispriced commodity flows (ratio > 2.0)', async () => {
    const ctx = makeCtx({ commodityFlows: [{ commodity: 'copper', valueUsd: 30000, invoicedValueUsd: 10000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('value mismatch'))).toBe(true);
  });

  it('does not flag fairly priced flows (ratio between 0.5 and 2.0)', async () => {
    const ctx = makeCtx({ commodityFlows: [{ commodity: 'copper', valueUsd: 10000, invoicedValueUsd: 10000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('value mismatch'))).toBe(false);
  });

  it('flags on commodity settlement keywords', async () => {
    const ctx = makeCtx({ freeText: 'commodity settlement gold barter trade settle hawala' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Commodity-settlement language in narrative');
  });
});

describe('value_equivalence_check', () => {
  const fn = WAVE4_BATCH_C_APPLIES['value_equivalence_check']!;

  it('returns clear with no transfers', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on near-exact value match via informal channel', async () => {
    const ctx = makeCtx({ valueTransfers: [
      { sendValueUsd: 10000, receiveValueUsd: 10050, channel: 'informal' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Near-exact value match via informal channel'))).toBe(true);
  });

  it('does not flag formal channel near-exact match', async () => {
    const ctx = makeCtx({ valueTransfers: [
      { sendValueUsd: 10000, receiveValueUsd: 10050, channel: 'SWIFT' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Near-exact value match'))).toBe(false);
  });

  it('does not flag large value difference on informal channel', async () => {
    const ctx = makeCtx({ valueTransfers: [
      { sendValueUsd: 10000, receiveValueUsd: 5000, channel: 'informal' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Near-exact value match'))).toBe(false);
  });

  it('flags on value equivalence keywords', async () => {
    const ctx = makeCtx({ freeText: 'value equivalence mirror transfer offsetting payment' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Value equivalence language');
  });
});

// ─── FREE TRADE ZONE ────────────────────────────────────────────────────────

describe('ftz_opacity_screen', () => {
  const fn = WAVE4_BATCH_C_APPLIES['ftz_opacity_screen']!;

  it('returns clear with no FTZ entities', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on entities without disclosed ownership', async () => {
    const ctx = makeCtx({ ftzEntities: [{ zone: 'JAFZA', ownershipDisclosed: false, physicalPresence: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('without disclosed ownership'))).toBe(true);
  });

  it('flags on entities lacking physical presence', async () => {
    const ctx = makeCtx({ ftzEntities: [{ zone: 'DMCC', ownershipDisclosed: true, physicalPresence: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('lacking physical presence'))).toBe(true);
  });

  it('flags on FTZ opacity keywords', async () => {
    const ctx = makeCtx({ freeText: 'free trade zone FTZ opac JAFZA DMCC shell re-export discrepan' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('FTZ opacity indicators in narrative');
  });
});

describe('re_export_discrepancy', () => {
  const fn = WAVE4_BATCH_C_APPLIES['re_export_discrepancy']!;

  it('returns clear with no shipments', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on mispriced re-exports (ratio < 0.6)', async () => {
    const ctx = makeCtx({ reExportShipments: [{ originCountry: 'AE', destinationCountry: 'DE', declaredValue: 5000, marketValue: 10000, commodity: 'electronics' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('price discrepancy'))).toBe(true);
  });

  it('flags on mispriced re-exports (ratio > 1.6)', async () => {
    const ctx = makeCtx({ reExportShipments: [{ originCountry: 'AE', destinationCountry: 'DE', declaredValue: 20000, marketValue: 10000, commodity: 'electronics' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('price discrepancy'))).toBe(true);
  });

  it('does not flag fairly priced re-exports', async () => {
    const ctx = makeCtx({ reExportShipments: [{ originCountry: 'AE', destinationCountry: 'DE', declaredValue: 9500, marketValue: 10000, commodity: 'electronics' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('price discrepancy'))).toBe(false);
  });

  it('flags on re-exports to sanctioned jurisdictions', async () => {
    const ctx = makeCtx({ reExportShipments: [{ originCountry: 'AE', destinationCountry: 'Iran', declaredValue: 10000, marketValue: 10000, commodity: 'electronics' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('sanctioned jurisdiction'))).toBe(true);
  });

  it('escalates on combined mispricing + sanctioned destination', async () => {
    const ctx = makeCtx({ reExportShipments: [{ originCountry: 'AE', destinationCountry: 'DPRK', declaredValue: 3000, marketValue: 10000, commodity: 'dual-use' }] });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

// ─── PROFESSIONAL ML ────────────────────────────────────────────────────────

describe('professional_ml_ecosystem', () => {
  const fn = WAVE4_BATCH_C_APPLIES['professional_ml_ecosystem']!;

  it('returns clear with no enablers', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on gatekeeper professionals', async () => {
    const ctx = makeCtx({ enablers: [{ role: 'lawyer', gatekeeper: true, structuredTransactions: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('professional gatekeeper'))).toBe(true);
  });

  it('flags on professionals with structured transaction patterns', async () => {
    const ctx = makeCtx({ enablers: [{ role: 'accountant', gatekeeper: false, structuredTransactions: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('structured transaction patterns'))).toBe(true);
  });

  it('flags on professional enabler keywords', async () => {
    const ctx = makeCtx({ freeText: 'lawyer accountant notary real estate agent launder professional enable' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Professional enabler language in narrative');
  });
});

describe('invoice_fabrication_pattern', () => {
  const fn = WAVE4_BATCH_C_APPLIES['invoice_fabrication_pattern']!;

  it('returns clear with no invoices', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ invoices not validated by third party', async () => {
    const ctx = makeCtx({ invoices: [
      { invoiceId: 'I1', supplierId: 'S1', validatedByThirdParty: false, amount: 5000, goodsDescription: 'Electronics components' },
      { invoiceId: 'I2', supplierId: 'S2', validatedByThirdParty: false, amount: 3000, goodsDescription: 'Machinery parts' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not validated by third party'))).toBe(true);
  });

  it('flags on invoices with vague/missing goods description', async () => {
    const ctx = makeCtx({ invoices: [{ invoiceId: 'I1', supplierId: 'S1', validatedByThirdParty: true, amount: 5000, goodsDescription: 'stuff' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('vague/missing goods description'))).toBe(true);
  });

  it('flags on invoice with no goods description', async () => {
    const ctx = makeCtx({ invoices: [{ invoiceId: 'I1', supplierId: 'S1', validatedByThirdParty: true, amount: 5000 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('vague/missing goods description'))).toBe(true);
  });

  it('flags on invoice fabrication keywords', async () => {
    const ctx = makeCtx({ freeText: 'phantom invoice fictitious invoice invoice fraud over-invoic' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Invoice fabrication language in narrative');
  });

  it('does not flag single unvalidated invoice (needs ≥2)', async () => {
    const ctx = makeCtx({ invoices: [{ invoiceId: 'I1', supplierId: 'S1', validatedByThirdParty: false, amount: 5000, goodsDescription: 'Electronics components XYZ' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not validated by third party'))).toBe(false);
  });
});

describe('funnel_mule_cascade', () => {
  const fn = WAVE4_BATCH_C_APPLIES['funnel_mule_cascade']!;

  it('returns clear with no mule accounts', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ potential mule accounts', async () => {
    const ctx = makeCtx({ muleAccounts: [
      { accountId: 'A1', onwardTransferRate: 0.5, ownerAge: 25, recruitedVia: 'friend' },
      { accountId: 'A2', onwardTransferRate: 0.6, ownerAge: 22, recruitedVia: 'job offer' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('potential mule account'))).toBe(true);
  });

  it('flags on accounts passing ≥90% funds onward', async () => {
    const ctx = makeCtx({ muleAccounts: [
      { accountId: 'A1', onwardTransferRate: 0.95, ownerAge: 25, recruitedVia: 'friend' },
      { accountId: 'A2', onwardTransferRate: 0.92, ownerAge: 22, recruitedVia: 'friend' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('passing ≥90% funds onward'))).toBe(true);
  });

  it('flags on social media/romance-recruited mules', async () => {
    const ctx = makeCtx({ muleAccounts: [
      { accountId: 'A1', onwardTransferRate: 0.5, ownerAge: 20, recruitedVia: 'social media' },
      { accountId: 'A2', onwardTransferRate: 0.6, ownerAge: 21, recruitedVia: 'romance' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('social media/romance'))).toBe(true);
  });
});

// ─── REGULATORY AML ─────────────────────────────────────────────────────────

describe('vara_rulebook_check', () => {
  const fn = WAVE4_BATCH_C_APPLIES['vara_rulebook_check']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on VARA context keywords', async () => {
    const ctx = makeCtx({ freeText: 'VARA Virtual Asset Regulatory Dubai VASP licen' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('VARA regulatory context identified');
  });

  it('flags on VARA requirement gaps', async () => {
    const ctx = makeCtx({ regulatoryGaps: [
      { requirement: 'travel_rule', status: 'missing' },
      { requirement: 'kyc', status: 'partial' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('VARA requirement gap'))).toBe(true);
  });

  it('does not count gaps that are not missing/partial', async () => {
    const ctx = makeCtx({ regulatoryGaps: [
      { requirement: 'travel_rule', status: 'complete' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('VARA requirement gap'))).toBe(false);
  });

  it('flags on VARA non-compliance keywords', async () => {
    const ctx = makeCtx({ freeText: 'unlicens VASP operating without VARA approval VARA breach' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('VARA non-compliance language in narrative');
  });
});

describe('pdpl_data_minimisation', () => {
  const fn = WAVE4_BATCH_C_APPLIES['pdpl_data_minimisation']!;

  it('returns clear with no data fields', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on data fields without justified necessity', async () => {
    const ctx = makeCtx({ collectedDataFields: [
      { fieldName: 'birthplace', purpose: 'unknown', necessityJustified: false },
      { fieldName: 'religion', purpose: 'unknown', necessityJustified: false },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('without justified necessity'))).toBe(true);
  });

  it('flags on PDPL/data minimisation keywords', async () => {
    const ctx = makeCtx({ freeText: 'PDPL data minimis purpose limit consent lacking personal data excess' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('PDPL data minimisation language');
  });
});

describe('ewra_scoring_calibration', () => {
  const fn = WAVE4_BATCH_C_APPLIES['ewra_scoring_calibration']!;

  it('returns clear with no scenarios', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on scenarios with >80% false-positive rate', async () => {
    const ctx = makeCtx({ ewraScenarios: [{ scenarioId: 'S1', triggeredCount: 100, falsePositiveRate: 0.9, lastCalibrationDays: 100 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('>80% false-positive rate'))).toBe(true);
  });

  it('flags on scenarios not calibrated in 12+ months', async () => {
    const ctx = makeCtx({ ewraScenarios: [{ scenarioId: 'S1', triggeredCount: 50, falsePositiveRate: 0.5, lastCalibrationDays: 400 }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not calibrated in 12+ months'))).toBe(true);
  });

  it('flags on EWRA keywords', async () => {
    const ctx = makeCtx({ freeText: 'EWRA entity wide risk assess risk calibrat gap' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('EWRA calibration context');
  });
});

describe('goaml_schema_preflight', () => {
  const fn = WAVE4_BATCH_C_APPLIES['goaml_schema_preflight']!;

  it('returns clear with no reports', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on reports with schema validation errors', async () => {
    const ctx = makeCtx({ goamlReports: [{ reportId: 'R1', schemaValid: false, missingFields: ['field1'], filedLate: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('schema validation errors'))).toBe(true);
  });

  it('flags on late reports', async () => {
    const ctx = makeCtx({ goamlReports: [{ reportId: 'R1', schemaValid: true, missingFields: [], filedLate: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('filed late'))).toBe(true);
  });

  it('flags on goAML schema keywords', async () => {
    const ctx = makeCtx({ freeText: 'goAML STR schema SAR format error' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('goAML schema context in narrative');
  });
});

// ─── DECISION THEORY ────────────────────────────────────────────────────────

describe('expected_value_decision', () => {
  const fn = WAVE4_BATCH_C_APPLIES['expected_value_decision']!;

  it('returns clear with no options or priors', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ options with positive max EV', async () => {
    const ctx = makeCtx({ decisionOptions: [
      { optionId: 'O1', probability: 0.8, outcome: 100 },
      { optionId: 'O2', probability: 0.3, outcome: 50 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Optimal EV option yields'))).toBe(true);
  });

  it('identifies dominated options', async () => {
    const ctx = makeCtx({ decisionOptions: [
      { optionId: 'O1', probability: 0.9, outcome: 100 },
      { optionId: 'O2', probability: 0.1, outcome: 1 },  // 0.1 < 90 * 0.3 = 27
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('dominated option'))).toBe(true);
  });

  it('flags when 2+ prior escalations exist', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.7, 'escalate'), makePrior(0.8, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('escalated findings'))).toBe(true);
  });
});

describe('regret_minimization', () => {
  const fn = WAVE4_BATCH_C_APPLIES['regret_minimization']!;

  it('returns clear with no options or priors', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('adds score when min regret < 0.3 (2+ options)', async () => {
    const ctx = makeCtx({ decisionOptions: [
      { optionId: 'O1', worstCaseRegret: 0.2 },
      { optionId: 'O2', worstCaseRegret: 0.4 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Minimax regret strategy'))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('does not add regret score when min regret ≥ 0.3', async () => {
    const ctx = makeCtx({ decisionOptions: [
      { optionId: 'O1', worstCaseRegret: 0.5 },
      { optionId: 'O2', worstCaseRegret: 0.7 },
    ] });
    const result = await fn(ctx);
    // evidence pushed but score not increased for regret branch
    expect(result.evidence.some(e => e.includes('Minimax regret strategy: min worst-case regret = 0.50'))).toBe(true);
    expect(result.score).toBeLessThan(0.3); // no regret score boost, but could have other contributions
  });

  it('flags on regret minimization keywords', async () => {
    const ctx = makeCtx({ freeText: 'regret minimiz minimax worst case decision' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Regret minimization framework referenced');
  });

  it('flags when 2+ conservative prior findings exist', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.4, 'flag'), makePrior(0.3, 'flag')];
    const result = await fn(ctx);
    expect(result.evidence).toContain('Conservative signals support regret-averse escalation');
  });
});

describe('multi_criteria_decision_analysis', () => {
  const fn = WAVE4_BATCH_C_APPLIES['multi_criteria_decision_analysis']!;

  it('returns clear with no criteria', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('computes weighted score with 3+ criteria', async () => {
    const ctx = makeCtx({ mcaCriteria: [
      { criterion: 'risk', weight: 0.5, score: 0.8 },
      { criterion: 'impact', weight: 0.3, score: 0.6 },
      { criterion: 'likelihood', weight: 0.2, score: 0.7 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('MCDA weighted score'))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles total weight of 0', async () => {
    const ctx = makeCtx({ mcaCriteria: [
      { criterion: 'risk', weight: 0, score: 0.8 },
      { criterion: 'impact', weight: 0, score: 0.6 },
      { criterion: 'likelihood', weight: 0, score: 0.7 },
    ] });
    const result = await fn(ctx);
    // normalised = 0 when totalWeight = 0
    expect(result.score).toBe(0);
  });

  it('flags on MCDA keywords', async () => {
    const ctx = makeCtx({ freeText: 'MCDA multi-criteria weighted score AHP method' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('MCDA framework referenced');
  });
});

describe('value_of_information', () => {
  const fn = WAVE4_BATCH_C_APPLIES['value_of_information']!;

  it('returns clear with no uncertainty or missing data', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags when 2+ prior findings have low confidence', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.5, 'flag', 'test', 'mode1', 'compliance_framework', 0.3), makePrior(0.4, 'flag', 'test', 'mode2', 'compliance_framework', 0.4)];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('low-confidence prior finding'))).toBe(true);
  });

  it('flags on VoI investigation keywords', async () => {
    const ctx = makeCtx({ freeText: 'additional information further enquiry warranted EDD required investigate further' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('VoI signal: further investigation indicated');
  });

  it('flags when 2+ missing data fields exist', async () => {
    const ctx = makeCtx({ missingDataFields: [{ field: 'sourceOfFunds' }, { field: 'uboDetails' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('missing data field'))).toBe(true);
  });
});

describe('satisficing_vs_optimizing', () => {
  const fn = WAVE4_BATCH_C_APPLIES['satisficing_vs_optimizing']!;

  it('returns clear with no thresholds or priors', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags when all satisficing thresholds are met', async () => {
    const ctx = makeCtx({ satisficingThresholds: [
      { criterion: 'score', threshold: 0.5, actual: 0.7 },
      { criterion: 'confidence', threshold: 0.6, actual: 0.8 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('proceed with escalation'))).toBe(true);
  });

  it('adds low score when no thresholds are met', async () => {
    const ctx = makeCtx({ satisficingThresholds: [
      { criterion: 'score', threshold: 0.8, actual: 0.3 },
      { criterion: 'confidence', threshold: 0.9, actual: 0.4 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('decision deferred'))).toBe(true);
  });

  it('flags when at least one prior escalation exists', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.7, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence).toContain('At least one escalation satisfies minimum criteria');
  });

  it('flags on satisficing keywords', async () => {
    const ctx = makeCtx({ freeText: 'satisfic bounded rational Simon decision' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Satisficing framework referenced');
  });
});

// ─── BEHAVIORAL ECONOMICS ───────────────────────────────────────────────────

describe('prospect_theory_audit', () => {
  const fn = WAVE4_BATCH_C_APPLIES['prospect_theory_audit']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on prospect theory keywords', async () => {
    const ctx = makeCtx({ freeText: 'loss avers risk seek loss frame effect certain vs gamble' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Prospect theory framing in narrative');
  });

  it('flags on 2+ large loss transactions', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 10000, gainOrLoss: 'loss' },
      { amount: 8000, gainOrLoss: 'loss' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('large loss transaction'))).toBe(true);
  });

  it('does not flag gain transactions', async () => {
    const ctx = makeCtx({ transactions: [
      { amount: 10000, gainOrLoss: 'gain' },
      { amount: 8000, gainOrLoss: 'gain' },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('large loss transaction'))).toBe(false);
  });

  it('flags when 2+ prior flags exist', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.4, 'flag'), makePrior(0.5, 'flag')];
    const result = await fn(ctx);
    expect(result.evidence).toContain('Multiple flags support behavioral anomaly signal');
  });
});

describe('anchoring_debiasing', () => {
  const fn = WAVE4_BATCH_C_APPLIES['anchoring_debiasing']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags when prior scores have low variance (< 0.02)', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [
      makePrior(0.6, 'escalate'),
      makePrior(0.6, 'escalate'),
      makePrior(0.6, 'escalate'),
    ];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Low score variance'))).toBe(true);
  });

  it('does not flag when prior scores have high variance', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [
      makePrior(0.1, 'clear'),
      makePrior(0.9, 'escalate'),
    ];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Low score variance'))).toBe(false);
  });

  it('flags on anchoring bias keywords', async () => {
    const ctx = makeCtx({ freeText: 'anchoring first impression bias initial assessment skew' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Anchoring bias language in narrative');
  });
});

describe('status_quo_bias_probe', () => {
  const fn = WAVE4_BATCH_C_APPLIES['status_quo_bias_probe']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on status quo bias keywords', async () => {
    const ctx = makeCtx({ freeText: "always done this way no change needed status quo inertia compliance" });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Status quo bias language detected');
  });

  it('flags on controls not updated in 2+ years', async () => {
    const ctx = makeCtx({ controlReviews: [
      { lastUpdatedDays: 800, changesMade: false },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not updated in 2+ years'))).toBe(true);
  });

  it('does not flag stale controls that had changes made', async () => {
    const ctx = makeCtx({ controlReviews: [
      { lastUpdatedDays: 800, changesMade: true },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('not updated in 2+ years'))).toBe(false);
  });
});

describe('availability_cascade_guard', () => {
  const fn = WAVE4_BATCH_C_APPLIES['availability_cascade_guard']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on availability cascade bias keywords', async () => {
    const ctx = makeCtx({ freeText: 'media frenzy recent headline widely reported therefore availability heuristic' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Availability cascade bias language');
  });

  it('flags when 5+ media hits and all prior findings are escalate', async () => {
    const ctx = makeCtx({ adverseMedia: [
      { source: 'BBC', date: '2024-01-01' },
      { source: 'Reuters', date: '2024-01-02' },
      { source: 'CNN', date: '2024-01-03' },
      { source: 'Guardian', date: '2024-01-04' },
      { source: 'FT', date: '2024-01-05' },
    ] });
    ctx.priorFindings = [makePrior(0.7, 'escalate'), makePrior(0.8, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Heavy media coverage'))).toBe(true);
  });

  it('does not flag media hits when some priors are not escalate', async () => {
    const ctx = makeCtx({ adverseMedia: [
      { source: 'BBC', date: '2024-01-01' },
      { source: 'Reuters', date: '2024-01-02' },
      { source: 'CNN', date: '2024-01-03' },
      { source: 'Guardian', date: '2024-01-04' },
      { source: 'FT', date: '2024-01-05' },
    ] });
    ctx.priorFindings = [makePrior(0.4, 'flag'), makePrior(0.8, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Heavy media coverage'))).toBe(false);
  });

  it('does not flag when fewer than 5 media hits even with all escalations', async () => {
    const ctx = makeCtx({ adverseMedia: [
      { source: 'BBC', date: '2024-01-01' },
      { source: 'Reuters', date: '2024-01-02' },
    ] });
    ctx.priorFindings = [makePrior(0.7, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Heavy media coverage'))).toBe(false);
  });
});

describe('overconfidence_calibration', () => {
  const fn = WAVE4_BATCH_C_APPLIES['overconfidence_calibration']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on high-confidence but low-risk findings', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.1, 'clear', 'test', 'mode1', 'compliance_framework', 0.9)];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high confidence but low risk score'))).toBe(true);
  });

  it('does not flag high-confidence high-risk findings', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.8, 'escalate', 'test', 'mode1', 'compliance_framework', 0.9)];
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('high confidence but low risk score'))).toBe(false);
  });

  it('flags on overconfident language keywords', async () => {
    const ctx = makeCtx({ freeText: 'certain definitely not no risk clearly innocent' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Overconfident language in narrative');
  });
});

// ─── STRATEGIC ──────────────────────────────────────────────────────────────

describe('nash_equilibrium_analysis', () => {
  const fn = WAVE4_BATCH_C_APPLIES['nash_equilibrium_analysis']!;

  it('returns clear with no players or priors', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ strategic players', async () => {
    const ctx = makeCtx({ strategicPlayers: [
      { playerId: 'P1', strategy: 'cooperate', payoff: 10 },
      { playerId: 'P2', strategy: 'defect', payoff: 5 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('Nash equilibrium assessed'))).toBe(true);
  });

  it('flags on players in dominated strategy (negative payoff)', async () => {
    const ctx = makeCtx({ strategicPlayers: [
      { playerId: 'P1', strategy: 'cooperate', payoff: 10 },
      { playerId: 'P2', strategy: 'defect', payoff: -5 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('dominated strategy position'))).toBe(true);
  });

  it('flags on game theory keywords', async () => {
    const ctx = makeCtx({ freeText: 'game theory Nash dominant strategy equilibrium analysis' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Game theory framework referenced');
  });

  it('flags when 2+ prior escalations exist', async () => {
    const ctx = makeCtx({});
    ctx.priorFindings = [makePrior(0.7, 'escalate'), makePrior(0.8, 'escalate')];
    const result = await fn(ctx);
    expect(result.evidence).toContain('Escalation equilibrium supports flag');
  });
});

describe('mechanism_design_reverse', () => {
  const fn = WAVE4_BATCH_C_APPLIES['mechanism_design_reverse']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on mechanism design keywords', async () => {
    const ctx = makeCtx({ freeText: 'incentive structure mechanism design reverse engineer incentive misalign incentive' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Mechanism design language in narrative');
  });

  it('flags on perverse incentive structures', async () => {
    const ctx = makeCtx({ incentiveStructures: [{ type: 'bonus', perverseOutcome: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('perverse incentive structure'))).toBe(true);
  });

  it('does not count non-perverse incentive structures', async () => {
    const ctx = makeCtx({ incentiveStructures: [{ type: 'bonus', perverseOutcome: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('perverse incentive structure'))).toBe(false);
  });
});

describe('commitment_device_audit', () => {
  const fn = WAVE4_BATCH_C_APPLIES['commitment_device_audit']!;

  it('returns clear with no commitment devices', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on breached commitment devices', async () => {
    const ctx = makeCtx({ commitmentDevices: [{ deviceType: 'compliance_pledge', breached: true }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('commitment device(s) breached'))).toBe(true);
  });

  it('does not flag non-breached devices', async () => {
    const ctx = makeCtx({ commitmentDevices: [{ deviceType: 'compliance_pledge', breached: false }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('commitment device(s) breached'))).toBe(false);
  });

  it('flags on commitment device keywords', async () => {
    const ctx = makeCtx({ freeText: 'pre-commitment self-bind Ulysses contract compliance pledge violated' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Commitment device language');
  });
});

describe('information_revelation_timing', () => {
  const fn = WAVE4_BATCH_C_APPLIES['information_revelation_timing']!;

  it('returns clear with no evidence', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on strategic withholding keywords', async () => {
    const ctx = makeCtx({ freeText: 'delay disclos late reveal strategic withhold trickle information' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Strategic information withholding language');
  });

  it('flags on disclosures delayed >30 days', async () => {
    const ctx = makeCtx({ disclosureEvents: [{ daysDelayed: 45, type: 'beneficial_ownership' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('delayed >30 days'))).toBe(true);
  });

  it('does not flag disclosures delayed ≤30 days', async () => {
    const ctx = makeCtx({ disclosureEvents: [{ daysDelayed: 20, type: 'beneficial_ownership' }] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('delayed >30 days'))).toBe(false);
  });

  it('escalates on combined withholding + delayed disclosures', async () => {
    const ctx = makeCtx({
      freeText: 'delay disclos strategic withhold',
      disclosureEvents: [{ daysDelayed: 60, type: 'ownership' }, { daysDelayed: 45, type: 'source_of_funds' }],
    });
    const result = await fn(ctx);
    expect(result.verdict).toBe('escalate');
  });
});

describe('entry_exit_timing_analysis', () => {
  const fn = WAVE4_BATCH_C_APPLIES['entry_exit_timing_analysis']!;

  it('returns clear with no positions', async () => {
    const result = await fn(makeCtx());
    expect(result.verdict).toBe('clear');
  });

  it('flags on 2+ suspiciously well-timed entries/exits with profit', async () => {
    const ctx = makeCtx({ marketPositions: [
      { entryDate: '2024-01-01', exitDate: '2024-01-15', triggerEvent: 'merger_announcement', profitUsd: 50000 },
      { entryDate: '2024-02-01', exitDate: '2024-02-10', triggerEvent: 'earnings_release', profitUsd: 30000 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('suspiciously well-timed entry/exit'))).toBe(true);
  });

  it('does not flag positions without trigger event', async () => {
    const ctx = makeCtx({ marketPositions: [
      { entryDate: '2024-01-01', exitDate: '2024-01-15', profitUsd: 50000 },
      { entryDate: '2024-02-01', exitDate: '2024-02-10', profitUsd: 30000 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('suspiciously well-timed entry/exit'))).toBe(false);
  });

  it('does not flag low-profit well-timed positions', async () => {
    const ctx = makeCtx({ marketPositions: [
      { entryDate: '2024-01-01', exitDate: '2024-01-15', triggerEvent: 'merger_announcement', profitUsd: 100 },
      { entryDate: '2024-02-01', exitDate: '2024-02-10', triggerEvent: 'earnings', profitUsd: 200 },
    ] });
    const result = await fn(ctx);
    expect(result.evidence.some(e => e.includes('suspiciously well-timed entry/exit'))).toBe(false);
  });

  it('flags on suspicious timing keywords', async () => {
    const ctx = makeCtx({ freeText: 'perfectly timed exit before announce enter just before' });
    const result = await fn(ctx);
    expect(result.evidence).toContain('Suspicious timing language in narrative');
  });
});
