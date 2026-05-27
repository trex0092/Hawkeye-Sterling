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

  const score = typeof body['score'] === 'number' ? body['score'] : 0;
  const breakdown =
    typeof body['breakdown'] === 'object' && body['breakdown'] !== null
      ? (body['breakdown'] as Record<string, number>)
      : {};

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

  // Map ShapDecomposition → ScoreExplainResponse expected by BrainXAIPanel
  const shapValues = decomposition.contributions.map((c) => ({
    feature: c.displayName,
    contribution: c.shapValue,
    direction: (c.direction === 'increases_risk' ? 'positive' : 'negative') as 'positive' | 'negative',
    percentageOfScore: c.shapPercent,
  }));

  return NextResponse.json({
    ok: true,
    shapValues,
    totalScore: decomposition.totalScore,
    baseline: decomposition.baseline,
    confidence: 0.85,
  });
}
