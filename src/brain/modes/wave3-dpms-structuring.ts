// Hawkeye Sterling — wave-3 mode: dpms_cash_structuring_split
// (audit follow-up #7). Specifically detects DPMS-flavoured cash
// structuring: AED 45-55k cash purchases, rapid resale, third-party
// settlement — the canonical UAE DPMS sanctions-evasion pattern.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface DpmsTransaction {
  txnId: string;
  amountAed?: number;
  channel?: 'cash' | 'cash_courier' | 'wire' | 'card' | 'crypto';
  at?: string;
  rapidResaleDays?: number;
  thirdPartySettlement?: boolean;
  customerId?: string;
  goldGrams?: number;
}

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

const STRUCTURING_BAND_LOW = 45_000;
const STRUCTURING_BAND_HIGH = 55_000;
const RAPID_RESALE_DAYS_MAX = 30;

export const dpmsStructuringApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = typedEvidence<DpmsTransaction>(ctx, 'dpmsTransactions');
  if (txns.length === 0) {
    return {
      modeId: 'dpms_cash_structuring_split',
      category: 'sectoral_typology' as ReasoningCategory,
      faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
      score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict,
      rationale: 'No dpmsTransactions evidence supplied.',
      evidence: [], producedAt: Date.now(),
    };
  }

  const hits: SignalHit[] = [];
  const inBand = txns.filter((t) => (t.channel === 'cash' || t.channel === 'cash_courier') && (t.amountAed ?? 0) >= STRUCTURING_BAND_LOW && (t.amountAed ?? 0) < STRUCTURING_BAND_HIGH);

  // 1. Threshold-band cash density.
  if (inBand.length >= 3) {
    hits.push({ id: 'threshold_band_cash_density', label: `${inBand.length} cash purchases in AED 45-55k band`, weight: 0.35, evidence: inBand.slice(0, 4).map((t) => t.txnId).join(', ') });
  }

  // 2. Same-customer split — same customer with ≥3 in-band cash purchases within 30 days.
  const byCust = new Map<string, DpmsTransaction[]>();
  for (const t of inBand) {
    const cid = t.customerId ?? 'unknown';
    const arr = byCust.get(cid);
    if (arr) arr.push(t); else byCust.set(cid, [t]);
  }
  for (const [cid, arr] of byCust) {
    if (cid === 'unknown' || arr.length < 3) continue;
    arr.sort((a, b) => Date.parse(a.at ?? '') - Date.parse(b.at ?? ''));
    const span = (Date.parse(arr[arr.length - 1]?.at ?? '') - Date.parse(arr[0]?.at ?? '')) / 86_400_000;
    if (Number.isFinite(span) && span <= 30) {
      hits.push({ id: 'same_customer_split', label: `Same customer ${arr.length} in-band purchases in ${span.toFixed(0)}d`, weight: 0.3, evidence: `${cid} (${arr.length} txns)` });
    }
  }

  // 3. Rapid resale.
  const rapidResales = txns.filter((t) => (t.rapidResaleDays ?? Infinity) <= RAPID_RESALE_DAYS_MAX);
  if (rapidResales.length >= 2) {
    hits.push({ id: 'rapid_resale', label: `${rapidResales.length} purchases with rapid resale (≤${RAPID_RESALE_DAYS_MAX}d)`, weight: 0.2, evidence: rapidResales.slice(0, 4).map((t) => t.txnId).join(', ') });
  }

  // 4. Third-party settlement.
  const thirdParty = txns.filter((t) => t.thirdPartySettlement === true);
  if (thirdParty.length >= 2) {
    hits.push({ id: 'third_party_settlement', label: `${thirdParty.length} third-party settled txns`, weight: 0.25, evidence: thirdParty.slice(0, 4).map((t) => t.txnId).join(', ') });
  }

  // 5. Bullion-as-currency — large gold-gram volume + cash-only.
  const bullionAsCurrency = txns.filter((t) => (t.goldGrams ?? 0) >= 100 && (t.channel === 'cash' || t.channel === 'cash_courier'));
  if (bullionAsCurrency.length >= 2) {
    hits.push({ id: 'bullion_as_currency', label: `${bullionAsCurrency.length} ≥100g bullion purchases via cash`, weight: 0.2, evidence: bullionAsCurrency.slice(0, 4).map((t) => `${t.txnId} (${t.goldGrams}g)`).join(', ') });
  }

  const rawScore = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  return {
    modeId: 'dpms_cash_structuring_split',
    category: 'sectoral_typology' as ReasoningCategory,
    faculties: ['data_analysis', 'forensic_accounting'] satisfies FacultyId[],
    score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict,
    rationale: `${hits.length} DPMS structuring signal(s) over ${txns.length} txn(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: Cabinet Res 134/2025 Art.12-14 · MoE Circular 3/2025 · UAE FDL 10/2025 Art.15.`,
    evidence: hits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};
export default dpmsStructuringApply;
