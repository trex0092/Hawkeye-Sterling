// Hawkeye Sterling — wave-13 mode implementations (19 modes).
// Forensic accounting, quantum intelligence, anticipation, geopolitical awareness.
// Anchors: ACFE Report to the Nations · FATF 40 Recommendations · OECD TP Guidelines ·
//          OFAC Virtual Currency Advisory · UN Panel of Experts · EU Reg 2021/821.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  const ft = (ctx.evidence as Record<string, unknown>).freeText;
  if (typeof ft === 'string') parts.push(ft);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function hit(score: number): Verdict { return score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear'; }
function build(
  modeId: string, cat: ReasoningCategory, facs: FacultyId[],
  score: number, conf: number, rationale: string, evidence: string[],
): Finding {
  return { modeId, category: cat, faculties: facs, score, confidence: conf, verdict: hit(score), rationale, evidence, producedAt: Date.now() };
}
function ev(ctx: BrainContext, key: string): unknown[] {
  const v = (ctx.evidence as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : [];
}
function numOf(ctx: BrainContext, key: string, fallback = 0): number {
  const v = (ctx.evidence as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : fallback;
}

// ── FORENSIC ACCOUNTING ───────────────────────────────────────────────────────

const journalEntryTimingAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const entries = ev(ctx, 'journalEntries') as Array<{ hour?: number; dayOfWeek?: number; isLastDay?: boolean; amount?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const offHours = entries.filter(e => { const h = e.hour ?? 12; return h < 7 || h >= 22; });
  if (offHours.length >= 3) { score += 0.35; evidence.push(`${offHours.length} off-hours journal entries (before 07:00 or after 22:00)`); }
  const weekend = entries.filter(e => (e.dayOfWeek ?? 1) === 0 || (e.dayOfWeek ?? 1) === 6);
  if (weekend.length >= 2) { score += 0.2; evidence.push(`${weekend.length} weekend journal entries`); }
  const periodEnd = entries.filter(e => e.isLastDay);
  if (periodEnd.length >= 3) { score += 0.25; evidence.push(`${periodEnd.length} period-end entries — channel-stuffing or reversals indicator`); }
  if (/off.?hours.*journal|weekend.*entry|period.?end.*reversal|manual.*override/.test(ft)) { score += 0.1; evidence.push('Narrative references off-hours or period-end journal manipulation'); }
  const priorFraud = ctx.priorFindings.filter(f => f.verdict === 'escalate' && /forensic|fraud|fabricat/.test(f.modeId));
  if (priorFraud.length > 0) { score += 0.15; evidence.push(`${priorFraud.length} prior forensic escalation(s) reinforce timing anomaly`); }
  score = clamp(score, 0, 1);
  const conf = entries.length === 0 ? 0.3 : clamp(0.45 + 0.04 * entries.length, 0, 0.88);
  return build('fa.journal_entry_timing_analysis', 'forensic_accounting', ['forensic_accounting', 'data_analysis'],
    score, conf,
    `Journal entry timing analysis: ${entries.length} entries reviewed. Off-hours: ${offHours.length}, weekend: ${weekend.length}, period-end: ${periodEnd.length}. ` +
    `ACFE Report to the Nations Exhibit 4.3: manual journal entries are the #1 financial-statement-fraud scheme. ` +
    `Anchors: ACFE 2024 · PCAOB AS 2401 · IFAC ISA 240.`,
    evidence);
};

const roundDollarClusteringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ amount?: number; currency?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const roundAmounts = txns.filter(t => {
    const a = t.amount ?? 0;
    return a > 0 && a % 1000 === 0;
  });
  const roundRatio = txns.length > 0 ? roundAmounts.length / txns.length : 0;
  if (roundRatio >= 0.5) { score += 0.4; evidence.push(`${(roundRatio * 100).toFixed(0)}% transactions at round-dollar amounts (≥50% threshold exceeded)`); }
  else if (roundRatio >= 0.25) { score += 0.2; evidence.push(`${(roundRatio * 100).toFixed(0)}% round-dollar concentration (elevated above 10% baseline)`); }
  const veryRound = txns.filter(t => { const a = t.amount ?? 0; return a > 0 && a % 10_000 === 0; });
  if (veryRound.length >= 3) { score += 0.2; evidence.push(`${veryRound.length} transactions at exact 10,000-unit multiples`); }
  if (/round.?dollar|exact.*amount|fabricat|estimated.*invoice/.test(ft)) { score += 0.1; evidence.push('Narrative references round-dollar or fabricated invoices'); }
  score = clamp(score, 0, 1);
  const conf = txns.length < 5 ? 0.3 : clamp(0.5 + 0.02 * txns.length, 0, 0.87);
  return build('fa.round_dollar_clustering', 'forensic_accounting', ['forensic_accounting', 'data_analysis', 'smartness'],
    score, conf,
    `Round-dollar clustering: ${txns.length} transactions analysed. Round-amount ratio: ${(roundRatio * 100).toFixed(1)}% (baseline: <10%). ` +
    `Legitimate commerce produces non-uniform amounts reflecting real pricing; excessive clustering signals fabricated or estimated invoicing. ` +
    `Anchors: ACFE 2024 · Benford's Law (first-digit expected distribution).`,
    evidence);
};

const duplicateTransactionDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ amount?: number; counterpartyId?: string; date?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const seen = new Map<string, number>();
  for (const t of txns) {
    const key = `${t.amount ?? ''}:${t.counterpartyId ?? ''}:${t.date ?? ''}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter(n => n > 1);
  const dupeCount = dupes.reduce((a, n) => a + n - 1, 0);
  if (dupeCount >= 5) { score += 0.45; evidence.push(`${dupeCount} duplicate transaction entries detected`); }
  else if (dupeCount >= 2) { score += 0.25; evidence.push(`${dupeCount} potential duplicate entries`); }
  const sameAmountSameCounterparty = new Map<string, number>();
  for (const t of txns) {
    const key = `${t.amount ?? ''}:${t.counterpartyId ?? ''}`;
    sameAmountSameCounterparty.set(key, (sameAmountSameCounterparty.get(key) ?? 0) + 1);
  }
  const repeatPairs = [...sameAmountSameCounterparty.values()].filter(n => n >= 3).length;
  if (repeatPairs >= 2) { score += 0.2; evidence.push(`${repeatPairs} counterparty-amount pairs repeated ≥3 times — ghost-vendor pattern`); }
  if (/duplicate|ghost.*vendor|inflated.*revenue|copy.?past/.test(ft)) { score += 0.1; evidence.push('Narrative references duplication or ghost-vendor scheme'); }
  score = clamp(score, 0, 1);
  const conf = txns.length < 5 ? 0.3 : clamp(0.5 + 0.015 * txns.length, 0, 0.88);
  return build('fa.duplicate_transaction_detection', 'forensic_accounting', ['forensic_accounting', 'data_analysis'],
    score, conf,
    `Duplicate transaction analysis: ${txns.length} transactions. Exact duplicates: ${dupeCount}. High-repeat counterparty-amount pairs: ${repeatPairs}. ` +
    `ACFE ghost-employee/ghost-vendor typology: fabricated transactions are copy-pasted with minimal variation. ` +
    `Anchors: ACFE 2024 · PCAOB AS 2401.`,
    evidence);
};

const shellCompanyFinancialSignatureApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const payroll = numOf(ctx, 'payrollExpenseRatio');
  if (payroll < 0.01) { score += 0.3; evidence.push(`Payroll/revenue ratio ${(payroll * 100).toFixed(2)}% — minimal workforce indicator`); }
  const intercompanyRatio = numOf(ctx, 'intercompanyReceivablesRatio');
  if (intercompanyRatio > 0.5) { score += 0.25; evidence.push(`Intercompany receivables: ${(intercompanyRatio * 100).toFixed(0)}% of assets — layering indicator`); }
  const fixedAssets = numOf(ctx, 'fixedAssetsRatio');
  if (fixedAssets < 0.02) { score += 0.15; evidence.push(`Fixed assets < 2% of total assets — no physical operations`); }
  const directorships = numOf(ctx, 'simultaneousDirectorships');
  if (directorships >= 5) { score += 0.2; evidence.push(`Nominee director holds ${directorships} simultaneous directorships`); }
  if (/nominee.*director|shelf.*company|no.*employee|bearer.*share/.test(ft)) { score += 0.1; evidence.push('Narrative references nominee directors or shell indicators'); }
  const vatMismatch = (ctx.evidence as Record<string, unknown>).vatRevenueMismatch === true;
  if (vatMismatch) { score += 0.2; evidence.push('Revenue unmatched by VAT filings — regulatory alert'); }
  score = clamp(score, 0, 1);
  const conf = clamp(0.55 + (evidence.length * 0.05), 0, 0.9);
  return build('fa.shell_company_financial_signature', 'forensic_accounting', ['forensic_accounting', 'intelligence'],
    score, conf,
    `Shell company financial fingerprint: payroll ratio ${(payroll * 100).toFixed(2)}%, intercompany receivables ${(intercompanyRatio * 100).toFixed(0)}%, ` +
    `fixed assets ${(fixedAssets * 100).toFixed(0)}%, simultaneous directorships: ${directorships}. ` +
    `Anchors: FATF Guidance on Beneficial Ownership 2023 · UAE MOE Beneficial Owner Register · ACFE 2024.`,
    evidence);
};

const transferPricingManipulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const armLengthDeviation = numOf(ctx, 'armLengthDeviationPct');
  if (armLengthDeviation > 25) { score += 0.4; evidence.push(`Transfer price deviates ${armLengthDeviation.toFixed(0)}% from arm's-length CUP range (>25% threshold)`); }
  else if (armLengthDeviation > 10) { score += 0.2; evidence.push(`Transfer price deviates ${armLengthDeviation.toFixed(0)}% from arm's-length range (>10% elevated)`); }
  const lowTaxJurisdiction = (ctx.evidence as Record<string, unknown>).counterpartyInLowTaxJurisdiction === true;
  if (lowTaxJurisdiction) { score += 0.25; evidence.push('Counterparty in low-tax or secrecy jurisdiction — profit-shifting indicator'); }
  const missingDocumentation = (ctx.evidence as Record<string, unknown>).missingTransferPricingDocumentation === true;
  if (missingDocumentation) { score += 0.2; evidence.push('Transfer pricing documentation absent or incomplete — OECD TP Guidelines §5.3'); }
  if (/profit.*shift|tax.*evasion|low.?tax.*jurisdiction|intercompany.*price/.test(ft)) { score += 0.1; evidence.push('Narrative references profit-shifting or intercompany pricing manipulation'); }
  score = clamp(score, 0, 1);
  const conf = armLengthDeviation > 0 ? clamp(0.5 + armLengthDeviation * 0.005, 0, 0.9) : 0.35;
  return build('fa.transfer_pricing_manipulation', 'forensic_accounting', ['forensic_accounting', 'reasoning'],
    score, conf,
    `Transfer pricing deviation: ${armLengthDeviation.toFixed(1)}% from arm's-length range. Low-tax jurisdiction: ${lowTaxJurisdiction}. ` +
    `Documentation complete: ${!missingDocumentation}. Profit-shifting via TP manipulation is a primary predicate for ML via tax evasion (FATF R.3). ` +
    `Anchors: OECD TP Guidelines 2022 · FATF R.3 · UAE CT Law (Federal Decree-Law No. 47 of 2022).`,
    evidence);
};

const revenueRecognitionAnomalyApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const periodEndRevenuePct = numOf(ctx, 'periodEndRevenuePct');
  if (periodEndRevenuePct > 40) { score += 0.35; evidence.push(`${periodEndRevenuePct.toFixed(0)}% of quarterly revenue in final 10 days — channel-stuffing indicator`); }
  const reversalRatio = numOf(ctx, 'nextPeriodReversalRatio');
  if (reversalRatio > 0.2) { score += 0.3; evidence.push(`${(reversalRatio * 100).toFixed(0)}% of revenue reversed in next period — bill-and-hold or return indicator`); }
  const inventoryRevenueMismatch = (ctx.evidence as Record<string, unknown>).inventoryRevenueMismatch === true;
  if (inventoryRevenueMismatch) { score += 0.25; evidence.push('Revenue booked without corresponding inventory reduction — fabricated sales indicator'); }
  if (/channel.?stuff|bill.?and.?hold|revenue.*reversal|fabricat.*revenue/.test(ft)) { score += 0.1; evidence.push('Narrative references channel-stuffing or bill-and-hold scheme'); }
  score = clamp(score, 0, 1);
  const conf = clamp(0.45 + (evidence.length * 0.07), 0, 0.88);
  return build('fa.revenue_recognition_anomaly', 'forensic_accounting', ['forensic_accounting', 'data_analysis', 'ratiocination'],
    score, conf,
    `Revenue recognition anomaly: period-end concentration ${periodEndRevenuePct.toFixed(0)}%, next-period reversals ${(reversalRatio * 100).toFixed(0)}%, ` +
    `inventory mismatch: ${inventoryRevenueMismatch}. ` +
    `Anchors: PCAOB AS 2401 · IFAC ISA 240 · SEC Enforcement patterns (channel-stuffing).`,
    evidence);
};

// ── QUANTUM INTELLIGENCE ──────────────────────────────────────────────────────

const bayesianNetworkFusionApply = async (ctx: BrainContext): Promise<Finding> => {
  const findings = ctx.priorFindings;
  if (findings.length === 0) {
    return build('qi.bayesian_network_fusion', 'synthetic_intelligence', ['quantum_intelligence', 'inference', 'synthesis'],
      0, 0.2, 'No prior findings for Bayesian fusion.', []);
  }
  // Compute a simplified posterior P(ML | evidence) via log-odds accumulation.
  // Prior P(ML) = 0.05 for general population; updated per finding.
  let logOdds = Math.log(0.05 / 0.95);
  const evidence: string[] = [];
  for (const f of findings) {
    // Likelihood ratio: escalate → LR 8, flag → LR 3, clear → LR 0.5
    const lr = f.verdict === 'escalate' ? 8 : f.verdict === 'flag' ? 3 : 0.5;
    const weightedLr = Math.pow(lr, f.confidence);
    logOdds += Math.log(weightedLr);
  }
  const posterior = 1 / (1 + Math.exp(-logOdds));
  const escalations = findings.filter(f => f.verdict === 'escalate').length;
  const flags = findings.filter(f => f.verdict === 'flag').length;
  evidence.push(`Bayesian posterior P(ML): ${(posterior * 100).toFixed(1)}%`);
  evidence.push(`Prior: 5% · Updated over ${findings.length} findings (${escalations} escalations, ${flags} flags)`);
  if (posterior > 0.7) evidence.push('Posterior exceeds 70% — strong evidence convergence');
  if (posterior > 0.9) evidence.push('Posterior >90% — near-certain ML signal');
  const score = clamp(posterior, 0, 1);
  const conf = clamp(0.5 + 0.03 * findings.length, 0, 0.92);
  return build('qi.bayesian_network_fusion', 'synthetic_intelligence', ['quantum_intelligence', 'inference', 'synthesis'],
    score, conf,
    `Bayesian posterior fusion over ${findings.length} findings: P(ML)=${(posterior * 100).toFixed(1)}%. ` +
    `Prior P(ML)=5%; updated via log-odds accumulation with confidence weighting. ` +
    `Anchors: Bayesian AML scoring (FATF Typology Report 2021) · Variable elimination over directed acyclic graphs.`,
    evidence);
};

const ensembleUncertaintyQuantificationApply = async (ctx: BrainContext): Promise<Finding> => {
  const findings = ctx.priorFindings;
  const evidence: string[] = [];
  if (findings.length === 0) {
    return build('qi.ensemble_uncertainty_quantification', 'synthetic_intelligence', ['quantum_intelligence', 'introspection', 'data_analysis'],
      0, 0.2, 'No prior findings for uncertainty decomposition.', []);
  }
  const meanScore = findings.reduce((a, f) => a + f.score, 0) / findings.length;
  const variance = findings.reduce((a, f) => a + Math.pow(f.score - meanScore, 2), 0) / findings.length;
  const meanConf = findings.reduce((a, f) => a + f.confidence, 0) / findings.length;
  // Epistemic uncertainty: variance in scores (reducible with more data)
  const epistemic = clamp(variance * 4, 0, 1);
  // Aleatoric uncertainty: inverse of mean confidence (irreducible noise)
  const aleatoric = clamp(1 - meanConf, 0, 1);
  evidence.push(`Epistemic uncertainty (reducible): ${(epistemic * 100).toFixed(1)}% — score variance across ${findings.length} modes`);
  evidence.push(`Aleatoric uncertainty (irreducible): ${(aleatoric * 100).toFixed(1)}% — inverse of mean confidence`);
  if (epistemic > 0.4) evidence.push('High epistemic uncertainty — EDD warranted (more data collection needed)');
  if (aleatoric > 0.5) evidence.push('High aleatoric uncertainty — intrinsic data quality issue detected');
  const totalUncertainty = clamp(epistemic + aleatoric * 0.5, 0, 1);
  // Score: high uncertainty on high mean-score cases is still escalation-worthy
  const score = clamp(meanScore * (1 + epistemic * 0.3), 0, 1);
  return build('qi.ensemble_uncertainty_quantification', 'synthetic_intelligence', ['quantum_intelligence', 'introspection', 'data_analysis'],
    score, clamp(1 - totalUncertainty * 0.5, 0.25, 0.9),
    `Uncertainty decomposition: epistemic ${(epistemic * 100).toFixed(1)}%, aleatoric ${(aleatoric * 100).toFixed(1)}%. ` +
    `Mean score: ${meanScore.toFixed(3)}, variance: ${variance.toFixed(4)}. ` +
    `High epistemic → request EDD. High aleatoric → data quality remediation. ` +
    `Anchors: Bayesian deep learning (Gal & Ghahramani 2016) · FATF R.1 risk-based approach.`,
    evidence);
};

const markovChainRiskProjectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  const currentRiskScore = numOf(ctx, 'currentRiskScore', 0.1);
  const riskVelocity = numOf(ctx, 'riskScoreVelocity');
  // Simplified Markov: estimate n=3 step probability of entering high-risk state.
  // Transition matrix: P(high→high)=0.8, P(std→high)=0.2 + velocity, P(low→high)=0.05
  const baseTransition = currentRiskScore >= 0.6 ? 0.8 : currentRiskScore >= 0.3 ? 0.2 : 0.05;
  const velocityBoost = clamp(riskVelocity * 0.3, 0, 0.3);
  const p1 = clamp(baseTransition + velocityBoost, 0, 0.98);
  const p3 = clamp(1 - Math.pow(1 - p1, 3), 0, 1);
  evidence.push(`n=1 step transition probability to high-risk state: ${(p1 * 100).toFixed(1)}%`);
  evidence.push(`n=3 step projection: ${(p3 * 100).toFixed(1)}% probability of high-risk state within 3 periods`);
  if (riskVelocity > 0.1) evidence.push(`Risk velocity: +${(riskVelocity * 100).toFixed(1)}%/period — accelerating trajectory`);
  const priorEscalations = ctx.priorFindings.filter(f => f.verdict === 'escalate').length;
  if (priorEscalations >= 2) { evidence.push(`${priorEscalations} prior escalations increase transition probability`); }
  if (/escalat|high.?risk.*trajectory|risk.*trend|deteriorat/.test(ft)) { evidence.push('Narrative references escalating risk trajectory'); }
  const score = clamp(p3 * 0.8 + currentRiskScore * 0.2, 0, 1);
  const conf = clamp(0.5 + (priorEscalations * 0.07), 0.3, 0.88);
  return build('qi.markov_chain_risk_projection', 'synthetic_intelligence', ['quantum_intelligence', 'anticipation', 'inference'],
    score, conf,
    `Markov chain risk projection: current score ${(currentRiskScore * 100).toFixed(0)}%, n=3 high-risk probability ${(p3 * 100).toFixed(1)}%. ` +
    `Identifies latent risk trajectories that point-in-time scoring misses. ` +
    `Anchors: Markov chain AML modelling (BCBS Sound Management 2017) · FATF R.1.`,
    evidence);
};

const entropyAnomalyDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const txns = ev(ctx, 'transactions') as Array<{ amount?: number; counterpartyId?: string }>;
  const evidence: string[] = [];
  let score = 0;
  if (txns.length < 5) {
    return build('qi.entropy_anomaly_detection', 'synthetic_intelligence', ['quantum_intelligence', 'data_analysis', 'smartness'],
      0, 0.25, 'Insufficient transactions for entropy analysis (need ≥5).', []);
  }
  // Shannon entropy of amount distribution (bucket into 10 bins)
  const amounts = txns.map(t => t.amount ?? 0).filter(a => a > 0);
  const maxAmt = Math.max(...amounts);
  const bins = new Array(10).fill(0) as number[];
  for (const a of amounts) bins[Math.min(9, Math.floor((a / maxAmt) * 10))]!++;
  const total = amounts.length;
  let entropy = 0;
  for (const b of bins) { if (b > 0) { const p = b / total; entropy -= p * Math.log2(p); } }
  const maxEntropy = Math.log2(10);
  const normalizedEntropy = entropy / maxEntropy;
  // Low entropy (stereotyped) = anomalous, high entropy (chaotic) = anomalous
  // Baseline: 0.5–0.8 normalized entropy is expected for legitimate business
  const lowEntropyAnomaly = normalizedEntropy < 0.35;
  const highEntropyAnomaly = normalizedEntropy > 0.92;
  if (lowEntropyAnomaly) { score += 0.4; evidence.push(`Low Shannon entropy ${normalizedEntropy.toFixed(3)} — stereotyped/repetitive amounts (structuring indicator)`); }
  if (highEntropyAnomaly) { score += 0.35; evidence.push(`High Shannon entropy ${normalizedEntropy.toFixed(3)} — chaotic/random amounts (layering indicator)`); }
  // Counterparty entropy
  const cpIds = txns.map(t => t.counterpartyId ?? 'unknown');
  const cpCounts = new Map<string, number>();
  for (const id of cpIds) cpCounts.set(id, (cpCounts.get(id) ?? 0) + 1);
  const cpUnique = cpCounts.size;
  const cpConcentration = cpUnique === 1 ? 1 : 1 - (cpUnique / cpIds.length);
  if (cpConcentration > 0.7) { score += 0.2; evidence.push(`High counterparty concentration: ${cpUnique} unique counterparties in ${txns.length} transactions`); }
  evidence.push(`Shannon entropy (amounts): ${normalizedEntropy.toFixed(3)} (normal range: 0.5–0.8)`);
  score = clamp(score, 0, 1);
  return build('qi.entropy_anomaly_detection', 'synthetic_intelligence', ['quantum_intelligence', 'data_analysis', 'smartness'],
    score, clamp(0.5 + amounts.length * 0.008, 0, 0.9),
    `Shannon entropy analysis: ${amounts.length} amounts, normalized entropy=${normalizedEntropy.toFixed(3)}. ` +
    `Low entropy (<0.35) signals structuring; high entropy (>0.92) signals chaotic layering. ` +
    `Anchors: Shannon information theory · FinCEN structuring typology · FATF R.20.`,
    evidence);
};

// ── ANTICIPATION ──────────────────────────────────────────────────────────────

const regulatoryChangeImpactAssessmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const riskScorePreChange = numOf(ctx, 'currentRiskScore');
  const expectedThresholdChange = numOf(ctx, 'newRegulatoryThreshold');
  const customersAffected = numOf(ctx, 'portfolioCustomersAffectedPct');
  if (customersAffected > 10) { score += 0.3; evidence.push(`${customersAffected.toFixed(0)}% of portfolio transitions to EDD under new thresholds`); }
  else if (customersAffected > 3) { score += 0.15; evidence.push(`${customersAffected.toFixed(0)}% of portfolio affected by threshold change`); }
  if (expectedThresholdChange > 0 && riskScorePreChange > expectedThresholdChange) {
    score += 0.3; evidence.push(`Subject risk score ${(riskScorePreChange * 100).toFixed(0)}% exceeds incoming threshold ${(expectedThresholdChange * 100).toFixed(0)}% — file remediation needed before effective date`);
  }
  const daysToEffectiveDate = numOf(ctx, 'daysToEffectiveDate', 999);
  if (daysToEffectiveDate < 30) { score += 0.2; evidence.push(`${daysToEffectiveDate} days to effective date — urgent pre-emptive remediation window`); }
  if (/cbuae.*circular|fatf.*update|new.*regulation|directive.*effective/.test(ft)) { score += 0.1; evidence.push('Narrative references incoming regulatory change'); }
  score = clamp(score, 0, 1);
  return build('an.regulatory_change_impact_assessment', 'compliance_framework', ['anticipation', 'reasoning', 'ratiocination'],
    score, clamp(0.5 + (evidence.length * 0.06), 0, 0.88),
    `Regulatory change impact: ${customersAffected.toFixed(0)}% portfolio affected. Days to effective: ${daysToEffectiveDate}. ` +
    `Pre-emptive modelling enables file remediation before breach occurs rather than after. ` +
    `Anchors: CBUAE regulatory circulars · FATF 4th-round mutual evaluation follow-up · UAE FDL 10/2025.`,
    evidence);
};

const networkRestructuringPredictionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const designationAge = numOf(ctx, 'daysSinceDesignation');
  if (designationAge > 0 && designationAge < 90) { score += 0.35; evidence.push(`Entity designated ${designationAge} days ago — peak restructuring probability window (0–90 days)`); }
  const newNomineeDirectors = numOf(ctx, 'newNomineeDirectors30d');
  if (newNomineeDirectors >= 2) { score += 0.25; evidence.push(`${newNomineeDirectors} new nominee directors appointed within 30 days of designation`); }
  const newSpvIncorporations = numOf(ctx, 'newSpvIncorporations30d');
  if (newSpvIncorporations >= 1) { score += 0.2; evidence.push(`${newSpvIncorporations} new SPV(s) incorporated in adjacent jurisdictions post-designation`); }
  const connectedButUndesignated = numOf(ctx, 'connectedUndesignatedEntities');
  if (connectedButUndesignated >= 3) { score += 0.15; evidence.push(`${connectedButUndesignated} connected but undesignated entities may receive diverted assets`); }
  if (/restructur|new.*director|adjacent.*jurisdict|successor.*entity/.test(ft)) { score += 0.1; evidence.push('Narrative references network restructuring post-designation'); }
  score = clamp(score, 0, 1);
  return build('an.network_restructuring_prediction', 'network_science', ['anticipation', 'intelligence', 'reasoning'],
    score, clamp(0.45 + (evidence.length * 0.07), 0, 0.88),
    `Post-designation restructuring prediction: ${designationAge} days post-designation, ${newNomineeDirectors} new nominees, ${newSpvIncorporations} new SPVs. ` +
    `Sanctioned entities typically restructure within 90 days via nominee directors and adjacent-jurisdiction SPVs. ` +
    `Anchors: UN Panel of Experts (DPRK/Iran/Russia designation evasion) · OFAC 50% rule · FATF R.6.`,
    evidence);
};

const preSanctionPositioningDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const realEstatePurchases = numOf(ctx, 'recentRealEstatePurchasesNonFATF');
  if (realEstatePurchases >= 2) { score += 0.35; evidence.push(`${realEstatePurchases} rapid real-estate purchases in non-FATF jurisdictions — pre-sanction asset-flight indicator`); }
  const cryptoCashConversions = numOf(ctx, 'cryptoToCashOtcConversions30d');
  if (cryptoCashConversions >= 3) { score += 0.3; evidence.push(`${cryptoCashConversions} crypto-to-cash OTC conversions in 30 days — rapid de-risking from traceable assets`); }
  const entityDissolutions = numOf(ctx, 'voluntaryEntityDissolutions30d');
  if (entityDissolutions >= 1) { score += 0.2; evidence.push(`${entityDissolutions} voluntary entity dissolution(s) followed by re-registration — identity reset pattern`); }
  const jurisdictionShiftScore = numOf(ctx, 'jurisdictionShiftScore');
  if (jurisdictionShiftScore > 0.5) { score += 0.2; evidence.push(`Jurisdiction shift score ${jurisdictionShiftScore.toFixed(2)} — rapid movement to less-screened jurisdictions`); }
  if (/pre.?sanction|asset.*flight|otc.*crypto|non.*fatf.*real.*estate/.test(ft)) { score += 0.1; evidence.push('Narrative references pre-sanction positioning patterns'); }
  score = clamp(score, 0, 1);
  return build('an.pre_sanction_positioning_detection', 'geopolitical_risk', ['anticipation', 'geopolitical_awareness', 'intelligence'],
    score, clamp(0.45 + (evidence.length * 0.07), 0, 0.88),
    `Pre-sanction asset positioning: real-estate in non-FATF jurisdictions: ${realEstatePurchases}, OTC crypto-cash: ${cryptoCashConversions}, dissolutions: ${entityDissolutions}. ` +
    `Typical pattern: actors with advance designation knowledge liquidate traceable assets and move to opaque jurisdictions. ` +
    `Anchors: OFAC Advisory on Evasion Techniques 2022 · UN Panel of Experts · FATF R.6.`,
    evidence);
};

const seasonalMlPatternForecastingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const monthOfYear = numOf(ctx, 'monthOfYear', new Date().getMonth() + 1);
  // Ramadan/Hajj: typically months 3–4 (varies), back-to-school UAE: Aug-Sep (8-9), Q4 gold: Oct-Dec (10-12)
  const isRamadanWindow = monthOfYear >= 3 && monthOfYear <= 4;
  const isHajjWindow = monthOfYear >= 5 && monthOfYear <= 7;
  const isBackToSchoolUAE = monthOfYear === 8 || monthOfYear === 9;
  const isQ4GoldSeason = monthOfYear >= 10;
  if (isRamadanWindow) { score += 0.2; evidence.push('Ramadan cash-flow window — elevated hawala/informal transfer activity expected'); }
  if (isHajjWindow) { score += 0.15; evidence.push('Hajj season — elevated MVTS and cash courier flows to/from Saudi Arabia'); }
  if (isBackToSchoolUAE) { score += 0.15; evidence.push('UAE back-to-school season (Aug–Sep) — school-fee remittance spikes'); }
  if (isQ4GoldSeason) { score += 0.2; evidence.push('Q4 gold price volatility window — DPMS cash activity spike expected'); }
  const majorSportingEvent = (ctx.evidence as Record<string, unknown>).activeSportingEvent === true;
  if (majorSportingEvent) { score += 0.25; evidence.push('Active major sporting event — illegal betting cash flow surge period'); }
  const historicalSpikeMultiplier = numOf(ctx, 'historicalSpikeMultiplier', 1);
  if (historicalSpikeMultiplier > 1.5) { score += 0.15; evidence.push(`Historical spike multiplier ${historicalSpikeMultiplier.toFixed(1)}× in this period for this customer`); }
  if (/ramadan|hajj|school.*fee|gold.*season|sporting.*event/.test(ft)) { score += 0.1; evidence.push('Narrative references seasonal ML risk factors'); }
  score = clamp(score, 0, 1);
  return build('an.seasonal_ml_pattern_forecasting', 'behavioral_science', ['anticipation', 'data_analysis', 'smartness'],
    score, clamp(0.4 + (evidence.length * 0.06), 0, 0.85),
    `Seasonal ML risk forecast: month=${monthOfYear}. Active windows: Ramadan=${isRamadanWindow}, Hajj=${isHajjWindow}, UAE school=${isBackToSchoolUAE}, Q4 gold=${isQ4GoldSeason}, sporting=${majorSportingEvent}. ` +
    `Pre-emptive alerts before seasonal windows open rather than reacting after the spike. ` +
    `Anchors: CBUAE Guidance on Cash-Intensive Sectors · FATF R.16 MVTS · UAE DPMS Supervision 2023.`,
    evidence);
};

const typologyEvolutionTrackerApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const detectedTypologies = ev(ctx, 'detectedTypologies') as string[];
  const evolutionPredictions: string[] = [];
  // Map known typologies to their likely successor variants
  const evolutionMap: Record<string, string> = {
    smurfing: 'MVTS/hawala relay (smurfing disrupted by threshold monitoring)',
    structuring: 'in-kind transfers or crypto micro-payments',
    wire_layering: 'crypto chain-hopping with mixer usage',
    shell_company: 'DAOs or tokenised real-estate SPVs',
    trade_based_ml: 'e-commerce invoice manipulation (digital TBML)',
    hawala: 'P2P crypto OTC desks in non-KYC jurisdictions',
    pep_kickback: 'tokenised IP royalty streams or NFT wash trades',
  };
  for (const typology of detectedTypologies) {
    const successor = evolutionMap[typology.toLowerCase().replace(/[^a-z_]/g, '_')];
    if (successor) { evolutionPredictions.push(`${typology} → ${successor}`); score += 0.15; }
  }
  if (evolutionPredictions.length > 0) { evidence.push(`Predicted successor typologies: ${evolutionPredictions.join('; ')}`); }
  const suppressedControls = ev(ctx, 'recentlyEnhancedControls') as string[];
  if (suppressedControls.length >= 2) { score += 0.2; evidence.push(`${suppressedControls.length} recently enhanced controls — displacement effect likely`); }
  if (/typology.*evolv|successor.*schem|next.?gen.*launder/.test(ft)) { score += 0.1; evidence.push('Narrative references typology mutation or successor schemes'); }
  score = clamp(score, 0, 1);
  return build('an.typology_evolution_tracker', 'regulatory_aml', ['anticipation', 'intelligence', 'synthesis'],
    score, clamp(0.4 + (detectedTypologies.length * 0.06), 0, 0.85),
    `Typology evolution: ${detectedTypologies.length} typologies detected. Predictions: ${evolutionPredictions.length}. ` +
    `Controls displacement effect: enhanced controls in ${suppressedControls.length} areas. ` +
    `Anchors: FATF Typology Reports 2018–2024 · FinCEN Advisories · UNODC ML Threat Assessment.`,
    evidence);
};

// ── GEOPOLITICAL AWARENESS ────────────────────────────────────────────────────

const dualUseGoodsProliferationFinancingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const hsCodes = ev(ctx, 'hsCodes') as string[];
  // Dual-use HS code prefixes per EU Reg 2021/821 / US CCL
  const dualUseHsPrefixes = ['84', '85', '38', '29', '90', '87', '86', '93'];
  const flaggedHs = hsCodes.filter(h => dualUseHsPrefixes.some(p => h.startsWith(p)));
  if (flaggedHs.length >= 2) { score += 0.35; evidence.push(`${flaggedHs.length} dual-use HS codes detected: ${flaggedHs.slice(0, 3).join(', ')}`); }
  const missingEndUserCert = (ctx.evidence as Record<string, unknown>).missingEndUserCertificate === true;
  if (missingEndUserCert) { score += 0.3; evidence.push('End-user certificate absent — proliferation financing red flag per EU Reg 2021/821'); }
  const suspiciousShippingRoute = (ctx.evidence as Record<string, unknown>).suspiciousShippingRoute === true;
  if (suspiciousShippingRoute) { score += 0.25; evidence.push('Shipping route transits high-PF-risk jurisdiction or known transshipment hub'); }
  const uaeReExportHub = (ctx.evidence as Record<string, unknown>).uaeReExportNexus === true;
  if (uaeReExportHub) { score += 0.1; evidence.push('UAE re-export nexus — FATF R.7 applies; verify ultimate end-user'); }
  if (/dual.?use|proliferat|end.?user.*cert|export.*control|ccl|eu.*821/.test(ft)) { score += 0.1; evidence.push('Narrative references dual-use goods or export control requirements'); }
  score = clamp(score, 0, 1);
  return build('ga.dual_use_goods_proliferation_financing', 'geopolitical_risk', ['geopolitical_awareness', 'intelligence', 'reasoning'],
    score, clamp(0.5 + (evidence.length * 0.06), 0, 0.9),
    `Dual-use goods PF risk: ${flaggedHs.length} dual-use HS codes, EUC absent=${missingEndUserCert}, suspicious route=${suspiciousShippingRoute}. ` +
    `UAE is a major re-export hub — FATF R.7 targeted financial sanctions for proliferation financing applies. ` +
    `Anchors: EU Regulation 2021/821 · US Commerce Control List · FATF R.7 · CBUAE Guidance on PF 2023.`,
    evidence);
};

const deDollarizationCbdcRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const sanctionedCurrencyExposure = (ctx.evidence as Record<string, unknown>).alternativePaymentSystem as string | undefined;
  if (sanctionedCurrencyExposure) {
    score += 0.4;
    evidence.push(`Alternative payment system exposure: ${sanctionedCurrencyExposure} — potential sanctions bypass channel`);
  }
  const mBridgeExposure = (ctx.evidence as Record<string, unknown>).mBridgeExposure === true;
  if (mBridgeExposure) { score += 0.35; evidence.push('mBridge (CIPS/BIS cross-border CBDC) exposure — bypasses SWIFT/OFAC screening infrastructure'); }
  const cipsVolume = numOf(ctx, 'cipsTransactionVolumeUsd');
  if (cipsVolume > 100_000) { score += 0.25; evidence.push(`CIPS transaction volume: USD ${cipsVolume.toLocaleString()} — outside OFAC primary jurisdiction`); }
  const instexExposure = (ctx.evidence as Record<string, unknown>).instexExposure === true;
  if (instexExposure) { score += 0.2; evidence.push('INSTEX (Iran trade mechanism) exposure — EU instrument bypassing dollar-denominated screening'); }
  if (/de.?dollar|mbridge|cips|instex|cbdc.*sanction|rmb.*settl/.test(ft)) { score += 0.1; evidence.push('Narrative references de-dollarisation or CBDC-based sanctions evasion'); }
  score = clamp(score, 0, 1);
  return build('ga.de_dollarization_cbdc_risk', 'geopolitical_risk', ['geopolitical_awareness', 'anticipation', 'intelligence'],
    score, clamp(0.5 + (evidence.length * 0.06), 0, 0.9),
    `De-dollarisation / CBDC sanctions evasion: mBridge=${mBridgeExposure}, CIPS volume=$${cipsVolume.toLocaleString()}, INSTEX=${instexExposure}. ` +
    `Alternative payment rails bypass USD-denominated OFAC/EU screening channels — structural gap in international sanctions architecture. ` +
    `Anchors: OFAC Advisory on CIPS 2023 · EU Council Regulation on INSTEX · BIS mBridge Whitepaper 2023.`,
    evidence);
};

const briProjectNexusAssessmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const briJurisdictions = ev(ctx, 'counterpartyJurisdictions') as string[];
  // BRI high-risk jurisdictions with documented ML/TF risks per UN ODC / FATF
  const briHighRisk = ['PK', 'MM', 'KH', 'LA', 'KZ', 'UZ', 'ZM', 'NG', 'ET', 'BI', 'SD'];
  const briHits = briJurisdictions.filter(j => briHighRisk.includes(j.toUpperCase()));
  if (briHits.length >= 2) { score += 0.35; evidence.push(`BRI-connected jurisdictions: ${briHits.join(', ')} — elevated ML/TF risk per UN ODC`); }
  const contractorInvoiceVolatility = numOf(ctx, 'contractorInvoiceVariancePct');
  if (contractorInvoiceVolatility > 30) { score += 0.25; evidence.push(`Contractor invoice variance ${contractorInvoiceVolatility.toFixed(0)}% — inflated-invoice BRI ML pattern`); }
  const stateDirectedFlow = (ctx.evidence as Record<string, unknown>).stateDirectedFinancialFlow === true;
  if (stateDirectedFlow) { score += 0.2; evidence.push('State-directed financial flows — potential state-sponsored ML channel per FATF'); }
  const cpecNexus = (ctx.evidence as Record<string, unknown>).cpecNexus === true;
  if (cpecNexus) { score += 0.15; evidence.push('CPEC (China-Pakistan Economic Corridor) nexus — UN ODC documented ML risks'); }
  if (/belt.*road|bri|cpec|infrastructure.*debt|state.*invest/.test(ft)) { score += 0.1; evidence.push('Narrative references BRI infrastructure financing'); }
  score = clamp(score, 0, 1);
  return build('ga.bri_project_nexus_assessment', 'geopolitical_risk', ['geopolitical_awareness', 'intelligence'],
    score, clamp(0.45 + (evidence.length * 0.06), 0, 0.88),
    `BRI project nexus: ${briHits.length} high-risk BRI jurisdictions, invoice variance ${contractorInvoiceVolatility.toFixed(0)}%, state-directed=${stateDirectedFlow}. ` +
    `BRI infrastructure in FATF high-risk jurisdictions linked to inflated invoicing and state-directed ML channels. ` +
    `Anchors: UN ODC BRI Report 2023 · FATF R.13 Correspondent Banking · World Bank BRI Integrity Risk Assessment.`,
    evidence);
};

const cryptoStateActorEvasionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const mixerUsage = (ctx.evidence as Record<string, unknown>).cryptoMixerOrTumblerUsage === true;
  if (mixerUsage) { score += 0.4; evidence.push('Crypto mixer/tumbler usage detected — state-actor DPRK Lazarus Group primary technique'); }
  const chainHopCount = numOf(ctx, 'blockchainChainHopCount');
  if (chainHopCount >= 4) { score += 0.3; evidence.push(`${chainHopCount}-hop chain sequence detected — OFAC Virtual Currency Advisory evasion typology`); }
  const p2pExchangeNonCompliant = (ctx.evidence as Record<string, unknown>).p2pExchangeNonCompliantJurisdiction === true;
  if (p2pExchangeNonCompliant) { score += 0.25; evidence.push('P2P exchange off-ramp in non-compliant jurisdiction — FinCEN FIN-2022-Alert001 typology'); }
  const otcNoCdd = (ctx.evidence as Record<string, unknown>).otcDeskLargeTransactionNoCdd === true;
  if (otcNoCdd) { score += 0.2; evidence.push('OTC desk accepting large crypto-for-cash without CDD — OFAC/FinCEN flagged typology'); }
  const sdnDesignatedWallets = numOf(ctx, 'sdnDesignatedWalletHops');
  if (sdnDesignatedWallets >= 2) { score += 0.35; evidence.push(`${sdnDesignatedWallets} hops from OFAC SDN-designated wallets`); }
  if (/lazarus|dprk|iran.*irgc|russian.*oligarch|state.*actor.*crypto|mixer.*tumbler/.test(ft)) { score += 0.1; evidence.push('Narrative references state-actor crypto evasion patterns'); }
  score = clamp(score, 0, 1);
  return build('ga.crypto_state_actor_evasion', 'geopolitical_risk', ['geopolitical_awareness', 'intelligence', 'reasoning'],
    score, clamp(0.55 + (evidence.length * 0.05), 0, 0.95),
    `State-actor crypto evasion: mixer=${mixerUsage}, chain-hops=${chainHopCount}, P2P non-compliant=${p2pExchangeNonCompliant}, OTC no-CDD=${otcNoCdd}, SDN wallet hops=${sdnDesignatedWallets}. ` +
    `DPRK Lazarus, Iranian IRGC, and Russian oligarch typologies per OFAC SDN designations and UN Panel of Experts. ` +
    `Anchors: OFAC Virtual Currency Advisory 2021 · FinCEN FIN-2022-Alert001 · UN Security Council DPRK Panel 2024.`,
    evidence);
};

// ── EXPORT ────────────────────────────────────────────────────────────────────

export const WAVE13_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  'fa.journal_entry_timing_analysis':         journalEntryTimingAnalysisApply,
  'fa.round_dollar_clustering':               roundDollarClusteringApply,
  'fa.duplicate_transaction_detection':       duplicateTransactionDetectionApply,
  'fa.shell_company_financial_signature':     shellCompanyFinancialSignatureApply,
  'fa.transfer_pricing_manipulation':         transferPricingManipulationApply,
  'fa.revenue_recognition_anomaly':           revenueRecognitionAnomalyApply,
  'qi.bayesian_network_fusion':               bayesianNetworkFusionApply,
  'qi.ensemble_uncertainty_quantification':   ensembleUncertaintyQuantificationApply,
  'qi.markov_chain_risk_projection':          markovChainRiskProjectionApply,
  'qi.entropy_anomaly_detection':             entropyAnomalyDetectionApply,
  'an.regulatory_change_impact_assessment':   regulatoryChangeImpactAssessmentApply,
  'an.network_restructuring_prediction':      networkRestructuringPredictionApply,
  'an.pre_sanction_positioning_detection':    preSanctionPositioningDetectionApply,
  'an.seasonal_ml_pattern_forecasting':       seasonalMlPatternForecastingApply,
  'an.typology_evolution_tracker':            typologyEvolutionTrackerApply,
  'ga.dual_use_goods_proliferation_financing': dualUseGoodsProliferationFinancingApply,
  'ga.de_dollarization_cbdc_risk':            deDollarizationCbdcRiskApply,
  'ga.bri_project_nexus_assessment':          briProjectNexusAssessmentApply,
  'ga.crypto_state_actor_evasion':            cryptoStateActorEvasionApply,
};
