// Layer 3 structured-output parser + gate tests.
//
// Mirrors what web/lib/server/mlro-structured.ts does — the parser
// must handle the three common shapes models produce (plain JSON,
// fenced JSON, prose + JSON) and the gate must surface defects in a
// way the rewrite-prompt builder can feed back.

import { describe, expect, it } from 'vitest';
import {
  checkCompletion,
  buildFailClosed,
  type AdvisorResponseV1,
  type CompletionDefect,
} from '../registry/index.js';

// Re-implement the parser locally so the test doesn't import from web/.
// Same algorithm as web/lib/server/mlro-structured.ts.
function tryParseStructured(text: string): { ok: true; value: AdvisorResponseV1 } | { ok: false; error: string } {
  const stripped = text.trim();
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : stripped;
  const trimmed = (candidate ?? '').trim();
  const start = trimmed.indexOf('{');
  if (start < 0) return { ok: false, error: 'no JSON object found' };
  let depth = 0;
  let end = -1;
  let inStr = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = false; continue; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return { ok: false, error: 'unbalanced JSON braces' };
  const jsonText = trimmed.slice(start, end + 1);
  try {
    return { ok: true, value: JSON.parse(jsonText) as AdvisorResponseV1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function clean(): AdvisorResponseV1 {
  return {
    schemaVersion: 1,
    facts: { bullets: ['fact 1'] },
    redFlags: { flags: [{ indicator: 'flag', typology: 'cdd_doctrine' }] },
    frameworkCitations: { byClass: { A: ['FDL 10/2025 Art.16'] } },
    decision: { verdict: 'escalate', oneLineRationale: 'rationale' },
    confidence: { score: 4, reason: 'gap' },
    counterArgument: { inspectorChallenge: 'A regulator inspector would press hard on whether identification was completed at onboarding.', rebuttal: 'CDD attempt is logged with timestamps; verdict holds.' },
    auditTrail: {
      charterVersionHash: 'advisor-v1', directivesInvoked: [], doctrinesApplied: [],
      retrievedSources: [{ class: 'A', classLabel: 'Primary Law', sourceId: 'FDL-10-2025', articleRef: 'Art.16' }],
      timestamp: '2026-04-30T00:00:00Z', userId: 'mlro-01', mode: 'deep', modelVersions: { sonnet: 'sonnet-4-6' },
    },
    escalationPath: { responsible: 'Compliance', accountable: 'MLRO', consulted: [], informed: [], nextAction: 'Open case + request SoF.' },
  };
}

describe('structured-output parser', () => {
  it('parses plain JSON the model emits without preamble', () => {
    const text = JSON.stringify(clean());
    const r = tryParseStructured(text);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('parse failed');
    expect(r.value.schemaVersion).toBe(1);
    expect(r.value.decision.verdict).toBe('escalate');
  });

  it('parses fenced JSON ("```json …```") the model wraps despite the instruction', () => {
    const text = '```json\n' + JSON.stringify(clean()) + '\n```';
    const r = tryParseStructured(text);
    expect(r.ok).toBe(true);
  });

  it('parses prose + JSON when the model adds a preamble', () => {
    const text = 'Here is the structured output you requested:\n\n' + JSON.stringify(clean()) + '\n\nLet me know if you need anything else.';
    const r = tryParseStructured(text);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('parse failed');
    expect(r.value.facts.bullets).toEqual(['fact 1']);
  });

  it('returns ok:false on missing JSON', () => {
    const r = tryParseStructured('I cannot answer this question.');
    expect(r.ok).toBe(false);
  });

  it('returns ok:false on unbalanced braces', () => {
    const r = tryParseStructured('{ "facts": { "bullets": ["x"] }');
    expect(r.ok).toBe(false);
  });

  it('survives strings containing { and } characters', () => {
    const obj = clean();
    obj.facts.bullets = ['Customer wrote "{ AED 1.15M }" on the form'];
    const r = tryParseStructured(JSON.stringify(obj));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('parse failed');
    expect(r.value.facts.bullets[0]).toContain('{ AED 1.15M }');
  });
});

describe('structured-output gate + fail-closed', () => {
  it('clean response passes the gate', () => {
    const r = checkCompletion(clean());
    expect(r.passed).toBe(true);
    expect(r.defects).toEqual([]);
  });

  it('truncated response trips the gate; fail-closed names the missing section', () => {
    const truncated: Partial<AdvisorResponseV1> = {
      schemaVersion: 1,
      facts: clean().facts,
      redFlags: clean().redFlags,
      frameworkCitations: clean().frameworkCitations,
      decision: clean().decision,
      // confidence onward — missing
    };
    const initial = checkCompletion(truncated);
    expect(initial.passed).toBe(false);
    const retry = checkCompletion(truncated);
    const fc = buildFailClosed(retry.defects, [initial.defects, retry.defects]);
    expect(fc.ok).toBe(false);
    expect(fc.reason).toBe('completion_gate_tripped');
    expect(fc.escalation.to).toMatch(/MLRO/);
    expect(fc.attempts).toHaveLength(2);
    expect(fc.message).toMatch(/confidence|counterArgument|auditTrail|escalationPath/);
  });

  it('fail-closed defects can be rendered into a rewrite-prompt block (build-spec contract)', () => {
    const truncated: Partial<AdvisorResponseV1> = { schemaVersion: 1, facts: clean().facts };
    const r = checkCompletion(truncated);
    const bullets = r.defects
      .map((d: CompletionDefect) => `  · [${d.section}] (${d.failure}) ${d.detail}`)
      .join('\n');
    expect(bullets).toContain('redFlags');
    expect(bullets).toContain('confidence');
    expect(bullets).toContain('escalationPath');
  });
});
