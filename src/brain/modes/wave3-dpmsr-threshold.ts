// Hawkeye Sterling — wave-3 mode: dpmsr_55k_threshold
// CR134/2025 Art.3 mandates DPMSR filing for any single cash transaction OR
// linked cash transactions totalling AED 55,000 or above. This is a separate
// and distinct filing obligation from the general STR — it is triggered by
// amount alone, regardless of suspicion. This mode evaluates a transaction set
// and returns filing obligations with linked-transaction aggregation.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

export interface DpmsrTransaction {
  txnId: string;
  amountAed: number;
  channel: 'cash' | 'cash_courier' | 'wire' | 'card' | 'crypto' | 'other';
  at: string;           // ISO datetime
  customerId?: string;
  linkedGroupId?: string; // explicitly linked transaction group
  goldGrams?: number;
  goldSpec?: string;
}

export interface DpmsrObligation {
  obligationId: string;
  triggerType: 'single' | 'linked';
  totalAmountAed: number;
  transactionIds: string[];
  customerId?: string;
  detectedAt: string;
  legalBasis: string;
  filingDeadlineHours: number;
  status: 'pending' | 'filed' | 'overdue';
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }

function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const DPMSR_THRESHOLD_AED = 55_000;
const LINK_WINDOW_DAYS = 3;   // transactions within 3 days can be "linked" if same customer
const LEGAL_BASIS = 'CR134/2025 Art.3 + MoE Circ.08/AML/2021';
const FILING_DEADLINE_HOURS = 24;

function daysBetween(a: string, b: string): number {
  const diff = Math.abs(Date.parse(a) - Date.parse(b));
  return diff / (1000 * 60 * 60 * 24);
}

export const dpmsrThresholdApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<DpmsrTransaction>(ctx, 'dpmsrTransactions');

  if (txns.length === 0) {
    return {
      modeId: 'dpmsr_55k_threshold',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
      score: 0, confidence: 0.15, verdict: 'inconclusive' as Verdict,
      rationale: 'No dpmsrTransactions evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const cashTxns = txns.filter((t) => t.channel === 'cash' || t.channel === 'cash_courier');
  const hits: SignalHit[] = [];
  const obligations: DpmsrObligation[] = [];

  // 1. Single-transaction threshold breaches.
  const singleBreaches = cashTxns.filter((t) => t.amountAed >= DPMSR_THRESHOLD_AED);
  for (const t of singleBreaches) {
    hits.push({
      id: `single_breach_${t.txnId}`,
      label: `Single cash transaction AED ${t.amountAed.toLocaleString()} ≥ threshold`,
      weight: 0.9,
      evidence: `txnId=${t.txnId} amount=${t.amountAed} channel=${t.channel} at=${t.at}`,
    });
    obligations.push({
      obligationId: `dpmsr_single_${t.txnId}`,
      triggerType: 'single',
      totalAmountAed: t.amountAed,
      transactionIds: [t.txnId],
      ...(t.customerId !== undefined ? { customerId: t.customerId } : {}),
      detectedAt: new Date().toISOString(),
      legalBasis: LEGAL_BASIS,
      filingDeadlineHours: FILING_DEADLINE_HOURS,
      status: 'pending',
    });
  }

  // 2. Linked-transaction aggregation — same customer within the link window.
  const byCustomer = new Map<string, DpmsrTransaction[]>();
  for (const t of cashTxns) {
    if (!t.customerId) continue;
    const arr = byCustomer.get(t.customerId);
    if (arr) arr.push(t); else byCustomer.set(t.customerId, [t]);
  }

  for (const [customerId, customerTxns] of byCustomer) {
    if (customerTxns.length < 2) continue;
    const sorted = [...customerTxns].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    // Sliding window: find groups within LINK_WINDOW_DAYS that aggregate to ≥ 55k.
    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i];
      if (!anchor) continue;
      const window: DpmsrTransaction[] = [anchor];
      let total = anchor.amountAed;
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j];
        if (!next) continue;
        if (daysBetween(anchor.at, next.at) <= LINK_WINDOW_DAYS) {
          window.push(next);
          total += next.amountAed;
        }
      }
      if (window.length >= 2 && total >= DPMSR_THRESHOLD_AED) {
        // Check it's not already covered by a single-breach obligation.
        const txnIds = window.map((t) => t.txnId);
        const alreadyCovered = obligations.some(
          (o) => o.triggerType === 'single' && txnIds.some((id) => o.transactionIds.includes(id))
        );
        if (!alreadyCovered) {
          hits.push({
            id: `linked_breach_${customerId}_${i}`,
            label: `Linked cash transactions AED ${total.toLocaleString()} ≥ threshold (${window.length} txns)`,
            weight: 0.85,
            evidence: `customer=${customerId} txns=${txnIds.join(',')} window=${LINK_WINDOW_DAYS}d`,
          });
          obligations.push({
            obligationId: `dpmsr_linked_${customerId}_${Date.now()}_${i}`,
            triggerType: 'linked',
            totalAmountAed: total,
            transactionIds: txnIds,
            ...(customerId !== undefined ? { customerId } : {}),
            detectedAt: new Date().toISOString(),
            legalBasis: LEGAL_BASIS,
            filingDeadlineHours: FILING_DEADLINE_HOURS,
            status: 'pending',
          });
        }
        break; // take the first qualifying window per customer per starting point
      }
    }
  }

  // 3. Explicit linked-group override: respect linkedGroupId field.
  const byGroup = new Map<string, DpmsrTransaction[]>();
  for (const t of cashTxns) {
    if (!t.linkedGroupId) continue;
    const arr = byGroup.get(t.linkedGroupId);
    if (arr) arr.push(t); else byGroup.set(t.linkedGroupId, [t]);
  }
  for (const [groupId, groupTxns] of byGroup) {
    const total = groupTxns.reduce((s, t) => s + t.amountAed, 0);
    if (total >= DPMSR_THRESHOLD_AED) {
      const txnIds = groupTxns.map((t) => t.txnId);
      if (!obligations.some((o) => txnIds.some((id) => o.transactionIds.includes(id)))) {
        hits.push({
          id: `group_breach_${groupId}`,
          label: `Explicitly linked group AED ${total.toLocaleString()} ≥ threshold`,
          weight: 0.95,
          evidence: `groupId=${groupId} txns=${txnIds.join(',')}`,
        });
        obligations.push({
          obligationId: `dpmsr_group_${groupId}`,
          triggerType: 'linked',
          totalAmountAed: total,
          transactionIds: txnIds,
          detectedAt: new Date().toISOString(),
          legalBasis: LEGAL_BASIS,
          filingDeadlineHours: FILING_DEADLINE_HOURS,
          status: 'pending',
        });
      }
    }
  }

  if (hits.length === 0) {
    return {
      modeId: 'dpmsr_55k_threshold',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
      score: 0, confidence: 0.9, verdict: 'clear' as Verdict,
      rationale: `${cashTxns.length} cash transaction(s) reviewed. No single or linked cash transaction reaches the AED ${DPMSR_THRESHOLD_AED.toLocaleString()} DPMSR threshold (${LEGAL_BASIS}).`,
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const maxWeight = Math.max(...hits.map((h) => h.weight));
  const score = clamp01(maxWeight + (hits.length > 1 ? 0.05 : 0));
  const conf = Math.min(0.97, 0.85 + hits.length * 0.03);

  return {
    modeId: 'dpmsr_55k_threshold',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'inference'] satisfies FacultyId[],
    score,
    confidence: conf,
    verdict: 'suspicious' as Verdict,
    rationale: `${obligations.length} DPMSR filing obligation(s) triggered. ${singleBreaches.length} single-transaction breach(es); ${obligations.filter((o) => o.triggerType === 'linked').length} linked-transaction aggregation(s). All filings due within ${FILING_DEADLINE_HOURS}h. Legal basis: ${LEGAL_BASIS}.`,
    evidence: hits.map((h) => h.id),
    producedAt: Date.now(),
  };
};
