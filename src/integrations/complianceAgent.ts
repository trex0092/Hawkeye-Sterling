// Hawkeye Sterling — Compliance Review Agent.
//
// Final egress gate for AI-generated artefacts. Given a finalised CaseReport
// (plus optional draft narrative and customer-facing text), it audits the
// artefact against the frozen compliance charter (P1–P10), proposes candidate
// dispositions, and returns a structured verdict. It NEVER sets a final
// disposition itself (charter P3 reserves that to the MLRO).
//
// Pipeline:
//   1. Deterministic prechecks (no API spend, fail closed):
//        scope · mandatory sections · match-confidence · tipping-off · redlines
//   2. If any critical precheck fails → return 'blocked' immediately.
//   3. Otherwise, call Claude with the weaponized charter + the artefact and
//      parse the semantic verdict (APPROVED / RETURNED_FOR_REVISION / BLOCKED).
//   4. Aggregate: final verdict is the strictest of (prechecks, semantic).

import { weaponizedSystemPrompt } from '../brain/weaponized.js';
import { SYSTEM_PROMPT, ABSOLUTE_PROHIBITIONS, OUTPUT_SECTIONS, type ProhibitionId, type OutputSection } from '../policy/systemPrompt.js';
import { evaluateRedlines, type RedlineAction } from '../brain/redlines.js';
import { tippingOffScan, type TippingOffMatch } from '../brain/tipping-off-guard.js';
import type { DispositionCode } from '../brain/dispositions.js';
import type { CaseReport } from '../reports/caseReport.js';
import { fetchAnthropicStreamText } from './httpRetry.js';

export type Verdict = 'approved' | 'returned_for_revision' | 'blocked' | 'incomplete';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceAgentConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  /** Hard ceiling per request. Default 60s. */
  budgetMs?: number;
  /** Enable adaptive thinking. Default true. */
  enableThinking?: boolean;
  /** Cache the large system prompt for repeated calls. Default true. */
  cacheSystemPrompt?: boolean;
}

export interface ComplianceReviewRequest {
  caseReport: CaseReport;
  draftNarrative?: string;
  customerFacingText?: string;
  supportingDocs?: Array<{ id: string; kind: string; excerpt: string }>;
  audience?: 'regulator' | 'mlro' | 'board';
  depth?: 'fast' | 'deep';
}

export interface ProhibitionCheck {
  id: ProhibitionId;
  label: string;
  status: 'pass' | 'concern' | 'violation' | 'not_applicable';
  evidence: string[];
}

export interface MandatorySectionCheck {
  section: OutputSection;
  present: boolean;
  source: 'report' | 'narrative' | 'missing';
}

export interface ScopeAudit {
  sourcesDeclared: boolean;
  listsChecked: string[];
  listVersionDatesPresent: boolean;
  concerns: string[];
}

export interface MatchConfidenceAudit {
  concerns: string[];
  violations: string[];
}

export interface TippingOffAudit {
  scanned: boolean;
  allowed: boolean;
  matches: TippingOffMatch[];
  recommendation: string;
}

export interface RedlinesAudit {
  fired: string[];
  action: RedlineAction | null;
  summary: string;
}

export interface AgentTrailStep {
  stepNo: number;
  actor: 'precheck' | 'advisor';
  at: string; // ISO 8601
  summary: string;
  body: string;
}

export interface ComplianceReviewResult {
  ok: boolean;
  verdict: Verdict;
  partial: boolean;
  budgetMs: number;
  elapsedMs: number;
  prohibitionChecks: ProhibitionCheck[];
  mandatorySections: MandatorySectionCheck[];
  scope: ScopeAudit;
  matchConfidence: MatchConfidenceAudit;
  tippingOff: TippingOffAudit;
  redlines: RedlinesAudit;
  blockingIssues: string[];
  concerns: string[];
  remediations: string[];
  candidateDispositions: DispositionCode[];
  semanticReview?: string | undefined;
  charterIntegrityHash: string;
  agentTrail: AgentTrailStep[];
  guidance?: string | undefined;
  error?: string | undefined;
}

export const COMPLIANCE_TASK_ROLE =
  'You are the Deep-Reasoning COMPLIANCE REVIEW agent. A CaseReport and draft ' +
  'artefacts have passed through the executor/advisor pipeline and are now at ' +
  'the egress gate. Audit the artefact against the compliance charter (P1–P10), ' +
  'the mandatory 7-section structure, the match-confidence taxonomy, the ' +
  'tipping-off prohibition, and the redline registry. For every prohibition ' +
  'return pass / concern / violation with explicit evidence drawn from the ' +
  'artefact. List every blocking issue, every concern, and every remediation ' +
  'required before egress. Propose candidate disposition codes only — never ' +
  'set a final disposition (P3 reserves that to the MLRO). Never fill gaps ' +
  'with inference (P10); flag them instead. Cite the catalogue by id for ' +
  'every assertion: mode id(s), doctrine id(s), red-flag id(s), typology id(s), ' +
  'sanction-regime id(s), CAHRA status, FATF recommendation id(s), threshold ' +
  'id(s), playbook id(s), redline id(s), disposition code(s), and skill id(s) ' +
  'from the skills catalogue (e.g. `tipping-off-management`, `match-validation`, ' +
  '`ubo-tracing`). Echo the charterHash, catalogueHash, and compositeHash in ' +
  'your AUDIT_LINE. Any skill / mode / id not present in the cognitive catalogue ' +
  'is a fabrication and MUST block egress. End your reply with a single verdict ' +
  'token on its own line: APPROVED, RETURNED_FOR_REVISION, or BLOCKED.';

export const BUDGET_GUIDANCE =
  'Compliance review exceeded the per-request budget. Deterministic prechecks ' +
  'in the reply reflect the artefact; the semantic audit could not finish. ' +
  'Re-run with a leaner artefact or resubmit with draftNarrative omitted.';

const DEFAULT_MODEL = 'claude-opus-4-7';

// ────────────────────────────────────────────────────────────────────────────
// Prompt composition
// ────────────────────────────────────────────────────────────────────────────

export function buildComplianceSystemPrompt(req: ComplianceReviewRequest): string {
  return weaponizedSystemPrompt({
    taskRole: COMPLIANCE_TASK_ROLE,
    audience: req.audience ?? 'regulator',
    includeCatalogueSummary: true,
  });
}

export function buildComplianceUserMessage(req: ComplianceReviewRequest): string {
  const payload: Record<string, unknown> = {
    caseReport: req.caseReport,
  };
  if (req.draftNarrative) payload.draftNarrative = req.draftNarrative;
  if (req.customerFacingText) payload.customerFacingText = req.customerFacingText;
  if (req.supportingDocs && req.supportingDocs.length > 0) {
    payload.supportingDocs = req.supportingDocs;
  }
  return [
    'ARTEFACT UNDER REVIEW:',
    JSON.stringify(payload, null, 2),
    '',
    'Audit this artefact against P1–P10 and the mandatory output structure. ' +
      'Return per-prohibition verdicts, blocking issues, concerns, remediations, ' +
      'and candidate disposition codes. End with a single verdict token on its ' +
      'own line: APPROVED, RETURNED_FOR_REVISION, or BLOCKED.',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic prechecks
// ────────────────────────────────────────────────────────────────────────────

export function precheckScope(report: CaseReport): ScopeAudit {
  const concerns: string[] = [];
  const sourcesDeclared = Array.isArray(report.sources) && report.sources.length > 0;
  if (!sourcesDeclared) concerns.push('no_sources_declared');

  const keywords = report.keywords ?? [];
  const listsChecked = Array.from(new Set(keywords.map((k) => k.type)));
  if (report.keyFindings.totalMatches === 'NO MATCHES FOUND' && listsChecked.length === 0) {
    concerns.push('no_lists_checked_declared_but_clean_result');
  }

  const listVersionDatesPresent = report.sources.some((s) => /^\d{4}-\d{2}-\d{2}/.test(s.date));
  if (sourcesDeclared && !listVersionDatesPresent) {
    concerns.push('list_version_dates_missing');
  }

  return { sourcesDeclared, listsChecked, listVersionDatesPresent, concerns };
}

const SECTION_MARKERS: Record<OutputSection, RegExp[]> = {
  SUBJECT_IDENTIFIERS: [/subject\s*identifiers?/i, /\bidentity\b/i],
  SCOPE_DECLARATION: [/scope\s*declaration/i, /lists?\s*checked/i],
  FINDINGS: [/\bfindings?\b/i],
  GAPS: [/\bgaps?\b/i, /missing\s*identifiers?/i],
  RED_FLAGS: [/\bred\s*flags?\b/i],
  RECOMMENDED_NEXT_STEPS: [/recommended\s*next\s*steps?/i, /\bnext\s*steps?\b/i],
  AUDIT_LINE: [/\baudit\s*line\b/i, /decision\s*support,?\s*not\s*a\s*decision/i],
};

export function precheckMandatorySections(
  report: CaseReport,
  narrative?: string,
): MandatorySectionCheck[] {
  const out: MandatorySectionCheck[] = [];
  for (const section of OUTPUT_SECTIONS) {
    const inReport = sectionPresentInReport(section, report);
    if (inReport) {
      out.push({ section, present: true, source: 'report' });
      continue;
    }
    const markers = SECTION_MARKERS[section];
    const inNarrative = !!narrative && markers.some((rx) => rx.test(narrative));
    out.push({
      section,
      present: inNarrative,
      source: inNarrative ? 'narrative' : 'missing',
    });
  }
  return out;
}

function sectionPresentInReport(section: OutputSection, report: CaseReport): boolean {
  switch (section) {
    case 'SUBJECT_IDENTIFIERS':
      return !!report.identity?.name;
    case 'SCOPE_DECLARATION':
      return Array.isArray(report.sources) && report.sources.length > 0;
    case 'FINDINGS':
      return typeof report.keyFindings?.totalMatches !== 'undefined';
    case 'GAPS':
      return false; // GAPS must appear in narrative; report has no structured gap slot.
    case 'RED_FLAGS':
      return false; // red flags live in narrative / reasoning chain, not as a typed slot.
    case 'RECOMMENDED_NEXT_STEPS':
      return false;
    case 'AUDIT_LINE':
      return Array.isArray(report.audit) && report.audit.length > 0;
  }
}

const COMMON_NAMES = new Set([
  'mohammed', 'muhammad', 'mohamed', 'mohamad', 'mohd',
  'ahmed', 'ahmad', 'ali', 'hassan', 'hussain', 'khan',
  'ivanov', 'smith', 'li', 'wang', 'zhang', 'chen',
  'garcia', 'rodriguez', 'patel', 'singh', 'kumar',
]);

export function precheckMatchConfidence(
  report: CaseReport,
  narrative?: string,
): MatchConfidenceAudit {
  const concerns: string[] = [];
  const violations: string[] = [];
  const text = [narrative ?? '', JSON.stringify(report)].join('\n');

  // Match-confidence labels are case-sensitive uppercase tokens in the
  // charter taxonomy. Matching on uppercase avoids false hits on English
  // prose like "strong identifiers" or "possible that…".
  const CONF_ABOVE_WEAK = /\b(EXACT|STRONG|POSSIBLE)\b/;

  // Name-only match asserted above WEAK.
  if (/\bname[-\s]only\b[^\n]*/i.test(text)) {
    const tail = text.match(/\bname[-\s]only\b[^\n]*/i)?.[0] ?? '';
    if (CONF_ABOVE_WEAK.test(tail)) {
      violations.push('name_only_match_above_WEAK');
    }
  }

  // Common name matched above POSSIBLE without strong identifiers.
  const subject = (report.identity?.name ?? '').toLowerCase();
  const nameTokens = subject.split(/\s+/).filter(Boolean);
  const commonHit = nameTokens.some((t) => COMMON_NAMES.has(t));
  if (commonHit && /\b(EXACT|STRONG)\b/.test(text)) {
    const hasStrongId = !!(report.identity?.dateOfBirth || (report.identity?.identificationNumbers?.length ?? 0) > 0);
    if (!hasStrongId) {
      violations.push('common_name_above_POSSIBLE_without_strong_identifiers');
    }
  }

  // Transliteration above POSSIBLE without native-script corroboration.
  if (/\btransliteration\b/i.test(text) && /\b(EXACT|STRONG)\b/.test(text)) {
    const hasNative = /[؀-ۿЀ-ӿ一-鿿]/.test(text);
    if (!hasNative) {
      violations.push('transliteration_above_POSSIBLE_without_native_script');
    }
  }

  // Any match confidence declared at all on a non-NO_MATCH result?
  if (
    report.keyFindings.totalMatches !== 'NO MATCHES FOUND' &&
    !/\b(EXACT|STRONG|POSSIBLE|WEAK|NO_MATCH|NO\s*MATCH)\b/.test(text)
  ) {
    concerns.push('no_match_confidence_classification_declared');
  }

  return { concerns, violations };
}

export function precheckTippingOff(customerFacingText?: string): TippingOffAudit {
  if (!customerFacingText) {
    return {
      scanned: false,
      allowed: true,
      matches: [],
      recommendation: 'No customer-facing text supplied; tipping-off guard not engaged.',
    };
  }
  const verdict = tippingOffScan(customerFacingText);
  return {
    scanned: true,
    allowed: verdict.allowed,
    matches: verdict.matches,
    recommendation: verdict.recommendation,
  };
}

export function precheckRedlines(
  report: CaseReport,
  narrative?: string,
  tippingOff?: TippingOffAudit,
): RedlinesAudit {
  const firedIds: string[] = [];

  // rl_missing_charter_hash — the outbound envelope must carry the charter hash.
  // CaseReport has no dedicated field, so we look in the narrative / audit trail.
  const hashCarrier = [narrative ?? '', JSON.stringify(report.audit ?? [])].join('\n');
  if (!/charterIntegrityHash|charter\s*hash|complianceCharterVersionHash/i.test(hashCarrier)) {
    firedIds.push('rl_missing_charter_hash');
  }

  // rl_tipping_off_draft — fires when the tipping-off guard caught a high hit.
  if (tippingOff?.scanned && tippingOff.matches.some((m) => m.severity === 'high')) {
    firedIds.push('rl_tipping_off_draft');
  }

  // rl_training_data_as_sanctions_source — sanctions claimed but no primary source.
  const mentionsSanctions = /\bsanction(ed|s)?\b/i.test(narrative ?? '');
  const hasPrimarySource = (report.sources ?? []).length > 0;
  if (mentionsSanctions && !hasPrimarySource) {
    firedIds.push('rl_training_data_as_sanctions_source');
  }

  const result = evaluateRedlines(firedIds);
  return { fired: result.fired.map((r) => r.id), action: result.action, summary: result.summary };
}

// ────────────────────────────────────────────────────────────────────────────
// Prohibition roll-up (deterministic view; the advisor adds the semantic layer)
// ────────────────────────────────────────────────────────────────────────────

function buildProhibitionChecks(
  scope: ScopeAudit,
  sections: MandatorySectionCheck[],
  match: MatchConfidenceAudit,
  tippingOff: TippingOffAudit,
  redlines: RedlinesAudit,
): ProhibitionCheck[] {
  const byId = new Map<ProhibitionId, ProhibitionCheck>();
  for (const p of ABSOLUTE_PROHIBITIONS) {
    byId.set(p.id, { id: p.id, label: p.label, status: 'pass', evidence: [] });
  }

  const mark = (id: ProhibitionId, status: ProhibitionCheck['status'], evidence: string) => {
    const cur = byId.get(id)!;
    // Upgrade severity: violation > concern > pass.
    const rank: Record<ProhibitionCheck['status'], number> = {
      not_applicable: 0, pass: 1, concern: 2, violation: 3,
    };
    if (rank[status] > rank[cur.status]) cur.status = status;
    cur.evidence.push(evidence);
  };

  if (redlines.fired.includes('rl_training_data_as_sanctions_source')) {
    mark('P1', 'violation', 'sanctions asserted without primary source');
    mark('P8', 'violation', 'training-data reliance on sanctions status');
  }
  if (tippingOff.scanned && !tippingOff.allowed) {
    const anyHigh = tippingOff.matches.some((m) => m.severity === 'high');
    mark('P4', anyHigh ? 'violation' : 'concern', tippingOff.recommendation);
  }
  for (const v of match.violations) mark('P6', 'violation', v);
  for (const c of match.concerns) mark('P6', 'concern', c);

  const gapsMissing = sections.find((s) => s.section === 'GAPS' && !s.present);
  if (gapsMissing) mark('P10', 'violation', 'GAPS section absent from artefact');

  const nextStepsMissing = sections.find((s) => s.section === 'RECOMMENDED_NEXT_STEPS' && !s.present);
  if (nextStepsMissing) mark('P3', 'concern', 'RECOMMENDED_NEXT_STEPS section absent');

  if (!scope.sourcesDeclared || !scope.listVersionDatesPresent) {
    mark('P7', 'violation', scope.concerns.join('; ') || 'scope declaration incomplete');
  }

  if (redlines.fired.includes('rl_missing_charter_hash')) {
    mark('P7', 'concern', 'charter integrity hash missing from envelope');
  }

  return Array.from(byId.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregate verdict
// ────────────────────────────────────────────────────────────────────────────

export function aggregateVerdict(
  checks: ProhibitionCheck[],
  redlines: RedlinesAudit,
  semantic: Verdict | null,
): Verdict {
  const hasViolation = checks.some((c) => c.status === 'violation');
  const hasConcern = checks.some((c) => c.status === 'concern');
  const redlineFired = redlines.fired.length > 0;

  if (hasViolation || redlineFired) return 'blocked';
  const precheckVerdict: Verdict = hasConcern ? 'returned_for_revision' : 'approved';

  if (!semantic) return precheckVerdict;
  const priority: Record<Verdict, number> = {
    approved: 1, incomplete: 2, returned_for_revision: 3, blocked: 4,
  };
  return priority[semantic] >= priority[precheckVerdict] ? semantic : precheckVerdict;
}

function candidateDispositionsFor(
  verdict: Verdict,
  redlines: RedlinesAudit,
  tippingOff: TippingOffAudit,
): DispositionCode[] {
  const out = new Set<DispositionCode>();
  if (verdict === 'blocked') {
    if (redlines.action === 'freeze') out.add('D05_frozen_ffr');
    if (redlines.action === 'do_not_onboard') out.add('D09_do_not_onboard');
    if (redlines.action === 'exit_relationship') out.add('D08_exit_relationship');
    if (tippingOff.scanned && !tippingOff.allowed) out.add('D06_partial_match_pnmr');
  }
  if (verdict === 'returned_for_revision') {
    out.add('D03_edd_required');
    out.add('D04_heightened_monitoring');
  }
  return Array.from(out);
}

// ────────────────────────────────────────────────────────────────────────────
// Chat primitive + budget
// ────────────────────────────────────────────────────────────────────────────

export type ChatCall = (input: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  apiKey: string;
  signal?: AbortSignal;
  thinking?: boolean;
  effort?: string;
  cacheSystem?: boolean;
}) => Promise<{ ok: boolean; text?: string; error?: string }>;

const defaultChat: ChatCall = async ({ model, system, user, maxTokens, apiKey, signal, thinking, effort, cacheSystem }) => {
  if (!user.trim()) return { ok: false, error: 'message content must be non-empty' };
  const systemContent = cacheSystem
    ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' } }]
    : system;
  const thinkingBlock = thinking ? { thinking: { type: 'adaptive' } } : {};
  const outputConfigBlock = effort ? { output_config: { effort } } : {};
  const result = await fetchAnthropicStreamText(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        system: systemContent,
        ...thinkingBlock,
        ...outputConfigBlock,
        messages: [{ role: 'user', content: user }],
        metadata: {
          product: 'hawkeye-sterling',
          pipeline: 'compliance-review',
        },
      }),
    },
    {
      ...(signal ? { signal } : {}),
      perAttemptMs: Math.min(120_000, maxTokens * 15 + 10_000),
      idleReadMs: 30_000,
      maxAttempts: 2,
    },
  );
  if (signal?.aborted) return { ok: false, error: 'aborted' };
  if (!result.ok) {
    const prefix = result.partial ? 'partial_response:' : '';
    return {
      ok: false,
      error: `${prefix}${result.error ?? 'unknown error'} (${result.attempts} attempts, ${result.elapsedMs}ms)`,
    };
  }
  return { ok: true, text: result.text };
};

function withBudget<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<{ result?: T; timedOut: boolean; thrownError?: string }> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, ms);
    fn(controller.signal).then(
      (result) => { clearTimeout(timer); resolve({ result, timedOut: false }); },
      (err: unknown) => {
        clearTimeout(timer);
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort) {
          resolve({ timedOut: true });
        } else {
          const thrownError = err instanceof Error ? err.message : String(err);
          resolve({ timedOut: false, thrownError });
        }
      },
    );
  });
}

function parseSemanticVerdict(body: string): Verdict {
  if (/\bBLOCKED\b/i.test(body)) return 'blocked';
  if (/\bRETURNED_FOR_REVISION\b/i.test(body)) return 'returned_for_revision';
  if (/\bAPPROVED\b/i.test(body)) return 'approved';
  return 'incomplete';
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

export async function invokeComplianceAgent(
  req: ComplianceReviewRequest,
  cfg: ComplianceAgentConfig,
  chat: ChatCall = defaultChat,
): Promise<ComplianceReviewResult> {
  const t0 = Date.now();
  const hardCeiling = Math.min(cfg.budgetMs ?? 60_000, 60_000);
  const trail: AgentTrailStep[] = [];
  const useThinking = cfg.enableThinking    !== false;
  const useCache    = cfg.cacheSystemPrompt !== false;

  // ── Stage 1: deterministic prechecks.
  const precheckStart = new Date().toISOString();
  const scope = precheckScope(req.caseReport);
  const sections = precheckMandatorySections(req.caseReport, req.draftNarrative);
  const match = precheckMatchConfidence(req.caseReport, req.draftNarrative);
  const tippingOff = precheckTippingOff(req.customerFacingText);
  const redlines = precheckRedlines(req.caseReport, req.draftNarrative, tippingOff);
  const prohibitionChecks = buildProhibitionChecks(scope, sections, match, tippingOff, redlines);

  trail.push({
    stepNo: 1,
    actor: 'precheck',
    at: precheckStart,
    summary: 'Deterministic prechecks complete.',
    body: JSON.stringify({
      scope, sections, match, tippingOff, redlines,
    }),
  });

  const precheckVerdict = aggregateVerdict(prohibitionChecks, redlines, null);
  const critical = precheckVerdict === 'blocked';

  // Collect deterministic issues early so we can return them even on short-circuit.
  const blockingIssues: string[] = [];
  const concerns: string[] = [];
  for (const c of prohibitionChecks) {
    if (c.status === 'violation') blockingIssues.push(`${c.id}: ${c.evidence.join('; ')}`);
    else if (c.status === 'concern') concerns.push(`${c.id}: ${c.evidence.join('; ')}`);
  }
  if (redlines.fired.length > 0) blockingIssues.push(`redlines: ${redlines.summary}`);

  const remediations = buildRemediations(prohibitionChecks, redlines, tippingOff, scope, sections);

  const charterIntegrityHash = charterHash();

  // ── Stage 2: semantic review (skipped on critical precheck failure OR fast depth).
  if (critical || req.depth === 'fast') {
    const candidates = candidateDispositionsFor(precheckVerdict, redlines, tippingOff);
    return {
      ok: !critical,
      verdict: precheckVerdict,
      partial: false,
      budgetMs: hardCeiling,
      elapsedMs: Date.now() - t0,
      prohibitionChecks,
      mandatorySections: sections,
      scope,
      matchConfidence: match,
      tippingOff,
      redlines,
      blockingIssues,
      concerns,
      remediations,
      candidateDispositions: candidates,
      semanticReview: undefined,
      charterIntegrityHash,
      agentTrail: trail,
      guidance: undefined,
      error: undefined,
    };
  }

  const system = buildComplianceSystemPrompt(req);
  const user = buildComplianceUserMessage(req);
  const advStart = new Date().toISOString();
  const remaining = Math.max(1, hardCeiling - (Date.now() - t0));
  const { result: advRes, timedOut, thrownError: advThrown } = await withBudget(remaining, (signal) =>
    chat({
      model: cfg.model ?? DEFAULT_MODEL,
      system,
      user,
      maxTokens: cfg.maxTokens ?? 16_000,
      apiKey: cfg.apiKey,
      signal,
      thinking: useThinking,
      effort: 'xhigh',
      cacheSystem: useCache,
    }),
  );

  if (timedOut || !advRes?.ok) {
    trail.push({
      stepNo: 2,
      actor: 'advisor',
      at: advStart,
      summary: timedOut ? 'Advisor budget exceeded — semantic review incomplete.' : 'Advisor call failed.',
      body: advRes?.text ?? '',
    });
    const candidates = candidateDispositionsFor('incomplete', redlines, tippingOff);
    return {
      ok: false,
      verdict: 'incomplete',
      partial: true,
      budgetMs: hardCeiling,
      elapsedMs: Date.now() - t0,
      prohibitionChecks,
      mandatorySections: sections,
      scope,
      matchConfidence: match,
      tippingOff,
      redlines,
      blockingIssues,
      concerns,
      remediations,
      candidateDispositions: candidates,
      semanticReview: advRes?.text,
      charterIntegrityHash,
      agentTrail: trail,
      guidance: BUDGET_GUIDANCE,
      error: timedOut ? 'Advisor budget exceeded' : (advRes?.error ?? advThrown),
    };
  }

  const body = advRes.text ?? '';
  trail.push({
    stepNo: 2,
    actor: 'advisor',
    at: advStart,
    summary: 'Semantic audit complete.',
    body,
  });

  const semantic = parseSemanticVerdict(body);
  const finalVerdict = aggregateVerdict(prohibitionChecks, redlines, semantic);
  const candidates = candidateDispositionsFor(finalVerdict, redlines, tippingOff);

  return {
    ok: finalVerdict !== 'blocked',
    verdict: finalVerdict,
    partial: false,
    budgetMs: hardCeiling,
    elapsedMs: Date.now() - t0,
    prohibitionChecks,
    mandatorySections: sections,
    scope,
    matchConfidence: match,
    tippingOff,
    redlines,
    blockingIssues,
    concerns,
    remediations,
    candidateDispositions: candidates,
    semanticReview: body,
    charterIntegrityHash,
    agentTrail: trail,
    guidance: undefined,
    error: undefined,
  };
}

function buildRemediations(
  checks: ProhibitionCheck[],
  redlines: RedlinesAudit,
  tippingOff: TippingOffAudit,
  scope: ScopeAudit,
  sections: MandatorySectionCheck[],
): string[] {
  const out: string[] = [];
  if (!scope.sourcesDeclared) out.push('Declare authoritative sources (sources[]) with list-version dates before egress.');
  if (!scope.listVersionDatesPresent && scope.sourcesDeclared) out.push('Add ISO-8601 list-version dates to every source entry.');
  for (const s of sections) {
    if (!s.present) out.push(`Add mandatory section ${s.section} to narrative before egress.`);
  }
  if (tippingOff.scanned && !tippingOff.allowed) {
    out.push('Rewrite customer-facing text with neutral offboarding language; do not state AML/CFT reasons.');
  }
  if (redlines.fired.includes('rl_missing_charter_hash')) {
    out.push('Attach complianceCharterVersionHash to the outbound envelope.');
  }
  if (redlines.fired.includes('rl_training_data_as_sanctions_source')) {
    out.push('Remove sanctions assertion or attach primary-source evidence from an authoritative list.');
  }
  for (const c of checks) {
    if (c.status === 'violation') out.push(`Resolve ${c.id} violation: ${c.evidence.join('; ')}`);
  }
  return Array.from(new Set(out));
}

function charterHash(): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < SYSTEM_PROMPT.length; i++) {
    h ^= SYSTEM_PROMPT.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
