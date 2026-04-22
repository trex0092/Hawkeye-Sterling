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

export interface MlroAdvisorConfig {
  apiKey: string;
  executorModel?: string;  // defaults to Claude Sonnet
  advisorModel?: string;   // defaults to Claude Opus
  maxTokens?: number;
  timeoutMs?: number;
}

export interface MlroAdvisorRequest {
  question: string;
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
  reasoningTrail: ReasoningTrailStep[];
  narrative?: string | undefined;
  complianceReview: {
    prohibitionsChecked: string[];
    issues: string[];
    advisorVerdict: 'approved' | 'returned_for_revision' | 'blocked';
  };
  charterIntegrityHash: string;
  error?: string | undefined;
}

const DEFAULT_EXECUTOR = 'claude-sonnet-4-6';
const DEFAULT_ADVISOR = 'claude-opus-4-7';

const EXECUTOR_TASK =
  'You are the Deep-Reasoning EXECUTOR. Using the cognitive catalogue, draft a step-by-step ' +
  'reasoning chain that answers the MLRO question. For every finding cite the reasoning-mode ' +
  'id(s), doctrine id(s), red-flag id(s), and evidence id(s) that produced it. Do not issue a ' +
  'final disposition — propose next-steps only. Use the mandatory 7-section output structure.';

const ADVISOR_TASK =
  'You are the Deep-Reasoning ADVISOR. Review the EXECUTOR draft against the compliance ' +
  'charter (P1–P10). Flag any violation, any unearned assertion, any tipping-off risk, any ' +
  'merge of distinct subjects, any opaque scoring. Where sound, strengthen the rationale and ' +
  'produce the regulator-facing narrative per FDL 10/2025 Art.20-21. Do NOT replace verbatim ' +
  'quotations from evidence; never invent citations. Return the final narrative + an explicit ' +
  'verdict: approved / returned_for_revision / blocked, with reason.';

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
      JSON.stringify(req.caseContext, null, 2),
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
      includeCatalogueSummary: false,
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
}) => Promise<{ ok: boolean; text?: string; error?: string }>;

const defaultChat: ChatCall = async ({ model, system, user, maxTokens, apiKey }) => {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
        metadata: {
          product: 'hawkeye-sterling-v2',
          pipeline: 'mlro-advisor',
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = json.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') ?? '';
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function invokeMlroAdvisor(
  req: MlroAdvisorRequest,
  cfg: MlroAdvisorConfig,
  chat: ChatCall = defaultChat,
): Promise<MlroAdvisorResult> {
  const trail: ReasoningTrailStep[] = [];
  const executor = buildExecutorRequest(req);
  const execStart = new Date().toISOString();
  const execRes = await chat({
    model: cfg.executorModel ?? DEFAULT_EXECUTOR,
    system: executor.system,
    user: executor.user,
    maxTokens: cfg.maxTokens ?? 8000,
    apiKey: cfg.apiKey,
  });
  if (!execRes.ok) {
    return {
      ok: false,
      reasoningTrail: trail,
      complianceReview: { prohibitionsChecked: [], issues: [], advisorVerdict: 'blocked' },
      charterIntegrityHash: charterHash(),
      error: execRes.error,
    };
  }
  trail.push({
    stepNo: 1,
    actor: 'executor',
    modelId: cfg.executorModel ?? DEFAULT_EXECUTOR,
    at: execStart,
    summary: 'Executor draft produced.',
    body: execRes.text ?? '',
    citedModeIds: [],
    citedDoctrineIds: [],
    citedRedFlagIds: [],
    citedEvidenceIds: [],
  });

  const advisor = buildAdvisorRequest(req, execRes.text ?? '');
  const advStart = new Date().toISOString();
  const advRes = await chat({
    model: cfg.advisorModel ?? DEFAULT_ADVISOR,
    system: advisor.system,
    user: advisor.user,
    maxTokens: cfg.maxTokens ?? 8000,
    apiKey: cfg.apiKey,
  });
  if (!advRes.ok) {
    return {
      ok: false,
      reasoningTrail: trail,
      complianceReview: { prohibitionsChecked: [], issues: [], advisorVerdict: 'blocked' },
      charterIntegrityHash: charterHash(),
      error: advRes.error,
    };
  }
  trail.push({
    stepNo: 2,
    actor: 'advisor',
    modelId: cfg.advisorModel ?? DEFAULT_ADVISOR,
    at: advStart,
    summary: 'Advisor review + final narrative.',
    body: advRes.text ?? '',
    citedModeIds: [],
    citedDoctrineIds: [],
    citedRedFlagIds: [],
    citedEvidenceIds: [],
  });

  const body = advRes.text ?? '';
  const verdict: MlroAdvisorResult['complianceReview']['advisorVerdict'] =
    /\bBLOCKED\b/i.test(body) ? 'blocked' :
    /\bRETURNED_FOR_REVISION\b/i.test(body) ? 'returned_for_revision' :
    'approved';

  return {
    ok: true,
    reasoningTrail: trail,
    narrative: body,
    complianceReview: {
      prohibitionsChecked: ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'],
      issues: [],
      advisorVerdict: verdict,
    },
    charterIntegrityHash: charterHash(),
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
