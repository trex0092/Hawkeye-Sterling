import { describe, expect, it } from 'vitest';
import { INTEGRITY_MODE_APPLIES } from '../modes/integrity.js';
import type { BrainContext } from '../types.js';

function makeCtx(evidence: Record<string, unknown> = {}, domains: string[] = ['cdd']): BrainContext {
  return {
    run: { id: 'r-int', startedAt: Date.now() },
    subject: { name: 'Test Subject', type: 'entity' },
    evidence: evidence as BrainContext['evidence'],
    priorFindings: [],
    domains,
  };
}

describe('integrity — bridge_risk', () => {
  it('inconclusive without hops', async () => {
    const out = await INTEGRITY_MODE_APPLIES.bridge_risk!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on sanctioned bridge', async () => {
    const out = await INTEGRITY_MODE_APPLIES.bridge_risk!(makeCtx({
      bridgeHops: [{ bridgeName: 'Sanctioned-X', fromChain: 'eth', toChain: 'bsc', notional: 50000, sanctionedBridge: true, sourceRef: 'b-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — nft_wash', () => {
  it('inconclusive without trades', async () => {
    const out = await INTEGRITY_MODE_APPLIES.nft_wash!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on heavy same-cluster trading', async () => {
    const out = await INTEGRITY_MODE_APPLIES.nft_wash!(makeCtx({
      nftTrades: [
        { tokenId: 'T1', buyer: 'wA', seller: 'wB', pricedUsd: 100, buyerCluster: 'C1', sellerCluster: 'C1', sourceRef: 't-1' },
        { tokenId: 'T2', buyer: 'wC', seller: 'wD', pricedUsd: 200, buyerCluster: 'C1', sellerCluster: 'C1', sourceRef: 't-2' },
        { tokenId: 'T3', buyer: 'wE', seller: 'wF', pricedUsd: 150, buyerCluster: 'C2', sellerCluster: 'C3', sourceRef: 't-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — privacy_coin_reasoning', () => {
  it('inconclusive without flows', async () => {
    const out = await INTEGRITY_MODE_APPLIES.privacy_coin_reasoning!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on heavy XMR + shielded flows', async () => {
    const out = await INTEGRITY_MODE_APPLIES.privacy_coin_reasoning!(makeCtx({
      privacyCoinFlows: [
        { coin: 'XMR', notionalUsd: 800000, direction: 'in', sourceRef: 'f-1' },
        { coin: 'ZEC', notionalUsd: 400000, direction: 'in', shieldedPool: true, sourceRef: 'f-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — sensitivity_tornado', () => {
  it('inconclusive without interactions', async () => {
    const out = await INTEGRITY_MODE_APPLIES.sensitivity_tornado!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on direct sanctioned mixer interaction', async () => {
    const out = await INTEGRITY_MODE_APPLIES.sensitivity_tornado!(makeCtx({
      mixerInteractions: [{ mixerName: 'Tornado', hopsToCustomer: 1, notionalUsd: 50000, sanctioned: true, sourceRef: 'm-1' }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — stablecoin_reserve', () => {
  it('inconclusive without attestation', async () => {
    const out = await INTEGRITY_MODE_APPLIES.stablecoin_reserve!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on not-full-reserve + low cash share', async () => {
    const out = await INTEGRITY_MODE_APPLIES.stablecoin_reserve!(makeCtx({
      stablecoinAttestation: {
        issuer: 'X',
        reserveCompositionPct: { cash: 10, treasuries: 20, corporate: 40, commercialPaper: 30, other: 0 },
        attestationDate: '2026-01-01',
        attestor: 'BigFour',
        isFullReserve: false,
        sourceRef: 'a-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — app_scam', () => {
  it('inconclusive without events', async () => {
    const out = await INTEGRITY_MODE_APPLIES.app_scam!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on peer-bank-flagged beneficiary + override', async () => {
    const out = await INTEGRITY_MODE_APPLIES.app_scam!(makeCtx({
      appPaymentEvents: [{
        paymentId: 'P1', amountAed: 80000, beneficiaryNew: true,
        beneficiaryFlaggedByOther: true, customerOverrideOfWarning: true,
        hurriedClaimedReason: 'urgent_legal', sourceRef: 'p-1',
      }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — synthetic_id', () => {
  it('inconclusive without signal', async () => {
    const out = await INTEGRITY_MODE_APPLIES.synthetic_id!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on thin file + recent ID + address mismatch', async () => {
    const out = await INTEGRITY_MODE_APPLIES.synthetic_id!(makeCtx({
      syntheticIdSignal: {
        fileAgeDays: 30, idIssueDays: 30,
        addressMatchesEmployer: false, addressMatchesUtility: false,
        livenessVerified: false, socialFootprintScore: 0.1, sourceRef: 's-1',
      },
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — market_manipulation', () => {
  it('inconclusive without signals', async () => {
    const out = await INTEGRITY_MODE_APPLIES.market_manipulation!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on pump+dump + spoofing', async () => {
    const out = await INTEGRITY_MODE_APPLIES.market_manipulation!(makeCtx({
      orderBookSignals: [{
        symbol: 'XYZ', windowMin: 60, pumpReturnPct: 40, dumpReturnPct: -25,
        cancelToTradeRatio: 8, largeOrdersAtTopPct: 0.5, sourceRef: 'o-1',
      }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — front_running', () => {
  it('inconclusive without trades', async () => {
    const out = await INTEGRITY_MODE_APPLIES.front_running!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on frequent profitable beats', async () => {
    const out = await INTEGRITY_MODE_APPLIES.front_running!(makeCtx({
      prePostTrades: [
        { traderId: 'T1', customerId: 'C1', symbol: 'X', traderSecondsBeforeCustomer: 1, pnlBpsForTrader: 12, sourceRef: 'p-1' },
        { traderId: 'T1', customerId: 'C2', symbol: 'X', traderSecondsBeforeCustomer: 2, pnlBpsForTrader: 8, sourceRef: 'p-2' },
        { traderId: 'T1', customerId: 'C3', symbol: 'X', traderSecondsBeforeCustomer: 3, pnlBpsForTrader: 6, sourceRef: 'p-3' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — lapping', () => {
  it('inconclusive without postings', async () => {
    const out = await INTEGRITY_MODE_APPLIES.lapping!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on multiple mismatched + delayed postings', async () => {
    const out = await INTEGRITY_MODE_APPLIES.lapping!(makeCtx({
      arPostings: [
        { customerId: 'A', invoiceId: 'I1', paymentDate: '2026-01-01', postingDate: '2026-01-15', postingDelayDays: 14, postingMismatch: true, sourceRef: 'r-1' },
        { customerId: 'B', invoiceId: 'I2', paymentDate: '2026-01-02', postingDate: '2026-01-12', postingDelayDays: 10, postingMismatch: true, sourceRef: 'r-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — linguistic_forensics', () => {
  it('inconclusive without messages', async () => {
    const out = await INTEGRITY_MODE_APPLIES.linguistic_forensics!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on typosquat + banking change', async () => {
    const out = await INTEGRITY_MODE_APPLIES.linguistic_forensics!(makeCtx({
      messageSignals: [{
        messageId: 'M1', senderDomain: 'examp1e.com', expectedDomain: 'example.com',
        urgencyKeywords: 4, bankingChangeRequest: true, sourceRef: 'm-1',
      }],
    }));
    expect(out.verdict).toBe('escalate');
  });
});

describe('integrity — cross_case_triangulation', () => {
  it('inconclusive without related cases', async () => {
    const out = await INTEGRITY_MODE_APPLIES.cross_case_triangulation!(makeCtx());
    expect(out.verdict).toBe('inconclusive');
  });
  it('escalates on recurring indicator across cases', async () => {
    const out = await INTEGRITY_MODE_APPLIES.cross_case_triangulation!(makeCtx({
      relatedCaseHits: [
        { caseId: 'C1', indicator: 'shared-utility-bill', verdict: 'escalate', observedAt: '2026-01-01', sourceRef: 'c-1' },
        { caseId: 'C2', indicator: 'shared-utility-bill', verdict: 'flag',     observedAt: '2026-01-02', sourceRef: 'c-2' },
      ],
    }));
    expect(out.verdict).toBe('escalate');
  });
});
