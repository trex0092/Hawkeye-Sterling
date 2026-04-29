// Hawkeye Sterling — Weaponized Adverse Media Analyser.
//
// Fuses the live Taranis AI intelligence feed with the brain's full cognitive
// arsenal: 737-keyword taxonomy, FATF predicate mapping, severity scoring,
// SAR trigger logic, counterfactual reasoning, and investigation narrative
// generation. The output is MLRO-grade — every finding cites the mode id,
// FATF recommendation, doctrine, and keyword that fired.
//
// Pipeline:
//   TaranisItem[] → classifyAdverseMedia → category / severity mapping
//   → FATF predicate offense → SAR trigger (R.20 threshold)
//   → counterfactual → risk verdict → investigation narrative
//
// Severity mapping (aligns with ongoing/run and news-search):
//   critical — TF, PF, WMD, DPRK/Iran sanctions violation
//   high     — ML/financial crime, corruption/organised crime, sanctions, human trafficking
//   medium   — legal/criminal proceedings, cybercrime, drug trafficking, tax crimes
//   low      — ESG/environmental, AI-risk controversies

import {
  classifyAdverseMedia,
  ADVERSE_MEDIA_CATEGORIES,
  type AdverseMediaHit,
} from './adverse-media.js';
import type { TaranisItem } from '../integrations/taranisAi.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdverseMediaSeverity = 'critical' | 'high' | 'medium' | 'low' | 'clear';

export interface AdverseMediaFinding {
  itemId: string;
  title: string;
  source: string;
  published: string;
  url?: string;
  severity: AdverseMediaSeverity;
  categories: string[];                // matched ADVERSE_MEDIA_CATEGORIES ids
  keywords: string[];                  // specific keywords that fired
  fatfRecommendations: string[];       // e.g. ['R.3', 'R.6', 'R.20']
  fatfPredicates: string[];            // predicate offense labels
  reasoningModes: string[];            // brain mode ids that apply
  doctrineIds: string[];               // doctrine ids
  narrative: string;                   // single MLRO-grade finding line
  relevanceScore: number;              // 0–1 from Taranis (or 1 if unavailable)
  isSarCandidate: boolean;             // meets R.20 reporting threshold
}

export type AdverseMediaRiskTier =
  | 'clear'       // no adverse hits
  | 'low'         // ESG/soft controversy only
  | 'medium'      // legal/cyber/regulatory — enhanced monitoring
  | 'high'        // ML/corruption/organised crime — EDD trigger
  | 'critical';   // TF/PF/sanctions violation — immediate escalation

export interface AdverseMediaSubjectVerdict {
  subject: string;
  riskTier: AdverseMediaRiskTier;
  riskDetail: string;
  totalItems: number;
  adverseItems: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  sarRecommended: boolean;             // R.20 — filing trigger met
  sarBasis: string;                    // narrative basis for SAR recommendation
  confidenceTier: 'high' | 'medium' | 'low';
  confidenceBasis: string;
  counterfactual: string;              // what if source bias / coverage gap
  investigationLines: string[];        // actionable next steps for MLRO
  findings: AdverseMediaFinding[];     // all adverse findings, critical-first
  fatfRecommendations: string[];       // deduplicated FATF refs across all findings
  categoryBreakdown: Array<{
    categoryId: string;
    displayName: string;
    count: number;
    severity: AdverseMediaSeverity;
  }>;
  analysedAt: string;
  modesCited: string[];                // all mode ids cited across findings
}

// ---------------------------------------------------------------------------
// Category → severity, FATF, modes mapping
// ---------------------------------------------------------------------------

interface CategoryProfile {
  severity: AdverseMediaSeverity;
  fatfRecs: string[];
  predicates: string[];
  modes: string[];
  doctrines: string[];
}

const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  terrorist_financing: {
    severity: 'critical',
    fatfRecs: ['R.5', 'R.6', 'R.20', 'R.21'],
    predicates: ['Terrorist financing (FATF R.5)'],
    modes: ['filing_str_narrative', 'escalation_trigger', 'sanctions_regime_matrix', 'list_walk'],
    doctrines: ['uae_fdl_20_2018', 'uae_cd_74_2020'],
  },
  proliferation_financing: {
    severity: 'critical',
    fatfRecs: ['R.7', 'R.20', 'INR.7'],
    predicates: ['Proliferation financing (FATF R.7)', 'WMD/dual-use export control breach'],
    modes: ['pf_dual_use_controls', 'pf_red_flag_screen', 'sanctions_regime_matrix', 'dual_use_end_user', 'escalation_trigger'],
    doctrines: ['uae_cd_74_2020', 'fatf_rba'],
  },
  sanctions_violations: {
    severity: 'critical',
    fatfRecs: ['R.6', 'R.7', 'R.20'],
    predicates: ['Sanctions violation / evasion', 'Designated entity transactions'],
    modes: ['sanctions_regime_matrix', 'list_walk', 'escalation_trigger', 'ship_flag_hop_analysis', 'sanctions_evasion_network'],
    doctrines: ['uae_cd_74_2020'],
  },
  ml_financial_crime: {
    severity: 'high',
    fatfRecs: ['R.3', 'R.10', 'R.20', 'R.21'],
    predicates: ['Money laundering (FATF R.3)', 'Financial crime predicate offense'],
    modes: ['filing_str_narrative', 'predicate_crime_cascade', 'source_triangulation', 'professional_ml_ecosystem', 'invoice_fabrication_pattern'],
    doctrines: ['uae_fdl_20_2018', 'fatf_rba'],
  },
  corruption_organised_crime: {
    severity: 'high',
    fatfRecs: ['R.3', 'R.12', 'R.20'],
    predicates: ['Corruption/bribery predicate', 'Organised crime proceeds'],
    modes: ['pep_domestic_minister', 'community_detection', 'link_analysis', 'funnel_mule_cascade'],
    doctrines: ['uae_fdl_20_2018', 'wolfsberg_faq'],
  },
  human_trafficking_modern_slavery: {
    severity: 'high',
    fatfRecs: ['R.3', 'R.20'],
    predicates: ['Human trafficking predicate (FATF R.3)', 'Modern slavery proceeds'],
    modes: ['human_trafficking_predicate', 'predicate_crime_cascade', 'filing_str_narrative'],
    doctrines: ['uae_fdl_20_2018'],
  },
  drug_trafficking: {
    severity: 'medium',
    fatfRecs: ['R.3', 'R.20'],
    predicates: ['Drug trafficking predicate (FATF R.3)'],
    modes: ['predicate_crime_cascade', 'community_detection', 'link_analysis'],
    doctrines: ['uae_fdl_20_2018'],
  },
  cybercrime: {
    severity: 'medium',
    fatfRecs: ['R.3', 'R.15', 'R.20'],
    predicates: ['Cybercrime predicate', 'Digital-asset abuse'],
    modes: ['cyber_crime_predicate', 'vasp_wallet_screen', 'chain_analysis', 'crypto_ransomware_cashout'],
    doctrines: ['fatf_rba'],
  },
  tax_crimes: {
    severity: 'medium',
    fatfRecs: ['R.3', 'R.10', 'R.20'],
    predicates: ['Tax crime predicate (FATF R.3)', 'Offshore fiscal fraud'],
    modes: ['tax_evasion_predicate', 'jurisdiction_cascade', 'ubo_tree_walk'],
    doctrines: ['uae_fdl_20_2018', 'fatf_rba'],
  },
  legal_criminal_regulatory: {
    severity: 'medium',
    fatfRecs: ['R.10', 'R.20'],
    predicates: ['Criminal/regulatory proceedings — predicate risk'],
    modes: ['completeness_audit', 'documentation_quality', 'filing_str_narrative'],
    doctrines: ['fatf_rba'],
  },
  ai: {
    severity: 'medium',
    fatfRecs: ['R.3', 'R.15'],
    predicates: ['AI-enabled fraud / synthetic-media abuse'],
    modes: ['cyber_crime_predicate', 'defi_smart_contract'],
    doctrines: ['fatf_rba'],
  },
  environmental_crime: {
    severity: 'low',
    fatfRecs: ['R.3', 'FATF-EnvCrime'],
    predicates: ['Environmental crime predicate (FATF EnvCrime 2021)'],
    modes: ['environmental_predicate', 'provenance_trace', 'oecd_ddg_annex'],
    doctrines: ['fatf_r3_env_predicate', 'oecd_ddg'],
  },
  esg: {
    severity: 'low',
    fatfRecs: ['R.3', 'FATF-EnvCrime'],
    predicates: ['ESG/responsible-sourcing controversy'],
    modes: ['environmental_predicate', 'oecd_ddg_annex', 'provenance_trace'],
    doctrines: ['oecd_ddg', 'fatf_r3_env_predicate'],
  },
};

// ---------------------------------------------------------------------------
// Severity ordering
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AdverseMediaSeverity, number> = {
  critical: 4, high: 3, medium: 2, low: 1, clear: 0,
};

function maxSeverity(a: AdverseMediaSeverity, b: AdverseMediaSeverity): AdverseMediaSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

function hitsToSeverity(hits: AdverseMediaHit[]): AdverseMediaSeverity {
  if (hits.length === 0) return 'clear';
  let best: AdverseMediaSeverity = 'clear';
  for (const h of hits) {
    const profile = CATEGORY_PROFILES[h.categoryId];
    if (profile) best = maxSeverity(best, profile.severity);
  }
  return best;
}

// ---------------------------------------------------------------------------
// SAR trigger (R.20)
// ---------------------------------------------------------------------------

function sarThresholdMet(findings: AdverseMediaFinding[]): boolean {
  // SAR candidate if any critical/high finding, or ≥ 3 medium findings
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  return critical > 0 || high > 0 || medium >= 3;
}

function sarBasisNarrative(findings: AdverseMediaFinding[]): string {
  if (findings.length === 0) return 'No adverse findings — no reporting obligation.';
  const top = findings[0];
  if (!top) return 'No adverse findings — no reporting obligation.';
  if (top.severity === 'critical') {
    return `FATF R.20 reporting obligation triggered: critical adverse-media finding — "${top.title}" (${top.source}, ${top.published.slice(0, 10)}). Predicates: ${top.fatfPredicates.join('; ')}. File STR/SAR without delay; tipping-off prohibition (R.21 / doctrine: uae_fdl_20_2018) applies.`;
  }
  if (top.severity === 'high') {
    return `FATF R.20 SAR consideration: high-severity adverse media — "${top.title}" (${top.source}). Categories: ${top.categories.join(', ')}. MLRO review required within 24 h.`;
  }
  return `Adverse-media pattern warrants enhanced monitoring per FATF R.20. ${findings.length} finding(s) across ${[...new Set(findings.flatMap((f) => f.categories))].join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Narrative generator for individual findings
// ---------------------------------------------------------------------------

function buildFindingNarrative(
  subject: string,
  item: TaranisItem,
  severity: AdverseMediaSeverity,
  categories: string[],
  keywords: string[],
  fatfRecs: string[],
): string {
  const date = item.published.slice(0, 10);
  const catLabels = categories.map((id) => {
    const cat = ADVERSE_MEDIA_CATEGORIES.find((c) => c.id === id);
    return cat?.displayName ?? id;
  }).join('; ');
  const kwSnippet = keywords.slice(0, 3).map((k) => `"${k}"`).join(', ');
  const fatfCite = fatfRecs.length > 0 ? ` [${fatfRecs.join(', ')}]` : '';
  return `[${severity.toUpperCase()}] "${item.title}" — ${item.source} (${date}): adverse-media hit on subject "${subject}" in category "${catLabels}". Keywords: ${kwSnippet}.${fatfCite}`;
}

// ---------------------------------------------------------------------------
// Risk tier → investigation lines
// ---------------------------------------------------------------------------

function investigationLines(
  riskTier: AdverseMediaRiskTier,
  findings: AdverseMediaFinding[],
  subject: string,
): string[] {
  const lines: string[] = [];
  const sources = [...new Set(findings.map((f) => f.source))].slice(0, 4).join(', ');

  if (riskTier === 'critical') {
    lines.push(`Immediate MLRO escalation required for "${subject}" — critical adverse media.`);
    lines.push(`Freeze all pending transactions pending SAR filing (FATF R.20 / doctrine: uae_fdl_20_2018).`);
    lines.push(`Cross-reference against OFAC SDN, UN Consolidated, EU Consolidated lists.`);
    lines.push(`Commission full EDD — document source of funds, UBO chain (FATF R.10, R.24).`);
    lines.push(`Tipping-off prohibition in force (FATF R.21 / doctrine: uae_fdl_20_2018) — do not alert subject.`);
  } else if (riskTier === 'high') {
    lines.push(`Enhanced Due Diligence triggered for "${subject}" (FATF R.10, R.19).`);
    lines.push(`Senior management sign-off required before continuing relationship.`);
    lines.push(`Obtain and verify documentary evidence of funds source.`);
    lines.push(`Review all transactions in last 12 months for suspicious patterns.`);
    lines.push(`Set 30-day review date; escalate to SAR if pattern continues.`);
  } else if (riskTier === 'medium') {
    lines.push(`Enhanced monitoring recommended for "${subject}" — adverse media in medium-risk category.`);
    lines.push(`Review customer profile and transaction history for consistency.`);
    lines.push(`Update risk score in customer risk assessment with adverse-media flag.`);
    lines.push(`Schedule 90-day adverse-media re-screen (automated via ongoing-monitoring).`);
  } else {
    lines.push(`Adverse-media flag noted for "${subject}" — low-severity (ESG/regulatory).`);
    lines.push(`Document findings in customer file per FATF R.10 / record-keeping (R.11).`);
    lines.push(`Re-screen in 6 months; escalate if severity increases.`);
  }

  if (sources) {
    lines.push(`Primary sources: ${sources}.`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Counterfactual reasoning
// ---------------------------------------------------------------------------

function counterfactualAssessment(
  findings: AdverseMediaFinding[],
  totalItems: number,
): string {
  if (findings.length === 0) {
    return 'Counterfactual: absence of adverse media does not confirm clean status — coverage gaps may exist (FATF grey-list sources, local-language press, paywalled publications). Periodic re-screen recommended.';
  }
  const sourceCount = new Set(findings.map((f) => f.source)).size;
  const multiSource = sourceCount > 1;
  const highRelevance = findings.filter((f) => f.relevanceScore >= 0.7).length;
  const caveats: string[] = [];
  if (!multiSource) caveats.push('single-source finding — corroborate with additional sources before escalating');
  if (highRelevance === 0) caveats.push('no high-relevance items (score ≥ 0.7) — NLP relevance scoring may have under-weighted matches');
  caveats.push('homonym / name-collision risk — verify findings relate to this specific subject and not a namesake');
  caveats.push(`${totalItems - findings.length} non-adverse items reviewed and excluded`);
  return `Counterfactual (mode: source_triangulation): ${caveats.join('; ')}.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyseAdverseMediaItems(
  subject: string,
  items: TaranisItem[],
): AdverseMediaSubjectVerdict {
  const analysedAt = new Date().toISOString();
  const adverseFindings: AdverseMediaFinding[] = [];

  for (const item of items) {
    const text = `${item.title} ${item.content}`;
    const hits: AdverseMediaHit[] = classifyAdverseMedia(text);

    if (hits.length === 0) continue;

    const severity = hitsToSeverity(hits);
    const categoryIds = [...new Set(hits.map((h) => h.categoryId))];
    const keywords = [...new Set(hits.map((h) => h.keyword))];

    const fatfRecs: string[] = [];
    const predicates: string[] = [];
    const modes: string[] = [];
    const doctrines: string[] = [];

    for (const catId of categoryIds) {
      const profile = CATEGORY_PROFILES[catId];
      if (!profile) continue;
      for (const r of profile.fatfRecs) if (!fatfRecs.includes(r)) fatfRecs.push(r);
      for (const p of profile.predicates) if (!predicates.includes(p)) predicates.push(p);
      for (const m of profile.modes) if (!modes.includes(m)) modes.push(m);
      for (const d of profile.doctrines) if (!doctrines.includes(d)) doctrines.push(d);
    }

    const narrative = buildFindingNarrative(subject, item, severity, categoryIds, keywords, fatfRecs);

    // FATF R.20 — individual item SAR candidate flag
    const isSarCandidate = severity === 'critical' || severity === 'high';

    adverseFindings.push({
      itemId: item.id,
      title: item.title,
      source: item.source,
      published: item.published,
      ...(item.url !== undefined ? { url: item.url } : {}),
      severity,
      categories: categoryIds,
      keywords,
      fatfRecommendations: fatfRecs,
      fatfPredicates: predicates,
      reasoningModes: modes,
      doctrineIds: doctrines,
      narrative,
      relevanceScore: item.relevanceScore ?? 1,
      isSarCandidate,
    } as AdverseMediaFinding);
  }

  // Sort critical → high → medium → low
  adverseFindings.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  const criticalCount = adverseFindings.filter((f) => f.severity === 'critical').length;
  const highCount = adverseFindings.filter((f) => f.severity === 'high').length;
  const mediumCount = adverseFindings.filter((f) => f.severity === 'medium').length;
  const lowCount = adverseFindings.filter((f) => f.severity === 'low').length;

  // Subject-level risk tier
  let riskTier: AdverseMediaRiskTier = 'clear';
  if (criticalCount > 0) riskTier = 'critical';
  else if (highCount > 0) riskTier = 'high';
  else if (mediumCount > 0) riskTier = 'medium';
  else if (lowCount > 0) riskTier = 'low';

  const riskDetail = riskTier === 'clear'
    ? `No adverse media identified across ${items.length} item(s).`
    : `${adverseFindings.length} adverse finding(s): critical=${criticalCount}, high=${highCount}, medium=${mediumCount}, low=${lowCount}.`;

  // SAR recommendation (FATF R.20)
  const sarRecommended = sarThresholdMet(adverseFindings);
  const sarBasis = sarBasisNarrative(adverseFindings);

  // Confidence tier
  const itemCount = items.length;
  const sourceCount = new Set(adverseFindings.map((f) => f.source)).size;
  const highRelCount = adverseFindings.filter((f) => f.relevanceScore >= 0.7).length;
  const confidenceTier: 'high' | 'medium' | 'low' =
    itemCount >= 10 && sourceCount >= 2 && highRelCount > 0 ? 'high'
    : itemCount >= 3 ? 'medium'
    : 'low';
  const confidenceBasis = `${itemCount} items reviewed, ${sourceCount} distinct source(s), ${highRelCount} high-relevance hit(s) (score ≥ 0.7).`;

  // Counterfactual
  const counterfactual = counterfactualAssessment(adverseFindings, items.length);

  // Investigation lines
  const investigLines = adverseFindings.length > 0
    ? investigationLines(riskTier, adverseFindings, subject)
    : [`No adverse findings — standard CDD monitoring continues for "${subject}". Re-screen per ongoing monitoring schedule.`];

  // Deduplicate FATF refs and mode ids
  const allFatf = [...new Set(adverseFindings.flatMap((f) => f.fatfRecommendations))].sort();
  const allModes = [...new Set(adverseFindings.flatMap((f) => f.reasoningModes))].sort();

  // Category breakdown
  const catCounts: Record<string, number> = {};
  for (const f of adverseFindings) {
    for (const catId of f.categories) {
      catCounts[catId] = (catCounts[catId] ?? 0) + 1;
    }
  }
  const categoryBreakdown = Object.entries(catCounts).map(([id, count]) => {
    const cat = ADVERSE_MEDIA_CATEGORIES.find((c) => c.id === id);
    const profile = CATEGORY_PROFILES[id];
    return {
      categoryId: id,
      displayName: cat?.displayName ?? id,
      count,
      severity: profile?.severity ?? ('low' as AdverseMediaSeverity),
    };
  }).sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  return {
    subject,
    riskTier,
    riskDetail,
    totalItems: items.length,
    adverseItems: adverseFindings.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    sarRecommended,
    sarBasis,
    confidenceTier,
    confidenceBasis,
    counterfactual,
    investigationLines: investigLines,
    findings: adverseFindings,
    fatfRecommendations: allFatf,
    categoryBreakdown,
    analysedAt,
    modesCited: allModes,
  };
}

// ---------------------------------------------------------------------------
// Convenience: analyse directly from a TaranisSearchResult
// ---------------------------------------------------------------------------

export function analyseAdverseMediaResult(
  subject: string,
  taranisResult: { ok: boolean; items: TaranisItem[]; totalCount: number; adverseCount: number },
): AdverseMediaSubjectVerdict {
  return analyseAdverseMediaItems(subject, taranisResult.ok ? taranisResult.items : []);
}
