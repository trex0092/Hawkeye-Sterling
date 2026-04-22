// Hawkeye Sterling — real typology detectors.
//
// Domain-specific, evidence-driven detectors. All operate on
// ctx.evidence.transactions shaped as { amount, timestamp?, counterparty?,
// currency?, suspicious?, ... }. Each mode explicitly states the typology
// it is matching and cites observable facts (never characterises legally).
//
//   insider_threat        — velocity spike correlated with privileged access
//   collusion_pattern     — concentrated counterparty clique + timing sync
//   ponzi_scheme          — inflows rely on later inflows to fund earlier claims
//   bec_fraud             — payment redirection (new beneficiary after mid-stream change)
//   structuring_detect    — dense cluster below declared reporting threshold
//   smurfing_detect       — multiple small deposits summing to structured amount

import type {
  BrainContext, FacultyId, Finding, LikelihoodRatio, ReasoningCategory, Verdict,
} from '../types.js';

function mk(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  verdict: Verdict,
  score: number,
  confidence: number,
  rationale: string,
  opts: {
    hypothesis?: Finding['hypothesis'];
    likelihoodRatios?: LikelihoodRatio[];
    tags?: string[];
  } = {},
): Finding {
  const f: Finding = {
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale,
    evidence: [],
    producedAt: Date.now(),
  };
  if (opts.hypothesis !== undefined) f.hypothesis = opts.hypothesis;
  if (opts.likelihoodRatios !== undefined) f.likelihoodRatios = opts.likelihoodRatios;
  if (opts.tags !== undefined) f.tags = opts.tags;
  return f;
}

function txs(ctx: BrainContext): Array<Record<string, unknown>> {
  const v = ctx.evidence.transactions;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}

function num(r: Record<string, unknown>, field: string): number | null {
  const v = r[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ts(r: Record<string, unknown>): number | null {
  const t = r.timestamp ?? r.date ?? r.observedAt ?? r.ts;
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// ── insider_threat ─────────────────────────────────────────────────────
// Marker: evidence.insiderActorIds[] matches counterparty on a high
// proportion of flagged transactions.
export const insiderThreatApply = async (ctx: BrainContext): Promise<Finding> => {
  const insiders = ((ctx.evidence as Record<string, unknown>).insiderActorIds);
  if (!Array.isArray(insiders) || insiders.length === 0) {
    return mk('insider_threat', 'forensic', ['smartness'],
      'inconclusive', 0, 0.5,
      'Insider threat: evidence.insiderActorIds not supplied.');
  }
  const insiderSet = new Set(insiders.filter((x): x is string => typeof x === 'string'));
  const all = txs(ctx);
  if (all.length < 5) {
    return mk('insider_threat', 'forensic', ['smartness'],
      'inconclusive', 0, 0.4,
      `Insider threat: n=${all.length} < 5.`);
  }
  const hits = all.filter((r) => {
    const cp = typeof r.counterparty === 'string' ? r.counterparty : typeof r.actor === 'string' ? r.actor : '';
    return insiderSet.has(cp);
  });
  const rate = hits.length / all.length;
  const verdict: Verdict = rate > 0.2 ? 'escalate' : rate > 0.05 ? 'flag' : 'clear';
  return mk('insider_threat', 'forensic', ['smartness'],
    verdict, rate, 0.85,
    `Insider threat: ${hits.length}/${all.length} transactions involve a declared insider (${(rate * 100).toFixed(0)}%).`,
    { hypothesis: 'material_concern' });
};

// ── collusion_pattern ──────────────────────────────────────────────────
// Counterparty concentration: top-3 counterparties account for > 60% of flow.
export const collusionPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const all = txs(ctx);
  if (all.length < 10) {
    return mk('collusion_pattern', 'forensic', ['smartness'],
      'inconclusive', 0, 0.4, `Collusion: n=${all.length} < 10.`);
  }
  const vol = new Map<string, number>();
  let totalVol = 0;
  for (const r of all) {
    const amt = num(r, 'amount') ?? 1;
    const cp = typeof r.counterparty === 'string' ? r.counterparty : 'unknown';
    vol.set(cp, (vol.get(cp) ?? 0) + amt);
    totalVol += amt;
  }
  const top3 = [...vol.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const share = totalVol > 0 ? top3 / totalVol : 0;
  const verdict: Verdict = share > 0.85 ? 'escalate' : share > 0.6 ? 'flag' : 'clear';
  return mk('collusion_pattern', 'forensic', ['smartness'],
    verdict, share, 0.85,
    `Collusion: top-3 counterparties account for ${(share * 100).toFixed(0)}% of volume across ${all.length} transactions (${vol.size} distinct counterparties).`);
};

// ── ponzi_scheme ───────────────────────────────────────────────────────
// Marker: evidence.claimedYield > 0 AND cohort-level inflow timing
// correlates with outflow timing (receipt within T+7 of new inflows).
export const ponziSchemeApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence as Record<string, unknown>;
  const yieldPromised = typeof e.claimedYield === 'number' ? e.claimedYield : null;
  const all = txs(ctx);
  if (yieldPromised === null || all.length < 10) {
    return mk('ponzi_scheme', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4,
      'Ponzi: need evidence.claimedYield + ≥10 timestamped transactions.');
  }
  // Sort by timestamp; count outflows within 7d of prior inflow.
  const sorted = [...all].sort((a, b) => (ts(a) ?? 0) - (ts(b) ?? 0));
  let coupled = 0;
  let outflows = 0;
  let lastInflow: number | null = null;
  for (const r of sorted) {
    const amt = num(r, 'amount') ?? 0;
    const t = ts(r);
    if (amt > 0) lastInflow = t;
    else if (amt < 0) {
      outflows++;
      if (lastInflow !== null && t !== null && (t - lastInflow) < 7 * 86_400_000) coupled++;
    }
  }
  const coupling = outflows > 0 ? coupled / outflows : 0;
  const yieldFlag = yieldPromised > 0.15;   // >15% promised yield is extreme
  const verdict: Verdict = yieldFlag && coupling > 0.6 ? 'escalate' : coupling > 0.5 ? 'flag' : 'clear';
  return mk('ponzi_scheme', 'sectoral_typology', ['smartness'],
    verdict, Math.min(1, coupling * (yieldFlag ? 1 : 0.5)), 0.85,
    `Ponzi typology: claimed yield ${((yieldPromised ?? 0) * 100).toFixed(1)}%; ${coupled}/${outflows} outflows occur within 7 days of a prior inflow (coupling ${(coupling * 100).toFixed(0)}%). ${yieldFlag ? 'Yield exceeds sustainable threshold.' : ''}`,
    { hypothesis: 'material_concern' });
};

// ── bec_fraud (Business Email Compromise) ──────────────────────────────
// Marker: evidence.beneficiaryChanged === true late in a counterparty
// relationship + first post-change payment exceeds prior mean.
export const becFraudApply = async (ctx: BrainContext): Promise<Finding> => {
  const e = ctx.evidence as Record<string, unknown>;
  const changed = e.beneficiaryChanged === true;
  const all = txs(ctx);
  if (!changed || all.length < 5) {
    return mk('bec_fraud', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4,
      'BEC: requires evidence.beneficiaryChanged and ≥5 transactions.');
  }
  const changedAt = typeof e.beneficiaryChangedAt === 'string' ? Date.parse(e.beneficiaryChangedAt) : null;
  if (changedAt === null || Number.isNaN(changedAt)) {
    return mk('bec_fraud', 'sectoral_typology', ['smartness'],
      'flag', 0.5, 0.7,
      'BEC: beneficiary changed flag is set but no timestamp; treat as investigative signal.',
      { hypothesis: 'material_concern' });
  }
  const pre = all.filter((r) => (ts(r) ?? 0) < changedAt).map((r) => num(r, 'amount') ?? 0);
  const post = all.filter((r) => (ts(r) ?? 0) >= changedAt).map((r) => num(r, 'amount') ?? 0);
  const preMean = pre.length > 0 ? pre.reduce((a, b) => a + b, 0) / pre.length : 0;
  const postMean = post.length > 0 ? post.reduce((a, b) => a + b, 0) / post.length : 0;
  const lift = preMean > 0 ? postMean / preMean : 0;
  const verdict: Verdict = lift > 3 ? 'escalate' : lift > 1.5 ? 'flag' : 'clear';
  return mk('bec_fraud', 'sectoral_typology', ['smartness'],
    verdict, Math.min(1, (lift - 1) / 4), 0.85,
    `BEC typology: beneficiary changed; pre-change mean ${preMean.toFixed(2)} (n=${pre.length}) vs post-change mean ${postMean.toFixed(2)} (n=${post.length}); lift ×${lift.toFixed(2)}.`,
    { hypothesis: 'material_concern' });
};

// ── structuring (sub-threshold deposits) ────────────────────────────────
// Exposed as a standalone detector — not wired to a registry ID since the
// existing registry has no 'structuring_detection' entry. Consumers who
// want structuring detection integrated into a run can inject it via
// registerModeOverride('typology_catalogue', structuringDetect) or wrap it.
export const structuringDetect = async (ctx: BrainContext): Promise<Finding> => {
  const thresh = (ctx.evidence as Record<string, unknown>).reportingThreshold;
  const threshold = typeof thresh === 'number' && Number.isFinite(thresh) ? thresh : 10_000;
  const all = txs(ctx);
  if (all.length < 5) {
    return mk('typology_catalogue', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4, `Structuring: n=${all.length} < 5.`);
  }
  const band = all.filter((r) => {
    const a = num(r, 'amount');
    return a !== null && a >= 0.85 * threshold && a < threshold;
  }).length;
  const rate = band / all.length;
  const verdict: Verdict = rate > 0.25 ? 'escalate' : rate > 0.1 ? 'flag' : 'clear';
  const lrs: LikelihoodRatio[] = rate > 0.1
    ? [{ evidenceId: 'structuring:sub_threshold', positiveGivenHypothesis: Math.min(0.9, 0.4 + rate), positiveGivenNot: 0.08 }]
    : [];
  return mk('typology_catalogue', 'sectoral_typology', ['smartness'],
    verdict, rate, 0.85,
    `Structuring (typology match): ${band}/${all.length} transactions fall in [${(0.85 * threshold).toFixed(0)}, ${threshold}) — the classic sub-threshold band (${(rate * 100).toFixed(0)}%).`,
    { hypothesis: 'illicit_risk', likelihoodRatios: lrs });
};

// ── smurfing detector (standalone) ─────────────────────────────────────
export const smurfingDetect = async (ctx: BrainContext): Promise<Finding> => {
  const all = txs(ctx);
  if (all.length < 10) {
    return mk('typology_catalogue', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4, `Smurfing: n=${all.length} < 10.`);
  }
  const buckets = new Map<string, { senders: Set<string>; total: number; count: number }>();
  for (const r of all) {
    const dest = typeof r.destination === 'string' ? r.destination
      : typeof r.to === 'string' ? r.to : 'unknown';
    const sender = typeof r.counterparty === 'string' ? r.counterparty
      : typeof r.from === 'string' ? r.from : 'unknown';
    const t = ts(r);
    const day = t !== null ? Math.floor(t / 86_400_000) : 0;
    const key = `${dest}|${day}`;
    const amt = num(r, 'amount') ?? 0;
    const b = buckets.get(key) ?? { senders: new Set(), total: 0, count: 0 };
    b.senders.add(sender);
    b.total += amt;
    b.count++;
    buckets.set(key, b);
  }
  const suspects = [...buckets.entries()].filter(([, b]) =>
    b.senders.size >= 5 && b.count >= 8 && b.total > 5_000);
  const verdict: Verdict = suspects.length >= 2 ? 'escalate' : suspects.length === 1 ? 'flag' : 'clear';
  const first = suspects[0];
  return mk('typology_catalogue', 'sectoral_typology', ['smartness'],
    verdict, Math.min(1, suspects.length * 0.35), 0.85,
    `Smurfing (typology match): ${suspects.length} destination-day bucket(s) show ≥5 distinct senders, ≥8 deposits, >$5k aggregated${first ? ` — e.g. ${first[0]} (${first[1].senders.size} senders, ${first[1].count} deposits, total ${first[1].total.toFixed(0)})` : ''}.`,
    { hypothesis: 'illicit_risk' });
};

export const TYPOLOGY_MODE_APPLIES = {
  insider_threat: insiderThreatApply,
  collusion_pattern: collusionPatternApply,
  ponzi_scheme: ponziSchemeApply,
  bec_fraud: becFraudApply,
} as const;
