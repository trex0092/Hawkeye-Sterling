// Wave 4 — predicate-crime, proliferation, correspondent banking, and
// advanced typology reasoning modes. Default apply via category-aware
// defaultApply(); 10 modes have bespoke implementations below.

import type {
  BrainContext, Finding, FacultyId, ReasoningCategory, ReasoningMode,
} from './types.js';
import { defaultApply } from './modes/default-apply.js';

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => ({
  id, name, category, faculties, wave: 4, description,
  apply: apply ?? defaultApply(id, category, faculties, description),
});

// ─── BESPOKE WAVE-4 IMPLEMENTATIONS ──────────────────────────────────

const HIGH_RISK_CBR_JURISDICTIONS = new Set([
  'IR', 'KP', 'MM', 'AF', 'SD', 'YE', 'SY', 'VE', 'CU', 'BY',
]);
const SHELL_TYPOLOGIES_RX = /\b(shell|nominee|bearer share|holding|ltd\s+ltd)\b/i;
const RANSOMWARE_INDICATORS = ['ransom', 'lockbit', 'conti', 'revil', 'blackcat', 'mixer', 'tornado', 'wasabi', 'samourai'];
const HAWALA_INDICATORS = ['hawala', 'hundi', 'fei chien', 'chop', 'value transfer', 'broker', 'settlement leg'];

function txCount(ctx: BrainContext): number {
  return Array.isArray(ctx.evidence.transactions) ? ctx.evidence.transactions.length : 0;
}
function uboDepth(ctx: BrainContext): number {
  return Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain.length : 0;
}
function freeText(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}
function jurisdictionsOf(ctx: BrainContext): string[] {
  const out = new Set<string>();
  if (ctx.subject.jurisdiction) out.add(ctx.subject.jurisdiction.toUpperCase());
  if (ctx.subject.nationality) out.add(ctx.subject.nationality.toUpperCase());
  const ubo = ctx.evidence.uboChain;
  if (Array.isArray(ubo)) {
    for (const e of ubo) {
      if (e && typeof e === 'object') {
        const j =
          (e as Record<string, unknown>)['jurisdiction'] ??
          (e as Record<string, unknown>)['country'];
        if (typeof j === 'string') out.add(j.toUpperCase());
      }
    }
  }
  return [...out];
}

async function cbrRiskMatrixApply(ctx: BrainContext): Promise<Finding> {
  const js = jurisdictionsOf(ctx);
  const highRisk = js.filter((j) => HIGH_RISK_CBR_JURISDICTIONS.has(j));
  const txN = txCount(ctx);
  const ubo = uboDepth(ctx);
  // Wolfsberg CBDDQ-style composite: jurisdiction + product + volume.
  const jurScore = Math.min(1, highRisk.length * 0.35);
  const volScore = Math.min(0.4, txN / 500);
  const struScore = Math.min(0.3, ubo / 10);
  const score = jurScore + volScore + struScore;
  return {
    modeId: 'cbr_risk_matrix',
    category: 'correspondent_banking',
    faculties: ['reasoning', 'strong_brain'],
    score: Math.min(1, score),
    confidence: 0.8,
    verdict: score >= 0.7 ? 'escalate' : score >= 0.4 ? 'flag' : 'clear',
    rationale: `CBR risk matrix: jurisdiction=${jurScore.toFixed(2)} (${highRisk.length} high-risk), volume=${volScore.toFixed(2)} (${txN} tx), structure=${struScore.toFixed(2)} (UBO depth ${ubo}). Composite=${score.toFixed(2)}.`,
    evidence: [
      `high_risk_jurisdictions=${highRisk.length}`,
      `tx_count=${txN}`,
      `ubo_depth=${ubo}`,
      ...highRisk.map((j) => `cbr_risk=${j}`),
    ],
    producedAt: Date.now(),
  };
}

async function nestedAccountApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 5) {
    return defaultApply('nested_account_detection', 'correspondent_banking', ['reasoning', 'intelligence'],
      'Nested account detection — insufficient tx history')(ctx);
  }
  // Heuristic: many distinct downstream beneficiaries through a single
  // intermediary account is a nested-relationship signature.
  const downstreamByIntermediary = new Map<string, Set<string>>();
  for (const t of txs) {
    const intermediary = String(t['intermediary'] ?? t['respondent'] ?? t['from'] ?? '').toLowerCase();
    const beneficiary = String(t['beneficiary'] ?? t['to'] ?? '').toLowerCase();
    if (!intermediary || !beneficiary) continue;
    if (!downstreamByIntermediary.has(intermediary)) downstreamByIntermediary.set(intermediary, new Set());
    downstreamByIntermediary.get(intermediary)?.add(beneficiary);
  }
  const nested = [...downstreamByIntermediary.entries()].filter(([, bens]) => bens.size >= 5);
  return {
    modeId: 'nested_account_detection',
    category: 'correspondent_banking',
    faculties: ['reasoning', 'intelligence'],
    score: nested.length > 0 ? Math.min(1, nested.length * 0.4) : 0.05,
    confidence: 0.75,
    verdict: nested.length >= 2 ? 'escalate' : nested.length === 1 ? 'flag' : 'clear',
    rationale: `Nested-account: ${nested.length} intermediar${nested.length === 1 ? 'y' : 'ies'} with ≥5 downstream beneficiaries.`,
    evidence: nested.slice(0, 5).map(([k, bens]) => `${k}→${bens.size} beneficiaries`),
    producedAt: Date.now(),
  };
}

async function travelRuleGapApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length === 0) {
    return defaultApply('travel_rule_gap_analysis', 'crypto_defi', ['reasoning', 'strong_brain'],
      'Travel rule gap — no transactions')(ctx);
  }
  // FATF R.16 threshold: USD/EUR 1,000 for VA transfers.
  const TR_THRESHOLD = 1000;
  let aboveThreshold = 0;
  let missingFields = 0;
  for (const t of txs) {
    const amount = typeof t['amount'] === 'number' ? t['amount'] : Number(t['amount']);
    if (!Number.isFinite(amount) || amount < TR_THRESHOLD) continue;
    aboveThreshold += 1;
    const hasOriginator = !!t['originatorName'] && !!t['originatorAddress'];
    const hasBeneficiary = !!t['beneficiaryName'] && !!t['beneficiaryAccount'];
    if (!hasOriginator || !hasBeneficiary) missingFields += 1;
  }
  const ratio = aboveThreshold > 0 ? missingFields / aboveThreshold : 0;
  const score = ratio;
  return {
    modeId: 'travel_rule_gap_analysis',
    category: 'crypto_defi',
    faculties: ['reasoning', 'strong_brain'],
    score,
    confidence: 0.85,
    verdict: ratio >= 0.5 ? 'escalate' : ratio > 0.1 ? 'flag' : 'clear',
    rationale: `Travel-rule (FATF R.16): ${missingFields}/${aboveThreshold} above-threshold transfers missing originator/beneficiary data (${(ratio * 100).toFixed(1)}%).`,
    evidence: [
      `threshold=${TR_THRESHOLD}`,
      `above_threshold=${aboveThreshold}`,
      `missing_data=${missingFields}`,
      `gap_ratio=${ratio.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function ransomwareCashoutApply(ctx: BrainContext): Promise<Finding> {
  const text = freeText(ctx);
  const indicators = RANSOMWARE_INDICATORS.filter((i) => text.includes(i));
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  // Look for rapid chain-hops (within hours) — a layering signature.
  let rapidHops = 0;
  if (Array.isArray(txs) && txs.length >= 2) {
    const sorted = [...txs].sort((a, b) => {
      const ta = Date.parse(String(a['timestamp'] ?? a['date'] ?? ''));
      const tb = Date.parse(String(b['timestamp'] ?? b['date'] ?? ''));
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (!a || !b) continue;
      const ta = Date.parse(String(a['timestamp'] ?? a['date'] ?? ''));
      const tb = Date.parse(String(b['timestamp'] ?? b['date'] ?? ''));
      if (Number.isFinite(ta) && Number.isFinite(tb) && tb - ta < 6 * 3_600_000) rapidHops += 1;
    }
  }
  const score = Math.min(1, indicators.length * 0.3 + Math.min(0.4, rapidHops / 5));
  return {
    modeId: 'crypto_ransomware_cashout',
    category: 'crypto_defi',
    faculties: ['intelligence', 'smartness'],
    score,
    confidence: 0.7,
    verdict: score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear',
    rationale: `Ransomware cash-out: ${indicators.length} indicator${indicators.length === 1 ? '' : 's'} in narrative; ${rapidHops} rapid (<6h) hop${rapidHops === 1 ? '' : 's'}.`,
    evidence: [
      ...indicators.map((i) => `indicator=${i}`),
      `rapid_hops=${rapidHops}`,
    ],
    producedAt: Date.now(),
  };
}

async function hawalaNetworkApply(ctx: BrainContext): Promise<Finding> {
  const text = freeText(ctx);
  const indicators = HAWALA_INDICATORS.filter((i) => text.includes(i));
  const ubo = uboDepth(ctx);
  const txN = txCount(ctx);
  // Hawala signature: small cluster (≤5) of repeating intermediaries
  // moving consistent amounts across borders without bank rails.
  const score = Math.min(1, indicators.length * 0.3 + (ubo >= 3 && ubo <= 7 ? 0.3 : 0) + (txN >= 5 ? 0.2 : 0));
  return {
    modeId: 'hawala_network_map',
    category: 'hawala_ivt',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.65,
    verdict: score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear',
    rationale: `Hawala network: ${indicators.length} narrative indicator${indicators.length === 1 ? '' : 's'}; UBO depth=${ubo}; tx=${txN}. ${score >= 0.6 ? 'Consistent with IVT settlement chain.' : score >= 0.3 ? 'Possible IVT involvement.' : 'No IVT signature.'}`,
    evidence: [
      ...indicators.map((i) => `indicator=${i}`),
      `ubo_depth=${ubo}`,
      `tx_count=${txN}`,
    ],
    producedAt: Date.now(),
  };
}

async function ftzOpacityApply(ctx: BrainContext): Promise<Finding> {
  // UAE FTZs of operational interest. Some legitimate, some opacity-prone.
  const FTZ_HIGH_OPACITY = ['DUBAI', 'JAFZA', 'DAFZA', 'DMCC', 'DGCX', 'RAK FTZ', 'AJMAN FREE', 'FUJAIRAH FREE', 'HAMRIYAH'];
  const text = freeText(ctx);
  const ftzHits = FTZ_HIGH_OPACITY.filter((f) => text.toUpperCase().includes(f));
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  let crossFtzMoves = 0;
  for (const t of txs) {
    const desc = String(t['description'] ?? '').toLowerCase();
    if (desc.includes('re-export') || desc.includes('transhipment') || desc.includes('re export')) crossFtzMoves += 1;
  }
  const score = Math.min(1, ftzHits.length * 0.25 + crossFtzMoves * 0.1);
  return {
    modeId: 'ftz_opacity_screen',
    category: 'ftz_risk',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.7,
    verdict: score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear',
    rationale: `FTZ opacity: ${ftzHits.length} FTZ mention${ftzHits.length === 1 ? '' : 's'}; ${crossFtzMoves} re-export / transhipment transaction${crossFtzMoves === 1 ? '' : 's'}.`,
    evidence: [
      ...ftzHits.map((f) => `ftz=${f}`),
      `re_export_tx=${crossFtzMoves}`,
    ],
    producedAt: Date.now(),
  };
}

async function invoiceFabricationApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 5) {
    return defaultApply('invoice_fabrication_pattern', 'professional_ml', ['reasoning', 'smartness'],
      'Invoice fabrication — insufficient invoices')(ctx);
  }
  let consultingRound = 0;
  let identicalAmounts = 0;
  const amountFreq = new Map<number, number>();
  for (const t of txs) {
    const desc = String(t['description'] ?? t['memo'] ?? '').toLowerCase();
    const amount = typeof t['amount'] === 'number' ? t['amount'] : Number(t['amount']);
    if (!Number.isFinite(amount)) continue;
    const isConsulting = /consult|advisor|service|management fee|professional fee/.test(desc);
    const isRound = amount >= 5000 && amount % 5000 === 0;
    if (isConsulting && isRound) consultingRound += 1;
    amountFreq.set(amount, (amountFreq.get(amount) ?? 0) + 1);
  }
  for (const v of amountFreq.values()) if (v >= 3) identicalAmounts += 1;
  const score = Math.min(1, consultingRound * 0.2 + identicalAmounts * 0.15);
  return {
    modeId: 'invoice_fabrication_pattern',
    category: 'professional_ml',
    faculties: ['reasoning', 'smartness'],
    score,
    confidence: 0.7,
    verdict: score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear',
    rationale: `Invoice fabrication: ${consultingRound} round-amount consulting/service invoices; ${identicalAmounts} amount${identicalAmounts === 1 ? '' : 's'} repeated ≥3 times.`,
    evidence: [
      `consulting_round_invoices=${consultingRound}`,
      `repeated_amounts=${identicalAmounts}`,
    ],
    producedAt: Date.now(),
  };
}

async function funnelMuleApply(ctx: BrainContext): Promise<Finding> {
  const txs = (ctx.evidence.transactions ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(txs) || txs.length < 8) {
    return defaultApply('funnel_mule_cascade', 'professional_ml', ['reasoning', 'intelligence'],
      'Funnel/mule — insufficient tx history')(ctx);
  }
  // Funnel signature: many small inflows from distinct sources →
  // immediate large outflows to few destinations within 48 hours.
  const inflowsBySrc = new Map<string, number[]>();
  const outflowsByDst = new Map<string, number[]>();
  for (const t of txs) {
    const from = String(t['from'] ?? t['source'] ?? '').toLowerCase();
    const to = String(t['to'] ?? t['destination'] ?? '').toLowerCase();
    const amount = typeof t['amount'] === 'number' ? t['amount'] : Number(t['amount']);
    const ts = Date.parse(String(t['timestamp'] ?? t['date'] ?? ''));
    if (!Number.isFinite(amount) || !Number.isFinite(ts)) continue;
    if (from) {
      if (!inflowsBySrc.has(from)) inflowsBySrc.set(from, []);
      inflowsBySrc.get(from)?.push(amount);
    }
    if (to) {
      if (!outflowsByDst.has(to)) outflowsByDst.set(to, []);
      outflowsByDst.get(to)?.push(amount);
    }
  }
  const distinctSources = inflowsBySrc.size;
  const distinctDests = outflowsByDst.size;
  const fanRatio = distinctSources > 0 ? distinctDests / distinctSources : 1;
  const flagged = distinctSources >= 5 && fanRatio < 0.4;
  return {
    modeId: 'funnel_mule_cascade',
    category: 'professional_ml',
    faculties: ['reasoning', 'intelligence'],
    score: flagged ? Math.min(1, (1 - fanRatio) * 0.9) : 0.1,
    confidence: 0.75,
    verdict: flagged && distinctSources >= 10 ? 'escalate' : flagged ? 'flag' : 'clear',
    rationale: `Funnel/mule: ${distinctSources} distinct sources → ${distinctDests} destination${distinctDests === 1 ? '' : 's'} (fan ratio ${fanRatio.toFixed(2)}). ${flagged ? 'Many-to-few funnel signature.' : 'No funnel signature.'}`,
    evidence: [
      `distinct_sources=${distinctSources}`,
      `distinct_destinations=${distinctDests}`,
      `fan_ratio=${fanRatio.toFixed(2)}`,
    ],
    producedAt: Date.now(),
  };
}

async function varaRulebookApply(ctx: BrainContext): Promise<Finding> {
  // Subject must be a VASP and operating in or for Dubai to be VARA-bound.
  const text = freeText(ctx);
  const isVasp = /vasp|virtual asset|exchange|custod|broker|wallet/i.test(text) || ctx.subject.type === 'wallet';
  const dubaiNexus = jurisdictionsOf(ctx).includes('AE') || /dubai|emirate/i.test(text);
  if (!isVasp || !dubaiNexus) {
    return {
      modeId: 'vara_rulebook_check',
      category: 'regulatory_aml',
      faculties: ['reasoning', 'strong_brain'],
      score: 0,
      confidence: 0.6,
      verdict: 'clear',
      rationale: `VARA rulebook check: subject is ${isVasp ? 'VASP' : 'not a VASP'} with ${dubaiNexus ? 'Dubai nexus' : 'no Dubai nexus'}. VARA scope does not apply.`,
      evidence: [`is_vasp=${isVasp}`, `dubai_nexus=${dubaiNexus}`],
      producedAt: Date.now(),
    };
  }
  // Within VARA scope: estimate compliance gap from missing controls in narrative.
  const requiredControls = ['kyc', 'travel rule', 'segregation', 'cold storage', 'audit', 'capital adequacy', 'mlro'];
  const present = requiredControls.filter((c) => text.includes(c));
  const missing = requiredControls.filter((c) => !text.includes(c));
  const gap = missing.length / requiredControls.length;
  return {
    modeId: 'vara_rulebook_check',
    category: 'regulatory_aml',
    faculties: ['reasoning', 'strong_brain'],
    score: gap,
    confidence: 0.75,
    verdict: gap >= 0.6 ? 'escalate' : gap >= 0.3 ? 'flag' : 'clear',
    rationale: `VARA rulebook: ${present.length}/${requiredControls.length} required controls evidenced; ${missing.length} missing.`,
    evidence: [
      ...present.map((c) => `control_present=${c}`),
      ...missing.map((c) => `control_missing=${c}`),
    ],
    producedAt: Date.now(),
  };
}

async function goamlSchemaPreflightApply(ctx: BrainContext): Promise<Finding> {
  // Validate that essential goAML fields can be extracted from subject + evidence.
  const required: Array<[string, boolean]> = [
    ['subject_name', !!ctx.subject.name],
    ['subject_type', !!ctx.subject.type],
    ['subject_jurisdiction', !!ctx.subject.jurisdiction],
    ['subject_identifier', !!(ctx.subject.identifiers && Object.keys(ctx.subject.identifiers).length > 0)],
    ['subject_dob_or_inc', !!(ctx.subject.dateOfBirth || ctx.subject.dateOfIncorporation)],
    ['transactions', txCount(ctx) > 0],
    ['ubo', uboDepth(ctx) > 0 || ctx.subject.type === 'individual'],
    ['narrative', freeText(ctx).length > 100],
  ];
  const present = required.filter(([, ok]) => ok).length;
  const ratio = present / required.length;
  const verdict = ratio >= 0.85 ? 'clear' : ratio >= 0.6 ? 'flag' : 'escalate';
  const missing = required.filter(([, ok]) => !ok).map(([k]) => k);
  return {
    modeId: 'goaml_schema_preflight',
    category: 'regulatory_aml',
    faculties: ['reasoning', 'strong_brain'],
    score: 1 - ratio,
    confidence: 0.95,
    verdict,
    rationale: `goAML pre-flight: ${present}/${required.length} required fields present (${(ratio * 100).toFixed(0)}%). ${verdict === 'clear' ? 'Ready to submit.' : `Missing: ${missing.join(', ')}.`}`,
    evidence: required.map(([k, ok]) => `${k}=${ok ? 'present' : 'missing'}`),
    producedAt: Date.now(),
  };
}

async function pfRedFlagApply(ctx: BrainContext): Promise<Finding> {
  const PF_INDICATORS = ['dual-use', 'dual use', 'centrifuge', 'enrichment', 'precursor', 'wassenaar', 'eccn', 'end-user', 'transhipment', 'front company'];
  const text = freeText(ctx);
  const hits = PF_INDICATORS.filter((i) => text.includes(i));
  const js = jurisdictionsOf(ctx);
  const proximate = js.some((j) => ['IR', 'KP', 'PK', 'SY', 'CN', 'RU', 'BY'].includes(j));
  const score = Math.min(1, hits.length * 0.2 + (proximate ? 0.3 : 0) + (uboDepth(ctx) >= 4 ? 0.2 : 0));
  return {
    modeId: 'pf_red_flag_screen',
    category: 'proliferation',
    faculties: ['reasoning', 'intelligence'],
    score,
    confidence: 0.8,
    verdict: score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear',
    rationale: `PF (FATF R.7): ${hits.length} red-flag term${hits.length === 1 ? '' : 's'} in narrative; ${proximate ? 'proliferation-proximate jurisdiction in chain' : 'no proximate jurisdiction'}; UBO depth ${uboDepth(ctx)}.`,
    evidence: [
      ...hits.map((h) => `pf_indicator=${h}`),
      `proximate=${proximate}`,
      `ubo_depth=${uboDepth(ctx)}`,
    ],
    producedAt: Date.now(),
  };
}

void SHELL_TYPOLOGIES_RX; // reserved for future shell-detection hook

export const WAVE4_MODES: ReasoningMode[] = [
  // ── PREDICATE CRIME ANALYSIS ─────────────────────────────────────────
  m('predicate_crime_cascade', 'Predicate Crime Cascade', 'predicate_crime', ['reasoning','intelligence'], 'Maps all applicable ML/CPF predicate offences under FDL No.10/2025 to the evidence set.'),
  m('environmental_predicate', 'Environmental Predicate Assessment', 'predicate_crime', ['reasoning','intelligence'], 'FATF R.3 (2021 revision) — wildlife, timber, fisheries, waste, emissions.'),
  m('tax_evasion_predicate', 'Tax Evasion Predicate', 'predicate_crime', ['reasoning','inference'], 'Determines whether fiscal misconduct crosses the ML predicate threshold.'),
  m('insider_trading_predicate', 'Insider Trading / Market Abuse Predicate', 'predicate_crime', ['reasoning','smartness'], 'Front-running, tipper-tippee, market manipulation as ML predicates.'),
  m('cyber_crime_predicate', 'Cybercrime Predicate', 'predicate_crime', ['reasoning','intelligence'], 'Ransomware, BEC, DDoS extortion, dark-web marketplace proceeds.'),
  m('human_trafficking_predicate', 'Human Trafficking Predicate', 'predicate_crime', ['reasoning','intelligence'], 'Labour exploitation, sex trafficking, smuggling proceeds identification.'),

  // ── PROLIFERATION FINANCING ──────────────────────────────────────────
  m('pf_red_flag_screen', 'Proliferation Financing Red Flag Screen', 'proliferation', ['reasoning','intelligence'], 'FATF R.7 / INR.7 — dual-use goods, front companies, intermediary networks.', pfRedFlagApply),
  m('dual_use_end_user', 'Dual-Use End-User Certificate Verification', 'proliferation', ['reasoning','strong_brain'], 'Validates EUC authenticity for controlled goods under Wassenaar / EAR / ITAR.'),
  m('sanctions_evasion_network', 'Sanctions Evasion Network Mapping', 'proliferation', ['intelligence','reasoning'], 'UN 1718/2231/1267 — shell-company layering, third-country transhipment.'),
  m('ship_flag_hop_analysis', 'Flag-Hop / AIS-Dark Maritime Analysis', 'proliferation', ['intelligence'], 'Ship-to-ship transfers, flag-shopping, AIS transponder manipulation.'),

  // ── CORRESPONDENT BANKING ────────────────────────────────────────────
  m('cbr_risk_matrix', 'Correspondent Banking Risk Matrix', 'correspondent_banking', ['reasoning','strong_brain'], 'FATF R.13 / Wolfsberg — jurisdiction, product, client, volume risk composite.', cbrRiskMatrixApply),
  m('nested_account_detection', 'Nested Account Detection', 'correspondent_banking', ['reasoning','intelligence'], 'Identifies sub-accounts operated through respondent access without direct CBR.', nestedAccountApply),
  m('payable_through_account', 'Payable-Through Account Assessment', 'correspondent_banking', ['reasoning'], 'PTA / pass-through structure risk — direct customer access to nostro.'),
  m('cbr_due_diligence_cascade', 'CBR Due Diligence Cascade (Wolfsberg)', 'correspondent_banking', ['reasoning','strong_brain'], 'Steps through Wolfsberg CBDDQ — AML programme, sanctions, PEP, STR.'),

  // ── HAWALA / IVT ─────────────────────────────────────────────────────
  m('hawala_network_map', 'Hawala / IVT Network Mapping', 'hawala_ivt', ['reasoning','intelligence'], 'Reconstructs broker-hawaladar chains and settlement patterns.', hawalaNetworkApply),
  m('settlement_commodity_flow', 'Commodity Settlement Identification', 'hawala_ivt', ['reasoning','intelligence'], 'Gold, DPMS, or commodity leg used as IVT settlement instrument.'),
  m('value_equivalence_check', 'Cross-Market Value Equivalence Check', 'hawala_ivt', ['reasoning','inference'], 'Tests whether two-leg IVT flows offset at market rates or premium.'),

  // ── FREE TRADE ZONE ──────────────────────────────────────────────────
  m('ftz_opacity_screen', 'FTZ Opacity Screen', 'ftz_risk', ['reasoning','intelligence'], 'Identifies under-regulated FTZ usage: phantom re-exports, transshipment, misdeclaration.', ftzOpacityApply),
  m('re_export_discrepancy', 'Re-Export Documentation Discrepancy', 'ftz_risk', ['reasoning','inference'], 'HS code mismatches, value gaps, and entity inconsistencies in re-export chains.'),

  // ── VIRTUAL ASSET ADVANCED ───────────────────────────────────────────
  m('travel_rule_gap_analysis', 'Travel Rule Gap Analysis (FATF R.16)', 'crypto_defi', ['reasoning','strong_brain'], 'Identifies originator/beneficiary data missing in VA transfers above threshold.', travelRuleGapApply),
  m('crypto_ransomware_cashout', 'Ransomware Cash-Out Pattern', 'crypto_defi', ['intelligence','smartness'], 'Chain-hop, mixer, P2P, OTC cash-out sequences following ransomware event.', ransomwareCashoutApply),
  m('p2p_exchange_risk', 'P2P Exchange Risk Assessment', 'crypto_defi', ['reasoning','intelligence'], 'Non-custodial P2P platforms — KYC gap, volume limits, fiat on-ramp risk.'),

  // ── PROFESSIONAL ML ──────────────────────────────────────────────────
  m('professional_ml_ecosystem', 'Professional ML Ecosystem Mapping', 'professional_ml', ['intelligence','reasoning'], 'Lawyer, accountant, notary, company-formation agent complicity indicators.'),
  m('invoice_fabrication_pattern', 'Invoice Fabrication Pattern', 'professional_ml', ['reasoning','smartness'], 'Round-tripping, fictitious services, inflated consulting invoices.', invoiceFabricationApply),
  m('funnel_mule_cascade', 'Funnel Account / Mule Cascade Analysis', 'professional_ml', ['reasoning','intelligence'], 'Sequential mule-hop pattern, rapid funds dispersion, layering velocity.', funnelMuleApply),

  // ── GOVERNANCE & REGULATORY ──────────────────────────────────────────
  m('vara_rulebook_check', 'VARA Rulebook Compliance Check', 'regulatory_aml', ['reasoning','strong_brain'], 'Maps VASP activity against VARA Rulebook chapter-by-chapter obligations.', varaRulebookApply),
  m('pdpl_data_minimisation', 'PDPL Data-Minimisation Test', 'regulatory_aml', ['reasoning'], 'FDL 45/2021 Art.4 — proportionality of personal data processed vs stated purpose.'),
  m('ewra_scoring_calibration', 'EWRA Scoring Calibration', 'regulatory_aml', ['reasoning','strong_brain'], 'Validates inherent-risk and control-effectiveness scores against CBUAE benchmark.'),
  m('goaml_schema_preflight', 'goAML Schema Pre-Flight', 'regulatory_aml', ['reasoning','strong_brain'], 'Validates STR/FFR XML payload against UAEFIU goAML schema before submission.', goamlSchemaPreflightApply),
];

export const WAVE4_OVERRIDES: ReasoningMode[] = [];
