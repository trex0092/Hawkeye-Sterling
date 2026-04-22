// Hawkeye Sterling — compliance reasoning modes (Phase 7 real implementations).
//
// Eight MLRO-critical modes promoted from stubs to real algorithms:
//   - list_walk                    — walks a provided list of designations for the subject
//   - ubo_tree_walk                — flags opaque UBO chains + nominee + bearer
//   - sanctions_regime_matrix      — scores cross-regime exposure (UN/OFAC/EU/UK/EOCN)
//   - cash_courier_ctn             — detects cash-couriered threshold evasion
//   - velocity_analysis            — transaction velocity anomaly
//   - jurisdiction_cascade         — country-chain risk propagation
//   - kpi_dpms_thirty              — DPMS 30-KPI dashboard summary
//   - four_eyes_stress             — tests whether four-eyes would have caught the control lapse
//
// Each consumes ctx.evidence[] structured entries per mode and produces a
// Finding with an evidence-grounded rationale, a score ∈ [0,1], and a
// confidence ∈ [0,1]. No legal conclusions (charter P3). No fabricated
// claims (P2).

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function mkFinding(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  evidence: string[] = [],
): Finding {
  return {
    modeId,
    category,
    faculties,
    score: clamp01(score),
    confidence: clamp01(confidence),
    verdict,
    rationale,
    evidence,
    producedAt: Date.now(),
  };
}

// Typed narrow views over ctx.evidence — callers attach these on the case.
interface ListHit { listId: string; matchStrength: 'exact' | 'strong' | 'possible' | 'weak'; sourceRef: string; asOf: string; }
interface UboEdge { from: string; to: string; sharePercent?: number; nominee?: boolean; bearerShares?: boolean; }
interface UboParty { id: string; kind: 'person' | 'entity'; name?: string; }
interface CashTxn { id: string; amountAed: number; channel: 'cash'|'courier'|'wire'|'card'|'crypto'|'cheque'|'other'; at: string; }
interface JurisdictionHop { iso2: string; role: 'origin'|'intermediary'|'destination'|'counterparty'; riskTier?: 'low'|'medium'|'high'|'very_high'; }
interface KpiObservation { id: string; observed: number | boolean | string; target: number | boolean | string; status: 'green'|'amber'|'red'|'unknown'; }
interface ControlAction { step: string; actor: string; approverA?: string; approverB?: string; at: string; }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

// ────────────────────────────────────────────────────────────────
// list_walk — walks provided list-hits against the subject.
// ────────────────────────────────────────────────────────────────
const listWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const hits = typedEvidence<ListHit>(ctx, 'listHits');
  if (hits.length === 0) {
    return mkFinding('list_walk', 'compliance_framework', ['reasoning','data_analysis'],
      'inconclusive', 0, 0.2,
      'No authoritative list material supplied. Sanctions status cannot be asserted (charter P1).');
  }
  const strong = hits.filter((h) => h.matchStrength === 'exact' || h.matchStrength === 'strong');
  const partial = hits.filter((h) => h.matchStrength === 'possible');
  const weak = hits.filter((h) => h.matchStrength === 'weak');
  const score = clamp01(strong.length * 0.5 + partial.length * 0.25 + weak.length * 0.1);
  const verdict: Verdict = strong.length > 0 ? 'escalate' : partial.length > 0 ? 'flag' : weak.length > 0 ? 'flag' : 'clear';
  const rationale = strong.length > 0
    ? `Walked ${hits.length} list entries: ${strong.length} exact/strong match(es) against ${strong.map((h) => h.listId).join(', ')}.`
    : partial.length > 0
      ? `Walked ${hits.length} list entries: ${partial.length} partial match(es) pending disambiguation (charter P6).`
      : `Walked ${hits.length} list entries: no strong matches; ${weak.length} weak match(es) recorded.`;
  const confidence = strong.length > 0 ? 0.85 : partial.length > 0 ? 0.6 : 0.4;
  return mkFinding('list_walk', 'compliance_framework', ['reasoning','data_analysis'],
    verdict, score, confidence, rationale, hits.map((h) => h.sourceRef));
};

// ────────────────────────────────────────────────────────────────
// ubo_tree_walk — flags opacity (nominee, bearer, >N layers, unknown-upward).
// ────────────────────────────────────────────────────────────────
const uboTreeWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const parties = typedEvidence<UboParty>(ctx, 'uboParties');
  const edges = typedEvidence<UboEdge>(ctx, 'uboEdges');
  if (parties.length === 0 || edges.length === 0) {
    return mkFinding('ubo_tree_walk', 'compliance_framework', ['data_analysis','deep_thinking'],
      'inconclusive', 0, 0.25,
      'No ownership graph supplied. UBO traversal requires uboParties + uboEdges on the evidence bag.');
  }
  const byTo: Record<string, UboEdge[]> = {};
  for (const e of edges) (byTo[e.to] ||= []).push(e);
  const nomineeEdges = edges.filter((e) => e.nominee === true).length;
  const bearerEdges = edges.filter((e) => e.bearerShares === true).length;
  // Count hops upward from each entity until a natural person is reached or unresolved.
  let maxDepth = 0;
  let unresolved = 0;
  for (const p of parties.filter((p) => p.kind === 'entity')) {
    const seen = new Set<string>([p.id]);
    const stack: Array<{ id: string; depth: number }> = [{ id: p.id, depth: 0 }];
    let reachedPerson = false;
    while (stack.length) {
      const { id, depth } = stack.pop()!;
      maxDepth = Math.max(maxDepth, depth);
      const ups = byTo[id] ?? [];
      if (ups.length === 0) break;
      for (const up of ups) {
        if (seen.has(up.from)) continue;
        seen.add(up.from);
        const party = parties.find((x) => x.id === up.from);
        if (party?.kind === 'person') { reachedPerson = true; break; }
        stack.push({ id: up.from, depth: depth + 1 });
      }
      if (reachedPerson) break;
    }
    if (!reachedPerson) unresolved++;
  }
  const opacity = clamp01((nomineeEdges + bearerEdges) / Math.max(1, edges.length) * 0.6 + Math.min(1, maxDepth / 8) * 0.3 + (unresolved / Math.max(1, parties.length)) * 0.3);
  const verdict: Verdict = opacity > 0.5 ? 'escalate' : opacity > 0.25 ? 'flag' : 'clear';
  const rationale = [
    `UBO graph: ${parties.length} parties · ${edges.length} edges.`,
    `Nominee edges: ${nomineeEdges}; bearer-share edges: ${bearerEdges}; max upward depth: ${maxDepth}; unresolved entities: ${unresolved}.`,
    `Opacity score: ${opacity.toFixed(2)}.`,
  ].join(' ');
  return mkFinding('ubo_tree_walk', 'compliance_framework', ['data_analysis','deep_thinking'],
    verdict, opacity, 0.8, rationale);
};

// ────────────────────────────────────────────────────────────────
// sanctions_regime_matrix — cross-regime exposure summary.
// ────────────────────────────────────────────────────────────────
const sanctionsRegimeMatrixApply = async (ctx: BrainContext): Promise<Finding> => {
  const hits = typedEvidence<ListHit>(ctx, 'listHits');
  if (hits.length === 0) {
    return mkFinding('sanctions_regime_matrix', 'compliance_framework', ['reasoning'],
      'inconclusive', 0, 0.2, 'No list hits supplied — matrix cannot be computed.');
  }
  const byRegime: Record<string, ListHit[]> = {};
  for (const h of hits) (byRegime[h.listId] ||= []).push(h);
  const critical = ['un_1267','un_1988','uae_eocn','uae_local_terrorist'];
  const firedCritical = Object.keys(byRegime).filter((r) => critical.includes(r));
  const score = clamp01(firedCritical.length * 0.35 + (Object.keys(byRegime).length - firedCritical.length) * 0.15);
  const verdict: Verdict = firedCritical.length > 0 ? 'escalate' : score > 0.3 ? 'flag' : 'clear';
  const rationale = `Cross-regime matrix: ${Object.keys(byRegime).length} regimes fired (${firedCritical.length} critical: ${firedCritical.join(', ') || 'none'}).`;
  return mkFinding('sanctions_regime_matrix', 'compliance_framework', ['reasoning'],
    verdict, score, 0.8, rationale, hits.map((h) => h.sourceRef));
};

// ────────────────────────────────────────────────────────────────
// cash_courier_ctn — near-threshold cash or currency transport detection.
// ────────────────────────────────────────────────────────────────
const cashCourierApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = typedEvidence<CashTxn>(ctx, 'transactions');
  const cashOrCourier = txs.filter((t) => t.channel === 'cash' || t.channel === 'courier');
  const dpmsThreshold = 55_000;
  const ctnThreshold = 60_000;
  const nearBand = cashOrCourier.filter((t) => t.amountAed >= 0.85 * dpmsThreshold && t.amountAed < dpmsThreshold);
  const overCtn = cashOrCourier.filter((t) => t.amountAed >= ctnThreshold);
  if (cashOrCourier.length === 0) {
    return mkFinding('cash_courier_ctn', 'sectoral_typology', ['data_analysis'],
      'clear', 0, 0.5, 'No cash or courier transactions on file.');
  }
  const score = clamp01(nearBand.length * 0.15 + overCtn.length * 0.2);
  const verdict: Verdict = nearBand.length >= 3 ? 'flag' : overCtn.length > 0 ? 'flag' : 'clear';
  const rationale = [
    `Cash/courier transactions: ${cashOrCourier.length}.`,
    `Near-threshold band (≥AED ${Math.round(0.85 * dpmsThreshold / 1000)}k and <${dpmsThreshold / 1000}k): ${nearBand.length}.`,
    `Over CTN threshold (≥AED ${ctnThreshold / 1000}k): ${overCtn.length}.`,
  ].join(' ');
  return mkFinding('cash_courier_ctn', 'sectoral_typology', ['data_analysis'],
    verdict, score, 0.75, rationale, cashOrCourier.map((t) => t.id));
};

// ────────────────────────────────────────────────────────────────
// velocity_analysis — detect spikes vs historical baseline.
// ────────────────────────────────────────────────────────────────
const velocityApply = async (ctx: BrainContext): Promise<Finding> => {
  const txs = typedEvidence<CashTxn>(ctx, 'transactions');
  if (txs.length < 3) {
    return mkFinding('velocity_analysis', 'behavioral_signals', ['data_analysis'],
      'inconclusive', 0, 0.3, 'Fewer than 3 transactions — velocity cannot be meaningfully assessed.');
  }
  // Sort chronologically and compute rolling-7-day count.
  const sorted = [...txs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const counts: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cutoff = Date.parse(sorted[i]!.at) - 7 * 86_400_000;
    let c = 0;
    for (let j = i; j >= 0 && Date.parse(sorted[j]!.at) >= cutoff; j--) c++;
    counts.push(c);
  }
  const maxWindow = Math.max(...counts);
  const meanEarly = counts.slice(0, Math.max(1, Math.floor(counts.length / 3))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(counts.length / 3));
  const ratio = meanEarly === 0 ? (maxWindow > 3 ? maxWindow : 1) : maxWindow / meanEarly;
  const score = clamp01((ratio - 1) * 0.2);
  const verdict: Verdict = ratio >= 2 ? 'flag' : 'clear';
  const rationale = `Rolling-7-day peak window: ${maxWindow} transactions vs early-period mean ${meanEarly.toFixed(1)} (ratio ${ratio.toFixed(2)}).`;
  return mkFinding('velocity_analysis', 'behavioral_signals', ['data_analysis'],
    verdict, score, 0.7, rationale, sorted.map((t) => t.id));
};

// ────────────────────────────────────────────────────────────────
// jurisdiction_cascade — aggregate risk across country-hops.
// ────────────────────────────────────────────────────────────────
const jurisdictionCascadeApply = async (ctx: BrainContext): Promise<Finding> => {
  const hops = typedEvidence<JurisdictionHop>(ctx, 'jurisdictions');
  if (hops.length === 0) {
    return mkFinding('jurisdiction_cascade', 'compliance_framework', ['reasoning'],
      'inconclusive', 0, 0.3, 'No jurisdictions supplied in the case context.');
  }
  const tierWeight = { low: 0.1, medium: 0.3, high: 0.7, very_high: 1 } as const;
  const totalWeight = hops.reduce((a, h) => a + (tierWeight[h.riskTier ?? 'medium']), 0);
  const score = clamp01(totalWeight / Math.max(1, hops.length));
  const verdict: Verdict = score > 0.7 ? 'escalate' : score > 0.4 ? 'flag' : 'clear';
  const rationale = `${hops.length} jurisdiction-hop(s). Weighted tier score: ${score.toFixed(2)}.`;
  return mkFinding('jurisdiction_cascade', 'compliance_framework', ['reasoning'],
    verdict, score, 0.75, rationale, hops.map((h) => h.iso2));
};

// ────────────────────────────────────────────────────────────────
// kpi_dpms_thirty — summarise the 30 DPMS KPIs into a single RAG tally.
// ────────────────────────────────────────────────────────────────
const kpiDpmsThirtyApply = async (ctx: BrainContext): Promise<Finding> => {
  const kpis = typedEvidence<KpiObservation>(ctx, 'dpmsKpis');
  if (kpis.length === 0) {
    return mkFinding('kpi_dpms_thirty', 'governance', ['data_analysis'],
      'inconclusive', 0, 0.3, 'No DPMS KPI observations supplied.');
  }
  const red = kpis.filter((k) => k.status === 'red').length;
  const amber = kpis.filter((k) => k.status === 'amber').length;
  const green = kpis.filter((k) => k.status === 'green').length;
  const score = clamp01((red * 0.6 + amber * 0.2) / Math.max(1, kpis.length));
  const verdict: Verdict = red > 0 ? 'escalate' : amber > kpis.length / 3 ? 'flag' : 'clear';
  const rationale = `DPMS KPIs (${kpis.length} observed): ${green} green · ${amber} amber · ${red} red.`;
  return mkFinding('kpi_dpms_thirty', 'governance', ['data_analysis'],
    verdict, score, 0.7, rationale, kpis.map((k) => k.id));
};

// ────────────────────────────────────────────────────────────────
// four_eyes_stress — stress-test the separation-of-duties trail.
// ────────────────────────────────────────────────────────────────
const fourEyesStressApply = async (ctx: BrainContext): Promise<Finding> => {
  const actions = typedEvidence<ControlAction>(ctx, 'controlActions');
  if (actions.length === 0) {
    return mkFinding('four_eyes_stress', 'governance', ['introspection'],
      'inconclusive', 0, 0.3, 'No control actions on file.');
  }
  const violations = actions.filter((a) => {
    if (!a.approverA || !a.approverB) return true;
    if (a.actor === a.approverA) return true;
    if (a.actor === a.approverB) return true;
    if (a.approverA === a.approverB) return true;
    return false;
  });
  const score = clamp01(violations.length / Math.max(1, actions.length));
  const verdict: Verdict = violations.length > 0 ? 'escalate' : 'clear';
  const rationale = violations.length > 0
    ? `Four-eyes violations: ${violations.length}/${actions.length} actions failed separation-of-duties (CR 134/2025 Art.19).`
    : `All ${actions.length} control actions had independent dual approval.`;
  return mkFinding('four_eyes_stress', 'governance', ['introspection'],
    verdict, score, 0.9, rationale, violations.map((a) => a.step));
};

export const COMPLIANCE_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  list_walk: listWalkApply,
  ubo_tree_walk: uboTreeWalkApply,
  sanctions_regime_matrix: sanctionsRegimeMatrixApply,
  cash_courier_ctn: cashCourierApply,
  velocity_analysis: velocityApply,
  jurisdiction_cascade: jurisdictionCascadeApply,
  kpi_dpms_thirty: kpiDpmsThirtyApply,
  four_eyes_stress: fourEyesStressApply,
};
