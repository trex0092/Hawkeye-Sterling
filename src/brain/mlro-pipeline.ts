// Hawkeye Sterling — MLRO reasoning pipeline.
// Composable runner over one or more modes from the deep-reasoning
// catalogue. Enforces:
//   - 25s hard per-request ceiling (AbortController per mode)
//   - charter-gate egress check (regex guards for P3 + P4)
//   - section merger — concatenates SUBJECT/SCOPE/FINDINGS/GAPS/
//     RED_FLAGS/RECOMMENDED_NEXT_STEPS/AUDIT_LINE across runs
//   - audit-chain append with tamper-evident hash
//
// Every run returns a MlroPipelineResult carrying the verdict, a partial
// flag + guidance on budget expiry, and the audited trail.

import type { MlroModeId } from './mlro-reasoning-modes.js';
import { AuditChain } from './audit-chain.js';
import { validateResponse } from './validator.js';
import { tippingOffScan } from './tipping-off-guard.js';
import { BUDGET_GUIDANCE, type MlroAdvisorResult, type ReasoningMode } from '../integrations/mlroAdvisor.js';
import { HARD_CEILING_MS } from './mlro-budget-planner.js';

export interface PipelineStep {
  modeId: MlroModeId;
  reasoningMode?: ReasoningMode;   // speed / balanced / multi_perspective
  questionOverride?: string;        // allow per-step question mutation
  budgetMs?: number;                 // per-step ceiling
}

export interface PipelineInput {
  question: string;
  steps: readonly PipelineStep[];
  totalBudgetMs?: number; // default 60_000 ms, hard-capped
}

export type PipelineRunStep = (modeId: MlroModeId, question: string, budgetMs: number, signal: AbortSignal) =>
  Promise<{ ok: boolean; text?: string; error?: string }>;

export interface PipelineAuditRow {
  seq: number;
  modeId: MlroModeId;
  at: string;
  elapsedMs: number;
  ok: boolean;
  partial: boolean;
  chars: number;
  prevHash: string;
  entryHash: string;
}

export interface MlroPipelineResult {
  ok: boolean;
  partial: boolean;
  guidance?: string | undefined;
  narrative: string;
  sections: Record<string, string>;
  stepResults: Array<{
    modeId: MlroModeId;
    text: string;
    ok: boolean;
    partial: boolean;
    elapsedMs: number;
  }>;
  audit: PipelineAuditRow[];
  charterGate: {
    allowed: boolean;
    tippingOffMatches: number;
    structuralIssues: string[];
  };
  totalElapsedMs: number;
  budgetMs: number;
}

const SECTION_HEADERS = [
  'SUBJECT_IDENTIFIERS',
  'SCOPE_DECLARATION',
  'FINDINGS',
  'GAPS',
  'RED_FLAGS',
  'RECOMMENDED_NEXT_STEPS',
  'AUDIT_LINE',
] as const;

type Section = typeof SECTION_HEADERS[number];

function splitSections(text: string): Partial<Record<Section, string>> {
  const out: Partial<Record<Section, string>> = {};
  const rx = /^\s*==\s*([A-Z_]+)\s*==\s*$|^\s*\[([A-Z_ ]+)\]\s*$/gm;
  const positions: Array<{ name: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const name = (m[1] ?? m[2] ?? '').trim().replace(/\s+/g, '_');
    positions.push({ name, start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]!.end;
    const end = i + 1 < positions.length ? positions[i + 1]!.start : text.length;
    const name = positions[i]!.name;
    if ((SECTION_HEADERS as readonly string[]).includes(name)) {
      out[name as Section] = text.slice(start, end).trim();
    }
  }
  return out;
}

function mergeSections(all: Array<Partial<Record<Section, string>>>): Record<string, string> {
  const merged: Partial<Record<Section, string[]>> = {};
  for (const s of all) {
    for (const h of SECTION_HEADERS) {
      const v = s[h];
      if (!v) continue;
      (merged[h] ||= []).push(v);
    }
  }
  const out: Record<string, string> = {};
  for (const h of SECTION_HEADERS) {
    if (merged[h]) out[h] = merged[h]!.join('\n\n---\n\n');
  }
  return out;
}

function withAbort<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<{ result?: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    const c = new AbortController();
    const t = setTimeout(() => { c.abort(); resolve({ timedOut: true }); }, ms);
    fn(c.signal).then(
      (r) => { clearTimeout(t); resolve({ result: r, timedOut: false }); },
      () => { clearTimeout(t); resolve({ timedOut: true }); },
    );
  });
}

export async function runMlroPipeline(
  input: PipelineInput,
  runStep: PipelineRunStep,
): Promise<MlroPipelineResult> {
  const totalBudget = Math.min(input.totalBudgetMs ?? HARD_CEILING_MS, HARD_CEILING_MS);
  const t0 = Date.now();
  const chain = new AuditChain();
  const stepResults: MlroPipelineResult['stepResults'] = [];
  const sections: Array<Partial<Record<Section, string>>> = [];

  for (const step of input.steps) {
    const remaining = Math.max(0, totalBudget - (Date.now() - t0));
    if (remaining < 500) break;
    const stepBudget = Math.min(step.budgetMs ?? remaining, remaining);
    const q = step.questionOverride ?? input.question;
    const stepStart = Date.now();
    const { result, timedOut } = await withAbort(stepBudget, (signal) => runStep(step.modeId, q, stepBudget, signal));
    const elapsed = Date.now() - stepStart;
    const text = result?.text ?? '';
    const ok = !!result?.ok && !timedOut;
    stepResults.push({ modeId: step.modeId, text, ok, partial: timedOut, elapsedMs: elapsed });
    sections.push(splitSections(text));
    const entry = chain.append(`mlro:${step.modeId}`, timedOut ? 'step.partial' : ok ? 'step.done' : 'step.failed', {
      modeId: step.modeId,
      elapsedMs: elapsed,
      chars: text.length,
    });
    // persist row
    void entry;
  }

  const merged = mergeSections(sections);
  const narrative = stepResults.map((s) => s.text).join('\n\n---\n\n');
  const tippingOff = tippingOffScan(narrative);
  const validation = validateResponse({
    sections: merged as never,
    findings: [],
    narrativeText: narrative,
  });

  const partial = stepResults.some((s) => s.partial) || stepResults.length < input.steps.length;
  const charterAllowed = tippingOff.allowed && validation.ok;

  return {
    ok: !partial && charterAllowed && stepResults.every((s) => s.ok),
    partial,
    guidance: partial ? BUDGET_GUIDANCE : undefined,
    narrative,
    sections: merged,
    stepResults,
    audit: chain.list().map((e) => ({
      seq: e.seq,
      modeId: (e.payload as { modeId: MlroModeId }).modeId,
      at: e.timestamp,
      elapsedMs: (e.payload as { elapsedMs: number }).elapsedMs,
      ok: e.action === 'step.done',
      partial: e.action === 'step.partial',
      chars: (e.payload as { chars: number }).chars,
      prevHash: e.prevHash,
      entryHash: e.entryHash,
    })),
    charterGate: {
      allowed: charterAllowed,
      tippingOffMatches: tippingOff.matches.length,
      structuralIssues: validation.errors,
    },
    totalElapsedMs: Date.now() - t0,
    budgetMs: totalBudget,
  };
}

// Convenience wrapper mapping a deep-reasoning POST to PipelineRunStep.
export function makeDeepReasoningRunStep(opts: {
  endpoint: string;
  jwt: string;
  composeUser: (modeId: MlroModeId, question: string) => string;
}): PipelineRunStep {
  return async (modeId, question, _budgetMs, signal) => {
    try {
      const res = await fetch(opts.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mode: modeId,
          question: opts.composeUser(modeId, question),
        }),
        ...(signal ? { signal } : {}),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const json = (await res.json()) as { text?: string };
      return { ok: true, text: json.text ?? '' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return { ok: false, error: 'aborted' };
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

export function convertMlroAdvisorResult(r: MlroAdvisorResult): MlroPipelineResult {
  // Adapter: MlroAdvisorResult → MlroPipelineResult for unified downstream
  // surfaces (UI, history panel, exporter).
  const sections = splitSections(r.narrative ?? '');
  return {
    ok: r.ok,
    partial: r.partial,
    guidance: r.guidance,
    narrative: r.narrative ?? '',
    sections: sections as Record<string, string>,
    stepResults: r.reasoningTrail.map((s) => ({
      modeId: s.modelId as MlroModeId,
      text: s.body,
      ok: true,
      partial: false,
      elapsedMs: 0,
    })),
    audit: [],
    charterGate: {
      allowed: !r.partial && r.complianceReview.issues.length === 0,
      tippingOffMatches: 0,
      structuralIssues: r.complianceReview.issues,
    },
    totalElapsedMs: r.elapsedMs,
    budgetMs: r.budgetMs,
  };
}
