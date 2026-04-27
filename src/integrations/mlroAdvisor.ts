// Hawkeye Sterling — Deep Reasoning · MLRO Advisor.
// Two-model pipeline:
//   - Claude Sonnet executes the reasoning chain across registered modes,
//     producing a draft finding set + narrative.
//   - Claude Opus reviews for charter compliance (P1–P10), strengthens
//     rationale, and produces the regulator-facing narrative.
// Every step is persisted as the "FDL Art.20-21 reasoning trail" — a
// verbatim transcript that the MLRO and regulator can replay.

import { weaponizedSystemPrompt } from '../brain/weaponized.js';
import { SYSTEM_PROMPT } from '../policy/systemPrompt.js';
import { fetchJsonWithRetry } from './httpRetry.js';

export type ReasoningMode = 'speed' | 'balanced' | 'multi_perspective';

export interface ModeBudget {
  totalMs: number;
  executorMs?: number;
  advisorMs?: number;
}

// Per-mode budgets.
// speed:             Sonnet only, no advisor chain — must finish in ~8 s.
// balanced:          Opus advisor only (no executor), up to 45 s.
// multi_perspective: Sonnet executor (25 s) → Opus advisor (65 s) = 90 s total.
//                    Opus 4.7 needs up to 55 s for a full 8 k-token narrative.
export const MODE_BUDGETS: Record<ReasoningMode, ModeBudget> = {
  speed:             { totalMs:  8_000, executorMs:  8_000 },
  balanced:          { totalMs: 45_000, advisorMs:  45_000 },
  multi_perspective: { totalMs: 90_000, executorMs: 25_000, advisorMs: 65_000 },
};

export interface MlroAdvisorConfig {
  apiKey: string;
  executorModel?: string;  // defaults to Claude Sonnet
  advisorModel?: string;   // defaults to Claude Opus
  maxTokens?: number;
  /** Hard ceiling per request. Default 60s. */
  budgetMs?: number;
}

export interface MlroAdvisorRequest {
  question: string;
  mode?: ReasoningMode;   // default: multi_perspective
  caseContext: {
    caseId: string;
    subjectName: string;
    entityType: string;
    scope: {
      listsChecked: string[];
      listVersionDates: Record<string, string>;
      jurisdictions: string[];
      matchingMethods: string[];
    };
    evidenceIds: string[];
  };
  /** Narrow the context the model sees. Strips unchecked rows. */
  contextMask?: {
    subject?: boolean;
    entityType?: boolean;
    scope?: boolean;
    evidenceIds?: boolean;
  };
  audience?: 'regulator' | 'mlro' | 'board';
}

export interface ReasoningTrailStep {
  stepNo: number;
  actor: 'executor' | 'advisor';
  modelId: string;
  at: string; // ISO 8601
  summary: string;
  body: string;
  citedModeIds: string[];
  citedDoctrineIds: string[];
  citedRedFlagIds: string[];
  citedEvidenceIds: string[];
}

export interface MlroAdvisorResult {
  ok: boolean;
  mode: ReasoningMode;
  budgetMs: number;
  elapsedMs: number;
  /** True when the budget expired and some part of the pipeline could not finish. */
  partial: boolean;
  /** Guidance surfaced to the operator when partial=true. */
  guidance?: string | undefined;
  reasoningTrail: ReasoningTrailStep[];
  narrative?: string | undefined;
  complianceReview: {
    prohibitionsChecked: string[];
    issues: string[];
    advisorVerdict: 'approved' | 'returned_for_revision' | 'blocked' | 'incomplete';
  };
  charterIntegrityHash: string;
  error?: string | undefined;
}

export const BUDGET_GUIDANCE =
  'Deep reasoning exceeded the per-request budget. Partial reply above — the reasoning chain did not close in time. ' +
  'To get a full answer: (a) shorten the case context (include only the rows that matter), (b) pick a simpler ' +
  'reasoning mode (Speed instead of Multi-perspective), or (c) split your question into two smaller ones and combine ' +
  'the results in the History tab.';

const DEFAULT_EXECUTOR = 'claude-sonnet-4-6';
const DEFAULT_ADVISOR = 'claude-opus-4-7';

const EXECUTOR_TASK =
  'You are the Deep-Reasoning EXECUTOR for Hawkeye Sterling\'s MLRO. ' +
  'Your mandate is TOTAL: you answer ANY question the MLRO poses — compliance, ' +
  'AML/CFT, sanctions, regulatory, operational, HR, risk management, strategy, ' +
  'customer handling, internal procedures, supplier due diligence, board reporting, ' +
  'crisis management, data privacy, export control, or anything else that lands ' +
  'on the MLRO\'s desk. No question is out of scope. ' +
  '\n\n' +
  'SCOPE DETECTION — apply the right toolkit:\n' +
  '• AML/CFT/SANCTIONS/SCREENING question → cite reasoning-mode id(s), doctrine ' +
  'id(s), red-flag id(s), typology id(s), skill id(s) from the catalogue. Any ' +
  'id not in the catalogue is fabrication.\n' +
  '• OPERATIONAL/HR/STRATEGY/PROCEDURES question → apply the full cognitive ' +
  'toolkit (reasoning modes, skills, meta-cognition) as expert depth multipliers. ' +
  'Do NOT force AML catalogue IDs onto non-AML content. Cite skills and reasoning ' +
  'modes only where genuinely applicable.\n' +
  '• MIXED question → split into AML and non-AML threads, handle each correctly.\n' +
  '\n' +
  'OUTPUT STRUCTURE (adapt to question type):\n' +
  '1. QUESTION TYPE — one of: AML/Compliance | Operational | HR | Risk/Strategy | ' +
  'Regulatory | Mixed.\n' +
  '2. ANALYSIS — step-by-step reasoning chain using the deepest applicable toolkit.\n' +
  '3. FINDINGS / KEY POINTS — structured conclusions.\n' +
  '4. GAPS — what information is missing or unverifiable.\n' +
  '5. RECOMMENDED ACTIONS — concrete next steps the MLRO should take.\n' +
  '6. AUDIT LINE — timestamp, question type, compositeHash (echo verbatim).\n' +
  '\n' +
  'Charter P1–P10 remain in full force for any AML/sanctions/adverse-media content. ' +
  'For non-AML content, apply the same intellectual rigour and never fabricate facts. ' +
  'Do not issue a final legal disposition. Propose next steps only.';

const ADVISOR_TASK =
  'You are the Deep-Reasoning ADVISOR for Hawkeye Sterling\'s MLRO. ' +
  'You review the EXECUTOR draft for any question type — AML, operational, HR, ' +
  'risk, regulatory, strategy, or mixed. Your review has two layers:\n' +
  '\n' +
  'LAYER 1 — CHARTER COMPLIANCE (always active):\n' +
  'Check P1–P10 for any AML/sanctions/adverse-media content in the draft. Flag ' +
  'violations, unearned assertions, tipping-off risk, merged subjects, opaque ' +
  'scoring, and any cited catalogue id (skill / mode / doctrine / regime / CAHRA / ' +
  'FATF / playbook / disposition) that is NOT in the cognitive catalogue.\n' +
  '\n' +
  'LAYER 2 — EXPERT QUALITY (always active):\n' +
  'For all content, including non-AML operational guidance: (a) is the advice ' +
  'factually accurate and complete? (b) is it appropriate for a UAE-licensed DNFBP ' +
  'precious-metals operator? (c) does it protect the business legally and ' +
  'reputationally? (d) is there a better or safer course of action? ' +
  'Strengthen weak reasoning, fill gaps, add nuance.\n' +
  '\n' +
  'FINAL NARRATIVE: produce a polished, regulator-ready (or management-ready, ' +
  'depending on question type) narrative. Echo charterHash, catalogueHash, and ' +
  'compositeHash in the AUDIT_LINE. Return an explicit verdict: ' +
  'approved / returned_for_revision / blocked, with concise reason.';

function applyMask(req: MlroAdvisorRequest): Partial<MlroAdvisorRequest['caseContext']> {
  const mask = req.contextMask;
  if (!mask) return req.caseContext;
  const out: Partial<MlroAdvisorRequest['caseContext']> = { caseId: req.caseContext.caseId };
  if (mask.subject ?? true) out.subjectName = req.caseContext.subjectName;
  if (mask.entityType ?? true) out.entityType = req.caseContext.entityType;
  if (mask.scope ?? true) out.scope = req.caseContext.scope;
  if (mask.evidenceIds ?? true) out.evidenceIds = req.caseContext.evidenceIds;
  return out;
}

export function buildExecutorRequest(req: MlroAdvisorRequest): {
  system: string;
  user: string;
} {
  return {
    system: weaponizedSystemPrompt({
      taskRole: EXECUTOR_TASK,
      audience: req.audience ?? 'regulator',
      includeCatalogueSummary: true,
    }),
    user: [
      'CASE CONTEXT:',
      JSON.stringify(applyMask(req), null, 2),
      '',
      'QUESTION:',
      req.question,
    ].join('\n'),
  };
}

export function buildAdvisorRequest(
  req: MlroAdvisorRequest,
  executorOutput: string,
): { system: string; user: string } {
  return {
    system: weaponizedSystemPrompt({
      taskRole: ADVISOR_TASK,
      audience: req.audience ?? 'regulator',
      includeCatalogueSummary: true,
    }),
    user: [
      'CASE CONTEXT:',
      JSON.stringify(req.caseContext, null, 2),
      '',
      'EXECUTOR DRAFT:',
      executorOutput,
      '',
      'Review this draft against P1–P10 and produce the regulator-facing narrative.',
    ].join('\n'),
  };
}

// ── pluggable chat primitive so tests can inject a fake transport
export type ChatCall = (input: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  apiKey: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; text?: string; error?: string }>;

const defaultChat: ChatCall = async ({ model, system, user, maxTokens, apiKey, signal }) => {
  if (!user.trim()) return { ok: false, error: 'message content must be non-empty' };
  const result = await fetchJsonWithRetry<{ content?: Array<{ type: string; text?: string }> }>(
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
        system,
        messages: [{ role: 'user', content: user }],
      }),
    },
    {
      ...(signal ? { signal } : {}),
      // The outer withBudget() enforces the per-mode ceiling. Per-attempt and
      // idle timeouts must be generous enough that the model can finish a full
      // 8 k-token response (~25-35s) before the HTTP layer fires independently.
      perAttemptMs: Math.min(55_000, maxTokens * 40 + 8_000),
      idleReadMs: 25_000,
      maxAttempts: 2,
    },
  );
  if (signal?.aborted) return { ok: false, error: 'aborted' };
  if (!result.ok || !result.json) {
    const prefix = result.partial ? 'partial_response:' : '';
    let errorDetail = result.error ?? `HTTP ${result.status ?? 'unknown'}`;
    if (result.body && !result.partial) {
      try {
        const parsed = JSON.parse(result.body) as { error?: { message?: string } };
        if (parsed?.error?.message) errorDetail = `API Error: ${result.status} ${parsed.error.message}`;
      } catch { /* keep default error detail */ }
    }
    return {
      ok: false,
      error: `${prefix}${errorDetail} (${result.attempts} attempts, ${result.elapsedMs}ms)`,
    };
  }
  const text = result.json.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') ?? '';
  return { ok: true, text };
};

function withBudget<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<{ result?: T; timedOut: boolean; thrownError?: string }> {
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

export async function invokeMlroAdvisor(
  req: MlroAdvisorRequest,
  cfg: MlroAdvisorConfig,
  chat: ChatCall = defaultChat,
): Promise<MlroAdvisorResult> {
  if (!req.question.trim()) throw new Error('MlroAdvisorRequest.question must be non-empty');
  const mode: ReasoningMode = req.mode ?? 'multi_perspective';
  const budget = MODE_BUDGETS[mode];
  const hardCeiling = cfg.budgetMs ?? budget.totalMs;
  const totalBudget = Math.min(budget.totalMs, hardCeiling);
  const t0 = Date.now();
  const trail: ReasoningTrailStep[] = [];
  const execModel = cfg.executorModel ?? DEFAULT_EXECUTOR;
  const advModel = cfg.advisorModel ?? DEFAULT_ADVISOR;

  const makeResult = (partial: boolean, narrative: string | undefined, verdict: MlroAdvisorResult['complianceReview']['advisorVerdict'], error?: string): MlroAdvisorResult => ({
    ok: !partial && !error,
    mode,
    budgetMs: totalBudget,
    elapsedMs: Date.now() - t0,
    partial,
    guidance: partial ? BUDGET_GUIDANCE : undefined,
    reasoningTrail: trail,
    narrative,
    complianceReview: {
      prohibitionsChecked: ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'],
      issues: partial ? ['budget_exceeded'] : [],
      advisorVerdict: verdict,
    },
    charterIntegrityHash: charterHash(),
    error,
  });

  // Stage 1 — executor (skipped in 'balanced' mode).
  let executorBody = '';
  if (mode !== 'balanced') {
    const executor = buildExecutorRequest(req);
    const execStart = new Date().toISOString();
    const execBudget = Math.min(budget.executorMs ?? totalBudget, totalBudget);
    const { result: execRes, timedOut, thrownError: execThrown } = await withBudget(execBudget, (signal) =>
      chat({ model: execModel, system: executor.system, user: executor.user, maxTokens: cfg.maxTokens ?? 8000, apiKey: cfg.apiKey, signal }),
    );
    if (timedOut || !execRes?.ok) {
      trail.push({ stepNo: 1, actor: 'executor', modelId: execModel, at: execStart, summary: timedOut ? 'Executor budget exceeded — partial output.' : 'Executor failed.', body: execRes?.text ?? '', citedModeIds: [], citedDoctrineIds: [], citedRedFlagIds: [], citedEvidenceIds: [] });
      return makeResult(true, execRes?.text, 'incomplete', timedOut ? 'Deep reasoning budget exceeded — try Speed or Balanced mode.' : (execRes?.error ?? execThrown));
    }
    executorBody = execRes.text ?? '';
    trail.push({ stepNo: 1, actor: 'executor', modelId: execModel, at: execStart, summary: 'Executor draft produced.', body: executorBody, citedModeIds: [], citedDoctrineIds: [], citedRedFlagIds: [], citedEvidenceIds: [] });
  }

  // If mode == 'speed', stop here.
  if (mode === 'speed') {
    const verdict: MlroAdvisorResult['complianceReview']['advisorVerdict'] = 'approved';
    return makeResult(false, executorBody, verdict);
  }

  // Stage 2 — advisor.
  const draftForAdvisor = executorBody || `No executor draft (mode=${mode}). Perform the executor + advisor roles yourself in one pass.`;
  const advisor = buildAdvisorRequest(req, draftForAdvisor);
  const advStart = new Date().toISOString();
  const remaining = Math.max(1, totalBudget - (Date.now() - t0));
  const advBudget = Math.min(budget.advisorMs ?? remaining, remaining);
  const { result: advRes, timedOut: advTimedOut, thrownError: advThrown } = await withBudget(advBudget, (signal) =>
    chat({ model: advModel, system: advisor.system, user: advisor.user, maxTokens: cfg.maxTokens ?? 8000, apiKey: cfg.apiKey, signal }),
  );
  if (advTimedOut || !advRes?.ok) {
    trail.push({ stepNo: trail.length + 1, actor: 'advisor', modelId: advModel, at: advStart, summary: advTimedOut ? 'Advisor budget exceeded — partial output.' : 'Advisor failed.', body: advRes?.text ?? '', citedModeIds: [], citedDoctrineIds: [], citedRedFlagIds: [], citedEvidenceIds: [] });
    return makeResult(true, advRes?.text ?? executorBody, 'incomplete', advTimedOut ? 'Deep reasoning budget exceeded — try Speed or Balanced mode.' : (advRes?.error ?? advThrown));
  }
  const body = advRes.text ?? '';
  trail.push({ stepNo: trail.length + 1, actor: 'advisor', modelId: advModel, at: advStart, summary: 'Advisor review + final narrative.', body, citedModeIds: [], citedDoctrineIds: [], citedRedFlagIds: [], citedEvidenceIds: [] });

  const verdict: MlroAdvisorResult['complianceReview']['advisorVerdict'] =
    /\bBLOCKED\b/i.test(body) ? 'blocked' :
    /\bRETURNED_FOR_REVISION\b/i.test(body) ? 'returned_for_revision' :
    'approved';

  return makeResult(false, body, verdict);
}

// ── question splitter and result combiner
// Deterministic, no-LLM heuristic: split on the first conjunction, then on
// the first sentence boundary; fall back to midpoint. Guarantees two
// non-empty halves on any reasonable question.
export function splitQuestion(question: string): [string, string] {
  const q = question.trim();
  if (!q) throw new Error('splitQuestion: question must be non-empty');
  if (q.length < 2) throw new Error('splitQuestion: question too short to split');
  const conjMatch = q.match(/\s+(and|&|plus|also|as well as)\s+/i);
  if (conjMatch && typeof conjMatch.index === 'number' && conjMatch.index > 8) {
    const i = conjMatch.index;
    return [q.slice(0, i).trim(), q.slice(i + conjMatch[0].length).trim()];
  }
  const sentBreak = q.match(/[.!?]\s+/);
  if (sentBreak && typeof sentBreak.index === 'number' && sentBreak.index > 10 && sentBreak.index < q.length - 10) {
    const i = sentBreak.index + 1;
    return [q.slice(0, i).trim(), q.slice(i).trim()];
  }
  const mid = Math.floor(q.length / 2);
  const spaceIdx = q.lastIndexOf(' ', mid);
  const pivot = spaceIdx > 0 ? spaceIdx : Math.max(1, mid);
  return [q.slice(0, pivot).trim(), q.slice(pivot).trim()];
}

export function combineResults(a: MlroAdvisorResult, b: MlroAdvisorResult): MlroAdvisorResult {
  const verdictPriority: Record<MlroAdvisorResult['complianceReview']['advisorVerdict'], number> = {
    blocked: 4, returned_for_revision: 3, incomplete: 2, approved: 1,
  };
  const va = a.complianceReview.advisorVerdict;
  const vb = b.complianceReview.advisorVerdict;
  const verdict = verdictPriority[va] >= verdictPriority[vb] ? va : vb;
  const issues = Array.from(new Set([...a.complianceReview.issues, ...b.complianceReview.issues]));
  return {
    ok: a.ok && b.ok,
    mode: a.mode,
    budgetMs: a.budgetMs + b.budgetMs,
    elapsedMs: a.elapsedMs + b.elapsedMs,
    partial: a.partial || b.partial,
    guidance: a.partial || b.partial ? BUDGET_GUIDANCE : undefined,
    reasoningTrail: [...a.reasoningTrail, ...b.reasoningTrail.map((s) => ({ ...s, stepNo: s.stepNo + a.reasoningTrail.length }))],
    narrative: [a.narrative, b.narrative].filter(Boolean).join('\n\n---\n\n'),
    complianceReview: {
      prohibitionsChecked: a.complianceReview.prohibitionsChecked,
      issues,
      advisorVerdict: verdict,
    },
    charterIntegrityHash: a.charterIntegrityHash,
  };
}

function charterHash(): string {
  // FNV-1a over the frozen system prompt — matches the weaponized manifest.
  let h = 0x811c9dc5;
  for (let i = 0; i < SYSTEM_PROMPT.length; i++) {
    h ^= SYSTEM_PROMPT.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
