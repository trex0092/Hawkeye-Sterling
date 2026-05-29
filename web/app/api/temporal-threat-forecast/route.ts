import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { forecastThreatMaturity, type GeopoliticalTrigger } from '../../../../src/brain/temporal-forecast-engine.js';

export const maxDuration = 15;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const caseId = typeof body['caseId'] === 'string' ? body['caseId'] : `tf_${Date.now()}`;
  const subject = (body['subject'] as Record<string, unknown> | undefined) ?? {};
  const evidence = (body['evidence'] as Record<string, unknown> | undefined) ?? {};
  const triggers = (body['triggers'] as GeopoliticalTrigger[] | undefined) ?? [];
  const horizonDays = typeof body['horizonDays'] === 'number' ? body['horizonDays'] : 180;

  try {
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
    void writeAuditChainEntry({
      event: 'ai.temporal_threat_forecast',
      actor: gate.keyId ?? 'system',
      payload: { caseId, factorCount: result.factors.length, peakRiskDate: result.peakRiskDate },
    }, tenantId).catch((e: unknown) => console.warn('[temporal-threat-forecast] audit write failed:', e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.error('[temporal-threat-forecast] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to generate temporal threat forecast' }, { status: 500, headers: gate.headers });
  }
}
