import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { resolveStrObligations } from '../../../../src/brain/str-obligation-resolver.js';

export const maxDuration = 5;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const subject = (body['subject'] as Record<string, unknown> | undefined) ?? {};
  const subjectJurisdiction = typeof subject['jurisdiction'] === 'string' ? subject['jurisdiction'] : undefined;
  const transactionJurisdictions = Array.isArray(body['transactionJurisdictions'])
    ? (body['transactionJurisdictions'] as unknown[]).filter((j): j is string => typeof j === 'string')
    : [];
  const reportType = (['STR', 'SAR', 'CTR', 'FFR'].includes(body['reportType'] as string) ? body['reportType'] : 'STR') as 'STR' | 'SAR' | 'CTR' | 'FFR';
  const amountUsd = typeof body['amountUsd'] === 'number' ? body['amountUsd'] : undefined;

  const result = resolveStrObligations({
    subjectJurisdiction,
    transactionJurisdictions,
    reportType,
    amountUsd,
  });

  const tenantId = tenantIdFromGate(gate);
  await writeAuditChainEntry({
    tenantId,
    event: 'ai.str_obligation_resolved',
    actor: gate.keyId ?? 'system',
    payload: {
      subjectJurisdiction,
      reportType,
      obligationCount: result.obligations.length,
      conflictCount: result.conflicts.length,
      mandatoryCount: result.recommendedFilingOrder.length,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
