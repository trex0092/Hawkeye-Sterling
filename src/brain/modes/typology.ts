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

// ── tbml_overlay (trade-based money laundering) ────────────────────────
// Markers: evidence.trade[{invoicedUnitPrice, marketUnitPrice, quantity,
// shipments}] — flags over/under-invoicing deltas ≥25% vs market.
export const tbmlOverlayApply = async (ctx: BrainContext): Promise<Finding> => {
  const trade = (ctx.evidence as Record<string, unknown>).trade;
  if (!Array.isArray(trade) || trade.length === 0) {
    return mk('tbml_overlay', 'sectoral_typology', ['intelligence'],
      'inconclusive', 0, 0.4,
      'TBML: evidence.trade[] not supplied.');
  }
  let outliers = 0;
  let overInvoiceShare = 0;
  let underInvoiceShare = 0;
  const reasons: string[] = [];
  for (const t of trade) {
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    const invoiced = typeof rec.invoicedUnitPrice === 'number' ? rec.invoicedUnitPrice : null;
    const market = typeof rec.marketUnitPrice === 'number' ? rec.marketUnitPrice : null;
    if (invoiced === null || market === null || market === 0) continue;
    const delta = (invoiced - market) / market;
    if (Math.abs(delta) >= 0.25) {
      outliers++;
      if (delta > 0) overInvoiceShare++; else underInvoiceShare++;
      if (reasons.length < 3) reasons.push(`item Δ${(delta * 100).toFixed(0)}% (inv ${invoiced} vs mkt ${market})`);
    }
  }
  const rate = outliers / Math.max(1, trade.length);
  const verdict: Verdict = rate > 0.3 ? 'escalate' : rate > 0.1 ? 'flag' : 'clear';
  const lrs: LikelihoodRatio[] = rate > 0.1
    ? [{ evidenceId: 'tbml:price_deviation', positiveGivenHypothesis: Math.min(0.9, 0.5 + rate), positiveGivenNot: 0.1 }]
    : [];
  return mk('tbml_overlay', 'sectoral_typology', ['intelligence'],
    verdict, Math.min(1, rate * 2), 0.85,
    `TBML overlay: ${outliers}/${trade.length} line items deviate ≥25% from market price (over-invoice ${overInvoiceShare}, under-invoice ${underInvoiceShare}). ${reasons.join('; ')}.`,
    { hypothesis: 'illicit_risk', likelihoodRatios: lrs });
};

// ── real_estate_cash ───────────────────────────────────────────────────
// Marker: evidence.realEstate[{purchasePrice, cashPortionPct, shellBuyer?,
// jurisdictionTier?, heldYearsBeforeFlip?}] — flags cash-heavy, shell-buyer
// or rapid-flip UAE real estate red flags (UAE MOJ / MOEC typology).
export const realEstateCashApply = async (ctx: BrainContext): Promise<Finding> => {
  const deals = (ctx.evidence as Record<string, unknown>).realEstate;
  if (!Array.isArray(deals) || deals.length === 0) {
    return mk('real_estate_cash', 'sectoral_typology', ['intelligence'],
      'inconclusive', 0, 0.4,
      'Real-estate cash: evidence.realEstate[] not supplied.');
  }
  let cashHeavy = 0;
  let shellBuyers = 0;
  let rapidFlips = 0;
  for (const d of deals) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    if (typeof r.cashPortionPct === 'number' && r.cashPortionPct >= 0.5) cashHeavy++;
    if (r.shellBuyer === true) shellBuyers++;
    if (typeof r.heldYearsBeforeFlip === 'number' && r.heldYearsBeforeFlip < 1) rapidFlips++;
  }
  const total = deals.length;
  const severity = Math.min(1, (cashHeavy + shellBuyers + rapidFlips) / (total * 2));
  const verdict: Verdict = severity > 0.5 ? 'escalate' : severity > 0.2 ? 'flag' : 'clear';
  return mk('real_estate_cash', 'sectoral_typology', ['intelligence'],
    verdict, severity, 0.8,
    `Real-estate cash typology: ${total} deal(s); cash-heavy (≥50%) ${cashHeavy}, shell-buyer ${shellBuyers}, <1-year flips ${rapidFlips}. ${severity > 0.5 ? 'Multiple red flags concurrent.' : severity > 0 ? 'Some red flags present.' : 'No red flags observed.'}`,
    { hypothesis: 'illicit_risk' });
};

// ── invoice_fraud ──────────────────────────────────────────────────────
// Markers: duplicate invoice numbers across counterparties, invoiced amount
// not matching goods-received amount, invoice issued from a shell/redirected
// address. Consumes evidence.invoices[].
export const invoiceFraudApply = async (ctx: BrainContext): Promise<Finding> => {
  const invoices = (ctx.evidence as Record<string, unknown>).invoices;
  if (!Array.isArray(invoices) || invoices.length < 3) {
    return mk('invoice_fraud', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4,
      `Invoice fraud: need ≥3 invoices; have ${Array.isArray(invoices) ? invoices.length : 0}.`);
  }
  const numbers = new Map<string, number>();
  let amountMismatches = 0;
  let shellOrigin = 0;
  for (const inv of invoices) {
    if (!inv || typeof inv !== 'object') continue;
    const r = inv as Record<string, unknown>;
    const n = typeof r.invoiceNumber === 'string' ? r.invoiceNumber : '';
    if (n) numbers.set(n, (numbers.get(n) ?? 0) + 1);
    const invoiced = typeof r.invoicedAmount === 'number' ? r.invoicedAmount : null;
    const received = typeof r.receivedAmount === 'number' ? r.receivedAmount : null;
    if (invoiced !== null && received !== null && received > 0) {
      const diff = Math.abs(invoiced - received) / received;
      if (diff > 0.1) amountMismatches++;
    }
    if (r.issuerShell === true) shellOrigin++;
  }
  const duplicates = [...numbers.values()].filter((c) => c > 1).length;
  const total = invoices.length;
  const severity = Math.min(1, (duplicates * 0.5 + amountMismatches + shellOrigin) / Math.max(1, total));
  const verdict: Verdict = severity > 0.4 ? 'escalate' : severity > 0.15 ? 'flag' : 'clear';
  return mk('invoice_fraud', 'sectoral_typology', ['smartness'],
    verdict, severity, 0.85,
    `Invoice fraud: ${total} invoices; ${duplicates} duplicate number(s), ${amountMismatches} amount mismatch(es), ${shellOrigin} issued by shell/redirected entities.`,
    { hypothesis: 'illicit_risk' });
};

// ── phoenix_company (nominee-director / rapid reincorporation) ─────────
// Markers: evidence.corporateHistory[{entityId, incorporatedAt,
// dissolvedAt?, directors[]}] — flags entities that dissolve and re-emerge
// under new names with the same directors inside <2 years.
export const phoenixCompanyApply = async (ctx: BrainContext): Promise<Finding> => {
  const hist = (ctx.evidence as Record<string, unknown>).corporateHistory;
  if (!Array.isArray(hist) || hist.length < 2) {
    return mk('phoenix_company', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4,
      `Phoenix: need ≥2 corporate-history records; have ${Array.isArray(hist) ? hist.length : 0}.`);
  }
  interface Rec { incorporated: number; dissolved: number | null; directors: Set<string>; id: string; }
  const parsed: Rec[] = [];
  for (const e of hist) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const id = typeof r.entityId === 'string' ? r.entityId : '';
    const inc = typeof r.incorporatedAt === 'string' ? Date.parse(r.incorporatedAt) : Number.NaN;
    const dis = typeof r.dissolvedAt === 'string' ? Date.parse(r.dissolvedAt) : null;
    const dirs = Array.isArray(r.directors) ? (r.directors as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (!id || !Number.isFinite(inc)) continue;
    parsed.push({ id, incorporated: inc, dissolved: dis, directors: new Set(dirs) });
  }
  parsed.sort((a, b) => a.incorporated - b.incorporated);
  let phoenixHits = 0;
  const hitPairs: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const a = parsed[i]!;
    if (a.dissolved === null) continue;
    for (let j = i + 1; j < parsed.length; j++) {
      const b = parsed[j]!;
      if (b.incorporated < a.dissolved) continue;
      const gapYears = (b.incorporated - a.dissolved) / (365 * 86_400_000);
      if (gapYears > 2) continue;
      const overlap = [...a.directors].filter((d) => b.directors.has(d)).length;
      if (overlap > 0 && a.directors.size > 0) {
        phoenixHits++;
        if (hitPairs.length < 3) hitPairs.push(`${a.id}→${b.id} (${overlap} shared directors, gap ${gapYears.toFixed(1)}y)`);
      }
    }
  }
  const verdict: Verdict = phoenixHits >= 2 ? 'escalate' : phoenixHits === 1 ? 'flag' : 'clear';
  return mk('phoenix_company', 'sectoral_typology', ['smartness'],
    verdict, Math.min(1, phoenixHits * 0.4), 0.85,
    `Phoenix: ${phoenixHits} phoenix-pattern pair(s) detected. ${hitPairs.join('; ')}.`,
    { hypothesis: 'illicit_risk' });
};

// ── advance_fee (419-style) ────────────────────────────────────────────
// Markers: evidence.advanceFeeSignals = { upfrontPaymentPct?: number,
// counterpartyCountryTier?: 'high'|'very_high', claimedPayout?: number,
// unsolicited: boolean }.
export const advanceFeeApply = async (ctx: BrainContext): Promise<Finding> => {
  const s = (ctx.evidence as Record<string, unknown>).advanceFeeSignals;
  if (!s || typeof s !== 'object') {
    return mk('advance_fee', 'sectoral_typology', ['smartness'],
      'inconclusive', 0, 0.4,
      'Advance-fee: evidence.advanceFeeSignals not supplied.');
  }
  const r = s as Record<string, unknown>;
  const upfront = typeof r.upfrontPaymentPct === 'number' ? r.upfrontPaymentPct : null;
  const tier = typeof r.counterpartyCountryTier === 'string' ? r.counterpartyCountryTier : '';
  const payout = typeof r.claimedPayout === 'number' ? r.claimedPayout : null;
  const unsolicited = r.unsolicited === true;
  let score = 0;
  const hits: string[] = [];
  if (upfront !== null && upfront > 0.1) { score += 0.3; hits.push(`${(upfront * 100).toFixed(0)}% upfront fee`); }
  if (tier === 'high' || tier === 'very_high') { score += 0.25; hits.push(`counterparty in ${tier} country tier`); }
  if (payout !== null && payout > 0 && upfront !== null && payout / Math.max(1, upfront) > 50) {
    score += 0.3; hits.push(`implausible payout-to-fee ratio ×${Math.round(payout / Math.max(1, upfront))}`);
  }
  if (unsolicited) { score += 0.15; hits.push('unsolicited contact'); }
  const verdict: Verdict = score >= 0.7 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return mk('advance_fee', 'sectoral_typology', ['smartness'],
    verdict, Math.min(1, score), 0.8,
    `Advance-fee: ${hits.length === 0 ? 'no classic signals present.' : `${hits.length} classic signal(s): ${hits.join('; ')}.`}`,
    { hypothesis: 'illicit_risk' });
};

// ── sanctions_maritime_stss (ship-to-ship sanctions evasion) ───────────
// Markers: evidence.maritime = { aisDarkHours?: number, flagChanges12m?: number,
// nameChanges12m?: number, stsNearSanctionedPort?: boolean }.
export const maritimeStssApply = async (ctx: BrainContext): Promise<Finding> => {
  const m = (ctx.evidence as Record<string, unknown>).maritime;
  if (!m || typeof m !== 'object') {
    return mk('sanctions_maritime_stss', 'sectoral_typology', ['intelligence'],
      'inconclusive', 0, 0.4,
      'Maritime STS: evidence.maritime not supplied.');
  }
  const r = m as Record<string, unknown>;
  const dark = typeof r.aisDarkHours === 'number' ? r.aisDarkHours : 0;
  const flagChanges = typeof r.flagChanges12m === 'number' ? r.flagChanges12m : 0;
  const nameChanges = typeof r.nameChanges12m === 'number' ? r.nameChanges12m : 0;
  const stsNear = r.stsNearSanctionedPort === true;
  let score = 0;
  const hits: string[] = [];
  if (dark > 24) { score += 0.25; hits.push(`${dark}h AIS dark`); }
  if (flagChanges >= 2) { score += 0.25; hits.push(`${flagChanges} flag changes / 12m`); }
  if (nameChanges >= 2) { score += 0.2; hits.push(`${nameChanges} name changes / 12m`); }
  if (stsNear) { score += 0.35; hits.push('STS near sanctioned port'); }
  const verdict: Verdict = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';
  return mk('sanctions_maritime_stss', 'sectoral_typology', ['intelligence'],
    verdict, Math.min(1, score), 0.85,
    `Maritime STS evasion: ${hits.length === 0 ? 'no signals.' : hits.join('; ')}.`,
    { hypothesis: 'sanctioned' });
};

export const TYPOLOGY_MODE_APPLIES = {
  insider_threat: insiderThreatApply,
  collusion_pattern: collusionPatternApply,
  ponzi_scheme: ponziSchemeApply,
  bec_fraud: becFraudApply,
  tbml_overlay: tbmlOverlayApply,
  real_estate_cash: realEstateCashApply,
  invoice_fraud: invoiceFraudApply,
  phoenix_company: phoenixCompanyApply,
  advance_fee: advanceFeeApply,
  sanctions_maritime_stss: maritimeStssApply,
} as const;
