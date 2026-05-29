import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { explainDecision } from '../../../../src/brain/counterfactual-explainer.js';

export const maxDuration = 20;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const verdict = typeof body['verdict'] === 'string' ? body['verdict'] : 'escalate';
  const score = typeof body['score'] === 'number' ? body['score'] : 0;
  const breakdown = (body['breakdown'] as Record<string, number> | undefined) ?? {};
  const caseId = typeof body['caseId'] === 'string' ? body['caseId'] : undefined;

  try {
    const explanation = explainDecision(verdict, score, breakdown);
    const tenantId = tenantIdFromGate(gate);

    void writeAuditChainEntry({
      event: 'ai.counterfactual_explanation_generated',
      actor: gate.keyId ?? 'system',
      payload: {
        caseId,
        originalVerdict: verdict,
        originalScore: score,
        counterfactualCount: explanation.counterfactuals.length,
        immovableCount: explanation.immovableFactors.length,
      },
    }, tenantId).catch((e: unknown) => console.warn('[score-counterfactual] audit write failed:', e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, ...explanation }, { headers: gate.headers });
  } catch (err) {
    console.error('[score-counterfactual] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to compute counterfactual explanation' }, { status: 500, headers: gate.headers });
  }
}
