import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { forecastThreatMaturity } from '../../../../src/brain/temporal-forecast-engine.js';
import type { GeopoliticalTrigger } from '../../../../src/brain/temporal-forecast-engine.js';

export const maxDuration = 15;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const caseId = typeof body['caseId'] === 'string' ? body['caseId'] : `tf_${Date.now()}`;
  const subject = (body['subject'] as Record<string, unknown> | undefined) ?? {};
  const evidence = (body['evidence'] as Record<string, unknown> | undefined) ?? {};
  const triggers = (body['triggers'] as GeopoliticalTrigger[] | undefined) ?? [];
  const horizonDays = typeof body['horizonDays'] === 'number' ? body['horizonDays'] : 180;

  const result = forecastThreatMaturity(
    caseId,
    {
      name: typeof subject['name'] === 'string' ? subject['name'] : 'unknown',
      jurisdiction: typeof subject['jurisdiction'] === 'string' ? subject['jurisdiction'] : undefined,
      nationality: typeof subject['nationality'] === 'string' ? subject['nationality'] : undefined,
      pepMandateExpiryDays: typeof subject['pepMandateExpiryDays'] === 'number' ? subject['pepMandateExpiryDays'] : undefined,
    },
    {
      sanctionsNearMiss: typeof evidence['sanctionsNearMiss'] === 'boolean' ? evidence['sanctionsNearMiss'] : undefined,
      cahraLastSeenDaysAgo: typeof evidence['cahraLastSeenDaysAgo'] === 'number' ? evidence['cahraLastSeenDaysAgo'] : undefined,
      dormantDaysAgo: typeof evidence['dormantDaysAgo'] === 'number' ? evidence['dormantDaysAgo'] : undefined,
    },
    triggers,
    horizonDays,
  );

  const tenantId = tenantIdFromGate(gate);
  await writeAuditChainEntry({
    tenantId,
    event: 'ai.temporal_threat_forecast',
    actor: gate.keyId ?? 'system',
    payload: { caseId, factorCount: result.factors.length, peakRiskDate: result.peakRiskDate },
  });

  return NextResponse.json({ ok: true, ...result });
}
