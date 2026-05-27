import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { decomposeScore } from '../../../../src/brain/shap-decomposer.js';

export const maxDuration = 5;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const composite = body['composite'] as { score?: number; breakdown?: Record<string, number> } | undefined;
  const score = typeof composite?.score === 'number' ? composite.score : 0;
  const breakdown = composite?.breakdown ?? {};

  const decomposition = decomposeScore(score, breakdown);

  const tenantId = tenantIdFromGate(gate);
  await writeAuditChainEntry({
    tenantId,
    event: 'ai.shap_score_explanation_generated',
    actor: gate.keyId ?? 'system',
    payload: {
      totalScore: decomposition.totalScore,
      dominantFeature: decomposition.dominantFeature,
      contributionCount: decomposition.contributions.length,
    },
  });

  return NextResponse.json({ ok: true, ...decomposition });
}
