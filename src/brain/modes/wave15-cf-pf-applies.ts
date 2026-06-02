// Hawkeye Sterling — Wave 15 apply() implementations.
// 20 compliance_framework modes + 20 proliferation modes.
// All logic is purely rule/heuristic-based (no external I/O) for
// deterministic, auditable, sub-millisecond execution.

import type { BrainContext, Finding, FacultyId, ReasoningCategory, Verdict } from '../types.js';

type ModeApply = (ctx: BrainContext) => Promise<Finding>;

// ---------------------------------------------------------------------------
// Local helper — mirrors forensic.ts findingOf() exactly so we have zero
// cross-file dependencies beyond types.
// ---------------------------------------------------------------------------
function findingOf(
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
    modeId, category, faculties, verdict,
    score: Math.min(1, Math.max(0, score)),
    confidence: Math.min(1, Math.max(0, confidence)),
    rationale, evidence,
    producedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const CF_FACULTIES: FacultyId[] = ['reasoning', 'data_analysis', 'inference'];
const PF_FACULTIES: FacultyId[] = ['intelligence', 'geopolitical_awareness', 'reasoning'];

const HIGH_RISK_PF_JURISDICTIONS = [
  'KP', 'IR', 'SY', 'BY', 'MM', 'LY', 'VE', 'RU', 'CN', 'PK', 'AE',
] as const;

const HIGH_RISK_ME_JURISDICTIONS = [
  'AF', 'MM', 'KP', 'IR', 'SY', 'YE', 'LY', 'SO', 'SS', 'CF', 'VE',
] as const;

// ---------------------------------------------------------------------------
// Safe evidence accessors
// ---------------------------------------------------------------------------
function safeLen(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

function safeJurArr(ctx: BrainContext): string[] {
  return Array.isArray(ctx.evidence.counterpartyJurisdictions)
    ? (ctx.evidence.counterpartyJurisdictions as string[])
    : [];
}

function pfJurCount(jurArr: string[]): number {
  return jurArr.filter((j) => (HIGH_RISK_PF_JURISDICTIONS as readonly string[]).includes(j)).length;
}

function verdictFromScore(score: number): Verdict {
  if (score >= 0.85) return 'escalate';
  if (score >= 0.5) return 'flag';
  if (score >= 0.3) return 'flag';
  return 'clear';
}

// ===========================================================================
// COMPLIANCE_FRAMEWORK modes (w15.cf.*)
// ===========================================================================

/** 1. FATF gap analysis: sanctions + PEP hit count. */
const fatfGapAnalyzerApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const pep = safeLen(ctx.evidence.pepHits);
  const score = Math.min(1, sanc * 0.4 + pep * 0.2);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.fatf_gap_analyzer', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `FATF gap analysis: ${sanc} sanctions hits, ${pep} PEP hits.`,
    [`sanc_hits=${sanc}`, `pep_hits=${pep}`],
  );
};

/** 2. FDL 20 Article mapper: document + UBO completeness. */
const fdl20ArticleMapperApply: ModeApply = async (ctx) => {
  const docs = safeLen(ctx.evidence.documents);
  const ubo = safeLen(ctx.evidence.uboChain);
  // full docs+UBO → 0.1 (clear), missing docs → 0.7 (flag)
  let score: number;
  if (docs >= 2 && ubo >= 1) {
    score = 0.1;
  } else if (docs === 0) {
    score = 0.7;
  } else {
    score = 0.4;
  }
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.fdl20_article_mapper', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `FDL-20 article map: ${docs} document(s), UBO chain depth ${ubo}. ${docs === 0 ? 'Missing documents.' : docs >= 2 && ubo >= 1 ? 'Full CDD package.' : 'Partial CDD.'}`,
    [`docs=${docs}`, `ubo_depth=${ubo}`],
  );
};

/** 3. FDL 10 AI governance checker: adverse media count as proxy. */
const fdl10AiGovernanceCheckerApply: ModeApply = async (ctx) => {
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = Math.min(1, am * 0.2);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.fdl10_ai_governance_checker', 'compliance_framework', CF_FACULTIES, verdict, score, 0.7,
    `FDL-10 AI governance check: ${am} adverse media item(s) requiring AI-audit trail coverage.`,
    [`adverse_media=${am}`],
  );
};

/** 4. FATF R10 bias monitor: round-amount transaction ratio. */
const fatfR10BiasMonitorApply: ModeApply = async (ctx) => {
  const txns = Array.isArray(ctx.evidence.transactions) ? ctx.evidence.transactions : [];
  const total = txns.length;
  if (total === 0) {
    return findingOf(
      'w15.cf.fatf_r10_bias_monitor', 'compliance_framework', CF_FACULTIES, 'clear', 0, 0.5,
      'FATF R10 bias monitor: no transactions to evaluate.',
    );
  }
  const roundCount = txns.filter((t) => {
    const amt = (t as Record<string, unknown>)?.amount;
    if (typeof amt !== 'number' || amt === 0) return false;
    return amt % 100 === 0;
  }).length;
  const ratio = roundCount / total;
  const score = ratio > 0.7 ? 0.6 : ratio > 0.5 ? 0.4 : 0.1;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.fatf_r10_bias_monitor', 'compliance_framework', CF_FACULTIES, verdict, score, 0.7,
    `FATF R10 bias monitor: ${roundCount}/${total} transactions have round amounts (ratio ${ratio.toFixed(2)}). ${ratio > 0.5 ? 'Flag for potential structuring.' : 'Within normal range.'}`,
    [`round_ratio=${ratio.toFixed(2)}`, `total_txns=${total}`],
  );
};

/** 5. 6AMLD predicate checker: sanctions + adverse media composite. */
const sixAmldPredicateCheckerApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = Math.min(1, sanc * 0.3 + am * 0.1);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.six_amld_predicate_checker', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `6AMLD predicate offence check: ${sanc} sanctions hit(s) × 0.3 + ${am} adverse media item(s) × 0.1 = ${score.toFixed(2)}.`,
    [`sanc_hits=${sanc}`, `adverse_media=${am}`],
  );
};

/** 6. Wolfsberg correspondent checker: any high-risk counterparty jurisdiction. */
const wolfsbergCorrespondentCheckerApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const highRisk = jurArr.filter((j) => (HIGH_RISK_PF_JURISDICTIONS as readonly string[]).includes(j));
  const score = highRisk.length > 0 ? 0.7 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.wolfsberg_correspondent_checker', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `Wolfsberg correspondent check: ${highRisk.length > 0 ? `high-risk jurisdictions detected: ${highRisk.join(', ')}.` : 'no high-risk correspondent jurisdictions.'}`,
    highRisk.map((j) => `high_risk_jur=${j}`),
  );
};

/** 7. STR obligation matrix: sanctions+PEP combined with adverse media. */
const strObligationMatrixApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const pep = safeLen(ctx.evidence.pepHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const triggerA = sanc > 0 || pep > 0;
  const triggerB = am > 0;
  const score = triggerA && triggerB ? 0.8 : triggerA ? 0.5 : triggerB ? 0.3 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.str_obligation_matrix', 'compliance_framework', CF_FACULTIES, verdict, score, 0.85,
    `STR obligation matrix: sanctions/PEP trigger=${triggerA}, adverse media trigger=${triggerB}. ${triggerA && triggerB ? 'Both conditions met — STR filing likely required.' : 'Partial trigger.'}`,
    [`sanc=${sanc}`, `pep=${pep}`, `adverse_media=${am}`],
  );
};

/** 8. PEP tier classifier: proxy tier from pepHits count. */
const pepTierClassifierApply: ModeApply = async (ctx) => {
  const pep = safeLen(ctx.evidence.pepHits);
  let score: number;
  let tier: string;
  if (pep === 0) {
    score = 0.0;
    tier = 'none';
  } else if (pep >= 3) {
    score = 0.9;
    tier = 'tier1 (domestic head of state proximity)';
  } else if (pep === 2) {
    score = 0.7;
    tier = 'tier2 (senior official)';
  } else {
    score = 0.5;
    tier = 'tier3 (associate)';
  }
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.pep_tier_classifier', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `PEP tier classifier: ${pep} PEP hit(s) → ${tier}. Score ${score.toFixed(2)}.`,
    [`pep_hits=${pep}`, `tier=${tier}`],
  );
};

/** 9. RBA calibration engine: composite of all evidence signals. */
const rbaCalibrationEngineApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const pep = safeLen(ctx.evidence.pepHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const docs = safeLen(ctx.evidence.documents);
  const docPenalty = docs === 0 ? 0.3 : docs === 1 ? 0.1 : 0;
  const score = Math.min(1, sanc * 0.35 + pep * 0.2 + am * 0.1 + docPenalty);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.rba_calibration_engine', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `RBA calibration: ${sanc} sanctions, ${pep} PEP, ${am} adverse media, ${docs} docs (penalty=${docPenalty.toFixed(2)}). Composite score ${score.toFixed(2)}.`,
    [`sanc=${sanc}`, `pep=${pep}`, `am=${am}`, `docs=${docs}`, `doc_penalty=${docPenalty}`],
  );
};

/** 10. Sanction regime navigator: any sanctions hit → block. */
const sanctionRegimeNavigatorApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const score = sanc > 0 ? 0.9 : 0.0;
  const verdict: Verdict = sanc > 0 ? 'block' : 'clear';
  return findingOf(
    'w15.cf.sanction_regime_navigator', 'compliance_framework', CF_FACULTIES, verdict, score, 0.95,
    `Sanction regime navigator: ${sanc > 0 ? `${sanc} sanctions hit(s) detected — BLOCK.` : 'no sanctions hits.'}`,
    [`sanc_hits=${sanc}`],
  );
};

/** 11. Customer risk rating validator: UBO depth + document completeness. */
const customerRiskRatingValidatorApply: ModeApply = async (ctx) => {
  const ubo = safeLen(ctx.evidence.uboChain);
  const docs = safeLen(ctx.evidence.documents);
  const uboFlag = ubo > 3;
  const docPenalty = docs === 0 ? 0.4 : docs === 1 ? 0.2 : 0;
  const score = Math.min(1, (uboFlag ? 0.4 : 0) + docPenalty);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.customer_risk_rating_validator', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `Customer risk rating: UBO depth ${ubo} (${uboFlag ? '>3 layers — flag' : 'acceptable'}), ${docs} document(s). Score ${score.toFixed(2)}.`,
    [`ubo_depth=${ubo}`, `docs=${docs}`],
  );
};

/** 12. EDD trigger checker: PEP or sanctions → EDD required. */
const eddTriggerCheckerApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const pep = safeLen(ctx.evidence.pepHits);
  const triggered = sanc > 0 || pep > 0;
  const score = triggered ? 0.75 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.edd_trigger_checker', 'compliance_framework', CF_FACULTIES, verdict, score, 0.85,
    `EDD trigger checker: ${triggered ? `EDD required — ${sanc} sanctions hit(s), ${pep} PEP hit(s).` : 'EDD not triggered.'}`,
    [`sanc=${sanc}`, `pep=${pep}`, `edd_triggered=${triggered}`],
  );
};

/** 13. CDD completeness checker: document count scoring. */
const cddCompletenessCheckerApply: ModeApply = async (ctx) => {
  const docs = safeLen(ctx.evidence.documents);
  const score = docs === 0 ? 0.8 : docs === 1 ? 0.5 : 0.1;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.cdd_completeness_checker', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `CDD completeness: ${docs} document(s) on file. ${docs === 0 ? 'No documents — CDD incomplete.' : docs === 1 ? 'Partial documentation.' : 'Documentation adequate.'}`,
    [`docs=${docs}`],
  );
};

/** 14. goAML submission validator: UAE jurisdiction + adverse media. */
const goamlSubmissionValidatorApply: ModeApply = async (ctx) => {
  const jur = (ctx.subject.jurisdiction ?? '').toUpperCase();
  const isUae = jur === 'UAE' || jur === 'ARE' || jur === 'AE';
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = isUae && am > 0 ? 0.6 : isUae ? 0.2 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.goaml_submission_validator', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `goAML submission validator: jurisdiction=${jur || 'unknown'} (UAE=${isUae}), adverse media=${am}. ${isUae && am > 0 ? 'goAML submission may be required.' : 'No immediate goAML obligation triggered.'}`,
    [`is_uae=${isUae}`, `adverse_media=${am}`],
  );
};

/** 15. Travel rule compliance: transactions array length as proxy for missing counterparty data. */
const travelRuleComplianceApply: ModeApply = async (ctx) => {
  const txns = safeLen(ctx.evidence.transactions);
  // Use transactions array length as proxy — assume all are >1000 requiring travel-rule data
  const score = Math.min(1, txns * 0.15);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.travel_rule_compliance', 'compliance_framework', CF_FACULTIES, verdict, score, 0.7,
    `Travel rule compliance: ${txns} transaction(s) identified. ${txns > 0 ? 'Counterparty data completeness requires verification.' : 'No transactions to evaluate.'}`,
    [`transactions=${txns}`],
  );
};

/** 16. Beneficial owner threshold: UBO nodes with low share still listed. */
const beneficialOwnerThresholdApply: ModeApply = async (ctx) => {
  const uboChain = Array.isArray(ctx.evidence.uboChain) ? ctx.evidence.uboChain : [];
  const lowShareCount = uboChain.filter((node) => {
    const share = (node as Record<string, unknown>)?.share;
    return typeof share === 'number' && share < 0.25;
  }).length;
  const score = Math.min(1, lowShareCount * 0.25);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.beneficial_owner_threshold', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `Beneficial owner threshold: ${lowShareCount} UBO node(s) with share <25% but still listed as beneficial owners. Score ${score.toFixed(2)}.`,
    [`low_share_ubo_count=${lowShareCount}`],
  );
};

/** 17. Negative news FATF mapper: adverse media count → FATF risk indicator. */
const negativeNewsFatfMapperApply: ModeApply = async (ctx) => {
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = Math.min(1, am * 0.15);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.negative_news_fatf_mapper', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `Negative news FATF mapper: ${am} adverse media item(s) → FATF risk indicator score ${score.toFixed(2)}.`,
    [`adverse_media=${am}`],
  );
};

/** 18. Supervisory expectation modeler: PEP + adverse media + sanctions composite. */
const supervisoryExpectationModelerApply: ModeApply = async (ctx) => {
  const pep = safeLen(ctx.evidence.pepHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const score = Math.min(1, pep * 0.25 + am * 0.1 + sanc * 0.35);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.supervisory_expectation_modeler', 'compliance_framework', CF_FACULTIES, verdict, score, 0.75,
    `Supervisory expectation model: ${pep} PEP, ${am} adverse media, ${sanc} sanctions. Composite score ${score.toFixed(2)}.`,
    [`pep=${pep}`, `am=${am}`, `sanc=${sanc}`],
  );
};

/** 19. Four-eyes quorum enforcer: missing approval documents → flag. */
const fourEyesQuorumEnforcerApply: ModeApply = async (ctx) => {
  const docs = safeLen(ctx.evidence.documents);
  // Heuristic: absence of documents implies missing approval records
  const score = docs === 0 ? 0.7 : 0.1;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.four_eyes_quorum_enforcer', 'compliance_framework', CF_FACULTIES, verdict, score, 0.7,
    `Four-eyes quorum enforcer: ${docs === 0 ? 'no approval documents found — four-eyes quorum cannot be confirmed.' : `${docs} document(s) present — quorum evidence available.`}`,
    [`docs=${docs}`],
  );
};

/** 20. Mutual evaluation simulator: subject jurisdiction vs high-risk ME list. */
const mutualEvaluationSimApply: ModeApply = async (ctx) => {
  const jur = (ctx.subject.jurisdiction ?? ctx.subject.nationality ?? '').toUpperCase();
  const matched = (HIGH_RISK_ME_JURISDICTIONS as readonly string[]).includes(jur);
  const score = matched ? 0.8 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.cf.mutual_evaluation_sim', 'compliance_framework', CF_FACULTIES, verdict, score, 0.8,
    `Mutual evaluation simulation: jurisdiction "${jur}" ${matched ? 'is on high-risk ME list — elevated FATF scrutiny.' : 'is not on high-risk ME list.'}`,
    [`jurisdiction=${jur}`, `high_risk_me=${matched}`],
  );
};

// ===========================================================================
// PROLIFERATION modes (w15.pf.*)
// ===========================================================================

/** 21. Dual-use goods screen: counterparty jurisdictions overlap with PF list. */
const dualUseGoodsScreenApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const matches = pfJurCount(jurArr);
  const score = Math.min(0.95, matches * 0.75);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.dual_use_goods_screen', 'proliferation', PF_FACULTIES, verdict, score, 0.8,
    `Dual-use goods screen: ${matches} high-risk PF jurisdiction(s) in counterparty list.${matches > 0 ? ' Dual-use export controls apply.' : ''}`,
    jurArr.filter((j) => (HIGH_RISK_PF_JURISDICTIONS as readonly string[]).includes(j)).map((j) => `pf_jur=${j}`),
  );
};

/** 22. Front company detector: deep UBO + PF counterparty jurisdiction. */
const frontCompanyDetectorApply: ModeApply = async (ctx) => {
  const ubo = safeLen(ctx.evidence.uboChain);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = ubo > 3 && hasPfJur ? 0.8 : ubo > 3 ? 0.4 : hasPfJur ? 0.3 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.front_company_detector', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Front company detector: UBO depth ${ubo} (${ubo > 3 ? 'deep' : 'shallow'}), PF-jurisdiction counterparty=${hasPfJur}. Score ${score.toFixed(2)}.`,
    [`ubo_depth=${ubo}`, `pf_jur=${hasPfJur}`],
  );
};

/** 23. Sanctions evasion network: sanctions hits + PF counterparty. */
const sanctionsEvasionNetworkApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = sanc > 0 && hasPfJur ? 0.9 : sanc > 0 ? 0.6 : hasPfJur ? 0.3 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.sanctions_evasion_network', 'proliferation', PF_FACULTIES, verdict, score, 0.85,
    `Sanctions evasion network: ${sanc} sanctions hit(s), PF-jurisdiction counterparty=${hasPfJur}. ${score >= 0.85 ? 'ESCALATE — evasion network indicators.' : 'Partial signal.'}`,
    [`sanc_hits=${sanc}`, `pf_jur=${hasPfJur}`],
  );
};

/** 24. Strategic goods payment screen: PF jurisdiction + missing docs. */
const strategicGoodsPaymentScreenApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const docs = safeLen(ctx.evidence.documents);
  const score = hasPfJur && docs === 0 ? 0.7 : hasPfJur ? 0.4 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.strategic_goods_payment_screen', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Strategic goods payment screen: PF jurisdiction=${hasPfJur}, documents=${docs}. ${hasPfJur && docs === 0 ? 'Missing documents with PF counterparty — flag.' : 'No critical gap.'}`,
    [`pf_jur=${hasPfJur}`, `docs=${docs}`],
  );
};

/** 25. Shipping container risk: adverse media + high-risk jurisdiction. */
const shippingContainerRiskApply: ModeApply = async (ctx) => {
  const am = safeLen(ctx.evidence.adverseMedia);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = am > 0 && hasPfJur ? 0.65 : am > 0 ? 0.3 : hasPfJur ? 0.25 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.shipping_container_risk', 'proliferation', PF_FACULTIES, verdict, score, 0.7,
    `Shipping container risk: adverse media=${am}, PF jurisdiction=${hasPfJur}. Score ${score.toFixed(2)}.`,
    [`adverse_media=${am}`, `pf_jur=${hasPfJur}`],
  );
};

/** 26. Procurement agent detector: UBO >2 hops + PF jurisdiction. */
const procurementAgentDetectorApply: ModeApply = async (ctx) => {
  const ubo = safeLen(ctx.evidence.uboChain);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = ubo > 2 && hasPfJur ? 0.7 : ubo > 2 ? 0.3 : hasPfJur ? 0.25 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.procurement_agent_detector', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Procurement agent detector: UBO depth ${ubo}, PF jurisdiction=${hasPfJur}. ${ubo > 2 && hasPfJur ? 'Layered structure with PF counterparty — flag.' : 'No critical combination.'}`,
    [`ubo_depth=${ubo}`, `pf_jur=${hasPfJur}`],
  );
};

/** 27. End-user certificate validator: missing docs + PF jurisdiction. */
const endUserCertValidatorApply: ModeApply = async (ctx) => {
  const docs = safeLen(ctx.evidence.documents);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = docs === 0 && hasPfJur ? 0.8 : docs === 0 ? 0.4 : hasPfJur ? 0.2 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.end_user_cert_validator', 'proliferation', PF_FACULTIES, verdict, score, 0.8,
    `End-user certificate validator: ${docs} document(s), PF jurisdiction=${hasPfJur}. ${docs === 0 && hasPfJur ? 'Missing EUC with PF destination — escalation warranted.' : 'EUC situation acceptable.'}`,
    [`docs=${docs}`, `pf_jur=${hasPfJur}`],
  );
};

/** 28. Financial intermediary screen: multiple UBO hops + PF jurisdiction. */
const financialIntermediaryScreenApply: ModeApply = async (ctx) => {
  const ubo = safeLen(ctx.evidence.uboChain);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = ubo > 1 && hasPfJur ? 0.7 : ubo > 1 ? 0.25 : hasPfJur ? 0.2 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.financial_intermediary_screen', 'proliferation', PF_FACULTIES, verdict, score, 0.7,
    `Financial intermediary screen: ${ubo} UBO hop(s), PF jurisdiction=${hasPfJur}. Score ${score.toFixed(2)}.`,
    [`ubo_hops=${ubo}`, `pf_jur=${hasPfJur}`],
  );
};

/** 29. Technology transfer screen: adverse media + PF jurisdiction + missing docs. */
const technologyTransferScreenApply: ModeApply = async (ctx) => {
  const am = safeLen(ctx.evidence.adverseMedia);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const docs = safeLen(ctx.evidence.documents);
  const score = am > 0 && hasPfJur && docs === 0 ? 0.75 : am > 0 && hasPfJur ? 0.5 : hasPfJur ? 0.25 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.technology_transfer_screen', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Technology transfer screen: adverse media=${am}, PF jurisdiction=${hasPfJur}, docs=${docs}. Score ${score.toFixed(2)}.`,
    [`am=${am}`, `pf_jur=${hasPfJur}`, `docs=${docs}`],
  );
};

/** 30. Financial channel PF risk: base 0.5 + 0.1 per additional high-risk jurisdiction. */
const financialChannelPfRiskApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const pfCount = pfJurCount(jurArr);
  const score = pfCount > 0 ? Math.min(0.9, 0.5 + (pfCount - 1) * 0.1) : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.financial_channel_pf_risk', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Financial channel PF risk: ${pfCount} high-risk PF jurisdiction(s) in channel. Score ${score.toFixed(2)}.`,
    [`pf_jur_count=${pfCount}`],
  );
};

/** 31. UN panel intel integrator: sanctions hits → escalate; DPRK/IR counterparty check. */
const unPanelIntelIntegratorApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const jurArr = safeJurArr(ctx);
  const hasDprkOrIr = jurArr.some((j) => j === 'KP' || j === 'IR');
  const score = sanc > 0 ? 0.85 : hasDprkOrIr ? 0.6 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.un_panel_intel_integrator', 'proliferation', PF_FACULTIES, verdict, score, 0.85,
    `UN Panel intel integrator: ${sanc} sanctions hit(s), DPRK/IR counterparty=${hasDprkOrIr}. ${score >= 0.85 ? 'ESCALATE — UN panel indicators.' : 'Monitoring warranted.'}`,
    [`sanc_hits=${sanc}`, `dprk_ir=${hasDprkOrIr}`],
  );
};

/** 32. Ballistic missile typology: KP or IR + sanctions → block. */
const ballisticMissileTypologyApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasKpOrIr = jurArr.some((j) => j === 'KP' || j === 'IR');
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const score = hasKpOrIr && sanc > 0 ? 0.95 : hasKpOrIr ? 0.6 : 0.05;
  const verdict: Verdict = score >= 0.9 ? 'block' : verdictFromScore(score);
  return findingOf(
    'w15.pf.ballistic_missile_typology', 'proliferation', PF_FACULTIES, verdict, score, 0.9,
    `Ballistic missile typology: KP/IR counterparty=${hasKpOrIr}, sanctions=${sanc}. ${score >= 0.9 ? 'BLOCK — ballistic missile financing indicators.' : 'Elevated risk.'}`,
    [`kp_or_ir=${hasKpOrIr}`, `sanc_hits=${sanc}`],
  );
};

/** 33. Chemical weapons precursor: SY in counterparties OR sanctions + adverse media. */
const chemicalWeaponsPrecursorApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasSy = jurArr.includes('SY');
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = hasSy ? 0.85 : sanc > 0 && am > 0 ? 0.85 : sanc > 0 ? 0.5 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.chemical_weapons_precursor', 'proliferation', PF_FACULTIES, verdict, score, 0.85,
    `Chemical weapons precursor: Syria counterparty=${hasSy}, sanctions=${sanc}, adverse media=${am}. Score ${score.toFixed(2)}.`,
    [`sy_counterparty=${hasSy}`, `sanc=${sanc}`, `am=${am}`],
  );
};

/** 34. Nuclear material finance screen: KP or IR → escalate. */
const nuclearMaterialFinanceScreenApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasKpOrIr = jurArr.some((j) => j === 'KP' || j === 'IR');
  const score = hasKpOrIr ? 0.9 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.nuclear_material_finance_screen', 'proliferation', PF_FACULTIES, verdict, score, 0.9,
    `Nuclear material finance screen: KP/IR counterparty=${hasKpOrIr}. ${hasKpOrIr ? 'ESCALATE — nuclear proliferation risk.' : 'No nuclear financing indicators.'}`,
    [`kp_or_ir=${hasKpOrIr}`],
  );
};

/** 35. Cyber capability financing: KP/CN/RU + adverse media. */
const cyberCapabilityFinancingApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasCyberJur = jurArr.some((j) => j === 'KP' || j === 'CN' || j === 'RU');
  const am = safeLen(ctx.evidence.adverseMedia);
  const score = hasCyberJur && am > 0 ? 0.8 : hasCyberJur ? 0.4 : am > 0 ? 0.2 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.cyber_capability_financing', 'proliferation', PF_FACULTIES, verdict, score, 0.8,
    `Cyber capability financing: KP/CN/RU counterparty=${hasCyberJur}, adverse media=${am}. Score ${score.toFixed(2)}.`,
    [`cyber_jur=${hasCyberJur}`, `am=${am}`],
  );
};

/** 36. PF red flag aggregator: sum all PF signals. */
const pfRedFlagAggregatorApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const pfCount = pfJurCount(jurArr);
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const raw = pfCount * 0.15 + sanc * 0.3 + am * 0.1;
  const score = Math.min(0.95, raw);
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.pf_red_flag_aggregator', 'proliferation', PF_FACULTIES, verdict, score, 0.8,
    `PF red flag aggregator: ${pfCount} high-risk jur × 0.15 + ${sanc} sanctions × 0.3 + ${am} adverse media × 0.1 = ${raw.toFixed(2)} (capped at 0.95).`,
    [`pf_jur=${pfCount}`, `sanc=${sanc}`, `am=${am}`, `raw=${raw.toFixed(2)}`],
  );
};

/** 37. Sanctions designee proximity: PEP + PF jurisdiction. */
const sanctionsDesigneeProximityApply: ModeApply = async (ctx) => {
  const pep = safeLen(ctx.evidence.pepHits);
  const jurArr = safeJurArr(ctx);
  const hasPfJur = pfJurCount(jurArr) > 0;
  const score = pep > 0 && hasPfJur ? 0.75 : pep > 0 ? 0.35 : hasPfJur ? 0.2 : 0.05;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.sanctions_designee_proximity', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `Sanctions designee proximity: ${pep} PEP hit(s), PF jurisdiction=${hasPfJur}. Score ${score.toFixed(2)}.`,
    [`pep=${pep}`, `pf_jur=${hasPfJur}`],
  );
};

/** 38. Arms embargo monitor: sanctions hits + embargoed state counterparty. */
const armsEmbargoMonitorApply: ModeApply = async (ctx) => {
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const jurArr = safeJurArr(ctx);
  // High-risk PF jurisdictions double as embargoed states for this heuristic
  const hasEmbargoedState = pfJurCount(jurArr) > 0;
  const score = sanc > 0 && hasEmbargoedState ? 0.85 : sanc > 0 ? 0.5 : hasEmbargoedState ? 0.25 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.arms_embargo_monitor', 'proliferation', PF_FACULTIES, verdict, score, 0.85,
    `Arms embargo monitor: ${sanc} sanctions hit(s), embargoed state counterparty=${hasEmbargoedState}. Score ${score.toFixed(2)}.`,
    [`sanc_hits=${sanc}`, `embargoed_state=${hasEmbargoedState}`],
  );
};

/** 39. PF reporting optimizer: composite all evidence → STR recommendation. */
const pfReportingOptimizerApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const pfCount = pfJurCount(jurArr);
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const am = safeLen(ctx.evidence.adverseMedia);
  const pep = safeLen(ctx.evidence.pepHits);
  const raw = pfCount * 0.15 + sanc * 0.3 + am * 0.08 + pep * 0.15;
  const score = Math.min(0.95, raw);
  const strRecommended = score > 0.5;
  const verdict = verdictFromScore(score);
  return findingOf(
    'w15.pf.pf_reporting_optimizer', 'proliferation', PF_FACULTIES, verdict, score, 0.75,
    `PF reporting optimizer: composite score ${score.toFixed(2)}. ${strRecommended ? 'STR filing recommended.' : 'Threshold not met for STR.'}`,
    [`pf_jur=${pfCount}`, `sanc=${sanc}`, `am=${am}`, `pep=${pep}`, `str_recommended=${strRecommended}`],
  );
};

/** 40. Iran sanctions evader detector: IR or AE+sanctions → escalate. */
const iranSanctionsEvaderDetectorApply: ModeApply = async (ctx) => {
  const jurArr = safeJurArr(ctx);
  const hasIr = jurArr.includes('IR');
  const hasAe = jurArr.includes('AE');
  const sanc = safeLen(ctx.evidence.sanctionsHits);
  const score = hasIr ? 0.9 : hasAe && sanc > 0 ? 0.9 : hasAe ? 0.3 : 0.05;
  const verdict: Verdict = score >= 0.85 ? 'escalate' : verdictFromScore(score);
  return findingOf(
    'w15.pf.iran_sanctions_evader_detector', 'proliferation', PF_FACULTIES, verdict, score, 0.85,
    `Iran sanctions evader detector: IR counterparty=${hasIr}, AE counterparty=${hasAe}, sanctions=${sanc}. ${score >= 0.85 ? 'ESCALATE — Iran sanctions evasion indicators.' : 'Low signal.'} (UAE used as Iran sanctions evasion hub.)`,
    [`ir_counterparty=${hasIr}`, `ae_counterparty=${hasAe}`, `sanc_hits=${sanc}`],
  );
};

// ===========================================================================
// Export
// ===========================================================================
export const WAVE15_CF_PF_APPLIES = {
  // compliance_framework
  'w15.cf.fatf_gap_analyzer':               fatfGapAnalyzerApply,
  'w15.cf.fdl20_article_mapper':            fdl20ArticleMapperApply,
  'w15.cf.fdl10_ai_governance_checker':     fdl10AiGovernanceCheckerApply,
  'w15.cf.fatf_r10_bias_monitor':           fatfR10BiasMonitorApply,
  'w15.cf.six_amld_predicate_checker':      sixAmldPredicateCheckerApply,
  'w15.cf.wolfsberg_correspondent_checker': wolfsbergCorrespondentCheckerApply,
  'w15.cf.str_obligation_matrix':           strObligationMatrixApply,
  'w15.cf.pep_tier_classifier':             pepTierClassifierApply,
  'w15.cf.rba_calibration_engine':          rbaCalibrationEngineApply,
  'w15.cf.sanction_regime_navigator':       sanctionRegimeNavigatorApply,
  'w15.cf.customer_risk_rating_validator':  customerRiskRatingValidatorApply,
  'w15.cf.edd_trigger_checker':             eddTriggerCheckerApply,
  'w15.cf.cdd_completeness_checker':        cddCompletenessCheckerApply,
  'w15.cf.goaml_submission_validator':      goamlSubmissionValidatorApply,
  'w15.cf.travel_rule_compliance':          travelRuleComplianceApply,
  'w15.cf.beneficial_owner_threshold':      beneficialOwnerThresholdApply,
  'w15.cf.negative_news_fatf_mapper':       negativeNewsFatfMapperApply,
  'w15.cf.supervisory_expectation_modeler': supervisoryExpectationModelerApply,
  'w15.cf.four_eyes_quorum_enforcer':       fourEyesQuorumEnforcerApply,
  'w15.cf.mutual_evaluation_sim':           mutualEvaluationSimApply,
  // proliferation
  'w15.pf.dual_use_goods_screen':           dualUseGoodsScreenApply,
  'w15.pf.front_company_detector':          frontCompanyDetectorApply,
  'w15.pf.sanctions_evasion_network':       sanctionsEvasionNetworkApply,
  'w15.pf.strategic_goods_payment_screen':  strategicGoodsPaymentScreenApply,
  'w15.pf.shipping_container_risk':         shippingContainerRiskApply,
  'w15.pf.procurement_agent_detector':      procurementAgentDetectorApply,
  'w15.pf.end_user_cert_validator':         endUserCertValidatorApply,
  'w15.pf.financial_intermediary_screen':   financialIntermediaryScreenApply,
  'w15.pf.technology_transfer_screen':      technologyTransferScreenApply,
  'w15.pf.financial_channel_pf_risk':       financialChannelPfRiskApply,
  'w15.pf.un_panel_intel_integrator':       unPanelIntelIntegratorApply,
  'w15.pf.ballistic_missile_typology':      ballisticMissileTypologyApply,
  'w15.pf.chemical_weapons_precursor':      chemicalWeaponsPrecursorApply,
  'w15.pf.nuclear_material_finance_screen': nuclearMaterialFinanceScreenApply,
  'w15.pf.cyber_capability_financing':      cyberCapabilityFinancingApply,
  'w15.pf.pf_red_flag_aggregator':          pfRedFlagAggregatorApply,
  'w15.pf.sanctions_designee_proximity':    sanctionsDesigneeProximityApply,
  'w15.pf.arms_embargo_monitor':            armsEmbargoMonitorApply,
  'w15.pf.pf_reporting_optimizer':          pfReportingOptimizerApply,
  'w15.pf.iran_sanctions_evader_detector':  iranSanctionsEvaderDetectorApply,
} as const satisfies Record<string, ModeApply>;
