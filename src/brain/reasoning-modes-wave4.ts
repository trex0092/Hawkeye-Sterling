// Wave 4 — weaponisation pass.
// Replaces stub apply() bodies with real algorithms across forensic, statistical,
// behavioural, compliance, linguistic, graph, crypto, and aggregation categories.
// Also introduces new modes: sanctions_cross_reference, pep_screening,
// adverse_media_scoring, structuring_detection, smurfing_detection,
// jurisdiction_risk_score.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode, Verdict,
} from './types.js';
import { matchScore, normalizeLatin } from './lib/name-matching.js';
import { jurisdictionProfile, jurisdictionCascadeRisk, JURISDICTION_DATA_AS_OF } from './lib/jurisdictions.js';
import {
  extractAmounts, extractTimestamps, structuringScan, smurfingScan,
  roundAmountRate, roundTripScan, peelChainScore, timeClusteringScore,
  washTradeScore, journalAnomalyScore,
} from './lib/tx-patterns.js';
import { scoreAdverseMedia } from './lib/adverse-media-scorer.js';
import { assessPEP } from './lib/pep.js';
import { analyseText, gaslightingScore, freeTextFromEvidence } from './lib/stylometry.js';
import {
  bayesianCascade, dsCombineAll, multiSourceConsistency, counterEvidence,
} from './lib/aggregation.js';
import {
  graphFromTransactions, graphFromUBO, degree, betweenness, kCore, bridges,
  communities, hasCycle, triadicGaps, shortestPath,
} from './lib/graph.js';
import {
  zScoreAgainstCohort, chiSquareGoF, klDivergence, spikeDetection,
  changePoint, mean, stdev, chiSquarePValueDf1,
} from './lib/statistics.js';
import { analyseCryptoEvidence, KNOWN_MIXERS_SEED } from './lib/crypto-risk.js';
import { matchTypologies, typologyCompositeScore } from './lib/typologies.js';

// ── shared helpers ───────────────────────────────────────────────────────
function verdictFromScore(score: number, hasEvidence: boolean): Verdict {
  if (!hasEvidence && score === 0) return 'inconclusive';
  if (score >= 0.8) return 'block';
  if (score >= 0.55) return 'escalate';
  if (score >= 0.3) return 'flag';
  return 'clear';
}

function finding(
  id: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  score: number,
  confidence: number,
  verdict: Verdict,
  rationale: string,
  evidence: string[],
): Finding {
  return {
    modeId: id, category, faculties,
    score: Math.max(0, Math.min(1, score)),
    confidence: Math.max(0, Math.min(1, confidence)),
    verdict, rationale, evidence, producedAt: Date.now(),
  };
}

function inconclusive(
  id: string, cat: ReasoningCategory, fac: FacultyId[], reason: string,
): Finding {
  return finding(id, cat, fac, 0, 0.25, 'inconclusive', reason, []);
}

function jurisdictionsOfContext(ctx: BrainContext): string[] {
  const codes: string[] = [];
  if (ctx.subject.jurisdiction) codes.push(ctx.subject.jurisdiction);
  const ev = ctx.evidence;
  if (ev.transactions && Array.isArray(ev.transactions)) {
    for (const t of ev.transactions) {
      if (t && typeof t === 'object' && 'country' in t) {
        const c = (t as { country: unknown }).country;
        if (typeof c === 'string') codes.push(c);
      }
    }
  }
  return [...new Set(codes.map((c) => c.toUpperCase()))];
}

// ── ENTITY / MATCHING ────────────────────────────────────────────────────
async function entityResolutionApply(ctx: BrainContext): Promise<Finding> {
  const name = ctx.subject.name;
  const aliases = ctx.subject.aliases ?? [];
  const hits = Array.isArray(ctx.evidence.sanctionsHits) ? ctx.evidence.sanctionsHits : [];
  if (hits.length === 0) {
    return inconclusive('entity_resolution', 'forensic', ['data_analysis'],
      'No candidate sanctions hits supplied; awaits ingestion (Phase 2) or prior matcher output.');
  }
  let best = { score: 0, confidence: 0, who: '' };
  for (const h of hits) {
    if (!h || typeof h !== 'object') continue;
    const hname = (h as { name?: unknown }).name;
    if (typeof hname !== 'string') continue;
    const m = matchScore(name, hname);
    for (const al of aliases) {
      const m2 = matchScore(al, hname);
      if (m2.score > m.score) Object.assign(m, m2);
    }
    if (m.score > best.score) best = { score: m.score, confidence: m.confidence, who: hname };
  }
  const verdict = best.score >= 0.9 ? 'block' : best.score >= 0.75 ? 'escalate' : best.score >= 0.6 ? 'flag' : 'clear';
  return finding('entity_resolution', 'forensic', ['data_analysis'], best.score, best.confidence, verdict,
    best.score >= 0.75
      ? `Strong entity-resolution match against "${best.who}" (score ${best.score.toFixed(3)}).`
      : best.score > 0
        ? `Best candidate "${best.who}" at score ${best.score.toFixed(3)} — below decision threshold.`
        : 'No candidates scored above the noise floor.',
    [`candidates=${hits.length}`, `best_match=${best.who}`, `best_score=${best.score.toFixed(3)}`],
  );
}

async function sanctionsCrossReferenceApply(ctx: BrainContext): Promise<Finding> {
  const hits = Array.isArray(ctx.evidence.sanctionsHits) ? ctx.evidence.sanctionsHits : [];
  if (hits.length === 0) {
    return inconclusive('sanctions_cross_reference', 'compliance_framework', ['ratiocination','intelligence'],
      'No sanctions-list candidates attached — matching pass yielded empty set.');
  }
  const hot = hits.filter((h) => h && typeof h === 'object'
    && typeof (h as { score?: unknown }).score === 'number'
    && (h as { score: number }).score >= 0.85).length;
  const score = Math.min(1, hot / 3 + 0.1 * Math.min(1, hits.length / 10));
  return finding('sanctions_cross_reference', 'compliance_framework', ['ratiocination','intelligence'],
    score, 0.8, verdictFromScore(score, true),
    `${hot}/${hits.length} list candidates above 0.85 composite.`,
    [`candidates=${hits.length}`, `strong_matches=${hot}`]);
}

async function listWalkApply(ctx: BrainContext): Promise<Finding> {
  const lists = ['UN Consolidated','OFAC SDN','OFAC Consolidated','EU FSF','UK OFSI','UAE EOCN','UAE LTL'];
  const hits = Array.isArray(ctx.evidence.sanctionsHits) ? ctx.evidence.sanctionsHits : [];
  const bySource = new Map<string, number>();
  for (const h of hits) {
    if (!h || typeof h !== 'object') continue;
    const s = (h as { source?: unknown }).source;
    if (typeof s === 'string') bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }
  const covered = bySource.size;
  const score = hits.length > 0 ? Math.min(0.6, 0.1 * hits.length) : 0;
  return finding('list_walk', 'compliance_framework', ['ratiocination'],
    score, 0.9, verdictFromScore(score, hits.length > 0),
    `Walked ${lists.length} lists; ${covered} returned candidates, ${hits.length} total matches.`,
    lists.concat([...bySource.entries()].map(([s, n]) => `${s}=${n}`)));
}

async function typologyCatalogueApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence) + ' ' + (ctx.subject.name ?? '');
  const matches = matchTypologies(text);
  if (matches.length === 0) {
    return finding('typology_catalogue', 'compliance_framework', ['intelligence'],
      0, 0.7, text.length > 50 ? 'clear' : 'inconclusive',
      text.length > 50 ? 'No registered FATF/Egmont/APG typology fingerprints fired.'
                       : 'Insufficient free-text evidence to match typologies.',
      [`text_length=${text.length}`]);
  }
  const composite = typologyCompositeScore(matches);
  return finding('typology_catalogue', 'compliance_framework', ['intelligence'],
    composite, 0.82, verdictFromScore(composite, true),
    `${matches.length} typology hits: ${matches.slice(0,5).map((m) => m.typology.name).join('; ')}.`,
    matches.slice(0, 8).map((m) => `typology=${m.typology.id}`));
}

async function sanctionsRegimeMatrixApply(ctx: BrainContext): Promise<Finding> {
  const jlist = jurisdictionsOfContext(ctx);
  const exposures: string[] = [];
  for (const j of jlist) {
    const p = jurisdictionProfile(j);
    if (p.tiers.includes('sanctioned_regime')) exposures.push(`${p.code}:${p.name}`);
  }
  const score = Math.min(1, exposures.length * 0.4);
  return finding('sanctions_regime_matrix', 'compliance_framework', ['intelligence'],
    score, 0.85, verdictFromScore(score, exposures.length > 0),
    exposures.length > 0 ? `Sanctions-regime exposure: ${exposures.join(', ')}.`
                         : 'No sanctioned-regime jurisdictions found in declared scope.',
    exposures.length > 0 ? exposures : [`checked=${jlist.join(',') || 'none'}`]);
}

// ── TRANSACTION PATTERNS ─────────────────────────────────────────────────
async function splitPaymentApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 5) {
    return inconclusive('split_payment_detection', 'forensic', ['smartness'],
      `Need ≥5 transactions; got ${amounts.length}.`);
  }
  const r = structuringScan(amounts);
  const score = Math.min(1, r.rate * 2 + (r.nearThreshold >= 3 ? 0.2 : 0));
  return finding('split_payment_detection', 'forensic', ['smartness'],
    score, 0.85, verdictFromScore(score, true),
    `${r.nearThreshold}/${r.total} amounts sit in the 90-99.9% band of the $${r.threshold} threshold (${(r.rate*100).toFixed(1)}%).`,
    [`rate=${r.rate.toFixed(3)}`, `examples=${r.examples.join(',')}`]);
}

async function structuringDetectionApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length === 0) return inconclusive('structuring_detection', 'forensic', ['smartness'], 'No amounts supplied.');
  const r = structuringScan(amounts);
  const score = r.rate >= 0.3 ? 0.85 : r.rate >= 0.15 ? 0.5 : r.rate > 0 ? 0.2 : 0;
  return finding('structuring_detection', 'forensic', ['smartness','data_analysis'],
    score, 0.85, verdictFromScore(score, true),
    `Structuring scan: ${r.nearThreshold} near-threshold on ${r.total} amounts (${(r.rate*100).toFixed(1)}%).`,
    [`rate=${r.rate.toFixed(3)}`, `threshold=${r.threshold}`]);
}

async function smurfingDetectionApply(ctx: BrainContext): Promise<Finding> {
  const r = smurfingScan(ctx.evidence.transactions);
  if (r.windows === 0 && r.burstSize === 0) {
    return finding('smurfing_detection', 'forensic', ['smartness','data_analysis'],
      0, 0.7, 'clear', 'No short-window burst patterns among sub-threshold transactions.',
      [`rate=${r.rate.toFixed(3)}`]);
  }
  const score = Math.min(1, 0.3 * r.windows + 0.1 * Math.min(r.burstSize, 10));
  return finding('smurfing_detection', 'forensic', ['smartness','data_analysis'],
    score, 0.8, verdictFromScore(score, true),
    `${r.windows} burst windows; largest burst ${r.burstSize}; avg amount ${r.avgAmount.toFixed(2)}.`,
    [`windows=${r.windows}`, `burst=${r.burstSize}`]);
}

async function roundTripApply(ctx: BrainContext): Promise<Finding> {
  const r = roundTripScan(ctx.evidence.transactions);
  if (r.cycles === 0) {
    return finding('round_trip_transaction', 'forensic', ['smartness'],
      0, 0.75, 'clear', 'No paired in/out cycles within 10% balance on any counterparty.',
      [`pairs_examined=${r.topPairs.length}`]);
  }
  const score = Math.min(1, 0.4 + 0.2 * r.cycles);
  return finding('round_trip_transaction', 'forensic', ['smartness'],
    score, 0.82, verdictFromScore(score, true),
    `${r.cycles} round-trip cycles detected.`,
    r.topPairs.slice(0, 3).map((p) => `${p.counterparty}:in=${p.inflow},out=${p.outflow},δ=${p.delta.toFixed(2)}`));
}

async function washTradeApply(ctx: BrainContext): Promise<Finding> {
  const r = washTradeScore(ctx.evidence.transactions);
  if (r.pairs === 0) {
    return finding('wash_trade', 'forensic', ['smartness'], 0, 0.75, 'clear',
      'No matched self-trade patterns (counterparty in/out within 5%).', []);
  }
  const score = Math.min(1, 0.4 + 0.15 * r.pairs);
  return finding('wash_trade', 'forensic', ['smartness'], score, 0.8, verdictFromScore(score, true),
    `${r.pairs} counterparties show matched inflow/outflow within 5%; notional volume ≈ ${r.volume.toFixed(0)}.`,
    [`pairs=${r.pairs}`, `volume=${r.volume.toFixed(0)}`]);
}

async function peelChainApply(ctx: BrainContext): Promise<Finding> {
  const r = peelChainScore(ctx.evidence.transactions);
  if (r.outs < 5) return inconclusive('peel_chain', 'crypto_defi', ['data_analysis'],
    `Need ≥5 outgoing events; got ${r.outs}.`);
  return finding('peel_chain', 'crypto_defi', ['data_analysis'],
    r.score, 0.78, verdictFromScore(r.score, true),
    `Peel-chain symptom score ${r.score.toFixed(2)} over ${r.outs} outgoings spanning ${r.span.toFixed(1)}h.`,
    [`outs=${r.outs}`, `span_h=${r.span.toFixed(1)}`]);
}

async function reciprocalEdgeApply(ctx: BrainContext): Promise<Finding> {
  const r = roundTripScan(ctx.evidence.transactions);
  const count = r.topPairs.filter((p) => p.inflow > 0 && p.outflow > 0).length;
  const score = Math.min(1, 0.15 * count);
  return finding('reciprocal_edge_pattern', 'graph_analysis', ['data_analysis'],
    score, 0.75, verdictFromScore(score, count > 0),
    `${count} counterparties show reciprocal (in + out) flow.`,
    r.topPairs.slice(0, 3).map((p) => `${p.counterparty}:in=${p.inflow},out=${p.outflow}`));
}

async function journalEntryApply(ctx: BrainContext): Promise<Finding> {
  const ts = extractTimestamps(ctx.evidence.transactions);
  if (ts.length < 10) return inconclusive('journal_entry_anomaly', 'forensic', ['data_analysis'],
    `Need ≥10 timestamps; got ${ts.length}.`);
  const r = journalAnomalyScore(ts);
  const score = Math.min(1, r.weekendRate * 1.5 + r.monthEndRate * 1.2);
  return finding('journal_entry_anomaly', 'forensic', ['data_analysis'],
    score, 0.7, verdictFromScore(score, true),
    `Weekend postings ${(r.weekendRate*100).toFixed(1)}%, month-end postings ${(r.monthEndRate*100).toFixed(1)}%.`,
    [`weekend=${r.weekendRate.toFixed(3)}`, `month_end=${r.monthEndRate.toFixed(3)}`, `n=${r.count}`]);
}

async function patternOfLifeApply(ctx: BrainContext): Promise<Finding> {
  const ts = extractTimestamps(ctx.evidence.transactions);
  if (ts.length < 10) return inconclusive('pattern_of_life', 'forensic', ['intelligence'],
    `Need ≥10 timestamps for baseline; got ${ts.length}.`);
  const tc = timeClusteringScore(ts);
  const score = tc.verdict === 'regular' ? 0.55 : tc.verdict === 'bursty' ? 0.45 : 0.1;
  return finding('pattern_of_life', 'forensic', ['intelligence'],
    score, 0.75, verdictFromScore(score, true),
    `Inter-arrival CoV ${tc.cov.toFixed(2)} — classified as ${tc.verdict}.`,
    [`cov=${tc.cov.toFixed(3)}`, `verdict=${tc.verdict}`]);
}

async function peerGroupAnomalyApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 10) return inconclusive('peer_group_anomaly', 'forensic', ['data_analysis'],
    'Insufficient transactions for z-score against cohort.');
  const total = amounts.reduce((a, b) => a + b, 0);
  // Synthetic cohort: same count of amounts sampled at median × [0.5..1.5].
  const med = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)] ?? 0;
  const cohort = Array.from({ length: amounts.length }, (_, i) => med * (0.5 + ((i * 97) % 100) / 100));
  const cohortTotal = cohort.reduce((a, b) => a + b, 0);
  const z = zScoreAgainstCohort(total, [cohortTotal]);
  const score = Math.min(1, Math.abs(z.z) / 5);
  return finding('peer_group_anomaly', 'forensic', ['data_analysis'],
    score, 0.6, verdictFromScore(score, true),
    `Aggregate z vs synthetic peer cohort = ${z.z.toFixed(2)}.`,
    [`z=${z.z.toFixed(3)}`, `mean=${z.mean.toFixed(0)}`, `stdev=${z.stdev.toFixed(0)}`]);
}

async function spikeDetectionApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 10) return inconclusive('spike_detection', 'behavioral_signals', ['data_analysis'],
    `Need ≥10 observations; got ${amounts.length}.`);
  const r = spikeDetection(amounts, 3);
  const score = Math.min(1, r.aboveThreshold * 0.15);
  return finding('spike_detection', 'behavioral_signals', ['data_analysis','smartness'],
    score, 0.75, verdictFromScore(score, r.aboveThreshold > 0),
    `${r.aboveThreshold} amount-series spikes past |z|=3.`,
    [`spikes=${r.aboveThreshold}`, `max_z=${r.maxDeviation.toFixed(2)}`]);
}

async function seasonalityApply(ctx: BrainContext): Promise<Finding> {
  const ts = extractTimestamps(ctx.evidence.transactions);
  if (ts.length < 14) return inconclusive('seasonality', 'behavioral_signals', ['data_analysis'],
    `Need ≥14 timestamps; got ${ts.length}.`);
  const dow = new Array<number>(7).fill(0);
  for (const t of ts) {
    const d = new Date(t).getUTCDay();
    dow[d] = (dow[d] ?? 0) + 1;
  }
  const uniform = Array.from({ length: 7 }, () => ts.length / 7);
  const { chi2 } = chiSquareGoF(dow, uniform);
  const flagged = chi2 > 12.59; // 6 df 95% ≈ 12.59
  const score = flagged ? Math.min(1, chi2 / 30) : 0.1;
  return finding('seasonality', 'behavioral_signals', ['data_analysis'],
    score, 0.7, verdictFromScore(score, true),
    `Day-of-week χ²(6) = ${chi2.toFixed(2)} (flagged=${flagged}).`,
    [`dow=${dow.join(',')}`, `chi2=${chi2.toFixed(2)}`]);
}

async function regimeChangeApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 12) return inconclusive('regime_change', 'behavioral_signals', ['data_analysis'],
    'Need ≥12 observations for changepoint.');
  const cp = changePoint(amounts);
  if (!cp) return finding('regime_change', 'behavioral_signals', ['data_analysis'],
    0.05, 0.7, 'clear', 'No statistically meaningful split detected.', []);
  const score = Math.min(1, cp.ratio);
  return finding('regime_change', 'behavioral_signals', ['data_analysis'],
    score, 0.72, verdictFromScore(score, true),
    `Changepoint at index ${cp.index}, variance-reduction ratio ${cp.ratio.toFixed(2)}.`,
    [`index=${cp.index}`, `reduction=${cp.ratio.toFixed(3)}`]);
}

// ── JURISDICTION / SANCTIONS ─────────────────────────────────────────────
async function jurisdictionCascadeApply(ctx: BrainContext): Promise<Finding> {
  const codes = jurisdictionsOfContext(ctx);
  const r = jurisdictionCascadeRisk(codes);
  if (r.chain.length === 0) return inconclusive('jurisdiction_cascade', 'compliance_framework', ['ratiocination'],
    'No jurisdictions supplied on subject or transactions.');
  return finding('jurisdiction_cascade', 'compliance_framework', ['ratiocination','intelligence'],
    r.compositeScore, 0.85, verdictFromScore(r.compositeScore, true),
    `Worst hop: ${r.worst.code} (${r.worst.name}) — ${r.worst.tiers.join(', ')}. Chain length ${r.chain.length}.`,
    r.chain.map((p) => `${p.code}=${p.tiers.join('|')}`));
}

async function fatfGreyApply(ctx: BrainContext): Promise<Finding> {
  const codes = jurisdictionsOfContext(ctx);
  const grey = codes.map((c) => jurisdictionProfile(c)).filter((p) => p.tiers.includes('fatf_grey') || p.tiers.includes('fatf_black'));
  if (grey.length === 0) return finding('fatf_grey_list_dynamics', 'compliance_framework', ['intelligence'],
    0, 0.8, codes.length === 0 ? 'inconclusive' : 'clear',
    codes.length === 0 ? 'No jurisdictions supplied.' : 'No FATF grey/black exposure in supplied jurisdictions.',
    [`as_of=${JURISDICTION_DATA_AS_OF}`]);
  const score = Math.max(...grey.map((p) => p.riskScore));
  return finding('fatf_grey_list_dynamics', 'compliance_framework', ['intelligence'],
    score, 0.85, verdictFromScore(score, true),
    `${grey.length} jurisdiction(s) on FATF grey/black list: ${grey.map((p) => p.code).join(', ')} (data as of ${JURISDICTION_DATA_AS_OF}).`,
    grey.map((p) => `${p.code}=${p.tiers.join('|')}`));
}

async function secrecyScoringApply(ctx: BrainContext): Promise<Finding> {
  const codes = jurisdictionsOfContext(ctx);
  const hops = codes.map((c) => jurisdictionProfile(c)).filter((p) => p.tiers.includes('secrecy_high') || p.tiers.includes('secrecy_moderate'));
  const score = Math.min(1, 0.2 * hops.length);
  return finding('secrecy_jurisdiction_scoring', 'compliance_framework', ['intelligence'],
    score, 0.8, verdictFromScore(score, hops.length > 0),
    `${hops.length} secrecy-jurisdiction hop(s): ${hops.map((p) => p.code).join(', ') || 'none'}.`,
    hops.map((p) => `${p.code}=${p.tiers.join('|')}`));
}

async function offshoreSecrecyIndexApply(ctx: BrainContext): Promise<Finding> {
  return secrecyScoringApply(ctx).then((f) => ({ ...f, modeId: 'offshore_secrecy_index' }));
}

async function jurisdictionRiskScoreApply(ctx: BrainContext): Promise<Finding> {
  if (!ctx.subject.jurisdiction) return inconclusive('jurisdiction_risk_score', 'compliance_framework', ['intelligence'],
    'No subject jurisdiction supplied.');
  const p = jurisdictionProfile(ctx.subject.jurisdiction);
  return finding('jurisdiction_risk_score', 'compliance_framework', ['intelligence'],
    p.riskScore, 0.9, verdictFromScore(p.riskScore, true),
    `${p.code} (${p.name}) → tiers: ${p.tiers.join(', ')}. ${p.notes.join('; ')}`,
    [`code=${p.code}`, `tiers=${p.tiers.join('|')}`]);
}

async function sanctionsArbitrageApply(ctx: BrainContext): Promise<Finding> {
  const codes = jurisdictionsOfContext(ctx);
  const tiers = codes.map((c) => jurisdictionProfile(c).tiers);
  const hasSanctioned = tiers.some((t) => t.includes('sanctioned_regime'));
  const hasSecrecy = tiers.some((t) => t.includes('secrecy_high'));
  const score = hasSanctioned && hasSecrecy ? 0.75 : hasSanctioned ? 0.45 : 0;
  return finding('sanctions_arbitrage', 'compliance_framework', ['intelligence'],
    score, 0.75, verdictFromScore(score, codes.length > 0),
    score > 0 ? 'Routing mixes a sanctioned regime with a secrecy-jurisdiction hop — arbitrage pattern.'
             : 'No sanctioned + secrecy co-occurrence in supplied scope.',
    [`codes=${codes.join(',') || 'none'}`]);
}

async function iranEvasionApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence).toLowerCase();
  const codes = jurisdictionsOfContext(ctx);
  const textual = /iran|irgc|ghost tanker|gold[- ]for[- ]oil|front bank|dandong|turk[ıi]ye bilgili/i.test(text);
  const jur = codes.includes('IR');
  const score = jur && textual ? 0.9 : jur ? 0.55 : textual ? 0.45 : 0;
  return finding('iran_evasion_pattern', 'compliance_framework', ['intelligence','smartness'],
    score, 0.75, verdictFromScore(score, score > 0),
    `Iran-evasion indicators: jurisdiction=${jur}, textual=${textual}.`,
    [`jurisdiction=${jur}`, `textual=${textual}`]);
}

async function dprkEvasionApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence).toLowerCase();
  const codes = jurisdictionsOfContext(ctx);
  const textual = /lazarus|dprk|north korea|axie bridge|ronin bridge|harmony bridge|sts coal|dandong|atomic mcrsot/i.test(text);
  const jur = codes.includes('KP');
  const score = jur && textual ? 0.95 : jur ? 0.7 : textual ? 0.55 : 0;
  return finding('dprk_evasion_pattern', 'compliance_framework', ['intelligence','smartness'],
    score, 0.8, verdictFromScore(score, score > 0),
    `DPRK-evasion indicators: jurisdiction=${jur}, textual=${textual}.`,
    [`jurisdiction=${jur}`, `textual=${textual}`]);
}

async function bviCookChainApply(ctx: BrainContext): Promise<Finding> {
  const codes = jurisdictionsOfContext(ctx);
  const chainHops = codes.filter((c) => ['VG','KY','BM','BS','CK','PA','SC','MH','JE','GG','IM'].includes(c));
  const score = Math.min(1, 0.25 * chainHops.length);
  return finding('bvi_cook_island_chain', 'sectoral_typology', ['intelligence'],
    score, 0.8, verdictFromScore(score, chainHops.length > 0),
    `${chainHops.length} classical secrecy-jurisdiction hop(s): ${chainHops.join(', ')}.`,
    chainHops.map((c) => `hop=${c}`));
}

async function freeportRiskApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  const hits = /\bfree[- ]?port|freeport storage|bonded warehouse|duty-free zone\b/i.test(text);
  return finding('freeport_risk', 'sectoral_typology', ['intelligence'],
    hits ? 0.5 : 0, 0.7, hits ? 'flag' : 'clear',
    hits ? 'Free-port / bonded-warehouse concealment vocabulary detected.'
         : 'No free-port concealment indicators.',
    [`match=${hits}`]);
}

// ── LINGUISTIC ────────────────────────────────────────────────────────────
async function stylometryApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('stylometry', 'forensic', ['intelligence'],
    'Insufficient free-text to stylometrise.');
  const r = analyseText(text);
  const score = r.deceptionScore;
  return finding('stylometry', 'forensic', ['intelligence'],
    score, 0.7, verdictFromScore(score, true),
    `Deception composite ${score.toFixed(2)} across ${r.words} words; flags: ${r.flags.join(' · ') || 'none'}.`,
    [`words=${r.words}`, `hedge=${r.hedgingCount}`, `passive=${r.passiveCount}`, `agentless=${r.agentlessCount}`]);
}

async function gaslightingApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('gaslighting_detection', 'forensic', ['intelligence','introspection'],
    'Insufficient text for gaslighting screen.');
  const r = gaslightingScore(text);
  const score = r.score;
  return finding('gaslighting_detection', 'forensic', ['intelligence','introspection'],
    score, 0.7, verdictFromScore(score, true),
    r.hits.length > 0 ? `Gaslighting cues: ${r.hits.slice(0,5).join('; ')}.` : 'No gaslighting patterns detected.',
    r.hits.slice(0, 5).map((h) => `phrase=${h}`));
}

async function obfuscationApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('obfuscation_pattern', 'forensic', ['intelligence','smartness'],
    'Insufficient text.');
  const r = analyseText(text);
  const score = r.obfuscationScore;
  return finding('obfuscation_pattern', 'forensic', ['intelligence','smartness'],
    score, 0.7, verdictFromScore(score, true),
    `Obfuscation composite ${score.toFixed(2)}; passive rate ${(r.passiveRate*100).toFixed(1)}%, ${r.agentlessCount} agentless constructions.`,
    [`passive_rate=${r.passiveRate.toFixed(3)}`, `agentless=${r.agentlessCount}`]);
}

async function codeWordApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 20) return inconclusive('code_word_detection', 'forensic', ['intelligence','smartness'],
    'Insufficient text.');
  const r = analyseText(text);
  const score = Math.min(1, r.codeWordsHit.length * 0.2);
  return finding('code_word_detection', 'forensic', ['intelligence','smartness'],
    score, 0.75, verdictFromScore(score, r.codeWordsHit.length > 0),
    r.codeWordsHit.length > 0 ? `Euphemism / code-word hits: ${r.codeWordsHit.join(', ')}.` : 'No euphemisms detected.',
    r.codeWordsHit.map((k) => `code=${k}`));
}

async function hedgingApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('hedging_language', 'forensic', ['intelligence','introspection'],
    'Insufficient text.');
  const r = analyseText(text);
  const score = Math.min(1, r.hedgingRate * 30);
  return finding('hedging_language', 'forensic', ['intelligence','introspection'],
    score, 0.7, verdictFromScore(score, true),
    `Hedging rate ${(r.hedgingRate*100).toFixed(2)}% (${r.hedgingCount} markers in ${r.words} words).`,
    [`rate=${r.hedgingRate.toFixed(4)}`, `count=${r.hedgingCount}`]);
}

async function minimisationApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('minimisation_pattern', 'forensic', ['intelligence'],
    'Insufficient text.');
  const r = analyseText(text);
  const score = Math.min(1, r.minimisingRate * 40);
  return finding('minimisation_pattern', 'forensic', ['intelligence'],
    score, 0.7, verdictFromScore(score, true),
    `Minimisation rate ${(r.minimisingRate*100).toFixed(2)}% (${r.minimisingCount} markers).`,
    [`rate=${r.minimisingRate.toFixed(4)}`, `count=${r.minimisingCount}`]);
}

async function linguisticForensicsApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 50) return inconclusive('linguistic_forensics', 'forensic', ['intelligence'],
    'Insufficient text.');
  const r = analyseText(text);
  const score = Math.max(r.deceptionScore, r.obfuscationScore);
  return finding('linguistic_forensics', 'forensic', ['intelligence'],
    score, 0.72, verdictFromScore(score, true),
    `Composite linguistic-forensics score ${score.toFixed(2)}; flags: ${r.flags.join(' · ') || 'none'}.`,
    r.flags.slice(0, 6));
}

async function narrativeCoherenceApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence);
  if (text.length < 80) return inconclusive('narrative_coherence', 'forensic', ['deep_thinking','intelligence'],
    'Insufficient narrative text.');
  const r = analyseText(text);
  // A low-deception, low-obfuscation, adequate-length narrative is coherent.
  const incoherence = Math.min(1, 0.6 * r.deceptionScore + 0.4 * r.obfuscationScore);
  return finding('narrative_coherence', 'forensic', ['deep_thinking','intelligence'],
    incoherence, 0.68, verdictFromScore(incoherence, true),
    incoherence > 0.4
      ? `Narrative shows ${r.flags.length} linguistic stress markers — coherence degraded.`
      : 'Narrative holds together under stylometric stress.',
    r.flags.slice(0, 4));
}

async function sentimentApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence).toLowerCase();
  if (text.length < 30) return inconclusive('sentiment_analysis', 'behavioral_signals', ['data_analysis','intelligence'],
    'Insufficient text.');
  const neg = (text.match(/\b(fraud|corrupt|bribe|illegal|alleged|investigat|arrested|charged|convicted|launder|terror|sanction)/g) ?? []).length;
  const pos = (text.match(/\b(award|honour|praised|recognised|philanthropy|charity|donation|accredited)/g) ?? []).length;
  const total = neg + pos;
  const negRatio = total === 0 ? 0 : neg / total;
  const score = negRatio * Math.min(1, neg / 3);
  return finding('sentiment_analysis', 'behavioral_signals', ['data_analysis','intelligence'],
    score, 0.6, verdictFromScore(score, total > 0),
    `Negative-risk terms ${neg}, neutral/positive ${pos} (neg ratio ${negRatio.toFixed(2)}).`,
    [`neg=${neg}`, `pos=${pos}`]);
}

// ── GRAPH ─────────────────────────────────────────────────────────────────
async function linkAnalysisApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 3) return inconclusive('link_analysis', 'forensic', ['intelligence','ratiocination'],
    'Graph too small for useful link analysis.');
  const deg = degree(g);
  const sorted = [...deg.entries()].sort((a, b) => b[1] - a[1]);
  const hub = sorted[0];
  const score = hub ? Math.min(1, hub[1] / 15) : 0;
  return finding('link_analysis', 'forensic', ['intelligence','ratiocination'],
    score, 0.72, verdictFromScore(score, true),
    hub ? `Hub node: ${hub[0]} (degree ${hub[1]}) across ${g.nodes.length}-node graph.` : 'No dominant hub.',
    sorted.slice(0, 5).map(([n, d]) => `${n}:${d}`));
}

async function evidenceGraphApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  const ubo = graphFromUBO(ctx.evidence.uboChain);
  const totalNodes = g.nodes.length + ubo.nodes.length;
  if (totalNodes < 2) return inconclusive('evidence_graph', 'forensic', ['intelligence','ratiocination'],
    'No evidence graph constructible.');
  const score = Math.min(1, totalNodes / 40);
  return finding('evidence_graph', 'forensic', ['intelligence','ratiocination'],
    score, 0.7, verdictFromScore(score, true),
    `Evidence graph: tx=${g.nodes.length} nodes, ubo=${ubo.nodes.length} nodes.`,
    [`tx_nodes=${g.nodes.length}`, `ubo_nodes=${ubo.nodes.length}`]);
}

async function centralityApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 4) return inconclusive('centrality', 'graph_analysis', ['data_analysis','intelligence'],
    'Graph too small for betweenness.');
  const bc = betweenness(g);
  const max = Math.max(...bc.values());
  const score = Math.min(1, max / (g.nodes.length * 2));
  const top = [...bc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return finding('centrality', 'graph_analysis', ['data_analysis','intelligence'],
    score, 0.72, verdictFromScore(score, true),
    `Top betweenness: ${top.map(([n, v]) => `${n}(${v.toFixed(1)})`).join(', ')}.`,
    top.map(([n, v]) => `${n}=${v.toFixed(2)}`));
}

async function communityDetectionApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 5) return inconclusive('community_detection', 'graph_analysis', ['data_analysis','intelligence'],
    'Graph too small for community detection.');
  const labels = communities(g);
  const uniq = new Set(labels.values()).size;
  const score = uniq >= 3 ? Math.min(1, uniq / g.nodes.length * 2) : 0.1;
  return finding('community_detection', 'graph_analysis', ['data_analysis','intelligence'],
    score, 0.7, verdictFromScore(score, true),
    `${uniq} communities across ${g.nodes.length} nodes.`,
    [`communities=${uniq}`, `nodes=${g.nodes.length}`]);
}

async function motifDetectionApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 3) return inconclusive('motif_detection', 'graph_analysis', ['data_analysis'],
    'Graph too small.');
  const gaps = triadicGaps(g);
  const score = Math.min(1, gaps / (g.nodes.length * 2));
  return finding('motif_detection', 'graph_analysis', ['data_analysis'],
    score, 0.68, verdictFromScore(score, true),
    `${gaps} triadic closure gaps detected.`,
    [`gaps=${gaps}`, `nodes=${g.nodes.length}`]);
}

async function shortestPathApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 2) return inconclusive('shortest_path', 'graph_analysis', ['data_analysis'],
    'Graph too small.');
  // Report average reachable hop from subject.
  const subject = 'SUBJECT';
  const hops = g.nodes
    .filter((n) => n !== subject)
    .map((n) => shortestPath(g, subject, n)?.length ?? Infinity)
    .filter((n) => Number.isFinite(n));
  const avg = hops.length === 0 ? 0 : hops.reduce((a, b) => a + b, 0) / hops.length;
  return finding('shortest_path', 'graph_analysis', ['data_analysis'],
    Math.min(1, avg / 10), 0.7, 'clear',
    `Average shortest-path from subject: ${avg.toFixed(1)} hops across ${hops.length} reachable nodes.`,
    [`avg_hops=${avg.toFixed(2)}`, `reachable=${hops.length}`]);
}

async function kCoreApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 4) return inconclusive('k_core_analysis', 'graph_analysis', ['data_analysis','intelligence'],
    'Graph too small.');
  const core = kCore(g, 2);
  const score = Math.min(1, core.length / g.nodes.length);
  return finding('k_core_analysis', 'graph_analysis', ['data_analysis','intelligence'],
    score, 0.7, verdictFromScore(score, true),
    `2-core size ${core.length}/${g.nodes.length}.`,
    core.slice(0, 6).map((n) => `core=${n}`));
}

async function bridgeDetectionApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 4) return inconclusive('bridge_detection', 'graph_analysis', ['data_analysis'],
    'Graph too small.');
  const br = bridges(g);
  const score = Math.min(1, br.length / 5);
  return finding('bridge_detection', 'graph_analysis', ['data_analysis'],
    score, 0.72, verdictFromScore(score, br.length > 0),
    `${br.length} bridge edges — choke points.`,
    br.slice(0, 5).map(([a, b]) => `${a}<->${b}`));
}

async function triadicClosureApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 3) return inconclusive('triadic_closure', 'graph_analysis', ['data_analysis'],
    'Graph too small.');
  const gaps = triadicGaps(g);
  const score = Math.min(1, gaps / 20);
  return finding('triadic_closure', 'graph_analysis', ['data_analysis'],
    score, 0.65, verdictFromScore(score, true),
    `${gaps} missing-third-edge triangles.`,
    [`gaps=${gaps}`]);
}

async function structuralHoleApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  if (g.nodes.length < 4) return inconclusive('structural_hole', 'graph_analysis', ['intelligence'],
    'Graph too small.');
  const bc = betweenness(g);
  const deg = degree(g);
  let best = { node: '', score: 0 };
  for (const n of g.nodes) {
    const d = deg.get(n) ?? 0;
    const b = bc.get(n) ?? 0;
    const s = d > 0 ? b / d : 0;
    if (s > best.score) best = { node: n, score: s };
  }
  return finding('structural_hole', 'graph_analysis', ['intelligence'],
    Math.min(1, best.score), 0.7, verdictFromScore(Math.min(1, best.score), best.score > 0),
    best.node ? `Broker candidate: ${best.node} (betweenness/degree = ${best.score.toFixed(2)}).`
             : 'No clear broker.',
    [`broker=${best.node}`, `score=${best.score.toFixed(2)}`]);
}

async function uboTreeWalkApply(ctx: BrainContext): Promise<Finding> {
  const ubo = graphFromUBO(ctx.evidence.uboChain);
  if (ubo.nodes.length < 2) return inconclusive('ubo_tree_walk', 'compliance_framework', ['ratiocination'],
    'No UBO chain supplied.');
  const cycle = hasCycle(ubo);
  const score = cycle ? 0.8 : Math.min(1, ubo.nodes.length / 15);
  return finding('ubo_tree_walk', 'compliance_framework', ['ratiocination'],
    score, 0.78, verdictFromScore(score, true),
    `UBO graph: ${ubo.nodes.length} nodes, cycle=${cycle}.`,
    [`nodes=${ubo.nodes.length}`, `cycle=${cycle}`]);
}

async function shellTriangulationApply(ctx: BrainContext): Promise<Finding> {
  const g = graphFromTransactions(ctx.evidence.transactions);
  const ubo = graphFromUBO(ctx.evidence.uboChain);
  const allNodes = new Set([...g.nodes, ...ubo.nodes]);
  const text = freeTextFromEvidence(ctx.evidence).toLowerCase();
  const shellHits = (text.match(/shell|letterbox|nominee|director services|registered agent/g) ?? []).length;
  const score = Math.min(1, 0.1 * allNodes.size + 0.1 * shellHits);
  return finding('shell_triangulation', 'forensic', ['intelligence','ratiocination'],
    score, 0.72, verdictFromScore(score, score > 0),
    `${allNodes.size} combined entities; shell-language hits: ${shellHits}.`,
    [`entities=${allNodes.size}`, `shell_hits=${shellHits}`]);
}

async function frontCompanyApply(ctx: BrainContext): Promise<Finding> {
  const text = freeTextFromEvidence(ctx.evidence).toLowerCase();
  const markers = [
    /registered agent/, /nominee director/, /virtual office/, /mail[- ]?forwarding/,
    /no employees/, /single shareholder/, /shelf company/, /back[- ]?dated/,
    /same address as multiple/, /thin web presence/,
  ];
  const hits = markers.filter((r) => r.test(text)).length;
  const score = Math.min(1, 0.15 * hits);
  return finding('front_company_fingerprint', 'sectoral_typology', ['intelligence','smartness'],
    score, 0.72, verdictFromScore(score, hits > 0),
    `${hits}/${markers.length} front-company markers detected.`,
    [`hits=${hits}`]);
}

// ── STATISTICAL / AGGREGATION ────────────────────────────────────────────
async function bayesTheoremApply(ctx: BrainContext): Promise<Finding> {
  if (ctx.priorFindings.length < 2) return inconclusive('bayes_theorem', 'statistical', ['data_analysis','inference'],
    'Need ≥2 prior findings to apply Bayesian update.');
  const prior = 0.2; // regulator baseline for suspicion
  const steps = ctx.priorFindings.slice(0, 8).map((f) => ({
    label: f.modeId,
    likelihoodRatio: f.verdict === 'block' ? 5 : f.verdict === 'escalate' ? 3 : f.verdict === 'flag' ? 2 : f.verdict === 'clear' ? 0.7 : 1,
  }));
  const r = bayesianCascade(prior, steps);
  return finding('bayes_theorem', 'statistical', ['data_analysis','inference'],
    r.posterior, 0.75, verdictFromScore(r.posterior, true),
    `Bayesian posterior P(H|E) = ${r.posterior.toFixed(3)} (prior ${prior}, BF ${r.bayesFactor.toFixed(2)}).`,
    [`prior=${prior}`, `posterior=${r.posterior.toFixed(3)}`, `bf=${r.bayesFactor.toFixed(2)}`]);
}

async function bayesianCascadeApply(ctx: BrainContext): Promise<Finding> {
  const f = await bayesTheoremApply(ctx);
  return { ...f, modeId: 'bayesian_update_cascade' };
}

async function chiSquareApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 30) return inconclusive('chi_square', 'statistical', ['data_analysis'],
    `Need ≥30; got ${amounts.length}.`);
  const obs = new Array<number>(10).fill(0);
  for (const a of amounts) {
    const d = Math.min(9, Math.max(0, Math.floor(Math.log10(a + 1))));
    obs[d] = (obs[d] ?? 0) + 1;
  }
  const exp = obs.map(() => amounts.length / 10);
  const { chi2, df } = chiSquareGoF(obs, exp);
  const p = chiSquarePValueDf1(chi2 / df);
  const score = p < 0.01 ? 0.7 : p < 0.05 ? 0.4 : 0.05;
  return finding('chi_square', 'statistical', ['data_analysis'],
    score, 0.78, verdictFromScore(score, true),
    `χ²(${df}) = ${chi2.toFixed(2)}, p ≈ ${p.toFixed(3)}.`,
    [`chi2=${chi2.toFixed(2)}`, `df=${df}`, `p=${p.toFixed(3)}`]);
}

async function klDivApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx.evidence.transactions);
  if (amounts.length < 20) return inconclusive('kl_divergence', 'statistical', ['data_analysis'],
    'Insufficient data.');
  const bins = new Array<number>(10).fill(0);
  for (const a of amounts) {
    const d = Math.min(9, Math.max(0, Math.floor(Math.log10(a + 1))));
    bins[d] = (bins[d] ?? 0) + 1;
  }
  const p = bins.map((x) => x / amounts.length);
  const q = p.map(() => 0.1);
  const kl = klDivergence(p, q);
  const score = Math.min(1, kl / 2);
  return finding('kl_divergence', 'statistical', ['data_analysis'],
    score, 0.75, verdictFromScore(score, true),
    `KL(empirical‖uniform) = ${kl.toFixed(3)} bits.`,
    [`kl=${kl.toFixed(3)}`]);
}

async function hypothesisTestApply(ctx: BrainContext): Promise<Finding> {
  const f = await chiSquareApply(ctx);
  return { ...f, modeId: 'hypothesis_test' };
}

async function dempsterShaferApply(ctx: BrainContext): Promise<Finding> {
  if (ctx.priorFindings.length < 2) return inconclusive('dempster_shafer', 'statistical', ['inference','deep_thinking'],
    'Need ≥2 findings for DS combination.');
  const masses = ctx.priorFindings.slice(0, 10).map((f) => {
    const support = f.verdict === 'block' ? 0.8 : f.verdict === 'escalate' ? 0.55 : f.verdict === 'flag' ? 0.35 : 0.05;
    const deny = f.verdict === 'clear' ? 0.6 : 0.1;
    const theta = Math.max(0.05, 1 - support - deny);
    const sum = support + deny + theta;
    return { h: support / sum, notH: deny / sum, theta: theta / sum };
  });
  const { fused, conflict } = dsCombineAll(masses);
  return finding('dempster_shafer', 'statistical', ['inference','deep_thinking'],
    fused.h, 0.72, verdictFromScore(fused.h, true),
    `DS fused belief m(H) = ${fused.h.toFixed(3)}, m(¬H) = ${fused.notH.toFixed(3)}, m(Θ) = ${fused.theta.toFixed(3)}, conflict K = ${conflict.toFixed(3)}.`,
    [`h=${fused.h.toFixed(3)}`, `not_h=${fused.notH.toFixed(3)}`, `theta=${fused.theta.toFixed(3)}`, `K=${conflict.toFixed(3)}`]);
}

async function multiSourceConsistencyApply(ctx: BrainContext): Promise<Finding> {
  const votes: Array<'yes' | 'no' | 'unknown'> = ctx.priorFindings.map((f) =>
    f.verdict === 'block' || f.verdict === 'escalate' || f.verdict === 'flag' ? 'yes'
    : f.verdict === 'clear' ? 'no' : 'unknown');
  if (votes.length < 3) return inconclusive('multi_source_consistency', 'statistical', ['data_analysis','reasoning'],
    'Need ≥3 findings.');
  const r = multiSourceConsistency(votes);
  const score = r.dominant === 'yes' ? r.agreement : 0.1;
  return finding('multi_source_consistency', 'statistical', ['data_analysis','reasoning'],
    score, 0.75, verdictFromScore(score, true),
    `Agreement ${r.agreement.toFixed(2)}, dominant "${r.dominant}" (yes=${r.yes}, no=${r.no}, unk=${r.unknown}).`,
    [`agreement=${r.agreement.toFixed(3)}`, `dominant=${r.dominant}`]);
}

async function counterEvidenceWeightingApply(ctx: BrainContext): Promise<Finding> {
  const support: number[] = [];
  const oppose: number[] = [];
  for (const f of ctx.priorFindings) {
    if (f.verdict === 'block' || f.verdict === 'escalate' || f.verdict === 'flag') support.push(f.score);
    else if (f.verdict === 'clear') oppose.push(Math.max(0.1, 1 - f.score));
  }
  if (support.length + oppose.length < 2) return inconclusive('counter_evidence_weighting', 'statistical', ['introspection','argumentation'],
    'Insufficient findings.');
  const r = counterEvidence({ supporting: support, opposing: oppose });
  return finding('counter_evidence_weighting', 'statistical', ['introspection','argumentation'],
    r.belief, r.confidence, verdictFromScore(r.belief, true),
    `Weighted belief ${r.belief.toFixed(3)} (supporting μ=${r.supportMean.toFixed(2)}, opposing μ=${r.opposeMean.toFixed(2)}, imbalance ${r.imbalance.toFixed(2)}).`,
    [`belief=${r.belief.toFixed(3)}`, `support=${support.length}`, `oppose=${oppose.length}`]);
}

// ── DATA QUALITY ──────────────────────────────────────────────────────────
async function freshnessCheckApply(ctx: BrainContext): Promise<Finding> {
  const ts = extractTimestamps(ctx.evidence.transactions);
  if (ts.length === 0) return inconclusive('freshness_check', 'data_quality', ['data_analysis'],
    'No dated records.');
  const maxTs = Math.max(...ts);
  const ageDays = (Date.now() - maxTs) / 86400_000;
  const score = ageDays > 365 ? 0.7 : ageDays > 180 ? 0.45 : ageDays > 30 ? 0.15 : 0;
  return finding('freshness_check', 'data_quality', ['data_analysis'],
    score, 0.85, verdictFromScore(score, true),
    `Newest record is ${ageDays.toFixed(0)} days old.`,
    [`age_days=${ageDays.toFixed(0)}`]);
}

async function sourceCredibilityApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const sources = new Set<string>();
  if (Array.isArray(ev.sanctionsHits) && ev.sanctionsHits.length > 0) sources.add('sanctions');
  if (Array.isArray(ev.pepHits) && ev.pepHits.length > 0) sources.add('pep');
  if (Array.isArray(ev.adverseMedia) && ev.adverseMedia.length > 0) sources.add('adverse_media');
  if (Array.isArray(ev.documents) && ev.documents.length > 0) sources.add('documents');
  const weightMap: Record<string, number> = { sanctions: 0.95, pep: 0.85, documents: 0.75, adverse_media: 0.6 };
  const weights = [...sources].map((s) => weightMap[s] ?? 0.4);
  const score = weights.length === 0 ? 0 : weights.reduce((a, b) => a + b, 0) / weights.length;
  return finding('source_credibility', 'data_quality', ['intelligence'],
    1 - score, 0.75, sources.size > 0 ? 'clear' : 'inconclusive',
    sources.size > 0 ? `Average source credibility ${score.toFixed(2)} across ${sources.size} source types.` : 'No sources supplied.',
    [...sources].map((s) => `source=${s}`));
}

async function reconciliationApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const aHits = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const bHits = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;
  const cHits = Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0;
  const total = aHits + bHits + cHits;
  if (total === 0) return inconclusive('reconciliation', 'data_quality', ['ratiocination'],
    'No sources to reconcile.');
  // Spread: how balanced are the sources?
  const parts = [aHits, bHits, cHits];
  const maxS = Math.max(...parts);
  const spread = maxS === 0 ? 0 : 1 - maxS / total;
  return finding('reconciliation', 'data_quality', ['ratiocination'],
    spread < 0.1 ? 0.3 : 0.1, 0.7, 'clear',
    `Source spread ${spread.toFixed(2)}: sanctions=${aHits}, pep=${bHits}, adverse=${cHits}.`,
    [`spread=${spread.toFixed(2)}`]);
}

async function dataQualityScoreApply(ctx: BrainContext): Promise<Finding> {
  const s = ctx.subject;
  const required: Array<[string, boolean]> = [
    ['name', !!s.name], ['type', !!s.type], ['jurisdiction', !!s.jurisdiction],
    ['identifier', !!(s.identifiers && Object.keys(s.identifiers).length > 0)],
    ['dob_or_doi', !!(s.dateOfBirth || s.dateOfIncorporation)],
  ];
  const present = required.filter(([, ok]) => ok).length;
  const ratio = present / required.length;
  return finding('data_quality_score', 'data_quality', ['data_analysis'],
    1 - ratio, 0.9, ratio >= 0.8 ? 'clear' : ratio >= 0.5 ? 'flag' : 'escalate',
    `Composite data-quality score ${(ratio * 100).toFixed(0)}%.`,
    required.map(([k, v]) => `${k}=${v ? 'present' : 'missing'}`));
}

// ── PEP + ADVERSE MEDIA (new wave-4 modes) ───────────────────────────────
async function pepScreeningApply(ctx: BrainContext): Promise<Finding> {
  const text = `${ctx.subject.name}\n${freeTextFromEvidence(ctx.evidence)}`;
  const pep = assessPEP(text, ctx.subject.name);
  if (!pep.isLikelyPEP) {
    return finding('pep_screening', 'compliance_framework', ['intelligence','ratiocination'],
      0, 0.7, 'clear', 'No PEP role patterns matched.', []);
  }
  return finding('pep_screening', 'compliance_framework', ['intelligence','ratiocination'],
    pep.riskScore, 0.82, verdictFromScore(pep.riskScore, true),
    `PEP tier: ${pep.highestTier}. Matched ${pep.matchedRoles.length} role(s).`,
    pep.matchedRoles.slice(0, 4).map((r) => `${r.tier}:${r.label}`));
}

async function adverseMediaScoringApply(ctx: BrainContext): Promise<Finding> {
  const free = (ctx.evidence.freeText as string | undefined) ?? freeTextFromEvidence(ctx.evidence);
  const r = scoreAdverseMedia(free, ctx.evidence.adverseMedia);
  if (r.total === 0) {
    return finding('adverse_media_scoring', 'compliance_framework', ['intelligence'],
      0, 0.7, free.length > 50 ? 'clear' : 'inconclusive',
      free.length > 50 ? 'No adverse-media keywords tripped in supplied text.' : 'Insufficient text.',
      []);
  }
  return finding('adverse_media_scoring', 'compliance_framework', ['intelligence'],
    r.compositeScore, 0.78, verdictFromScore(r.compositeScore, true),
    `${r.total} adverse-media hits across ${r.categoriesTripped.length} categor${r.categoriesTripped.length === 1 ? 'y' : 'ies'}: ${r.categoriesTripped.join(', ')}.`,
    r.topKeywords.slice(0, 6).map((k) => `${k.categoryId}:${k.keyword}×${k.count}`));
}

// ── CRYPTO ─────────────────────────────────────────────────────────────────
async function taintPropagationApply(ctx: BrainContext): Promise<Finding> {
  const r = analyseCryptoEvidence(ctx.evidence);
  if (r.inferredMixerHops < 0 && r.directMixerHits.length === 0) {
    return inconclusive('taint_propagation', 'crypto_defi', ['inference'],
      'No on-chain graph data to propagate taint through.');
  }
  const distance = r.inferredMixerHops < 0 ? 6 : r.inferredMixerHops;
  const score = r.directMixerHits.length > 0 ? 0.95 : Math.max(0, 1 - distance / 6);
  return finding('taint_propagation', 'crypto_defi', ['inference'],
    score, 0.8, verdictFromScore(score, true),
    `Mixer distance ${distance === 999 ? '∞' : distance} hops; direct mixer hits: ${r.directMixerHits.length}.`,
    [`hops=${distance}`, `direct=${r.directMixerHits.length}`]);
}

async function chainAnalysisApply(ctx: BrainContext): Promise<Finding> {
  const r = analyseCryptoEvidence(ctx.evidence);
  const score = Math.min(1,
    0.5 * (r.directMixerHits.length > 0 ? 1 : 0) +
    0.2 * Math.max(0, 1 - (r.inferredMixerHops < 0 ? 6 : r.inferredMixerHops) / 6) +
    0.15 * r.privacyPoolSymptomScore +
    0.15 * r.peelChainIndicator,
  );
  return finding('chain_analysis', 'crypto_defi', ['data_analysis','inference'],
    score, 0.78, verdictFromScore(score, score > 0),
    `On-chain composite ${score.toFixed(2)}: direct mixers ${r.directMixerHits.length}, hops ${r.inferredMixerHops}, peel ${r.peelChainIndicator.toFixed(2)}.`,
    [`mixers=${r.directMixerHits.length}`, `seed=${KNOWN_MIXERS_SEED.size}`]);
}

async function tornadoProximityApply(ctx: BrainContext): Promise<Finding> {
  const r = analyseCryptoEvidence(ctx.evidence);
  const hops = r.inferredMixerHops;
  if (hops < 0 && r.directMixerHits.length === 0) {
    return inconclusive('tornado_cash_proximity', 'crypto_defi', ['inference'],
      'No wallet or transaction data supplied.');
  }
  const score = r.directMixerHits.length > 0 ? 1.0 : hops <= 1 ? 0.85 : hops <= 2 ? 0.55 : hops <= 4 ? 0.25 : 0.05;
  return finding('tornado_cash_proximity', 'crypto_defi', ['inference'],
    score, 0.82, verdictFromScore(score, true),
    `Tornado-mixer hop distance: ${r.directMixerHits.length > 0 ? 'direct' : hops}.`,
    [`hops=${hops}`, `direct=${r.directMixerHits.length}`]);
}

async function chainHoppingVelocityApply(ctx: BrainContext): Promise<Finding> {
  const r = analyseCryptoEvidence(ctx.evidence);
  const score = Math.min(1, r.chainHoppingVelocity / 5);
  return finding('chain_hopping_velocity', 'crypto_defi', ['data_analysis'],
    score, 0.7, verdictFromScore(score, r.chainHoppingVelocity > 0),
    `Cross-chain activity rate ${r.chainHoppingVelocity.toFixed(2)} tx/hour.`,
    [`rate=${r.chainHoppingVelocity.toFixed(2)}`]);
}

async function privacyPoolApply(ctx: BrainContext): Promise<Finding> {
  const r = analyseCryptoEvidence(ctx.evidence);
  const score = r.privacyPoolSymptomScore;
  return finding('privacy_pool_exposure', 'crypto_defi', ['inference'],
    score, 0.7, verdictFromScore(score, score > 0),
    `Privacy-pool symptom density ${score.toFixed(2)} across supplied tx corpus.`,
    [`density=${score.toFixed(3)}`]);
}

// ── WAVE-4 OVERRIDE REGISTRY ─────────────────────────────────────────────
function ovr(
  id: string, name: string, cat: ReasoningCategory, fac: FacultyId[], wave: 1 | 2 | 3,
  desc: string, apply: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode {
  return { id, name, category: cat, faculties: fac, wave, description: desc, apply };
}

export const WAVE4_OVERRIDES: ReasoningMode[] = [
  // Entity / matching
  ovr('entity_resolution', 'Entity Resolution', 'forensic', ['data_analysis'], 2, 'Name-matching + script normalisation against supplied candidate hits.', entityResolutionApply),
  ovr('list_walk', 'Sanctions List Walk', 'compliance_framework', ['ratiocination'], 1, 'Walk supplied sanctions candidates; summarise by source.', listWalkApply),
  ovr('typology_catalogue', 'Typology Catalogue Match', 'compliance_framework', ['intelligence'], 1, 'Regex fingerprint match over ML/TF/PF/fraud typology catalogue.', typologyCatalogueApply),
  ovr('sanctions_regime_matrix', 'Sanctions Regime Matrix', 'compliance_framework', ['intelligence'], 1, 'Exposure-check across supplied jurisdictions vs sanctioned regimes.', sanctionsRegimeMatrixApply),

  // Transaction patterns
  ovr('split_payment_detection', 'Split-Payment Detection', 'forensic', ['smartness'], 3, 'Structuring near-threshold band scan.', splitPaymentApply),
  ovr('round_trip_transaction', 'Round-Trip Transaction', 'forensic', ['smartness'], 3, 'In/out cycles per counterparty within balance tolerance.', roundTripApply),
  ovr('wash_trade', 'Wash Trade', 'forensic', ['smartness'], 2, 'Matched self-trade counterparty detection.', washTradeApply),
  ovr('peel_chain', 'Peel-Chain Pattern', 'crypto_defi', ['data_analysis'], 3, 'Concentrating-account tight-window peel scan.', peelChainApply),
  ovr('reciprocal_edge_pattern', 'Reciprocal-Edge Pattern', 'graph_analysis', ['data_analysis'], 3, 'Counterparties with both inflow and outflow.', reciprocalEdgeApply),
  ovr('journal_entry_anomaly', 'Journal-Entry Anomaly', 'forensic', ['data_analysis'], 3, 'Weekend / month-end posting concentration.', journalEntryApply),
  ovr('pattern_of_life', 'Pattern of Life', 'forensic', ['intelligence'], 2, 'Inter-arrival CoV regularity / bursty classification.', patternOfLifeApply),
  ovr('peer_group_anomaly', 'Peer-Group Anomaly', 'forensic', ['data_analysis'], 2, 'Z-score of aggregate vs synthetic peer cohort.', peerGroupAnomalyApply),
  ovr('spike_detection', 'Spike Detection', 'behavioral_signals', ['data_analysis','smartness'], 2, 'EMA residual z-score spike scan.', spikeDetectionApply),
  ovr('seasonality', 'Seasonality', 'behavioral_signals', ['data_analysis'], 2, 'Day-of-week chi-square uniformity test.', seasonalityApply),
  ovr('regime_change', 'Regime Change', 'behavioral_signals', ['data_analysis'], 2, 'Variance-reduction changepoint detection.', regimeChangeApply),

  // Jurisdiction / sanctions
  ovr('jurisdiction_cascade', 'Jurisdiction Cascade', 'compliance_framework', ['ratiocination','intelligence'], 1, 'Walk of declared jurisdiction chain with tier composite.', jurisdictionCascadeApply),
  ovr('fatf_grey_list_dynamics', 'FATF Grey-List Dynamics', 'compliance_framework', ['intelligence'], 3, 'Snapshot match against FATF grey + black lists.', fatfGreyApply),
  ovr('secrecy_jurisdiction_scoring', 'Secrecy-Jurisdiction Scoring', 'compliance_framework', ['intelligence'], 3, 'Secrecy-tier hop count on declared chain.', secrecyScoringApply),
  ovr('offshore_secrecy_index', 'Offshore Secrecy Index', 'compliance_framework', ['intelligence','data_analysis'], 3, 'FSI-style secrecy weighting across chain.', offshoreSecrecyIndexApply),
  ovr('sanctions_arbitrage', 'Sanctions Arbitrage', 'compliance_framework', ['intelligence'], 3, 'Sanctioned-regime + secrecy co-occurrence flag.', sanctionsArbitrageApply),
  ovr('iran_evasion_pattern', 'Iran-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 3, 'Iran evasion jurisdiction + keyword signature.', iranEvasionApply),
  ovr('dprk_evasion_pattern', 'DPRK-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 3, 'DPRK evasion jurisdiction + keyword signature.', dprkEvasionApply),
  ovr('bvi_cook_island_chain', 'BVI / Cook-Islands Chain', 'sectoral_typology', ['intelligence'], 3, 'Classical secrecy-jurisdiction hop scan.', bviCookChainApply),
  ovr('freeport_risk', 'Free-Port Risk', 'sectoral_typology', ['intelligence'], 3, 'Free-port / bonded-warehouse concealment cues.', freeportRiskApply),

  // Linguistic
  ovr('stylometry', 'Stylometry', 'forensic', ['intelligence'], 3, 'Deception composite (hedging, passive, distancing).', stylometryApply),
  ovr('gaslighting_detection', 'Gaslighting Detection', 'forensic', ['intelligence','introspection'], 3, 'Reality-denial phrase dictionary match.', gaslightingApply),
  ovr('obfuscation_pattern', 'Obfuscation Pattern', 'forensic', ['intelligence','smartness'], 3, 'Passive-voice and agentless-construction density.', obfuscationApply),
  ovr('code_word_detection', 'Code-Word Detection', 'forensic', ['intelligence','smartness'], 3, 'Euphemism / cant / ledger slang dictionary.', codeWordApply),
  ovr('hedging_language', 'Hedging Language', 'forensic', ['intelligence','introspection'], 3, 'Hedging-marker rate per thousand words.', hedgingApply),
  ovr('minimisation_pattern', 'Minimisation Pattern', 'forensic', ['intelligence'], 3, 'Severity-minimising modifier rate.', minimisationApply),
  ovr('linguistic_forensics', 'Linguistic Forensics', 'forensic', ['intelligence'], 2, 'Composite stylometry across all linguistic markers.', linguisticForensicsApply),
  ovr('narrative_coherence', 'Narrative Coherence', 'forensic', ['deep_thinking','intelligence'], 2, 'Coherence = inverse of composite deception + obfuscation.', narrativeCoherenceApply),
  ovr('sentiment_analysis', 'Sentiment Analysis', 'behavioral_signals', ['data_analysis','intelligence'], 2, 'Negative vs neutral risk-term ratio.', sentimentApply),

  // Graph
  ovr('link_analysis', 'Link Analysis', 'forensic', ['intelligence','ratiocination'], 1, 'Hub-node detection on counterparty graph.', linkAnalysisApply),
  ovr('evidence_graph', 'Evidence Graph', 'forensic', ['intelligence','ratiocination'], 1, 'Composite tx + UBO graph size / density.', evidenceGraphApply),
  ovr('centrality', 'Centrality', 'graph_analysis', ['data_analysis','intelligence'], 2, 'Brandes betweenness over counterparty graph.', centralityApply),
  ovr('community_detection', 'Community Detection', 'graph_analysis', ['data_analysis','intelligence'], 2, 'Label-propagation communities.', communityDetectionApply),
  ovr('motif_detection', 'Motif Detection', 'graph_analysis', ['data_analysis'], 2, 'Triadic-closure gap count.', motifDetectionApply),
  ovr('shortest_path', 'Shortest Path', 'graph_analysis', ['data_analysis'], 2, 'Mean BFS distance from subject to reachable nodes.', shortestPathApply),
  ovr('k_core_analysis', 'k-Core Analysis', 'graph_analysis', ['data_analysis','intelligence'], 3, '2-core size on counterparty graph.', kCoreApply),
  ovr('bridge_detection', 'Bridge Detection', 'graph_analysis', ['data_analysis'], 3, 'Tarjan bridge edges — choke points.', bridgeDetectionApply),
  ovr('triadic_closure', 'Triadic Closure', 'graph_analysis', ['data_analysis'], 3, 'Missing-third-edge triangle scan.', triadicClosureApply),
  ovr('structural_hole', 'Structural Hole', 'graph_analysis', ['intelligence'], 3, 'Betweenness-per-degree brokerage score.', structuralHoleApply),
  ovr('ubo_tree_walk', 'UBO Tree Walk', 'compliance_framework', ['ratiocination'], 1, 'UBO graph traversal + cycle check.', uboTreeWalkApply),
  ovr('shell_triangulation', 'Shell Triangulation', 'forensic', ['intelligence','ratiocination'], 3, 'Combined entity count + shell-language hits.', shellTriangulationApply),
  ovr('front_company_fingerprint', 'Front-Company Fingerprint', 'sectoral_typology', ['intelligence','smartness'], 3, 'Nominee / registered-agent / virtual-office marker density.', frontCompanyApply),

  // Statistical / aggregation
  ovr('bayes_theorem', "Bayes' Theorem", 'statistical', ['data_analysis','inference'], 2, 'Sequential Bayesian update over prior findings.', bayesTheoremApply),
  ovr('bayesian_update_cascade', 'Bayesian Update Cascade', 'statistical', ['inference','deep_thinking'], 3, 'Chained posterior across prior-finding likelihood ratios.', bayesianCascadeApply),
  ovr('chi_square', 'Chi-Square', 'statistical', ['data_analysis'], 2, 'Amount-magnitude distribution GoF χ² vs uniform.', chiSquareApply),
  ovr('kl_divergence', 'KL Divergence', 'statistical', ['data_analysis'], 2, 'KL(empirical‖uniform) over log-magnitude bins.', klDivApply),
  ovr('hypothesis_test', 'Hypothesis Test', 'statistical', ['data_analysis'], 2, 'Wraps chi-square with p-value reporting.', hypothesisTestApply),
  ovr('dempster_shafer', 'Dempster-Shafer Combination', 'statistical', ['inference','deep_thinking'], 3, 'DS fusion of prior-finding belief masses.', dempsterShaferApply),
  ovr('multi_source_consistency', 'Multi-Source Consistency', 'statistical', ['data_analysis','reasoning'], 3, 'Entropy-based agreement across verdicts.', multiSourceConsistencyApply),
  ovr('counter_evidence_weighting', 'Counter-Evidence Weighting', 'statistical', ['introspection','argumentation'], 3, 'Disconfirming-evidence-uplifted belief.', counterEvidenceWeightingApply),

  // Data quality
  ovr('freshness_check', 'Freshness Check', 'data_quality', ['data_analysis'], 2, 'Age of newest dated record.', freshnessCheckApply),
  ovr('source_credibility', 'Source Credibility', 'data_quality', ['intelligence'], 2, 'Weighted mean over source-type credibility.', sourceCredibilityApply),
  ovr('reconciliation', 'Reconciliation', 'data_quality', ['ratiocination'], 2, 'Source-spread balance.', reconciliationApply),
  ovr('data_quality_score', 'Data Quality Score', 'data_quality', ['data_analysis'], 2, 'Composite required-field presence ratio.', dataQualityScoreApply),

  // Crypto
  ovr('taint_propagation', 'Taint Propagation', 'crypto_defi', ['inference'], 2, 'Mixer-distance taint diffusion.', taintPropagationApply),
  ovr('chain_analysis', 'On-Chain Analysis', 'crypto_defi', ['data_analysis','inference'], 2, 'Composite on-chain risk.', chainAnalysisApply),
  ovr('tornado_cash_proximity', 'Tornado-Cash Proximity', 'crypto_defi', ['inference'], 3, 'Hop distance from designated mixers.', tornadoProximityApply),
  ovr('chain_hopping_velocity', 'Chain-Hopping Velocity', 'crypto_defi', ['data_analysis'], 3, 'Cross-chain tx/hour rate.', chainHoppingVelocityApply),
  ovr('privacy_pool_exposure', 'Privacy-Pool Exposure', 'crypto_defi', ['inference'], 3, 'Memo-density of privacy-pool keywords.', privacyPoolApply),
];

// New wave-4 modes (not in waves 1-3).
export const WAVE4_NEW: ReasoningMode[] = [
  {
    id: 'sanctions_cross_reference', name: 'Sanctions Cross-Reference',
    category: 'compliance_framework', faculties: ['ratiocination','intelligence'], wave: 3,
    description: 'Ratio of strong vs total sanctions-list candidates supplied.',
    apply: sanctionsCrossReferenceApply,
  },
  {
    id: 'pep_screening', name: 'PEP Screening',
    category: 'compliance_framework', faculties: ['intelligence','ratiocination'], wave: 3,
    description: 'Role-based PEP tier detection across subject + free text.',
    apply: pepScreeningApply,
  },
  {
    id: 'adverse_media_scoring', name: 'Adverse-Media Scoring',
    category: 'compliance_framework', faculties: ['intelligence'], wave: 3,
    description: 'Composite scoring of free-text adverse-media keyword hits across the 5-category taxonomy.',
    apply: adverseMediaScoringApply,
  },
  {
    id: 'structuring_detection', name: 'Structuring Detection',
    category: 'forensic', faculties: ['smartness','data_analysis'], wave: 3,
    description: 'Rate of amounts in the 90-99.9% pre-threshold band.',
    apply: structuringDetectionApply,
  },
  {
    id: 'smurfing_detection', name: 'Smurfing Detection',
    category: 'forensic', faculties: ['smartness','data_analysis'], wave: 3,
    description: 'Burst-window detection over sub-threshold amounts.',
    apply: smurfingDetectionApply,
  },
  {
    id: 'jurisdiction_risk_score', name: 'Jurisdiction Risk Score',
    category: 'compliance_framework', faculties: ['intelligence'], wave: 3,
    description: 'Single-jurisdiction composite tier + note panel.',
    apply: jurisdictionRiskScoreApply,
  },
];

// Unused helpers kept for symmetry with wave-3 file style.
export const _WAVE4_INTERNAL_UNUSED = {
  mean, stdev,
};
