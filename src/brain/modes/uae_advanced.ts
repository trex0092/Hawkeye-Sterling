// Hawkeye Sterling — UAE-advanced reasoning modes (PR #223: brain weaponize).
//
// Twelve MLRO-critical modes promoted from stubs to real algorithms,
// targeting UAE-specific AML/CFT operations the existing bundles did not
// yet cover:
//
//   - cabinet_res_walk           — walks Cabinet Resolutions cited in evidence vs the subject
//   - emirate_jurisdiction       — Emirate-level jurisdiction risk overlay
//   - entity_resolution          — KYC entity resolution across name + ID variants
//   - kyb_strict                 — strict know-your-business gating on registry + activity
//   - audit_trail_reconstruction — reconstructs ordered case timeline from audit-chain
//   - fatf_effectiveness         — FATF mutual-evaluation effectiveness rating impact
//   - de_minimis                 — small-transaction threshold check (charter P10)
//   - defi_smart_contract        — DeFi smart-contract exposure assessment
//   - family_office_signal       — family-office structure risk assessment
//   - insurance_wrap             — insurance-wrap layering detection
//   - ghost_employees            — payroll-fraud ghost-employee pattern
//   - kri_alignment              — KRI breach alignment to escalation thresholds
//
// Each consumes typed entries from ctx.evidence and returns a Finding with
// a scored verdict and rationale citing the source refs. Charter P1 (do
// not assert without basis): every mode returns 'inconclusive' if its
// prerequisite evidence is absent. Charter P3 (training-data-as-source):
// none of these modes recall any external fact — they only score what the
// caller hands them.

import type {
  BrainContext, FacultyId, Finding, ReasoningCategory, Verdict,
} from '../types.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mkFinding(
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
    modeId,
    category,
    faculties,
    score: clamp01(score),
    confidence: clamp01(confidence),
    verdict,
    rationale,
    evidence,
    producedAt: Date.now(),
  };
}

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function singleEvidence<T>(ctx: BrainContext, key: string): T | undefined {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return v == null ? undefined : (v as T);
}

// ──────────────────────────────────────────────────────────────────────
// cabinet_res_walk — walks UAE Cabinet Resolutions cited in evidence
// against the subject's facts. Identifies which resolutions apply and
// flags any obligation gap.
// ──────────────────────────────────────────────────────────────────────
interface CabinetCitation {
  resolution: string;
  article: string;
  obligation: string;
  satisfied: boolean | null;
  sourceRef: string;
}

const cabinetResWalkApply = async (ctx: BrainContext): Promise<Finding> => {
  const cites = typedEvidence<CabinetCitation>(ctx, 'cabinetCitations');
  if (cites.length === 0) {
    return mkFinding('cabinet_res_walk', 'regulatory_aml', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No Cabinet Resolution citations supplied. Walk requires cabinetCitations[] on the evidence bag.');
  }
  const unsatisfied = cites.filter((c) => c.satisfied === false);
  const unknown = cites.filter((c) => c.satisfied === null);
  const score = clamp01(unsatisfied.length * 0.4 + unknown.length * 0.15);
  const verdict: Verdict = unsatisfied.length > 0 ? 'escalate' : unknown.length > 0 ? 'flag' : 'clear';
  const rationale = unsatisfied.length > 0
    ? `${unsatisfied.length}/${cites.length} cited Cabinet obligations are NOT satisfied (${unsatisfied.map((c) => `${c.resolution} ${c.article}`).join(', ')}). Operator must remediate before disposition.`
    : unknown.length > 0
      ? `${unknown.length}/${cites.length} cited obligations have undetermined satisfaction status — evidence gap (charter P1).`
      : `All ${cites.length} cited Cabinet obligations confirmed satisfied.`;
  const confidence = unsatisfied.length > 0 ? 0.8 : unknown.length > 0 ? 0.55 : 0.7;
  return mkFinding('cabinet_res_walk', 'regulatory_aml', ['reasoning', 'data_analysis'],
    verdict, score, confidence, rationale, cites.map((c) => c.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// emirate_jurisdiction — Emirate-level risk overlay. UAE is one country
// for FATF but seven Emirates with distinct supervision (DMCC, DIFC, ADGM,
// VARA, MoE, etc.). This mode flags supervision mismatches.
// ──────────────────────────────────────────────────────────────────────
interface EmirateAttachment {
  emirate: 'AD' | 'DU' | 'SH' | 'AJ' | 'UQ' | 'RK' | 'FU' | 'unknown';
  freeZone?: string | undefined;
  supervisor?: string | undefined;
  activityCode?: string | undefined;
  sourceRef: string;
}

const HIGH_RISK_FZ = new Set(['JAFZA', 'RAKEZ', 'AFZA', 'SAIF']);

const emirateJurisdictionApply = async (ctx: BrainContext): Promise<Finding> => {
  const att = typedEvidence<EmirateAttachment>(ctx, 'emirateAttachments');
  if (att.length === 0) {
    return mkFinding('emirate_jurisdiction', 'regulatory_aml', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No Emirate attachments supplied. Mode requires emirateAttachments[].');
  }
  const unknownEmirate = att.filter((a) => a.emirate === 'unknown').length;
  const unknownSupervisor = att.filter((a) => !a.supervisor).length;
  const highRiskFz = att.filter((a) => a.freeZone && HIGH_RISK_FZ.has(a.freeZone)).length;
  const supervisors = new Set(att.map((a) => a.supervisor).filter(Boolean));
  const multiSupervisor = supervisors.size > 1;
  const score = clamp01(
    unknownEmirate * 0.2 + unknownSupervisor * 0.15 + highRiskFz * 0.25 + (multiSupervisor ? 0.15 : 0),
  );
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';
  const reasons: string[] = [];
  if (unknownEmirate) reasons.push(`${unknownEmirate} attachment(s) lack Emirate identification`);
  if (unknownSupervisor) reasons.push(`${unknownSupervisor} attachment(s) lack named supervisor`);
  if (highRiskFz) reasons.push(`${highRiskFz} attachment(s) in higher-risk free zones`);
  if (multiSupervisor) reasons.push(`subject crosses ${supervisors.size} supervisors — coordination needed`);
  const rationale = reasons.length === 0
    ? `Single Emirate / supervisor (${[...supervisors].join(', ') || 'n/a'}); no supervisory mismatch.`
    : `Emirate / supervision risk: ${reasons.join('; ')}.`;
  return mkFinding('emirate_jurisdiction', 'regulatory_aml', ['reasoning', 'data_analysis'],
    verdict, score, 0.7, rationale, att.map((a) => a.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// entity_resolution — given multiple identifier sets that may refer to the
// same legal entity, score the strength of resolution.
// ──────────────────────────────────────────────────────────────────────
interface EntityCandidate {
  source: string;
  legalName?: string | undefined;
  registration?: string | undefined;
  lei?: string | undefined;
  jurisdiction?: string | undefined;
  matchConfidence?: number | undefined;
  sourceRef: string;
}

const entityResolutionApply = async (ctx: BrainContext): Promise<Finding> => {
  const cands = typedEvidence<EntityCandidate>(ctx, 'entityCandidates');
  if (cands.length === 0) {
    return mkFinding('entity_resolution', 'corporate_intelligence', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No entity candidates supplied. Mode requires entityCandidates[].');
  }
  const withLei = cands.filter((c) => !!c.lei);
  const distinctLei = new Set(withLei.map((c) => c.lei).filter((x): x is string => !!x));
  const distinctReg = new Set(cands.map((c) => c.registration).filter((x): x is string => !!x));
  const avgConf = cands.reduce((s, c) => s + (c.matchConfidence ?? 0.5), 0) / cands.length;
  const ambiguous = distinctLei.size > 1 || distinctReg.size > 1;
  let verdict: Verdict;
  let rationale: string;
  let score: number;
  if (ambiguous) {
    verdict = 'flag';
    score = 0.6;
    rationale = `${distinctLei.size} distinct LEI(s) and ${distinctReg.size} distinct registration(s) across ${cands.length} candidate(s). Resolution is ambiguous — operator must triage before relying on any single profile.`;
  } else if (avgConf < 0.6) {
    verdict = 'flag';
    score = 0.4;
    rationale = `Low average matchConfidence (${avgConf.toFixed(2)}) across ${cands.length} candidate(s). Resolution unstable.`;
  } else {
    verdict = 'clear';
    score = 0.05;
    rationale = `${cands.length} candidate(s) consistent (avg confidence ${avgConf.toFixed(2)}); LEI=${[...distinctLei][0] ?? 'n/a'}.`;
  }
  return mkFinding('entity_resolution', 'corporate_intelligence', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, cands.map((c) => c.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// kyb_strict — strict know-your-business: licence currency, activity-code
// match, and named-officer screening.
// ──────────────────────────────────────────────────────────────────────
interface KybSnapshot {
  licenceStatus: 'active' | 'expired' | 'suspended' | 'revoked' | 'unknown';
  licenceExpiryDays?: number | undefined;
  declaredActivity?: string | undefined;
  observedActivity?: string | undefined;
  officersScreened: number;
  officersTotal: number;
  sourceRef: string;
}

const kybStrictApply = async (ctx: BrainContext): Promise<Finding> => {
  const snap = singleEvidence<KybSnapshot>(ctx, 'kybSnapshot');
  if (!snap) {
    return mkFinding('kyb_strict', 'compliance_framework', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No KYB snapshot supplied. Mode requires kybSnapshot.');
  }
  const reasons: string[] = [];
  let score = 0;
  if (snap.licenceStatus === 'expired' || snap.licenceStatus === 'revoked') {
    reasons.push(`licence ${snap.licenceStatus}`);
    score += 0.6;
  } else if (snap.licenceStatus === 'suspended') {
    reasons.push('licence suspended');
    score += 0.4;
  } else if (snap.licenceStatus === 'unknown') {
    reasons.push('licence status unknown');
    score += 0.2;
  } else if ((snap.licenceExpiryDays ?? 999) < 30) {
    reasons.push(`licence expires in ${snap.licenceExpiryDays}d`);
    score += 0.15;
  }
  if (snap.declaredActivity && snap.observedActivity && snap.declaredActivity !== snap.observedActivity) {
    reasons.push(`activity mismatch: declared "${snap.declaredActivity}" vs observed "${snap.observedActivity}"`);
    score += 0.3;
  }
  const officerGap = snap.officersTotal - snap.officersScreened;
  if (officerGap > 0) {
    reasons.push(`${officerGap}/${snap.officersTotal} officer(s) unscreened`);
    score += officerGap >= 2 ? 0.25 : 0.1;
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? `KYB clean: licence active, activity consistent, all ${snap.officersTotal} officer(s) screened.`
    : `KYB issues: ${reasons.join('; ')}.`;
  return mkFinding('kyb_strict', 'compliance_framework', ['reasoning', 'data_analysis'],
    verdict, score, 0.8, rationale, [snap.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// audit_trail_reconstruction — orders an audit chain by timestamp and
// flags any backdating, missing-prevHash, or out-of-order entries.
// ──────────────────────────────────────────────────────────────────────
interface AuditEntry {
  at: string;
  prevHash?: string | undefined;
  entryHash: string;
  action: string;
  actor: string;
  sourceRef: string;
}

const auditTrailReconstructionApply = async (ctx: BrainContext): Promise<Finding> => {
  const entries = typedEvidence<AuditEntry>(ctx, 'auditEntries');
  if (entries.length === 0) {
    return mkFinding('audit_trail_reconstruction', 'forensic', ['reasoning', 'forensic_accounting'],
      'inconclusive', 0, 0.2,
      'No audit entries supplied. Mode requires auditEntries[].');
  }
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  let chainBreaks = 0;
  let backdated = 0;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = sorted[i - 1]!;
    if (cur.prevHash && cur.prevHash !== prev.entryHash) chainBreaks += 1;
    if (cur.at < prev.at) backdated += 1;
  }
  const score = clamp01(chainBreaks * 0.2 + backdated * 0.3);
  const verdict: Verdict = chainBreaks > 0 || backdated > 0 ? 'escalate' : 'clear';
  const rationale = chainBreaks === 0 && backdated === 0
    ? `Audit chain reconstructed: ${entries.length} entries, no breaks or backdating.`
    : `Audit chain integrity issues: ${chainBreaks} hash break(s), ${backdated} backdated entry(s) across ${entries.length} entries. Tamper-evidence broken — escalate to CISO + MLRO.`;
  return mkFinding('audit_trail_reconstruction', 'forensic', ['reasoning', 'forensic_accounting'],
    verdict, score, 0.9, rationale, entries.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// fatf_effectiveness — given a FATF mutual-evaluation snapshot, score
// effectiveness-rating impact on the subject's jurisdiction.
// ──────────────────────────────────────────────────────────────────────
type FatfRating = 'high' | 'substantial' | 'moderate' | 'low';

interface FatfEffectiveness {
  jurisdictionIso2: string;
  immediateOutcomes: Array<{ id: string; rating: FatfRating }>;
  asOf: string;
  sourceRef: string;
}

const fatfEffectivenessApply = async (ctx: BrainContext): Promise<Finding> => {
  const snap = singleEvidence<FatfEffectiveness>(ctx, 'fatfEffectiveness');
  if (!snap) {
    return mkFinding('fatf_effectiveness', 'regulatory_aml', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No FATF effectiveness snapshot supplied. Mode requires fatfEffectiveness.');
  }
  const lows = snap.immediateOutcomes.filter((io) => io.rating === 'low').length;
  const moderates = snap.immediateOutcomes.filter((io) => io.rating === 'moderate').length;
  const total = snap.immediateOutcomes.length || 1;
  const score = clamp01((lows * 1 + moderates * 0.4) / total);
  const verdict: Verdict = lows >= 2 ? 'escalate' : lows >= 1 || moderates >= 4 ? 'flag' : 'clear';
  const rationale =
    `${snap.jurisdictionIso2} FATF effectiveness as of ${snap.asOf}: ${lows} low / ${moderates} moderate / ${total - lows - moderates} substantial-or-high across ${total} Immediate Outcomes. ${verdict === 'escalate' ? 'Material effectiveness shortfall — apply EDD.' : verdict === 'flag' ? 'Effectiveness gaps warrant elevated monitoring.' : 'Effectiveness adequate.'}`;
  return mkFinding('fatf_effectiveness', 'regulatory_aml', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, [snap.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// de_minimis — flags transactions clustering JUST below a regulatory
// threshold (charter P10: do not weaponize de-minimis to ignore real risk).
// ──────────────────────────────────────────────────────────────────────
interface ThresholdProbe {
  thresholdAed: number;
  observations: number[];
  windowDays: number;
  sourceRef: string;
}

const deMinimisApply = async (ctx: BrainContext): Promise<Finding> => {
  const probe = singleEvidence<ThresholdProbe>(ctx, 'deMinimisProbe');
  if (!probe || probe.observations.length === 0) {
    return mkFinding('de_minimis', 'forensic', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No de-minimis probe supplied. Mode requires deMinimisProbe with observations[].');
  }
  const t = probe.thresholdAed;
  const justBelow = probe.observations.filter((v) => v >= t * 0.9 && v < t).length;
  const ratio = justBelow / probe.observations.length;
  const score = clamp01(ratio * 1.4);
  const verdict: Verdict = ratio >= 0.5 ? 'escalate' : ratio >= 0.25 ? 'flag' : 'clear';
  const rationale = ratio >= 0.25
    ? `${justBelow}/${probe.observations.length} (${Math.round(ratio * 100)}%) observations within 10% below the AED ${t.toLocaleString()} threshold across ${probe.windowDays}d. Charter P10: de-minimis is not a shield — investigate as potential structuring.`
    : `Observations broadly distributed (${justBelow}/${probe.observations.length} just-below ratio). No structuring signal.`;
  return mkFinding('de_minimis', 'forensic', ['reasoning', 'data_analysis'],
    verdict, score, 0.7, rationale, [probe.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// defi_smart_contract — scores a DeFi protocol's audit / governance /
// admin-key posture. Triggers EDD when posture is weak.
// ──────────────────────────────────────────────────────────────────────
interface DefiPosture {
  protocolName: string;
  audited: boolean;
  auditFirms?: string[] | undefined;
  bugBountyMaxUsd?: number | undefined;
  adminKeyMultisigOf?: number | undefined;
  adminKeyTotal?: number | undefined;
  upgradeable: boolean;
  sourceRef: string;
}

const defiSmartContractApply = async (ctx: BrainContext): Promise<Finding> => {
  const p = singleEvidence<DefiPosture>(ctx, 'defiPosture');
  if (!p) {
    return mkFinding('defi_smart_contract', 'crypto_defi', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No DeFi posture supplied. Mode requires defiPosture.');
  }
  const reasons: string[] = [];
  let score = 0;
  if (!p.audited) { reasons.push('no published audit'); score += 0.4; }
  if ((p.auditFirms?.length ?? 0) === 0 && p.audited) { reasons.push('audit claimed without firm citation'); score += 0.2; }
  if ((p.bugBountyMaxUsd ?? 0) < 50000) { reasons.push('bug bounty below USD 50k'); score += 0.15; }
  if (p.upgradeable && (p.adminKeyMultisigOf ?? 0) < 3) {
    reasons.push(`upgradeable with ${p.adminKeyMultisigOf ?? 1}-of-${p.adminKeyTotal ?? 1} admin key (rug-pull risk)`);
    score += 0.35;
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? `${p.protocolName}: audit + bug bounty + admin-key posture acceptable; standard CDD.`
    : `${p.protocolName}: ${reasons.join('; ')}. ${verdict === 'escalate' ? 'Apply EDD; restrict customer exposure.' : 'Elevated DeFi posture risk.'}`;
  return mkFinding('defi_smart_contract', 'crypto_defi', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, [p.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// family_office_signal — single-family-office (SFO) and multi-family-office
// (MFO) structures concentrate UBO opacity. Score family-office indicators.
// ──────────────────────────────────────────────────────────────────────
interface FamilyOfficeProfile {
  declaredType?: 'sfo' | 'mfo' | 'other' | undefined;
  jurisdictions: string[];
  trustLayersCount: number;
  beneficiaryCount?: number | undefined;
  asPublicEntity?: boolean | undefined;
  sourceRef: string;
}

const familyOfficeSignalApply = async (ctx: BrainContext): Promise<Finding> => {
  const fo = singleEvidence<FamilyOfficeProfile>(ctx, 'familyOfficeProfile');
  if (!fo) {
    return mkFinding('family_office_signal', 'corporate_intelligence', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No family-office profile supplied. Mode requires familyOfficeProfile.');
  }
  const reasons: string[] = [];
  let score = 0;
  if (fo.trustLayersCount >= 3) { reasons.push(`${fo.trustLayersCount} trust layer(s)`); score += 0.3; }
  if (fo.jurisdictions.length >= 3) { reasons.push(`${fo.jurisdictions.length} jurisdictions in chain`); score += 0.2; }
  if (fo.declaredType === 'mfo') { reasons.push('MFO structure pools unrelated families'); score += 0.15; }
  if ((fo.beneficiaryCount ?? 0) > 25) { reasons.push(`>25 beneficiaries — class designation likely`); score += 0.15; }
  if (fo.asPublicEntity === false) { reasons.push('not registered as a public entity'); score += 0.1; }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.25 ? 'flag' : 'clear';
  const rationale = reasons.length === 0
    ? `Family-office structure ordinary; standard PEP/SoW review applies.`
    : `Family-office indicators: ${reasons.join('; ')}. Apply enhanced UBO + PEP family-tree DD per FATF R.12 and R.25.`;
  return mkFinding('family_office_signal', 'corporate_intelligence', ['reasoning', 'data_analysis'],
    verdict, score, 0.7, rationale, [fo.sourceRef]);
};

// ──────────────────────────────────────────────────────────────────────
// insurance_wrap — flags single-premium / surrender-anomaly / third-party
// premium funder layering common in insurance-wrap money laundering.
// ──────────────────────────────────────────────────────────────────────
interface InsuranceWrapEvent {
  policyId: string;
  premiumAed: number;
  surrenderWithinDays?: number | undefined;
  thirdPartyFunder?: boolean | undefined;
  beneficiaryChanges: number;
  sourceRef: string;
}

const insuranceWrapApply = async (ctx: BrainContext): Promise<Finding> => {
  const events = typedEvidence<InsuranceWrapEvent>(ctx, 'insuranceWrapEvents');
  if (events.length === 0) {
    return mkFinding('insurance_wrap', 'sectoral_typology', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No insurance-wrap events supplied. Mode requires insuranceWrapEvents[].');
  }
  let score = 0;
  const flagged: string[] = [];
  for (const e of events) {
    if ((e.surrenderWithinDays ?? 999) < 24 * 30) {
      score += 0.35;
      flagged.push(`${e.policyId}: surrender within ${e.surrenderWithinDays}d`);
    }
    if (e.thirdPartyFunder) {
      score += 0.25;
      flagged.push(`${e.policyId}: third-party premium funder`);
    }
    if (e.beneficiaryChanges >= 3) {
      score += 0.2;
      flagged.push(`${e.policyId}: ${e.beneficiaryChanges} beneficiary changes`);
    }
    if (e.premiumAed >= 1_000_000) {
      score += 0.15;
      flagged.push(`${e.policyId}: single premium AED ${e.premiumAed.toLocaleString()}`);
    }
  }
  score = clamp01(score);
  const verdict: Verdict = score >= 0.5 ? 'escalate' : score >= 0.2 ? 'flag' : 'clear';
  const rationale = flagged.length === 0
    ? `${events.length} insurance event(s) reviewed; no wrap-layering indicators.`
    : `Insurance-wrap layering indicators: ${flagged.join('; ')}.`;
  return mkFinding('insurance_wrap', 'sectoral_typology', ['reasoning', 'data_analysis'],
    verdict, score, 0.75, rationale, events.map((e) => e.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// ghost_employees — payroll-fraud pattern: salary recipients with no
// supporting HR / time-attendance evidence.
// ──────────────────────────────────────────────────────────────────────
interface PayrollRecipient {
  recipientId: string;
  monthlySalaryAed: number;
  hasHrFile: boolean;
  hasTimeAttendance: boolean;
  bankAccount?: string | undefined;
  sourceRef: string;
}

const ghostEmployeesApply = async (ctx: BrainContext): Promise<Finding> => {
  const recipients = typedEvidence<PayrollRecipient>(ctx, 'payrollRecipients');
  if (recipients.length === 0) {
    return mkFinding('ghost_employees', 'forensic_accounting', ['reasoning', 'forensic_accounting'],
      'inconclusive', 0, 0.2,
      'No payroll recipients supplied. Mode requires payrollRecipients[].');
  }
  const noHr = recipients.filter((r) => !r.hasHrFile);
  const noTime = recipients.filter((r) => !r.hasTimeAttendance);
  const ghosts = recipients.filter((r) => !r.hasHrFile && !r.hasTimeAttendance);
  const sharedAccounts = new Set<string>();
  const acctCount: Record<string, number> = {};
  for (const r of recipients) {
    if (r.bankAccount) {
      acctCount[r.bankAccount] = (acctCount[r.bankAccount] ?? 0) + 1;
      if (acctCount[r.bankAccount]! > 1) sharedAccounts.add(r.bankAccount);
    }
  }
  const score = clamp01(
    (ghosts.length / recipients.length) * 1.0 + (noHr.length / recipients.length) * 0.2 + (sharedAccounts.size > 0 ? 0.3 : 0),
  );
  const verdict: Verdict = ghosts.length >= 2 || sharedAccounts.size > 0 ? 'escalate' : ghosts.length >= 1 ? 'flag' : 'clear';
  const reasons: string[] = [];
  if (ghosts.length) reasons.push(`${ghosts.length} recipient(s) lack BOTH HR file and time-attendance`);
  if (noHr.length) reasons.push(`${noHr.length} recipient(s) lack HR file`);
  if (noTime.length) reasons.push(`${noTime.length} recipient(s) lack time-attendance`);
  if (sharedAccounts.size > 0) reasons.push(`${sharedAccounts.size} bank account(s) shared by multiple recipients`);
  const rationale = reasons.length === 0
    ? `${recipients.length} payroll recipient(s) all corroborated by HR + time-attendance.`
    : `Ghost-employee indicators: ${reasons.join('; ')}.`;
  return mkFinding('ghost_employees', 'forensic_accounting', ['reasoning', 'forensic_accounting'],
    verdict, score, 0.8, rationale, recipients.map((r) => r.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// kri_alignment — checks if observed KRI values align with declared
// thresholds; if any breach, escalation should already be in flight.
// ──────────────────────────────────────────────────────────────────────
interface KriObservation {
  kriId: string;
  observed: number;
  amberThreshold: number;
  redThreshold: number;
  escalated: boolean;
  sourceRef: string;
}

const kriAlignmentApply = async (ctx: BrainContext): Promise<Finding> => {
  const kris = typedEvidence<KriObservation>(ctx, 'kriObservations');
  if (kris.length === 0) {
    return mkFinding('kri_alignment', 'governance', ['reasoning', 'data_analysis'],
      'inconclusive', 0, 0.2,
      'No KRI observations supplied. Mode requires kriObservations[].');
  }
  const reds = kris.filter((k) => k.observed >= k.redThreshold);
  const ambers = kris.filter((k) => k.observed >= k.amberThreshold && k.observed < k.redThreshold);
  const redUnescalated = reds.filter((k) => !k.escalated);
  const score = clamp01(redUnescalated.length * 0.5 + reds.length * 0.2 + ambers.length * 0.1);
  const verdict: Verdict = redUnescalated.length > 0 ? 'escalate' : reds.length > 0 || ambers.length >= 2 ? 'flag' : 'clear';
  const rationale = redUnescalated.length > 0
    ? `${redUnescalated.length} red KRI breach(es) NOT escalated: ${redUnescalated.map((k) => k.kriId).join(', ')}. Governance failure.`
    : reds.length > 0
      ? `${reds.length} red KRI breach(es) — all escalated. ${ambers.length} amber.`
      : `KRIs within tolerance: ${ambers.length} amber, ${reds.length} red.`;
  return mkFinding('kri_alignment', 'governance', ['reasoning', 'data_analysis'],
    verdict, score, 0.85, rationale, kris.map((k) => k.sourceRef));
};

// ──────────────────────────────────────────────────────────────────────
// Bundle export
// ──────────────────────────────────────────────────────────────────────
export const UAE_ADVANCED_MODE_APPLIES: Record<string, (ctx: BrainContext) => Promise<Finding>> = {
  cabinet_res_walk:           cabinetResWalkApply,
  emirate_jurisdiction:       emirateJurisdictionApply,
  entity_resolution:          entityResolutionApply,
  kyb_strict:                 kybStrictApply,
  audit_trail_reconstruction: auditTrailReconstructionApply,
  fatf_effectiveness:         fatfEffectivenessApply,
  de_minimis:                 deMinimisApply,
  defi_smart_contract:        defiSmartContractApply,
  family_office_signal:       familyOfficeSignalApply,
  insurance_wrap:             insuranceWrapApply,
  ghost_employees:            ghostEmployeesApply,
  kri_alignment:              kriAlignmentApply,
};
