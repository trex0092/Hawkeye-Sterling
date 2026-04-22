// Hawkeye Sterling — MLRO / compliance skills catalogue.
//
// ~390 competencies, reasoning operations, and analytical outputs drawn from
// AML/CFT, sanctions/TFS, KYC/CDD/EDD, supply-chain (LBMA/CAHRA), governance,
// regulatory-liaison, training, and risk-assessment practice.
//
// Every skill is tagged with:
//   - id      : kebab-case slug, unique across the catalogue
//   - label   : verbatim text (never paraphrased)
//   - domain  : one of 15 domains — AML_CORE, KYC_CDD, SANCTIONS_TFS, etc.
//   - layer   : one of three layers — competency / reasoning / analysis
//   - weight  : 0..1 relative emphasis (default 1.0, tunable)
//
// The catalogue is injected into every weaponized system prompt so the
// Claude agents cannot forget the skill surface they embody. It is also
// hashed into the cognitive catalogueHash so any change is auditable.

export type SkillLayer = 'competency' | 'reasoning' | 'analysis';

export type SkillDomain =
  | 'AML_CORE'
  | 'KYC_CDD'
  | 'SANCTIONS_TFS'
  | 'SUPPLY_CHAIN'
  | 'INVESTIGATIONS'
  | 'GOVERNANCE'
  | 'REPORTING'
  | 'RISK_ASSESSMENT'
  | 'TRAINING'
  | 'DIGITAL_ASSETS'
  | 'DATA_PRIVACY'
  | 'REGULATORY'
  | 'SOFT_SKILLS'
  | 'DOCUMENTATION'
  | 'COMPLIANCE_SYS';

export interface Skill {
  readonly id: string;
  readonly label: string;
  readonly domain: SkillDomain;
  readonly layer: SkillLayer;
  readonly weight: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Raw source text. Comma-separated, verbatim from the product charter.
// Keep these as single long strings so diffs stay localised.
// ────────────────────────────────────────────────────────────────────────────

const COMPETENCIES_RAW =
  'AML/CFT Competencies, Technical Compliance Capabilities, Regulatory Intelligence, Risk Assessment Proficiency, KYC/CDD/EDD Expertise, Sanctions Screening Capability, Investigative Competence, MLRO Decision-Making, Supply Chain Due Diligence, Regulatory Writing, Policy Drafting, Judgment and Discretion, Attention to Detail, Communication, Escalation Management, Stakeholder Management, Compliance Competencies, Compliance Capabilities, Compliance Proficiencies, Technical Requirements, Core Competencies, Risk Management Capabilities, Transaction Monitoring Expertise, Red Flag Recognition, Adverse Media Screening, Corporate Structure Analysis, PEP Identification, UBO Tracing, Compliance Documentation, Evidence Collection, Record-Keeping, Control Design, Control Implementation, Testing Methodology, Audit Competence, Examination Preparation, Board Reporting, Senior Management Briefing, Governance Architecture, Committee Management, Reporting Protocol, Tipping-Off Management, Consent Management, GOAML Reporting, FIU Correspondence, Regulatory Liaison, Compliance Training Design, Compliance Awareness, Staff Coaching, Red Flag Awareness, Scenario-Based Learning, Policy Documentation, Procedure Documentation, Control Documentation, Risk Register Maintenance, Compliance Calendar Management, Compliance Metrics, Performance Monitoring, Threshold Management, Alert Management, False Positive Management, Compliance System Administration, Database Management, Compliance Tool Proficiency, EWRA Development, BWRA Development, Risk Matrix Design, Risk Appetite Calibration, Inherent Risk Assessment, Residual Risk Assessment, Control Effectiveness Evaluation, Remediation Roadmap, CAHRA Assessment, Refinery Evaluation, LBMA RGG Steps 1-5, Chain-of-Custody Verification, Conflict Minerals Assessment, Country-of-Origin Verification, Sourcing Documentation, Invoice Analysis, Pricing Discrepancy Detection, Third-Party Payment Investigation, Structuring Detection, Smurfing Detection, Velocity Anomaly Detection, Threshold Alert Review, TBML Review, Placement/Layering/Integration Analysis, Digital Asset Compliance, Cryptocurrencies Monitoring, Virtual Assets Screening, PDPL Data Privacy, Data Breach Response, Consent Management Systems, Cabinet Resolution Interpretation, FATF Compliance, Mutual Evaluation Preparation, Sanctions Program Design, TFS Compliance, Proliferation Financing Prevention, CPF Controls, Vendor Assessment, Third-Party Management, Counterparty Due Diligence, Beneficial Owner Identification, Relationship Manager Coaching, Compliance Culture Building, Compliance Incentivization, Whistleblower Management, Internal Disclosure Decisions, Legal Professional Privilege Assessment, Regulatory Strategy, Examination Strategy, Negotiation Skills, Regulatory Relations';

const REASONING_RAW =
  'Regulatory Inference, Risk-Based Logic, Suspicious Activity Assessment, Control Effectiveness Reasoning, Compliance Rationale, Tipping-Off Analysis, Precedent-Based Reasoning, Proportionality Assessment, Regulatory Interpretation, MLRO Judgment, Escalation Logic, Consent Reasoning, Materiality Assessment, Likelihood & Impact Assessment, Transaction Pattern Reasoning, Red Flag Correlation, Indicator Weighting, Risk Scoring Logic, Customer Risk Assessment Reasoning, Supplier Risk Assessment Reasoning, Geographic Risk Reasoning, Product Risk Reasoning, Channel Risk Reasoning, Business Line Risk Reasoning, Inherent Risk Logic, Residual Risk Logic, Control Effectiveness Judgment, Gap Assessment Reasoning, Compliance Maturity Reasoning, Regulatory Examination Reasoning, FATF Reasoning, Cabinet Resolution Reasoning, MoE Circular Interpretation, CBUAE Directive Interpretation, FIU Guidance Application, Sanctions Regime Logic, TFS Compliance Reasoning, Proliferation Financing Logic, CPF Analysis Logic, PDPL Application Reasoning, Digital Asset Reasoning, VARA Reasoning, LBMA RGG Logic, CAHRA Determination, Conflict Zone Identification, Refinery Assessment Reasoning, Supply Chain Risk Logic, Invoice Pricing Reasoning, TBML Pattern Reasoning, Structuring Pattern Reasoning, Smurfing Pattern Reasoning, Velocity Anomaly Reasoning, Circular Transaction Reasoning, Beneficial Owner Tracing Logic, Corporate Structure Unraveling, PEP Connection Reasoning, Adverse Media Assessment, Source of Funds Reasoning, Source of Wealth Reasoning, Third-Party Payment Logic, False Positive Determination, Screening Match Assessment, Policy Application Reasoning, Procedure Compliance Reasoning, Control Design Reasoning, Testing Methodology Reasoning, Documentation Requirement Reasoning, Record-Keeping Standard Reasoning, Board Reporting Thresholds, Senior Management Escalation Logic, Governance Structure Reasoning, Reporting Line Assessment, Authority Assessment, Whistleblower Assessment, Internal Disclosure Timing Logic, Legal Privilege Assessment, Regulatory Strategy Reasoning, Examination Preparation Logic, Negotiation Logic, Precedent Application, Regulatory Trend Analysis, Industry Practice Reasoning, Best Practice Application, Proportionate Response Determination, Cost-Benefit Analysis, Resource Allocation Reasoning, Priority Setting Logic, Timeline Assessment, Remediation Feasibility Reasoning, Control Implementation Reasoning, Training Effectiveness Reasoning, Staff Capability Assessment, Stakeholder Risk Assessment, Relationship Management Reasoning, Regulatory Relations Logic, Compliance Culture Development, Incentive Structure Reasoning, Penalty Assessment Reasoning, Enforcement Risk Reasoning, Consent Probability Assessment, Production Order Likelihood, Internal Investigation Scope, Evidence Preservation Logic, Chain of Custody Reasoning, Documentation Standards Reasoning, Audit Trail Integrity Assessment';

const ANALYSIS_RAW =
  'Transaction Analysis, Pattern Detection, Trade-Based Money Laundering Analysis, Velocity Analysis, Structuring Investigation, Smurfing Investigation, Placement/Layering/Integration Staging, Cash-Intensive Business Assessment, Circular Transaction Analysis, Round Dollar Analysis, Multiple Transaction Analysis, Third-Party Payment Analysis, Invoice Pricing Analysis, Pricing Discrepancy Analysis, Over-Invoice Analysis, Under-Invoice Analysis, Documentation Discrepancy Analysis, TBML Red Flag Analysis, Enterprise-Wide Risk Assessment, Business-Wide Risk Assessment, Gap Analysis, Control Effectiveness Testing, Compliance Maturity Assessment, Regulatory Examination Analysis, Audit Trail Forensics, Customer Risk Scoring, Source of Funds Analysis, Source of Wealth Analysis, UBO Beneficial Ownership Mapping, Family Connection Tracing, Wealth Correlation Analysis, PEP & Corruption Investigation, Adverse Media Deep Review, Sanctions Screening Analysis, Screening Match Validation, False Positive Resolution, Know Your Supplier Due Diligence, KYS Investigation, Conflict-Affected Area Analysis, High-Risk Area Identification, Refinery Due Diligence, Refinery Compliance Evaluation, LBMA Certification Verification, LBMA RGG Steps 1-5 Assessment, Responsible Sourcing Assessment, Conflict Minerals Analysis, Mine Location Assessment, Artisanal Mining Assessment, Policy Gap Analysis, Regulatory Compliance Mapping, Control Documentation Review, Governance Structure Assessment, Training Effectiveness Analysis, Red Flag Recognition Testing, Tipping-Off Risk Assessment, Consent Feasibility Analysis, Regulatory Intelligence Analysis, Regulatory Examination Forensics, Industry Precedent Analysis, Peer Enforcement Action Analysis, FIU Correspondence Analysis, FIU Filing Pattern Analysis, FATF Mutual Evaluation Analysis, FATF Deficiency Analysis, Cabinet Resolution Interpretation Analysis, MoE Circular Analysis, CBUAE Directive Analysis, Sanctions Regime Deep Analysis, TFS Compliance Deep Analysis, Proliferation Financing Analysis, CPF Control Analysis, PDPL Data Privacy Analysis, Digital Asset Deep Analysis, Cryptocurrency Analysis, Virtual Asset Analysis, VARA Framework Analysis, Supply Chain Risk Deep Analysis, Vendor Risk Profiling, Third-Party Risk Assessment, Counterparty Risk Analysis, Beneficial Owner Verification, Relationship Manager Assessment, Compliance Culture Maturity Analysis, Whistleblower Investigation, Internal Disclosure Assessment, Board Reporting Analysis, Senior Management Briefing Analysis, Governance Structure Evaluation, Reporting Line Analysis, Committee Effectiveness Analysis, Compliance Calendar Review, Threshold Management Analysis, Alert Management Analysis, False Positive Root Cause Analysis, Compliance Tool Effectiveness Analysis, System Configuration Analysis, Database Integrity Analysis, Compliance Metric Analysis, Performance Indicator Analysis, Compliance KPI Assessment, Risk Register Review, Risk Heat Map Analysis, Remediation Roadmap Analysis, Remediation Tracking Analysis, Implementation Feasibility Analysis, Timeline Feasibility Analysis, Resource Requirement Analysis, Compliance Cost Analysis, Budget Allocation Analysis, Staff Capability Analysis, Training Need Assessment, Compliance Awareness Assessment, Stakeholder Readiness Analysis, Change Management Analysis, Regulatory Relations Assessment, Examination Preparation Analysis, Negotiation Strategy Analysis, Enforcement Risk Assessment, Penalty Risk Calculation, Production Order Risk Assessment, Internal Investigation Scope Assessment, Evidence Preservation Analysis, Audit Trail Analysis, Documentation Standards Review, Record-Keeping Assessment, Retention Schedule Verification, Destruction Protocol Verification, Compliance Program Effectiveness Analysis, System Coverage Analysis, Control Coverage Analysis, Procedure Coverage Analysis, Documentation Coverage Analysis, Testing Coverage Analysis, Monitoring Coverage Analysis, Reporting Coverage Analysis, Governance Coverage Analysis, Training Coverage Analysis, Awareness Coverage Analysis, Vendor Management Analysis, Third-Party Oversight Analysis, Outsourcing Risk Analysis, Service Provider Risk Assessment, Subcontractor Risk Assessment, Compliance Due Diligence, Background Investigation, Screening Results Analysis, Match Validation, False Positive Investigation, Alert Investigation, Transaction Investigation, Customer Investigation, Supplier Investigation, Geographic Risk Investigation, Product Risk Investigation, Channel Risk Investigation, Business Line Risk Investigation, Customer Segment Investigation, Transaction Volume Investigation, Customer Behavior Investigation, Unusual Activity Investigation, Suspicious Pattern Investigation, Red Flag Investigation, Indicator Verification, Control Verification, Procedure Verification, Documentation Verification, Evidence Verification, Compliance Assertion Verification';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Keyword-driven domain inference. Order matters — more specific patterns
 * fire first so (e.g.) "PEP & Corruption Investigation" routes to KYC_CDD
 * rather than INVESTIGATIONS, and "Digital Asset Reasoning" routes to
 * DIGITAL_ASSETS rather than AML_CORE.
 */
export function inferDomain(label: string): SkillDomain {
  const L = label.toLowerCase();
  if (/\bsanction|\btfs\b|proliferation|\bcpf\b|embargo/.test(L)) return 'SANCTIONS_TFS';
  if (/\bcrypto|virtual asset|digital asset|\bvara\b/.test(L)) return 'DIGITAL_ASSETS';
  if (/\bpdpl\b|data priv|data breach/.test(L)) return 'DATA_PRIVACY';
  if (/lbma|cahra|conflict|refinery|sourcing|\brgg\b|chain-of-custody|country-of-origin|\binvoice|pricing discrepancy|over-invoice|under-invoice|supply chain|vendor|third[- ]party|counterparty|subcontractor|outsourc|service provider|mine loc|artisanal|know your supplier|\bkys\b/.test(L)) return 'SUPPLY_CHAIN';
  if (/goaml|\bfiu\b|\bstr\b|\bsar\b|\bffr\b|\bpnmr\b|regulatory report|filing|report(ing)? protocol|board report|senior management brief/.test(L)) return 'REPORTING';
  if (/fatf|cbuae|\bmoe\b|cabinet resolution|regulatory (strategy|interpretation|inference|trend|intelligence|writing|liaison|relations|examination|compliance mapping)|mutual evaluation|examination (preparation|strategy|analysis|forensic|reasoning|logic)|enforcement/.test(L)) return 'REGULATORY';
  if (/\bkyc\b|\bcdd\b|\bedd\b|\bubo\b|beneficial owner|customer due|source of (funds|wealth)|\bpep\b|adverse media|corporate structure|family connection|wealth correlation|background investigation|customer (risk|investigation|segment|behavior)/.test(L)) return 'KYC_CDD';
  if (/board|senior management|committee|governance|\bmlro\b|authority assessment|reporting line|whistleblower|internal disclosure|(legal )?priv(ilege)?|compliance culture|incentiv/.test(L)) return 'GOVERNANCE';
  if (/\bewra\b|\bbwra\b|enterprise-wide|business-wide|risk (matrix|register|score|assess|scoring|appetite|heat|profil)|inherent risk|residual risk|likelihood|materiality|geographic risk|product risk|channel risk|business line|supplier risk|stakeholder risk|outsourcing risk|penalty|production order/.test(L)) return 'RISK_ASSESSMENT';
  if (/training|awareness|coaching|staff|scenario-based|learning|capability|change management|stakeholder readiness/.test(L)) return 'TRAINING';
  if (/investigat|forensic|trac(e|ing)|unravel|tbml|trade-based|structuring|smurfing|velocity|circular|typology|\bred flag|suspicious|alert|unusual activity|pattern detection|round dollar|multiple transaction|transaction (analysis|pattern)|\bcash-intensive/.test(L)) return 'INVESTIGATIONS';
  if (/documentation|record-keeping|audit trail|evidence (preservation|collection|verification|standards)|chain of custody|retention schedule|destruction protocol|documentation (standards|requirement|coverage|verification)/.test(L)) return 'DOCUMENTATION';
  if (/system (administration|coverage|configuration)|database|compliance tool|compliance (metric|kpi|calendar)|performance (monitoring|indicator)|threshold|\balert|false positive|monitoring coverage/.test(L)) return 'COMPLIANCE_SYS';
  if (/negotiat|stakeholder|communication|judgment|attention to detail|escalation|culture|relationship manag|consent/.test(L)) return 'SOFT_SKILLS';
  return 'AML_CORE';
}

// ────────────────────────────────────────────────────────────────────────────
// Build: dedupe across layers by slug, preserving first-seen ordering.
// Layer priority: competency → reasoning → analysis.
// ────────────────────────────────────────────────────────────────────────────

function buildSkills(): readonly Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  const ingest = (raw: string, layer: SkillLayer) => {
    for (const chunk of raw.split(',')) {
      const label = chunk.trim();
      if (!label) continue;
      const id = slug(label);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label,
        domain: inferDomain(label),
        layer,
        weight: 1.0,
      });
    }
  };
  ingest(COMPETENCIES_RAW, 'competency');
  ingest(REASONING_RAW, 'reasoning');
  ingest(ANALYSIS_RAW, 'analysis');
  return Object.freeze(out);
}

export const SKILLS: readonly Skill[] = buildSkills();

// ────────────────────────────────────────────────────────────────────────────
// Derived views — all frozen, computed once at module load.
// ────────────────────────────────────────────────────────────────────────────

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  SKILLS.map((s) => [s.id, s]),
);

function groupBy<K extends string>(
  skills: readonly Skill[],
  key: (s: Skill) => K,
): Readonly<Record<K, readonly Skill[]>> {
  const acc: Partial<Record<K, Skill[]>> = {};
  for (const s of skills) {
    const k = key(s);
    (acc[k] ??= []).push(s);
  }
  for (const k of Object.keys(acc)) Object.freeze(acc[k as K]);
  return Object.freeze(acc) as Readonly<Record<K, readonly Skill[]>>;
}

export const SKILLS_BY_DOMAIN: Readonly<Record<SkillDomain, readonly Skill[]>> =
  groupBy(SKILLS, (s) => s.domain);

export const SKILLS_BY_LAYER: Readonly<Record<SkillLayer, readonly Skill[]>> =
  groupBy(SKILLS, (s) => s.layer);

function countBy<K extends string>(
  groups: Readonly<Record<K, readonly Skill[]>>,
): Readonly<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(groups) as Array<[K, readonly Skill[]]>) {
    out[k] = v.length;
  }
  return Object.freeze(out) as Readonly<Record<K, number>>;
}

export const SKILLS_DOMAIN_COUNTS: Readonly<Record<string, number>> =
  countBy(SKILLS_BY_DOMAIN);

export const SKILLS_LAYER_COUNTS: Readonly<Record<string, number>> =
  countBy(SKILLS_BY_LAYER);

// ────────────────────────────────────────────────────────────────────────────
// Prompt composition — kept terse because the weaponized prompt is already
// large. The agents need to know the catalogue exists, its shape, and a
// handful of samples per domain; the full list is loaded into the model's
// context only when the caller sets `includeSkillsFullList: true`.
// ────────────────────────────────────────────────────────────────────────────

export interface SkillsSummaryOptions {
  includeFullList?: boolean;
  samplesPerDomain?: number; // default 3
}

export function skillsCatalogueSummary(opts: SkillsSummaryOptions = {}): string {
  const samples = Math.max(0, opts.samplesPerDomain ?? 3);
  const lines: string[] = [];
  lines.push(
    `Skills catalogue: ${SKILLS.length} skills registered across ${Object.keys(SKILLS_BY_DOMAIN).length} domains and 3 layers (competency / reasoning / analysis).`,
  );
  const layerBits = (Object.keys(SKILLS_LAYER_COUNTS) as SkillLayer[])
    .map((k) => `${k}=${SKILLS_LAYER_COUNTS[k]}`)
    .join(', ');
  lines.push(`By layer: ${layerBits}.`);
  lines.push('By domain (descending):');
  const domains = Object.keys(SKILLS_BY_DOMAIN) as SkillDomain[];
  domains.sort((a, b) => SKILLS_DOMAIN_COUNTS[b]! - SKILLS_DOMAIN_COUNTS[a]!);
  for (const d of domains) {
    const count = SKILLS_DOMAIN_COUNTS[d] ?? 0;
    const sampleLabels = SKILLS_BY_DOMAIN[d]
      .slice(0, samples)
      .map((s) => s.label)
      .join('; ');
    lines.push(`  - ${d}: ${count}${samples > 0 && sampleLabels ? ` (e.g. ${sampleLabels})` : ''}`);
  }
  if (opts.includeFullList) {
    lines.push('');
    lines.push('FULL SKILL LIST (id · label · domain · layer):');
    for (const s of SKILLS) {
      lines.push(`  ${s.id} · ${s.label} · ${s.domain} · ${s.layer}`);
    }
  }
  lines.push(
    'You embody every skill in this catalogue in every reasoning chain. Cite skill ids where relevant. Never claim a skill beyond the weight declared. Any assertion that depends on a skill must name the skill id.',
  );
  return lines.join('\n');
}

/**
 * Stable, order-independent signature of the skills catalogue — used by
 * `buildWeaponizedBrainManifest` so any catalogue change shifts the
 * `catalogueHash`.
 */
export function skillsCatalogueSignature(): string {
  return JSON.stringify(
    [...SKILLS].map((s) => s.id).sort(),
  );
}
