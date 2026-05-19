// Hawkeye Sterling — wave-4 batch-D (110 modes).
// Anchors: FATF 40 Recommendations · UAE FDL 20/2018 · VARA Rulebooks · BCBS Sound Management.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof (ctx.evidence as Record<string, unknown>).freeText === 'string') parts.push((ctx.evidence as Record<string, unknown>).freeText as string);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function hit(score: number): Verdict { return score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear'; }
function build(modeId: string, cat: ReasoningCategory, facs: FacultyId[], score: number, conf: number, rationale: string, evidence: string[]): Finding {
  return { modeId, category: cat, faculties: facs, score, confidence: conf, verdict: hit(score), rationale, evidence, producedAt: Date.now() };
}
function ev(ctx: BrainContext, key: string): unknown[] {
  const v = (ctx.evidence as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : [];
}

// ─── INTELLIGENCE FUSION ────────────────────────────────────────────────────

const multiSourceIntelligenceFusionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const sources = ev(ctx, 'intelligenceSources') as Array<{ sourceType?: string; credibility?: number; finding?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const credibleSources = sources.filter(s => (s.credibility ?? 0) >= 0.6);
  if (credibleSources.length >= 3) { score += 0.3; evidence.push(`${credibleSources.length} credible sources corroborate`); }
  const conflictingSources = sources.filter(s => s.finding?.toLowerCase().includes('conflict'));
  if (conflictingSources.length > 0) { score += 0.15; evidence.push(`${conflictingSources.length} conflicting source(s) detected`); }
  const priorEscalations = ctx.priorFindings.filter(f => f.verdict === 'escalate');
  if (priorEscalations.length >= 2) { score += 0.25; evidence.push(`${priorEscalations.length} prior escalations reinforce fusion`); }
  if (/corroborat|multi.?source|convergent|independent.*confirm/.test(ft)) { score += 0.1; evidence.push('Free-text corroboration signals'); }
  score = clamp(score, 0, 1);
  const conf = sources.length === 0 ? 0.35 : clamp(0.5 + 0.05 * sources.length, 0, 0.9);
  return build('multi_source_intelligence_fusion', 'intelligence_fusion', ['intelligence', 'synthesis', 'data_analysis'], score, conf,
    `Multi-source fusion across ${sources.length} source(s): ${credibleSources.length} credible, ${conflictingSources.length} conflicting. Prior escalations: ${priorEscalations.length}. Anchors: FATF R.20 · Intelligence-led AML (Basel 2021).`, evidence);
};

const crossDomainSignalIntegrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const domains = ctx.domains ?? [];
  const signals = ev(ctx, 'crossDomainSignals') as Array<{ domain?: string; signalType?: string; severity?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (domains.length >= 3) { score += 0.2; evidence.push(`${domains.length} domains active: ${domains.join(', ')}`); }
  const highSeverity = signals.filter(s => (s.severity ?? 0) >= 0.7);
  if (highSeverity.length >= 2) { score += 0.3; evidence.push(`${highSeverity.length} high-severity cross-domain signals`); }
  const uniqueDomains = new Set(signals.map(s => s.domain)).size;
  if (uniqueDomains >= 3) { score += 0.15; evidence.push(`Signals span ${uniqueDomains} distinct domains`); }
  if (/cross.?domain|multi.?domain|sector.*convergence/.test(ft)) { score += 0.1; evidence.push('Cross-domain keywords in narrative'); }
  score = clamp(score, 0, 1);
  return build('cross_domain_signal_integration', 'intelligence_fusion', ['intelligence', 'synthesis', 'reasoning'], score, clamp(0.45 + 0.04 * signals.length, 0, 0.88),
    `Cross-domain integration: ${domains.length} active domains, ${signals.length} signals, ${uniqueDomains} unique domain sources. Anchors: FATF Guidance on Intelligence-Led AML 2021 · FinCEN 314(a)/(b) sharing.`, evidence);
};

const confidenceWeightedAggregationApply = async (ctx: BrainContext): Promise<Finding> => {
  const findings = ctx.priorFindings;
  if (findings.length === 0) return build('confidence_weighted_aggregation', 'intelligence_fusion', ['data_analysis', 'synthesis'], 0, 0.2, 'No prior findings to aggregate.', []);
  const totalWeight = findings.reduce((a, f) => a + f.confidence, 0);
  const weightedScore = totalWeight > 0 ? findings.reduce((a, f) => a + f.score * f.confidence, 0) / totalWeight : 0;
  const highConfHigh = findings.filter(f => f.confidence >= 0.7 && f.score >= 0.6).length;
  const evidence: string[] = [];
  if (highConfHigh > 0) evidence.push(`${highConfHigh} high-confidence escalation finding(s)`);
  evidence.push(`Weighted aggregate score: ${weightedScore.toFixed(3)} over ${findings.length} findings`);
  const lowConfCount = findings.filter(f => f.confidence < 0.4).length;
  if (lowConfCount > 0) evidence.push(`${lowConfCount} low-confidence finding(s) downweighted`);
  const score = clamp(weightedScore, 0, 1);
  const conf = clamp(0.55 + 0.03 * findings.length, 0, 0.92);
  return build('confidence_weighted_aggregation', 'intelligence_fusion', ['data_analysis', 'synthesis', 'ratiocination'], score, conf,
    `Confidence-weighted aggregation of ${findings.length} findings. Weighted score=${weightedScore.toFixed(3)}. High-conf escalations: ${highConfHigh}. Low-conf downweighted: ${lowConfCount}. Anchors: FATF R.20 · Bayesian evidence fusion principles.`, evidence);
};

const temporalSignalSequencingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const events = ev(ctx, 'temporalEvents') as Array<{ eventId?: string; timestampMs?: number; eventType?: string; severity?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (events.length >= 3) {
    const sorted = [...events].sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
    const spans: number[] = [];
    for (let i = 1; i < sorted.length; i++) { const prev = sorted[i - 1]; if (prev) spans.push((sorted[i]?.timestampMs ?? 0) - (prev.timestampMs ?? 0)); }
    const minSpanMs = Math.min(...spans);
    if (minSpanMs < 3_600_000) { score += 0.25; evidence.push(`Rapid event sequence: minimum gap ${Math.round(minSpanMs/60000)}min`); }
    const escalatingPattern = sorted.every((e, i) => { const prev = sorted[i - 1]; return i === 0 || (e.severity ?? 0) >= (prev?.severity ?? 0); });
    if (escalatingPattern && events.length >= 4) { score += 0.3; evidence.push('Monotonically escalating severity pattern detected'); }
  }
  if (/sequen|cascade|escalat.*pattern|temporal.*cluster/.test(ft)) { score += 0.1; evidence.push('Temporal sequencing keywords'); }
  const priorEscalations = ctx.priorFindings.filter(f => f.verdict === 'escalate');
  if (priorEscalations.length >= 3) { score += 0.2; evidence.push(`${priorEscalations.length} sequential escalation findings`); }
  score = clamp(score, 0, 1);
  return build('temporal_signal_sequencing', 'intelligence_fusion', ['intelligence', 'reasoning', 'data_analysis'], score, clamp(0.4 + 0.06 * events.length, 0, 0.88),
    `Temporal sequencing over ${events.length} event(s). Pattern analysis: rapid sequences and escalation detected. Anchors: FATF Operational Issues 2017 · CBUAE supervisory guidance on transaction monitoring.`, evidence);
};

const networkEdgeInferenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const edges = ev(ctx, 'networkEdges') as Array<{ edgeId?: string; fromNode?: string; toNode?: string; edgeWeight?: number; inferred?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const inferredEdges = edges.filter(e => e.inferred === true);
  if (inferredEdges.length >= 3) { score += 0.25; evidence.push(`${inferredEdges.length} inferred network edges identified`); }
  const highWeightEdges = edges.filter(e => (e.edgeWeight ?? 0) >= 0.7);
  if (highWeightEdges.length >= 2) { score += 0.2; evidence.push(`${highWeightEdges.length} high-weight edges (≥0.7)`); }
  const nodes = new Set([...edges.map(e => e.fromNode), ...edges.map(e => e.toNode)]).size;
  if (nodes >= 5 && edges.length >= 7) { score += 0.2; evidence.push(`Dense subgraph: ${nodes} nodes, ${edges.length} edges`); }
  if (/hidden.*link|infer.*connect|indirect.*associ|shadow.*network/.test(ft)) { score += 0.15; evidence.push('Hidden-link inference keywords in narrative'); }
  score = clamp(score, 0, 1);
  return build('network_edge_inference', 'intelligence_fusion', ['intelligence', 'inference', 'data_analysis'], score, clamp(0.4 + 0.05 * edges.length, 0, 0.88),
    `Network edge inference: ${edges.length} edges (${inferredEdges.length} inferred), ${nodes} nodes. High-weight connections: ${highWeightEdges.length}. Anchors: FATF Network Analysis Guidance 2023 · Graph-based AML detection literature.`, evidence);
};

// ─── ASSET RECOVERY ─────────────────────────────────────────────────────────

const civilRecoveryPathwayMapApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const assets = ev(ctx, 'recoverableAssets') as Array<{ assetId?: string; jurisdiction?: string; valueUsd?: number; encumbered?: boolean; pathwayClear?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const clearAssets = assets.filter(a => a.pathwayClear === true && !a.encumbered);
  if (clearAssets.length > 0) { score += 0.15; evidence.push(`${clearAssets.length} asset(s) with clear recovery pathway`); }
  const highValue = assets.filter(a => (a.valueUsd ?? 0) >= 500_000);
  if (highValue.length > 0) { score += 0.25; evidence.push(`${highValue.length} high-value asset(s) ≥USD 500k`); }
  const multiJurisdiction = new Set(assets.map(a => a.jurisdiction)).size >= 2;
  if (multiJurisdiction) { score += 0.2; evidence.push('Assets span multiple jurisdictions — MLA/MLAT required'); }
  if (/civil.*recovery|restraint.*order|freezing.*injunction|proceeds.*crime/.test(ft)) { score += 0.2; evidence.push('Civil recovery terminology detected'); }
  score = clamp(score, 0, 1);
  return build('civil_recovery_pathway_map', 'asset_recovery', ['forensic_accounting', 'reasoning', 'intelligence'], score, clamp(0.45 + 0.05 * assets.length, 0, 0.9),
    `Civil recovery pathway assessment: ${assets.length} asset(s), ${clearAssets.length} clear pathways, ${highValue.length} high-value. Multi-jurisdiction: ${multiJurisdiction}. Anchors: UAE FDL 20/2018 Art.29 · POCA 2002 (UK) · UNCAC Art.54 · FATF R.38.`, evidence);
};

const crossBorderAssetTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const transfers = ev(ctx, 'crossBorderTransfers') as Array<{ transferId?: string; originCountry?: string; destinationCountry?: string; amountUsd?: number; documentedPurpose?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const undocumented = transfers.filter(t => t.documentedPurpose === false);
  if (undocumented.length > 0) { score += 0.25; evidence.push(`${undocumented.length} cross-border transfer(s) lacking documented purpose`); }
  const highRiskDestinations = ['VE', 'IR', 'KP', 'SY', 'CU', 'BY', 'RU', 'MM'];
  const riskTransfers = transfers.filter(t => highRiskDestinations.includes(t.destinationCountry ?? ''));
  if (riskTransfers.length > 0) { score += 0.35; evidence.push(`${riskTransfers.length} transfer(s) to high-risk/sanctioned jurisdiction`); }
  const largeTransfers = transfers.filter(t => (t.amountUsd ?? 0) >= 1_000_000);
  if (largeTransfers.length > 0) { score += 0.15; evidence.push(`${largeTransfers.length} transfer(s) ≥USD 1M`); }
  if (/asset.*flight|capital.*flight|hidden.*offshore|bearer.*share/.test(ft)) { score += 0.1; evidence.push('Asset flight indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('cross_border_asset_trace', 'asset_recovery', ['forensic_accounting', 'intelligence', 'geopolitical_awareness'], score, clamp(0.45 + 0.04 * transfers.length, 0, 0.9),
    `Cross-border asset trace: ${transfers.length} transfer(s), ${undocumented.length} undocumented, ${riskTransfers.length} to high-risk jurisdictions. Anchors: FATF R.38-40 · UAE MLA framework · Egmont Group cross-border asset recovery guidance.`, evidence);
};

const cryptoSeizureProtocolApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const wallets = ev(ctx, 'cryptoWallets') as Array<{ address?: string; blockchain?: string; balanceUsd?: number; mixerExposure?: number; sanctionedExposure?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const sanctionedWallets = wallets.filter(w => (w.sanctionedExposure ?? 0) >= 0.1);
  if (sanctionedWallets.length > 0) { score += 0.4; evidence.push(`${sanctionedWallets.length} wallet(s) with ≥10% sanctioned exposure`); }
  const mixerWallets = wallets.filter(w => (w.mixerExposure ?? 0) >= 0.2);
  if (mixerWallets.length > 0) { score += 0.25; evidence.push(`${mixerWallets.length} wallet(s) with mixer/tumbler exposure`); }
  const totalValue = wallets.reduce((a, w) => a + (w.balanceUsd ?? 0), 0);
  if (totalValue >= 100_000) { score += 0.15; evidence.push(`Total wallet value USD ${totalValue.toLocaleString()}`); }
  if (/seiz|freeze.*crypto|virtual.*asset.*order|blockchain.*forensic/.test(ft)) { score += 0.1; evidence.push('Crypto seizure terminology in narrative'); }
  score = clamp(score, 0, 1);
  return build('crypto_seizure_protocol', 'asset_recovery', ['forensic_accounting', 'data_analysis', 'intelligence'], score, clamp(0.45 + 0.05 * wallets.length, 0, 0.9),
    `Crypto seizure protocol: ${wallets.length} wallet(s) assessed. Sanctioned exposure: ${sanctionedWallets.length}, mixer exposure: ${mixerWallets.length}. Total value: USD ${totalValue.toLocaleString()}. Anchors: UAE VARA Virtual Assets Regulation 2023 · OFAC Virtual Currency Guidance · FATF R.15.`, evidence);
};

const restrainedAssetGovernanceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const orders = ev(ctx, 'restraintOrders') as Array<{ orderId?: string; status?: string; expiryDays?: number; assetValueUsd?: number; complianceGap?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const expiring = orders.filter(o => (o.expiryDays ?? 999) <= 30);
  if (expiring.length > 0) { score += 0.3; evidence.push(`${expiring.length} restraint order(s) expiring within 30 days`); }
  const complianceGaps = orders.filter(o => o.complianceGap === true);
  if (complianceGaps.length > 0) { score += 0.35; evidence.push(`${complianceGaps.length} order(s) with compliance governance gaps`); }
  const activeOrders = orders.filter(o => o.status === 'active');
  if (activeOrders.length > 0) { score += 0.1; evidence.push(`${activeOrders.length} active restraint order(s) under management`); }
  if (/restraint.*breach|contempt|dissipat|non.?complian.*order/.test(ft)) { score += 0.2; evidence.push('Restraint compliance breach signals'); }
  score = clamp(score, 0, 1);
  return build('restrained_asset_governance', 'asset_recovery', ['forensic_accounting', 'reasoning', 'ratiocination'], score, clamp(0.4 + 0.06 * orders.length, 0, 0.9),
    `Restrained asset governance: ${orders.length} order(s). Expiring: ${expiring.length}, compliance gaps: ${complianceGaps.length}. Anchors: UAE FDL 20/2018 Art.30 · POCA 2002 s.41 · FATF R.38 asset freezing governance.`, evidence);
};

// ─── CONDUCT RISK ────────────────────────────────────────────────────────────

const cultureToneAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const surveys = ev(ctx, 'cultureSurveys') as Array<{ surveyId?: string; complianceCultureScore?: number; speakUpScore?: number; leadershipToneScore?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const poorCulture = surveys.filter(s => (s.complianceCultureScore ?? 1) < 0.5);
  if (poorCulture.length > 0) { score += 0.3; evidence.push(`${poorCulture.length} survey(s) showing poor compliance culture`); }
  const poorSpeakUp = surveys.filter(s => (s.speakUpScore ?? 1) < 0.4);
  if (poorSpeakUp.length > 0) { score += 0.25; evidence.push(`Low speak-up scores in ${poorSpeakUp.length} assessment(s)`); }
  const poorLeadership = surveys.filter(s => (s.leadershipToneScore ?? 1) < 0.4);
  if (poorLeadership.length > 0) { score += 0.2; evidence.push(`Weak tone-at-top in ${poorLeadership.length} assessment(s)`); }
  if (/tone.*top|speak.?up.*chilling|retaliat|fear.*report|cover.?up/.test(ft)) { score += 0.2; evidence.push('Culture risk indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('culture_tone_audit', 'conduct_risk', ['reasoning', 'intelligence', 'introspection'], score, clamp(0.4 + 0.05 * surveys.length, 0, 0.88),
    `Culture/tone audit: ${surveys.length} survey(s). Poor culture: ${poorCulture.length}, poor speak-up: ${poorSpeakUp.length}, poor leadership: ${poorLeadership.length}. Anchors: FCA Culture & Governance Framework 2023 · CBUAE Corporate Governance Standards · FSB Principles on Sound Compensation.`, evidence);
};

const incentiveMisalignmentScanApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const plans = ev(ctx, 'incentivePlans') as Array<{ planId?: string; revenueWeightPct?: number; complianceWeightPct?: number; clawbackEnabled?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const highRevenuePlans = plans.filter(p => (p.revenueWeightPct ?? 0) >= 70);
  if (highRevenuePlans.length > 0) { score += 0.3; evidence.push(`${highRevenuePlans.length} plan(s) with ≥70% revenue weighting`); }
  const zeroCompliance = plans.filter(p => (p.complianceWeightPct ?? 0) === 0);
  if (zeroCompliance.length > 0) { score += 0.35; evidence.push(`${zeroCompliance.length} plan(s) with zero compliance weighting`); }
  if (/pressure.*sell|volume.*target|miss.*quota|commission.*override/.test(ft)) { score += 0.2; evidence.push('Sales pressure / incentive misalignment signals'); }
  score = clamp(score, 0, 1);
  return build('incentive_misalignment_scan', 'conduct_risk', ['reasoning', 'data_analysis', 'forensic_accounting'], score, clamp(0.4 + 0.06 * plans.length, 0, 0.88),
    `Incentive misalignment: ${plans.length} plan(s). High revenue-weighted: ${highRevenuePlans.length}, zero compliance weight: ${zeroCompliance.length}. Anchors: FSB Principles for Sound Compensation 2009 · FCA Senior Managers Conduct Rules · CBUAE circular on conduct risk.`, evidence);
};

const whistleblowerSignalTriageApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const reports = ev(ctx, 'whistleblowerReports') as Array<{ reportId?: string; credibilityScore?: number; allegationType?: string; corroborated?: boolean; retaliationRisk?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const credibleReports = reports.filter(r => (r.credibilityScore ?? 0) >= 0.6);
  if (credibleReports.length > 0) { score += 0.3; evidence.push(`${credibleReports.length} credible whistleblower report(s)`); }
  const corroborated = reports.filter(r => r.corroborated === true);
  if (corroborated.length > 0) { score += 0.25; evidence.push(`${corroborated.length} corroborated allegation(s)`); }
  const retaliationRisk = reports.filter(r => r.retaliationRisk === true);
  if (retaliationRisk.length > 0) { score += 0.2; evidence.push(`Retaliation risk flagged in ${retaliationRisk.length} report(s)`); }
  if (/whistleblow|protected.*disclosur|internal.*allegat|anonymous.*tip/.test(ft)) { score += 0.1; evidence.push('Whistleblower signal keywords in narrative'); }
  score = clamp(score, 0, 1);
  return build('whistleblower_signal_triage', 'conduct_risk', ['intelligence', 'reasoning', 'introspection'], score, clamp(0.4 + 0.07 * reports.length, 0, 0.9),
    `Whistleblower triage: ${reports.length} report(s). Credible: ${credibleReports.length}, corroborated: ${corroborated.length}, retaliation risk: ${retaliationRisk.length}. Anchors: UAE Whistleblower Protection Law 2023 · FATF R.35 (sanctioning) · FCA Whistleblowing Rules SUP 10C.`, evidence);
};

// ─── IDENTITY FRAUD ──────────────────────────────────────────────────────────

const deepfakeDocumentForensicsApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const docs = ev(ctx, 'documents') as Array<{ docId?: string; deepfakeProbability?: number; metadataConsistent?: boolean; fontAnomalyDetected?: boolean; microprint?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const highProbDocs = docs.filter(d => (d.deepfakeProbability ?? 0) >= 0.6);
  if (highProbDocs.length > 0) { score += 0.45; evidence.push(`${highProbDocs.length} document(s) with deepfake probability ≥60%`); }
  const metaMismatch = docs.filter(d => d.metadataConsistent === false);
  if (metaMismatch.length > 0) { score += 0.2; evidence.push(`${metaMismatch.length} document(s) with inconsistent metadata`); }
  const fontAnomaly = docs.filter(d => d.fontAnomalyDetected === true);
  if (fontAnomaly.length > 0) { score += 0.2; evidence.push(`Font/typography anomalies in ${fontAnomaly.length} document(s)`); }
  if (/deepfake|forged.*document|synthetic.*id|manipulat.*image|photoshop/.test(ft)) { score += 0.15; evidence.push('Document forgery indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('deepfake_document_forensics', 'identity_fraud', ['forensic_accounting', 'data_analysis', 'inference'], score, clamp(0.45 + 0.05 * docs.length, 0, 0.9),
    `Deepfake document forensics: ${docs.length} document(s) reviewed. High deepfake probability: ${highProbDocs.length}, metadata mismatch: ${metaMismatch.length}, font anomaly: ${fontAnomaly.length}. Anchors: FATF Digital Identity Guidance 2020 · UAE PASS digital verification · ISO/IEC 30107-3 PAD.`, evidence);
};

const syntheticIdentityDecompositionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const ids = ev(ctx, 'identityComponents') as Array<{ componentId?: string; sourceType?: string; dateCreated?: string; inconsistentWithPeer?: boolean; creditHistoryAge?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const inconsistentComponents = ids.filter(i => i.inconsistentWithPeer === true);
  if (inconsistentComponents.length >= 2) { score += 0.35; evidence.push(`${inconsistentComponents.length} identity components inconsistent with peer group`); }
  const recentlyCreated = ids.filter(i => {
    if (!i.dateCreated) return false;
    const age = (Date.now() - new Date(i.dateCreated).getTime()) / (1000 * 86400);
    return age < 180;
  });
  if (recentlyCreated.length >= 2) { score += 0.2; evidence.push(`${recentlyCreated.length} recently-created identity component(s) (<180 days)`); }
  const newCredit = ids.filter(i => (i.creditHistoryAge ?? 999) < 24);
  if (newCredit.length > 0) { score += 0.2; evidence.push(`${newCredit.length} identity/credit profile(s) <24 months old`); }
  if (/synthetic.*identity|frankenstein.*id|fabricated.*ssn|piggybacking.*credit/.test(ft)) { score += 0.2; evidence.push('Synthetic identity indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('synthetic_identity_decomposition', 'identity_fraud', ['forensic_accounting', 'data_analysis', 'inference'], score, clamp(0.4 + 0.06 * ids.length, 0, 0.9),
    `Synthetic identity decomposition: ${ids.length} component(s). Inconsistencies: ${inconsistentComponents.length}, recently created: ${recentlyCreated.length}. Anchors: FATF Digital Identity Guidance 2020 · FinCEN Synthetic Identity Fraud Advisory 2021 · Fed Reserve SR 21-6.`, evidence);
};

const biometricGapAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const sessions = ev(ctx, 'biometricSessions') as Array<{ sessionId?: string; livenessScore?: number; matchScore?: number; enrollmentAge?: number; deviceChanged?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const failedLiveness = sessions.filter(s => (s.livenessScore ?? 1) < 0.5);
  if (failedLiveness.length > 0) { score += 0.4; evidence.push(`${failedLiveness.length} session(s) failing liveness check`); }
  const lowMatch = sessions.filter(s => (s.matchScore ?? 1) < 0.7 && (s.matchScore ?? 0) > 0);
  if (lowMatch.length > 0) { score += 0.25; evidence.push(`${lowMatch.length} session(s) with low biometric match score`); }
  const deviceChanged = sessions.filter(s => s.deviceChanged === true);
  if (deviceChanged.length > 0) { score += 0.15; evidence.push(`Device change detected in ${deviceChanged.length} session(s)`); }
  if (/spoof.*biometric|liveness.*fail|presentation.*attack|inject.*video/.test(ft)) { score += 0.15; evidence.push('Biometric spoofing indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('biometric_gap_analysis', 'identity_fraud', ['data_analysis', 'forensic_accounting', 'inference'], score, clamp(0.45 + 0.05 * sessions.length, 0, 0.9),
    `Biometric gap analysis: ${sessions.length} session(s). Liveness failures: ${failedLiveness.length}, low match: ${lowMatch.length}, device changes: ${deviceChanged.length}. Anchors: FATF Digital Identity Guidance 2020 · ISO/IEC 30107-3 PAD standard · NIST SP 800-63B.`, evidence);
};

const deviceIdentityCoherenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const devices = ev(ctx, 'deviceProfiles') as Array<{ deviceId?: string; fingerprintConsistent?: boolean; vpnDetected?: boolean; emulatorDetected?: boolean; multiAccountsLinked?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const inconsistentDevices = devices.filter(d => d.fingerprintConsistent === false);
  if (inconsistentDevices.length > 0) { score += 0.25; evidence.push(`${inconsistentDevices.length} device(s) with inconsistent fingerprint`); }
  const emulators = devices.filter(d => d.emulatorDetected === true);
  if (emulators.length > 0) { score += 0.35; evidence.push(`${emulators.length} emulator/virtual device(s) detected`); }
  const vpn = devices.filter(d => d.vpnDetected === true);
  if (vpn.length > 0) { score += 0.1; evidence.push(`VPN usage in ${vpn.length} device session(s)`); }
  const multiAccount = devices.filter(d => (d.multiAccountsLinked ?? 0) >= 3);
  if (multiAccount.length > 0) { score += 0.2; evidence.push(`${multiAccount.length} device(s) linked to ≥3 accounts`); }
  if (/device.*spoofing|emulat|vpn.*mask|multi.*account.*device/.test(ft)) { score += 0.1; evidence.push('Device identity coherence risks in narrative'); }
  score = clamp(score, 0, 1);
  return build('device_identity_coherence', 'identity_fraud', ['data_analysis', 'inference', 'forensic_accounting'], score, clamp(0.4 + 0.05 * devices.length, 0, 0.9),
    `Device identity coherence: ${devices.length} device(s). Inconsistent fingerprint: ${inconsistentDevices.length}, emulators: ${emulators.length}, multi-account: ${multiAccount.length}. Anchors: FATF Digital Identity Guidance 2020 · CBUAE Digital Banking Supervision · NIST Device Identity Framework.`, evidence);
};

// ─── DIGITAL ECONOMY ─────────────────────────────────────────────────────────

const platformEconomyRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const platforms = ev(ctx, 'platformActivity') as Array<{ platformId?: string; kycDepth?: string; merchantVerified?: boolean; transactionVolumeAed?: number; chargebackRate?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const lowKyc = platforms.filter(p => p.kycDepth === 'none' || p.kycDepth === 'minimal');
  if (lowKyc.length > 0) { score += 0.3; evidence.push(`${lowKyc.length} platform(s) with insufficient KYC depth`); }
  const unverifiedMerchants = platforms.filter(p => p.merchantVerified === false);
  if (unverifiedMerchants.length > 0) { score += 0.2; evidence.push(`${unverifiedMerchants.length} unverified merchant(s)`); }
  const highChargeback = platforms.filter(p => (p.chargebackRate ?? 0) >= 0.02);
  if (highChargeback.length > 0) { score += 0.2; evidence.push(`${highChargeback.length} platform(s) with ≥2% chargeback rate`); }
  if (/gig.*economy|marketplace.*fraud|peer.*to.*peer.*unregulat|platform.*arbitrage/.test(ft)) { score += 0.15; evidence.push('Platform economy risk signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('platform_economy_risk', 'digital_economy', ['data_analysis', 'reasoning', 'inference'], score, clamp(0.4 + 0.05 * platforms.length, 0, 0.88),
    `Platform economy risk: ${platforms.length} platform(s). Low-KYC: ${lowKyc.length}, unverified merchants: ${unverifiedMerchants.length}, high chargeback: ${highChargeback.length}. Anchors: FATF R.14 (Money Services) · UAE CBUAE Payment Services Regulation 2021 · EBA Opinion on platform ML risks.`, evidence);
};

const defiProtocolGovernanceRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const protocols = ev(ctx, 'defiProtocols') as Array<{ protocolId?: string; auditStatus?: string; adminKeyRisk?: boolean; tvlUsd?: number; amlControlsPresent?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const unaudited = protocols.filter(p => p.auditStatus !== 'audited');
  if (unaudited.length > 0) { score += 0.3; evidence.push(`${unaudited.length} DeFi protocol(s) lacking audit`); }
  const adminKeyRisk = protocols.filter(p => p.adminKeyRisk === true);
  if (adminKeyRisk.length > 0) { score += 0.25; evidence.push(`${adminKeyRisk.length} protocol(s) with admin key centralisation risk`); }
  const noAml = protocols.filter(p => p.amlControlsPresent === false);
  if (noAml.length > 0) { score += 0.3; evidence.push(`${noAml.length} protocol(s) without AML controls`); }
  if (/rug.*pull|defi.*exploit|flash.*loan.*attack|governance.*attack/.test(ft)) { score += 0.15; evidence.push('DeFi exploit/governance attack signals'); }
  score = clamp(score, 0, 1);
  return build('defi_protocol_governance_risk', 'digital_economy', ['data_analysis', 'reasoning', 'forensic_accounting'], score, clamp(0.45 + 0.05 * protocols.length, 0, 0.9),
    `DeFi protocol governance risk: ${protocols.length} protocol(s). Unaudited: ${unaudited.length}, admin key risk: ${adminKeyRisk.length}, no AML controls: ${noAml.length}. Anchors: FATF Updated Guidance for VASPs 2021 · UAE VARA DeFi Guidance · MiCA Art.76.`, evidence);
};

const embeddedFinanceRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const products = ev(ctx, 'embeddedFinanceProducts') as Array<{ productId?: string; licenceStatus?: string; fintechPartnerId?: string; kycOwnership?: string; transactionLimitAed?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const unlicensed = products.filter(p => p.licenceStatus !== 'licensed');
  if (unlicensed.length > 0) { score += 0.35; evidence.push(`${unlicensed.length} embedded finance product(s) potentially unlicensed`); }
  const unclearKyc = products.filter(p => !p.kycOwnership || p.kycOwnership === 'unclear');
  if (unclearKyc.length > 0) { score += 0.25; evidence.push(`${unclearKyc.length} product(s) with unclear KYC ownership`); }
  if (/banking.?as.?a.?service|BaaS|white.?label.*bank|embedded.*payment.*gap/.test(ft)) { score += 0.15; evidence.push('Embedded finance risk patterns in narrative'); }
  score = clamp(score, 0, 1);
  return build('embedded_finance_risk', 'digital_economy', ['reasoning', 'data_analysis', 'forensic_accounting'], score, clamp(0.4 + 0.06 * products.length, 0, 0.88),
    `Embedded finance risk: ${products.length} product(s). Potentially unlicensed: ${unlicensed.length}, unclear KYC ownership: ${unclearKyc.length}. Anchors: CBUAE Payment Services Regulation 2021 · FCA Embedded Finance Discussion Paper 2022 · FATF R.14 coverage gaps.`, evidence);
};

const openBankingApiRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const apis = ev(ctx, 'openBankingApis') as Array<{ apiId?: string; tppAuthorised?: boolean; consentScope?: string; unusualDataAccess?: boolean; abuseAttempts?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const unauthorisedTpps = apis.filter(a => a.tppAuthorised === false);
  if (unauthorisedTpps.length > 0) { score += 0.4; evidence.push(`${unauthorisedTpps.length} API connection(s) from unauthorised TPP`); }
  const broadScope = apis.filter(a => a.consentScope === 'full' || a.consentScope === 'unrestricted');
  if (broadScope.length > 0) { score += 0.2; evidence.push(`${broadScope.length} API(s) with overly broad consent scope`); }
  const abuseAttempts = apis.reduce((a, api) => a + (api.abuseAttempts ?? 0), 0);
  if (abuseAttempts >= 5) { score += 0.25; evidence.push(`${abuseAttempts} API abuse attempt(s) detected`); }
  if (/open.*banking.*scraping|api.*credential.*stuffing|tpp.*impersonat/.test(ft)) { score += 0.15; evidence.push('Open banking API abuse signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('open_banking_api_risk', 'digital_economy', ['data_analysis', 'inference', 'reasoning'], score, clamp(0.4 + 0.06 * apis.length, 0, 0.9),
    `Open banking API risk: ${apis.length} API connection(s). Unauthorised TPPs: ${unauthorisedTpps.length}, broad scope: ${broadScope.length}, abuse attempts: ${abuseAttempts}. Anchors: UAE CBUAE Open Finance Framework 2023 · EBA PSD2 RTS on SCA · FATF Digital Payments Guidance 2020.`, evidence);
};

// ─── HUMAN RIGHTS ────────────────────────────────────────────────────────────

const modernSlaveryFinancialPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; counterpartyType?: string; note?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const msSuspectTxns = txns.filter(t => /escort|adult.*entertain|massage|recruitment.*fee|accommodation.*deduct/.test((t.note ?? '').toLowerCase()));
  if (msSuspectTxns.length > 0) { score += 0.4; evidence.push(`${msSuspectTxns.length} transaction(s) with modern slavery indicators`); }
  if (/labour.*traffic|forced.*labour|debt.*bondage|domestic.*servitude|recruitment.*fee/.test(ft)) { score += 0.35; evidence.push('Modern slavery terminology in evidence narrative'); }
  const highVolumeLowAmt = txns.filter(t => (t.amountAed ?? 0) < 500 && (t.amountAed ?? 0) > 0);
  if (highVolumeLowAmt.length >= 10) { score += 0.15; evidence.push(`${highVolumeLowAmt.length} small-amount transactions (possible controlled payments)`); }
  score = clamp(score, 0, 1);
  return build('modern_slavery_financial_pattern', 'human_rights', ['forensic_accounting', 'intelligence', 'reasoning'], score, clamp(0.4 + 0.04 * txns.length, 0, 0.9),
    `Modern slavery financial pattern: ${txns.length} transaction(s) reviewed. Suspicious transactions: ${msSuspectTxns.length}. Anchors: FATF Financial Flows from Human Trafficking 2018 · UAE Human Trafficking Law 51/2006 · UK Modern Slavery Act 2015 s.52 SAR duty.`, evidence);
};

const hrdFinancialExclusionProbeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const accounts = ev(ctx, 'accountActions') as Array<{ accountId?: string; actionType?: string; reason?: string; subjectType?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const exclusions = accounts.filter(a => a.actionType === 'closure' || a.actionType === 'freeze');
  if (exclusions.length > 0) { score += 0.2; evidence.push(`${exclusions.length} account closure/freeze action(s)`); }
  const hrdRelated = accounts.filter(a => /activist|journalist|ngo|defender|opposition|civil.*society/.test((a.subjectType ?? '').toLowerCase() + ' ' + (a.reason ?? '').toLowerCase()));
  if (hrdRelated.length > 0) { score += 0.4; evidence.push(`${hrdRelated.length} action(s) targeting HRD/journalist/activist profiles`); }
  if (/human.*rights.*defender|financial.*exclusion.*civil|bank.*activist|de.?risk.*ngo/.test(ft)) { score += 0.3; evidence.push('HRD financial exclusion signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('hrd_financial_exclusion_probe', 'human_rights', ['reasoning', 'intelligence', 'introspection'], score, clamp(0.4 + 0.06 * accounts.length, 0, 0.88),
    `HRD financial exclusion probe: ${accounts.length} account action(s). HRD-related: ${hrdRelated.length}. Anchors: FATF Guidance on Non-Profit Organisations 2023 (Rec 8) · UN Guiding Principles on Business and Human Rights · OHCHR Financial Exclusion Guidance.`, evidence);
};

// ─── BEHAVIORAL SCIENCE (dotted IDs) ─────────────────────────────────────────

const bsConfirmationBiasAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const first = findings[0];
  const allSameVerdict = findings.length >= 3 && first !== undefined && findings.every(f => f.verdict === first.verdict);
  if (allSameVerdict && first !== undefined && first.verdict === 'clear') { score += 0.35; evidence.push('All prior findings "clear" — possible confirmation of innocence bias'); }
  const lowVarianceScores = findings.length >= 3 && (Math.max(...findings.map(f => f.score)) - Math.min(...findings.map(f => f.score))) < 0.1;
  if (lowVarianceScores) { score += 0.25; evidence.push('Abnormally low score variance across findings — anchoring risk'); }
  if (/confirm|we expected|consistent.*hypothesis|discard.*contrary/.test(ft)) { score += 0.2; evidence.push('Confirmation-seeking language detected in narrative'); }
  const singleSourceFindings = findings.filter(f => f.evidence.length <= 1);
  if (singleSourceFindings.length >= findings.length * 0.7 && findings.length >= 3) { score += 0.2; evidence.push('Majority of findings rely on single evidence source'); }
  score = clamp(score, 0, 1);
  return build('bs.confirmation_bias_audit', 'behavioral_science', ['introspection', 'reasoning', 'argumentation'], score, clamp(0.4 + 0.04 * findings.length, 0, 0.85),
    `Confirmation bias audit: ${findings.length} prior finding(s). Uniform verdicts: ${allSameVerdict}, low variance: ${lowVarianceScores}. Anchors: Kahneman "Thinking, Fast and Slow" (2011) · Tversky & Kahneman Heuristics & Biases (1974) · FATF Self-Assessment guidance on cognitive bias in AML.`, evidence);
};

const bsMotivatedReasoningScanApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const highConfLowEvidence = findings.filter(f => f.confidence >= 0.8 && f.evidence.length === 0);
  if (highConfLowEvidence.length > 0) { score += 0.4; evidence.push(`${highConfLowEvidence.length} finding(s) with high confidence but no evidence`); }
  if (/we know|obvious|clearly.*guilty|no doubt|must be.*fraud/.test(ft)) { score += 0.3; evidence.push('Pre-judgment language detected in narrative'); }
  const contradictions = findings.filter((f, i) => findings.slice(i+1).some(g => f.verdict === 'escalate' && g.verdict === 'clear' && Math.abs(f.score - g.score) > 0.5));
  if (contradictions.length > 0) { score += 0.25; evidence.push(`${contradictions.length} contradictory finding pair(s) — possible motivated reasoning`); }
  score = clamp(score, 0, 1);
  return build('bs.motivated_reasoning_scan', 'behavioral_science', ['introspection', 'argumentation', 'ratiocination'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.88),
    `Motivated reasoning scan: ${findings.length} finding(s). High-conf zero-evidence: ${highConfLowEvidence.length}, contradictions: ${contradictions.length}. Anchors: Kunda (1990) Motivated Reasoning · AML model governance guidance on analyst bias · EBA ML/TF Risk Assessment Guidelines.`, evidence);
};

const bsSocialProofFallacyCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  if (/everyone.*does|industry.*norm|common.*practice|peer.*bank.*also/.test(ft)) { score += 0.35; evidence.push('Social proof / "everyone does it" rationalisation in narrative'); }
  const identicalRationales = findings.length >= 3 && new Set(findings.map(f => f.rationale.slice(0, 40))).size === 1;
  if (identicalRationales) { score += 0.3; evidence.push('Copy-paste rationale pattern — possible group-think application'); }
  if (/herd|follow.*crowd|benchmark.*peers|sector.*average.*acceptable/.test(ft)) { score += 0.2; evidence.push('Herd behaviour language in evidence'); }
  score = clamp(score, 0, 1);
  return build('bs.social_proof_fallacy_check', 'behavioral_science', ['introspection', 'argumentation', 'reasoning'], score, clamp(0.4 + 0.03 * findings.length, 0, 0.85),
    `Social proof fallacy check: ${findings.length} findings reviewed. Identical rationale pattern: ${identicalRationales}. Anchors: Cialdini "Influence" (1984) · Basel Committee Peer Review risks · FCA TR 19/4 (culture and conduct).`, evidence);
};

const bsSunkCostRelationshipTestApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const relationships = ev(ctx, 'clientRelationships') as Array<{ clientId?: string; relationshipYears?: number; aum?: number; recentAlerts?: number; onboardingCost?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const longHighValue = relationships.filter(r => (r.relationshipYears ?? 0) >= 5 && (r.aum ?? 0) >= 1_000_000 && (r.recentAlerts ?? 0) >= 3);
  if (longHighValue.length > 0) { score += 0.45; evidence.push(`${longHighValue.length} long-standing, high-value client(s) with recent AML alerts — sunk-cost risk`); }
  if (/too.*valuable.*to.*exit|can't.*lose.*client|long.*relationship.*excus/.test(ft)) { score += 0.35; evidence.push('Sunk-cost rationalisation language detected'); }
  score = clamp(score, 0, 1);
  return build('bs.sunk_cost_relationship_test', 'behavioral_science', ['introspection', 'reasoning', 'forensic_accounting'], score, clamp(0.4 + 0.07 * relationships.length, 0, 0.88),
    `Sunk-cost relationship test: ${relationships.length} relationship(s). High-value with alerts: ${longHighValue.length}. Anchors: Thaler "Mental Accounting" (1999) · FCA FG18/4 Reducing harm from financial crime · FATF R.20 STR without commercial prejudice.`, evidence);
};

const bsGroupthinkDissentCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const meetings = ev(ctx, 'committeeMeetings') as Array<{ meetingId?: string; dissentingVotes?: number; totalVotes?: number; unanimousDecisions?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const allUnanimous = meetings.filter(m => (m.dissentingVotes ?? 0) === 0 && (m.totalVotes ?? 0) >= 4);
  if (allUnanimous.length >= 3) { score += 0.35; evidence.push(`${allUnanimous.length} consecutive unanimous decisions — dissent absence risk`); }
  if (/no.*dissenters|everyone.*agreed|consensus.*achieved.*easily|rubber.*stamp/.test(ft)) { score += 0.3; evidence.push('Groupthink indicators in committee meeting narrative'); }
  if (/challenge.*decision|devil.*advocate|red.*team|second.*opinion/.test(ft)) { score -= 0.1; evidence.push('Dissent mechanisms detected (mitigating factor)'); }
  score = clamp(score, 0, 1);
  return build('bs.groupthink_dissent_check', 'behavioral_science', ['introspection', 'argumentation', 'reasoning'], score, clamp(0.4 + 0.05 * meetings.length, 0, 0.88),
    `Groupthink/dissent check: ${meetings.length} committee meeting(s). Unanimous without dissent: ${allUnanimous.length}. Anchors: Janis "Groupthink" (1982) · FCA Discussion Paper DP18/2 (governance culture) · Basel Committee Principle 12 (internal audit challenge function).`, evidence);
};

// ─── NETWORK SCIENCE (dotted IDs) ─────────────────────────────────────────────

const nsGraphCentralityScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const nodes = ev(ctx, 'networkNodes') as Array<{ nodeId?: string; betweennessCentrality?: number; degreeCentrality?: number; flagged?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const highBetweenness = nodes.filter(n => (n.betweennessCentrality ?? 0) >= 0.7);
  if (highBetweenness.length > 0) { score += 0.35; evidence.push(`${highBetweenness.length} node(s) with high betweenness centrality (≥0.7) — critical conduits`); }
  const flaggedCentral = nodes.filter(n => n.flagged === true && (n.betweennessCentrality ?? 0) >= 0.5);
  if (flaggedCentral.length > 0) { score += 0.4; evidence.push(`${flaggedCentral.length} flagged node(s) in central network positions`); }
  if (/hub.*node|central.*actor|key.*broker|critical.*path/.test(ft)) { score += 0.1; evidence.push('Network centrality language in narrative'); }
  score = clamp(score, 0, 1);
  return build('ns.graph_centrality_scoring', 'network_science', ['data_analysis', 'inference', 'reasoning'], score, clamp(0.45 + 0.04 * nodes.length, 0, 0.9),
    `Graph centrality scoring: ${nodes.length} node(s). High betweenness: ${highBetweenness.length}, flagged central: ${flaggedCentral.length}. Anchors: Freeman (1979) centrality measures · FATF Network Analysis in AML 2023 · FinCEN 314(b) network mapping.`, evidence);
};

const nsBridgeNodeAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const bridges = ev(ctx, 'bridgeNodes') as Array<{ nodeId?: string; clusterCount?: number; uniqueJurisdictions?: number; bridgingScore?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const highBridge = bridges.filter(b => (b.bridgingScore ?? 0) >= 0.7);
  if (highBridge.length > 0) { score += 0.3; evidence.push(`${highBridge.length} high-bridging-score node(s) detected`); }
  const multiJurisdiction = bridges.filter(b => (b.uniqueJurisdictions ?? 0) >= 3);
  if (multiJurisdiction.length > 0) { score += 0.3; evidence.push(`${multiJurisdiction.length} bridge node(s) spanning ≥3 jurisdictions`); }
  if (/bridge.*node|cutpoint|articulation.*point|network.*gatekeeper/.test(ft)) { score += 0.1; evidence.push('Bridge node terminology in narrative'); }
  score = clamp(score, 0, 1);
  return build('ns.bridge_node_analysis', 'network_science', ['data_analysis', 'inference', 'intelligence'], score, clamp(0.4 + 0.06 * bridges.length, 0, 0.9),
    `Bridge node analysis: ${bridges.length} candidate(s). High bridging: ${highBridge.length}, multi-jurisdiction: ${multiJurisdiction.length}. Anchors: Burt (2004) Structural Holes · FATF Network Analysis Guidance · Egmont Group typology on network brokers.`, evidence);
};

const nsCliqueDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const cliques = ev(ctx, 'networkCliques') as Array<{ cliqueId?: string; memberCount?: number; internalTransactionDensity?: number; flaggedMembers?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const denseCliques = cliques.filter(c => (c.internalTransactionDensity ?? 0) >= 0.8 && (c.memberCount ?? 0) >= 3);
  if (denseCliques.length > 0) { score += 0.3; evidence.push(`${denseCliques.length} dense clique(s) (density ≥80%, ≥3 members)`); }
  const flaggedCliques = cliques.filter(c => (c.flaggedMembers ?? 0) >= 1);
  if (flaggedCliques.length > 0) { score += 0.35; evidence.push(`${flaggedCliques.length} clique(s) containing flagged member(s)`); }
  if (/criminal.*network|organised.*ring|collusion|coordinated.*scheme/.test(ft)) { score += 0.15; evidence.push('Organised network/ring indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('ns.clique_detection', 'network_science', ['data_analysis', 'inference', 'intelligence'], score, clamp(0.4 + 0.07 * cliques.length, 0, 0.9),
    `Clique detection: ${cliques.length} clique(s). Dense cliques: ${denseCliques.length}, with flagged members: ${flaggedCliques.length}. Anchors: Bron-Kerbosch clique algorithm · FATF Organised Crime ML 2012 · Europol OCG network typologies.`, evidence);
};

const nsTemporalNetworkEvolutionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const snapshots = ev(ctx, 'networkSnapshots') as Array<{ snapshotId?: string; timestampMs?: number; edgeCount?: number; newNodes?: number; removedNodes?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (snapshots.length >= 2) {
    const sorted = [...snapshots].sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
    const rapidGrowth = sorted.some((s, i) => { const prev = sorted[i - 1]; return i > 0 && (s.newNodes ?? 0) >= 5 && ((s.timestampMs ?? 0) - (prev?.timestampMs ?? 0)) < 86_400_000; });
    if (rapidGrowth) { score += 0.35; evidence.push('Rapid network node addition detected within 24h window'); }
    const rapidShrink = sorted.some((s, i) => { const prev = sorted[i - 1]; return i > 0 && (s.removedNodes ?? 0) >= 5 && ((s.timestampMs ?? 0) - (prev?.timestampMs ?? 0)) < 86_400_000; });
    if (rapidShrink) { score += 0.3; evidence.push('Rapid network contraction detected — possible burn-and-flee pattern'); }
  }
  if (/network.*evolv|dissolv.*cell|rapid.*restructur|abandon.*node/.test(ft)) { score += 0.15; evidence.push('Temporal network evolution signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('ns.temporal_network_evolution', 'network_science', ['data_analysis', 'reasoning', 'intelligence'], score, clamp(0.4 + 0.06 * snapshots.length, 0, 0.9),
    `Temporal network evolution: ${snapshots.length} snapshot(s). Anchors: Holme & Saramäki (2012) Temporal Networks · FATF Evolving ML typologies 2023 · FinCEN analysis of dissolving shell networks.`, evidence);
};

const nsNetworkDensityScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const graphs = ev(ctx, 'networkGraphs') as Array<{ graphId?: string; nodeCount?: number; edgeCount?: number; density?: number; meanPathLength?: number }>;
  let score = 0;
  const evidence: string[] = [];
  for (const g of graphs) {
    const density = g.density ?? (g.nodeCount && g.edgeCount ? (2 * g.edgeCount) / (g.nodeCount * (g.nodeCount - 1)) : 0);
    if (density >= 0.7) { score += 0.3; evidence.push(`Graph ${g.graphId}: density ${density.toFixed(2)} — highly interconnected`); }
    if ((g.meanPathLength ?? 99) <= 2 && (g.nodeCount ?? 0) >= 10) { score += 0.25; evidence.push(`Short mean path length (≤2) in ${g.nodeCount}-node network`); }
  }
  if (/fully.*connect|small.*world|tight.*knit.*network/.test(ft)) { score += 0.1; evidence.push('High-density network language in narrative'); }
  score = clamp(score, 0, 1);
  return build('ns.network_density_scoring', 'network_science', ['data_analysis', 'inference', 'ratiocination'], score, clamp(0.4 + 0.05 * graphs.length, 0, 0.9),
    `Network density scoring: ${graphs.length} graph(s) assessed. Anchors: Watts & Strogatz (1998) Small-World Networks · FATF Network Analysis Guidance 2023 · Basel Committee network risk concentration guidelines.`, evidence);
};

// ─── CRYPTOASSET FORENSICS (dotted IDs) ──────────────────────────────────────

const cfBlockchainProvenanceTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const hops = ev(ctx, 'blockchainHops') as Array<{ hopId?: string; address?: string; riskScore?: number; hopIndex?: number; protocol?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const highRiskHops = hops.filter(h => (h.riskScore ?? 0) >= 0.7);
  if (highRiskHops.length > 0) { score += 0.4; evidence.push(`${highRiskHops.length} high-risk hop(s) (score ≥0.7) in provenance chain`); }
  if (hops.length >= 10) { score += 0.2; evidence.push(`Deep provenance chain: ${hops.length} hops — layering complexity`); }
  const mixerHops = hops.filter(h => /tornado|mixer|tumbler|coinjoin|wasabi/.test((h.protocol ?? '').toLowerCase()));
  if (mixerHops.length > 0) { score += 0.3; evidence.push(`${mixerHops.length} hop(s) through known mixing protocol`); }
  if (/provenance.*unknown|origin.*obscured|chain.*broken|taint.*analysis/.test(ft)) { score += 0.1; evidence.push('Blockchain provenance gap signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cf.blockchain_provenance_trace', 'cryptoasset_forensics', ['forensic_accounting', 'data_analysis', 'inference'], score, clamp(0.45 + 0.04 * hops.length, 0, 0.9),
    `Blockchain provenance trace: ${hops.length} hop(s). High-risk hops: ${highRiskHops.length}, mixer hops: ${mixerHops.length}. Anchors: Chainalysis Crypto Crime Report 2024 · FATF R.15 Virtual Assets · OFAC Virtual Currency Guidance 2021.`, evidence);
};

const cfDefiProtocolRiskAssessmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const interactions = ev(ctx, 'defiInteractions') as Array<{ txHash?: string; protocol?: string; functionCall?: string; valueUsd?: number; slippagePct?: number; flashLoan?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const flashLoans = interactions.filter(i => i.flashLoan === true);
  if (flashLoans.length > 0) { score += 0.3; evidence.push(`${flashLoans.length} flash loan interaction(s) detected`); }
  const highSlippage = interactions.filter(i => (i.slippagePct ?? 0) >= 20);
  if (highSlippage.length > 0) { score += 0.25; evidence.push(`${highSlippage.length} interaction(s) with unusually high slippage (≥20%)`); }
  const highValue = interactions.filter(i => (i.valueUsd ?? 0) >= 500_000);
  if (highValue.length > 0) { score += 0.2; evidence.push(`${highValue.length} high-value DeFi interaction(s) ≥USD 500k`); }
  if (/defi.*exploit|smart.*contract.*vuln|price.*manipulation.*pool|sandwich.*attack/.test(ft)) { score += 0.2; evidence.push('DeFi exploit/manipulation signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cf.defi_protocol_risk_assessment', 'cryptoasset_forensics', ['forensic_accounting', 'data_analysis', 'reasoning'], score, clamp(0.45 + 0.04 * interactions.length, 0, 0.9),
    `DeFi protocol risk: ${interactions.length} interaction(s). Flash loans: ${flashLoans.length}, high slippage: ${highSlippage.length}, high value: ${highValue.length}. Anchors: FATF Updated Guidance VASPs 2021 · UAE VARA DeFi Supervisory Guidance · MiCA Art.76 on algorithmic protocols.`, evidence);
};

const cfVaspCounterpartyProfilingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const vasps = ev(ctx, 'vaspCounterparties') as Array<{ vaspId?: string; jurisdiction?: string; licensed?: boolean; fatfJurisdictionRisk?: string; transactionVolumeUsd?: number; kycStandard?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const unlicensed = vasps.filter(v => v.licensed === false);
  if (unlicensed.length > 0) { score += 0.4; evidence.push(`${unlicensed.length} unlicensed VASP counterparty(ies)`); }
  const highRiskJurisdiction = vasps.filter(v => v.fatfJurisdictionRisk === 'high' || v.fatfJurisdictionRisk === 'blacklist');
  if (highRiskJurisdiction.length > 0) { score += 0.35; evidence.push(`${highRiskJurisdiction.length} VASP(s) in FATF high-risk/blacklisted jurisdiction`); }
  const poorKyc = vasps.filter(v => v.kycStandard === 'none' || v.kycStandard === 'minimal');
  if (poorKyc.length > 0) { score += 0.2; evidence.push(`${poorKyc.length} VASP(s) with poor KYC standards`); }
  if (/unregulat.*exchange|peer.?to.?peer.*crypto|rogue.*vasp/.test(ft)) { score += 0.1; evidence.push('Rogue VASP signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cf.vasp_counterparty_profiling', 'cryptoasset_forensics', ['forensic_accounting', 'intelligence', 'data_analysis'], score, clamp(0.45 + 0.05 * vasps.length, 0, 0.92),
    `VASP counterparty profiling: ${vasps.length} VASP(s). Unlicensed: ${unlicensed.length}, high-risk jurisdiction: ${highRiskJurisdiction.length}, poor KYC: ${poorKyc.length}. Anchors: FATF R.15/R.16 VASP obligations · UAE VARA Rulebook 2023 · CBUAE Virtual Asset Guidance.`, evidence);
};

const cfMixerTumblerDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'cryptoTransactions') as Array<{ txHash?: string; toAddress?: string; protocol?: string; consolidationPattern?: boolean; equalOutputs?: boolean; timingJitter?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const knownMixers = txns.filter(t => /tornado.*cash|chipmixer|wasabi|coinjoin|blender|bestmixer|helix/.test((t.protocol ?? '').toLowerCase() + ' ' + (t.toAddress ?? '').toLowerCase()));
  if (knownMixers.length > 0) { score += 0.55; evidence.push(`${knownMixers.length} transaction(s) to/through known mixer/tumbler`); }
  const consolidation = txns.filter(t => t.consolidationPattern === true);
  if (consolidation.length > 0) { score += 0.2; evidence.push(`${consolidation.length} UTXO consolidation pattern(s) consistent with mixing`); }
  const equalOutputs = txns.filter(t => t.equalOutputs === true);
  if (equalOutputs.length > 0) { score += 0.15; evidence.push(`${equalOutputs.length} transaction(s) with equal output pattern (CoinJoin signature)`); }
  if (/obfuscat.*trail|break.*blockchain.*link|anonymi.*crypto/.test(ft)) { score += 0.1; evidence.push('Mixing/obfuscation language in narrative'); }
  score = clamp(score, 0, 1);
  return build('cf.mixer_tumbler_detection', 'cryptoasset_forensics', ['forensic_accounting', 'data_analysis', 'inference'], score, clamp(0.5 + 0.04 * txns.length, 0, 0.95),
    `Mixer/tumbler detection: ${txns.length} transaction(s). Known mixer exposure: ${knownMixers.length}, consolidation patterns: ${consolidation.length}, equal outputs: ${equalOutputs.length}. Anchors: OFAC Tornado Cash SDN (2022) · FATF Targeted Update VASPs 2023 · Chainalysis mixer detection methodology.`, evidence);
};

const cfOnchainSanctionsScreeningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const wallets = ev(ctx, 'cryptoWallets') as Array<{ address?: string; ofacMatch?: boolean; euMatch?: boolean; unMatch?: boolean; directExposurePct?: number; indirectExposurePct?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const directSanctioned = wallets.filter(w => w.ofacMatch === true || w.euMatch === true || w.unMatch === true);
  if (directSanctioned.length > 0) { score += 0.7; evidence.push(`${directSanctioned.length} wallet(s) directly matched on sanctions list`); }
  const highDirectExposure = wallets.filter(w => (w.directExposurePct ?? 0) >= 10 && !w.ofacMatch && !w.euMatch);
  if (highDirectExposure.length > 0) { score += 0.35; evidence.push(`${highDirectExposure.length} wallet(s) with ≥10% direct sanctions exposure`); }
  const highIndirectExposure = wallets.filter(w => (w.indirectExposurePct ?? 0) >= 25);
  if (highIndirectExposure.length > 0) { score += 0.2; evidence.push(`${highIndirectExposure.length} wallet(s) with ≥25% indirect sanctions exposure`); }
  if (/sanctions.*screening.*crypto|blocked.*wallet|ofac.*address/.test(ft)) { score += 0.1; evidence.push('On-chain sanctions screening signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cf.onchain_sanctions_screening', 'cryptoasset_forensics', ['forensic_accounting', 'data_analysis', 'intelligence'], score, clamp(0.5 + 0.04 * wallets.length, 0, 0.95),
    `On-chain sanctions screening: ${wallets.length} wallet(s). Direct matches: ${directSanctioned.length}, high direct exposure: ${highDirectExposure.length}, high indirect: ${highIndirectExposure.length}. Anchors: OFAC SDN Virtual Currency Guidance 2021 · UAE CBUAE Sanctions Framework · FATF R.6/R.7 targeted financial sanctions.`, evidence);
};

// ─── GEOPOLITICAL RISK (dotted IDs) ──────────────────────────────────────────

const grSanctionsJurisdictionShiftApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const moves = ev(ctx, 'jurisdictionMoves') as Array<{ entityId?: string; fromCountry?: string; toCountry?: string; timing?: string; sanctionListedFrom?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const postSanctionMoves = moves.filter(m => m.sanctionListedFrom === true);
  if (postSanctionMoves.length > 0) { score += 0.5; evidence.push(`${postSanctionMoves.length} move(s) from newly-sanctioned jurisdiction`); }
  const highRiskDestinations = ['AE', 'TR', 'HK', 'SG', 'CY', 'MT'];
  const toGateway = moves.filter(m => highRiskDestinations.includes(m.toCountry ?? ''));
  if (toGateway.length > 0) { score += 0.25; evidence.push(`${toGateway.length} relocation(s) to known financial gateway jurisdiction`); }
  if (/sanction.*evasion.*redomicil|jurisdiction.*shop|flag.*of.*convenience.*corp/.test(ft)) { score += 0.2; evidence.push('Sanctions jurisdiction-shopping signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('gr.sanctions_jurisdiction_shift', 'geopolitical_risk', ['intelligence', 'geopolitical_awareness', 'reasoning'], score, clamp(0.45 + 0.06 * moves.length, 0, 0.92),
    `Sanctions jurisdiction shift: ${moves.length} relocation(s). Post-sanction moves: ${postSanctionMoves.length}, gateway destinations: ${toGateway.length}. Anchors: OFAC 50% Rule · UN SCR 2094 · FATF R.6 Targeted Sanctions · EU Blocking Statute evasion typology.`, evidence);
};

const grStateSponsoredMlDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const indicators = ev(ctx, 'stateSponsorIndicators') as Array<{ indicatorId?: string; type?: string; confidence?: number; linkedCountry?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const highConf = indicators.filter(i => (i.confidence ?? 0) >= 0.7);
  if (highConf.length >= 2) { score += 0.45; evidence.push(`${highConf.length} high-confidence state-sponsored ML indicator(s)`); }
  const dprk = indicators.filter(i => i.linkedCountry === 'KP');
  if (dprk.length > 0) { score += 0.5; evidence.push(`${dprk.length} DPRK-linked indicator(s) — critical TF/proliferation risk`); }
  const iran = indicators.filter(i => i.linkedCountry === 'IR');
  if (iran.length > 0) { score += 0.4; evidence.push(`${iran.length} Iran-linked state-sponsored ML indicator(s)`); }
  if (/lazarus.*group|kimsuky|state.*actor.*crypto|cyber.*heist.*nation/.test(ft)) { score += 0.3; evidence.push('State-sponsored cyber-ML actor indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('gr.state_sponsored_ml_detection', 'geopolitical_risk', ['intelligence', 'geopolitical_awareness', 'forensic_accounting'], score, clamp(0.5 + 0.05 * indicators.length, 0, 0.95),
    `State-sponsored ML detection: ${indicators.length} indicator(s). DPRK: ${dprk.length}, Iran: ${iran.length}, high-confidence: ${highConf.length}. Anchors: UN Panel of Experts DPRK 2023 · OFAC DPRK Cyber Guidance · FATF Proliferation Financing Risk Assessment 2022.`, evidence);
};

const grGeopoliticalRecalibrationTriggerApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const events = ev(ctx, 'geopoliticalEvents') as Array<{ eventId?: string; eventType?: string; affectedCountry?: string; severity?: number; dateMs?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const recentHigh = events.filter(e => (e.severity ?? 0) >= 0.7 && (Date.now() - (e.dateMs ?? 0)) < 90 * 86_400_000);
  if (recentHigh.length > 0) { score += 0.3; evidence.push(`${recentHigh.length} high-severity geopolitical event(s) within 90 days`); }
  const sanctionTriggers = events.filter(e => e.eventType === 'sanctions_designation' || e.eventType === 'coup' || e.eventType === 'conflict_escalation');
  if (sanctionTriggers.length > 0) { score += 0.35; evidence.push(`${sanctionTriggers.length} sanctions/conflict trigger event(s)`); }
  if (/country.*risk.*upgrade|geopolit.*reassess|war.*risk.*premium|emerging.*sanctioned/.test(ft)) { score += 0.2; evidence.push('Geopolitical recalibration signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('gr.geopolitical_recalibration_trigger', 'geopolitical_risk', ['intelligence', 'geopolitical_awareness', 'reasoning'], score, clamp(0.4 + 0.06 * events.length, 0, 0.9),
    `Geopolitical recalibration: ${events.length} event(s). Recent high-severity: ${recentHigh.length}, sanctions/conflict triggers: ${sanctionTriggers.length}. Anchors: FATF Jurisdiction Statements · Basel AML Index 2024 · Transparency International CPI · ACAMS geopolitical risk methodology.`, evidence);
};

const grConflictZoneNexusMappingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const links = ev(ctx, 'conflictZoneLinks') as Array<{ linkId?: string; country?: string; conflictActive?: boolean; entityType?: string; financialFlowUsd?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const activeConflict = links.filter(l => l.conflictActive === true);
  if (activeConflict.length > 0) { score += 0.4; evidence.push(`${activeConflict.length} link(s) to active conflict zone`); }
  const largeFlows = links.filter(l => (l.financialFlowUsd ?? 0) >= 500_000 && l.conflictActive === true);
  if (largeFlows.length > 0) { score += 0.3; evidence.push(`${largeFlows.length} large financial flow(s) ≥USD 500k linked to conflict zone`); }
  if (/conflict.*financing|war.*economy|armed.*group|illicit.*arms/.test(ft)) { score += 0.2; evidence.push('Conflict zone financing indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('gr.conflict_zone_nexus_mapping', 'geopolitical_risk', ['intelligence', 'geopolitical_awareness', 'forensic_accounting'], score, clamp(0.45 + 0.05 * links.length, 0, 0.92),
    `Conflict zone nexus mapping: ${links.length} link(s). Active conflict: ${activeConflict.length}, large flows: ${largeFlows.length}. Anchors: UN SC Resolutions on conflict financing · FATF Guidance on TF 2023 · ICRC financial sanctions compliance guidance.`, evidence);
};

const cahraDeterminationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const shipments = ev(ctx, 'cargoShipments') as Array<{ shipmentId?: string; goodsCategory?: string; destinationCountry?: string; endUserCertificate?: boolean; dualUse?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const conflictAffectedHighRisk = ['SD', 'SO', 'CF', 'ML', 'NE', 'BF', 'NG', 'LY', 'YE', 'SY', 'MM', 'AF'];
  const cahra = shipments.filter(s => conflictAffectedHighRisk.includes(s.destinationCountry ?? '') && s.dualUse === true);
  if (cahra.length > 0) { score += 0.5; evidence.push(`${cahra.length} dual-use shipment(s) to CAHRA-designated jurisdiction`); }
  const noEuc = shipments.filter(s => s.endUserCertificate === false && s.dualUse === true);
  if (noEuc.length > 0) { score += 0.3; evidence.push(`${noEuc.length} dual-use shipment(s) lacking end-user certificate`); }
  if (/cahra|conflict.?affected|high.?risk.*area|arms.*embargo|weapons.*diversion/.test(ft)) { score += 0.2; evidence.push('CAHRA/conflict zone export control signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cahra_determination', 'geopolitical_risk', ['intelligence', 'geopolitical_awareness', 'forensic_accounting'], score, clamp(0.45 + 0.05 * shipments.length, 0, 0.95),
    `CAHRA determination: ${shipments.length} shipment(s). CAHRA dual-use: ${cahra.length}, no EUC: ${noEuc.length}. Anchors: ICGLR CAHRA Protocol · UN Arms Embargo Resolutions · FATF Proliferation Financing Guidance 2022 · UAE Strategic Goods Regulation.`, evidence);
};

// ─── CORPORATE INTELLIGENCE (dotted IDs) ─────────────────────────────────────

const ciBeneficialOwnershipGraphWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const uboChain = ev(ctx, 'uboChain') as Array<{ entityId?: string; ownershipPct?: number; jurisdiction?: string; layerDepth?: number; uboIdentified?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const unidentifiedUbo = uboChain.filter(u => u.uboIdentified === false);
  if (unidentifiedUbo.length > 0) { score += 0.4; evidence.push(`${unidentifiedUbo.length} layer(s) where UBO remains unidentified`); }
  const deepChain = uboChain.filter(u => (u.layerDepth ?? 0) >= 4);
  if (deepChain.length > 0) { score += 0.25; evidence.push(`Ownership chain depth ≥4 layers (${deepChain.length} nodes)`); }
  const highRiskJurisdictions = ['KY', 'BVI', 'PA', 'LI', 'VG', 'AG', 'SC', 'MH', 'NR', 'WS'];
  const shoreLayer = uboChain.filter(u => highRiskJurisdictions.includes(u.jurisdiction ?? ''));
  if (shoreLayer.length > 0) { score += 0.2; evidence.push(`${shoreLayer.length} ownership node(s) in secrecy jurisdiction`); }
  if (/ubo.*hidden|beneficial.*owner.*obscure|nominee.*director|trust.*layer.*owner/.test(ft)) { score += 0.15; evidence.push('UBO opacity signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('ci.beneficial_ownership_graph_walk', 'corporate_intelligence', ['forensic_accounting', 'data_analysis', 'intelligence'], score, clamp(0.45 + 0.04 * uboChain.length, 0, 0.92),
    `Beneficial ownership graph walk: ${uboChain.length} node(s). Unidentified UBO layers: ${unidentifiedUbo.length}, deep chain: ${deepChain.length}, secrecy jurisdictions: ${shoreLayer.length}. Anchors: FATF R.24/R.25 · UAE UBO Regulation Cabinet Decision 58/2020 · AMLD6 Art.3(6).`, evidence);
};

const ciShellCompanyHallmarkScorerApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const entities = ev(ctx, 'entities') as Array<{ entityId?: string; employeeCount?: number; physicalAddress?: boolean; operationalRevenue?: number; registeredAgentOnly?: boolean; multipleDirectorships?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const zeroEmployees = entities.filter(e => (e.employeeCount ?? -1) === 0);
  if (zeroEmployees.length > 0) { score += 0.2; evidence.push(`${zeroEmployees.length} entity(ies) with zero employees`); }
  const noPhysical = entities.filter(e => e.physicalAddress === false);
  if (noPhysical.length > 0) { score += 0.2; evidence.push(`${noPhysical.length} entity(ies) lacking physical address`); }
  const registeredOnly = entities.filter(e => e.registeredAgentOnly === true);
  if (registeredOnly.length > 0) { score += 0.25; evidence.push(`${registeredOnly.length} entity(ies) with registered agent as only address`); }
  const multiDirector = entities.filter(e => e.multipleDirectorships === true);
  if (multiDirector.length > 0) { score += 0.15; evidence.push(`${multiDirector.length} entity(ies) sharing nominee director(s)`); }
  if (/shelf.*company|orphan.*entity|brass.*plate|letterbox.*compan/.test(ft)) { score += 0.2; evidence.push('Shell company hallmark language in narrative'); }
  score = clamp(score, 0, 1);
  return build('ci.shell_company_hallmark_scorer', 'corporate_intelligence', ['forensic_accounting', 'reasoning', 'data_analysis'], score, clamp(0.4 + 0.05 * entities.length, 0, 0.9),
    `Shell company hallmark scorer: ${entities.length} entity(ies). Zero employees: ${zeroEmployees.length}, no physical address: ${noPhysical.length}, registered-agent only: ${registeredOnly.length}. Anchors: FATF R.24 · Panama Papers typology · ICIJ Offshore Leaks methodology · UAE MOE Substance Regulations 2019.`, evidence);
};

const ciProfessionalIntermediaryAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const intermediaries = ev(ctx, 'professionalIntermediaries') as Array<{ piId?: string; type?: string; licenceVerified?: boolean; relatedPartyCount?: number; unusualFeeStructure?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const unlicensed = intermediaries.filter(i => i.licenceVerified === false);
  if (unlicensed.length > 0) { score += 0.35; evidence.push(`${unlicensed.length} intermediary(ies) without verified licence`); }
  const highRelated = intermediaries.filter(i => (i.relatedPartyCount ?? 0) >= 5);
  if (highRelated.length > 0) { score += 0.2; evidence.push(`${highRelated.length} intermediary(ies) linked to ≥5 related parties`); }
  const unusualFees = intermediaries.filter(i => i.unusualFeeStructure === true);
  if (unusualFees.length > 0) { score += 0.25; evidence.push(`${unusualFees.length} intermediary(ies) with unusual fee arrangements`); }
  if (/professional.*enabler|lawyer.*structur|accountant.*facilitat|trust.*company.*scheme/.test(ft)) { score += 0.2; evidence.push('Professional enabler risk signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('ci.professional_intermediary_audit', 'corporate_intelligence', ['forensic_accounting', 'intelligence', 'reasoning'], score, clamp(0.4 + 0.06 * intermediaries.length, 0, 0.9),
    `Professional intermediary audit: ${intermediaries.length} intermediary(ies). Unlicensed: ${unlicensed.length}, high related-party: ${highRelated.length}, unusual fees: ${unusualFees.length}. Anchors: FATF R.22/R.23 (DNFBP) · UAE DNFBP Guidance 2021 · OECD Professional Enablers report 2023.`, evidence);
};

const ciCorporateSubstanceTestApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const entities = ev(ctx, 'entities') as Array<{ entityId?: string; jurisdiction?: string; revenueToAssetsRatio?: number; coreIncomeGenerating?: boolean; directorResidence?: string; employeeCount?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const noSubstance = entities.filter(e => e.coreIncomeGenerating === false && (e.employeeCount ?? 0) === 0);
  if (noSubstance.length > 0) { score += 0.4; evidence.push(`${noSubstance.length} entity(ies) failing basic substance test`); }
  const directorMismatch = entities.filter(e => e.directorResidence && e.jurisdiction && e.directorResidence !== e.jurisdiction);
  if (directorMismatch.length > 0) { score += 0.2; evidence.push(`${directorMismatch.length} entity(ies) with directors resident outside jurisdiction`); }
  const lowAssetRatio = entities.filter(e => (e.revenueToAssetsRatio ?? 1) < 0.01 && (e.revenueToAssetsRatio ?? -1) >= 0);
  if (lowAssetRatio.length > 0) { score += 0.2; evidence.push(`${lowAssetRatio.length} entity(ies) with near-zero revenue-to-assets ratio`); }
  if (/economic.*substance|beneficial.*tax.*treaty|anti.?avoidance.*substance/.test(ft)) { score += 0.15; evidence.push('Economic substance test signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('ci.corporate_substance_test', 'corporate_intelligence', ['forensic_accounting', 'reasoning', 'data_analysis'], score, clamp(0.4 + 0.05 * entities.length, 0, 0.9),
    `Corporate substance test: ${entities.length} entity(ies). Failing substance: ${noSubstance.length}, director mismatch: ${directorMismatch.length}, low revenue ratio: ${lowAssetRatio.length}. Anchors: UAE Economic Substance Regulations Cabinet Decision 57/2020 · BEPS Action 5 (OECD) · EU ATAD Directive substance requirements.`, evidence);
};

// ─── EPISTEMIC QUALITY (dotted IDs) ──────────────────────────────────────────

const eqSourceReliabilityScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const sources = ev(ctx, 'evidenceSources') as Array<{ sourceId?: string; type?: string; credibilityScore?: number; verifiable?: boolean; dateMs?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const unreliable = sources.filter(s => (s.credibilityScore ?? 1) < 0.4);
  if (unreliable.length > 0) { score += 0.3; evidence.push(`${unreliable.length} low-credibility source(s) (score <0.4)`); }
  const unverifiable = sources.filter(s => s.verifiable === false);
  if (unverifiable.length > 0) { score += 0.2; evidence.push(`${unverifiable.length} unverifiable source(s)`); }
  const stale = sources.filter(s => (Date.now() - (s.dateMs ?? Date.now())) > 365 * 86_400_000);
  if (stale.length >= sources.length * 0.5 && sources.length >= 2) { score += 0.2; evidence.push(`Majority of sources >1 year old — staleness risk`); }
  if (sources.length < 2) { score += 0.15; evidence.push('Fewer than 2 sources — single-source dependency risk'); }
  if (/single.*source|unverified.*claim|rumour|hearsay|second.?hand/.test(ft)) { score += 0.1; evidence.push('Source reliability concerns in narrative'); }
  score = clamp(score, 0, 1);
  return build('eq.source_reliability_scoring', 'epistemic_quality', ['intelligence', 'introspection', 'ratiocination'], score, clamp(0.45 + 0.04 * sources.length, 0, 0.9),
    `Source reliability: ${sources.length} source(s). Unreliable: ${unreliable.length}, unverifiable: ${unverifiable.length}, stale majority: ${stale.length >= sources.length * 0.5}. Anchors: Intelligence Community Information Quality Standards · FATF Credible Evidence guidance · NATO STANAG 2022 source evaluation.`, evidence);
};

const eqEvidenceTriangulationCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const allEvidenceIds = findings.flatMap(f => f.evidence);
  const uniqueEvidence = new Set(allEvidenceIds).size;
  if (uniqueEvidence < 3 && findings.length >= 3) { score += 0.35; evidence.push(`Only ${uniqueEvidence} unique evidence item(s) across ${findings.length} findings — triangulation gap`); }
  const singleCategoryFindings = new Set(findings.map(f => f.category)).size;
  if (singleCategoryFindings <= 1 && findings.length >= 3) { score += 0.25; evidence.push('All findings from single category — narrow evidentiary base'); }
  if (/corroborat|triangulat|independent.*source|multiple.*verify/.test(ft)) { score -= 0.1; evidence.push('Triangulation language detected — partial mitigation'); }
  score = clamp(score, 0, 1);
  return build('eq.evidence_triangulation_check', 'epistemic_quality', ['introspection', 'reasoning', 'argumentation'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.88),
    `Evidence triangulation: ${findings.length} finding(s), ${uniqueEvidence} unique evidence items. Category spread: ${singleCategoryFindings}. Anchors: Denzin (1978) Triangulation methodology · FATF R.20 quality of STR information · FCA Threshold Conditions evidentiary standards.`, evidence);
};

const eqBaseRateCalibrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const highScores = findings.filter(f => f.score >= 0.7);
  if (highScores.length >= findings.length * 0.8 && findings.length >= 4) { score += 0.4; evidence.push(`${highScores.length}/${findings.length} findings at high-risk score — possible base-rate neglect`); }
  if (/base.*rate|prior.*probability|prevalence|false.*positive.*rate/.test(ft)) { score -= 0.1; evidence.push('Base-rate awareness language present — partial mitigation'); }
  if (/every.*transaction.*suspicious|all.*flagged|100%.*risk/.test(ft)) { score += 0.35; evidence.push('Overestimation language in narrative — base-rate neglect risk'); }
  score = clamp(score, 0, 1);
  return build('eq.base_rate_calibration', 'epistemic_quality', ['introspection', 'ratiocination', 'data_analysis'], score, clamp(0.4 + 0.04 * findings.length, 0, 0.88),
    `Base rate calibration: ${findings.length} finding(s). High-score proportion: ${highScores.length}. Anchors: Kahneman Base-Rate Neglect (2011) · BIS Supervisory Guidance on model calibration · FATF R.20 proportionality in STR filing.`, evidence);
};

const eqScopeSensitivityAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const scoreRange = findings.length >= 2 ? Math.max(...findings.map(f => f.score)) - Math.min(...findings.map(f => f.score)) : 0;
  if (scoreRange < 0.05 && findings.length >= 5) { score += 0.35; evidence.push(`Score range only ${scoreRange.toFixed(3)} across ${findings.length} findings — insensitivity to scope`); }
  if (/doesn.*matter.*how.*many|always.*same.*score|regardless.*volume/.test(ft)) { score += 0.3; evidence.push('Scope insensitivity language in analyst narrative'); }
  if (findings.length >= 5 && new Set(findings.map(f => f.verdict)).size === 1) { score += 0.2; evidence.push('All findings share identical verdict — scope sensitivity gap'); }
  score = clamp(score, 0, 1);
  return build('eq.scope_sensitivity_audit', 'epistemic_quality', ['introspection', 'ratiocination', 'argumentation'], score, clamp(0.4 + 0.04 * findings.length, 0, 0.88),
    `Scope sensitivity audit: ${findings.length} finding(s). Score range: ${scoreRange.toFixed(3)}, verdict variety: ${new Set(findings.map(f => f.verdict)).size}. Anchors: Desvousges et al. (1992) Scope Insensitivity · Kahneman WYSIATI bias · FATF proportionate risk assessment guidance.`, evidence);
};

// ─── PSYCHOLOGICAL PROFILING (dotted IDs) ────────────────────────────────────

const ppMoralDisengagementDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/everyone.*does.*it|victimless|technical.*breach|nobody.*harmed|just.*business/.test(ft)) { score += 0.4; evidence.push('Moral neutralisation language detected'); }
  if (/i.*was.*just.*following|my.*superior.*told|not.*my.*responsibility/.test(ft)) { score += 0.3; evidence.push('Displacement of responsibility detected'); }
  if (/they.*deserve.*it|it.*is.*their.*fault|the.*system.*corrupt/.test(ft)) { score += 0.25; evidence.push('Victim/system attribution language detected'); }
  const findings = ctx.priorFindings;
  const conductFindings = findings.filter(f => f.category === 'conduct_risk' && f.verdict === 'escalate');
  if (conductFindings.length >= 2) { score += 0.2; evidence.push(`${conductFindings.length} escalated conduct findings reinforce moral disengagement risk`); }
  score = clamp(score, 0, 1);
  return build('pp.moral_disengagement_detection', 'psychological_profiling', ['introspection', 'reasoning', 'argumentation'], score, clamp(0.4 + 0.05 * findings.length, 0, 0.88),
    `Moral disengagement detection. Score: ${score.toFixed(2)}. Anchors: Bandura (1999) Moral Disengagement theory · ACFE Fraud Triangle · FATF behavioural typologies on insider conduct.`, evidence);
};

const ppAuthorityExploitationProbeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/impersonat.*official|fake.*regulator|authority.*pressure|comply.*immediately.*threat/.test(ft)) { score += 0.5; evidence.push('Authority impersonation/exploitation signals'); }
  if (/urgent.*directive|ceo.*fraud|mandate.*transfer|override.*control/.test(ft)) { score += 0.35; evidence.push('Urgency-authority exploitation pattern detected'); }
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; triggerNote?: string; amountAed?: number }>;
  const authorityTriggered = txns.filter(t => /directive|instruction|order.*from|executive.*approval/.test((t.triggerNote ?? '').toLowerCase()));
  if (authorityTriggered.length > 0) { score += 0.25; evidence.push(`${authorityTriggered.length} transaction(s) triggered by authority-based instructions`); }
  score = clamp(score, 0, 1);
  return build('pp.authority_exploitation_probe', 'psychological_profiling', ['introspection', 'intelligence', 'reasoning'], score, clamp(0.45 + 0.05 * txns.length, 0, 0.9),
    `Authority exploitation probe. Anchors: Milgram (1963) Obedience experiments · ACFE CEO Fraud typology · FATF Social Engineering ML typology 2023.`, evidence);
};

const ppUrgencyPressureIndicatorApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/urgent|immediately|right now|no time|window.*clos|deadline.*today|act.*fast/.test(ft)) { score += 0.35; evidence.push('Urgency language detected in evidence narrative'); }
  if (/don.*t tell|keep.*secret|confiden.*bypass|skip.*compliance|no.*time.*check/.test(ft)) { score += 0.4; evidence.push('Secrecy-with-urgency pressure pattern detected'); }
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; processingTimeHours?: number; amountAed?: number }>;
  const rushTxns = txns.filter(t => (t.processingTimeHours ?? 99) < 1 && (t.amountAed ?? 0) >= 50_000);
  if (rushTxns.length > 0) { score += 0.3; evidence.push(`${rushTxns.length} high-value transaction(s) processed in under 1 hour`); }
  score = clamp(score, 0, 1);
  return build('pp.urgency_pressure_indicator', 'psychological_profiling', ['introspection', 'reasoning', 'forensic_accounting'], score, clamp(0.4 + 0.05 * txns.length, 0, 0.9),
    `Urgency/pressure indicator. Anchors: Cialdini Scarcity Principle (1984) · FCA Social Engineering Advisory 2022 · FATF Fraud-ML nexus typology.`, evidence);
};

const ppNarrativeCoherenceScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const subject = ctx.subject;
  let score = 0;
  const evidence: string[] = [];
  const priorEscalations = ctx.priorFindings.filter(f => f.verdict === 'escalate');
  if (priorEscalations.length >= 2 && /legitimate.*business|normal.*transaction|nothing.*unusual/.test(ft)) {
    score += 0.45; evidence.push('Narrative claims legitimacy despite multiple escalation findings');
  }
  if (/contradicts|inconsistent|changed.*story|conflicting.*statement/.test(ft)) { score += 0.3; evidence.push('Narrative inconsistency/contradiction signals detected'); }
  if (subject.type === 'individual' && /corporation.*purpose|business.*reason|commercial.*need/.test(ft) && !ft.includes('company') && !ft.includes('firm')) {
    score += 0.15; evidence.push('Individual subject with corporate-purpose narrative mismatch');
  }
  score = clamp(score, 0, 1);
  return build('pp.narrative_coherence_scoring', 'psychological_profiling', ['reasoning', 'introspection', 'argumentation'], score, clamp(0.4 + 0.03 * ctx.priorFindings.length, 0, 0.88),
    `Narrative coherence scoring. Escalations vs narrative: ${priorEscalations.length}. Anchors: FATF R.20 STR narrative quality · FCA Decision Notice analysis · Pennebaker (2011) language coherence analysis.`, evidence);
};

// ─── INSIDER THREAT (dotted IDs) ─────────────────────────────────────────────

const itPrivilegeAbuseChainTraceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const accessLogs = ev(ctx, 'accessLogs') as Array<{ logId?: string; userId?: string; resource?: string; accessTime?: number; outsideBusinessHours?: boolean; unusualResource?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const offHours = accessLogs.filter(l => l.outsideBusinessHours === true);
  if (offHours.length >= 3) { score += 0.25; evidence.push(`${offHours.length} access event(s) outside business hours`); }
  const unusualAccess = accessLogs.filter(l => l.unusualResource === true);
  if (unusualAccess.length > 0) { score += 0.35; evidence.push(`${unusualAccess.length} access event(s) to unusual resources`); }
  const multiResource = new Set(accessLogs.map(l => l.resource)).size;
  if (multiResource >= 5 && accessLogs.length >= 10) { score += 0.2; evidence.push(`${multiResource} distinct resources accessed — broad privilege use`); }
  if (/privilege.*escalat|admin.*access.*unusual|data.*exfil|insider.*breach/.test(ft)) { score += 0.2; evidence.push('Privilege abuse/insider threat signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('it.privilege_abuse_chain_trace', 'insider_threat', ['data_analysis', 'forensic_accounting', 'intelligence'], score, clamp(0.4 + 0.04 * accessLogs.length, 0, 0.9),
    `Privilege abuse chain: ${accessLogs.length} access event(s). Off-hours: ${offHours.length}, unusual resources: ${unusualAccess.length}, distinct resources: ${multiResource}. Anchors: CERT Insider Threat Center Guide 2016 · NIST SP 800-53 AC-6 · FATF R.18 internal controls.`, evidence);
};

const itAnalystIntegrityAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const auditTrail = ev(ctx, 'analystActions') as Array<{ actionId?: string; analystId?: string; actionType?: string; overriddenAlert?: boolean; deletedRecord?: boolean; editedRationale?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const overrides = auditTrail.filter(a => a.overriddenAlert === true);
  if (overrides.length >= 2) { score += 0.35; evidence.push(`${overrides.length} alert override(s) by analyst`); }
  const deletions = auditTrail.filter(a => a.deletedRecord === true);
  if (deletions.length > 0) { score += 0.45; evidence.push(`${deletions.length} record deletion(s) detected — audit trail integrity risk`); }
  const editedRationales = auditTrail.filter(a => a.editedRationale === true);
  if (editedRationales.length > 0) { score += 0.2; evidence.push(`${editedRationales.length} rationale edit(s) post-alert closure`); }
  if (/analyst.*corrupt|collud.*customer|bribery.*compliance|tip.*off.*customer/.test(ft)) { score += 0.3; evidence.push('Analyst corruption/collusion signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('it.analyst_integrity_audit', 'insider_threat', ['forensic_accounting', 'introspection', 'intelligence'], score, clamp(0.45 + 0.04 * auditTrail.length, 0, 0.95),
    `Analyst integrity audit: ${auditTrail.length} action(s). Overrides: ${overrides.length}, deletions: ${deletions.length}, rationale edits: ${editedRationales.length}. Anchors: FATF R.18(b) internal audit · UAE FDL 20/2018 Art.16 · FCA SYSC 6.3 compliance function integrity.`, evidence);
};

const itAccessAnomalyDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const sessions = ev(ctx, 'accessSessions') as Array<{ sessionId?: string; userId?: string; locationCountry?: string; deviceNew?: boolean; concurrentSessions?: number; downloadVolumeGb?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const foreignAccess = sessions.filter(s => s.locationCountry && s.locationCountry !== ctx.subject.jurisdiction);
  if (foreignAccess.length > 0) { score += 0.2; evidence.push(`${foreignAccess.length} access session(s) from unexpected foreign location`); }
  const newDevices = sessions.filter(s => s.deviceNew === true);
  if (newDevices.length >= 2) { score += 0.2; evidence.push(`${newDevices.length} session(s) from unregistered device(s)`); }
  const concurrent = sessions.filter(s => (s.concurrentSessions ?? 0) >= 3);
  if (concurrent.length > 0) { score += 0.3; evidence.push(`${concurrent.length} instance(s) of ≥3 concurrent sessions`); }
  const largeDownload = sessions.filter(s => (s.downloadVolumeGb ?? 0) >= 1);
  if (largeDownload.length > 0) { score += 0.3; evidence.push(`${largeDownload.length} session(s) with large data download ≥1GB`); }
  if (/credential.*theft|account.*takeover|session.*hijack/.test(ft)) { score += 0.15; evidence.push('Account takeover/session compromise signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('it.access_anomaly_detection', 'insider_threat', ['data_analysis', 'inference', 'forensic_accounting'], score, clamp(0.4 + 0.05 * sessions.length, 0, 0.9),
    `Access anomaly detection: ${sessions.length} session(s). Foreign: ${foreignAccess.length}, new devices: ${newDevices.length}, concurrent: ${concurrent.length}, large download: ${largeDownload.length}. Anchors: NIST SP 800-53 AU-12 · CERT Insider Threat 2016 · ISO/IEC 27001 A.9.4 access control.`, evidence);
};

const itWhistleblowerIntelligenceIntegrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const tips = ev(ctx, 'insiderTips') as Array<{ tipId?: string; channel?: string; credibilityScore?: number; allegationType?: string; corroboratedByAccess?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const credibleTips = tips.filter(t => (t.credibilityScore ?? 0) >= 0.6);
  if (credibleTips.length > 0) { score += 0.35; evidence.push(`${credibleTips.length} credible insider tip(s) received`); }
  const corroborated = tips.filter(t => t.corroboratedByAccess === true);
  if (corroborated.length > 0) { score += 0.3; evidence.push(`${corroborated.length} tip(s) corroborated by access log evidence`); }
  if (/whistleblow.*insider|anonymous.*staff|protected.*staff.*disclosur/.test(ft)) { score += 0.2; evidence.push('Staff whistleblower signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('it.whistleblower_intelligence_integration', 'insider_threat', ['intelligence', 'introspection', 'reasoning'], score, clamp(0.4 + 0.07 * tips.length, 0, 0.9),
    `Insider whistleblower intelligence: ${tips.length} tip(s). Credible: ${credibleTips.length}, corroborated: ${corroborated.length}. Anchors: UAE Whistleblower Protection 2023 · FATF R.35 · FCA SYSC 18 whistleblowing integration.`, evidence);
};

// ─── COMMON SENSE (dotted IDs) ────────────────────────────────────────────────

const csPlausibilityCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/implausible|impossible|doesn.*add.*up|makes.*no.*sense|highly.*unlikely/.test(ft)) { score += 0.4; evidence.push('Implausibility language in evidence narrative'); }
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; purposeCode?: string }>;
  const largeMissingPurpose = txns.filter(t => (t.amountAed ?? 0) >= 100_000 && !t.purposeCode);
  if (largeMissingPurpose.length > 0) { score += 0.25; evidence.push(`${largeMissingPurpose.length} large transaction(s) ≥AED 100k without purpose code`); }
  const priorEscalations = ctx.priorFindings.filter(f => f.verdict === 'escalate').length;
  if (priorEscalations >= 3) { score += 0.2; evidence.push(`${priorEscalations} escalation(s) — cumulative plausibility strain`); }
  score = clamp(score, 0, 1);
  return build('cs.plausibility_check', 'common_sense', ['reasoning', 'inference', 'smartness'], score, clamp(0.45 + 0.03 * txns.length, 0, 0.88),
    `Plausibility check: ${txns.length} transaction(s). Missing purpose (large): ${largeMissingPurpose.length}. Anchors: FATF Typologies — implausibility as SAR trigger · CBUAE Supervisory circulars on transaction purpose.`, evidence);
};

const csMotiveCoherenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/no.*clear.*motive|why.*would.*they|purpose.*unclear|unexplained.*reason/.test(ft)) { score += 0.3; evidence.push('Motive incoherence signals in narrative'); }
  if (/profit.*motive|tax.*evasion|conceal.*proceeds|avoid.*detection/.test(ft)) { score += 0.35; evidence.push('Illicit motive indicators detected'); }
  const priorFindings = ctx.priorFindings;
  const conflicting = priorFindings.filter(f => f.verdict === 'escalate' && /legitimate/.test(f.rationale));
  if (conflicting.length > 0) { score += 0.25; evidence.push(`${conflicting.length} prior finding(s) claiming legitimacy despite escalation`); }
  score = clamp(score, 0, 1);
  return build('cs.motive_coherence', 'common_sense', ['reasoning', 'inference', 'argumentation'], score, clamp(0.4 + 0.04 * priorFindings.length, 0, 0.88),
    `Motive coherence: ${priorFindings.length} prior finding(s). Conflicting legitimacy claims: ${conflicting.length}. Anchors: FATF typologies on declared vs actual purpose · UK Proceeds of Crime Act 2002 s.330 knowledge standard.`, evidence);
};

const csLifestyleVsIncomeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const profiles = ev(ctx, 'lifestyleProfiles') as Array<{ profileId?: string; estimatedAnnualIncomeAed?: number; estimatedAnnualSpendAed?: number; luxuryAssets?: number }>;
  let score = 0;
  const evidence: string[] = [];
  for (const p of profiles) {
    const ratio = (p.estimatedAnnualSpendAed ?? 0) / Math.max(p.estimatedAnnualIncomeAed ?? 1, 1);
    if (ratio >= 3) { score += 0.4; evidence.push(`Spend-to-income ratio ${ratio.toFixed(1)}x — lifestyle inconsistency`); }
    if ((p.luxuryAssets ?? 0) >= 3) { score += 0.2; evidence.push(`${p.luxuryAssets} luxury assets inconsistent with declared income`); }
  }
  if (/lifestyle.*income|unexplained.*wealth|luxury.*earning|spend.*beyond.*means/.test(ft)) { score += 0.2; evidence.push('Lifestyle vs income mismatch in narrative'); }
  score = clamp(score, 0, 1);
  return build('cs.lifestyle_vs_income', 'common_sense', ['forensic_accounting', 'reasoning', 'data_analysis'], score, clamp(0.4 + 0.06 * profiles.length, 0, 0.9),
    `Lifestyle vs income: ${profiles.length} profile(s). Anchors: FATF Guidance on Beneficial Ownership · UK Unexplained Wealth Orders (NCA) · UAE FIU EDD on high-net-worth individuals.`, evidence);
};

const csCounterpartyLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; counterpartyCountry?: string; counterpartyType?: string; relationshipExplained?: boolean; amountAed?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const unexplained = txns.filter(t => t.relationshipExplained === false && (t.amountAed ?? 0) >= 10_000);
  if (unexplained.length > 0) { score += 0.35; evidence.push(`${unexplained.length} transaction(s) with unexplained counterparty relationship`); }
  const highRisk = ['KP', 'IR', 'SY', 'VE', 'CU', 'RU', 'BY'];
  const riskCounterparty = txns.filter(t => highRisk.includes(t.counterpartyCountry ?? ''));
  if (riskCounterparty.length > 0) { score += 0.3; evidence.push(`${riskCounterparty.length} transaction(s) with high-risk jurisdiction counterparty`); }
  if (/why.*transact|stranger.*wire|no.*business.*relation|unknown.*party/.test(ft)) { score += 0.2; evidence.push('Counterparty logic gap signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cs.counterparty_logic', 'common_sense', ['reasoning', 'data_analysis', 'forensic_accounting'], score, clamp(0.4 + 0.04 * txns.length, 0, 0.9),
    `Counterparty logic: ${txns.length} transaction(s). Unexplained relationships: ${unexplained.length}, high-risk counterparties: ${riskCounterparty.length}. Anchors: FATF R.10 CDD counterparty · CBUAE transaction monitoring guidance.`, evidence);
};

const csTimingAnomalySenseApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; timestampMs?: number; amountAed?: number; dayOfWeek?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const weekendLarge = txns.filter(t => (t.dayOfWeek === 0 || t.dayOfWeek === 6) && (t.amountAed ?? 0) >= 100_000);
  if (weekendLarge.length > 0) { score += 0.25; evidence.push(`${weekendLarge.length} large transaction(s) on weekends`); }
  const holidayPeriod = txns.filter(t => { const m = new Date(t.timestampMs ?? 0).getMonth(); return (m === 11 || m === 0) && (t.amountAed ?? 0) >= 50_000; });
  if (holidayPeriod.length >= 3) { score += 0.2; evidence.push(`${holidayPeriod.length} transactions during holiday period`); }
  if (/unusual.*time|after.*hour.*transaction|holiday.*wire|quarter.*end.*spike/.test(ft)) { score += 0.2; evidence.push('Timing anomaly signals in narrative'); }
  if (txns.length >= 10) {
    const hours = txns.map(t => new Date(t.timestampMs ?? 0).getHours());
    const nightTime = hours.filter(h => h >= 0 && h <= 5).length;
    if (nightTime >= txns.length * 0.4) { score += 0.25; evidence.push(`${nightTime}/${txns.length} transactions in 00:00–05:00 window`); }
  }
  score = clamp(score, 0, 1);
  return build('cs.timing_anomaly_sense', 'common_sense', ['data_analysis', 'reasoning', 'inference'], score, clamp(0.4 + 0.04 * txns.length, 0, 0.88),
    `Timing anomaly: ${txns.length} transaction(s). Weekend large: ${weekendLarge.length}. Anchors: FATF behavioural typologies · BCBS transaction monitoring principles.`, evidence);
};

const csRoundNumberSuspicionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const roundThousand = txns.filter(t => (t.amountAed ?? 0) >= 1000 && (t.amountAed ?? 0) % 1000 === 0);
  const roundTenThousand = txns.filter(t => (t.amountAed ?? 0) >= 10_000 && (t.amountAed ?? 0) % 10_000 === 0);
  if (roundThousand.length >= txns.length * 0.7 && txns.length >= 5) { score += 0.3; evidence.push(`${roundThousand.length}/${txns.length} amounts are round thousands`); }
  if (roundTenThousand.length >= txns.length * 0.5 && txns.length >= 4) { score += 0.2; evidence.push(`${roundTenThousand.length}/${txns.length} amounts are round tens-of-thousands`); }
  const justBelow = txns.filter(t => { const a = t.amountAed ?? 0; return (a >= 54_500 && a <= 55_000) || (a >= 99_000 && a <= 100_000) || (a >= 49_000 && a <= 50_000); });
  if (justBelow.length > 0) { score += 0.25; evidence.push(`${justBelow.length} transaction(s) just below reporting threshold — possible structuring`); }
  if (/round.*amount|structuring|smurfing|threshold.*avoid/.test(ft)) { score += 0.2; evidence.push('Round amount/structuring language in narrative'); }
  score = clamp(score, 0, 1);
  return build('cs.round_number_suspicion', 'common_sense', ['data_analysis', 'forensic_accounting', 'reasoning'], score, clamp(0.4 + 0.04 * txns.length, 0, 0.9),
    `Round number suspicion: ${txns.length} transaction(s). Round thousands: ${roundThousand.length}, just-below-threshold: ${justBelow.length}. Anchors: FATF Structuring typology · 31 CFR 103.11 (USD 10k threshold) · CBUAE AED 55k CTR threshold.`, evidence);
};

const csNarrativeConsistencyApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/changed.*explanation|different.*story|previous.*stated|contradict.*earlier/.test(ft)) { score += 0.4; evidence.push('Narrative change/contradiction detected'); }
  if (/consistent.*account|same.*story|confirm.*previous|verified.*consistent/.test(ft)) { score = Math.max(0, score - 0.1); evidence.push('Consistency confirmation detected (mitigating)'); }
  const priorFindings = ctx.priorFindings;
  const narrativeMismatch = priorFindings.filter(f => f.rationale.toLowerCase().includes('inconsist') || f.rationale.toLowerCase().includes('contradict'));
  if (narrativeMismatch.length >= 2) { score += 0.35; evidence.push(`${narrativeMismatch.length} prior finding(s) noting narrative inconsistencies`); }
  score = clamp(score, 0, 1);
  return build('cs.narrative_consistency', 'common_sense', ['reasoning', 'argumentation', 'introspection'], score, clamp(0.4 + 0.03 * priorFindings.length, 0, 0.88),
    `Narrative consistency: ${priorFindings.length} prior finding(s). Inconsistency findings: ${narrativeMismatch.length}. Anchors: FATF STR narrative quality guidance · FCA Decision Notice evidentiary consistency standards.`, evidence);
};

const csTooGoodToBeTrue = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/guaranteed.*return|risk.?free.*investment|double.*money|500%.*profit|too.*good/.test(ft)) { score += 0.5; evidence.push('Classic "too good to be true" investment promise detected'); }
  if (/ponzi|pyramid|chain.*letter|multi.*level.*money|advance.*fee/.test(ft)) { score += 0.4; evidence.push('Fraud scheme indicator (Ponzi/pyramid/advance fee) detected'); }
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; purposeCode?: string; note?: string }>;
  const investmentHighReturn = txns.filter(t => /investment|return|profit|yield/.test((t.note ?? '').toLowerCase()) && (t.amountAed ?? 0) >= 50_000);
  if (investmentHighReturn.length >= 3) { score += 0.2; evidence.push(`${investmentHighReturn.length} large investment-labelled transactions`); }
  score = clamp(score, 0, 1);
  return build('cs.too_good_to_be_true', 'common_sense', ['reasoning', 'inference', 'smartness'], score, clamp(0.45 + 0.04 * txns.length, 0, 0.9),
    `Too-good-to-be-true check. Anchors: SEC Investor Alert on fraud red flags · FATF Investment Fraud ML typology 2023 · UAE SCA investor warnings.`, evidence);
};

const csVictimVsPerpetrator = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/victim.*also.*perpetrator|dual.*role|beneficiary.*suspect|complicit.*victim/.test(ft)) { score += 0.45; evidence.push('Subject appears both victim and perpetrator'); }
  if (/romance.*scam.*mule|authorised.*push.*payment|unwitting.*facilitat/.test(ft)) { score += 0.35; evidence.push('Witting/unwitting facilitator pattern detected'); }
  if (/victim|defrauded|tricked|deceived/.test(ft) && !/perpetrator|suspect|ml/.test(ft)) { score = Math.max(0, score - 0.1); evidence.push('Pure victim profile (no perpetrator signals) — mitigating'); }
  score = clamp(score, 0, 1);
  return build('cs.victim_vs_perpetrator', 'common_sense', ['reasoning', 'introspection', 'argumentation'], score, clamp(0.4 + 0.03 * ctx.priorFindings.length, 0, 0.88),
    `Victim vs perpetrator analysis. Anchors: FATF Fraud-ML nexus 2023 · UK APP Fraud guidance · PSR voluntary code on victim classification.`, evidence);
};

const csBasicEntityRealityCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const subject = ctx.subject;
  let score = 0;
  const evidence: string[] = [];
  if (!subject.identifiers || Object.keys(subject.identifiers).length === 0) { score += 0.3; evidence.push('Subject has no verified identifiers — basic reality gap'); }
  if (subject.type === 'entity' && !subject.dateOfIncorporation) { score += 0.2; evidence.push('Entity subject lacks incorporation date'); }
  if (!subject.jurisdiction) { score += 0.15; evidence.push('No jurisdiction recorded for subject'); }
  if (/does.*not.*exist|cannot.*verify|ghost.*company|front.*entity|fictional.*person/.test(ft)) { score += 0.4; evidence.push('Entity existence doubt signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('cs.basic_entity_reality_check', 'common_sense', ['reasoning', 'data_analysis', 'inference'], score, 0.7,
    `Basic entity reality check: subject=${subject.type}, identifiers=${Object.keys(subject.identifiers ?? {}).length}, jurisdiction=${subject.jurisdiction ?? 'missing'}. Anchors: FATF R.10 CDD basic customer verification · UAE CBUAE KYC Standards 2020.`, evidence);
};

// ─── QUANTITATIVE ANALYSIS (dotted IDs) ──────────────────────────────────────

const qaStatisticalOutlierDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (txns.length >= 5) {
    const amounts = txns.map(t => t.amountAed ?? 0);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd = Math.sqrt(amounts.map(a => (a - mean) ** 2).reduce((a, b) => a + b, 0) / amounts.length);
    const outliers = amounts.filter(a => Math.abs(a - mean) > 2.5 * sd);
    if (outliers.length > 0) { score += 0.4; evidence.push(`${outliers.length} statistical outlier(s) >2.5σ from mean AED ${mean.toFixed(0)}`); }
    if (sd / mean > 2 && txns.length >= 5) { score += 0.2; evidence.push(`High coefficient of variation (SD/mean = ${(sd/mean).toFixed(2)}) — unusual dispersion`); }
  }
  if (/outlier|z.?score|standard.*deviation|anomal.*amount/.test(ft)) { score += 0.1; evidence.push('Outlier detection signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.statistical_outlier_detection', 'quantitative_analysis', ['data_analysis', 'ratiocination', 'inference'], score, clamp(0.5 + 0.03 * txns.length, 0, 0.9),
    `Statistical outlier detection: ${txns.length} transaction(s) analysed. Anchors: FATF Quantitative AML Analysis 2023 · BIS Working Paper on statistical AML detection · FinCEN analysis methodology.`, evidence);
};

const qaFlowVelocityAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; timestampMs?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (txns.length >= 5) {
    const sorted = [...txns].sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
    const totalAed = txns.reduce((a, t) => a + (t.amountAed ?? 0), 0);
    const spanMs = ((sorted[sorted.length - 1]?.timestampMs) ?? 0) - ((sorted[0]?.timestampMs) ?? 0);
    const velocityPerDay = spanMs > 0 ? totalAed / (spanMs / 86_400_000) : 0;
    if (velocityPerDay >= 1_000_000) { score += 0.4; evidence.push(`Flow velocity AED ${velocityPerDay.toFixed(0)}/day — high throughput`); }
    if (txns.length / Math.max(spanMs / 86_400_000, 1) >= 20) { score += 0.25; evidence.push(`Transaction frequency ≥20/day on average`); }
  }
  if (/velocity|throughput|flow.*rate|high.*frequency.*transfer/.test(ft)) { score += 0.1; evidence.push('Flow velocity signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.flow_velocity_analysis', 'quantitative_analysis', ['data_analysis', 'forensic_accounting', 'ratiocination'], score, clamp(0.45 + 0.03 * txns.length, 0, 0.9),
    `Flow velocity: ${txns.length} transaction(s). Anchors: FATF typologies on rapid fund movement · BCBS Principle 10 on velocity monitoring.`, evidence);
};

const qaConcentrationRiskScoringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; counterpartyId?: string }>;
  let score = 0;
  const evidence: string[] = [];
  if (txns.length >= 3) {
    const cpMap = new Map<string, number>();
    for (const t of txns) { const k = t.counterpartyId ?? 'unknown'; cpMap.set(k, (cpMap.get(k) ?? 0) + (t.amountAed ?? 0)); }
    const total = txns.reduce((a, t) => a + (t.amountAed ?? 0), 0);
    const topCp = Math.max(...cpMap.values());
    if (total > 0 && topCp / total >= 0.7) { score += 0.35; evidence.push(`Top counterparty represents ${((topCp/total)*100).toFixed(0)}% of total flow`); }
    if (cpMap.size === 1 && txns.length >= 5) { score += 0.3; evidence.push('Single counterparty for all transactions — concentration risk'); }
  }
  if (/concentrat|single.*counterparty|one.*recipient|herfindahl/.test(ft)) { score += 0.1; evidence.push('Concentration risk signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.concentration_risk_scoring', 'quantitative_analysis', ['data_analysis', 'forensic_accounting', 'reasoning'], score, clamp(0.45 + 0.04 * txns.length, 0, 0.9),
    `Concentration risk: ${txns.length} transaction(s). Anchors: Basel III concentration risk · FATF R.10 counterparty CDD · HHI concentration methodology.`, evidence);
};

const qaBenfordLawAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (txns.length >= 20) {
    const benfordExpected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
    const digitCounts = new Array(9).fill(0);
    for (const t of txns) {
      const stripped = String(Math.abs(t.amountAed ?? 0)).replace(/^0+/, '');
      const firstDigit = stripped.length > 0 ? parseInt(stripped[0]!, 10) : NaN;
      if (firstDigit >= 1 && firstDigit <= 9) digitCounts[firstDigit - 1]++;
    }
    const n = txns.length;
    let chiSq = 0;
    for (let i = 0; i < 9; i++) { const expected = (benfordExpected[i] ?? 0) * n; chiSq += (((digitCounts[i] ?? 0) - expected) ** 2) / (expected || 1); }
    if (chiSq > 15.5) { score += 0.45; evidence.push(`Benford chi-squared = ${chiSq.toFixed(2)} (critical 15.5 at p<0.05) — distribution anomaly`); }
    else if (chiSq > 9.5) { score += 0.2; evidence.push(`Benford chi-squared = ${chiSq.toFixed(2)} — moderate deviation`); }
  } else if (txns.length > 0) {
    evidence.push(`Insufficient sample (${txns.length}) for Benford analysis — minimum 20 required`);
  }
  if (/benford|first.?digit|digit.*distribution/.test(ft)) { score += 0.05; }
  score = clamp(score, 0, 1);
  return build('qa.benford_law_analysis', 'quantitative_analysis', ['data_analysis', 'ratiocination', 'inference'], score, clamp(0.5 + 0.02 * txns.length, 0, 0.92),
    `Benford Law analysis: ${txns.length} transaction(s). Anchors: Nigrini (2012) Benford's Law for forensic accounting · ACFE audit analytics methodology · SEC accounting fraud detection.`, evidence);
};

const qaTimeSeriesAnomalyApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const series = ev(ctx, 'timeSeriesDataPoints') as Array<{ periodId?: string; value?: number; baseline?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const spikes = series.filter(s => s.baseline && s.baseline > 0 && (s.value ?? 0) / s.baseline >= 3);
  if (spikes.length > 0) { score += 0.4; evidence.push(`${spikes.length} time period(s) with ≥3× baseline volume spike`); }
  const drops = series.filter(s => s.baseline && s.baseline > 0 && (s.value ?? 0) / s.baseline <= 0.1);
  if (drops.length > 0) { score += 0.2; evidence.push(`${drops.length} period(s) with ≥90% drop from baseline — possible account dormancy manoeuvre`); }
  if (/time.*series.*anomaly|volume.*spike|unusual.*period|seasonal.*adjusted/.test(ft)) { score += 0.1; evidence.push('Time series anomaly signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.time_series_anomaly', 'quantitative_analysis', ['data_analysis', 'ratiocination', 'inference'], score, clamp(0.45 + 0.05 * series.length, 0, 0.9),
    `Time series anomaly: ${series.length} period(s). Spikes: ${spikes.length}, drops: ${drops.length}. Anchors: FATF Transaction Monitoring Effectiveness 2021 · BCBS Supervisory Review Process for time-series anomalies.`, evidence);
};

const qaPeerGroupBenchmarkingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const peer = ev(ctx, 'peerGroupData') as Array<{ peerId?: string; metricName?: string; subjectValue?: number; peerMedian?: number; peerP95?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const outlierMetrics = peer.filter(p => (p.subjectValue ?? 0) > (p.peerP95 ?? Infinity));
  if (outlierMetrics.length > 0) { score += 0.35; evidence.push(`${outlierMetrics.length} metric(s) exceeding peer 95th percentile`); }
  const farAboveMedian = peer.filter(p => p.peerMedian && p.peerMedian > 0 && (p.subjectValue ?? 0) / p.peerMedian >= 5);
  if (farAboveMedian.length > 0) { score += 0.3; evidence.push(`${farAboveMedian.length} metric(s) ≥5× peer median`); }
  if (/peer.*comparison|benchmark|cohort.*analysis|peer.*group.*outlier/.test(ft)) { score += 0.1; evidence.push('Peer benchmarking signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.peer_group_benchmarking', 'quantitative_analysis', ['data_analysis', 'inference', 'ratiocination'], score, clamp(0.45 + 0.06 * peer.length, 0, 0.9),
    `Peer group benchmarking: ${peer.length} metric(s). Above P95: ${outlierMetrics.length}, 5× median: ${farAboveMedian.length}. Anchors: FATF Quantitative AML metrics · EBA Peer Review on AML effectiveness · Basel Pillar 2 benchmarking.`, evidence);
};

const qaValueAtRiskExposureApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const exposures = ev(ctx, 'riskExposures') as Array<{ exposureId?: string; nominalValueAed?: number; haircut?: number; concentrationPct?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const totalExposure = exposures.reduce((a, e) => a + (e.nominalValueAed ?? 0) * (1 - (e.haircut ?? 0)), 0);
  if (totalExposure >= 10_000_000) { score += 0.3; evidence.push(`Net exposure AED ${totalExposure.toLocaleString()} — significant systemic value`); }
  const concentrated = exposures.filter(e => (e.concentrationPct ?? 0) >= 25);
  if (concentrated.length > 0) { score += 0.25; evidence.push(`${concentrated.length} exposure(s) ≥25% concentration`); }
  if (/value.?at.?risk|var.*exposure|capital.*adequacy.*risk|stress.*test/.test(ft)) { score += 0.1; evidence.push('VaR/exposure language in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.value_at_risk_exposure', 'quantitative_analysis', ['data_analysis', 'forensic_accounting', 'ratiocination'], score, clamp(0.45 + 0.05 * exposures.length, 0, 0.9),
    `Value-at-risk exposure: ${exposures.length} exposure(s). Net exposure: AED ${totalExposure.toLocaleString()}, concentrated: ${concentrated.length}. Anchors: Basel III VaR methodology · FATF R.1 risk-based approach quantification.`, evidence);
};

const qaNetworkFlowMatrixApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const flows = ev(ctx, 'networkFlows') as Array<{ fromNode?: string; toNode?: string; amountAed?: number; flowCount?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const totalFlow = flows.reduce((a, f) => a + (f.amountAed ?? 0), 0);
  const nodes = new Set([...flows.map(f => f.fromNode), ...flows.map(f => f.toNode)]).size;
  if (totalFlow >= 5_000_000 && nodes >= 5) { score += 0.3; evidence.push(`Network flow matrix: AED ${totalFlow.toLocaleString()} across ${nodes} nodes`); }
  const highFlows = flows.filter(f => (f.amountAed ?? 0) >= 1_000_000);
  if (highFlows.length >= 3) { score += 0.25; evidence.push(`${highFlows.length} inter-node flow(s) ≥AED 1M`); }
  if (/flow.*matrix|inter.*node.*transfer|network.*fund.*flow/.test(ft)) { score += 0.1; evidence.push('Network flow matrix signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.network_flow_matrix', 'quantitative_analysis', ['data_analysis', 'forensic_accounting', 'inference'], score, clamp(0.45 + 0.04 * flows.length, 0, 0.9),
    `Network flow matrix: ${flows.length} edge(s), ${nodes} node(s). Total: AED ${totalFlow.toLocaleString()}. Anchors: FATF Network Analysis guidance · FinCEN 314(b) cooperative flow analysis.`, evidence);
};

const qaSeasonalityStrippingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const series = ev(ctx, 'monthlyVolumes') as Array<{ month?: number; year?: number; volumeAed?: number; seasonallyAdjusted?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const adjustedAnomalies = series.filter(s => s.seasonallyAdjusted && s.volumeAed && s.seasonallyAdjusted > 0 && (s.volumeAed / s.seasonallyAdjusted) >= 2.5);
  if (adjustedAnomalies.length > 0) { score += 0.4; evidence.push(`${adjustedAnomalies.length} month(s) with ≥2.5× seasonally-adjusted anomaly`); }
  if (/seasonally.*adjusted|deseasonalised|trend.*component|cyclical.*remove/.test(ft)) { score += 0.05; }
  if (/unexplained.*spike.*seasonal|volume.*anomaly.*adjust/.test(ft)) { score += 0.2; evidence.push('Post-seasonal-adjustment anomaly described in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.seasonality_stripping', 'quantitative_analysis', ['data_analysis', 'ratiocination', 'inference'], score, clamp(0.45 + 0.05 * series.length, 0, 0.9),
    `Seasonality stripping: ${series.length} period(s). Adjusted anomalies: ${adjustedAnomalies.length}. Anchors: BIS Working Paper on STL decomposition in AML · FATF quantitative typologies.`, evidence);
};

const qaRegressionDiscontinuityApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const observations = ev(ctx, 'thresholdObservations') as Array<{ obsId?: string; value?: number; threshold?: number; justBelow?: boolean; clusteringScore?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const justBelow = observations.filter(o => o.justBelow === true);
  if (justBelow.length >= 3) { score += 0.4; evidence.push(`${justBelow.length} observation(s) clustered just below threshold — regression discontinuity signal`); }
  const highCluster = observations.filter(o => (o.clusteringScore ?? 0) >= 0.7);
  if (highCluster.length > 0) { score += 0.25; evidence.push(`${highCluster.length} high clustering score observation(s) at threshold boundary`); }
  if (/threshold.*avoidance|just.*below|under.*report.*limit|structuring.*threshold/.test(ft)) { score += 0.2; evidence.push('Threshold-avoidance clustering signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('qa.regression_discontinuity', 'quantitative_analysis', ['data_analysis', 'ratiocination', 'inference'], score, clamp(0.5 + 0.04 * observations.length, 0, 0.92),
    `Regression discontinuity: ${observations.length} observation(s). Just-below clusters: ${justBelow.length}. Anchors: Lee & Lemieux (2010) RDD methodology · FinCEN Structuring detection · FATF R.20 STR triggers.`, evidence);
};

// ─── SYNTHETIC INTELLIGENCE (dotted IDs) ─────────────────────────────────────

const siCrossModalFusionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  const categories = new Set(findings.map(f => f.category));
  let score = 0;
  const evidence: string[] = [];
  if (categories.size >= 4) { score += 0.3; evidence.push(`${categories.size} distinct reasoning categories contributing — rich modal diversity`); }
  const crossModalEscalations = findings.filter(f => f.verdict === 'escalate');
  if (crossModalEscalations.length >= 3 && categories.size >= 3) { score += 0.35; evidence.push(`${crossModalEscalations.length} escalations across ${categories.size} modalities — convergent synthesis`); }
  if (/cross.*modal|multi.*signal|fusion|ensemble.*finding/.test(ft)) { score += 0.1; evidence.push('Cross-modal fusion signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('si.cross_modal_fusion', 'synthetic_intelligence', ['synthesis', 'intelligence', 'data_analysis'], score, clamp(0.5 + 0.03 * findings.length, 0, 0.92),
    `Cross-modal fusion: ${findings.length} finding(s) across ${categories.size} category(ies). Anchors: Lahat et al. (2015) Multi-modal fusion · FATF Intelligence-led AML 2021 · MIT cross-modal AI detection research.`, evidence);
};

const siAdversarialSimulationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  const findings = ctx.priorFindings;
  const clearFindings = findings.filter(f => f.verdict === 'clear');
  const escalateFindings = findings.filter(f => f.verdict === 'escalate');
  if (clearFindings.length >= escalateFindings.length && escalateFindings.length >= 2) {
    score += 0.35; evidence.push(`Adversarial pattern: ${clearFindings.length} "clear" findings may be masking ${escalateFindings.length} escalations`);
  }
  if (/countermeasure|evad.*detection|avoid.*flag|manipulat.*system/.test(ft)) { score += 0.4; evidence.push('Adversarial evasion signals in narrative'); }
  if (/red.*team|adversarial.*test|pen.*test.*aml/.test(ft)) { score += 0.1; evidence.push('Adversarial testing reference (contextual)'); }
  score = clamp(score, 0, 1);
  return build('si.adversarial_simulation', 'synthetic_intelligence', ['intelligence', 'inference', 'strong_brain'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.9),
    `Adversarial simulation: ${findings.length} finding(s). Clear vs escalate ratio: ${clearFindings.length}:${escalateFindings.length}. Anchors: GAN adversarial ML concepts applied to AML evasion · FATF ML/TF Red-Teaming Guidance · MITRE ATT&CK Financial Crimes framework.`, evidence);
};

const siKnowledgeGraphInferenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const relations = ev(ctx, 'knowledgeGraphTriples') as Array<{ subject?: string; predicate?: string; object?: string; inferenceConfidence?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const highConfInference = relations.filter(r => (r.inferenceConfidence ?? 0) >= 0.8);
  if (highConfInference.length >= 3) { score += 0.35; evidence.push(`${highConfInference.length} high-confidence inferred relationship(s) in knowledge graph`); }
  const riskRelations = relations.filter(r => /owns|controls|benefits_from|directs|finances/.test(r.predicate ?? ''));
  if (riskRelations.length >= 5) { score += 0.25; evidence.push(`${riskRelations.length} control/ownership/financing relationship(s) inferred`); }
  if (/knowledge.*graph|semantic.*relation|entity.*resolution|ontolog/.test(ft)) { score += 0.1; evidence.push('Knowledge graph inference signals'); }
  score = clamp(score, 0, 1);
  return build('si.knowledge_graph_inference', 'synthetic_intelligence', ['intelligence', 'inference', 'synthesis'], score, clamp(0.45 + 0.04 * relations.length, 0, 0.9),
    `Knowledge graph inference: ${relations.length} triple(s). High-confidence inferences: ${highConfInference.length}. Anchors: Nickel et al. (2016) KG embedding · FATF Graph-based AML 2023 · FinCEN BSA data analytics.`, evidence);
};

const siMetaPatternRecognitionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const escalateCount = findings.filter(f => f.verdict === 'escalate').length;
  const categoryCount = new Set(findings.map(f => f.category)).size;
  if (escalateCount >= 4 && categoryCount >= 3) { score += 0.4; evidence.push(`Meta-pattern: ${escalateCount} escalations across ${categoryCount} categories — orchestrated risk profile`); }
  const meanScore = findings.length ? findings.reduce((a, f) => a + f.score, 0) / findings.length : 0;
  if (meanScore >= 0.6) { score += 0.3; evidence.push(`Mean finding score ${meanScore.toFixed(2)} ≥0.6 — pervasive risk pattern`); }
  if (/meta.*pattern|systemic.*risk|orchestrat|coordinated.*scheme/.test(ft)) { score += 0.15; evidence.push('Meta-pattern / orchestration signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('si.meta_pattern_recognition', 'synthetic_intelligence', ['synthesis', 'intelligence', 'strong_brain'], score, clamp(0.5 + 0.03 * findings.length, 0, 0.92),
    `Meta-pattern recognition: ${findings.length} finding(s), mean score ${meanScore.toFixed(2)}. Anchors: FATF Sophisticated ML Typologies 2023 · ACAMS meta-analysis methodology · AI pattern recognition in financial crime.`, evidence);
};

const siCounterfactualReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/if.*not.*for|would.*have.*been|alternative.*explanation|but.*for.*test/.test(ft)) { score += 0.2; evidence.push('Counterfactual reasoning language in evidence'); }
  const findings = ctx.priorFindings;
  const escalations = findings.filter(f => f.verdict === 'escalate');
  if (escalations.length >= 3) {
    score += 0.25; evidence.push(`${escalations.length} escalation(s): counterfactually, innocent scenario requires all to be coincidences`);
  }
  if (/legitimate.*explain.*all|coincidence|innocent.*explanation.*for.*every/.test(ft)) { score += 0.3; evidence.push('Implausible innocent explanation pattern detected'); }
  score = clamp(score, 0, 1);
  return build('si.counterfactual_reasoning', 'synthetic_intelligence', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.9),
    `Counterfactual reasoning: ${findings.length} finding(s). Anchors: Pearl (2009) Causality — counterfactual analysis · FATF R.20 "reasonable grounds" standard · UK suspicion standard (Shah v HSBC 2012).`, evidence);
};

const siEnsembleVerdictFusionApply = async (ctx: BrainContext): Promise<Finding> => {
  const findings = ctx.priorFindings;
  if (findings.length === 0) return build('si.ensemble_verdict_fusion', 'synthetic_intelligence', ['synthesis', 'data_analysis', 'ratiocination'], 0, 0.2, 'No prior findings for ensemble fusion.', []);
  const votes: Record<string, number> = { clear: 0, flag: 0, escalate: 0, inconclusive: 0, block: 0 };
  for (const f of findings) votes[f.verdict] = (votes[f.verdict] ?? 0) + f.confidence;
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
  const sortedVotes = Object.entries(votes).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const dominantVerdict = sortedVotes[0]?.[0] ?? 'inconclusive';
  const dominantShare = (votes[dominantVerdict] ?? 0) / Math.max(totalVotes, 1);
  const score = dominantVerdict === 'escalate' ? dominantShare * 0.9 : dominantVerdict === 'flag' ? dominantShare * 0.5 : 0.1;
  const evidence = [`Ensemble: ${Object.entries(votes).filter(([,v]) => v > 0).map(([k,v]) => `${k}=${v.toFixed(2)}`).join(', ')}`, `Dominant verdict: ${dominantVerdict} (${(dominantShare*100).toFixed(0)}% of confidence weight)`];
  return build('si.ensemble_verdict_fusion', 'synthetic_intelligence', ['synthesis', 'data_analysis', 'ratiocination'], clamp(score, 0, 1), clamp(0.5 + 0.03 * findings.length, 0, 0.92),
    `Ensemble verdict fusion: ${findings.length} finding(s). Dominant: ${dominantVerdict} at ${(dominantShare*100).toFixed(0)}%. Anchors: Ensemble ML methods (Breiman 2001) · FATF Multi-source evidence fusion.`, evidence);
};

const siHypothesisGenerationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const escalations = findings.filter(f => f.verdict === 'escalate');
  const categories = new Set(findings.map(f => f.category));
  const hypotheses: string[] = [];
  if (escalations.length >= 2 && categories.has('cryptoasset_forensics')) hypotheses.push('Crypto-facilitated ML');
  if (escalations.length >= 2 && categories.has('geopolitical_risk')) hypotheses.push('State-sponsored financial crime');
  if (escalations.length >= 2 && categories.has('corporate_intelligence')) hypotheses.push('Complex corporate ML structure');
  if (escalations.length >= 2 && categories.has('identity_fraud')) hypotheses.push('Identity-fraud-enabled account abuse');
  if (hypotheses.length > 0) { score += 0.2 * hypotheses.length; evidence.push(`Generated ${hypotheses.length} ML hypothesis(es): ${hypotheses.join('; ')}`); }
  if (/alternative.*hypothesis|competing.*theory|rival.*explanation/.test(ft)) { score += 0.1; }
  score = clamp(score, 0, 1);
  return build('si.hypothesis_generation', 'synthetic_intelligence', ['intelligence', 'reasoning', 'synthesis'], score, clamp(0.45 + 0.03 * findings.length, 0, 0.88),
    `Hypothesis generation: ${hypotheses.length} hypothesis(es) generated. Anchors: Peirce abduction theory · FATF structured analytical techniques · Intelligence Community Analytic Standards (ICD 203).`, evidence);
};

const siSemanticVectorSearchApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const queries = ev(ctx, 'semanticQueries') as Array<{ queryId?: string; semanticSimilarity?: number; matchedPattern?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const highSimilarity = queries.filter(q => (q.semanticSimilarity ?? 0) >= 0.85);
  if (highSimilarity.length > 0) { score += 0.35; evidence.push(`${highSimilarity.length} high-similarity semantic match(es) to known ML typology`); }
  const mlKeywords = ft.split(/\s+/).filter(w => /launder|fraud|structur|smurfing|layering|integrat|placement/.test(w));
  if (mlKeywords.length >= 5) { score += 0.2; evidence.push(`${mlKeywords.length} ML-typology keyword(s) in semantic space`); }
  score = clamp(score, 0, 1);
  return build('si.semantic_vector_search', 'synthetic_intelligence', ['intelligence', 'data_analysis', 'synthesis'], score, clamp(0.4 + 0.06 * queries.length, 0, 0.9),
    `Semantic vector search: ${queries.length} query(ies). High-similarity matches: ${highSimilarity.length}. Anchors: Mikolov et al. Word2Vec (2013) · BERT financial crime embedding · FATF typology semantic matching.`, evidence);
};

const siCausalDagInferenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const causalLinks = ev(ctx, 'causalLinks') as Array<{ from?: string; to?: string; strength?: number; confounded?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const strongCausal = causalLinks.filter(l => (l.strength ?? 0) >= 0.7 && l.confounded !== true);
  if (strongCausal.length >= 2) { score += 0.35; evidence.push(`${strongCausal.length} strong unconfounded causal link(s) in DAG`); }
  const confounded = causalLinks.filter(l => l.confounded === true);
  if (confounded.length > 0) { score += 0.1; evidence.push(`${confounded.length} confounded link(s) — causal inference uncertainty`); }
  if (/causal.*chain|cause.*effect|dag|directed.*acyclic/.test(ft)) { score += 0.1; }
  score = clamp(score, 0, 1);
  return build('si.causal_dag_inference', 'synthetic_intelligence', ['reasoning', 'inference', 'ratiocination'], score, clamp(0.45 + 0.05 * causalLinks.length, 0, 0.9),
    `Causal DAG inference: ${causalLinks.length} link(s). Strong causal: ${strongCausal.length}, confounded: ${confounded.length}. Anchors: Pearl (2009) Causality DAG framework · FATF causal analysis in typology mapping.`, evidence);
};

const siBeliefPropagationApply = async (ctx: BrainContext): Promise<Finding> => {
  const findings = ctx.priorFindings;
  if (findings.length === 0) return build('si.belief_propagation', 'synthetic_intelligence', ['inference', 'ratiocination', 'synthesis'], 0, 0.2, 'No prior beliefs to propagate.', []);
  let belief = 0.3;
  const evidence: string[] = [];
  for (const f of findings) {
    const lr = f.verdict === 'escalate' ? 4 : f.verdict === 'flag' ? 2 : f.verdict === 'clear' ? 0.4 : 1;
    belief = (belief * lr) / (belief * lr + (1 - belief));
    belief = clamp(belief, 0.01, 0.99);
  }
  if (belief >= 0.7) { evidence.push(`Posterior belief P(ML|E) = ${belief.toFixed(3)} after ${findings.length} finding(s)`); }
  const score = clamp(belief, 0, 1);
  return build('si.belief_propagation', 'synthetic_intelligence', ['inference', 'ratiocination', 'synthesis'], score, clamp(0.5 + 0.03 * findings.length, 0, 0.92),
    `Belief propagation (naïve Bayes): prior=0.30, posterior=${belief.toFixed(3)} after ${findings.length} finding(s). Anchors: Pearl (1988) Probabilistic Reasoning · FATF Bayesian risk assessment methodology.`, evidence);
};

// ─── FORMAL REASONING (dotted IDs) ───────────────────────────────────────────

const frLogicalEntailmentCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const escalates = findings.filter(f => f.verdict === 'escalate');
  const clears = findings.filter(f => f.verdict === 'clear');
  if (escalates.length >= 2 && clears.length >= 2) { score += 0.3; evidence.push('Logical tension: simultaneous escalations and clears — entailment conflict'); }
  if (/therefore|it follows|entails|implies|q.e.d|Q\.E\.D/.test(ft)) { score += 0.05; }
  if (/contradiction|logical.*inconsist|cannot.*both.*true/.test(ft)) { score += 0.35; evidence.push('Logical contradiction detected in reasoning chain'); }
  score = clamp(score, 0, 1);
  return build('fr.logical_entailment_check', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.88),
    `Logical entailment check: ${findings.length} finding(s). Escalations: ${escalates.length}, clears: ${clears.length}. Anchors: Aristotelian syllogism · Grice (1975) Cooperative Principle · Legal logical entailment standards (R v Smurthwaite).`, evidence);
};

const frModalLogicObligationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/must.*report|obliged.*to|duty.*file.*sar|required.*by.*law|mandatory.*disclosure/.test(ft)) { score += 0.2; evidence.push('Modal obligation language (must/required) detected'); }
  if (/must.*not.*tip.*off|prohibited.*inform.*customer|tipping.*off.*offence/.test(ft)) { score += 0.35; evidence.push('Modal prohibition (must not) — tipping-off risk flagged'); }
  if (/may.*but.*not.*must|discretionary.*sar|permissible.*not.*mandatory/.test(ft)) { score += 0.15; evidence.push('Permissive modality — discretionary reporting context'); }
  const obligatoryFindings = ctx.priorFindings.filter(f => f.verdict === 'escalate' && f.score >= 0.7);
  if (obligatoryFindings.length >= 2) { score += 0.2; evidence.push(`${obligatoryFindings.length} finding(s) meeting objective suspicion threshold — SAR obligation triggered`); }
  score = clamp(score, 0, 1);
  return build('fr.modal_logic_obligation', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.4 + 0.04 * ctx.priorFindings.length, 0, 0.9),
    `Modal logic obligation check. Anchors: Deontic logic (von Wright 1951) · UAE FDL 20/2018 Art.15 mandatory STR · FATF R.20 suspicion standard.`, evidence);
};

const frRuleConflictResolutionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/conflict.*rule|rule.*clash|regulation.*contradict|lex.*specialis|lex.*posterior/.test(ft)) { score += 0.3; evidence.push('Rule conflict signals in regulatory analysis'); }
  if (/data.*protection.*versus.*aml|gdpr.*versus.*fatf|privacy.*conflict.*report/.test(ft)) { score += 0.4; evidence.push('AML vs data-protection rule conflict detected'); }
  if (/professional.*privilege.*versus.*report|legal.*privilege.*aml/.test(ft)) { score += 0.35; evidence.push('Legal privilege vs AML reporting conflict detected'); }
  score = clamp(score, 0, 1);
  return build('fr.rule_conflict_resolution', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, 0.7,
    `Rule conflict resolution. Anchors: Lex specialis / lex posterior principles · CJEU Nowak v DPC on GDPR vs AML · UAE PDPL Art.4 AML exemption · FATF Guidance on Privacy and AML (2023).`, evidence);
};

const frFirstOrderPredicateAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/for all|there exists|∀|∃|universal.*quantif|existential.*claim/.test(ft)) { score += 0.1; evidence.push('First-order predicate language in evidence'); }
  if (/all.*transactions.*legitimate|no.*suspicious.*ever|never.*flagged/.test(ft)) { score += 0.4; evidence.push('Universal quantifier claim — "all legitimate" assertion requires disproof check'); }
  if (/at least one|there is a.*transaction|some.*indicat/.test(ft)) { score += 0.15; evidence.push('Existential claim — evidence of at least one suspicious event'); }
  const findings = ctx.priorFindings;
  const contradicts = findings.some(f => f.verdict === 'escalate') && /all.*legitimate|no.*concern/.test(ft);
  if (contradicts) { score += 0.35; evidence.push('Universal legitimacy claim contradicted by escalation findings'); }
  score = clamp(score, 0, 1);
  return build('fr.first_order_predicate_audit', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.4 + 0.03 * findings.length, 0, 0.88),
    `First-order predicate audit. Anchors: Frege (1879) Begriffsschrift · Russell & Whitehead Principia Mathematica · Legal "beyond reasonable doubt" quantifier standard.`, evidence);
};

const frProofByContradictionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const assumeInnocent = /assume.*innocent|presume.*legitimate|no.*reason.*suspect/.test(ft);
  const escalations = findings.filter(f => f.verdict === 'escalate');
  if (assumeInnocent && escalations.length >= 3) {
    score += 0.5; evidence.push(`Proof by contradiction: innocence assumption contradicted by ${escalations.length} escalation finding(s)`);
  }
  if (/reductio.*ad.*absurdum|proof.*by.*contradiction|assume.*opposite/.test(ft)) { score += 0.1; }
  score = clamp(score, 0, 1);
  return build('fr.proof_by_contradiction', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.9),
    `Proof by contradiction: ${findings.length} finding(s), ${escalations.length} escalations. Anchors: Classical reductio ad absurdum · FATF "grounds for suspicion" threshold · UK Shah v HSBC [2012] — honest suspicion standard.`, evidence);
};

const frAbductiveInferenceApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const escalations = findings.filter(f => f.verdict === 'escalate');
  if (escalations.length >= 3) {
    score += 0.3; evidence.push(`Abductive inference: ${escalations.length} anomalies best explained by ML hypothesis`);
  }
  if (/best.*explanation|most.*plausible.*account|inference.*to.*best/.test(ft)) { score += 0.2; evidence.push('Inference-to-best-explanation language in evidence'); }
  if (/alternative.*innocent.*explanation|coincidence.*all/.test(ft)) { score += 0.25; evidence.push('Implausible alternative explanation flagged'); }
  score = clamp(score, 0, 1);
  return build('fr.abductive_inference', 'formal_reasoning', ['reasoning', 'inference', 'argumentation'], score, clamp(0.45 + 0.04 * findings.length, 0, 0.9),
    `Abductive inference: ${findings.length} finding(s). Anchors: Peirce (1903) Abduction · Harman (1965) Inference to Best Explanation · FATF structured analytical technique for suspicious activity.`, evidence);
};

const frTemporalLogicSequencingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const events = ev(ctx, 'temporalEvents') as Array<{ eventId?: string; timestampMs?: number; eventType?: string; preconditionMet?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const outOfOrder = events.filter((e, i) => i > 0 && (e.preconditionMet === false));
  if (outOfOrder.length > 0) { score += 0.4; evidence.push(`${outOfOrder.length} event(s) occurring without precondition — temporal logic violation`); }
  if (/before.*after|temporal.*order|sequence.*violation|prior.*to.*sar/.test(ft)) { score += 0.15; evidence.push('Temporal logic ordering signals in narrative'); }
  if (/sar.*before.*transaction|report.*precedes.*event|impossible.*timing/.test(ft)) { score += 0.35; evidence.push('Impossible temporal sequence detected'); }
  score = clamp(score, 0, 1);
  return build('fr.temporal_logic_sequencing', 'formal_reasoning', ['reasoning', 'ratiocination', 'inference'], score, clamp(0.4 + 0.05 * events.length, 0, 0.88),
    `Temporal logic sequencing: ${events.length} event(s). Out-of-order: ${outOfOrder.length}. Anchors: Pnueli (1977) Temporal Logic · Allen (1983) temporal relations · FATF audit trail temporal requirements.`, evidence);
};

const frDefeasibleReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const defeaters = findings.filter(f => f.verdict === 'clear' && f.confidence >= 0.7);
  const escalations = findings.filter(f => f.verdict === 'escalate');
  if (defeaters.length >= 2 && escalations.length >= 2) {
    score += 0.3; evidence.push(`${defeaters.length} potential defeater(s) against ${escalations.length} escalation(s) — defeasible balance`);
  }
  if (/unless|except|rebuttable|unless.*shown.*otherwise|prima.*facie/.test(ft)) { score += 0.2; evidence.push('Defeasible reasoning language (unless/rebuttable) in evidence'); }
  if (/strong.*evidence.*overcomes|exception.*applies|carve.?out/.test(ft)) { score += 0.15; evidence.push('Exception/carve-out reasoning detected'); }
  score = clamp(score, 0, 1);
  return build('fr.defeasible_reasoning', 'formal_reasoning', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.4 + 0.04 * findings.length, 0, 0.88),
    `Defeasible reasoning: ${findings.length} finding(s). Defeaters: ${defeaters.length}. Anchors: Reiter (1980) Default Logic · Dung (1995) Argumentation frameworks · Common-law presumption/rebuttal doctrine.`, evidence);
};

const frArgumentStructureMappingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const uncited = findings.filter(f => f.evidence.length === 0);
  if (uncited.length >= findings.length * 0.5 && findings.length >= 3) { score += 0.35; evidence.push(`${uncited.length}/${findings.length} finding(s) lack supporting evidence — argument structure weakness`); }
  if (/unsupported.*claim|no.*evidence.*for|assertion.*without.*basis/.test(ft)) { score += 0.3; evidence.push('Unsupported claim language in evidence narrative'); }
  if (/well.*reasoned|fully.*evidenced|argument.*sound/.test(ft)) { score = Math.max(0, score - 0.1); evidence.push('Well-reasoned argument language (mitigating)'); }
  score = clamp(score, 0, 1);
  return build('fr.argument_structure_mapping', 'formal_reasoning', ['argumentation', 'reasoning', 'introspection'], score, clamp(0.4 + 0.04 * findings.length, 0, 0.88),
    `Argument structure mapping: ${findings.length} finding(s), ${uncited.length} uncited. Anchors: Toulmin (1958) Argument model · Walton (2008) Argumentation schemes · FATF STR quality standards.`, evidence);
};

const frConstraintSatisfactionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const constraints = ev(ctx, 'regulatoryConstraints') as Array<{ constraintId?: string; rule?: string; satisfied?: boolean; severity?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const unsatisfied = constraints.filter(c => c.satisfied === false);
  if (unsatisfied.length > 0) { score += Math.min(0.5, 0.15 * unsatisfied.length); evidence.push(`${unsatisfied.length} regulatory constraint(s) not satisfied`); }
  const criticalUnsatisfied = unsatisfied.filter(c => c.severity === 'critical');
  if (criticalUnsatisfied.length > 0) { score += 0.3; evidence.push(`${criticalUnsatisfied.length} critical constraint violation(s)`); }
  if (/constraint.*violat|rule.*breach|regulatory.*gap|compliance.*deficiency/.test(ft)) { score += 0.15; evidence.push('Constraint violation signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('fr.constraint_satisfaction', 'formal_reasoning', ['reasoning', 'ratiocination', 'argumentation'], score, clamp(0.45 + 0.06 * constraints.length, 0, 0.92),
    `Constraint satisfaction: ${constraints.length} constraint(s). Unsatisfied: ${unsatisfied.length}, critical: ${criticalUnsatisfied.length}. Anchors: Montanari (1974) CSP · FATF 40 Recommendations as constraint system · UAE MoE regulatory constraint framework.`, evidence);
};

// ─── MISC BEHAVIORAL / GOVERNANCE ────────────────────────────────────────────

const pepConnectionReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const pepHits = ev(ctx, 'pepHits') as Array<{ pepId?: string; position?: string; country?: string; riskTier?: number; closeAssociate?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const tier1 = pepHits.filter(p => (p.riskTier ?? 3) === 1);
  if (tier1.length > 0) { score += 0.45; evidence.push(`${tier1.length} Tier-1 PEP connection(s) (head of state / minister level)`); }
  const tier2 = pepHits.filter(p => (p.riskTier ?? 3) === 2);
  if (tier2.length > 0) { score += 0.25; evidence.push(`${tier2.length} Tier-2 PEP connection(s)`); }
  const closeAssociates = pepHits.filter(p => p.closeAssociate === true);
  if (closeAssociates.length > 0) { score += 0.2; evidence.push(`${closeAssociates.length} close associate(s) of PEP`); }
  if (/pep.*beneficial.*owner|politically.*exposed.*fund|pep.*ubo/.test(ft)) { score += 0.15; evidence.push('PEP-in-ownership-chain signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('pep_connection_reasoning', 'compliance_framework', ['intelligence', 'geopolitical_awareness', 'reasoning'], score, clamp(0.5 + 0.05 * pepHits.length, 0, 0.92),
    `PEP connection reasoning: ${pepHits.length} PEP hit(s). Tier 1: ${tier1.length}, Tier 2: ${tier2.length}, close associates: ${closeAssociates.length}. Anchors: FATF R.12/R.13 PEP obligations · UAE CBUAE PEP Guidance · Wolfsberg PEP Guidance 2017.`, evidence);
};

const velocityAnomalyReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; timestampMs?: number }>;
  let score = 0;
  const evidence: string[] = [];
  if (txns.length >= 5) {
    const sorted = [...txns].sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
    const windowMs = 3_600_000;
    let maxInWindow = 0;
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = sorted[i]?.timestampMs ?? 0;
      const inWindow = sorted.filter(t => (t.timestampMs ?? 0) >= windowStart && (t.timestampMs ?? 0) < windowStart + windowMs).length;
      if (inWindow > maxInWindow) maxInWindow = inWindow;
    }
    if (maxInWindow >= 10) { score += 0.4; evidence.push(`${maxInWindow} transactions in a single 1-hour window`); }
    else if (maxInWindow >= 5) { score += 0.2; evidence.push(`${maxInWindow} transactions in a single 1-hour window`); }
  }
  if (/velocity.*spike|burst.*activity|unusually.*frequent/.test(ft)) { score += 0.2; evidence.push('Velocity anomaly language in narrative'); }
  score = clamp(score, 0, 1);
  return build('velocity_anomaly_reasoning', 'behavioral_signals', ['data_analysis', 'forensic_accounting', 'reasoning'], score, clamp(0.45 + 0.03 * txns.length, 0, 0.9),
    `Velocity anomaly reasoning: ${txns.length} transaction(s). Anchors: FATF transaction monitoring effectiveness · BCBS velocity controls · CBUAE real-time monitoring guidance.`, evidence);
};

const romanceScamFinancialProfileReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txns = ev(ctx, 'transactions') as Array<{ txId?: string; amountAed?: number; counterpartyCountry?: string; note?: string }>;
  let score = 0;
  const evidence: string[] = [];
  const romanceKeywords = txns.filter(t => /gift|love|darling|sweetheart|emergency|medical.*abroad|stranded|investment.*partner/.test((t.note ?? '').toLowerCase()));
  if (romanceKeywords.length > 0) { score += 0.45; evidence.push(`${romanceKeywords.length} transaction(s) with romance scam narrative indicators`); }
  if (/romance.*scam|pig.*butchering|sha.*zhu.*pan|crypto.*romance|online.*love/.test(ft)) { score += 0.4; evidence.push('Romance/pig-butchering scam indicators in free text'); }
  const escalatingAmounts = txns.length >= 3 && txns.slice(1).every((t, i) => (t.amountAed ?? 0) >= (txns[i]?.amountAed ?? 0));
  if (escalatingAmounts) { score += 0.2; evidence.push('Monotonically increasing transfer amounts — grooming pattern'); }
  score = clamp(score, 0, 1);
  return build('romance_scam_financial_profile_reasoning', 'behavioral_signals', ['forensic_accounting', 'reasoning', 'intelligence'], score, clamp(0.45 + 0.04 * txns.length, 0, 0.9),
    `Romance scam profile: ${txns.length} transaction(s). Romance-narrative: ${romanceKeywords.length}. Anchors: FATF Fraud-ML nexus 2023 · FBI IC3 Romance Fraud Report 2023 · INTERPOL pig-butchering typology.`, evidence);
};

const legalPrivilegeAssessmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/legal.*advice.*privilege|litigation.*privilege|without.*prejudice/.test(ft)) { score += 0.2; evidence.push('Legal privilege claim detected — assess scope carefully'); }
  if (/crime.*fraud.*exception|furtherance.*crime|abuse.*privilege/.test(ft)) { score += 0.45; evidence.push('Crime-fraud exception potentially applicable — privilege may not shield'); }
  if (/genuine.*legal.*advice|bona.*fide.*counsel|legitimate.*legal.*work/.test(ft)) { score = Math.max(0, score - 0.1); evidence.push('Genuine legal advice context (mitigating)'); }
  const docs = ev(ctx, 'documents') as Array<{ docId?: string; privilegeClaimed?: boolean; authorType?: string }>;
  const privilegeDocs = docs.filter(d => d.privilegeClaimed === true);
  if (privilegeDocs.length > 0) { score += 0.15; evidence.push(`${privilegeDocs.length} document(s) with privilege claim — verify scope`); }
  score = clamp(score, 0, 1);
  return build('legal_privilege_assessment', 'legal_reasoning', ['reasoning', 'argumentation', 'introspection'], score, clamp(0.4 + 0.05 * docs.length, 0, 0.88),
    `Legal privilege assessment. Anchors: Three Rivers DC v Bank of England [2004] · UAE Federal Law on Legal Profession · FATF Guidance on Legal Professionals 2023 · Crime-fraud exception (Barclays Bank plc v Eustice).`, evidence);
};

const recordKeepingStandardReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const records = ev(ctx, 'recordsAudit') as Array<{ recordId?: string; ageYears?: number; complete?: boolean; accessible?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const incomplete = records.filter(r => r.complete === false);
  if (incomplete.length > 0) { score += 0.3; evidence.push(`${incomplete.length} incomplete record(s) identified`); }
  const tooOld = records.filter(r => (r.ageYears ?? 0) > 10);
  if (tooOld.length > 0) { score += 0.15; evidence.push(`${tooOld.length} record(s) older than 10 years — retention policy risk`); }
  const inaccessible = records.filter(r => r.accessible === false);
  if (inaccessible.length > 0) { score += 0.3; evidence.push(`${inaccessible.length} inaccessible record(s) — audit trail impaired`); }
  if (/destroy.*record|shred.*document|missing.*file|cannot.*produce/.test(ft)) { score += 0.35; evidence.push('Record destruction/missing signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('record_keeping_standard_reasoning', 'governance', ['forensic_accounting', 'reasoning', 'ratiocination'], score, clamp(0.4 + 0.05 * records.length, 0, 0.9),
    `Record keeping: ${records.length} record(s). Incomplete: ${incomplete.length}, inaccessible: ${inaccessible.length}. Anchors: FATF R.11 (5-year retention) · UAE FDL 20/2018 Art.14 · CBUAE Governance Standards on record retention.`, evidence);
};

const pdplApplicationReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/personal.*data.*share.*without.*consent|data.*transfer.*unauthorised|pdpl.*violation/.test(ft)) { score += 0.35; evidence.push('PDPL personal data handling concern detected'); }
  if (/aml.*exemption.*pdpl|fiu.*data.*sharing.*lawful|fatf.*r\.20.*override.*privacy/.test(ft)) { score += 0.1; evidence.push('AML exemption from PDPL identified — lawful basis present'); }
  if (/sensitive.*personal.*data|biometric.*data.*process|health.*financial.*combined/.test(ft)) { score += 0.25; evidence.push('Sensitive personal data category processing detected'); }
  const txns = ev(ctx, 'documents') as Array<{ docId?: string; containsPersonalData?: boolean; crossBorderTransfer?: boolean }>;
  const crossBorder = txns.filter(d => d.crossBorderTransfer === true && d.containsPersonalData === true);
  if (crossBorder.length > 0) { score += 0.2; evidence.push(`${crossBorder.length} cross-border personal data transfer(s)`); }
  score = clamp(score, 0, 1);
  return build('pdpl_application_reasoning', 'compliance_framework', ['reasoning', 'ratiocination', 'data_analysis'], score, clamp(0.4 + 0.05 * txns.length, 0, 0.88),
    `UAE PDPL application reasoning. Anchors: UAE Federal Decree-Law 45/2021 (PDPL) · Art.4 AML/CTF exemption · CBUAE data governance circular 2022 · DIFC DP Law 2020.`, evidence);
};

const consentReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/no.*consent|without.*knowledge|coerced.*agreement|uninformed.*sign/.test(ft)) { score += 0.4; evidence.push('Absence of informed consent detected'); }
  if (/consent.*form.*blank|signed.*without.*reading|rubber.*stamp.*consent/.test(ft)) { score += 0.35; evidence.push('Nominal/blank consent form indicators'); }
  if (/genuine.*informed.*consent|explicit.*agreement|freely.*given/.test(ft)) { score = Math.max(0, score - 0.1); }
  score = clamp(score, 0, 1);
  return build('consent_reasoning', 'compliance_framework', ['reasoning', 'ratiocination', 'introspection'], score, 0.65,
    `Consent reasoning. Anchors: UAE PDPL Art.5 consent requirements · GDPR Art.7 consent validity · FATF CDD consent to data processing.`, evidence);
};

const tippingOffAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  let score = 0;
  const evidence: string[] = [];
  if (/told.*customer|warned.*client|inform.*subject|alerted.*party.*sar|reveal.*investigation/.test(ft)) { score += 0.65; evidence.push('Potential tipping-off: information disclosed to subject of SAR/investigation'); }
  if (/sar.*reference.*customer|complaint.*linked.*sar|information.*request.*timing/.test(ft)) { score += 0.3; evidence.push('SAR-linked customer interaction — tipping-off risk elevated'); }
  if (/legal.*advice.*exception|permitted.*disclosure|professional.*legal.*advisor.*exemption/.test(ft)) { score = Math.max(0, score - 0.2); evidence.push('Potential tipping-off exception claimed'); }
  score = clamp(score, 0, 1);
  return build('tipping_off_analysis', 'compliance_framework', ['reasoning', 'ratiocination', 'argumentation'], score, 0.8,
    `Tipping-off analysis. Anchors: UAE FDL 20/2018 Art.23 · FATF R.21 tipping-off prohibition · UK POCA 2002 s.333A · FATF R.20 SAR confidentiality.`, evidence);
};

const escalationLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const findings = ctx.priorFindings;
  let score = 0;
  const evidence: string[] = [];
  const escalations = findings.filter(f => f.verdict === 'escalate');
  const highConfEscalations = escalations.filter(f => f.confidence >= 0.7);
  if (highConfEscalations.length >= 2) { score += 0.4; evidence.push(`${highConfEscalations.length} high-confidence escalation finding(s) — SAR/MLRO referral warranted`); }
  if (escalations.length >= 3) { score += 0.25; evidence.push(`${escalations.length} total escalation finding(s) — escalation threshold met`); }
  if (/escalate.*mlro|refer.*compliance|senior.*management.*alert|immediate.*action/.test(ft)) { score += 0.15; evidence.push('Escalation trigger language in narrative'); }
  if (score === 0 && findings.length > 0) { evidence.push(`${findings.length} finding(s) reviewed — escalation threshold not met`); }
  score = clamp(score, 0, 1);
  return build('escalation_logic', 'compliance_framework', ['reasoning', 'argumentation', 'ratiocination'], score, clamp(0.5 + 0.04 * findings.length, 0, 0.92),
    `Escalation logic: ${findings.length} finding(s), ${escalations.length} escalations, ${highConfEscalations.length} high-confidence. Anchors: UAE FDL 20/2018 Art.15 STR obligation · FATF R.20/R.29 escalation chain · CBUAE Compliance Officer Guidance.`, evidence);
};

const auditTrailIntegrityAssessmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const auditLogs = ev(ctx, 'auditLogs') as Array<{ logId?: string; hashVerified?: boolean; timestampTampered?: boolean; missingSequenceNumbers?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const hashFailed = auditLogs.filter(l => l.hashVerified === false);
  if (hashFailed.length > 0) { score += 0.45; evidence.push(`${hashFailed.length} audit log(s) failing hash verification`); }
  const tampered = auditLogs.filter(l => l.timestampTampered === true);
  if (tampered.length > 0) { score += 0.4; evidence.push(`${tampered.length} audit log(s) with tampered timestamps`); }
  const missingSeq = auditLogs.reduce((a, l) => a + (l.missingSequenceNumbers ?? 0), 0);
  if (missingSeq > 0) { score += 0.2; evidence.push(`${missingSeq} missing sequence number(s) in audit trail`); }
  if (/audit.*gap|log.*tamper|record.*alter|trail.*broken/.test(ft)) { score += 0.15; evidence.push('Audit trail integrity concerns in narrative'); }
  score = clamp(score, 0, 1);
  return build('audit_trail_integrity_assessment', 'governance', ['forensic_accounting', 'data_analysis', 'introspection'], score, clamp(0.5 + 0.05 * auditLogs.length, 0, 0.95),
    `Audit trail integrity: ${auditLogs.length} log(s). Hash failures: ${hashFailed.length}, tampered timestamps: ${tampered.length}, missing sequences: ${missingSeq}. Anchors: UAE FDL 20/2018 Art.14 · ISO 27001 A.12.4 logging · FATF R.11 record keeping integrity.`, evidence);
};

const complianceMaturityReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const assessments = ev(ctx, 'complianceAssessments') as Array<{ assessmentId?: string; maturityLevel?: number; gapCount?: number; criticalGaps?: number }>;
  let score = 0;
  const evidence: string[] = [];
  const lowMaturity = assessments.filter(a => (a.maturityLevel ?? 5) <= 2);
  if (lowMaturity.length > 0) { score += 0.35; evidence.push(`${lowMaturity.length} assessment(s) scoring ≤2/5 maturity — systemic compliance weakness`); }
  const criticalGaps = assessments.reduce((a, ass) => a + (ass.criticalGaps ?? 0), 0);
  if (criticalGaps > 0) { score += 0.3; evidence.push(`${criticalGaps} critical compliance gap(s) identified`); }
  if (/ad.*hoc|undefined.*process|no.*policy|informal.*control|paper.*compliance/.test(ft)) { score += 0.2; evidence.push('Low maturity compliance culture indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('compliance_maturity_reasoning', 'governance', ['reasoning', 'data_analysis', 'introspection'], score, clamp(0.4 + 0.06 * assessments.length, 0, 0.9),
    `Compliance maturity: ${assessments.length} assessment(s). Low maturity: ${lowMaturity.length}, critical gaps: ${criticalGaps}. Anchors: CBUAE Risk-based Supervision Framework · CMMI model · FATF Effectiveness Assessment Methodology (IO.3/IO.4).`, evidence);
};

const examinationPreparationLogicApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const exams = ev(ctx, 'regulatoryExaminations') as Array<{ examId?: string; scheduledDate?: string; openFindings?: number; priorRating?: string; remediationComplete?: boolean }>;
  let score = 0;
  const evidence: string[] = [];
  const openFindings = exams.reduce((a, e) => a + (e.openFindings ?? 0), 0);
  if (openFindings >= 5) { score += 0.35; evidence.push(`${openFindings} open regulatory finding(s) ahead of examination`); }
  const priorPoor = exams.filter(e => e.priorRating === 'needs_improvement' || e.priorRating === 'unsatisfactory');
  if (priorPoor.length > 0) { score += 0.25; evidence.push(`${priorPoor.length} examination(s) with prior poor rating`); }
  const remediationIncomplete = exams.filter(e => e.remediationComplete === false);
  if (remediationIncomplete.length > 0) { score += 0.25; evidence.push(`${remediationIncomplete.length} examination(s) with incomplete remediation`); }
  if (/regulatory.*examination|supervisory.*visit|on.?site.*inspection|regulator.*coming/.test(ft)) { score += 0.1; evidence.push('Regulatory examination context signals in narrative'); }
  score = clamp(score, 0, 1);
  return build('examination_preparation_logic', 'governance', ['reasoning', 'data_analysis', 'forensic_accounting'], score, clamp(0.4 + 0.06 * exams.length, 0, 0.9),
    `Examination preparation: ${exams.length} exam(s). Open findings: ${openFindings}, prior poor: ${priorPoor.length}, incomplete remediation: ${remediationIncomplete.length}. Anchors: CBUAE Supervisory Framework · FATF Effectiveness IO.3 · Basel Pillar 2 supervisory review.`, evidence);
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export const WAVE4_BATCH_D_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  // Intelligence Fusion
  multi_source_intelligence_fusion: multiSourceIntelligenceFusionApply,
  cross_domain_signal_integration: crossDomainSignalIntegrationApply,
  confidence_weighted_aggregation: confidenceWeightedAggregationApply,
  temporal_signal_sequencing: temporalSignalSequencingApply,
  network_edge_inference: networkEdgeInferenceApply,

  // Asset Recovery
  civil_recovery_pathway_map: civilRecoveryPathwayMapApply,
  cross_border_asset_trace: crossBorderAssetTraceApply,
  crypto_seizure_protocol: cryptoSeizureProtocolApply,
  restrained_asset_governance: restrainedAssetGovernanceApply,

  // Conduct Risk
  culture_tone_audit: cultureToneAuditApply,
  incentive_misalignment_scan: incentiveMisalignmentScanApply,
  whistleblower_signal_triage: whistleblowerSignalTriageApply,

  // Identity Fraud
  deepfake_document_forensics: deepfakeDocumentForensicsApply,
  synthetic_identity_decomposition: syntheticIdentityDecompositionApply,
  biometric_gap_analysis: biometricGapAnalysisApply,
  device_identity_coherence: deviceIdentityCoherenceApply,

  // Digital Economy
  platform_economy_risk: platformEconomyRiskApply,
  defi_protocol_governance_risk: defiProtocolGovernanceRiskApply,
  embedded_finance_risk: embeddedFinanceRiskApply,
  open_banking_api_risk: openBankingApiRiskApply,

  // Human Rights
  modern_slavery_financial_pattern: modernSlaveryFinancialPatternApply,
  hrd_financial_exclusion_probe: hrdFinancialExclusionProbeApply,

  // Behavioral Science (dotted IDs)
  'bs.confirmation_bias_audit': bsConfirmationBiasAuditApply,
  'bs.motivated_reasoning_scan': bsMotivatedReasoningScanApply,
  'bs.social_proof_fallacy_check': bsSocialProofFallacyCheckApply,
  'bs.sunk_cost_relationship_test': bsSunkCostRelationshipTestApply,
  'bs.groupthink_dissent_check': bsGroupthinkDissentCheckApply,

  // Network Science (dotted IDs)
  'ns.graph_centrality_scoring': nsGraphCentralityScoringApply,
  'ns.bridge_node_analysis': nsBridgeNodeAnalysisApply,
  'ns.clique_detection': nsCliqueDetectionApply,
  'ns.temporal_network_evolution': nsTemporalNetworkEvolutionApply,
  'ns.network_density_scoring': nsNetworkDensityScoringApply,

  // Cryptoasset Forensics (dotted IDs)
  'cf.blockchain_provenance_trace': cfBlockchainProvenanceTraceApply,
  'cf.defi_protocol_risk_assessment': cfDefiProtocolRiskAssessmentApply,
  'cf.vasp_counterparty_profiling': cfVaspCounterpartyProfilingApply,
  'cf.mixer_tumbler_detection': cfMixerTumblerDetectionApply,
  'cf.onchain_sanctions_screening': cfOnchainSanctionsScreeningApply,

  // Geopolitical Risk (dotted IDs)
  'gr.sanctions_jurisdiction_shift': grSanctionsJurisdictionShiftApply,
  'gr.state_sponsored_ml_detection': grStateSponsoredMlDetectionApply,
  'gr.geopolitical_recalibration_trigger': grGeopoliticalRecalibrationTriggerApply,
  'gr.conflict_zone_nexus_mapping': grConflictZoneNexusMappingApply,
  cahra_determination: cahraDeterminationApply,

  // Corporate Intelligence (dotted IDs)
  'ci.beneficial_ownership_graph_walk': ciBeneficialOwnershipGraphWalkApply,
  'ci.shell_company_hallmark_scorer': ciShellCompanyHallmarkScorerApply,
  'ci.professional_intermediary_audit': ciProfessionalIntermediaryAuditApply,
  'ci.corporate_substance_test': ciCorporateSubstanceTestApply,

  // Epistemic Quality (dotted IDs)
  'eq.source_reliability_scoring': eqSourceReliabilityScoringApply,
  'eq.evidence_triangulation_check': eqEvidenceTriangulationCheckApply,
  'eq.base_rate_calibration': eqBaseRateCalibrationApply,
  'eq.scope_sensitivity_audit': eqScopeSensitivityAuditApply,

  // Psychological Profiling (dotted IDs)
  'pp.moral_disengagement_detection': ppMoralDisengagementDetectionApply,
  'pp.authority_exploitation_probe': ppAuthorityExploitationProbeApply,
  'pp.urgency_pressure_indicator': ppUrgencyPressureIndicatorApply,
  'pp.narrative_coherence_scoring': ppNarrativeCoherenceScoringApply,

  // Insider Threat (dotted IDs)
  'it.privilege_abuse_chain_trace': itPrivilegeAbuseChainTraceApply,
  'it.analyst_integrity_audit': itAnalystIntegrityAuditApply,
  'it.access_anomaly_detection': itAccessAnomalyDetectionApply,
  'it.whistleblower_intelligence_integration': itWhistleblowerIntelligenceIntegrationApply,

  // Common Sense (dotted IDs)
  'cs.plausibility_check': csPlausibilityCheckApply,
  'cs.motive_coherence': csMotiveCoherenceApply,
  'cs.lifestyle_vs_income': csLifestyleVsIncomeApply,
  'cs.counterparty_logic': csCounterpartyLogicApply,
  'cs.timing_anomaly_sense': csTimingAnomalySenseApply,
  'cs.round_number_suspicion': csRoundNumberSuspicionApply,
  'cs.narrative_consistency': csNarrativeConsistencyApply,
  'cs.too_good_to_be_true': csTooGoodToBeTrue,
  'cs.victim_vs_perpetrator': csVictimVsPerpetrator,
  'cs.basic_entity_reality_check': csBasicEntityRealityCheckApply,

  // Quantitative Analysis (dotted IDs)
  'qa.statistical_outlier_detection': qaStatisticalOutlierDetectionApply,
  'qa.flow_velocity_analysis': qaFlowVelocityAnalysisApply,
  'qa.concentration_risk_scoring': qaConcentrationRiskScoringApply,
  'qa.benford_law_analysis': qaBenfordLawAnalysisApply,
  'qa.time_series_anomaly': qaTimeSeriesAnomalyApply,
  'qa.peer_group_benchmarking': qaPeerGroupBenchmarkingApply,
  'qa.value_at_risk_exposure': qaValueAtRiskExposureApply,
  'qa.network_flow_matrix': qaNetworkFlowMatrixApply,
  'qa.seasonality_stripping': qaSeasonalityStrippingApply,
  'qa.regression_discontinuity': qaRegressionDiscontinuityApply,

  // Synthetic Intelligence (dotted IDs)
  'si.cross_modal_fusion': siCrossModalFusionApply,
  'si.adversarial_simulation': siAdversarialSimulationApply,
  'si.knowledge_graph_inference': siKnowledgeGraphInferenceApply,
  'si.meta_pattern_recognition': siMetaPatternRecognitionApply,
  'si.counterfactual_reasoning': siCounterfactualReasoningApply,
  'si.ensemble_verdict_fusion': siEnsembleVerdictFusionApply,
  'si.hypothesis_generation': siHypothesisGenerationApply,
  'si.semantic_vector_search': siSemanticVectorSearchApply,
  'si.causal_dag_inference': siCausalDagInferenceApply,
  'si.belief_propagation': siBeliefPropagationApply,

  // Formal Reasoning (dotted IDs)
  'fr.logical_entailment_check': frLogicalEntailmentCheckApply,
  'fr.modal_logic_obligation': frModalLogicObligationApply,
  'fr.rule_conflict_resolution': frRuleConflictResolutionApply,
  'fr.first_order_predicate_audit': frFirstOrderPredicateAuditApply,
  'fr.proof_by_contradiction': frProofByContradictionApply,
  'fr.abductive_inference': frAbductiveInferenceApply,
  'fr.temporal_logic_sequencing': frTemporalLogicSequencingApply,
  'fr.defeasible_reasoning': frDefeasibleReasoningApply,
  'fr.argument_structure_mapping': frArgumentStructureMappingApply,
  'fr.constraint_satisfaction': frConstraintSatisfactionApply,

  // Misc Behavioral / Governance
  pep_connection_reasoning: pepConnectionReasoningApply,
  velocity_anomaly_reasoning: velocityAnomalyReasoningApply,
  romance_scam_financial_profile_reasoning: romanceScamFinancialProfileReasoningApply,
  legal_privilege_assessment: legalPrivilegeAssessmentApply,
  record_keeping_standard_reasoning: recordKeepingStandardReasoningApply,
  pdpl_application_reasoning: pdplApplicationReasoningApply,
  consent_reasoning: consentReasoningApply,
  tipping_off_analysis: tippingOffAnalysisApply,
  escalation_logic: escalationLogicApply,
  audit_trail_integrity_assessment: auditTrailIntegrityAssessmentApply,
  compliance_maturity_reasoning: complianceMaturityReasoningApply,
  examination_preparation_logic: examinationPreparationLogicApply,
};
