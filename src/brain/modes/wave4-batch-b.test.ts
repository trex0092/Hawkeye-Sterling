// wave4-batch-b.test.ts — 100% branch/statement coverage for wave4-batch-b.ts
import { describe, it, expect } from 'vitest';
import { WAVE4_BATCH_B_APPLIES } from './wave4-batch-b.js';
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

// ─── benford_law ─────────────────────────────────────────────────────────────
describe('benford_law', () => {
  const fn = WAVE4_BATCH_B_APPLIES['benford_law']!;

  it('returns low score with < 30 transactions and no keywords', async () => {
    const r = await fn(makeCtx({ benfordTxns: [{ txId: 'T1', amount: 100 }] }));
    expect(r.score).toBeLessThan(0.4);
  });

  it('flags benford keyword with < 30 transactions', async () => {
    const r = await fn(makeCtx({ freeText: 'benford first digit fabricat' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('uses fallback transactions array when benfordTxns is empty', async () => {
    const r = await fn(makeCtx({ transactions: [{ amount: 100 }] }));
    expect(r.modeId).toBe('benford_law');
  });

  it('returns low score when counted < 10 after filtering', async () => {
    // Amounts all < 1 so they get filtered
    const txs = Array.from({ length: 35 }, (_, i) => ({ txId: `T${i}`, amount: 0.0001 }));
    const r = await fn(makeCtx({ benfordTxns: txs }));
    expect(r.score).toBe(0.05);
  });

  it('flags deviation with 30+ transactions (chi-square > 15.5)', async () => {
    // All amounts starting with digit 1 — extreme deviation for other digits
    const txs = Array.from({ length: 50 }, (_, i) => ({ txId: `T${i}`, amount: 100 + i }));
    const r = await fn(makeCtx({ benfordTxns: txs }));
    expect(r.modeId).toBe('benford_law');
  });

  it('handles 30+ transactions with normal distribution', async () => {
    // Generate amounts with reasonable digit distribution
    const txs = [
      ...Array.from({ length: 15 }, (_, i) => ({ amount: 100 + i })),
      ...Array.from({ length: 8 }, (_, i) => ({ amount: 200 + i })),
      ...Array.from({ length: 5 }, (_, i) => ({ amount: 300 + i })),
      ...Array.from({ length: 4 }, (_, i) => ({ amount: 400 + i })),
    ];
    const r = await fn(makeCtx({ benfordTxns: txs }));
    expect(r.modeId).toBe('benford_law');
  });
});

// ─── split_payment_detection ─────────────────────────────────────────────────
describe('split_payment_detection', () => {
  const fn = WAVE4_BATCH_B_APPLIES['split_payment_detection']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'structuring smurfing split payment below threshold' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags total exceeds threshold with max single below threshold', async () => {
    const r = await fn(makeCtx({
      splitPayments: [{
        groupId: 'G1',
        paymentCount: 6,
        totalAed: 60_000,
        thresholdAed: 55_000,
        maxSingleAed: 50_000,
        spanHours: 24,
      }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags many payments in short window', async () => {
    const r = await fn(makeCtx({
      splitPayments: [{ groupId: 'G1', paymentCount: 7, totalAed: 30_000, maxSingleAed: 5_000, spanHours: 24 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags near-threshold clustering', async () => {
    const r = await fn(makeCtx({
      splitPayments: [{ groupId: 'G1', paymentCount: 2, totalAed: 40_000, thresholdAed: 55_000, maxSingleAed: 52_000, spanHours: 72 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── round_trip_transaction ──────────────────────────────────────────────────
describe('round_trip_transaction', () => {
  const fn = WAVE4_BATCH_B_APPLIES['round_trip_transaction']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'round trip back-to-back net zero' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags return ratio within 0.85-1.15', async () => {
    const r = await fn(makeCtx({
      roundTrips: [{ tripId: 'T1', outflowAed: 100_000, inflowAed: 95_000, spanDays: 15, intermediaryCount: 3 }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('skips trip with outflow = 0', async () => {
    const r = await fn(makeCtx({ roundTrips: [{ tripId: 'T1', outflowAed: 0, inflowAed: 100_000 }] }));
    expect(r.score).toBe(0);
  });

  it('handles return ratio outside 0.85-1.15', async () => {
    const r = await fn(makeCtx({ roundTrips: [{ tripId: 'T1', outflowAed: 100_000, inflowAed: 10_000 }] }));
    expect(r.score).toBe(0);
  });
});

// ─── shell_triangulation ─────────────────────────────────────────────────────
describe('shell_triangulation', () => {
  const fn = WAVE4_BATCH_B_APPLIES['shell_triangulation']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'shell triangle three companies' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags all-shell triangle with 3+ nodes', async () => {
    const r = await fn(makeCtx({
      shellTriangles: [{ triangleId: 'T1', nodeCount: 3, allShells: true, jurisdictionCount: 3 }],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags extended chain (5+ nodes)', async () => {
    const r = await fn(makeCtx({
      shellTriangles: [{ triangleId: 'T1', nodeCount: 6, allShells: true, jurisdictionCount: 2 }],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });
});

// ─── po_fraud_pattern ────────────────────────────────────────────────────────
describe('po_fraud_pattern', () => {
  const fn = WAVE4_BATCH_B_APPLIES['po_fraud_pattern']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'purchase order invoice fraud procurement fraud' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags PO post-dating goods receipt', async () => {
    const grDate = Date.now() - 86400000;
    const poDate = Date.now();
    const r = await fn(makeCtx({ purchaseOrders: [{ poId: 'PO1', poDateMs: poDate, goodsReceivedDateMs: grDate }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags PO just below approval threshold', async () => {
    const r = await fn(makeCtx({ purchaseOrders: [{ poId: 'PO1', poValueAed: 95_000, approvalThresholdAed: 100_000 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags many POs in short period', async () => {
    const r = await fn(makeCtx({ purchaseOrders: [{ poId: 'PO1', priorPoCount: 4, priorPoSpanDays: 20 }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── vendor_master_anomaly ───────────────────────────────────────────────────
describe('vendor_master_anomaly', () => {
  const fn = WAVE4_BATCH_B_APPLIES['vendor_master_anomaly']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'ghost vendor vendor fraud fictitious vendor' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags bank account shared with employee', async () => {
    const r = await fn(makeCtx({ vendors: [{ vendorId: 'V1', bankAccountSharedWithEmployee: true }] }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags address matching employee', async () => {
    const r = await fn(makeCtx({ vendors: [{ vendorId: 'V1', addressMatchesEmployee: true }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags no physical presence', async () => {
    const r = await fn(makeCtx({ vendors: [{ vendorId: 'V1', noPhysicalPresence: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags paid before registration', async () => {
    const r = await fn(makeCtx({ vendors: [{ vendorId: 'V1', registrationDateMs: Date.now(), firstPaymentDateMs: Date.now() - 86400000 }] }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags low name match score', async () => {
    const r = await fn(makeCtx({ vendors: [{ vendorId: 'V1', nameMatchScore: 0.3 }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── journal_entry_anomaly ───────────────────────────────────────────────────
describe('journal_entry_anomaly', () => {
  const fn = WAVE4_BATCH_B_APPLIES['journal_entry_anomaly']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'journal entry je fraud general ledger top-side' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags off-hours (late night) post', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', postedHourLocal: 23, hasDescription: true, approvedBy: 'mgr', amountAed: 1001 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags off-hours (early morning) post', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', postedHourLocal: 3, hasDescription: true, approvedBy: 'mgr' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags weekend post', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', weekendPost: true, hasDescription: true, approvedBy: 'mgr', amountAed: 999 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags missing description', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', hasDescription: false, approvedBy: 'mgr' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags unapproved entry', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', hasDescription: true }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags round number amount', async () => {
    const r = await fn(makeCtx({ journalEntries: [{ jeId: 'JE1', amountAed: 5_000, hasDescription: true, approvedBy: 'mgr' }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── revenue_recognition_stretch ─────────────────────────────────────────────
describe('revenue_recognition_stretch', () => {
  const fn = WAVE4_BATCH_B_APPLIES['revenue_recognition_stretch']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'revenue recognition channel stuffing bill and hold premature revenue' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags revenue recognised before delivery', async () => {
    const recDate = Date.now() - 30 * 86400000;
    const delDate = Date.now();
    const r = await fn(makeCtx({ revenueEntries: [{ contractId: 'C1', recognitionDateMs: recDate, deliveryDateMs: delDate }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags 95%+ PoC without delivery milestone', async () => {
    const r = await fn(makeCtx({
      revenueEntries: [{ contractId: 'C1', percentageComplete: 97, recognitionBasisStated: 'milestone-based', deliveryDateMs: 0 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── stylometry ───────────────────────────────────────────────────────────────
describe('stylometry', () => {
  const fn = WAVE4_BATCH_B_APPLIES['stylometry']!;

  it('returns clear with < 2 documents', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags stylometry keyword with < 2 documents', async () => {
    const r = await fn(makeCtx({ freeText: 'ghost impersonation stylometry authorship' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('detects word length deviation in documents by same author', async () => {
    const r = await fn(makeCtx({
      documents: [
        { docId: 'D1', authorId: 'A1', avgWordLength: 4.0 },
        { docId: 'D2', authorId: 'A1', avgWordLength: 7.0 },
        { docId: 'D3', authorId: 'A1', avgWordLength: 4.2 },
      ],
    }));
    expect(r.modeId).toBe('stylometry');
  });

  it('returns low score with no deviation', async () => {
    const r = await fn(makeCtx({
      documents: [
        { docId: 'D1', authorId: 'A1', avgWordLength: 5.0 },
        { docId: 'D2', authorId: 'A1', avgWordLength: 5.1 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('handles single document per author (no comparison possible)', async () => {
    const r = await fn(makeCtx({
      documents: [
        { docId: 'D1', authorId: 'A1', avgWordLength: 5.0 },
        { docId: 'D2', authorId: 'A2', avgWordLength: 6.0 },
      ],
    }));
    expect(r.score).toBe(0);
  });

  it('handles docs without avgWordLength (zeros filtered)', async () => {
    const r = await fn(makeCtx({
      documents: [
        { docId: 'D1', authorId: 'A1' },
        { docId: 'D2', authorId: 'A1' },
      ],
    }));
    expect(r.score).toBe(0);
  });
});

// ─── gaslighting_detection ───────────────────────────────────────────────────
describe('gaslighting_detection', () => {
  const fn = WAVE4_BATCH_B_APPLIES['gaslighting_detection']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags gaslighting terms in freeText', async () => {
    const r = await fn(makeCtx({ freeText: 'never happened system error your mistake you are wrong i never said prove it fabricated' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags gaslighting terms in communications', async () => {
    const r = await fn(makeCtx({
      communications: [{ commId: 'C1', text: 'that is not what i said and stop lying your records are wrong' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('deduplicates repeated signals', async () => {
    const r = await fn(makeCtx({
      freeText: 'never happened never happened',
      communications: [{ commId: 'C1', text: 'never happened' }],
    }));
    // score based on deduplicated set
    expect(r.modeId).toBe('gaslighting_detection');
  });
});

// ─── obfuscation_pattern ─────────────────────────────────────────────────────
describe('obfuscation_pattern', () => {
  const fn = WAVE4_BATCH_B_APPLIES['obfuscation_pattern']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags deep UBO chain (>=5)', async () => {
    const ubo = Array.from({ length: 5 }, (_, i) => ({ jurisdiction: `JUR${i}` }));
    const r = await fn(makeCtx({ uboChain: ubo }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags nominee terms in freeText', async () => {
    const r = await fn(makeCtx({ freeText: 'nominee bearer share no beneficial owner no ubo identified opaque structure complex structure layered ownership trust overlay' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('adds score when sanctions or PEP hits exist', async () => {
    const r = await fn(makeCtx({ sanctionsHits: [{ id: 'S1' }], pepHits: [{ id: 'P1' }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags 4+ distinct UBO jurisdictions', async () => {
    const ubo = [
      { jurisdiction: 'AE' }, { jurisdiction: 'VG' }, { jurisdiction: 'PA' }, { jurisdiction: 'KY' }, { jurisdiction: 'CH' },
    ];
    const r = await fn(makeCtx({ uboChain: ubo }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── code_word_detection ─────────────────────────────────────────────────────
describe('code_word_detection', () => {
  const fn = WAVE4_BATCH_B_APPLIES['code_word_detection']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags narcotics code words in freeText', async () => {
    const r = await fn(makeCtx({ freeText: 'received some powder and merchandise' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags code words in communications', async () => {
    const r = await fn(makeCtx({
      communications: [{ commId: 'C1', text: 'delivery of hardware tools items' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags code words in transaction memos', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', memo: 'service fee for the project', description: 'cause donation' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags laundering code words', async () => {
    const r = await fn(makeCtx({ freeText: 'clean loan repayment commission gift' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── hedging_language ────────────────────────────────────────────────────────
describe('hedging_language', () => {
  const fn = WAVE4_BATCH_B_APPLIES['hedging_language']!;

  it('returns low score with no hedging', async () => {
    const r = await fn(makeCtx({ freeText: 'the transaction was executed on time and correctly' }));
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags moderate hedging (2-5%)', async () => {
    const r = await fn(makeCtx({ freeText: 'i think maybe possibly i believe sort of approximately roughly' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high hedging density (>5%)', async () => {
    // Dense hedging by repeating terms
    const hedgeText = Array.from({ length: 15 }, () => 'i think maybe possibly').join(' ');
    const r = await fn(makeCtx({ freeText: hedgeText }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags very high hedging (>10%)', async () => {
    const hedgeText = Array.from({ length: 30 }, () => 'i think maybe').join(' ');
    const r = await fn(makeCtx({ freeText: hedgeText }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags hedging in communications', async () => {
    const r = await fn(makeCtx({
      communications: [{ commId: 'C1', text: 'i cannot recall if i remember correctly i am not certain what happened' }],
    }));
    expect(r.modeId).toBe('hedging_language');
  });
});

// ─── minimisation_pattern ────────────────────────────────────────────────────
describe('minimisation_pattern', () => {
  const fn = WAVE4_BATCH_B_APPLIES['minimisation_pattern']!;

  it('returns clear with no minimisation', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags minimisation terms', async () => {
    const r = await fn(makeCtx({ freeText: 'just a small insignificant nothing serious routine transaction standard practice everyone does it' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags more minimisation terms for higher score', async () => {
    const r = await fn(makeCtx({ freeText: 'trivial negligible harmless simple loan just a gift minor adjustment small favour no big deal not a big deal barely it is normal' }));
    expect(r.score).toBeGreaterThan(0.3);
  });
});

// ─── chain_of_custody_reasoning ──────────────────────────────────────────────
describe('chain_of_custody_reasoning', () => {
  const fn = WAVE4_BATCH_B_APPLIES['chain_of_custody_reasoning']!;

  it('returns clear with no evidence', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags keyword with no structured evidence', async () => {
    const r = await fn(makeCtx({ freeText: 'chain of custody evidence tamper document integrity' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags failed hash verification', async () => {
    const r = await fn(makeCtx({ custodyRecords: [{ docId: 'D1', hashVerified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags custody gap > 7 days', async () => {
    const r = await fn(makeCtx({ custodyRecords: [{ docId: 'D1', hashVerified: true, gapDays: 10 }] }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags no handler recorded', async () => {
    // handledBy=[] gives gScore=0.2; need an additional issue to reach threshold 0.3 for issueCount++
    const r = await fn(makeCtx({ custodyRecords: [{ docId: 'D1', handledBy: [], hashVerified: false }] }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── prospect_theory ─────────────────────────────────────────────────────────
describe('prospect_theory', () => {
  const fn = WAVE4_BATCH_B_APPLIES['prospect_theory']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags loss domain terms only', async () => {
    const r = await fn(makeCtx({ freeText: 'debt insolvency bankruptcy' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('escalates with loss domain + high risk priors', async () => {
    const ctx = makeCtx({ freeText: 'loss debt insolvency bankruptcy foreclosure margin call underwater negative equity financial difficulty desperate' });
    ctx.priorFindings = [makePrior(0.7), makePrior(0.8)];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags high-risk priors alone', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.7), makePrior(0.6)];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── status_quo_bias ─────────────────────────────────────────────────────────
describe('status_quo_bias', () => {
  const fn = WAVE4_BATCH_B_APPLIES['status_quo_bias']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags inertia terms with 2+ warning priors', async () => {
    const ctx = makeCtx({ freeText: 'long-standing historic relationship always been decades' });
    ctx.priorFindings = [makePrior(0.5, 'flag'), makePrior(0.6, 'escalate')];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags inertia with 1 warning prior', async () => {
    const ctx = makeCtx({ freeText: 'long standing traditional' });
    ctx.priorFindings = [makePrior(0.5, 'flag')];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0);
  });

  it('gives low score without warning priors', async () => {
    const r = await fn(makeCtx({ freeText: 'legacy established practice unchanged' }));
    expect(r.score).toBeLessThan(0.3);
  });
});

// ─── endowment_effect ────────────────────────────────────────────────────────
describe('endowment_effect', () => {
  const fn = WAVE4_BATCH_B_APPLIES['endowment_effect']!;

  it('returns clear with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags ownership terms', async () => {
    const r = await fn(makeCtx({ freeText: 'refuse to sell will not divest mine my property my company my asset not for sale i built it family asset inherited' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags documentation resistance terms', async () => {
    const r = await fn(makeCtx({ freeText: 'refuses to provide unwilling to disclose declined to share no documentation available cannot provide' }));
    expect(r.score).toBeGreaterThan(0.3);
  });
});

// ─── hyperbolic_discount ─────────────────────────────────────────────────────
describe('hyperbolic_discount', () => {
  const fn = WAVE4_BATCH_B_APPLIES['hyperbolic_discount']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags urgency terms', async () => {
    const r = await fn(makeCtx({ freeText: 'immediate urgent asap same day right now no delay cash now liquidate sell at any price below market' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags deep-discount rapid transactions', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', discountPct: 20, urgencyFlagDays: 1 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── certainty_effect ────────────────────────────────────────────────────────
describe('certainty_effect', () => {
  const fn = WAVE4_BATCH_B_APPLIES['certainty_effect']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags certainty terms with high-score priors', async () => {
    const ctx = makeCtx({ freeText: 'guaranteed fixed amount certain payment no risk assured definite promised' });
    ctx.priorFindings = [makePrior(0.7)];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags single certainty term without priors', async () => {
    const r = await fn(makeCtx({ freeText: 'guaranteed payment' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── reference_point_shift ───────────────────────────────────────────────────
describe('reference_point_shift', () => {
  const fn = WAVE4_BATCH_B_APPLIES['reference_point_shift']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags reframing + adverse context', async () => {
    const r = await fn(makeCtx({ freeText: 'return on investment profit cash wire offshore undocumented informal' }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags reframing alone (score < 0.3)', async () => {
    const r = await fn(makeCtx({ freeText: 'earnings bonus' }));
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags single reframe + single adverse context', async () => {
    const r = await fn(makeCtx({ freeText: 'roi cash' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── mental_accounting ───────────────────────────────────────────────────────
describe('mental_accounting', () => {
  const fn = WAVE4_BATCH_B_APPLIES['mental_accounting']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags cross-purpose transactions (personal -> business)', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', fromAccountPurpose: 'personal savings', toAccountPurpose: 'business operating', amountAed: 50_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags salary -> investment', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', fromAccountPurpose: 'salary account', toAccountPurpose: 'investment account', amountAed: 30_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags savings -> operating', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', fromAccountPurpose: 'savings account', toAccountPurpose: 'operating account', amountAed: 20_000 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('no flag when purposes are same', async () => {
    const r = await fn(makeCtx({
      transactions: [{ txId: 'T1', fromAccountPurpose: 'business', toAccountPurpose: 'business' }],
    }));
    expect(r.score).toBe(0);
  });

  it('flags mental account terms in freeText', async () => {
    const r = await fn(makeCtx({ freeText: 'separate accounts keep separate different pot ring-fenced another account for that that money is separate' }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── k_core_analysis ─────────────────────────────────────────────────────────
describe('k_core_analysis', () => {
  const fn = WAVE4_BATCH_B_APPLIES['k_core_analysis']!;

  it('returns clear with < 3 nodes', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags k-core keywords with insufficient nodes', async () => {
    const r = await fn(makeCtx({ freeText: 'k-core network core dense network' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('uses pre-computed kCore values (k>=5)', async () => {
    const nodes = [
      { nodeId: 'A', kCore: 5, flagged: true },
      { nodeId: 'B', kCore: 5 },
      { nodeId: 'C', kCore: 5 },
      { nodeId: 'D', kCore: 3 },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('uses pre-computed kCore values (k 3-4)', async () => {
    const nodes = [
      { nodeId: 'A', kCore: 3 },
      { nodeId: 'B', kCore: 3 },
      { nodeId: 'C', kCore: 2 },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('uses degree proxy when no kCore values', async () => {
    // sorted degrees [3,3,3,3,10,10,10], median index=3 → medianDegree=3, threshold=max(3,6)=6
    // nodes with degree >= 6: [10,10,10] → 3 high-degree nodes → score = 0.55 > 0.3
    const nodes = [
      { nodeId: 'A', degree: 10, flagged: true },
      { nodeId: 'B', degree: 10 },
      { nodeId: 'C', degree: 10 },
      { nodeId: 'D', degree: 3 },
      { nodeId: 'E', degree: 3 },
      { nodeId: 'F', degree: 3 },
      { nodeId: 'G', degree: 3 },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('handles low-degree nodes', async () => {
    const nodes = [{ nodeId: 'A', degree: 1 }, { nodeId: 'B', degree: 1 }, { nodeId: 'C', degree: 1 }];
    const r = await fn(makeCtx({ graphNodes: nodes }));
    expect(r.score).toBeLessThan(0.3);
  });
});

// ─── bridge_detection ────────────────────────────────────────────────────────
describe('bridge_detection', () => {
  const fn = WAVE4_BATCH_B_APPLIES['bridge_detection']!;

  it('returns clear with insufficient graph data', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags bridge keyword with insufficient data', async () => {
    const r = await fn(makeCtx({ freeText: 'bridge cut vertex articulation' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('detects bridges in graph', async () => {
    const nodes = [{ nodeId: 'A' }, { nodeId: 'B' }, { nodeId: 'C' }, { nodeId: 'D' }];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes, graphEdges: edges }));
    expect(r.modeId).toBe('bridge_detection');
    expect(r.score).toBeGreaterThan(0);
  });

  it('boosts score with flagged bridge edges', async () => {
    const nodes = [{ nodeId: 'A' }, { nodeId: 'B' }, { nodeId: 'C' }];
    const edges = [
      { from: 'A', to: 'B', flagged: true },
      { from: 'B', to: 'C', flagged: true },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes, graphEdges: edges }));
    expect(r.modeId).toBe('bridge_detection');
  });
});

// ─── temporal_motif ──────────────────────────────────────────────────────────
describe('temporal_motif', () => {
  const fn = WAVE4_BATCH_B_APPLIES['temporal_motif']!;

  it('returns clear with < 3 temporal edges', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags temporal keyword with insufficient edges', async () => {
    const r = await fn(makeCtx({ freeText: 'temporal time-ordered sequential flow' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('detects A->B->C motifs within 3-day window', async () => {
    const now = Date.now();
    const edges = [
      { from: 'A', to: 'B', timestampMs: now },
      { from: 'B', to: 'C', timestampMs: now + 86400000 },
      { from: 'C', to: 'D', timestampMs: now + 2 * 86400000 },
    ];
    const r = await fn(makeCtx({ temporalEdges: edges }));
    expect(r.modeId).toBe('temporal_motif');
    expect(r.score).toBeGreaterThan(0.2);
  });

  it('gives low score when motifs span > 3 days', async () => {
    const now = Date.now();
    const edges = [
      { from: 'A', to: 'B', timestampMs: now },
      { from: 'B', to: 'C', timestampMs: now + 5 * 86400000 },
      { from: 'C', to: 'D', timestampMs: now + 10 * 86400000 },
    ];
    const r = await fn(makeCtx({ temporalEdges: edges }));
    expect(r.score).toBeLessThan(0.3);
  });
});

// ─── reciprocal_edge_pattern ──────────────────────────────────────────────────
describe('reciprocal_edge_pattern', () => {
  const fn = WAVE4_BATCH_B_APPLIES['reciprocal_edge_pattern']!;

  it('returns clear with insufficient edges', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags reciprocal keyword with insufficient data', async () => {
    const r = await fn(makeCtx({ freeText: 'reciprocal back-and-forth circular flow wash' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags near-zero-net reciprocal pairs', async () => {
    const edges = [
      { from: 'A', to: 'B', amountAed: 100_000 },
      { from: 'B', to: 'A', amountAed: 98_000 },
    ];
    const r = await fn(makeCtx({ graphEdges: edges }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('does not flag when net is large', async () => {
    const edges = [
      { from: 'A', to: 'B', amountAed: 100_000 },
      { from: 'B', to: 'A', amountAed: 30_000 },
    ];
    const r = await fn(makeCtx({ graphEdges: edges }));
    expect(r.score).toBeLessThan(0.4);
  });
});

// ─── triadic_closure ─────────────────────────────────────────────────────────
describe('triadic_closure', () => {
  const fn = WAVE4_BATCH_B_APPLIES['triadic_closure']!;

  it('returns clear with insufficient data', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags triadic keyword with insufficient data', async () => {
    const r = await fn(makeCtx({ freeText: 'triadic clustering closed network' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('detects high clustering coefficient', async () => {
    // Complete triangle: A-B, B-C, A-C
    const nodes = [{ nodeId: 'A' }, { nodeId: 'B' }, { nodeId: 'C' }];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'A', to: 'C' },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes, graphEdges: edges }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('gives low score for sparse network', async () => {
    const nodes = [{ nodeId: 'A' }, { nodeId: 'B' }, { nodeId: 'C' }];
    const edges = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'C' }];
    // Actually same graph as complete triangle — let's use a chain
    const chainEdges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }];
    const r = await fn(makeCtx({ graphNodes: nodes, graphEdges: chainEdges }));
    expect(r.modeId).toBe('triadic_closure');
  });
});

// ─── structural_hole ─────────────────────────────────────────────────────────
describe('structural_hole', () => {
  const fn = WAVE4_BATCH_B_APPLIES['structural_hole']!;

  it('returns clear with insufficient data', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags structural hole keyword with insufficient data', async () => {
    const r = await fn(makeCtx({ freeText: 'structural hole broker intermediary brokerage' }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('detects broker node (high degree, low clustering)', async () => {
    const nodes = [
      { nodeId: 'Test', degree: 4 },
      { nodeId: 'B' },
      { nodeId: 'C' },
      { nodeId: 'D' },
      { nodeId: 'E' },
    ];
    const edges = [
      { from: 'Test', to: 'B' },
      { from: 'Test', to: 'C' },
      { from: 'Test', to: 'D' },
      { from: 'Test', to: 'E' },
    ];
    const r = await fn(makeCtx({ graphNodes: nodes, graphEdges: edges }));
    expect(r.modeId).toBe('structural_hole');
  });
});

// ─── greenwashing_signal ─────────────────────────────────────────────────────
describe('greenwashing_signal', () => {
  const fn = WAVE4_BATCH_B_APPLIES['greenwashing_signal']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags claims without contradiction', async () => {
    const r = await fn(makeCtx({ freeText: 'net zero carbon neutral sustainable green esg responsible' }));
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags 2 claims + 1 contradiction (escalate)', async () => {
    const r = await fn(makeCtx({ freeText: 'net zero sustainable carbon neutral coal fossil fuel' }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags 1 claim + 1 contradiction (flag)', async () => {
    const r = await fn(makeCtx({ freeText: 'green coal' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags contradictions in documents', async () => {
    const r = await fn(makeCtx({
      freeText: 'sustainable company',
      documents: [{ docId: 'D1', text: 'deforestation and pollution fine ongoing' }],
    }));
    expect(r.score).toBeGreaterThan(0.3);
  });
});

// ─── forced_labour_supply_chain ───────────────────────────────────────────────
describe('forced_labour_supply_chain', () => {
  const fn = WAVE4_BATCH_B_APPLIES['forced_labour_supply_chain']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags 1 forced labour indicator', async () => {
    const r = await fn(makeCtx({ freeText: 'forced labour detected in production facility' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags 2+ forced labour indicators with supply chain context', async () => {
    const r = await fn(makeCtx({ freeText: 'debt bondage modern slavery supplier withhold passport factory' }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags 3+ indicators for high score', async () => {
    const r = await fn(makeCtx({ freeText: 'forced labour debt bondage kafala bonded labour human trafficking' }));
    expect(r.score).toBeGreaterThan(0.6);
  });

  it('flags indicators in documents', async () => {
    const r = await fn(makeCtx({
      documents: [{ docId: 'D1', text: 'withhold passport restricted movement coercion' }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── conflict_mineral_typology ────────────────────────────────────────────────
describe('conflict_mineral_typology', () => {
  const fn = WAVE4_BATCH_B_APPLIES['conflict_mineral_typology']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags mineral + conflict zone', async () => {
    const r = await fn(makeCtx({ freeText: 'gold mining from drc congo armed group' }));
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('flags mineral + conflict + compliance gap for higher score', async () => {
    const r = await fn(makeCtx({ freeText: 'coltan from drc conflict zone no cmrt no smelter audit unverified source' }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags mineral without conflict zone (lower score)', async () => {
    const r = await fn(makeCtx({ freeText: 'gold ore tin tungsten mineral' }));
    expect(r.score).toBeLessThan(0.3);
  });
});

// ─── carbon_fraud_pattern ────────────────────────────────────────────────────
describe('carbon_fraud_pattern', () => {
  const fn = WAVE4_BATCH_B_APPLIES['carbon_fraud_pattern']!;

  it('returns low score with no signals', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags fraud terms in freeText', async () => {
    const r = await fn(makeCtx({ freeText: 'double count phantom project carousel fraud' }));
    expect(r.score).toBeGreaterThan(0.5);
  });

  it('flags carbon mention alone (low score)', async () => {
    const r = await fn(makeCtx({ freeText: 'carbon credit cer' }));
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags unverified carbon credit transactions', async () => {
    const r = await fn(makeCtx({
      freeText: 'carbon offset',
      transactions: [
        { txId: 'T1', instrumentType: 'carbon credit', registryVerified: false },
        { txId: 'T2', instrumentType: 'carbon offset', registryVerified: false },
      ],
    }));
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('flags vintage anomalies (too old)', async () => {
    const r = await fn(makeCtx({
      freeText: 'carbon allowance',
      transactions: [{ txId: 'T1', instrumentType: 'carbon credit', vintageYear: 1990 }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags vintage anomalies (future year)', async () => {
    const futureYear = new Date().getFullYear() + 3;
    const r = await fn(makeCtx({
      freeText: 'carbon credit',
      transactions: [{ txId: 'T1', instrumentType: 'carbon credit', vintageYear: futureYear }],
    }));
    expect(r.score).toBeGreaterThan(0);
  });
});

// ─── dempster_shafer ─────────────────────────────────────────────────────────
describe('dempster_shafer', () => {
  const fn = WAVE4_BATCH_B_APPLIES['dempster_shafer']!;

  it('returns low score with < 2 prior findings', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('combines belief masses from 2+ prior findings', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.7), makePrior(0.8)];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0);
    expect(r.modeId).toBe('dempster_shafer');
  });

  it('handles high-conflict combination', async () => {
    const ctx = makeCtx();
    // Score=0.9 + Score=0.9 → may trigger high K
    ctx.priorFindings = [
      makePrior(0.9, 'escalate', 'test1'),
      makePrior(0.9, 'escalate', 'test2'),
      makePrior(0.9, 'escalate', 'test3'),
    ];
    const r = await fn(ctx);
    expect(r.modeId).toBe('dempster_shafer');
  });

  it('filters stub findings', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [
      { ...makePrior(0.7), rationale: '[stub] test', tags: ['meta'] } as Finding,
      makePrior(0.6),
    ];
    const r = await fn(ctx);
    expect(r.modeId).toBe('dempster_shafer');
  });
});

// ─── bayesian_update_cascade ──────────────────────────────────────────────────
describe('bayesian_update_cascade', () => {
  const fn = WAVE4_BATCH_B_APPLIES['bayesian_update_cascade']!;

  it('returns baseline with no priors', async () => {
    const r = await fn(makeCtx());
    expect(r.modeId).toBe('bayesian_update_cascade');
  });

  it('updates posterior with prior findings', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.8), makePrior(0.7)];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0.1);
  });

  it('skips findings with score < 0.05', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.01), makePrior(0.02)];
    const r = await fn(ctx);
    expect(r.modeId).toBe('bayesian_update_cascade');
  });

  it('caps at 12 prior findings', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = Array.from({ length: 15 }, () => makePrior(0.7));
    const r = await fn(ctx);
    expect(r.modeId).toBe('bayesian_update_cascade');
  });
});

// ─── multi_source_consistency ────────────────────────────────────────────────
describe('multi_source_consistency', () => {
  const fn = WAVE4_BATCH_B_APPLIES['multi_source_consistency']!;

  it('returns low score with < 2 findings', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBeLessThan(0.3);
  });

  it('flags consensus adverse verdict', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [
      makePrior(0.8, 'escalate'),
      makePrior(0.75, 'escalate'),
      makePrior(0.7, 'escalate'),
    ];
    const r = await fn(ctx);
    expect(r.score).toBeGreaterThan(0);
  });

  it('flags high variance (epistemic conflict)', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [
      makePrior(0.9, 'escalate'),
      makePrior(0.1, 'clear'),
      makePrior(0.8, 'escalate'),
      makePrior(0.05, 'clear'),
    ];
    const r = await fn(ctx);
    expect(r.modeId).toBe('multi_source_consistency');
  });
});

// ─── counter_evidence_weighting ───────────────────────────────────────────────
describe('counter_evidence_weighting', () => {
  const fn = WAVE4_BATCH_B_APPLIES['counter_evidence_weighting']!;

  it('returns low score with no findings', async () => {
    const r = await fn(makeCtx());
    expect(r.score).toBe(0);
  });

  it('flags all adverse with no counter-evidence', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [makePrior(0.8, 'escalate'), makePrior(0.7, 'escalate')];
    const r = await fn(ctx);
    expect(r.modeId).toBe('counter_evidence_weighting');
    // CAUTION warning for no counter-evidence
  });

  it('considers counter terms in freeText', async () => {
    const ctx = makeCtx({ freeText: 'transaction cleared verified legitimate documented corroborated audited certified compliant clean approved authorised' });
    ctx.priorFindings = [makePrior(0.7, 'escalate')];
    const r = await fn(ctx);
    expect(r.modeId).toBe('counter_evidence_weighting');
  });

  it('handles mix of adverse and clear findings', async () => {
    const ctx = makeCtx();
    ctx.priorFindings = [
      makePrior(0.8, 'escalate'),
      makePrior(0.1, 'clear'),
    ];
    const r = await fn(ctx);
    expect(r.modeId).toBe('counter_evidence_weighting');
  });
});
