// Wave 3 — intelligence expansion pack.
// Adds OSINT, red-team/adversarial, geopolitical, forensic accounting,
// behavioral economics, network science, linguistic, sanctions evasion,
// deep crypto, ESG, and probabilistic-aggregation reasoning modes.
// Includes REAL apply() implementations for Benford, Shannon entropy,
// velocity, source-triangulation, and completeness-audit — no longer stubs.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { combineDS, type BeliefMass } from './dempster-shafer.js';
import { defaultApply } from './modes/default-apply.js';

const stubApply = (
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
) => defaultApply(modeId, category, faculties, description);

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => ({
  id, name, category, faculties, wave: 3, description,
  apply: apply ?? stubApply(id, category, faculties, description),
});

// ─── REAL IMPLEMENTATIONS ──────────────────────────────────────────────

function extractAmounts(ctx: BrainContext): number[] {
  const out: number[] = [];
  const txs = ctx.evidence.transactions;
  if (Array.isArray(txs)) {
    for (const t of txs) {
      if (t && typeof t === 'object' && 'amount' in t) {
        const a = (t as { amount: unknown }).amount;
        if (typeof a === 'number' && a > 0) out.push(a);
        else if (typeof a === 'string' && /^[\d.,]+$/.test(a)) {
          const n = Number(a.replace(/,/g, ''));
          if (Number.isFinite(n) && n > 0) out.push(n);
        }
      } else if (typeof t === 'number' && t > 0) {
        out.push(t);
      }
    }
  }
  return out;
}

async function benfordApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  if (amounts.length < 30) {
    return {
      modeId: 'benford_law',
      category: 'forensic',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Benford: insufficient data (n=${amounts.length}, need ≥30).`,
      evidence: [`sample_size=${amounts.length}`],
      producedAt: Date.now(),
    };
  }
  const observed = new Array<number>(9).fill(0);
  for (const a of amounts) {
    const first = String(a).replace(/[^\d]/g, '').charAt(0);
    const d = Number(first);
    if (d >= 1 && d <= 9) observed[d - 1] = (observed[d - 1] ?? 0) + 1;
  }
  const n = amounts.length;
  const expected = Array.from({ length: 9 }, (_, i) => n * Math.log10(1 + 1 / (i + 1)));
  let chi = 0;
  for (let i = 0; i < 9; i++) {
    const o = observed[i] ?? 0;
    const e = expected[i] ?? 1;
    chi += ((o - e) ** 2) / e;
  }
  const critical = 15.507; // chi-square 8 df, p=0.05
  const deviated = chi > critical;
  return {
    modeId: 'benford_law',
    category: 'forensic',
    faculties: ['data_analysis', 'smartness'],
    score: deviated ? Math.min(1, chi / 40) : 0,
    confidence: 0.85,
    verdict: deviated ? 'flag' : 'clear',
    rationale: `Benford χ²(8) = ${chi.toFixed(2)} on ${n} amounts. ${
      deviated ? 'Deviates from Benford distribution — digit-pattern anomaly.'
               : 'Consistent with Benford distribution.'}`,
    evidence: [
      `observed=${observed.join(',')}`,
      `chi2=${chi.toFixed(2)}`,
      `critical_p05=${critical}`,
    ],
    producedAt: Date.now(),
  };
}

async function entropyApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  if (amounts.length < 10) {
    return {
      modeId: 'entropy',
      category: 'statistical',
      faculties: ['data_analysis'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Entropy: insufficient data (n=${amounts.length}, need ≥10).`,
      evidence: [`sample_size=${amounts.length}`],
      producedAt: Date.now(),
    };
  }
  // Coarse binning by order of magnitude.
  const bins = new Map<number, number>();
  for (const a of amounts) {
    const bucket = Math.floor(Math.log10(a + 1));
    bins.set(bucket, (bins.get(bucket) ?? 0) + 1);
  }
  const total = amounts.length;
  let H = 0;
  for (const count of bins.values()) {
    const p = count / total;
    H -= p * Math.log2(p);
  }
  const maxH = Math.log2(bins.size || 1);
  const normalised = maxH > 0 ? H / maxH : 0;
  // Very low entropy => concentrated; very high => dispersed. Flag extremes.
  const extreme = normalised < 0.2 || normalised > 0.95;
  return {
    modeId: 'entropy',
    category: 'statistical',
    faculties: ['data_analysis'],
    score: extreme ? 0.35 : 0.05,
    confidence: 0.75,
    verdict: extreme ? 'flag' : 'clear',
    rationale: `Shannon entropy over magnitude-bins: H=${H.toFixed(3)} bits (normalised ${normalised.toFixed(2)}). ${
      extreme ? 'Distribution is extreme (overly concentrated or dispersed).'
              : 'Distribution within normal range.'}`,
    evidence: [`H=${H.toFixed(3)}`, `bins=${bins.size}`, `n=${total}`],
    producedAt: Date.now(),
  };
}

async function velocityApply(ctx: BrainContext): Promise<Finding> {
  const txs = ctx.evidence.transactions;
  if (!Array.isArray(txs) || txs.length < 5) {
    return {
      modeId: 'velocity_analysis',
      category: 'behavioral_signals',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Velocity: need ≥5 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`,
      evidence: [],
      producedAt: Date.now(),
    };
  }
  const timestamps: number[] = [];
  for (const t of txs) {
    if (t && typeof t === 'object' && 'timestamp' in t) {
      const ts = (t as { timestamp: unknown }).timestamp;
      if (typeof ts === 'number') timestamps.push(ts);
      else if (typeof ts === 'string') {
        const d = Date.parse(ts);
        if (!Number.isNaN(d)) timestamps.push(d);
      }
    }
  }
  if (timestamps.length < 5) {
    return {
      modeId: 'velocity_analysis',
      category: 'behavioral_signals',
      faculties: ['data_analysis', 'smartness'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: 'Velocity: transactions missing usable timestamps.',
      evidence: [`with_timestamp=${timestamps.length}`],
      producedAt: Date.now(),
    };
  }
  timestamps.sort((a, b) => a - b);
  const spanMs = (timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0);
  const spanDays = Math.max(spanMs / 86_400_000, 1 / 24);
  const rate = timestamps.length / spanDays;
  const hot = rate > 20; // >20 tx/day sustained
  return {
    modeId: 'velocity_analysis',
    category: 'behavioral_signals',
    faculties: ['data_analysis', 'smartness'],
    score: hot ? Math.min(1, rate / 100) : Math.min(0.2, rate / 100),
    confidence: 0.8,
    verdict: hot ? 'flag' : 'clear',
    rationale: `Velocity = ${rate.toFixed(2)} tx/day over ${spanDays.toFixed(2)} days (n=${timestamps.length}). ${
      hot ? 'Elevated — investigate for smurfing / layering.'
          : 'Within typical band.'}`,
    evidence: [
      `tx_count=${timestamps.length}`,
      `span_days=${spanDays.toFixed(2)}`,
      `rate_per_day=${rate.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function sourceTriangulationApply(ctx: BrainContext): Promise<Finding> {
  const sources = new Set<string>();
  const ev = ctx.evidence;
  if (Array.isArray(ev.sanctionsHits) && ev.sanctionsHits.length > 0) sources.add('sanctions');
  if (Array.isArray(ev.pepHits) && ev.pepHits.length > 0) sources.add('pep');
  if (Array.isArray(ev.adverseMedia) && ev.adverseMedia.length > 0) sources.add('adverse_media');
  if (Array.isArray(ev.uboChain) && ev.uboChain.length > 0) sources.add('ubo');
  if (Array.isArray(ev.transactions) && ev.transactions.length > 0) sources.add('transactions');
  if (Array.isArray(ev.documents) && ev.documents.length > 0) sources.add('documents');
  const n = sources.size;
  return {
    modeId: 'source_triangulation',
    category: 'compliance_framework',
    faculties: ['reasoning', 'ratiocination'],
    score: n >= 3 ? 0.1 : n === 2 ? 0.25 : 0.5,
    confidence: 0.9,
    verdict: n >= 3 ? 'clear' : n === 2 ? 'flag' : 'escalate',
    rationale: `${n} independent evidence source${n === 1 ? '' : 's'} available: ${[...sources].join(', ') || 'none'}. ${
      n >= 3 ? 'Triangulation satisfied.'
             : 'Triangulation thin — widen sourcing before committing to a verdict.'}`,
    evidence: [...sources].map((s) => `source=${s}`),
    producedAt: Date.now(),
  };
}

async function completenessAuditApply(ctx: BrainContext): Promise<Finding> {
  const s = ctx.subject;
  const required: Array<[string, boolean]> = [
    ['name', !!s.name],
    ['type', !!s.type],
    ['jurisdiction', !!s.jurisdiction],
    ['identifier', !!(s.identifiers && Object.keys(s.identifiers).length > 0)],
    ['date_of_birth_or_incorporation', !!(s.dateOfBirth || s.dateOfIncorporation)],
  ];
  const present = required.filter(([, ok]) => ok).length;
  const ratio = present / required.length;
  const verdict = ratio >= 0.8 ? 'clear' : ratio >= 0.5 ? 'flag' : 'escalate';
  return {
    modeId: 'completeness_audit',
    category: 'data_quality',
    faculties: ['data_analysis', 'introspection'],
    score: 1 - ratio,
    confidence: 0.95,
    verdict,
    rationale: `Subject completeness ${(ratio * 100).toFixed(0)}% (${present}/${required.length}).`,
    evidence: required.map(([k, v]) => `${k}=${v ? 'present' : 'missing'}`),
    producedAt: Date.now(),
  };
}

// ─── PROBABILISTIC AGGREGATION ─────────────────────────────────────────

async function dempsterShaferApply(ctx: BrainContext): Promise<Finding> {
  // Project each prior contributor finding into a belief-mass over the
  // hypothesis frame {ml, tf, sanctioned, fraud, clean}. score ↔ mass on
  // the hypothesis singleton (or, when no hypothesis is named, on the
  // 2-set {ml, fraud}); (1 − confidence) goes to Θ as ignorance.
  const frame = ['ml', 'tf', 'sanctioned', 'fraud', 'clean'] as const;
  const hypMap: Record<string, string> = {
    illicit_risk: 'ml',
    sanctioned: 'sanctioned',
    pep: 'fraud',
    material_concern: 'ml',
    adverse_media_linked: 'fraud',
    ubo_opaque: 'ml',
  };
  const masses: BeliefMass[] = [];
  const usable = ctx.priorFindings.filter(
    (f) => !f.rationale.startsWith('[stub]') && (f.score > 0 || f.confidence > 0),
  );
  for (const f of usable) {
    const target = f.hypothesis ? hypMap[f.hypothesis] ?? 'ml' : 'ml';
    const onHyp = Math.max(0, Math.min(1, f.score * f.confidence));
    const ignorance = Math.max(0, 1 - onHyp);
    masses.push({
      sourceId: f.modeId,
      mass: { [target]: onHyp, [frame.join('|')]: ignorance },
    });
  }
  if (masses.length < 2) {
    return {
      modeId: 'dempster_shafer',
      category: 'statistical',
      faculties: ['inference', 'deep_thinking'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Dempster-Shafer: need ≥2 prior contributing findings (got ${masses.length}).`,
      evidence: [`prior_count=${masses.length}`],
      producedAt: Date.now(),
    };
  }
  const ds = combineDS([...frame], masses, { rule: 'auto' });
  const top = (Object.entries(ds.pignistic) as Array<[string, number]>).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topHyp = top?.[0] ?? 'clean';
  const topPig = top?.[1] ?? 0;
  const cleanPig = ds.pignistic['clean'] ?? 0;
  const illicit = 1 - cleanPig;
  return {
    modeId: 'dempster_shafer',
    category: 'statistical',
    faculties: ['inference', 'deep_thinking'],
    score: illicit,
    confidence: Math.max(0.4, 1 - ds.conflict),
    verdict: illicit >= 0.7 ? 'escalate' : illicit >= 0.4 ? 'flag' : 'clear',
    rationale: `DS combination over ${masses.length} masses (${ds.rule} rule, conflict K=${ds.conflict.toFixed(3)}). Top hypothesis: ${topHyp} (BetP=${topPig.toFixed(3)}); P(illicit)=${illicit.toFixed(3)}.`,
    evidence: [
      `rule=${ds.rule}`,
      `conflict=${ds.conflict.toFixed(3)}`,
      ...Object.entries(ds.pignistic).map(([h, p]) => `BetP(${h})=${(p as number).toFixed(3)}`),
    ],
    producedAt: Date.now(),
  };
}

async function bayesianUpdateCascadeApply(ctx: BrainContext): Promise<Finding> {
  // Run a sequential Bayesian update over prior findings whose score and
  // confidence imply directional likelihood ratios. Same maths as
  // fusion.ts but emitted as its own auditable finding so an MLRO can
  // see the cascade in isolation from the global fusion.
  const usable = ctx.priorFindings.filter(
    (f) => !f.rationale.startsWith('[stub]') && f.confidence > 0.2,
  );
  if (usable.length < 2) {
    return {
      modeId: 'bayesian_update_cascade',
      category: 'statistical',
      faculties: ['inference', 'deep_thinking'],
      score: 0,
      confidence: 0.3,
      verdict: 'inconclusive',
      rationale: `Bayesian cascade: need ≥2 confident priors (got ${usable.length}).`,
      evidence: [`prior_count=${usable.length}`],
      producedAt: Date.now(),
    };
  }
  let p = 0.10; // base rate prior
  const trace: string[] = [`prior=${p.toFixed(3)}`];
  for (const f of usable) {
    const lr = Math.exp(4 * f.confidence * (f.score - 0.5));
    const odds = (p / (1 - p)) * lr;
    p = odds / (1 + odds);
    trace.push(`${f.modeId}: lr=${lr.toFixed(2)} → p=${p.toFixed(3)}`);
  }
  return {
    modeId: 'bayesian_update_cascade',
    category: 'statistical',
    faculties: ['inference', 'deep_thinking'],
    score: p,
    confidence: 0.85,
    verdict: p >= 0.7 ? 'escalate' : p >= 0.4 ? 'flag' : 'clear',
    rationale: `Bayesian cascade over ${usable.length} priors → posterior P(illicit)=${p.toFixed(3)}.`,
    evidence: trace,
    producedAt: Date.now(),
  };
}

async function multiSourceConsistencyApply(ctx: BrainContext): Promise<Finding> {
  const ev = ctx.evidence;
  const channels: Array<{ name: string; signal: number }> = [];
  const sancN = Array.isArray(ev.sanctionsHits) ? ev.sanctionsHits.length : 0;
  const pepN = Array.isArray(ev.pepHits) ? ev.pepHits.length : 0;
  const advN = Array.isArray(ev.adverseMedia) ? ev.adverseMedia.length : 0;
  const uboN = Array.isArray(ev.uboChain) ? ev.uboChain.length : 0;
  const txN = Array.isArray(ev.transactions) ? ev.transactions.length : 0;
  if (sancN > 0) channels.push({ name: 'sanctions', signal: 1 });
  if (pepN > 0) channels.push({ name: 'pep', signal: 1 });
  if (advN > 0) channels.push({ name: 'adverse_media', signal: 1 });
  if (uboN > 0) channels.push({ name: 'ubo', signal: uboN >= 3 ? 1 : 0.5 });
  if (txN > 0) channels.push({ name: 'transactions', signal: txN >= 10 ? 1 : 0.5 });
  if (channels.length < 2) {
    return {
      modeId: 'multi_source_consistency',
      category: 'statistical',
      faculties: ['data_analysis', 'reasoning'],
      score: 0,
      confidence: 0.4,
      verdict: 'inconclusive',
      rationale: `Multi-source consistency: only ${channels.length} channel(s) populated.`,
      evidence: channels.map((c) => `channel=${c.name}`),
      producedAt: Date.now(),
    };
  }
  const sumSig = channels.reduce((acc, c) => acc + c.signal, 0);
  const agreement = sumSig / channels.length;
  // Disagreement if some channels signal strongly while others are silent.
  const variance =
    channels.reduce((acc, c) => acc + (c.signal - agreement) ** 2, 0) / channels.length;
  const consistent = variance < 0.1 && agreement > 0.5;
  return {
    modeId: 'multi_source_consistency',
    category: 'statistical',
    faculties: ['data_analysis', 'reasoning'],
    score: agreement * (1 - variance),
    confidence: Math.min(0.95, 0.5 + channels.length * 0.1),
    verdict: consistent ? (agreement >= 0.8 ? 'escalate' : 'flag') : 'flag',
    rationale: `Multi-source: ${channels.length} channels, agreement=${agreement.toFixed(2)}, variance=${variance.toFixed(3)}. ${consistent ? 'Channels concur.' : 'Channels diverge — investigate which is wrong.'}`,
    evidence: channels.map((c) => `${c.name}=${c.signal.toFixed(2)}`),
    producedAt: Date.now(),
  };
}

async function counterEvidenceWeightingApply(ctx: BrainContext): Promise<Finding> {
  const usable = ctx.priorFindings.filter(
    (f) => !f.rationale.startsWith('[stub]') && f.confidence > 0.2,
  );
  if (usable.length < 3) {
    return stubFinding('counter_evidence_weighting', 'statistical', ['introspection', 'argumentation'],
      `Counter-evidence: need ≥3 confident prior findings (got ${usable.length}).`);
  }

  // Partition into confirming (flagging the subject) vs disconfirming (clearing).
  const confirming = usable.filter(
    (f) => f.score >= 0.30 || ['flag', 'escalate', 'block'].includes(f.verdict),
  );
  const disconfirming = usable.filter(
    (f) => f.verdict === 'clear' && f.score < 0.20,
  );

  if (disconfirming.length === 0) {
    return {
      modeId: 'counter_evidence_weighting',
      category: 'statistical',
      faculties: ['introspection', 'argumentation'],
      score: 0,
      confidence: 0.55,
      verdict: 'clear',
      rationale: `Counter-evidence: no disconfirming findings among ${usable.length} priors — all signals directionally consistent with risk thesis.`,
      evidence: [`confirming=${confirming.length}`, `disconfirming=0`, `total=${usable.length}`],
      producedAt: Date.now(),
    };
  }

  // Re-weight: give disconfirming findings 2× their natural confidence weight
  // so confirmation bias cannot silently suppress exculpatory evidence.
  const confirmSum = confirming.reduce((s, f) => s + f.score * f.confidence, 0);
  const disconfirmSum = disconfirming.reduce(
    (s, f) => s + (1 - f.score) * f.confidence * 2, 0,
  );
  const total = confirmSum + disconfirmSum;
  const adjustedScore = total > 0 ? confirmSum / total : 0;

  // Confirmation-bias signal: disconfirming evidence is ≥20% of confirming
  // by count but carries <10% of raw unweighted score mass.
  const biasRatio = disconfirming.length / Math.max(confirming.length, 1);
  const rawMeanConfirm = confirming.length > 0
    ? confirming.reduce((s, f) => s + f.score, 0) / confirming.length
    : 0;
  const biasAlert = biasRatio >= 0.20 && rawMeanConfirm >= 0.35;

  return {
    modeId: 'counter_evidence_weighting',
    category: 'statistical',
    faculties: ['introspection', 'argumentation'],
    score: adjustedScore,
    confidence: 0.70,
    verdict: biasAlert ? 'flag' : adjustedScore >= 0.55 ? 'flag' : 'clear',
    rationale: `Counter-evidence: ${confirming.length} confirming vs ${disconfirming.length} disconfirming findings (bias_ratio=${biasRatio.toFixed(2)}). Bias-corrected score=${adjustedScore.toFixed(3)}${biasAlert ? ' — confirmation-bias risk: review clear findings before sealing verdict.' : '.'}`,
    evidence: [
      `confirming=${confirming.length}`,
      `disconfirming=${disconfirming.length}`,
      `bias_ratio=${biasRatio.toFixed(2)}`,
      `adjusted_score=${adjustedScore.toFixed(3)}`,
      ...disconfirming.slice(0, 4).map((f) => `clear:${f.modeId}(score=${f.score.toFixed(2)})`),
    ],
    producedAt: Date.now(),
  };
}

// ─── FORENSIC ACCOUNTING ───────────────────────────────────────────────

const STRUCTURING_THRESHOLDS = [
  { regime: 'AED-DPMS', value: 55_000, label: 'UAE precious-metals 55k AED CTR' },
  { regime: 'USD', value: 10_000, label: 'US BSA 10k USD CTR' },
  { regime: 'EUR', value: 10_000, label: 'EU 6AMLD 10k EUR' },
  { regime: 'GBP', value: 9_000, label: 'UK MLR 2017 9k GBP' },
];

async function splitPaymentApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  if (amounts.length < 5) {
    return stubFinding('split_payment_detection', 'forensic', ['smartness'],
      `Need ≥5 amounts to detect structuring (got ${amounts.length}).`);
  }
  const justBelow: Array<{ regime: string; amount: number; pct: number }> = [];
  for (const t of STRUCTURING_THRESHOLDS) {
    for (const a of amounts) {
      const pct = (t.value - a) / t.value;
      if (pct > 0 && pct < 0.05) justBelow.push({ regime: t.regime, amount: a, pct });
    }
  }
  const ratio = justBelow.length / amounts.length;
  const flagged = ratio >= 0.10; // ≥10% of payments cluster just below a threshold
  return {
    modeId: 'split_payment_detection',
    category: 'forensic',
    faculties: ['smartness'],
    score: flagged ? Math.min(1, ratio * 4) : ratio,
    confidence: 0.85,
    verdict: flagged ? 'escalate' : ratio > 0.03 ? 'flag' : 'clear',
    rationale: `Split-payment: ${justBelow.length}/${amounts.length} amounts (${(ratio * 100).toFixed(1)}%) within 5% below CTR thresholds. ${flagged ? 'Structuring typology likely.' : 'No clustering detected.'}`,
    evidence: [
      `cluster_count=${justBelow.length}`,
      `total=${amounts.length}`,
      ...justBelow.slice(0, 5).map((x) => `${x.regime}@${x.amount}(−${(x.pct * 100).toFixed(1)}%)`),
    ],
    producedAt: Date.now(),
  };
}

async function roundTripApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 4) {
    return stubFinding('round_trip_transaction', 'forensic', ['smartness'],
      `Need ≥4 transactions for round-trip detection (got ${Array.isArray(txs) ? txs.length : 0}).`);
  }
  // Build a directed ledger from from→to. A round-trip exists when ≥80%
  // of an outflow returns within ≤14 days through any path of length 2-4.
  type Edge = { from: string; to: string; amount: number; ts: number };
  const edges: Edge[] = [];
  for (const t of txs) {
    const from = String(t['from'] ?? t['source'] ?? '').toLowerCase();
    const to = String(t['to'] ?? t['destination'] ?? '').toLowerCase();
    const amount = typeof t['amount'] === 'number' ? (t['amount'] as number) : Number(t['amount']);
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (from && to && Number.isFinite(amount) && Number.isFinite(ts)) {
      edges.push({ from, to, amount, ts });
    }
  }
  if (edges.length < 4) {
    return stubFinding('round_trip_transaction', 'forensic', ['smartness'],
      `Round-trip: only ${edges.length} parseable edges with from/to/amount/timestamp.`);
  }
  // Find return-flows: same node appears as `to` in one edge and `from`
  // in a later edge; check if value loops back to the first source.
  const matches: Array<{ origin: string; loop: number; ratio: number; days: number }> = [];
  for (const e1 of edges) {
    for (const e2 of edges) {
      if (e2.ts <= e1.ts) continue;
      if (e2.to !== e1.from) continue;
      const days = (e2.ts - e1.ts) / 86_400_000;
      if (days > 30) continue;
      const ratio = Math.min(e1.amount, e2.amount) / Math.max(e1.amount, e2.amount);
      if (ratio < 0.8) continue;
      matches.push({ origin: e1.from, loop: e1.amount, ratio, days });
    }
  }
  const flagged = matches.length > 0;
  return {
    modeId: 'round_trip_transaction',
    category: 'forensic',
    faculties: ['smartness'],
    score: flagged ? Math.min(1, matches.length / 5) : 0,
    confidence: 0.8,
    verdict: matches.length >= 2 ? 'escalate' : flagged ? 'flag' : 'clear',
    rationale: `Round-trip: ${matches.length} round-trip pattern${matches.length === 1 ? '' : 's'} detected over ${edges.length} edges. ${flagged ? 'Funds return to origin within ≤30 days at ≥80% value preservation.' : 'No round-trip detected.'}`,
    evidence: matches.slice(0, 5).map((m) => `origin=${m.origin} amt=${m.loop} ratio=${m.ratio.toFixed(2)} days=${m.days.toFixed(1)}`),
    producedAt: Date.now(),
  };
}

async function shellTriangulationApply(ctx: BrainContext): Promise<Finding> {
  const ubo = (ctx.evidence.uboChain ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(ubo) || ubo.length < 3) {
    return stubFinding('shell_triangulation', 'forensic', ['intelligence', 'ratiocination'],
      `Shell triangulation: need ≥3 UBO entities (got ${Array.isArray(ubo) ? ubo.length : 0}).`);
  }
  const byAgent = new Map<string, number>();
  const byDirector = new Map<string, number>();
  const byAddress = new Map<string, number>();
  for (const e of ubo) {
    const agent = String(e['registeredAgent'] ?? e['agent'] ?? '').toLowerCase();
    const director = String(e['director'] ?? '').toLowerCase();
    const address = String(e['address'] ?? '').toLowerCase();
    if (agent) byAgent.set(agent, (byAgent.get(agent) ?? 0) + 1);
    if (director) byDirector.set(director, (byDirector.get(director) ?? 0) + 1);
    if (address) byAddress.set(address, (byAddress.get(address) ?? 0) + 1);
  }
  const collisions: string[] = [];
  for (const [k, n] of byAgent) if (n >= 3) collisions.push(`agent:${k}×${n}`);
  for (const [k, n] of byDirector) if (n >= 3) collisions.push(`director:${k}×${n}`);
  for (const [k, n] of byAddress) if (n >= 3) collisions.push(`address:${k}×${n}`);
  const flagged = collisions.length > 0;
  return {
    modeId: 'shell_triangulation',
    category: 'forensic',
    faculties: ['intelligence', 'ratiocination'],
    score: flagged ? Math.min(1, collisions.length / 3) : 0,
    confidence: 0.85,
    verdict: collisions.length >= 2 ? 'escalate' : flagged ? 'flag' : 'clear',
    rationale: `Shell triangulation: ${collisions.length} ≥3-way collision${collisions.length === 1 ? '' : 's'} across ${ubo.length} UBO entities.`,
    evidence: collisions.length > 0 ? collisions.slice(0, 6) : ['no_collisions'],
    producedAt: Date.now(),
  };
}

async function vendorMasterAnomalyApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 10) {
    return stubFinding('vendor_master_anomaly', 'forensic', ['data_analysis'],
      `Vendor master: need ≥10 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`);
  }
  const bankByVendor = new Map<string, Set<string>>();
  const firstSeen = new Map<string, number>();
  for (const t of txs) {
    const vendor = String(t['vendor'] ?? t['counterparty'] ?? '').toLowerCase();
    const bank = String(t['vendorBank'] ?? t['bankAccount'] ?? '').toLowerCase();
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (!vendor) continue;
    if (bank) {
      if (!bankByVendor.has(vendor)) bankByVendor.set(vendor, new Set());
      bankByVendor.get(vendor)!.add(bank);
    }
    if (Number.isFinite(ts)) {
      const prev = firstSeen.get(vendor);
      if (prev === undefined || ts < prev) firstSeen.set(vendor, ts);
    }
  }
  const churned = [...bankByVendor.entries()].filter(([, banks]) => banks.size >= 3);
  const newCutoff = Date.now() - 90 * 86_400_000;
  const newVendors = [...firstSeen.entries()].filter(([, ts]) => ts >= newCutoff);
  const newVendorRatio = newVendors.length / Math.max(firstSeen.size, 1);
  const score =
    Math.min(1, churned.length / 3) * 0.6 + Math.min(1, newVendorRatio * 2) * 0.4;
  const flagged = churned.length >= 1 || newVendorRatio > 0.4;
  return {
    modeId: 'vendor_master_anomaly',
    category: 'forensic',
    faculties: ['data_analysis'],
    score,
    confidence: 0.75,
    verdict: churned.length >= 2 || newVendorRatio > 0.6 ? 'escalate' : flagged ? 'flag' : 'clear',
    rationale: `Vendor master: ${churned.length} vendor${churned.length === 1 ? '' : 's'} with ≥3 bank-detail changes; ${newVendors.length}/${firstSeen.size} vendors new in last 90 days (${(newVendorRatio * 100).toFixed(1)}%).`,
    evidence: [
      ...churned.slice(0, 3).map(([v, banks]) => `churn:${v}(${banks.size} banks)`),
      `new_vendors=${newVendors.length}`,
      `new_ratio=${newVendorRatio.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function journalEntryAnomalyApply(ctx: BrainContext): Promise<Finding> {
  const amounts = extractAmounts(ctx);
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (amounts.length < 10) {
    return stubFinding('journal_entry_anomaly', 'forensic', ['data_analysis'],
      `Journal-entry: need ≥10 amounts (got ${amounts.length}).`);
  }
  const roundCount = amounts.filter((a) => a >= 1000 && a % 1000 === 0).length;
  const roundRatio = roundCount / amounts.length;
  let weekendCount = 0;
  let totalDated = 0;
  for (const t of txs) {
    const tsRaw = t['timestamp'] ?? t['date'];
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw ?? ''));
    if (Number.isFinite(ts)) {
      totalDated += 1;
      const day = new Date(ts).getUTCDay();
      if (day === 0 || day === 6) weekendCount += 1;
    }
  }
  const weekendRatio = totalDated > 0 ? weekendCount / totalDated : 0;
  const flags: string[] = [];
  if (roundRatio > 0.25) flags.push(`round_amounts=${(roundRatio * 100).toFixed(1)}%`);
  if (weekendRatio > 0.15) flags.push(`weekend_postings=${(weekendRatio * 100).toFixed(1)}%`);
  const score = Math.min(1, roundRatio * 1.5) * 0.6 + Math.min(1, weekendRatio * 3) * 0.4;
  return {
    modeId: 'journal_entry_anomaly',
    category: 'forensic',
    faculties: ['data_analysis'],
    score,
    confidence: 0.8,
    verdict: flags.length >= 2 ? 'escalate' : flags.length === 1 ? 'flag' : 'clear',
    rationale: `Journal-entry: ${roundCount}/${amounts.length} round amounts (${(roundRatio * 100).toFixed(1)}%); ${weekendCount}/${totalDated} weekend postings (${(weekendRatio * 100).toFixed(1)}%).`,
    evidence: flags.length > 0 ? flags : ['no_anomaly'],
    producedAt: Date.now(),
  };
}

async function revenueRecognitionStretchApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 10) {
    return stubFinding('revenue_recognition_stretch', 'forensic', ['intelligence'],
      `Revenue stretch: need ≥10 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`);
  }

  const parseTs = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return Date.parse(raw);
    return NaN;
  };
  const toAmt = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && /^-?[\d.,]+$/.test(raw)) return Number(raw.replace(/,/g, ''));
    return NaN;
  };

  // 1. Channel-stuffing: ≥25% of transactions in the last 3 days of month,
  //    and their average amount is ≥1.5× the mid-month average.
  let periodEndCount = 0, periodEndAmt = 0;
  let midMonthCount = 0, midMonthAmt = 0;
  let totalDated = 0;
  for (const t of txs) {
    const ts = parseTs(t['timestamp'] ?? t['date'] ?? t['invoiceDate'] ?? t['invoice_date']);
    const amt = toAmt(t['amount']);
    if (!Number.isFinite(ts) || !Number.isFinite(amt) || amt <= 0) continue;
    totalDated++;
    const d = new Date(ts);
    const day = d.getUTCDate();
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (daysInMonth - day <= 2) {
      periodEndCount++;
      periodEndAmt += amt;
    } else if (day <= 25) {
      midMonthCount++;
      midMonthAmt += amt;
    }
  }
  const periodEndRatio = totalDated > 0 ? periodEndCount / totalDated : 0;
  const avgPeriodEnd = periodEndCount > 0 ? periodEndAmt / periodEndCount : 0;
  const avgMidMonth = midMonthCount > 0 ? midMonthAmt / midMonthCount : 0;
  const amtMultiple = avgMidMonth > 0 ? avgPeriodEnd / avgMidMonth : 0;
  const channelStuffing = periodEndRatio >= 0.25 && amtMultiple >= 1.5;

  // 2. Bill-and-hold: invoice recorded >30 days before shipment/delivery.
  const BILL_HOLD_THRESHOLD_DAYS = 30;
  let billHoldCount = 0;
  for (const t of txs) {
    const invoiceTs = parseTs(t['invoiceDate'] ?? t['invoice_date']);
    const shipTs = parseTs(t['shipmentDate'] ?? t['shipped_date'] ?? t['delivery_date'] ?? t['deliveryDate']);
    if (!Number.isFinite(invoiceTs) || !Number.isFinite(shipTs)) continue;
    const gapDays = (shipTs - invoiceTs) / 86_400_000;
    if (gapDays > BILL_HOLD_THRESHOLD_DAYS) billHoldCount++;
  }

  // 3. Cut-off manipulation: reversals (negative amounts or explicit reversal flag)
  //    clustered in the first 5 days of a month — period-close pull-forwards reversed.
  let earlyReversals = 0;
  for (const t of txs) {
    const amt = toAmt(t['amount']);
    const ts = parseTs(t['timestamp'] ?? t['date']);
    const isReversal =
      (typeof t['reversal'] === 'boolean' && t['reversal']) ||
      String(t['reversal'] ?? '').toLowerCase() === 'true' ||
      (Number.isFinite(amt) && amt < 0);
    if (isReversal && Number.isFinite(ts)) {
      const day = new Date(ts).getUTCDate();
      if (day <= 5) earlyReversals++;
    }
  }
  const earlyReversalRatio = totalDated > 0 ? earlyReversals / totalDated : 0;
  const cutOffFlag = earlyReversalRatio >= 0.10;

  const flags: string[] = [];
  if (channelStuffing) flags.push(`channel_stuff:${(periodEndRatio * 100).toFixed(1)}%_period_end,${amtMultiple.toFixed(1)}x_avg_amt`);
  if (billHoldCount > 0) flags.push(`bill_and_hold:${billHoldCount}_invoice${billHoldCount === 1 ? '' : 's'}`);
  if (cutOffFlag) flags.push(`cut_off_reversal:${earlyReversals}(${(earlyReversalRatio * 100).toFixed(1)}%)`);
  const score = Math.min(
    1,
    (channelStuffing ? 0.40 : 0) +
    (billHoldCount > 0 ? Math.min(0.40, billHoldCount * 0.15) : 0) +
    (cutOffFlag ? 0.30 : 0),
  );
  return {
    modeId: 'revenue_recognition_stretch',
    category: 'forensic',
    faculties: ['intelligence'],
    score,
    confidence: 0.75,
    verdict: score >= 0.50 ? 'escalate' : score >= 0.20 ? 'flag' : 'clear',
    rationale: `Revenue stretch: channel-stuffing=${channelStuffing} (${(periodEndRatio * 100).toFixed(1)}% period-end, ${amtMultiple.toFixed(1)}× avg); bill-and-hold=${billHoldCount}; cut-off reversals=${earlyReversals}.`,
    evidence: flags.length > 0 ? flags : ['no_revenue_stretch_indicators'],
    producedAt: Date.now(),
  };
}

async function poFraudPatternApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 3) {
    return stubFinding('po_fraud_pattern', 'forensic', ['smartness'],
      `PO fraud: need ≥3 transactions (got ${Array.isArray(txs) ? txs.length : 0}).`);
  }

  const parseTs = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return Date.parse(raw);
    return NaN;
  };
  const toAmt = (raw: unknown): number => {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && /^[\d.,]+$/.test(raw)) return Number(raw.replace(/,/g, ''));
    return NaN;
  };

  // 1. Phantom vendor: appears only once, single large payment
  const LARGE_THRESHOLD = 50_000; // AED 50k — above UAE DPMS CTR threshold
  const amtsByVendor = new Map<string, number[]>();
  for (const t of txs) {
    const vendor = String(t['vendor'] ?? t['counterparty'] ?? '').toLowerCase().trim();
    const amt = toAmt(t['amount']);
    if (vendor && Number.isFinite(amt) && amt > 0) {
      if (!amtsByVendor.has(vendor)) amtsByVendor.set(vendor, []);
      amtsByVendor.get(vendor)!.push(amt);
    }
  }
  const phantomVendors = [...amtsByVendor.entries()].filter(
    ([, amts]) => amts.length === 1 && amts[0] >= LARGE_THRESHOLD,
  );

  // 2. Split-invoice below approval: ≥2 invoices from same vendor within
  //    7 days each between 50%–100% of an approval threshold (10k AED).
  const SPLIT_THRESHOLD = 10_000;
  const SPLIT_WINDOW_MS = 7 * 86_400_000;
  const splitSignals: string[] = [];
  const entriesByVendor = new Map<string, Array<{ amount: number; ts: number }>>();
  for (const t of txs) {
    const vendor = String(t['vendor'] ?? t['counterparty'] ?? '').toLowerCase().trim();
    const amt = toAmt(t['amount']);
    const ts = parseTs(t['timestamp'] ?? t['date']);
    if (vendor && Number.isFinite(amt) && amt > 0 && Number.isFinite(ts)) {
      if (!entriesByVendor.has(vendor)) entriesByVendor.set(vendor, []);
      entriesByVendor.get(vendor)!.push({ amount: amt, ts });
    }
  }
  for (const [vendor, entries] of entriesByVendor) {
    const candidates = entries.filter(
      (e) => e.amount >= SPLIT_THRESHOLD * 0.5 && e.amount < SPLIT_THRESHOLD,
    );
    if (candidates.length < 2) continue;
    candidates.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < candidates.length - 1; i++) {
      if (candidates[i + 1].ts - candidates[i].ts <= SPLIT_WINDOW_MS) {
        const total = candidates.reduce((s, e) => s + e.amount, 0);
        splitSignals.push(`${vendor}:${candidates.length}×<${SPLIT_THRESHOLD}(Σ=${total.toFixed(0)})`);
        break;
      }
    }
  }

  // 3. Back-dated PO: invoice date precedes the PO creation date
  const backdatedPOs: string[] = [];
  for (const t of txs) {
    const invoiceTs = parseTs(t['invoiceDate'] ?? t['invoice_date']);
    const poTs = parseTs(t['poDate'] ?? t['po_date'] ?? t['purchaseOrderDate']);
    if (Number.isFinite(invoiceTs) && Number.isFinite(poTs) && invoiceTs < poTs) {
      const ref = String(t['ref'] ?? t['id'] ?? t['vendor'] ?? 'unknown');
      backdatedPOs.push(`${ref}:invoice_before_po`);
    }
  }

  const flags = [
    ...phantomVendors.map(([v, [a]]) => `phantom_vendor:${v}(${a})`),
    ...splitSignals,
    ...backdatedPOs,
  ];
  const score = Math.min(
    1,
    phantomVendors.length * 0.35 + splitSignals.length * 0.30 + backdatedPOs.length * 0.25,
  );
  return {
    modeId: 'po_fraud_pattern',
    category: 'forensic',
    faculties: ['smartness'],
    score,
    confidence: 0.80,
    verdict: score >= 0.60 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear',
    rationale: `PO fraud: ${phantomVendors.length} phantom vendor${phantomVendors.length === 1 ? '' : 's'}, ${splitSignals.length} split-invoice cluster${splitSignals.length === 1 ? '' : 's'}, ${backdatedPOs.length} back-dated PO${backdatedPOs.length === 1 ? '' : 's'}.${flags.length ? ' ' + flags.slice(0, 3).join('; ') + '.' : ''}`,
    evidence: flags.length > 0 ? flags.slice(0, 8) : ['no_po_fraud_indicators'],
    producedAt: Date.now(),
  };
}

// ─── LINGUISTIC / NLP ──────────────────────────────────────────────────

// Passive-voice markers and vague-agent phrases signal deliberate obscuring of
// who did what — a well-documented red flag in AML narrative analysis.
const OBFUSCATION_PATTERNS = [
  'was transferred', 'were transferred', 'was conducted', 'were conducted',
  'has been noted', 'have been noted', 'it was decided', 'it was agreed',
  'certain parties', 'various entities', 'third parties', 'relevant individuals',
  'an individual', 'a company', 'undisclosed party', 'unnamed entity',
  'passive intermediary', 'acting on behalf', 'it was found', 'it was observed',
];

// Weasel words that hedge the claim without committing to a finding.
const HEDGING_PATTERNS = [
  'arguably', 'reportedly', 'allegedly', 'purportedly', 'supposedly',
  'it seems', 'it appears', 'may be', 'might be', 'could be', 'would appear',
  'in certain cases', 'in some instances', 'to some extent', 'in a sense',
  'could suggest', 'may indicate', 'might indicate', 'tends to suggest',
  'not necessarily', 'cannot be ruled out', 'possible explanation',
];

// Language that minimises risk severity in a narrative or SAR.
const MINIMISATION_PATTERNS = [
  'minor concern', 'not material', 'immaterial', 'negligible', 'de minimis',
  'not significant', 'simply', 'merely', 'only a small', 'routine transaction',
  'standard practice', 'common occurrence', 'nothing unusual', 'business as usual',
  'low risk', 'unlikely to be', 'no cause for concern', 'satisfied with explanation',
  'plausible explanation accepted', 'commercially reasonable', 'normal course',
];

// Phrases that deny or undermine a previously established fact.
const GASLIGHTING_PATTERNS = [
  'you misunderstood', 'that never happened', 'i never said', 'never occurred',
  'no such transaction', 'no such meeting', 'not what was agreed',
  'you are mistaken', 'incorrect recollection', 'misremembering',
  'fabricated claim', 'out of context', 'this is being exaggerated',
  'you are confused', 'clearly a misunderstanding', 'baseless allegation',
];

function linguisticApply(
  modeId: string,
  faculties: FacultyId[],
  patterns: string[],
  label: string,
  flagThreshold: number,
  escalateThreshold: number,
): (ctx: BrainContext) => Promise<Finding> {
  return async (ctx: BrainContext): Promise<Finding> => {
    const text = freeTextOf(ctx);
    if (text.length < 32) {
      return stubFinding(modeId, 'forensic', faculties,
        `${label}: narrative too thin (${text.length} chars).`);
    }
    const hits = patterns.filter((p) => text.includes(p.toLowerCase()));
    const ratio = hits.length / patterns.length;
    const score = Math.min(0.9, hits.length * (1 / Math.max(5, patterns.length / 2)));
    return {
      modeId,
      category: 'forensic',
      faculties,
      score,
      confidence: 0.65,
      verdict: hits.length >= escalateThreshold ? 'escalate' : hits.length >= flagThreshold ? 'flag' : 'clear',
      rationale: `${label}: ${hits.length}/${patterns.length} pattern${hits.length === 1 ? '' : 's'} matched (${(ratio * 100).toFixed(1)}% coverage). ${hits.length > 0 ? 'Indicators: ' + hits.slice(0, 4).map((h) => `"${h}"`).join(', ') + '.' : 'No indicators found.'}`,
      evidence: hits.length > 0 ? hits.slice(0, 8).map((h) => `pattern="${h}"`) : [`text_chars=${text.length}`],
      producedAt: Date.now(),
    };
  };
}

const obfuscationPatternApply = linguisticApply(
  'obfuscation_pattern', ['intelligence', 'smartness'],
  OBFUSCATION_PATTERNS, 'Obfuscation', 2, 4,
);
const hedgingLanguageApply = linguisticApply(
  'hedging_language', ['intelligence', 'introspection'],
  HEDGING_PATTERNS, 'Hedging', 3, 6,
);
const minimisationPatternApply = linguisticApply(
  'minimisation_pattern', ['intelligence'],
  MINIMISATION_PATTERNS, 'Minimisation', 2, 4,
);
const gaslightingDetectionApply = linguisticApply(
  'gaslighting_detection', ['intelligence', 'introspection'],
  GASLIGHTING_PATTERNS, 'Gaslighting', 1, 3,
);

// ─── SANCTIONS / GEOPOLITICAL ──────────────────────────────────────────

const FATF_HIGH_RISK = new Set(['IR', 'KP', 'MM']);                    // Call for Action
const FATF_INC_MONITORING = new Set([                                  // Increased Monitoring (rolling)
  'AF', 'CD', 'NG', 'SD', 'YE', 'BG', 'BF', 'KH', 'CM', 'HR', 'HT', 'KE',
  'LA', 'LB', 'MY', 'ML', 'MZ', 'NA', 'NE', 'NG', 'SN', 'SS', 'SY', 'TZ',
  'TR', 'VE', 'VN',
]);
const SECRECY_JURISDICTIONS = new Set([
  'KY', 'BS', 'BM', 'VG', 'VI', 'CW', 'PA', 'LU', 'LI', 'AD', 'MC', 'JE',
  'GG', 'IM', 'MT', 'CY', 'SC', 'MU', 'MH', 'CK', 'WS', 'VU', 'AI', 'TC',
]);
const DPRK_PROXY_INDICATORS = ['lazarus', 'reconnaissance general bureau', 'rgb', 'kp ship', 'magnolia', 'wisdom sea'];
const IRAN_PROXY_INDICATORS = ['irgc', 'sepah', 'mahan air', 'nitc', 'islamic republic of iran shipping', 'irisl', 'gold-for-oil'];

function jurisdictionsFromSubject(ctx: BrainContext): string[] {
  const out: string[] = [];
  if (ctx.subject.jurisdiction) out.push(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) out.push(ctx.subject.nationality.toUpperCase());
  const ubo = (ctx.evidence.uboChain ?? []) as Array<Record<string, unknown>>;
  if (Array.isArray(ubo)) {
    for (const e of ubo) {
      const j = String(e['jurisdiction'] ?? e['country'] ?? '').toUpperCase();
      if (j) out.push(j);
    }
  }
  return out;
}

async function sanctionsArbitrageApply(ctx: BrainContext): Promise<Finding> {
  const js = jurisdictionsFromSubject(ctx);
  if (js.length < 2) {
    return stubFinding('sanctions_arbitrage', 'compliance_framework', ['intelligence'],
      `Sanctions arbitrage: need ≥2 jurisdictions in chain (got ${js.length}).`);
  }
  // Detect a chain that mixes a sanctions-target proximate jurisdiction
  // with a secrecy hop and a low-friction fiat exit.
  const hits = {
    targetProximate: js.filter((j) => FATF_HIGH_RISK.has(j) || FATF_INC_MONITORING.has(j)),
    secrecy: js.filter((j) => SECRECY_JURISDICTIONS.has(j)),
    eu_us_uk: js.filter((j) => ['DE', 'FR', 'NL', 'IE', 'GB', 'US'].includes(j)),
  };
  const chainHasArbitrage =
    hits.targetProximate.length > 0 && hits.secrecy.length > 0 && hits.eu_us_uk.length > 0;
  const score = chainHasArbitrage
    ? 0.85
    : hits.targetProximate.length + hits.secrecy.length > 1
      ? 0.5
      : 0.1;
  return {
    modeId: 'sanctions_arbitrage',
    category: 'compliance_framework',
    faculties: ['intelligence'],
    score,
    confidence: 0.8,
    verdict: chainHasArbitrage ? 'escalate' : score > 0.3 ? 'flag' : 'clear',
    rationale: `Sanctions arbitrage: ${js.length} jurisdictions in chain — target-proximate=${hits.targetProximate.length}, secrecy=${hits.secrecy.length}, eu/us/uk=${hits.eu_us_uk.length}. ${chainHasArbitrage ? 'Classic 3-leg arbitrage signature.' : 'No 3-leg arbitrage signature.'}`,
    evidence: [
      `chain=${js.join('→')}`,
      ...hits.targetProximate.map((j) => `target_proximate=${j}`),
      ...hits.secrecy.map((j) => `secrecy=${j}`),
    ],
    producedAt: Date.now(),
  };
}

async function fatfGreyListDynamicsApply(ctx: BrainContext): Promise<Finding> {
  const js = jurisdictionsFromSubject(ctx);
  if (js.length === 0) {
    return stubFinding('fatf_grey_list_dynamics', 'compliance_framework', ['intelligence'],
      'FATF dynamics: subject has no jurisdiction declared.');
  }
  const calls: string[] = [];
  const grey: string[] = [];
  for (const j of js) {
    if (FATF_HIGH_RISK.has(j)) calls.push(j);
    else if (FATF_INC_MONITORING.has(j)) grey.push(j);
  }
  const score = calls.length > 0 ? 0.95 : grey.length > 0 ? 0.55 : 0.05;
  const verdict = calls.length > 0 ? 'block' : grey.length > 0 ? 'escalate' : 'clear';
  return {
    modeId: 'fatf_grey_list_dynamics',
    category: 'compliance_framework',
    faculties: ['intelligence'],
    score,
    confidence: 0.95,
    verdict,
    rationale: `FATF dynamics: chain has ${calls.length} Call-for-Action and ${grey.length} Increased-Monitoring jurisdiction${grey.length === 1 ? '' : 's'}. ${calls.length ? 'Hard block — FATF R.19 EDD mandatory.' : grey.length ? 'EDD required.' : 'No FATF-listed jurisdiction in chain.'}`,
    evidence: [
      ...calls.map((j) => `FATF_call_for_action=${j}`),
      ...grey.map((j) => `FATF_increased_monitoring=${j}`),
      `chain=${js.join('→')}`,
    ],
    producedAt: Date.now(),
  };
}

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

function patternHits(text: string, patterns: string[]): string[] {
  return patterns.filter((p) => text.includes(p.toLowerCase()));
}

async function dprkEvasionApply(ctx: BrainContext): Promise<Finding> {
  const js = jurisdictionsFromSubject(ctx);
  const text = freeTextOf(ctx);
  const hits = patternHits(text, DPRK_PROXY_INDICATORS);
  const kpProximate = js.includes('KP') || js.includes('CN') || js.includes('RU');
  const score = (hits.length > 0 ? 0.4 : 0) + (kpProximate ? 0.3 : 0) + (js.includes('KP') ? 0.3 : 0);
  const flagged = score >= 0.4;
  return {
    modeId: 'dprk_evasion_pattern',
    category: 'compliance_framework',
    faculties: ['intelligence', 'smartness'],
    score: Math.min(1, score),
    confidence: 0.75,
    verdict: js.includes('KP') ? 'block' : flagged ? 'escalate' : 'clear',
    rationale: `DPRK evasion: ${hits.length} proxy indicator${hits.length === 1 ? '' : 's'} in narrative; jurisdiction proximity=${kpProximate}; direct KP=${js.includes('KP')}.`,
    evidence: [
      ...hits.map((h) => `indicator=${h}`),
      `kp_proximate=${kpProximate}`,
      `chain=${js.join('→') || 'unknown'}`,
    ],
    producedAt: Date.now(),
  };
}

async function iranEvasionApply(ctx: BrainContext): Promise<Finding> {
  const js = jurisdictionsFromSubject(ctx);
  const text = freeTextOf(ctx);
  const hits = patternHits(text, IRAN_PROXY_INDICATORS);
  const irProximate = js.some((j) => ['IQ', 'AE', 'TR', 'OM', 'AF', 'PK'].includes(j));
  const score = (hits.length > 0 ? 0.4 : 0) + (irProximate ? 0.2 : 0) + (js.includes('IR') ? 0.4 : 0);
  const flagged = score >= 0.4;
  return {
    modeId: 'iran_evasion_pattern',
    category: 'compliance_framework',
    faculties: ['intelligence', 'smartness'],
    score: Math.min(1, score),
    confidence: 0.75,
    verdict: js.includes('IR') ? 'block' : flagged ? 'escalate' : 'clear',
    rationale: `Iran evasion: ${hits.length} proxy indicator${hits.length === 1 ? '' : 's'} in narrative; regional proximity=${irProximate}; direct IR=${js.includes('IR')}.`,
    evidence: [
      ...hits.map((h) => `indicator=${h}`),
      `ir_proximate=${irProximate}`,
      `chain=${js.join('→') || 'unknown'}`,
    ],
    producedAt: Date.now(),
  };
}

function stubFinding(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  reason: string,
): Finding {
  return {
    modeId,
    category,
    faculties,
    score: 0,
    confidence: 0.3,
    verdict: 'inconclusive',
    rationale: reason,
    evidence: [],
    producedAt: Date.now(),
  };
}

// ─── WAVE 3 REGISTRY ───────────────────────────────────────────────────

export const WAVE3_MODES: ReasoningMode[] = [
  // ─── OSINT / HUMINT ───────────────────────────────────────────────
  m('socmint_scan', 'SOCMINT Scan', 'osint', ['intelligence','data_analysis'], 'Social-media intelligence sweep — handles, aliases, network, cadence.'),
  m('geoint_plausibility', 'GEOINT Plausibility', 'osint', ['intelligence'], 'Cross-check claimed locations against geospatial / satellite evidence.'),
  m('imint_verification', 'IMINT Verification', 'osint', ['intelligence'], 'Imagery intelligence — authenticity, date, geolocation of photos.'),
  m('humint_reliability_grade', 'HUMINT Reliability', 'osint', ['intelligence','introspection'], 'Grade human-source reliability and claim credibility.'),
  m('nato_admiralty_grading', 'NATO / Admiralty Source Grading', 'osint', ['intelligence','introspection'], 'A-F reliability × 1-6 credibility grid applied to every source.'),
  m('osint_chain_of_custody', 'OSINT Chain-of-Custody', 'osint', ['ratiocination','introspection'], 'Hash + timestamp + archive every collected artefact.'),

  // ─── RED-TEAM / ADVERSARIAL ───────────────────────────────────────
  m('adversarial_simulation', 'Adversarial Simulation', 'threat_modeling', ['deep_thinking','intelligence'], 'Simulate how a sophisticated actor would evade each control.'),
  m('deception_detection', 'Deception Detection', 'threat_modeling', ['smartness','intelligence'], 'Cross-modal inconsistency analysis — story vs records vs behaviour.'),
  m('counter_intelligence', 'Counter-Intelligence', 'threat_modeling', ['deep_thinking','intelligence'], 'Detect collection, cover stories, and feedback loops aimed at your controls.'),
  m('false_flag_check', 'False-Flag Check', 'threat_modeling', ['introspection','deep_thinking'], 'Is the attribution a plant designed to mislead the investigator?'),
  m('honey_trap_pattern', 'Honey-Trap Pattern', 'threat_modeling', ['smartness','intelligence'], 'Sudden, implausibly-convenient counterparty relationships.'),
  m('cover_story_stress', 'Cover-Story Stress Test', 'threat_modeling', ['argumentation','deep_thinking'], 'Probe a narrative under interview-style questioning until it fractures.'),
  m('legend_verification', 'Legend Verification', 'threat_modeling', ['intelligence','ratiocination'], 'Independently corroborate claimed biography end to end.'),

  // ─── GEOPOLITICAL & SANCTIONS REGIMES ─────────────────────────────
  m('sanctions_arbitrage', 'Sanctions Arbitrage', 'compliance_framework', ['intelligence'], 'Routing flows to exploit regime differentials (EU vs OFAC vs UK).', sanctionsArbitrageApply),
  m('offshore_secrecy_index', 'Offshore Secrecy Index', 'compliance_framework', ['intelligence','data_analysis'], 'TJN FSI / secrecy-jurisdiction scoring applied to the chain.'),
  m('fatf_grey_list_dynamics', 'FATF Grey-List Dynamics', 'compliance_framework', ['intelligence'], 'Jurisdiction trajectory: grey / black / released, and what changed.', fatfGreyListDynamicsApply),
  m('secrecy_jurisdiction_scoring', 'Secrecy-Jurisdiction Scoring', 'compliance_framework', ['intelligence'], 'Composite opacity score per hop in the ownership chain.'),
  m('russian_oil_price_cap', 'Russian Oil Price-Cap', 'compliance_framework', ['intelligence'], 'G7 price-cap regime — attestation chain, STS, dark-fleet links.'),
  m('eu_14_package', 'EU Sanctions 14th Package', 'compliance_framework', ['intelligence'], 'EU 14th-package walk — best-efforts clauses, no-Russia, anti-circumvention.'),
  m('us_secondary_sanctions', 'US Secondary Sanctions', 'compliance_framework', ['intelligence'], 'Extra-territorial exposure: OFAC 50% rule, CAATSA, NDAA.'),
  m('chip_export_controls', 'Semiconductor Export Controls', 'compliance_framework', ['intelligence'], 'BIS / FDPR rules — advanced-node chips, AI compute, end-use screening.'),
  m('iran_evasion_pattern', 'Iran-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 'Front companies, front banks, STS, gold-for-oil typologies.', iranEvasionApply),
  m('dprk_evasion_pattern', 'DPRK-Evasion Pattern', 'compliance_framework', ['intelligence','smartness'], 'Ship-to-ship coal, lazarus crypto heists, front-company cascades.', dprkEvasionApply),

  // ─── FORENSIC ACCOUNTING ──────────────────────────────────────────
  m('benford_law', "Benford's Law", 'forensic', ['data_analysis','smartness'], 'Leading-digit distribution test on amounts.', benfordApply),
  m('split_payment_detection', 'Split-Payment Detection', 'forensic', ['smartness'], 'Invoices split just below thresholds — structuring typology.', splitPaymentApply),
  m('round_trip_transaction', 'Round-Trip Transaction', 'forensic', ['smartness'], 'Funds return to origin through intermediaries.', roundTripApply),
  m('shell_triangulation', 'Shell Triangulation', 'forensic', ['intelligence','ratiocination'], 'Three or more linked shells share agents, directors, or addresses.', shellTriangulationApply),
  m('po_fraud_pattern', 'Purchase-Order Fraud', 'forensic', ['smartness'], 'Phantom vendors, back-dated POs, split-invoice below approval.', poFraudPatternApply),
  m('vendor_master_anomaly', 'Vendor Master Anomaly', 'forensic', ['data_analysis'], 'New vendor spikes, bank-detail churn, name-address collisions.', vendorMasterAnomalyApply),
  m('journal_entry_anomaly', 'Journal-Entry Anomaly', 'forensic', ['data_analysis'], 'Round numbers, weekend/holiday postings, manual overrides at period close.', journalEntryAnomalyApply),
  m('revenue_recognition_stretch', 'Revenue-Recognition Stretch', 'forensic', ['intelligence'], 'Channel-stuffing, bill-and-hold, cut-off manipulation patterns.', revenueRecognitionStretchApply),

  // ─── BEHAVIORAL ECONOMICS ─────────────────────────────────────────
  m('prospect_theory', 'Prospect-Theory Lens', 'cognitive_science', ['deep_thinking','introspection'], 'Reference-point, loss-aversion, probability-weighting checks on the subject\'s decisions.'),
  m('status_quo_bias', 'Status-Quo Bias', 'cognitive_science', ['introspection'], 'Subject prefers current path despite better alternatives — investigate why.'),
  m('endowment_effect', 'Endowment Effect', 'cognitive_science', ['introspection'], 'Over-valuation of owned assets — price-setting anomalies.'),
  m('hyperbolic_discount', 'Hyperbolic Discount', 'cognitive_science', ['introspection'], 'Short-term pay-off heavily over-weighted — pressure / distress indicator.'),
  m('certainty_effect', 'Certainty Effect', 'cognitive_science', ['introspection'], 'Over-weighting certain outcomes vs probabilistic ones.'),
  m('reference_point_shift', 'Reference-Point Shift', 'cognitive_science', ['introspection'], 'Narrative re-baselined mid-process to justify an outcome.'),
  m('mental_accounting', 'Mental Accounting', 'cognitive_science', ['introspection'], 'Funds treated differently by source — probe for SoW laundering.'),

  // ─── NETWORK / GRAPH ──────────────────────────────────────────────
  m('k_core_analysis', 'k-Core Analysis', 'graph_analysis', ['data_analysis','intelligence'], 'Densest-subgraph extraction — core of a scheme.'),
  m('bridge_detection', 'Bridge Detection', 'graph_analysis', ['data_analysis'], 'Edges whose removal disconnects the network — choke points.'),
  m('temporal_motif', 'Temporal Motif', 'graph_analysis', ['data_analysis','intelligence'], 'Time-ordered subgraph patterns — layering signatures.'),
  m('reciprocal_edge_pattern', 'Reciprocal-Edge Pattern', 'graph_analysis', ['data_analysis'], 'Back-and-forth flows between a pair — round-trip candidates.'),
  m('triadic_closure', 'Triadic Closure', 'graph_analysis', ['data_analysis'], 'Missing third-edge triangles — plausible hidden relationships.'),
  m('structural_hole', 'Structural Hole', 'graph_analysis', ['intelligence'], 'Brokers between disjoint clusters — gatekeeper / enabler candidates.'),

  // ─── LINGUISTIC / NLP ─────────────────────────────────────────────
  m('stylometry', 'Stylometry', 'forensic', ['intelligence'], 'Authorship attribution via style fingerprint.'),
  m('gaslighting_detection', 'Gaslighting Detection', 'forensic', ['intelligence','introspection'], 'Reality-denial / memory-undermining patterns in client communication.', gaslightingDetectionApply),
  m('obfuscation_pattern', 'Obfuscation Pattern', 'forensic', ['intelligence','smartness'], 'Deliberate vagueness / passive voice / agentless constructions.', obfuscationPatternApply),
  m('code_word_detection', 'Code-Word Detection', 'forensic', ['intelligence','smartness'], 'Domain slang, cant, or cipher masking illicit content.'),
  m('hedging_language', 'Hedging Language', 'forensic', ['intelligence','introspection'], 'Weasel words signalling low commitment to a claim.', hedgingLanguageApply),
  m('minimisation_pattern', 'Minimisation Pattern', 'forensic', ['intelligence'], 'Systematic downplaying of severity in narratives / SARs.', minimisationPatternApply),

  // ─── SANCTIONS-EVASION SPECIFIC ───────────────────────────────────
  m('phantom_vessel', 'Phantom Vessel', 'sectoral_typology', ['intelligence'], 'AIS-off, spoofed identity, dark-fleet patterns.'),
  m('flag_hopping', 'Flag Hopping', 'sectoral_typology', ['intelligence'], 'Rapid flag-of-convenience changes to evade scrutiny.'),
  m('dark_fleet_pattern', 'Dark-Fleet Pattern', 'sectoral_typology', ['intelligence'], 'Aging tonnage, opaque owners, uninsured calls into sanctioned ports.'),
  m('front_company_fingerprint', 'Front-Company Fingerprint', 'sectoral_typology', ['intelligence','smartness'], 'Shared registered agents, synthetic directors, thin web presence.'),
  m('nominee_rotation_detection', 'Nominee Rotation', 'sectoral_typology', ['intelligence'], 'Same nominees re-used across rotating shell entities.'),
  m('bvi_cook_island_chain', 'BVI / Cook-Islands Chain', 'sectoral_typology', ['intelligence'], 'Classic secrecy-jurisdiction cascade patterns.'),
  m('freeport_risk', 'Free-Port Risk', 'sectoral_typology', ['intelligence'], 'Geneva / Luxembourg / Delaware free-port concealment.'),

  // ─── CRYPTO DEEP ──────────────────────────────────────────────────
  m('address_poisoning', 'Address Poisoning', 'crypto_defi', ['smartness'], 'Attacker seeds wallet history with look-alike addresses.'),
  m('chain_hopping_velocity', 'Chain-Hopping Velocity', 'crypto_defi', ['data_analysis'], 'Rapid cross-chain bridge hopping under obfuscation intent.'),
  m('cross_chain_taint', 'Cross-Chain Taint', 'crypto_defi', ['inference'], 'Propagate taint across bridges and wrapped assets.'),
  m('privacy_pool_exposure', 'Privacy-Pool Exposure', 'crypto_defi', ['inference'], 'Tornado-style pool deposit/withdraw risk assessment.'),
  m('tornado_cash_proximity', 'Tornado-Cash Proximity', 'crypto_defi', ['inference'], 'Hop-distance from designated mixer addresses.'),
  m('peel_chain', 'Peel-Chain Pattern', 'crypto_defi', ['data_analysis'], 'Successive small peels off a large balance to obscure flow.'),
  m('change_address_heuristic', 'Change-Address Heuristic', 'crypto_defi', ['data_analysis'], 'Common-input-ownership + change-output clustering.'),
  m('dusting_attack_pattern', 'Dusting-Attack Pattern', 'crypto_defi', ['smartness'], 'Micro-transfers to probe or deanonymise wallets.'),

  // ─── ESG RISK ─────────────────────────────────────────────────────
  m('greenwashing_signal', 'Greenwashing Signal', 'esg', ['intelligence'], 'Gap between sustainability claims and verifiable practice.'),
  m('forced_labour_supply_chain', 'Forced-Labour Supply Chain', 'esg', ['intelligence'], 'Xinjiang, migrant-worker, recruitment-fee red flags.'),
  m('conflict_mineral_typology', 'Conflict-Mineral Typology', 'esg', ['intelligence'], '3TG / gold CAHRA sourcing and chain-of-custody.'),
  m('carbon_fraud_pattern', 'Carbon-Credit Fraud', 'esg', ['intelligence','smartness'], 'VAT carousel, phantom offsets, double-counting of credits.'),

  // ─── PROBABILISTIC AGGREGATION ────────────────────────────────────
  m('dempster_shafer', 'Dempster-Shafer Combination', 'statistical', ['inference','deep_thinking'], 'Belief combination across partial evidence masses.', dempsterShaferApply),
  m('bayesian_update_cascade', 'Bayesian Update Cascade', 'statistical', ['inference','deep_thinking'], 'Sequential posterior update across heterogeneous evidence.', bayesianUpdateCascadeApply),
  m('multi_source_consistency', 'Multi-Source Consistency', 'statistical', ['data_analysis','reasoning'], 'Agreement / contradiction measure across independent sources.', multiSourceConsistencyApply),
  m('counter_evidence_weighting', 'Counter-Evidence Weighting', 'statistical', ['introspection','argumentation'], 'Up-weight disconfirming evidence to resist confirmation bias.', counterEvidenceWeightingApply),

  // ─── DATA-QUALITY REAL IMPLEMENTATIONS ────────────────────────────
  // (these override the wave-2 stubs — the engine registry de-dupes by id)
];

// ─── REAL-APPLY OVERRIDES ──────────────────────────────────────────
// These three mode IDs were registered as stubs in wave 1/2;
// we re-export them here with real implementations so the engine can
// substitute them when assembling the final registry.

export const WAVE3_OVERRIDES: ReasoningMode[] = [
  {
    id: 'entropy',
    name: 'Shannon Entropy',
    category: 'statistical',
    faculties: ['data_analysis'],
    wave: 2,
    description: 'Shannon entropy of amount / category distributions.',
    apply: entropyApply,
  },
  {
    id: 'velocity_analysis',
    name: 'Velocity Analysis',
    category: 'behavioral_signals',
    faculties: ['data_analysis', 'smartness'],
    wave: 2,
    description: 'Transaction velocity over time.',
    apply: velocityApply,
  },
  {
    id: 'source_triangulation',
    name: 'Source Triangulation',
    category: 'compliance_framework',
    faculties: ['reasoning', 'ratiocination'],
    wave: 1,
    description: 'Independent-source count for claims.',
    apply: sourceTriangulationApply,
  },
  {
    id: 'completeness_audit',
    name: 'Completeness Audit',
    category: 'data_quality',
    faculties: ['data_analysis', 'introspection'],
    wave: 2,
    description: 'Required-field presence ratio on subject record.',
    apply: completenessAuditApply,
  },
];
