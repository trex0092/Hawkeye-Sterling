// Hawkeye Sterling — wave-3 behavioral / transactional batch (10 modes).
// Anchors: FATF R.10 · UAE FDL 10/2025 Art.15 · BCBS Sound Management.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface SignalHit { id: string; label: string; weight: number; evidence: string; }
type ModeApply = (ctx: BrainContext) => Promise<Finding>;
const FAC: FacultyId[] = ['data_analysis', 'forensic_accounting'];
const CAT: ReasoningCategory = 'behavioral_signals';
function clamp01(n: number): number { return Math.max(0, Math.min(n, 1)); }
function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
function empty(modeId: string, key: string): Finding {
  return { modeId, category: CAT, faculties: FAC, score: 0, confidence: 0.2, verdict: 'inconclusive' as Verdict, rationale: `No ${key} evidence supplied.`, evidence: [], producedAt: Date.now() };
}
function build(modeId: string, hits: SignalHit[], n: number, anchors: string): Finding {
  const raw = hits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(raw > 0.7 ? 0.7 + (raw - 0.7) * 0.3 : raw);
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return { modeId, category: CAT, faculties: FAC, score, confidence: hits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * hits.length), verdict, rationale: `${hits.length} signal(s) over ${n} item(s). ${hits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ')}. Anchors: ${anchors}.`, evidence: hits.slice(0, 8).map((h) => h.evidence), producedAt: Date.now() };
}

interface RapidLayer { sequenceId: string; legCount?: number; totalSpanHours?: number; cumulativeAmountAed?: number; }
const rapidLayeringApply: ModeApply = async (ctx) => {
  const items = typedEvidence<RapidLayer>(ctx, 'rapidLayers');
  if (items.length === 0) return empty('rapid_layering_pattern', 'rapidLayers');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.legCount ?? 0) >= 5 && (i.totalSpanHours ?? Infinity) <= 24) hits.push({ id: 'fast_multi_leg', label: `${i.legCount} legs in ${i.totalSpanHours}h`, weight: 0.45, evidence: i.sequenceId });
    if ((i.cumulativeAmountAed ?? 0) >= 1_000_000) hits.push({ id: 'high_cumulative', label: `Cumulative AED ${i.cumulativeAmountAed}`, weight: 0.25, evidence: i.sequenceId });
  }
  return build('rapid_layering_pattern', hits, items.length, 'FATF Operational Issues for Money Laundering 2017');
};

interface FunnelAccount { accountId: string; uniqueDepositors?: number; passThroughRatio?: number; daysActive?: number; }
const funnelAccountApply: ModeApply = async (ctx) => {
  const items = typedEvidence<FunnelAccount>(ctx, 'funnelAccounts');
  if (items.length === 0) return empty('funnel_account_indicator', 'funnelAccounts');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.uniqueDepositors ?? 0) >= 10 && (i.daysActive ?? 0) <= 30) hits.push({ id: 'many_depositors_short_life', label: `${i.uniqueDepositors} depositors in ${i.daysActive}d`, weight: 0.4, evidence: i.accountId });
    if ((i.passThroughRatio ?? 0) >= 0.95) hits.push({ id: 'pure_passthrough', label: `${((i.passThroughRatio ?? 0) * 100).toFixed(0)}% passthrough`, weight: 0.35, evidence: i.accountId });
  }
  return build('funnel_account_indicator', hits, items.length, 'FATF Hawala 2013 · Egmont typologies');
};

interface PaymentLoop { loopId: string; nodeCount?: number; closesIn24h?: boolean; netDeltaAed?: number; }
const circularPaymentApply: ModeApply = async (ctx) => {
  const items = typedEvidence<PaymentLoop>(ctx, 'paymentLoops');
  if (items.length === 0) return empty('circular_payment_loop', 'paymentLoops');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.nodeCount ?? 0) >= 4 && i.closesIn24h === true) hits.push({ id: 'fast_circle', label: `${i.nodeCount}-node loop in 24h`, weight: 0.4, evidence: i.loopId });
    if (Math.abs(i.netDeltaAed ?? 0) < 1_000) hits.push({ id: 'zero_net', label: 'Loop nets ≈ 0 AED', weight: 0.25, evidence: i.loopId });
  }
  return build('circular_payment_loop', hits, items.length, 'FATF ML/TF Risk in financial flows 2018');
};

interface DormantWake { accountId: string; dormantDays?: number; wakeAmountAed?: number; wakeChannel?: string; }
const dormantWakeApply: ModeApply = async (ctx) => {
  const items = typedEvidence<DormantWake>(ctx, 'dormantWakes');
  if (items.length === 0) return empty('dormant_to_active_anomaly', 'dormantWakes');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.dormantDays ?? 0) >= 365 && (i.wakeAmountAed ?? 0) >= 100_000) hits.push({ id: 'big_wake', label: `${i.dormantDays}d dormant → AED ${i.wakeAmountAed}`, weight: 0.4, evidence: i.accountId });
  }
  return build('dormant_to_active_anomaly', hits, items.length, 'FATF Operational Issues 2017 · UAE CBUAE');
};

interface RoundAmount { txId: string; amountAed?: number; }
const roundAmountApply: ModeApply = async (ctx) => {
  const items = typedEvidence<RoundAmount>(ctx, 'roundAmountTxns');
  if (items.length === 0) return empty('round_amount_clustering', 'roundAmountTxns');
  const hits: SignalHit[] = [];
  const round = items.filter((i) => {
    const a = i.amountAed ?? 0;
    return a >= 1_000 && a % 1_000 === 0;
  });
  if (round.length >= items.length * 0.7 && items.length >= 5) hits.push({ id: 'round_dominance', label: `${round.length}/${items.length} round-thousand`, weight: 0.35, evidence: `${round.length}/${items.length}` });
  return build('round_amount_clustering', hits, items.length, 'FATF typologies · BCBS sound management');
};

interface MidnightTxn { txId: string; hourLocal?: number; amountAed?: number; }
const midnightBurstApply: ModeApply = async (ctx) => {
  const items = typedEvidence<MidnightTxn>(ctx, 'midnightTxns');
  if (items.length === 0) return empty('midnight_burst_pattern', 'midnightTxns');
  const offHours = items.filter((i) => (i.hourLocal ?? 12) >= 0 && (i.hourLocal ?? 12) <= 4);
  const hits: SignalHit[] = [];
  if (offHours.length >= 5 && offHours.length / items.length >= 0.5) hits.push({ id: 'midnight_concentration', label: `${offHours.length} txns in 00:00-04:00`, weight: 0.35, evidence: `${offHours.length}/${items.length}` });
  return build('midnight_burst_pattern', hits, items.length, 'FATF behavioural typologies');
};

interface SalaryAccount { accountId: string; salaryDeposit?: number; nonSalaryInflows?: number; outflowsToHighRiskCountry?: boolean; }
const salaryMisuseApply: ModeApply = async (ctx) => {
  const items = typedEvidence<SalaryAccount>(ctx, 'salaryAccounts');
  if (items.length === 0) return empty('salary_account_misuse', 'salaryAccounts');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.nonSalaryInflows ?? 0) > (i.salaryDeposit ?? 0) * 5) hits.push({ id: 'inflows_exceed_salary', label: `Non-salary inflows >>5× salary`, weight: 0.4, evidence: i.accountId });
    if (i.outflowsToHighRiskCountry === true) hits.push({ id: 'high_risk_outflow', label: 'Outflows to high-risk country', weight: 0.3, evidence: i.accountId });
  }
  return build('salary_account_misuse', hits, items.length, 'UAE WPS · FATF R.10');
};

interface AtmDensity { atmId: string; depositsLast24h?: number; uniqueCardsLast24h?: number; }
const atmDensityApply: ModeApply = async (ctx) => {
  const items = typedEvidence<AtmDensity>(ctx, 'atmDensity');
  if (items.length === 0) return empty('atm_density_anomaly', 'atmDensity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.depositsLast24h ?? 0) >= 50 && (i.uniqueCardsLast24h ?? 0) <= 5) hits.push({ id: 'few_cards_many_deposits', label: `${i.depositsLast24h} deposits / ${i.uniqueCardsLast24h} cards`, weight: 0.4, evidence: i.atmId });
  }
  return build('atm_density_anomaly', hits, items.length, 'FATF Operational Issues 2017');
};

interface GeoVelocity { customerId: string; firstCity?: string; secondCity?: string; gapMinutes?: number; estimatedDistanceKm?: number; }
const impossibleGeoApply: ModeApply = async (ctx) => {
  const items = typedEvidence<GeoVelocity>(ctx, 'geoVelocity');
  if (items.length === 0) return empty('impossible_geo_velocity', 'geoVelocity');
  const hits: SignalHit[] = [];
  for (const i of items) {
    const gap = i.gapMinutes ?? 0;
    const dist = i.estimatedDistanceKm ?? 0;
    if (gap > 0 && dist / (gap / 60) >= 1_000) hits.push({ id: 'supersonic_velocity', label: `${dist}km in ${gap}min`, weight: 0.45, evidence: `${i.customerId}: ${i.firstCity} → ${i.secondCity}` });
  }
  return build('impossible_geo_velocity', hits, items.length, 'FATF Digital Identity Guidance 2020');
};

interface ChargebackRing { ringId: string; merchantCount?: number; cardCount?: number; chargebackPctOfVolume?: number; }
const chargebackRingApply: ModeApply = async (ctx) => {
  const items = typedEvidence<ChargebackRing>(ctx, 'chargebackRings');
  if (items.length === 0) return empty('chargeback_ring_pattern', 'chargebackRings');
  const hits: SignalHit[] = [];
  for (const i of items) {
    if ((i.chargebackPctOfVolume ?? 0) >= 0.05) hits.push({ id: 'high_chargeback', label: `${((i.chargebackPctOfVolume ?? 0) * 100).toFixed(1)}% chargeback`, weight: 0.35, evidence: i.ringId });
    if ((i.merchantCount ?? 0) >= 5 && (i.cardCount ?? 0) >= 20) hits.push({ id: 'merchant_card_overlap', label: `${i.merchantCount} merchants, ${i.cardCount} cards`, weight: 0.3, evidence: i.ringId });
  }
  return build('chargeback_ring_pattern', hits, items.length, 'card-scheme rules · FATF R.16');
};

export const BEHAVIORAL_BATCH_APPLIES: Record<string, ModeApply> = {
  rapid_layering_pattern: rapidLayeringApply,
  funnel_account_indicator: funnelAccountApply,
  circular_payment_loop: circularPaymentApply,
  dormant_to_active_anomaly: dormantWakeApply,
  round_amount_clustering: roundAmountApply,
  midnight_burst_pattern: midnightBurstApply,
  salary_account_misuse: salaryMisuseApply,
  atm_density_anomaly: atmDensityApply,
  impossible_geo_velocity: impossibleGeoApply,
  chargeback_ring_pattern: chargebackRingApply,
};
