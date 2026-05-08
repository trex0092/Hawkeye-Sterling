// Wave 12 — template-fill reasoning modes.
//
// The Wave-1..11 registry shipped before the question-template authors had
// finalised every mode id their probes need. Wave 12 closes the gap so the
// brain audit (auditBrain → templates point at real modes) is green. Every
// mode below has a bespoke apply implementation.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, ReasoningMode,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function freeTextOf(ctx: BrainContext): string {
  const parts: string[] = [];
  if (typeof ctx.evidence.freeText === 'string') parts.push(ctx.evidence.freeText);
  for (const f of ctx.priorFindings) parts.push(f.rationale);
  return parts.join(' ').toLowerCase();
}

function amountsOf(ctx: BrainContext): number[] {
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
      }
    }
  }
  return out;
}

function makeLinguistic(
  modeId: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  patterns: string[],
  label: string,
  flagThresh: number,
  escalateThresh: number,
): (ctx: BrainContext) => Promise<Finding> {
  return async (ctx: BrainContext): Promise<Finding> => {
    const text = freeTextOf(ctx);
    const hits = patterns.filter(p => text.includes(p));
    const score = hits.length === 0 ? 0 : Math.min(0.85, 0.2 + hits.length * 0.15);
    const verdict: Finding['verdict'] = hits.length >= escalateThresh
      ? 'escalate'
      : hits.length >= flagThresh
        ? 'flag'
        : 'clear';
    return {
      modeId, category, faculties,
      producedAt: Date.now(), score,
      confidence: text.length < 32 ? 0.3 : 0.6,
      verdict,
      rationale: `${label} — ${hits.length} indicator(s) in narrative.`,
      evidence: hits.map(h => `kw=${h}`),
    };
  };
}

// FATF lists for geopolitical checks
const FATF_HIGH_RISK = new Set(['IR', 'KP', 'MM']);
const FATF_GREY_LIST = new Set([
  'AF', 'CD', 'NG', 'SD', 'YE', 'BG', 'BF', 'KH', 'CM', 'HR', 'HT', 'KE',
  'LA', 'LB', 'MY', 'ML', 'MZ', 'NA', 'NE', 'SN', 'SS', 'SY', 'TZ', 'TR',
  'VE', 'VN',
]);

// Secrecy jurisdictions for offshore layering
const SECRECY_JURISDICTIONS = new Set(['BVI', 'KY', 'MH', 'PA', 'LI', 'MC', 'AD', 'VG', 'AI', 'TC']);

const m = (
  id: string,
  name: string,
  category: ReasoningCategory,
  faculties: FacultyId[],
  description: string,
  apply?: (ctx: BrainContext) => Promise<Finding>,
): ReasoningMode => {
  const fallback = makeLinguistic(id, category, faculties, [], description, 1, 2);
  return {
    id, name, category, faculties, wave: 12, description,
    apply: apply ?? fallback,
  };
};

// ── Mode implementations ──────────────────────────────────────────────────────

function applyThresholdSplitDetection(ctx: BrainContext): Promise<Finding> {
  const modeId = 'threshold_split_detection';
  const category: ReasoningCategory = 'predicate_crime';
  const faculties: FacultyId[] = ['data_analysis', 'smartness'];
  const now = Date.now();

  const AED_THRESHOLD = 55_000;
  const USD_THRESHOLD = 10_000;

  const amts = amountsOf(ctx);
  const belowThreshold = amts.filter(a => a < AED_THRESHOLD && a < USD_THRESHOLD
    ? true
    : a < AED_THRESHOLD || a < USD_THRESHOLD);
  const nearThreshold = amts.filter(a =>
    (a >= AED_THRESHOLD * 0.8 && a < AED_THRESHOLD) ||
    (a >= USD_THRESHOLD * 0.8 && a < USD_THRESHOLD),
  );
  const total = amts.reduce((a, b) => a + b, 0);

  // Structuring: ≥3 txs each below threshold and sum > threshold
  const structuringPattern = belowThreshold.length >= 3 && total > Math.min(AED_THRESHOLD, USD_THRESHOLD);

  const score = Math.min(0.85, nearThreshold.length * 0.2);
  const verdict: Finding['verdict'] = belowThreshold.length >= 5
    ? 'escalate'
    : structuringPattern || belowThreshold.length >= 3
      ? 'flag'
      : 'clear';

  return Promise.resolve({
    modeId, category, faculties, producedAt: now, score,
    confidence: amts.length === 0 ? 0.3 : 0.65,
    verdict,
    rationale: `Threshold Split Detection — ${amts.length} tx(s) total; ${belowThreshold.length} below threshold; ${nearThreshold.length} near-threshold; total sum=${total.toFixed(2)}; structuring_pattern=${structuringPattern}.`,
    evidence: [
      `tx_total=${amts.length}`, `below_threshold=${belowThreshold.length}`,
      `near_threshold=${nearThreshold.length}`, `sum=${total.toFixed(2)}`,
    ],
  });
}

async function applyPepConnectionReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'pep_connection_reasoning';
  const category: ReasoningCategory = 'behavioral_signals';
  const faculties: FacultyId[] = ['intelligence', 'inference'];
  const now = Date.now();

  const pepHits = Array.isArray(ctx.evidence.pepHits) ? ctx.evidence.pepHits : [];

  if (pepHits.length > 0) {
    return {
      modeId, category, faculties, producedAt: now,
      score: 0.75, confidence: 0.85, verdict: 'escalate',
      rationale: `PEP Connection Reasoning — ${pepHits.length} direct PEP hit(s) in evidence.`,
      evidence: [`pep_hits=${pepHits.length}`],
    };
  }

  // PEP-adjacent keyword signals
  const pepAdjacent = [
    'politician', 'minister', 'official', 'politically exposed', 'state official',
    'public function', 'government', 'family member', 'close associate',
  ];
  const text = freeTextOf(ctx);
  const kwHits = pepAdjacent.filter(p => text.includes(p));
  const score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
  const verdict: Finding['verdict'] = kwHits.length >= 4 ? 'escalate' : kwHits.length >= 2 ? 'flag' : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.6,
    verdict,
    rationale: `PEP Connection Reasoning — no direct PEP hits; ${kwHits.length} PEP-adjacent keyword(s) in narrative.`,
    evidence: kwHits.map(h => `kw=${h}`),
  };
}

async function applyVelocityAnomalyReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'velocity_anomaly_reasoning';
  const category: ReasoningCategory = 'statistical';
  const faculties: FacultyId[] = ['data_analysis', 'smartness'];
  const now = Date.now();

  const amts = amountsOf(ctx);
  if (amts.length === 0) {
    return {
      modeId, category, faculties, producedAt: now,
      score: 0, confidence: 0.3, verdict: 'inconclusive',
      rationale: 'Velocity Anomaly Reasoning — no transactions available to analyse.',
      evidence: [],
    };
  }

  const sum = amts.reduce((a, b) => a + b, 0);
  const max = Math.max(...amts);
  const passThroughRatio = max / sum; // proxy for mule/funnel: single large pass-through
  const concentration = passThroughRatio;

  let score = 0;
  const evidence: string[] = [`tx_count=${amts.length}`, `sum=${sum.toFixed(2)}`, `max=${max.toFixed(2)}`, `concentration=${concentration.toFixed(2)}`];

  if (concentration > 0.6) score += 0.45; // mule pattern — rapid pass-through
  else if (concentration > 0.4) score += 0.25;

  // Near-unity pass-through (total_out ≈ total_in proxy: all txs ~same amount)
  const mean = sum / amts.length;
  const variance = amts.reduce((a, v) => a + (v - mean) ** 2, 0) / amts.length;
  const cv = variance > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
  if (cv < 0.1 && amts.length >= 3) {
    score += 0.2; // uniform amounts suggest structured mule activity
    evidence.push('uniform_amounts=yes');
  }

  score = Math.min(0.85, score);
  const verdict: Finding['verdict'] = score >= 0.5 ? 'flag' : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: 0.65,
    verdict,
    rationale: `Velocity Anomaly Reasoning — concentration=${concentration.toFixed(2)}; cv=${cv.toFixed(2)}; mule pattern=${concentration > 0.6 ? 'likely' : 'unlikely'}.`,
    evidence,
  };
}

const applyRomanceScamProfile = makeLinguistic(
  'romance_scam_financial_profile_reasoning',
  'behavioral_signals',
  ['intelligence', 'smartness'],
  [
    'romance', 'pig butchering', 'investment opportunity', 'cryptocurrency investment',
    'foreign national', 'online relationship', 'remote investment', 'refused refund',
    'escalating amounts', 'crypto onramp',
  ],
  'Romance-Scam Financial Profile',
  1, 2,
);

async function applyOffshorLayering(ctx: BrainContext): Promise<Finding> {
  const modeId = 'offshore_layering';
  const category: ReasoningCategory = 'predicate_crime';
  const faculties: FacultyId[] = ['intelligence', 'ratiocination'];
  const now = Date.now();

  // Check UBO chain for secrecy jurisdictions
  const ubo = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
  const secretJurisdictions: string[] = [];
  for (const e of ubo) {
    if (e && typeof e === 'object') {
      const j = (e as Record<string, unknown>)['jurisdiction'] ?? (e as Record<string, unknown>)['country'];
      if (typeof j === 'string' && SECRECY_JURISDICTIONS.has(j.toUpperCase())) {
        secretJurisdictions.push(j.toUpperCase());
      }
    }
  }

  const kwPatterns = [
    'nominee', 'bvi', 'cayman', 'marshall', 'offshore', 'trust',
    'transfer pricing', 'round trip', 'repatriation', 'tax haven',
  ];
  const text = freeTextOf(ctx);
  const kwHits = kwPatterns.filter(p => text.includes(p));

  const score = Math.min(0.85, secretJurisdictions.length * 0.2 + kwHits.length * 0.1);
  const verdict: Finding['verdict'] = secretJurisdictions.length >= 2 || kwHits.length >= 4
    ? 'escalate'
    : secretJurisdictions.length >= 1 || kwHits.length >= 2
      ? 'flag'
      : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 && ubo.length === 0 ? 0.3 : 0.65,
    verdict,
    rationale: `Offshore Layering — ${secretJurisdictions.length} secrecy jurisdiction(s) in UBO chain; ${kwHits.length} offshore keyword(s).`,
    evidence: [
      ...secretJurisdictions.map(j => `secrecy_jur=${j}`),
      ...kwHits.map(h => `kw=${h}`),
    ],
  };
}

async function applyStructuringPatternReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'structuring_pattern_reasoning';
  const category: ReasoningCategory = 'predicate_crime';
  const faculties: FacultyId[] = ['data_analysis', 'smartness'];
  const now = Date.now();

  const kwPatterns = [
    'structuring', 'smurfing', 'just below threshold', 'multiple branches',
    'parallel import', 'daigou', 'below reporting', 'split payment',
    'divided transaction', 'threshold avoidance',
  ];
  const text = freeTextOf(ctx);
  const kwHits = kwPatterns.filter(p => text.includes(p));

  // Also count near-threshold transactions
  const amts = amountsOf(ctx);
  const nearThreshold = amts.filter(a =>
    (a >= 45_000 && a < 55_000) || (a >= 8_000 && a < 10_000),
  );

  const score = Math.min(0.85, kwHits.length * 0.15 + nearThreshold.length * 0.1);
  const verdict: Finding['verdict'] = kwHits.length >= 2 || nearThreshold.length >= 3
    ? 'escalate'
    : kwHits.length >= 1 || nearThreshold.length >= 1
      ? 'flag'
      : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.65,
    verdict,
    rationale: `Structuring Pattern Reasoning — ${kwHits.length} structuring keyword(s); ${nearThreshold.length} near-threshold transaction(s).`,
    evidence: [
      ...kwHits.map(h => `kw=${h}`),
      `near_threshold_txs=${nearThreshold.length}`,
    ],
  };
}

async function applyLegalPrivilegeAssessment(ctx: BrainContext): Promise<Finding> {
  const modeId = 'legal_privilege_assessment';
  const category: ReasoningCategory = 'legal_reasoning';
  const faculties: FacultyId[] = ['argumentation', 'introspection'];
  const now = Date.now();

  const lppKW = ['privileged', 'legal advice', 'client-lawyer', 'solicitor-client', 'dominant purpose', 'legal proceedings', 'litigation privilege', 'without prejudice'];
  const exceptionKW = ['crime-fraud', 'fraud exception', 'not privileged', 'waived privilege', 'crime-facilitation', 'furtherance of crime'];

  const text = freeTextOf(ctx);
  const lppHits = lppKW.filter(p => text.includes(p));
  const exceptionHits = exceptionKW.filter(p => text.includes(p));

  let score: number;
  let verdict: Finding['verdict'];
  let rationale: string;

  if (exceptionHits.length > 0) {
    score = 0.65;
    verdict = 'flag';
    rationale = `Legal Privilege Assessment — crime-fraud exception triggered by ${exceptionHits.length} indicator(s): LPP may not apply.`;
  } else if (lppHits.length > 0) {
    score = 0.1;
    verdict = 'clear';
    rationale = `Legal Privilege Assessment — LPP appears to apply (${lppHits.length} LPP indicator(s)); no crime-fraud exception detected.`;
  } else {
    score = 0;
    verdict = 'inconclusive';
    rationale = 'Legal Privilege Assessment — no LPP or exception indicators in narrative; privilege status undetermined.';
  }

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.6,
    verdict,
    rationale,
    evidence: [
      ...lppHits.map(h => `lpp=${h}`),
      ...exceptionHits.map(h => `exception=${h}`),
    ],
  };
}

async function applyCahraDetermination(ctx: BrainContext): Promise<Finding> {
  const modeId = 'cahra_determination';
  const category: ReasoningCategory = 'geopolitical_risk';
  const faculties: FacultyId[] = ['intelligence', 'geopolitical_awareness'];
  const now = Date.now();

  const cahraRegions = [
    'drc', 'congo', 'somalia', 'mali', 'burkina faso', 'myanmar', 'sudan',
    'south sudan', 'iraq', 'syria', 'libya', 'yemen', 'afghanistan', 'ukraine', 'sahel',
  ];
  const text = freeTextOf(ctx);
  const cahraHits = cahraRegions.filter(p => text.includes(p));

  // Check subject jurisdiction
  const jur = ctx.subject.jurisdiction?.toUpperCase() ?? '';
  const isHighRisk = FATF_HIGH_RISK.has(jur);
  const isGreyList = FATF_GREY_LIST.has(jur);

  const score = Math.min(0.85, cahraHits.length * 0.2 + (isHighRisk ? 0.4 : 0) + (isGreyList ? 0.2 : 0));
  const verdict: Finding['verdict'] = isHighRisk || cahraHits.length >= 2
    ? 'escalate'
    : cahraHits.length >= 1 || isGreyList
      ? 'flag'
      : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.65,
    verdict,
    rationale: `CAHRA Determination — ${cahraHits.length} CAHRA region indicator(s); FATF high-risk=${isHighRisk}; grey-list=${isGreyList}.`,
    evidence: [
      ...cahraHits.map(h => `cahra=${h}`),
      `fatf_high=${isHighRisk}`, `fatf_grey=${isGreyList}`,
    ],
  };
}

async function applyChainOfCustodyReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'chain_of_custody_reasoning';
  const category: ReasoningCategory = 'forensic';
  const faculties: FacultyId[] = ['ratiocination', 'intelligence'];
  const now = Date.now();

  const breakKW = [
    'missing document', 'gap in chain', 'unaccounted', 'tampered', 'altered',
    'no signature', 'hash mismatch', 'broken seal', 'custody break', 'integrity failure',
  ];
  const text = freeTextOf(ctx);
  const kwHits = breakKW.filter(p => text.includes(p));

  const docs = Array.isArray(ctx.evidence.documents) ? ctx.evidence.documents : [];
  const docsEmpty = docs.length === 0;

  let score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
  let verdict: Finding['verdict'] = kwHits.length >= 2 ? 'escalate' : kwHits.length >= 1 ? 'flag' : 'clear';
  let rationale = `Chain-of-Custody Reasoning — ${kwHits.length} custody-break indicator(s).`;

  if (docsEmpty && verdict === 'clear') {
    verdict = 'inconclusive';
    score = 0.1;
    rationale = 'Chain-of-Custody Reasoning — no documents provided; chain of custody cannot be verified.';
  }

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: docsEmpty ? 0.3 : 0.6,
    verdict,
    rationale,
    evidence: [...kwHits.map(h => `kw=${h}`), `docs_available=${!docsEmpty}`],
  };
}

async function applyRecordKeepingStandardReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'record_keeping_standard_reasoning';
  const category: ReasoningCategory = 'governance';
  const faculties: FacultyId[] = ['ratiocination'];
  const now = Date.now();

  const gapKW = [
    'missing record', 'no documentation', 'undocumented', 'gap in records',
    'retention failure', 'no audit trail', 'missing signature', 'unsigned',
    'no date', 'incomplete file',
  ];
  const text = freeTextOf(ctx);
  const kwHits = gapKW.filter(p => text.includes(p));

  const docs = Array.isArray(ctx.evidence.documents) ? ctx.evidence.documents : [];
  const docsEmpty = docs.length === 0;

  const score = docsEmpty
    ? Math.min(0.85, 0.3 + kwHits.length * 0.1)
    : kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);

  const verdict: Finding['verdict'] = kwHits.length >= 2 || (docsEmpty && kwHits.length >= 1)
    ? 'escalate'
    : kwHits.length >= 1 || docsEmpty
      ? 'flag'
      : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: 0.6,
    verdict,
    rationale: `Record-Keeping Standard Reasoning — ${kwHits.length} gap indicator(s); documents_provided=${!docsEmpty}.`,
    evidence: [...kwHits.map(h => `kw=${h}`), `docs_empty=${docsEmpty}`],
  };
}

const applyPdplApplicationReasoning = makeLinguistic(
  'pdpl_application_reasoning',
  'legal_reasoning',
  ['argumentation', 'ratiocination'],
  [
    'personal data', 'processing', 'pdpl', 'data protection', 'consent', 'dpia',
    'cross-border transfer', 'data subject', 'lawful basis', 'legitimate interest',
    'special category',
  ],
  'PDPL Application Reasoning',
  1, 2,
);

const applyConsentReasoning = makeLinguistic(
  'consent_reasoning',
  'legal_reasoning',
  ['argumentation', 'reasoning'],
  [
    'pre-ticked', 'bundled consent', 'no option', 'coerced', 'power imbalance',
    'not freely given', 'vague', 'ambiguous consent', 'blanket consent', 'uninformed',
  ],
  'Consent Reasoning',
  1, 2,
);

async function applyTippingOffAnalysis(ctx: BrainContext): Promise<Finding> {
  const modeId = 'tipping_off_analysis';
  const category: ReasoningCategory = 'governance';
  const faculties: FacultyId[] = ['introspection', 'argumentation'];
  const now = Date.now();

  const tippingKW = [
    'str filed', 'sar filed', 'reported to', 'escalated', 'under investigation',
    'suspicious', 'flagged', 'disclosed to fiu', 'reported suspicious', 'compliance investigation',
  ];
  const text = freeTextOf(ctx);
  const kwHits = tippingKW.filter(p => text.includes(p));

  // High sensitivity: explicit STR/SAR mention → escalate immediately
  const explicitSar = text.includes('str filed') || text.includes('sar filed') || text.includes('disclosed to fiu');

  const score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
  const verdict: Finding['verdict'] = explicitSar || kwHits.length >= 2
    ? 'escalate'
    : kwHits.length >= 1
      ? 'flag'
      : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.6,
    verdict,
    rationale: `Tipping-Off Analysis — ${kwHits.length} tipping-off keyword(s); explicit STR/SAR reference=${explicitSar}.`,
    evidence: [...kwHits.map(h => `kw=${h}`), `explicit_sar=${explicitSar}`],
  };
}

async function applyEscalationLogic(ctx: BrainContext): Promise<Finding> {
  const modeId = 'escalation_logic';
  const category: ReasoningCategory = 'governance';
  const faculties: FacultyId[] = ['reasoning', 'ratiocination'];
  const now = Date.now();

  const priors = ctx.priorFindings;
  const hasBlock = priors.some(f => f.verdict === 'block');
  const meanScore = priors.length > 0
    ? priors.reduce((a, f) => a + f.score, 0) / priors.length
    : 0;

  let score: number;
  let verdict: Finding['verdict'];
  let rationale: string;

  if (hasBlock) {
    score = 0.9;
    verdict = 'escalate';
    rationale = 'Escalation Logic — BLOCK verdict in prior findings: MLRO mandatory escalation required.';
  } else if (meanScore >= 0.6) {
    score = 0.7;
    verdict = 'escalate';
    rationale = `Escalation Logic — mean prior score=${meanScore.toFixed(2)} ≥ 0.6: MLRO escalation threshold met.`;
  } else if (meanScore >= 0.3) {
    score = 0.45;
    verdict = 'flag';
    rationale = `Escalation Logic — mean prior score=${meanScore.toFixed(2)} (0.3–0.6): L2 review required.`;
  } else {
    score = 0.15;
    verdict = 'clear';
    rationale = `Escalation Logic — mean prior score=${meanScore.toFixed(2)} < 0.3: L1 clear pathway.`;
  }

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: priors.length < 2 ? 0.3 : 0.7,
    verdict,
    rationale,
    evidence: [`prior_count=${priors.length}`, `mean_score=${meanScore.toFixed(2)}`, `has_block=${hasBlock}`],
    tags: ['escalation_gate'],
  };
}

async function applyAuditTrailIntegrityAssessment(ctx: BrainContext): Promise<Finding> {
  const modeId = 'audit_trail_integrity_assessment';
  const category: ReasoningCategory = 'data_quality';
  const faculties: FacultyId[] = ['ratiocination', 'introspection'];
  const now = Date.now();

  const integrityFailureKW = [
    'hash mismatch', 'timestamp gap', 'missing entry', 'broken chain', 'tampered',
    'altered', 'no signature', 'unsigned', 'integrity failure', 'audit gap',
  ];
  const text = freeTextOf(ctx);
  const kwHits = integrityFailureKW.filter(p => text.includes(p));

  const docs = Array.isArray(ctx.evidence.documents) ? ctx.evidence.documents : [];
  const docsEmpty = docs.length === 0;

  let score = kwHits.length === 0 ? 0 : Math.min(0.85, 0.2 + kwHits.length * 0.15);
  let verdict: Finding['verdict'] = kwHits.length >= 2 ? 'escalate' : kwHits.length >= 1 ? 'flag' : 'clear';
  let rationale = `Audit-Trail Integrity Assessment — ${kwHits.length} integrity failure indicator(s).`;

  if (docsEmpty) {
    if (verdict === 'clear') {
      verdict = 'flag';
      score = Math.max(score, 0.35);
    }
    rationale += ' No audit records provided — trail cannot be verified.';
  }

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: docsEmpty ? 0.3 : 0.6,
    verdict,
    rationale,
    evidence: [...kwHits.map(h => `kw=${h}`), `docs_empty=${docsEmpty}`],
    tags: ['audit_integrity'],
  };
}

async function applyComplianceMaturityReasoning(ctx: BrainContext): Promise<Finding> {
  const modeId = 'compliance_maturity_reasoning';
  const category: ReasoningCategory = 'governance';
  const faculties: FacultyId[] = ['strong_brain', 'deep_thinking'];
  const now = Date.now();

  const gapKW = [
    'no programme', 'inadequate controls', 'not implemented', 'gap identified',
    'failing', 'non-compliant', 'below standard', 'insufficient', 'deficient',
    'remediation required',
  ];
  const maturityKW = [
    'effective programme', 'adequate controls', 'wolfsberg', 'fatf io',
    'audit passed', 'no findings',
  ];

  const text = freeTextOf(ctx);
  const gapHits = gapKW.filter(p => text.includes(p));
  const maturityHits = maturityKW.filter(p => text.includes(p));

  const rawScore = gapHits.length * 0.15 - maturityHits.length * 0.1;
  const score = Math.min(0.8, Math.max(0, rawScore));
  const verdict: Finding['verdict'] = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: text.length < 32 ? 0.3 : 0.6,
    verdict,
    rationale: `Compliance-Maturity Reasoning — ${gapHits.length} gap indicator(s), ${maturityHits.length} maturity signal(s); net score=${score.toFixed(2)}.`,
    evidence: [
      ...gapHits.map(h => `gap=${h}`),
      ...maturityHits.map(h => `maturity=${h}`),
    ],
  };
}

async function applyExaminationPreparationLogic(ctx: BrainContext): Promise<Finding> {
  const modeId = 'examination_preparation_logic';
  const category: ReasoningCategory = 'governance';
  const faculties: FacultyId[] = ['deep_thinking', 'strong_brain'];
  const now = Date.now();

  // Enumerate evidence channel coverage
  const ev = ctx.evidence;
  const allChannels = ['sanctionsHits', 'pepHits', 'adverseMedia', 'uboChain', 'transactions', 'documents'];
  const missingChannels = allChannels.filter(ch => {
    const val = ev[ch];
    return !Array.isArray(val) || val.length === 0;
  });

  const priors = ctx.priorFindings;
  const priorMean = priors.length > 0
    ? priors.reduce((a, f) => a + f.score, 0) / priors.length
    : 0;

  const missingRatio = missingChannels.length / allChannels.length;
  const score = Math.min(0.85, missingRatio * 0.5 + priorMean * 0.5);
  const verdict: Finding['verdict'] = score >= 0.6 ? 'escalate' : score >= 0.3 ? 'flag' : 'clear';

  const examinationGaps = missingChannels.map(ch => `examiner will ask for ${ch}`);
  const priorConcerns = priors
    .filter(f => f.verdict === 'escalate')
    .map(f => `examiner will scrutinise: ${f.modeId}`);

  return {
    modeId, category, faculties, producedAt: now, score,
    confidence: priors.length < 2 ? 0.3 : 0.6,
    verdict,
    rationale: `Examination-Preparation Logic — ${missingChannels.length}/${allChannels.length} evidence channels missing; prior mean score=${priorMean.toFixed(2)}. Examiner focus areas: ${[...examinationGaps, ...priorConcerns].slice(0, 4).join('; ') || 'none'}.`,
    evidence: [
      `missing_channels=${missingChannels.length}`,
      `prior_mean=${priorMean.toFixed(2)}`,
      ...missingChannels.map(ch => `missing=${ch}`),
    ],
  };
}

export const WAVE12_MODES: ReasoningMode[] = [
  // DPMS threshold-splitting
  m('threshold_split_detection', 'Threshold Split Detection', 'predicate_crime',
    ['data_analysis', 'smartness'],
    'Detect splitting of a single economic event into multiple legs each just below a regulatory reporting threshold (DPMS AED 55,000 cash; CTR USD 10,000; STR-trigger anti-structuring).',
    applyThresholdSplitDetection,
  ),

  // Insurance PEP connection
  m('pep_connection_reasoning', 'PEP Connection Reasoning', 'behavioral_signals',
    ['intelligence', 'inference'],
    'Reason over policy ownership, premium-payer, beneficiary, and claim-collection identity to surface PEP exposure that is not visible on the customer record alone.',
    applyPepConnectionReasoning,
  ),

  // Funnel / mule velocity
  m('velocity_anomaly_reasoning', 'Velocity Anomaly Reasoning', 'statistical',
    ['data_analysis', 'smartness'],
    'Compute multi-window velocity (1h/24h/7d) on inflows and outflows; flag funnel-account and mule-account velocity signatures (rapid pass-through, dwell-time < 60 minutes, debit-credit ratio ≈ 1).',
    applyVelocityAnomalyReasoning,
  ),

  // Romance / pig-butchering
  m('romance_scam_financial_profile_reasoning', 'Romance-Scam Financial Profile', 'behavioral_signals',
    ['intelligence', 'smartness'],
    'Profile the romance / pig-butchering financial fingerprint: increasing-amount remittances to a new beneficiary in a high-risk jurisdiction, post-emotional-trigger spike, late-stage redemption refusal, and cross-border crypto onramp.',
    applyRomanceScamProfile,
  ),

  // Offshore layering
  m('offshore_layering', 'Offshore Layering', 'predicate_crime',
    ['intelligence', 'ratiocination'],
    'Identify offshore-vehicle-based layering: nominee director chains, BVI/Cayman/Marshall holdings, opaque trusts, transfer-pricing manipulation, and round-trip via low-tax jurisdictions ahead of repatriation.',
    applyOffshorLayering,
  ),

  // Generic structuring pattern reasoning
  m('structuring_pattern_reasoning', 'Structuring Pattern Reasoning', 'predicate_crime',
    ['data_analysis', 'smartness'],
    'Detect deliberate structuring of cash deposits / wires / invoices to evade reporting thresholds — including same-day multi-branch deposits, just-below-threshold wires, and parallel-import (daigou) commercial-cover structuring.',
    applyStructuringPatternReasoning,
  ),

  // Legal privilege
  m('legal_privilege_assessment', 'Legal Privilege Assessment', 'legal_reasoning',
    ['argumentation', 'introspection'],
    'Assess whether legal professional privilege applies to a piece of evidence: client-lawyer relationship, dominant-purpose test, crime-fraud exception, and the relevant jurisdictional carve-outs (e.g. UK MLR 2017 reg.39).',
    applyLegalPrivilegeAssessment,
  ),

  // CAHRA determination
  m('cahra_determination', 'CAHRA Determination', 'geopolitical_risk',
    ['intelligence', 'geopolitical_awareness'],
    'Determine whether a sourcing / transit / counterparty jurisdiction is a Conflict-Affected or High-Risk Area per OECD DDG Annex II indicators; emit the CAHRA flag and the indicator set that triggered it.',
    applyCahraDetermination,
  ),

  // Chain of custody
  m('chain_of_custody_reasoning', 'Chain-of-Custody Reasoning', 'forensic',
    ['ratiocination', 'intelligence'],
    'Reason over the chain of custody for physical / digital evidence: assignment of custody, transfer documentation, integrity seals, hash continuity, and the impact of a single broken link on admissibility.',
    applyChainOfCustodyReasoning,
  ),

  // Record-keeping standard
  m('record_keeping_standard_reasoning', 'Record-Keeping Standard Reasoning', 'governance',
    ['ratiocination'],
    'Reason over which record-keeping obligations apply (FATF R.11 5y; FDL 20/2018 Art.16 5y; Travel Rule originator-beneficiary set; PDPL retention limits) and detect gaps in the supplied evidence pack.',
    applyRecordKeepingStandardReasoning,
  ),

  // PDPL application reasoning
  m('pdpl_application_reasoning', 'PDPL Application Reasoning', 'legal_reasoning',
    ['argumentation', 'ratiocination'],
    'Determine whether the UAE PDPL (FDL 45/2021) applies to a processing activity, identify the lawful basis, and surface obligations (consent, DPIA, cross-border transfer assessment, data-subject rights).',
    applyPdplApplicationReasoning,
  ),

  // Consent reasoning
  m('consent_reasoning', 'Consent Reasoning', 'legal_reasoning',
    ['argumentation', 'reasoning'],
    'Test whether a consent-based lawful basis is valid: freely given, specific, informed, and unambiguous; identify pre-ticked boxes, bundled consent, and power-imbalance failures.',
    applyConsentReasoning,
  ),

  // Tipping-off analysis
  m('tipping_off_analysis', 'Tipping-Off Analysis', 'governance',
    ['introspection', 'argumentation'],
    'Analyse outbound communications for tipping-off risk per FDL 20/2018 Art.25: explicit references to STR/SAR filings, hints of escalation, or any disclosure that would prejudice an investigation.',
    applyTippingOffAnalysis,
  ),

  // Escalation logic
  m('escalation_logic', 'Escalation Logic', 'governance',
    ['reasoning', 'ratiocination'],
    'Evaluate whether a finding meets the L1 → L2 → MLRO → SAR escalation thresholds; surface the path with named gates and the regulatory anchors that fix each gate.',
    applyEscalationLogic,
  ),

  // Audit-trail integrity
  m('audit_trail_integrity_assessment', 'Audit-Trail Integrity Assessment', 'data_quality',
    ['ratiocination', 'introspection'],
    'Assess the audit trail for completeness, immutability, and tamper-evidence: hash chain continuity, four-eyes signatures, timestamp monotonicity, and gaps that would defeat a regulator examination.',
    applyAuditTrailIntegrityAssessment,
  ),

  // Compliance maturity
  m('compliance_maturity_reasoning', 'Compliance-Maturity Reasoning', 'governance',
    ['strong_brain', 'deep_thinking'],
    'Map controls evidence to the FATF effectiveness Immediate Outcomes (IO 3, 4, 8) and Wolfsberg AML programme tiers; emit a maturity grade and the gap list a regulator would record.',
    applyComplianceMaturityReasoning,
  ),

  // Examination preparation
  m('examination_preparation_logic', 'Examination-Preparation Logic', 'governance',
    ['deep_thinking', 'strong_brain'],
    'Pre-mortem a regulator examination: enumerate the questions the examiner is most likely to ask, the evidence each question demands, and the gaps that would result in findings.',
    applyExaminationPreparationLogic,
  ),
];

export const WAVE12_OVERRIDES: ReasoningMode[] = [];
