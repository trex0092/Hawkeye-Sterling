import { describe, expect, it } from 'vitest';
import { CRYPTO_BATCH_APPLIES } from './wave3-crypto-batch.js';
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

const travelRuleApply = CRYPTO_BATCH_APPLIES['travel_rule_compliance_gap']!;
const unhostedWalletApply = CRYPTO_BATCH_APPLIES['unhosted_wallet_high_volume']!;
const peelingChainApply = CRYPTO_BATCH_APPLIES['peeling_chain_pattern']!;
const coinjoinApply = CRYPTO_BATCH_APPLIES['coinjoin_participation']!;
const tornadoCashApply = CRYPTO_BATCH_APPLIES['tornado_cash_proximity']!;
const lazarusAddressApply = CRYPTO_BATCH_APPLIES['lazarus_address_match']!;
const ofacSdnAddrApply = CRYPTO_BATCH_APPLIES['ofac_sdn_address_match']!;
const defiRecursiveApply = CRYPTO_BATCH_APPLIES['defi_recursive_loan']!;
const smartContractDrainApply = CRYPTO_BATCH_APPLIES['smart_contract_drain']!;
const flashLoanApply = CRYPTO_BATCH_APPLIES['flash_loan_attack_pattern']!;
const rugpullApply = CRYPTO_BATCH_APPLIES['rugpull_indicator']!;
const stablecoinArbApply = CRYPTO_BATCH_APPLIES['stablecoin_arbitrage_anomaly']!;

// ── travel_rule_compliance_gap ──────────────────────────────────────────────

describe('travel_rule_compliance_gap', () => {
  it('returns inconclusive when no vaspTransfers supplied', async () => {
    const r = await travelRuleApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('travel_rule_compliance_gap');
  });

  it('returns clear when no signals fire', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't1', valueAedEquivalent: 1000, travelRuleAttached: true }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags missing_travel_rule when >= 3675 AED and travelRuleAttached != true', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't2', valueAedEquivalent: 3675, travelRuleAttached: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag missing_travel_rule when < 3675 AED', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't3', valueAedEquivalent: 3674 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags unidentified_originator when >= 3675 and originatorVaspIdentified is false', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't4', valueAedEquivalent: 5000, travelRuleAttached: true, originatorVaspIdentified: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag unidentified_originator when below threshold', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't5', valueAedEquivalent: 1000, originatorVaspIdentified: false }],
    }));
    expect(r.score).toBe(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await travelRuleApply(makeCtx({
      vaspTransfers: [{ transferId: 't6', valueAedEquivalent: 10000, travelRuleAttached: false, originatorVaspIdentified: false }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── unhosted_wallet_high_volume ─────────────────────────────────────────────

describe('unhosted_wallet_high_volume', () => {
  it('returns inconclusive when no unhostedFlows supplied', async () => {
    const r = await unhostedWalletApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('unhosted_wallet_high_volume');
  });

  it('returns clear when no signals fire', async () => {
    const r = await unhostedWalletApply(makeCtx({
      unhostedFlows: [{ addr: '0xabc', volumeAedLast30d: 100000, sourceOfFundsKnown: true }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags high_volume_unhosted when volume >= 1_000_000', async () => {
    const r = await unhostedWalletApply(makeCtx({
      unhostedFlows: [{ addr: '0xdef', volumeAedLast30d: 1_000_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag when volume < 1_000_000', async () => {
    const r = await unhostedWalletApply(makeCtx({
      unhostedFlows: [{ addr: '0xghi', volumeAedLast30d: 999_999 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags unknown_source when sourceOfFundsKnown is false', async () => {
    const r = await unhostedWalletApply(makeCtx({
      unhostedFlows: [{ addr: '0xjkl', sourceOfFundsKnown: false }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates with both signals', async () => {
    const r = await unhostedWalletApply(makeCtx({
      unhostedFlows: [{ addr: '0xmno', volumeAedLast30d: 5_000_000, sourceOfFundsKnown: false }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── peeling_chain_pattern ───────────────────────────────────────────────────

describe('peeling_chain_pattern', () => {
  it('returns inconclusive when no peelingChains supplied', async () => {
    const r = await peelingChainApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('peeling_chain_pattern');
  });

  it('returns clear when no signals fire', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc1', hopCount: 3, peelOffPercentMedian: 0.5, finalDestinationFlagged: false }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags long_peel when hopCount >= 8', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc2', hopCount: 8 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags small_peelings when 0 < peelOffPercentMedian <= 0.05', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc3', peelOffPercentMedian: 0.05 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag small_peelings when peelOffPercentMedian = 0', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc4', peelOffPercentMedian: 0 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag small_peelings when peelOffPercentMedian > 0.05', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc5', peelOffPercentMedian: 0.06 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags final_dest_flagged when finalDestinationFlagged is true', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc6', finalDestinationFlagged: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when all 3 signals fire', async () => {
    const r = await peelingChainApply(makeCtx({
      peelingChains: [{ chainId: 'pc7', hopCount: 10, peelOffPercentMedian: 0.02, finalDestinationFlagged: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── coinjoin_participation ──────────────────────────────────────────────────

describe('coinjoin_participation', () => {
  it('returns inconclusive when no coinjoinTxs supplied', async () => {
    const r = await coinjoinApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('coinjoin_participation');
  });

  it('returns clear when no signals fire', async () => {
    const r = await coinjoinApply(makeCtx({
      coinjoinTxs: [{ txId: 'cj1', participantCount: 5 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags high_anonset when participantCount >= 10', async () => {
    const r = await coinjoinApply(makeCtx({
      coinjoinTxs: [{ txId: 'cj2', participantCount: 10 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags identified_mixer when mixerName is set', async () => {
    const r = await coinjoinApply(makeCtx({
      coinjoinTxs: [{ txId: 'cj3', mixerName: 'Wasabi' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags post_mix_dest_flagged when postMixDestinationFlagged is true', async () => {
    const r = await coinjoinApply(makeCtx({
      coinjoinTxs: [{ txId: 'cj4', postMixDestinationFlagged: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when all signals fire', async () => {
    const r = await coinjoinApply(makeCtx({
      coinjoinTxs: [{ txId: 'cj5', participantCount: 50, mixerName: 'Samourai', postMixDestinationFlagged: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── tornado_cash_proximity ──────────────────────────────────────────────────

describe('tornado_cash_proximity', () => {
  it('returns inconclusive when no tornadoFlows supplied', async () => {
    const r = await tornadoCashApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('tornado_cash_proximity');
  });

  it('returns clear when no signals fire', async () => {
    const r = await tornadoCashApply(makeCtx({
      tornadoFlows: [{ addrTrace: 'addr1', depositToTornado: false, withdrawalFromTornado: false }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags deposit_proximity when depositToTornado and hopsToSubject <= 2', async () => {
    const r = await tornadoCashApply(makeCtx({
      tornadoFlows: [{ addrTrace: 'addr2', depositToTornado: true, hopsToSubject: 2 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag deposit when hopsToSubject > 2', async () => {
    const r = await tornadoCashApply(makeCtx({
      tornadoFlows: [{ addrTrace: 'addr3', depositToTornado: true, hopsToSubject: 3 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags withdrawal_proximity when withdrawalFromTornado and hopsToSubject <= 2', async () => {
    const r = await tornadoCashApply(makeCtx({
      tornadoFlows: [{ addrTrace: 'addr4', withdrawalFromTornado: true, hopsToSubject: 1 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when both deposit and withdrawal signals fire', async () => {
    const r = await tornadoCashApply(makeCtx({
      tornadoFlows: [{ addrTrace: 'addr5', depositToTornado: true, withdrawalFromTornado: true, hopsToSubject: 0 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── lazarus_address_match ───────────────────────────────────────────────────

describe('lazarus_address_match', () => {
  it('returns inconclusive when no addressMatches supplied', async () => {
    const r = await lazarusAddressApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('lazarus_address_match');
  });

  it('returns clear when no signals fire', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [{ addr: '0x123', lazarusOverlap: false }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags lazarus_high_conf when lazarusOverlap is true and confidence >= 0.8', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [{ addr: '0x456', lazarusOverlap: true, confidence: 0.9 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags lazarus_low_conf when lazarusOverlap is true and confidence < 0.8', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [{ addr: '0x789', lazarusOverlap: true, confidence: 0.7 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags lazarus_low_conf when confidence is undefined (defaults below 0.8)', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [{ addr: '0xabc', lazarusOverlap: true }],
    }));
    // confidence ?? 0 = 0 < 0.8 → low conf
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags with high confidence lazarus hit (score 0.55 → flag)', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [{ addr: '0xdef', lazarusOverlap: true, confidence: 0.95, cluster: 'lazarus-main' }],
    }));
    // lazarus_high_conf weight = 0.55 → score = 0.55 → flag (< 0.6)
    expect(r.verdict).toBe('flag');
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates with multiple lazarus hits', async () => {
    const r = await lazarusAddressApply(makeCtx({
      addressMatches: [
        { addr: '0xaaa', lazarusOverlap: true, confidence: 0.95, cluster: 'lazarus-main' },
        { addr: '0xbbb', lazarusOverlap: true, confidence: 0.90, cluster: 'lazarus-sub' },
      ],
    }));
    // 0.55 + 0.55 = 1.10 → compressed → escalate
    expect(r.verdict).toBe('escalate');
  });
});

// ── ofac_sdn_address_match ──────────────────────────────────────────────────

describe('ofac_sdn_address_match', () => {
  it('returns inconclusive when no sdnAddrMatches supplied', async () => {
    const r = await ofacSdnAddrApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('ofac_sdn_address_match');
  });

  it('returns clear when no signals fire', async () => {
    const r = await ofacSdnAddrApply(makeCtx({
      sdnAddrMatches: [{ addr: '0xsafe' }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags sdn_exact when matchType is exact', async () => {
    const r = await ofacSdnAddrApply(makeCtx({
      sdnAddrMatches: [{ addr: '0xsdn1', matchType: 'exact', sdnProgram: 'IRAN' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags sdn_cluster when matchType is cluster', async () => {
    const r = await ofacSdnAddrApply(makeCtx({
      sdnAddrMatches: [{ addr: '0xsdn2', matchType: 'cluster', sdnProgram: 'DPRK' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags sdn_fuzzy when matchType is fuzzy', async () => {
    const r = await ofacSdnAddrApply(makeCtx({
      sdnAddrMatches: [{ addr: '0xsdn3', matchType: 'fuzzy' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when exact SDN match', async () => {
    const r = await ofacSdnAddrApply(makeCtx({
      sdnAddrMatches: [{ addr: '0xsdn4', matchType: 'exact', sdnProgram: 'SDN' }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── defi_recursive_loan ─────────────────────────────────────────────────────

describe('defi_recursive_loan', () => {
  it('returns inconclusive when no defiLoans supplied', async () => {
    const r = await defiRecursiveApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('defi_recursive_loan');
  });

  it('returns clear when no signals fire', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p1', recursiveLoops: 2, collateralRatio: 2.5 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags leverage_loop when recursiveLoops >= 5', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p2', recursiveLoops: 5, protocol: 'Aave' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags razor_thin_collateral when collateralRatio < 1.1', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p3', collateralRatio: 1.05 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag razor_thin when collateralRatio >= 1.1', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p4', collateralRatio: 1.1 }],
    }));
    expect(r.score).toBe(0);
  });

  it('uses default collateralRatio of 2 when missing (>= 1.1)', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p5' }],
    }));
    // collateralRatio ?? 2 = 2 >= 1.1 → no flag
    expect(r.score).toBe(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await defiRecursiveApply(makeCtx({
      defiLoans: [{ positionId: 'p6', recursiveLoops: 10, collateralRatio: 1.0 }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── smart_contract_drain ────────────────────────────────────────────────────

describe('smart_contract_drain', () => {
  it('returns inconclusive when no drainEvents supplied', async () => {
    const r = await smartContractDrainApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('smart_contract_drain');
  });

  it('returns clear when no signals fire', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xcontract', drainedAed: 1000, drainTimeMinutes: 60 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags large_drain when drainedAed >= 5_000_000', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xbig', drainedAed: 5_000_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags rapid_drain when drainTimeMinutes <= 5', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xfast', drainTimeMinutes: 5 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag rapid_drain when drainTimeMinutes > 5', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xslow', drainTimeMinutes: 6 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag rapid_drain when drainTimeMinutes is missing (Infinity)', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xnull' }],
    }));
    // drainTimeMinutes ?? Infinity → > 5 → no flag
    expect(r.score).toBe(0);
  });

  it('flags known_exploit_sig when signatureKnownExploit is true', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xexploit', signatureKnownExploit: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when all signals fire', async () => {
    const r = await smartContractDrainApply(makeCtx({
      drainEvents: [{ contractAddr: '0xall', drainedAed: 10_000_000, drainTimeMinutes: 2, signatureKnownExploit: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── flash_loan_attack_pattern ───────────────────────────────────────────────

describe('flash_loan_attack_pattern', () => {
  it('returns inconclusive when no flashLoans supplied', async () => {
    const r = await flashLoanApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('flash_loan_attack_pattern');
  });

  it('returns clear when no signals fire', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl1', victimProtocols: [], profitAed: 50000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags attack_profit when victims >= 1 and profitAed >= 100k', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl2', victimProtocols: ['Compound'], profitAed: 100000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag attack_profit when no victims', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl3', victimProtocols: [], profitAed: 500000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag attack_profit when profit < 100k', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl4', victimProtocols: ['Aave'], profitAed: 99999 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags same_block_exec when samBlockExecution is true', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl5', samBlockExecution: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await flashLoanApply(makeCtx({
      flashLoans: [{ txId: 'fl6', victimProtocols: ['Uniswap', 'Balancer'], profitAed: 500000, samBlockExecution: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── rugpull_indicator ───────────────────────────────────────────────────────

describe('rugpull_indicator', () => {
  it('returns inconclusive when no rugpullSignals supplied', async () => {
    const r = await rugpullApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('rugpull_indicator');
  });

  it('returns clear when no signals fire', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok1', liquidityRemovedPct: 0.5, teamWalletConcentrationPct: 0.2 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags liquidity_pulled when liquidityRemovedPct >= 0.8', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok2', liquidityRemovedPct: 0.8 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag liquidity_pulled when < 0.8', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok3', liquidityRemovedPct: 0.79 }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags team_concentration when teamWalletConcentrationPct >= 0.5', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok4', teamWalletConcentrationPct: 0.5 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags mint_backdoor when mintFunctionPresent is true', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok5', mintFunctionPresent: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when all signals fire', async () => {
    const r = await rugpullApply(makeCtx({
      rugpullSignals: [{ tokenAddr: '0xtok6', liquidityRemovedPct: 1.0, teamWalletConcentrationPct: 0.9, mintFunctionPresent: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});

// ── stablecoin_arbitrage_anomaly ────────────────────────────────────────────

describe('stablecoin_arbitrage_anomaly', () => {
  it('returns inconclusive when no stablecoinArbs supplied', async () => {
    const r = await stablecoinArbApply(makeCtx());
    expect(r.verdict).toBe('inconclusive');
    expect(r.modeId).toBe('stablecoin_arbitrage_anomaly');
  });

  it('returns clear when no signals fire', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e1', depegPctFromPar: 0.01, arbProfitAed: 50000 }],
    }));
    expect(r.verdict).toBe('clear');
  });

  it('flags depeg_arb when depeg >= 5% and profit >= 100k', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e2', depegPctFromPar: 0.05, arbProfitAed: 100000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag depeg_arb when depeg < 5%', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e3', depegPctFromPar: 0.04, arbProfitAed: 200000 }],
    }));
    expect(r.score).toBe(0);
  });

  it('does not flag depeg_arb when profit < 100k', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e4', depegPctFromPar: 0.10, arbProfitAed: 99999 }],
    }));
    expect(r.score).toBe(0);
  });

  it('handles negative depeg (de-pegging in other direction)', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e5', depegPctFromPar: -0.07, arbProfitAed: 200000 }],
    }));
    // |−0.07| = 0.07 >= 0.05 → flags
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags flagged_venue when venueFlagged is true', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e6', venueFlagged: true }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates when both signals fire', async () => {
    const r = await stablecoinArbApply(makeCtx({
      stablecoinArbs: [{ eventId: 'e7', depegPctFromPar: 0.15, arbProfitAed: 500000, venueFlagged: true }],
    }));
    expect(r.verdict).toBe('escalate');
  });
});
