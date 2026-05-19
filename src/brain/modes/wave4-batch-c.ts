// Hawkeye Sterling — wave-4 batch-C (53 modes).
// Anchors: FATF 40 Recommendations · UAE FDL 20/2018 · VARA Rulebooks · BCBS CBR Sound Management.

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

// ─── CRYPTO / DEFI ──────────────────────────────────────────────────────────

const addressPoisoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'transactions') as Array<{ toAddress?: string; amount?: number; note?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const dust = txs.filter(t => (t.amount ?? 0) < 0.0001);
  if (dust.length > 0) { score += 0.35; evidence.push(`${dust.length} dust transaction(s) detected (< 0.0001 units)`); }
  if (/look.?alike|address.*poison|vanity.*address|copycat.*wallet/.test(ft)) { score += 0.35; evidence.push('Address poisoning language in narrative'); }
  const repeated = txs.filter(t => t.note?.toLowerCase().includes('similar'));
  if (repeated.length > 0) { score += 0.2; evidence.push(`${repeated.length} transaction(s) flagged as similar-address`); }
  score = clamp(score, 0, 1);
  return build('address_poisoning', 'crypto_defi', ['intelligence', 'inference'], score, clamp(0.45 + 0.05 * dust.length, 0, 0.9),
    `Address poisoning screen: ${dust.length} dust tx(s). Anchors: FATF Guidance VASP 2023 · Chainalysis Address Poisoning Advisory 2023.`, evidence);
};

const chainHoppingVelocityApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const hops = ev(ctx, 'chainHops') as Array<{ fromChain?: string; toChain?: string; timestampMs?: number; valueUsd?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (hops.length >= 3) { score += 0.3; evidence.push(`${hops.length} cross-chain hops detected`); }
  const rapidHops = hops.filter((h, i) => i > 0 && (h.timestampMs ?? 0) - ((hops[i - 1]?.timestampMs) ?? 0) < 600_000);
  if (rapidHops.length >= 2) { score += 0.35; evidence.push(`${rapidHops.length} rapid hop(s) within 10-minute window`); }
  if (/bridge|cross.?chain|chain.*hop|wrapped|renBTC|wormhole/.test(ft)) { score += 0.15; evidence.push('Bridge/cross-chain keywords in narrative'); }
  score = clamp(score, 0, 1);
  return build('chain_hopping_velocity', 'crypto_defi', ['data_analysis', 'inference'], score, clamp(0.4 + 0.06 * hops.length, 0, 0.9),
    `Chain-hopping velocity: ${hops.length} hop(s), ${rapidHops.length} rapid. Anchors: FATF VASP Guidance 2023 · Elliptic Cross-Chain ML Report 2022.`, evidence);
};

const crossChainTaintApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const flows = ev(ctx, 'taintedFlows') as Array<{ sourceAddress?: string; taintPercent?: number; chain?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const highTaint = flows.filter(f => (f.taintPercent ?? 0) >= 50);
  if (highTaint.length > 0) { score += 0.4; evidence.push(`${highTaint.length} flow(s) with ≥50% taint`); }
  const chains = new Set(flows.map(f => f.chain)).size;
  if (chains >= 2) { score += 0.2; evidence.push(`Taint spans ${chains} chains`); }
  if (/sanctioned.*wallet|ofac.*address|tainted.*fund/.test(ft)) { score += 0.25; evidence.push('Sanctioned/tainted fund language in narrative'); }
  score = clamp(score, 0, 1);
  return build('cross_chain_taint', 'crypto_defi', ['data_analysis', 'intelligence'], score, clamp(0.5 + 0.04 * flows.length, 0, 0.92),
    `Cross-chain taint: ${flows.length} flow(s), ${highTaint.length} high-taint. Anchors: FATF R.15 · Chainalysis Reactor cross-chain tracing.`, evidence);
};

const privacyPoolExposureApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const pools = ev(ctx, 'privacyPools') as Array<{ poolType?: string; depositValueUsd?: number; withdrawalValueUsd?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (pools.length > 0) { score += 0.4; evidence.push(`${pools.length} privacy pool interaction(s)`); }
  const highValue = pools.filter(p => (p.depositValueUsd ?? 0) >= 10_000 || (p.withdrawalValueUsd ?? 0) >= 10_000);
  if (highValue.length > 0) { score += 0.25; evidence.push(`${highValue.length} high-value pool interaction(s) ≥$10k`); }
  if (/tornado|mixer|coinjoin|privacy.*pool|zk.*shield/.test(ft)) { score += 0.2; evidence.push('Privacy tool keywords in narrative'); }
  score = clamp(score, 0, 1);
  return build('privacy_pool_exposure', 'crypto_defi', ['intelligence', 'inference'], score, clamp(0.45 + 0.08 * pools.length, 0, 0.92),
    `Privacy pool exposure: ${pools.length} pool(s), ${highValue.length} high-value. Anchors: OFAC Tornado Cash SDN 2022 · FATF VASP R.15 · FinCEN Mixing Advisory 2022.`, evidence);
};

const changeAddressHeuristicApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'utxoTransactions') as Array<{ changeAddress?: string; changeValueBtc?: number; inputCount?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const multiChange = txs.filter(t => (t.inputCount ?? 0) >= 5);
  if (multiChange.length > 0) { score += 0.2; evidence.push(`${multiChange.length} transaction(s) with ≥5 inputs (consolidation)`); }
  const largeChange = txs.filter(t => (t.changeValueBtc ?? 0) > 0.5);
  if (largeChange.length > 0) { score += 0.25; evidence.push(`${largeChange.length} tx(s) with large change output > 0.5 BTC`); }
  if (/consolidat|peel.*chain|change.*address|coinjoin/.test(ft)) { score += 0.15; evidence.push('Consolidation/peel-chain language'); }
  score = clamp(score, 0, 1);
  return build('change_address_heuristic', 'crypto_defi', ['data_analysis', 'inference'], score, clamp(0.4 + 0.05 * txs.length, 0, 0.88),
    `Change address heuristic: ${txs.length} UTXO tx(s). Anchors: Meiklejohn et al. USENIX 2013 · CipherTrace UTXO clustering.`, evidence);
};

const dustingAttackPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'dustingTransactions') as Array<{ dustSatoshis?: number; recipientCount?: number; timestampMs?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (txs.length >= 2) { score += 0.35; evidence.push(`${txs.length} dusting transaction(s) identified`); }
  const broadDust = txs.filter(t => (t.recipientCount ?? 0) > 100);
  if (broadDust.length > 0) { score += 0.3; evidence.push(`Broad dusting: ${broadDust[0]?.recipientCount ?? 0} recipients`); }
  if (/dust.*attack|address.*link|deanonymis/.test(ft)) { score += 0.15; evidence.push('Dusting/deanonymisation keywords'); }
  score = clamp(score, 0, 1);
  return build('dusting_attack_pattern', 'crypto_defi', ['intelligence', 'data_analysis'], score, clamp(0.45 + 0.07 * txs.length, 0, 0.9),
    `Dusting attack pattern: ${txs.length} batch(es). Anchors: Binance Research Dusting Attack Report 2019 · FATF VASP guidance.`, evidence);
};

const travelRuleGapAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const transfers = ev(ctx, 'vaspTransfers') as Array<{ amountUsd?: number; origVasp?: string; benefVasp?: string; travelRuleInfo?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const above1k = transfers.filter(t => (t.amountUsd ?? 0) >= 1_000);
  const missing = above1k.filter(t => !t.travelRuleInfo);
  if (missing.length > 0) { score += 0.4; evidence.push(`${missing.length}/${above1k.length} transfers ≥$1k missing Travel Rule info`); }
  const noOriginator = transfers.filter(t => !t.origVasp);
  if (noOriginator.length > 0) { score += 0.2; evidence.push(`${noOriginator.length} transfer(s) without originator VASP identified`); }
  if (/travel.*rule|wire.*transfer.*gap|sunrise.*issue/.test(ft)) { score += 0.1; evidence.push('Travel Rule gap language in narrative'); }
  score = clamp(score, 0, 1);
  return build('travel_rule_gap_analysis', 'crypto_defi', ['reasoning', 'data_analysis'], score, clamp(0.5 + 0.04 * transfers.length, 0, 0.9),
    `Travel Rule gap: ${missing.length}/${above1k.length} transfers non-compliant. Anchors: FATF R.16 · UAE CBUAE Travel Rule Notice 2023.`, evidence);
};

const cryptoRansomwareCashoutApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const wallets = ev(ctx, 'ransomwareWallets') as Array<{ walletId?: string; valueBtc?: number; exchangeDestination?: string }>;
  const evidence: string[] = [];
  let score = 0;
  if (wallets.length > 0) { score += 0.5; evidence.push(`${wallets.length} ransomware-linked wallet(s) detected`); }
  const highValue = wallets.filter(w => (w.valueBtc ?? 0) > 1);
  if (highValue.length > 0) { score += 0.2; evidence.push(`${highValue.length} high-value cashout(s) > 1 BTC`); }
  if (/ransomware|lockbit|revil|conti|darkside|encrypt.*payment/.test(ft)) { score += 0.2; evidence.push('Ransomware family/terminology in narrative'); }
  score = clamp(score, 0, 1);
  return build('crypto_ransomware_cashout', 'crypto_defi', ['intelligence', 'intelligence'], score, clamp(0.5 + 0.08 * wallets.length, 0, 0.95),
    `Ransomware cashout screen: ${wallets.length} linked wallet(s). Anchors: FinCEN Advisory 2021 Ransomware · OFAC Ransomware Advisory · FATF Cybercrime ML.`, evidence);
};

const p2pExchangeRiskApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const trades = ev(ctx, 'p2pTrades') as Array<{ platform?: string; amountUsd?: number; kycVerified?: boolean; counterpartyJurisdiction?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const unverified = trades.filter(t => !t.kycVerified);
  if (unverified.length > 0) { score += 0.3; evidence.push(`${unverified.length} P2P trade(s) with unverified counterparty`); }
  const highValue = trades.filter(t => (t.amountUsd ?? 0) >= 5_000);
  if (highValue.length > 0) { score += 0.25; evidence.push(`${highValue.length} high-value P2P trade(s) ≥$5k`); }
  if (/localbitcoin|paxful|p2p.*exchang|unregulated.*exchang/.test(ft)) { score += 0.15; evidence.push('P2P exchange platform reference'); }
  score = clamp(score, 0, 1);
  return build('p2p_exchange_risk', 'crypto_defi', ['reasoning', 'inference'], score, clamp(0.4 + 0.05 * trades.length, 0, 0.88),
    `P2P exchange risk: ${trades.length} trade(s), ${unverified.length} unverified. Anchors: FATF VASP R.15 · CBUAE VASP Guidance · FinCEN P2P Advisory.`, evidence);
};

// ─── PREDICATE CRIME ────────────────────────────────────────────────────────

const predicateCrimeCascadeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const predicates = ev(ctx, 'predicateOffences') as Array<{ offenceType?: string; severity?: number; jurisdiction?: string }>;
  const evidence: string[] = [];
  let score = 0;
  if (predicates.length >= 1) { score += 0.3; evidence.push(`${predicates.length} predicate offence(s) identified`); }
  const severe = predicates.filter(p => (p.severity ?? 0) >= 0.7);
  if (severe.length > 0) { score += 0.3; evidence.push(`${severe.length} severe predicate(s) (severity ≥0.7)`); }
  if (/predicate.*offence|underlying.*crime|FATF.*predicate/.test(ft)) { score += 0.1; evidence.push('Predicate offence language in narrative'); }
  const priorEsc = ctx.priorFindings.filter(f => f.verdict === 'escalate');
  if (priorEsc.length >= 2) { score += 0.15; evidence.push(`${priorEsc.length} prior escalations cascade to predicate`); }
  score = clamp(score, 0, 1);
  return build('predicate_crime_cascade', 'predicate_crime', ['reasoning', 'intelligence', 'inference'], score, clamp(0.45 + 0.07 * predicates.length, 0, 0.92),
    `Predicate crime cascade: ${predicates.length} offence(s). Anchors: FATF R.3 · UAE AML Law Art.2 predicate list · Palermo Convention.`, evidence);
};

const environmentalPredicateApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/illegal.*mining|gold.*smug|conflict.*mineral|illegal.*logging|poach|wildlife.*traffic/.test(ft)) { score += 0.4; evidence.push('Environmental crime indicators in narrative'); }
  const payments = ev(ctx, 'cashPayments') as Array<{ amountUsd?: number; purpose?: string }>;
  const envPayments = payments.filter(p => /timber|mineral|gold|wildlife|forest/.test(p.purpose ?? ''));
  if (envPayments.length > 0) { score += 0.25; evidence.push(`${envPayments.length} payment(s) linked to environmental sectors`); }
  if (/CITES|WWF.*report|Interpol.*environment/.test(ft)) { score += 0.15; evidence.push('Environmental crime enforcement reference'); }
  score = clamp(score, 0, 1);
  return build('environmental_predicate', 'predicate_crime', ['reasoning', 'intelligence'], score, 0.65,
    `Environmental predicate: illegal mining/logging/wildlife patterns. Anchors: FATF R.3 · UNODC Environmental Crime 2021 · CITES Appendix.`, evidence);
};

const taxEvasionPredicateApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/tax.*evas|offshore.*account|undeclared.*income|tax.*haven|CRS.*gap/.test(ft)) { score += 0.35; evidence.push('Tax evasion indicators in narrative'); }
  const accounts = ev(ctx, 'offshoreAccounts') as Array<{ jurisdiction?: string; balanceUsd?: number }>;
  if (accounts.length > 0) { score += 0.25; evidence.push(`${accounts.length} offshore account(s) in low/no-tax jurisdictions`); }
  const fiu = ev(ctx, 'fiuReferrals') as Array<{ reason?: string }>;
  const taxFiu = fiu.filter(f => /tax/.test(f.reason ?? ''));
  if (taxFiu.length > 0) { score += 0.2; evidence.push(`${taxFiu.length} FIU referral(s) tax-related`); }
  score = clamp(score, 0, 1);
  return build('tax_evasion_predicate', 'predicate_crime', ['reasoning', 'reasoning'], score, 0.7,
    `Tax evasion predicate screen. Anchors: FATF R.3 · OECD Global Forum CRS · UAE MOF Tax Compliance.`, evidence);
};

const insiderTradingPredicateApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/insider.*trad|material.*non-public|MNPI|front.*run|tipping.*off.*securities/.test(ft)) { score += 0.4; evidence.push('Insider trading language in narrative'); }
  const trades = ev(ctx, 'securitiesTrades') as Array<{ preAnnouncementDays?: number; profitUsd?: number }>;
  const suspicious = trades.filter(t => (t.preAnnouncementDays ?? 99) <= 5 && (t.profitUsd ?? 0) > 5_000);
  if (suspicious.length > 0) { score += 0.35; evidence.push(`${suspicious.length} trade(s) within 5 days of announcement with profit`); }
  score = clamp(score, 0, 1);
  return build('insider_trading_predicate', 'predicate_crime', ['data_analysis', 'reasoning'], score, 0.7,
    `Insider trading predicate. Anchors: FATF R.3 · UAE SCA Market Conduct Regulations · IOSCO Principles.`, evidence);
};

const cybercrimePredicate = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/ransomware|phishing|BEC|business.*email.*compromise|hacking|data.*breach.*proceed/.test(ft)) { score += 0.4; evidence.push('Cybercrime proceeds language in narrative'); }
  const wallets = ev(ctx, 'cryptoWallets') as Array<{ chainflags?: string[] }>;
  const flagged = wallets.filter(w => (w.chainflags ?? []).includes('cybercrime'));
  if (flagged.length > 0) { score += 0.3; evidence.push(`${flagged.length} wallet(s) flagged cybercrime by chain analytics`); }
  score = clamp(score, 0, 1);
  return build('cyber_crime_predicate', 'predicate_crime', ['intelligence', 'intelligence'], score, 0.68,
    `Cybercrime predicate screen. Anchors: FATF R.3 · Budapest Convention · FinCEN Cybercrime Advisory.`, evidence);
};

const humanTraffickingPredicateApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/human.*traffic|forced.*labour|modern.*slaver|sex.*traffic|debt.*bondage/.test(ft)) { score += 0.45; evidence.push('Human trafficking language in narrative'); }
  const txs = ev(ctx, 'transactions') as Array<{ amount?: number; frequencyPerMonth?: number; recipientType?: string }>;
  const salaryLike = txs.filter(t => t.recipientType === 'individual' && (t.frequencyPerMonth ?? 0) >= 4 && (t.amount ?? 0) < 500);
  if (salaryLike.length > 0) { score += 0.2; evidence.push(`${salaryLike.length} regular small payment(s) — potential victim/mule payments`); }
  score = clamp(score, 0, 1);
  return build('human_trafficking_predicate', 'predicate_crime', ['reasoning', 'intelligence'], score, 0.72,
    `Human trafficking predicate. Anchors: FATF Guidance on ML from HT 2018 · Palermo Protocol · UAE Anti-HT Law 51/2006.`, evidence);
};

const thresholdSplitDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'transactions') as Array<{ amount?: number; timestampMs?: number; counterpartyId?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const threshold = 10_000;
  const near = txs.filter(t => t.amount !== undefined && t.amount >= threshold * 0.8 && t.amount < threshold);
  if (near.length >= 2) { score += 0.35; evidence.push(`${near.length} transaction(s) just below $10k threshold`); }
  const grouped = txs.reduce<Record<string, number[]>>((a, t) => {
    if (t.counterpartyId) { a[t.counterpartyId] = [...(a[t.counterpartyId] ?? []), t.amount ?? 0]; }
    return a;
  }, {});
  for (const [cp, amounts] of Object.entries(grouped)) {
    if (amounts.length >= 3 && amounts.reduce((a, b) => a + b, 0) >= threshold && amounts.every(a => a < threshold)) {
      score += 0.3; evidence.push(`Counterparty ${cp}: ${amounts.length} split tx(s) totalling ≥$10k`); break;
    }
  }
  if (/structur|smurfing|split.*deposit|threshold.*avoid/.test(ft)) { score += 0.1; evidence.push('Structuring language in narrative'); }
  score = clamp(score, 0, 1);
  return build('threshold_split_detection', 'predicate_crime', ['data_analysis', 'inference'], score, clamp(0.5 + 0.06 * near.length, 0, 0.92),
    `Threshold split detection: ${near.length} sub-threshold tx(s). Anchors: UAE FDL Art.14(2) structuring prohibition · FinCEN SAR Activity Review Structuring 2022.`, evidence);
};

const offshorLayeringApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const accounts = ev(ctx, 'offshoreAccounts') as Array<{ jurisdiction?: string; balanceUsd?: number; numberOfLayers?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const highLayer = accounts.filter(a => (a.numberOfLayers ?? 0) >= 3);
  if (highLayer.length > 0) { score += 0.35; evidence.push(`${highLayer.length} account(s) with ≥3 layering steps`); }
  const multiJuris = new Set(accounts.map(a => a.jurisdiction)).size;
  if (multiJuris >= 3) { score += 0.25; evidence.push(`Layering spans ${multiJuris} jurisdictions`); }
  if (/shell.*company|offshore.*layer|nominee.*director|round.*trip/.test(ft)) { score += 0.15; evidence.push('Offshore layering language in narrative'); }
  score = clamp(score, 0, 1);
  return build('offshore_layering', 'predicate_crime', ['reasoning', 'data_analysis'], score, clamp(0.45 + 0.06 * accounts.length, 0, 0.92),
    `Offshore layering: ${accounts.length} offshore account(s), ${multiJuris} jurisdictions, ${highLayer.length} deep-layered. Anchors: FATF Typologies on Layering 2023 · Egmont Group WP.`, evidence);
};

const structuringPatternReasoningApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'transactions') as Array<{ amount?: number; channel?: string; dateStr?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const amounts = txs.map(t => t.amount ?? 0);
  const mean = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const lowVar = amounts.length >= 5 && amounts.every(a => Math.abs(a - mean) < mean * 0.1);
  if (lowVar) { score += 0.3; evidence.push(`Low-variance transaction pattern: mean $${mean.toFixed(0)}, all within 10%`); }
  const below = amounts.filter(a => a >= 8_000 && a < 10_000).length;
  if (below >= 3) { score += 0.35; evidence.push(`${below} transaction(s) in $8k–$10k structuring band`); }
  if (/structur|smurf|break.*up|deliberate.*split/.test(ft)) { score += 0.1; evidence.push('Structuring intent language'); }
  score = clamp(score, 0, 1);
  return build('structuring_pattern_reasoning', 'predicate_crime', ['data_analysis', 'ratiocination'], score, clamp(0.5 + 0.05 * txs.length, 0, 0.92),
    `Structuring pattern reasoning: ${txs.length} tx(s) analysed. Anchors: UAE FDL Art.14 · FATF R.29 cash threshold reporting.`, evidence);
};

// ─── PROLIFERATION FINANCING ─────────────────────────────────────────────────

const pfRedFlagScreenApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/dual.use|export.*control|military.*end.user|WMD|CBRN|nuclear|missile|precursor.*chemical/.test(ft)) { score += 0.4; evidence.push('PF/dual-use language in narrative'); }
  const sanctions = ev(ctx, 'sanctionsHits') as Array<{ programme?: string }>;
  const pfSanctions = sanctions.filter(s => /DPRK|Iran|proliferation|weapons/.test(s.programme ?? ''));
  if (pfSanctions.length > 0) { score += 0.35; evidence.push(`${pfSanctions.length} proliferation-related sanctions hit(s)`); }
  if (/unusual.*route|third.*country.*transship|freight.*forwarder.*uncontact/.test(ft)) { score += 0.15; evidence.push('Unusual routing/transshipment indicators'); }
  score = clamp(score, 0, 1);
  return build('pf_red_flag_screen', 'proliferation', ['reasoning', 'intelligence', 'intelligence'], score, 0.75,
    `PF red-flag screen. Anchors: FATF Guidance on PF 2021 · UNSCR 1540 · UAE FDL Art.3 PF offences.`, evidence);
};

const dualUseEndUserApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const goods = ev(ctx, 'tradeGoods') as Array<{ hsCode?: string; endUser?: string; endUseStatement?: boolean; destinationCountry?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const noEndUse = goods.filter(g => !g.endUseStatement);
  if (noEndUse.length > 0) { score += 0.35; evidence.push(`${noEndUse.length} shipment(s) without end-use certificate`); }
  const riskyDest = goods.filter(g => /DPRK|North Korea|Iran|Syria|Belarus|Russia/.test(g.destinationCountry ?? ''));
  if (riskyDest.length > 0) { score += 0.35; evidence.push(`${riskyDest.length} shipment(s) to sanctioned/restricted destination`); }
  if (/dual.use|CCN|ECCN|export.*licen/.test(ft)) { score += 0.1; evidence.push('Export control terminology in narrative'); }
  score = clamp(score, 0, 1);
  return build('dual_use_end_user', 'proliferation', ['reasoning', 'data_analysis'], score, 0.72,
    `Dual-use end-user check: ${goods.length} items, ${noEndUse.length} no EUC, ${riskyDest.length} risky destination. Anchors: EU 2021/821 Dual-Use Regulation · BIS EAR · UAE Strategic Goods Executive Order.`, evidence);
};

const sanctionsEvasionNetworkApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const entities = ev(ctx, 'networkEntities') as Array<{ entityId?: string; sanctioned?: boolean; connectedToSanctioned?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const directSanctioned = entities.filter(e => e.sanctioned);
  if (directSanctioned.length > 0) { score += 0.5; evidence.push(`${directSanctioned.length} directly sanctioned entity/ies in network`); }
  const indirectSanctioned = entities.filter(e => !e.sanctioned && e.connectedToSanctioned);
  if (indirectSanctioned.length >= 2) { score += 0.25; evidence.push(`${indirectSanctioned.length} entity/ies connected to sanctioned parties`); }
  if (/front.*company|straw.*party|evasion.*network|sanctions.*bust/.test(ft)) { score += 0.1; evidence.push('Evasion network language'); }
  score = clamp(score, 0, 1);
  return build('sanctions_evasion_network', 'proliferation', ['intelligence', 'intelligence', 'inference'], score, clamp(0.5 + 0.06 * entities.length, 0, 0.95),
    `Sanctions evasion network: ${directSanctioned.length} sanctioned, ${indirectSanctioned.length} connected. Anchors: OFAC SDN · FATF R.6 targeted sanctions · UN 1267 Committee.`, evidence);
};

const shipFlagHopAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const vessels = ev(ctx, 'vessels') as Array<{ mmsi?: string; flagHistory?: string[]; aisGapHours?: number; lastPort?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const flagHoppers = vessels.filter(v => (v.flagHistory?.length ?? 0) >= 3);
  if (flagHoppers.length > 0) { score += 0.3; evidence.push(`${flagHoppers.length} vessel(s) with ≥3 flag changes`); }
  const aisGap = vessels.filter(v => (v.aisGapHours ?? 0) >= 24);
  if (aisGap.length > 0) { score += 0.3; evidence.push(`${aisGap.length} vessel(s) with AIS gap ≥24h`); }
  if (/dark.*fleet|flag.*hop|AIS.*off|phantom.*vessel|ship.to.ship/.test(ft)) { score += 0.2; evidence.push('Dark fleet/flag-hopping language'); }
  score = clamp(score, 0, 1);
  return build('ship_flag_hop_analysis', 'proliferation', ['intelligence', 'data_analysis'], score, clamp(0.45 + 0.07 * vessels.length, 0, 0.92),
    `Ship flag-hop analysis: ${vessels.length} vessel(s), ${flagHoppers.length} flag-hopped, ${aisGap.length} AIS gap. Anchors: FATF PF Guidance 2021 · OFAC Vessel Advisory · UNSCR 1718/2094.`, evidence);
};

// ─── CORRESPONDENT BANKING ──────────────────────────────────────────────────

const cbrRiskMatrixApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const banks = ev(ctx, 'correspondentBanks') as Array<{ bankId?: string; jurisdictionRisk?: number; amlRating?: string; payableThroughAccounts?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const highRisk = banks.filter(b => (b.jurisdictionRisk ?? 0) >= 0.7 || b.amlRating === 'poor');
  if (highRisk.length > 0) { score += 0.4; evidence.push(`${highRisk.length} high-risk correspondent bank(s)`); }
  const pta = banks.filter(b => b.payableThroughAccounts);
  if (pta.length > 0) { score += 0.2; evidence.push(`${pta.length} bank(s) with payable-through accounts`); }
  if (/correspondent.*risk|respondent.*bank.*weak|NOSTRO.*vostro.*concern/.test(ft)) { score += 0.1; evidence.push('CBR risk language in narrative'); }
  score = clamp(score, 0, 1);
  return build('cbr_risk_matrix', 'correspondent_banking', ['reasoning', 'data_analysis'], score, clamp(0.5 + 0.06 * banks.length, 0, 0.9),
    `CBR risk matrix: ${banks.length} correspondent(s), ${highRisk.length} high-risk. Anchors: BCBS Sound Management of Risks CBR 2016 · FATF R.13 · CBUAE CBR Guidance.`, evidence);
};

const nestedAccountDetectionApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const accounts = ev(ctx, 'accounts') as Array<{ accountType?: string; subAccountCount?: number; ultimateBeneficiary?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const nested = accounts.filter(a => a.accountType === 'nested' || (a.subAccountCount ?? 0) >= 3);
  if (nested.length > 0) { score += 0.4; evidence.push(`${nested.length} nested/sub-account structure(s) detected`); }
  const unknownBene = accounts.filter(a => !a.ultimateBeneficiary);
  if (unknownBene.length > 0) { score += 0.2; evidence.push(`${unknownBene.length} account(s) with unknown ultimate beneficiary`); }
  if (/nested.*account|VASP.*nested|sub.account.*hidden/.test(ft)) { score += 0.15; evidence.push('Nested account language in narrative'); }
  score = clamp(score, 0, 1);
  return build('nested_account_detection', 'correspondent_banking', ['data_analysis', 'inference'], score, clamp(0.45 + 0.07 * accounts.length, 0, 0.9),
    `Nested account detection: ${nested.length} nested structure(s), ${unknownBene.length} unknown beneficiary. Anchors: FATF Guidance Nested Relationships · BCBS CBR Sound Management.`, evidence);
};

const payableThroughAccountApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const txs = ev(ctx, 'transactions') as Array<{ routedThroughThirdParty?: boolean; ultimateOrigin?: string; amount?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const pta = txs.filter(t => t.routedThroughThirdParty);
  if (pta.length > 0) { score += 0.4; evidence.push(`${pta.length} transaction(s) routed through third-party PTA`); }
  const unknownOrigin = txs.filter(t => !t.ultimateOrigin);
  if (unknownOrigin.length > 0) { score += 0.2; evidence.push(`${unknownOrigin.length} transaction(s) with unknown ultimate origin`); }
  if (/payable.through|PTA|omnibus.*account|pass.through.*banking/.test(ft)) { score += 0.15; evidence.push('PTA language in narrative'); }
  score = clamp(score, 0, 1);
  return build('payable_through_account', 'correspondent_banking', ['reasoning', 'data_analysis'], score, clamp(0.45 + 0.06 * txs.length, 0, 0.9),
    `Payable-through account risk: ${pta.length} PTA-routed, ${unknownOrigin.length} unknown origin. Anchors: FATF R.13 · FinCEN PTA Guidance · BCBS CBR 2016.`, evidence);
};

const cbrDueDiligenceCascadeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const banks = ev(ctx, 'correspondentBanks') as Array<{ bankId?: string; ddLevel?: string; lastReviewDays?: number; amlFrameworkScore?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const noEdd = banks.filter(b => b.ddLevel !== 'enhanced');
  if (noEdd.length > 0) { score += 0.25; evidence.push(`${noEdd.length} correspondent(s) without EDD`); }
  const stale = banks.filter(b => (b.lastReviewDays ?? 0) > 365);
  if (stale.length > 0) { score += 0.25; evidence.push(`${stale.length} correspondent(s) not reviewed in 12+ months`); }
  const weakAml = banks.filter(b => (b.amlFrameworkScore ?? 1) < 0.5);
  if (weakAml.length > 0) { score += 0.2; evidence.push(`${weakAml.length} correspondent(s) with weak AML framework score`); }
  score = clamp(score, 0, 1);
  return build('cbr_due_diligence_cascade', 'correspondent_banking', ['reasoning', 'reasoning'], score, clamp(0.45 + 0.06 * banks.length, 0, 0.9),
    `CBR DD cascade: ${banks.length} banks assessed, ${noEdd.length} no EDD, ${stale.length} stale reviews. Anchors: FATF R.13 · BCBS CBR 2016 · CBUAE CBR Guidance 2023.`, evidence);
};

// ─── HAWALA / IVT ───────────────────────────────────────────────────────────

const hawalaNetworkMapApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const hawaladars = ev(ctx, 'hawaladars') as Array<{ agentId?: string; jurisdiction?: string; volumeUsd?: number; licensed?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  if (hawaladars.length >= 2) { score += 0.35; evidence.push(`${hawaladars.length} hawaladar(s)/IVT agent(s) identified`); }
  const unlicensed = hawaladars.filter(h => !h.licensed);
  if (unlicensed.length > 0) { score += 0.3; evidence.push(`${unlicensed.length} unlicensed hawaladar(s) detected`); }
  if (/hawala|hundi|fei.ch'ien|black.*market.*exchange|informal.*value.*transfer/.test(ft)) { score += 0.15; evidence.push('Hawala/IVT terminology in narrative'); }
  score = clamp(score, 0, 1);
  return build('hawala_network_map', 'hawala_ivt', ['intelligence', 'inference', 'data_analysis'], score, clamp(0.45 + 0.07 * hawaladars.length, 0, 0.92),
    `Hawala network map: ${hawaladars.length} agent(s), ${unlicensed.length} unlicensed. Anchors: FATF Guidance on Hawala 2013 · UAE CBUAE Exchange Houses · FATF R.14.`, evidence);
};

const settlementCommodityFlowApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const commodities = ev(ctx, 'commodityFlows') as Array<{ commodity?: string; valueUsd?: number; invoicedValueUsd?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const mispriced = commodities.filter(c => {
    const ratio = ((c.valueUsd ?? 0) / (c.invoicedValueUsd ?? 1));
    return ratio < 0.5 || ratio > 2.0;
  });
  if (mispriced.length > 0) { score += 0.4; evidence.push(`${mispriced.length} commodity flow(s) with value mismatch >50%`); }
  if (/commodity.*settlement|gold.*barter|trade.*settle.*hawala/.test(ft)) { score += 0.2; evidence.push('Commodity-settlement language in narrative'); }
  score = clamp(score, 0, 1);
  return build('settlement_commodity_flow', 'hawala_ivt', ['data_analysis', 'inference'], score, clamp(0.45 + 0.07 * commodities.length, 0, 0.9),
    `Settlement commodity flow: ${commodities.length} flow(s), ${mispriced.length} mispriced. Anchors: FATF TBML Report 2006 · Hawala settlement through commodities typology.`, evidence);
};

const valueEquivalenceCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const transfers = ev(ctx, 'valueTransfers') as Array<{ sendValueUsd?: number; receiveValueUsd?: number; channel?: string }>;
  const evidence: string[] = [];
  let score = 0;
  for (const t of transfers) {
    const diff = Math.abs((t.sendValueUsd ?? 0) - (t.receiveValueUsd ?? 0));
    const pct = diff / Math.max(t.sendValueUsd ?? 1, 1);
    if (pct <= 0.05 && t.channel === 'informal') { score += 0.35; evidence.push(`Near-exact value match via informal channel: $${t.sendValueUsd} → $${t.receiveValueUsd}`); break; }
  }
  if (/value.*equivalence|mirror.*transfer|offsetting.*payment/.test(ft)) { score += 0.2; evidence.push('Value equivalence language'); }
  score = clamp(score, 0, 1);
  return build('value_equivalence_check', 'hawala_ivt', ['data_analysis', 'ratiocination'], score, 0.65,
    `Value equivalence check: ${transfers.length} transfer pair(s) assessed. Anchors: FATF IVT Typologies · Egmont Group Hawala Case Studies.`, evidence);
};

// ─── FREE TRADE ZONE ────────────────────────────────────────────────────────

const ftzOpacityScreenApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const entities = ev(ctx, 'ftzEntities') as Array<{ zone?: string; ownershipDisclosed?: boolean; physicalPresence?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const noOwnership = entities.filter(e => !e.ownershipDisclosed);
  if (noOwnership.length > 0) { score += 0.35; evidence.push(`${noOwnership.length} FTZ entity/ies without disclosed ownership`); }
  const noPresence = entities.filter(e => !e.physicalPresence);
  if (noPresence.length > 0) { score += 0.2; evidence.push(`${noPresence.length} FTZ entity/ies lacking physical presence`); }
  if (/free.*trade.*zone|FTZ.*opac|JAFZA|DMCC.*shell|re.export.*discrepan/.test(ft)) { score += 0.15; evidence.push('FTZ opacity indicators in narrative'); }
  score = clamp(score, 0, 1);
  return build('ftz_opacity_screen', 'ftz_risk', ['reasoning', 'intelligence'], score, clamp(0.45 + 0.07 * entities.length, 0, 0.9),
    `FTZ opacity screen: ${entities.length} entity/ies, ${noOwnership.length} opaque ownership. Anchors: FATF FTZ Guidance 2010 · UAE CBUAE FTZ AML Supervision · MENAFATF Typologies.`, evidence);
};

const reExportDiscrepancyApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const shipments = ev(ctx, 'reExportShipments') as Array<{ originCountry?: string; destinationCountry?: string; declaredValue?: number; marketValue?: number; commodity?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const mispriced = shipments.filter(s => {
    const r = (s.declaredValue ?? 0) / Math.max(s.marketValue ?? 1, 1);
    return r < 0.6 || r > 1.6;
  });
  if (mispriced.length > 0) { score += 0.4; evidence.push(`${mispriced.length} re-export shipment(s) with price discrepancy >40%`); }
  const sanctionedDest = shipments.filter(s => /Iran|DPRK|Russia|Syria/.test(s.destinationCountry ?? ''));
  if (sanctionedDest.length > 0) { score += 0.35; evidence.push(`${sanctionedDest.length} re-export(s) to sanctioned jurisdiction`); }
  score = clamp(score, 0, 1);
  return build('re_export_discrepancy', 'ftz_risk', ['data_analysis', 'reasoning'], score, clamp(0.5 + 0.07 * shipments.length, 0, 0.92),
    `Re-export discrepancy: ${shipments.length} shipment(s), ${mispriced.length} mispriced, ${sanctionedDest.length} sanctioned destination. Anchors: FATF TBML 2006 · UAE MOE Strategic Goods.`, evidence);
};

// ─── PROFESSIONAL ML ────────────────────────────────────────────────────────

const professionalMlEcosystemApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const professionals = ev(ctx, 'enablers') as Array<{ role?: string; gatekeeper?: boolean; structuredTransactions?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const gatekeepers = professionals.filter(p => p.gatekeeper);
  if (gatekeepers.length > 0) { score += 0.35; evidence.push(`${gatekeepers.length} professional gatekeeper(s) identified`); }
  const structured = professionals.filter(p => p.structuredTransactions);
  if (structured.length > 0) { score += 0.2; evidence.push(`${structured.length} professional(s) with structured transaction patterns`); }
  if (/lawyer|accountant|notary|real.*estate.*agent.*launder|professional.*enable/.test(ft)) { score += 0.15; evidence.push('Professional enabler language in narrative'); }
  score = clamp(score, 0, 1);
  return build('professional_ml_ecosystem', 'professional_ml', ['intelligence', 'reasoning', 'inference'], score, clamp(0.45 + 0.08 * professionals.length, 0, 0.9),
    `Professional ML ecosystem: ${gatekeepers.length} gatekeeper(s). Anchors: FATF Guidance on Professional Money Laundering 2018 · FATF R.22/23 DNFBPs.`, evidence);
};

const invoiceFabricationPatternApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const invoices = ev(ctx, 'invoices') as Array<{ invoiceId?: string; supplierId?: string; validatedByThirdParty?: boolean; amount?: number; goodsDescription?: string }>;
  const evidence: string[] = [];
  let score = 0;
  const unvalidated = invoices.filter(i => !i.validatedByThirdParty);
  if (unvalidated.length >= 2) { score += 0.3; evidence.push(`${unvalidated.length} invoice(s) not validated by third party`); }
  const vague = invoices.filter(i => !i.goodsDescription || i.goodsDescription.length < 10);
  if (vague.length > 0) { score += 0.25; evidence.push(`${vague.length} invoice(s) with vague/missing goods description`); }
  if (/phantom.*invoice|fictitious.*invoice|invoice.*fraud|over.invoic/.test(ft)) { score += 0.2; evidence.push('Invoice fabrication language in narrative'); }
  score = clamp(score, 0, 1);
  return build('invoice_fabrication_pattern', 'professional_ml', ['data_analysis', 'inference'], score, clamp(0.45 + 0.06 * invoices.length, 0, 0.9),
    `Invoice fabrication: ${invoices.length} invoice(s), ${unvalidated.length} unvalidated, ${vague.length} vague. Anchors: FATF TBML 2006 · Egmont Group Professional ML Case Studies.`, evidence);
};

const funnelMuleCascadeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const accounts = ev(ctx, 'muleAccounts') as Array<{ accountId?: string; onwardTransferRate?: number; ownerAge?: number; recruitedVia?: string }>;
  const evidence: string[] = [];
  let score = 0;
  if (accounts.length >= 2) { score += 0.3; evidence.push(`${accounts.length} potential mule account(s) in funnel`); }
  const highPass = accounts.filter(a => (a.onwardTransferRate ?? 0) >= 0.9);
  if (highPass.length > 0) { score += 0.3; evidence.push(`${highPass.length} account(s) passing ≥90% funds onward`); }
  const socialRecruit = accounts.filter(a => /social.*media|romance|job.*offer/.test(a.recruitedVia ?? ''));
  if (socialRecruit.length > 0) { score += 0.15; evidence.push(`${socialRecruit.length} mule(s) recruited via social media/romance`); }
  score = clamp(score, 0, 1);
  return build('funnel_mule_cascade', 'professional_ml', ['intelligence', 'data_analysis', 'inference'], score, clamp(0.45 + 0.07 * accounts.length, 0, 0.92),
    `Funnel mule cascade: ${accounts.length} mule account(s), ${highPass.length} high pass-through. Anchors: FATF Money Mule Guidance 2022 · Europol EMMA Operations.`, evidence);
};

// ─── REGULATORY AML ─────────────────────────────────────────────────────────

const varaRulebookCheckApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/VARA|Virtual.*Asset.*Regulatory|Dubai.*VASP.*licen/.test(ft)) { score += 0.1; evidence.push('VARA regulatory context identified'); }
  const gaps = ev(ctx, 'regulatoryGaps') as Array<{ requirement?: string; status?: string }>;
  const varaGaps = gaps.filter(g => g.status === 'missing' || g.status === 'partial');
  if (varaGaps.length > 0) { score += 0.4; evidence.push(`${varaGaps.length} VARA requirement gap(s) identified`); }
  if (/unlicens.*VASP|operating.*without.*VARA.*approval|VARA.*breach/.test(ft)) { score += 0.3; evidence.push('VARA non-compliance language in narrative'); }
  score = clamp(score, 0, 1);
  return build('vara_rulebook_check', 'regulatory_aml', ['reasoning', 'reasoning'], score, 0.72,
    `VARA rulebook check: ${varaGaps.length} gap(s). Anchors: VARA Rulebook 2023 · UAE FDL 20/2018 · CBUAE VASP Framework.`, evidence);
};

const pdplDataMinimisationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const dataFields = ev(ctx, 'collectedDataFields') as Array<{ fieldName?: string; purpose?: string; necessityJustified?: boolean }>;
  const excess = dataFields.filter(f => !f.necessityJustified);
  if (excess.length > 0) { score += 0.4; evidence.push(`${excess.length} data field(s) collected without justified necessity`); }
  if (/PDPL|data.*minimis|purpose.*limit|consent.*lacking|personal.*data.*excess/.test(ft)) { score += 0.15; evidence.push('PDPL data minimisation language'); }
  score = clamp(score, 0, 1);
  return build('pdpl_data_minimisation', 'regulatory_aml', ['reasoning', 'reasoning'], score, 0.68,
    `PDPL data minimisation: ${dataFields.length} fields assessed, ${excess.length} excessive. Anchors: UAE PDPL 45/2021 · DIFC DP Law 2020 · ADGM DPR 2021.`, evidence);
};

const ewraScoringCalibrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const scenarios = ev(ctx, 'ewraScenarios') as Array<{ scenarioId?: string; triggeredCount?: number; falsePositiveRate?: number; lastCalibrationDays?: number }>;
  const evidence: string[] = [];
  let score = 0;
  const highFP = scenarios.filter(s => (s.falsePositiveRate ?? 0) > 0.8);
  if (highFP.length > 0) { score += 0.3; evidence.push(`${highFP.length} scenario(s) with >80% false-positive rate — over-broad`); }
  const stale = scenarios.filter(s => (s.lastCalibrationDays ?? 0) > 365);
  if (stale.length > 0) { score += 0.25; evidence.push(`${stale.length} scenario(s) not calibrated in 12+ months`); }
  if (/EWRA|entity.*wide.*risk.*assess|risk.*calibrat.*gap/.test(ft)) { score += 0.1; evidence.push('EWRA calibration context'); }
  score = clamp(score, 0, 1);
  return build('ewra_scoring_calibration', 'regulatory_aml', ['reasoning', 'data_analysis'], score, 0.65,
    `EWRA scoring calibration: ${scenarios.length} scenario(s), ${highFP.length} over-broad, ${stale.length} stale. Anchors: CBUAE EWRA Guidance · FATF R.1 NRA.`, evidence);
};

const goamlSchemaPreflightApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const reports = ev(ctx, 'goamlReports') as Array<{ reportId?: string; schemaValid?: boolean; missingFields?: string[]; filedLate?: boolean }>;
  const evidence: string[] = [];
  let score = 0;
  const invalid = reports.filter(r => !r.schemaValid);
  if (invalid.length > 0) { score += 0.4; evidence.push(`${invalid.length} goAML report(s) with schema validation errors`); }
  const late = reports.filter(r => r.filedLate);
  if (late.length > 0) { score += 0.2; evidence.push(`${late.length} goAML report(s) filed late`); }
  if (/goAML|STR.*schema|SAR.*format.*error/.test(ft)) { score += 0.1; evidence.push('goAML schema context in narrative'); }
  score = clamp(score, 0, 1);
  return build('goaml_schema_preflight', 'regulatory_aml', ['reasoning', 'data_analysis'], score, 0.75,
    `goAML schema preflight: ${reports.length} report(s), ${invalid.length} invalid, ${late.length} late. Anchors: UAE FIU goAML Schema v4.1 · UNODC goAML Technical Guide.`, evidence);
};

// ─── DECISION THEORY ────────────────────────────────────────────────────────

const expectedValueDecisionApply = async (ctx: BrainContext): Promise<Finding> => {
  const options = ev(ctx, 'decisionOptions') as Array<{ optionId?: string; probability?: number; outcome?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (options.length >= 2) {
    const evs = options.map(o => (o.probability ?? 0) * (o.outcome ?? 0));
    const maxEv = Math.max(...evs);
    if (maxEv > 0) { score += 0.4; evidence.push(`Optimal EV option yields ${maxEv.toFixed(2)}`); }
    const dominated = options.filter((_, i) => evs[i] !== undefined && evs[i]! < maxEv * 0.3).length;
    if (dominated > 0) { score += 0.1; evidence.push(`${dominated} dominated option(s) identified`); }
  }
  const priorEsc = ctx.priorFindings.filter(f => f.verdict === 'escalate').length;
  if (priorEsc >= 2) { score += 0.3; evidence.push(`EV weighed against ${priorEsc} escalated findings`); }
  score = clamp(score, 0, 1);
  return build('expected_value_decision', 'decision_theory', ['ratiocination', 'reasoning'], score, 0.65,
    `Expected value decision: ${options.length} option(s) evaluated. Anchors: Von Neumann-Morgenstern utility theory · FATF R.1 risk-proportionality.`, evidence);
};

const regretMinimizationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const options = ev(ctx, 'decisionOptions') as Array<{ optionId?: string; worstCaseRegret?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (options.length >= 2) {
    const minRegret = Math.min(...options.map(o => o.worstCaseRegret ?? 999));
    evidence.push(`Minimax regret strategy: min worst-case regret = ${minRegret.toFixed(2)}`);
    if (minRegret < 0.3) score += 0.3;
  }
  if (/regret.*minimiz|minimax|worst.*case.*decision/.test(ft)) { score += 0.1; evidence.push('Regret minimization framework referenced'); }
  const conservativeFindings = ctx.priorFindings.filter(f => f.verdict !== 'clear');
  if (conservativeFindings.length >= 2) { score += 0.2; evidence.push('Conservative signals support regret-averse escalation'); }
  score = clamp(score, 0, 1);
  return build('regret_minimization', 'decision_theory', ['ratiocination', 'reasoning'], score, 0.6,
    `Regret minimization: ${options.length} option(s) evaluated. Anchors: Savage minimax regret · FATF proportionality principle.`, evidence);
};

const multiCriteriaDecisionAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const criteria = ev(ctx, 'mcaCriteria') as Array<{ criterion?: string; weight?: number; score?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (criteria.length >= 3) {
    const weighted = criteria.reduce((a, c) => a + (c.weight ?? 0) * (c.score ?? 0), 0);
    const totalWeight = criteria.reduce((a, c) => a + (c.weight ?? 0), 0);
    const normalised = totalWeight > 0 ? weighted / totalWeight : 0;
    score += clamp(normalised, 0, 0.8);
    evidence.push(`MCDA weighted score: ${normalised.toFixed(3)} across ${criteria.length} criteria`);
  }
  if (/MCDA|multi.criteria|weighted.*score|AHP.*method/.test(ft)) { score += 0.05; evidence.push('MCDA framework referenced'); }
  score = clamp(score, 0, 1);
  return build('multi_criteria_decision_analysis', 'decision_theory', ['ratiocination', 'data_analysis'], score, 0.65,
    `MCDA: ${criteria.length} criteria assessed. Anchors: Saaty AHP · OECD Multi-Criteria Analysis for Policy 2008.`, evidence);
};

const valueOfInformationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const uncertainty = ctx.priorFindings.filter(f => f.confidence < 0.5).length;
  if (uncertainty >= 2) { score += 0.3; evidence.push(`${uncertainty} low-confidence prior finding(s) — high VoI for additional data`); }
  if (/additional.*information|further.*enquiry.*warranted|EDD.*required|investigate.*further/.test(ft)) { score += 0.2; evidence.push('VoI signal: further investigation indicated'); }
  const partialData = ev(ctx, 'missingDataFields') as Array<{ field?: string }>;
  if (partialData.length >= 2) { score += 0.2; evidence.push(`${partialData.length} missing data field(s) — VoI high`); }
  score = clamp(score, 0, 1);
  return build('value_of_information', 'decision_theory', ['ratiocination', 'reasoning'], score, 0.6,
    `Value of information: ${uncertainty} uncertain findings, ${partialData.length} data gaps. Anchors: Howard VoI theory 1966 · FATF R.10 CDD completeness.`, evidence);
};

const satisficingVsOptimizingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const thresholds = ev(ctx, 'satisficingThresholds') as Array<{ criterion?: string; threshold?: number; actual?: number }>;
  const met = thresholds.filter(t => (t.actual ?? 0) >= (t.threshold ?? 0));
  if (met.length === thresholds.length && thresholds.length > 0) {
    score += 0.3; evidence.push(`All ${thresholds.length} satisficing threshold(s) met — proceed with escalation`);
  } else if (met.length === 0 && thresholds.length > 0) {
    score += 0.1; evidence.push('No satisficing thresholds met — decision deferred');
  }
  const priorEsc = ctx.priorFindings.filter(f => f.verdict === 'escalate').length;
  if (priorEsc >= 1) { score += 0.2; evidence.push('At least one escalation satisfies minimum criteria'); }
  if (/satisfic|bounded.*rational|Simon.*decision/.test(ft)) { score += 0.05; evidence.push('Satisficing framework referenced'); }
  score = clamp(score, 0, 1);
  return build('satisficing_vs_optimizing', 'decision_theory', ['ratiocination', 'reasoning'], score, 0.6,
    `Satisficing vs optimizing: ${met.length}/${thresholds.length} threshold(s) met. Anchors: Herbert Simon bounded rationality · FATF risk-based approach proportionality.`, evidence);
};

// ─── BEHAVIORAL ECONOMICS ───────────────────────────────────────────────────

const prospectTheoryAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/loss.*avers|risk.*seek.*loss|frame.*effect|certain.*vs.*gamble/.test(ft)) { score += 0.3; evidence.push('Prospect theory framing in narrative'); }
  const txs = ev(ctx, 'transactions') as Array<{ amount?: number; gainOrLoss?: 'gain' | 'loss' }>;
  const lossChasing = txs.filter(t => t.gainOrLoss === 'loss' && (t.amount ?? 0) > 5_000);
  if (lossChasing.length >= 2) { score += 0.25; evidence.push(`${lossChasing.length} large loss transaction(s) — potential loss-chasing`); }
  const priorFlag = ctx.priorFindings.filter(f => f.verdict !== 'clear').length;
  if (priorFlag >= 2) { score += 0.1; evidence.push('Multiple flags support behavioral anomaly signal'); }
  score = clamp(score, 0, 1);
  return build('prospect_theory_audit', 'behavioral_economics', ['ratiocination', 'reasoning'], score, 0.6,
    `Prospect theory audit: ${lossChasing.length} loss-chasing tx(s). Anchors: Kahneman & Tversky 1979 · FATF Risk Perception Guidance.`, evidence);
};

const anchoringDebiasApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const priorScores = ctx.priorFindings.map(f => f.score);
  if (priorScores.length >= 2) {
    const variance = priorScores.reduce((a, s, _, arr) => a + Math.pow(s - arr.reduce((x, y) => x + y, 0) / arr.length, 2), 0) / priorScores.length;
    if (variance < 0.02) { score += 0.3; evidence.push(`Low score variance (${variance.toFixed(4)}) — possible anchoring to first estimate`); }
  }
  if (/anchoring|first.*impression.*bias|initial.*assessment.*skew/.test(ft)) { score += 0.2; evidence.push('Anchoring bias language in narrative'); }
  score = clamp(score, 0, 1);
  return build('anchoring_debiasing', 'behavioral_economics', ['ratiocination', 'intelligence'], score, 0.58,
    `Anchoring debiasing: ${priorScores.length} prior scores reviewed. Anchors: Tversky & Kahneman 1974 · FATF Guidance bias in risk assessment.`, evidence);
};

const statusQuoBiasProbeApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/always.*done.*this.*way|no.*change.*needed|status.*quo|inertia.*compliance/.test(ft)) { score += 0.35; evidence.push('Status quo bias language detected'); }
  const reviews = ev(ctx, 'controlReviews') as Array<{ lastUpdatedDays?: number; changesMade?: boolean }>;
  const stale = reviews.filter(r => (r.lastUpdatedDays ?? 0) > 730 && !r.changesMade);
  if (stale.length > 0) { score += 0.3; evidence.push(`${stale.length} control(s) not updated in 2+ years`); }
  score = clamp(score, 0, 1);
  return build('status_quo_bias_probe', 'behavioral_economics', ['ratiocination', 'intelligence'], score, 0.62,
    `Status quo bias probe: ${stale.length} stale control(s). Anchors: Samuelson & Zeckhauser 1988 · FATF R.35 evolving typologies.`, evidence);
};

const availabilityCascadeGuardApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/media.*frenzy|recent.*headline|widely.*reported.*therefore|availability.*heuristic/.test(ft)) { score += 0.3; evidence.push('Availability cascade bias language'); }
  const mediaHits = ev(ctx, 'adverseMedia') as Array<{ source?: string; date?: string }>;
  if (mediaHits.length >= 5 && ctx.priorFindings.every(f => f.verdict === 'escalate')) {
    score += 0.25; evidence.push('Heavy media coverage may be inflating risk perception'); }
  score = clamp(score, 0, 1);
  return build('availability_cascade_guard', 'behavioral_economics', ['ratiocination', 'intelligence'], score, 0.55,
    `Availability cascade guard: ${mediaHits.length} media hits reviewed. Anchors: Kuran & Sunstein 1999 · FATF media-risk correlation guidance.`, evidence);
};

const overconfidenceCalibrationApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const highConfLow = ctx.priorFindings.filter(f => f.confidence >= 0.85 && f.score < 0.3);
  if (highConfLow.length > 0) { score += 0.35; evidence.push(`${highConfLow.length} finding(s) with high confidence but low risk score — possible overconfidence`); }
  if (/certain|definitely.*not|no.*risk|clearly.*innocent/.test(ft)) { score += 0.2; evidence.push('Overconfident language in narrative'); }
  score = clamp(score, 0, 1);
  return build('overconfidence_calibration', 'behavioral_economics', ['ratiocination', 'intelligence'], score, 0.6,
    `Overconfidence calibration: ${highConfLow.length} miscalibrated finding(s). Anchors: Lichtenstein et al. 1982 · FATF expert overconfidence in risk assessment.`, evidence);
};

// ─── STRATEGIC ──────────────────────────────────────────────────────────────

const nashEquilibriumAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const players = ev(ctx, 'strategicPlayers') as Array<{ playerId?: string; strategy?: string; payoff?: number }>;
  const evidence: string[] = [];
  let score = 0;
  if (players.length >= 2) {
    const dominated = players.filter(p => (p.payoff ?? 0) < 0).length;
    if (dominated > 0) { score += 0.2; evidence.push(`${dominated} player(s) in dominated strategy position`); }
    evidence.push(`Nash equilibrium assessed across ${players.length} strategic player(s)`);
    score += 0.1;
  }
  if (/game.*theory|Nash|dominant.*strategy|equilibrium.*analysis/.test(ft)) { score += 0.1; evidence.push('Game theory framework referenced'); }
  const priorEsc = ctx.priorFindings.filter(f => f.verdict === 'escalate').length;
  if (priorEsc >= 2) { score += 0.2; evidence.push('Escalation equilibrium supports flag'); }
  score = clamp(score, 0, 1);
  return build('nash_equilibrium_analysis', 'strategic', ['ratiocination', 'reasoning', 'inference'], score, 0.58,
    `Nash equilibrium analysis: ${players.length} player(s). Anchors: Nash 1950 · FATF strategic evasion typologies.`, evidence);
};

const mechanismDesignReverseApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/incentive.*structure|mechanism.*design|reverse.*engineer.*incentive|misalign.*incentive/.test(ft)) { score += 0.3; evidence.push('Mechanism design language in narrative'); }
  const incentives = ev(ctx, 'incentiveStructures') as Array<{ type?: string; perverseOutcome?: boolean }>;
  const perverse = incentives.filter(i => i.perverseOutcome);
  if (perverse.length > 0) { score += 0.3; evidence.push(`${perverse.length} perverse incentive structure(s) identified`); }
  score = clamp(score, 0, 1);
  return build('mechanism_design_reverse', 'strategic', ['ratiocination', 'reasoning'], score, 0.58,
    `Mechanism design reverse: ${incentives.length} incentive structure(s), ${perverse.length} perverse. Anchors: Hurwicz et al. 2007 · FATF R.8 NPO incentives.`, evidence);
};

const commitmentDeviceAuditApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const commitments = ev(ctx, 'commitmentDevices') as Array<{ deviceType?: string; breached?: boolean }>;
  const breached = commitments.filter(c => c.breached);
  if (breached.length > 0) { score += 0.35; evidence.push(`${breached.length} commitment device(s) breached`); }
  if (/pre.commitment|self.bind|Ulysses.*contract|compliance.*pledge.*violated/.test(ft)) { score += 0.15; evidence.push('Commitment device language'); }
  score = clamp(score, 0, 1);
  return build('commitment_device_audit', 'strategic', ['ratiocination', 'reasoning'], score, 0.58,
    `Commitment device audit: ${commitments.length} device(s), ${breached.length} breached. Anchors: Schelling 1960 · FATF pre-commitment compliance structures.`, evidence);
};

const informationRevelationTimingApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  if (/delay.*disclos|late.*reveal|strategic.*withhold|trickle.*information/.test(ft)) { score += 0.35; evidence.push('Strategic information withholding language'); }
  const disclosures = ev(ctx, 'disclosureEvents') as Array<{ daysDelayed?: number; type?: string }>;
  const delayed = disclosures.filter(d => (d.daysDelayed ?? 0) > 30);
  if (delayed.length > 0) { score += 0.3; evidence.push(`${delayed.length} disclosure(s) delayed >30 days`); }
  score = clamp(score, 0, 1);
  return build('information_revelation_timing', 'strategic', ['intelligence', 'reasoning'], score, 0.62,
    `Information revelation timing: ${disclosures.length} disclosure(s), ${delayed.length} delayed. Anchors: Crawford & Sobel cheap talk · FATF R.20 STR timely reporting.`, evidence);
};

const entryExitTimingAnalysisApply = async (ctx: BrainContext): Promise<Finding> => {
  const ft = freeTextOf(ctx);
  const evidence: string[] = [];
  let score = 0;
  const positions = ev(ctx, 'marketPositions') as Array<{ entryDate?: string; exitDate?: string; triggerEvent?: string; profitUsd?: number }>;
  const wellTimed = positions.filter(p => p.triggerEvent && (p.profitUsd ?? 0) > 1_000);
  if (wellTimed.length >= 2) { score += 0.35; evidence.push(`${wellTimed.length} suspiciously well-timed entry/exit(s)`); }
  if (/perfectly.*timed|exit.*before.*announce|enter.*just.*before/.test(ft)) { score += 0.2; evidence.push('Suspicious timing language in narrative'); }
  score = clamp(score, 0, 1);
  return build('entry_exit_timing_analysis', 'strategic', ['data_analysis', 'reasoning', 'inference'], score, 0.65,
    `Entry/exit timing analysis: ${positions.length} position(s), ${wellTimed.length} suspiciously timed. Anchors: IOSCO Market Manipulation 2020 · UAE SCA Market Conduct Regulations.`, evidence);
};

// ─── EXPORT ──────────────────────────────────────────────────────────────────

export const WAVE4_BATCH_C_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  // crypto_defi
  address_poisoning: addressPoisoningApply,
  chain_hopping_velocity: chainHoppingVelocityApply,
  cross_chain_taint: crossChainTaintApply,
  privacy_pool_exposure: privacyPoolExposureApply,
  change_address_heuristic: changeAddressHeuristicApply,
  dusting_attack_pattern: dustingAttackPatternApply,
  travel_rule_gap_analysis: travelRuleGapAnalysisApply,
  crypto_ransomware_cashout: cryptoRansomwareCashoutApply,
  p2p_exchange_risk: p2pExchangeRiskApply,
  // predicate_crime
  predicate_crime_cascade: predicateCrimeCascadeApply,
  environmental_predicate: environmentalPredicateApply,
  tax_evasion_predicate: taxEvasionPredicateApply,
  insider_trading_predicate: insiderTradingPredicateApply,
  cyber_crime_predicate: cybercrimePredicate,
  human_trafficking_predicate: humanTraffickingPredicateApply,
  threshold_split_detection: thresholdSplitDetectionApply,
  offshore_layering: offshorLayeringApply,
  structuring_pattern_reasoning: structuringPatternReasoningApply,
  // proliferation
  pf_red_flag_screen: pfRedFlagScreenApply,
  dual_use_end_user: dualUseEndUserApply,
  sanctions_evasion_network: sanctionsEvasionNetworkApply,
  ship_flag_hop_analysis: shipFlagHopAnalysisApply,
  // correspondent_banking
  cbr_risk_matrix: cbrRiskMatrixApply,
  nested_account_detection: nestedAccountDetectionApply,
  payable_through_account: payableThroughAccountApply,
  cbr_due_diligence_cascade: cbrDueDiligenceCascadeApply,
  // hawala_ivt
  hawala_network_map: hawalaNetworkMapApply,
  settlement_commodity_flow: settlementCommodityFlowApply,
  value_equivalence_check: valueEquivalenceCheckApply,
  // ftz_risk
  ftz_opacity_screen: ftzOpacityScreenApply,
  re_export_discrepancy: reExportDiscrepancyApply,
  // professional_ml
  professional_ml_ecosystem: professionalMlEcosystemApply,
  invoice_fabrication_pattern: invoiceFabricationPatternApply,
  funnel_mule_cascade: funnelMuleCascadeApply,
  // regulatory_aml
  vara_rulebook_check: varaRulebookCheckApply,
  pdpl_data_minimisation: pdplDataMinimisationApply,
  ewra_scoring_calibration: ewraScoringCalibrationApply,
  goaml_schema_preflight: goamlSchemaPreflightApply,
  // decision_theory
  expected_value_decision: expectedValueDecisionApply,
  regret_minimization: regretMinimizationApply,
  multi_criteria_decision_analysis: multiCriteriaDecisionAnalysisApply,
  value_of_information: valueOfInformationApply,
  satisficing_vs_optimizing: satisficingVsOptimizingApply,
  // behavioral_economics
  prospect_theory_audit: prospectTheoryAuditApply,
  anchoring_debiasing: anchoringDebiasApply,
  status_quo_bias_probe: statusQuoBiasProbeApply,
  availability_cascade_guard: availabilityCascadeGuardApply,
  overconfidence_calibration: overconfidenceCalibrationApply,
  // strategic
  nash_equilibrium_analysis: nashEquilibriumAnalysisApply,
  mechanism_design_reverse: mechanismDesignReverseApply,
  commitment_device_audit: commitmentDeviceAuditApply,
  information_revelation_timing: informationRevelationTimingApply,
  entry_exit_timing_analysis: entryExitTimingAnalysisApply,
};
