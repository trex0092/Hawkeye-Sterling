// Hawkeye Sterling — AST rule engine API.
// POST /api/rule-engine/evaluate  — evaluate a rule against a context
// POST /api/rule-engine/parse     — parse a rule and return AST
// GET  /api/rule-engine/builtin   — list built-in rules
//
// Auth: API key required (enforce). Built-in AML rules are proprietary;
// arbitrary rule evaluation against caller-supplied contexts is also gated.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextRequest, NextResponse } from 'next/server';
import { parseRule, evaluateRuleString, evaluateAllRules, BUILTIN_RULES, type RuleContext } from '../../../../src/brain/rule-engine';
import { enforce } from '@/lib/server/enforce';

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ rules: BUILTIN_RULES, count: BUILTIN_RULES.length }, { headers: gate.headers });
}

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const action = raw['action'] as string | undefined;

  if (action === 'parse') {
    const rule = raw['rule'] as string | undefined;
    if (!rule?.trim()) return NextResponse.json({ error: 'rule string required' }, { status: 400 });
    try {
      const compiled = parseRule(rule);
      return NextResponse.json({ ok: true, ast: compiled.ast, rule: compiled.source }, { headers: gate.headers });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 422 });
    }
  }

  if (action === 'evaluate' || !action) {
    const rule = raw['rule'] as string | undefined;
    const ctx = (raw['context'] ?? {}) as RuleContext;

    if (rule?.trim()) {
      const result = evaluateRuleString(rule, ctx);
      return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
    }

    // Evaluate all built-in rules against context
    const results = evaluateAllRules(ctx);
    const triggered = results.filter((r) => r.result.triggered);
    return NextResponse.json({
      ok: true,
      context: ctx,
      triggeredCount: triggered.length,
      totalRules: results.length,
      triggered: triggered.map((r) => ({ id: r.id, name: r.name, severity: r.severity, domain: r.domain })),
      all: results.map((r) => ({ id: r.id, name: r.name, triggered: r.result.triggered, error: r.result.error })),
    }, { headers: gate.headers });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'parse', 'evaluate', or omit for evaluate-all.` }, { status: 400 });
}
