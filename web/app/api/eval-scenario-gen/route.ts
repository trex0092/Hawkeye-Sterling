import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { getJson, setJson } from '@/lib/server/store';
import { generateScenarios } from '../../../../src/brain/synthetic-scenario-gen.js';
import type { RegressionScenario } from '../../../../src/brain/registry/eval-harness.js';

export const maxDuration = 60;

const scenariosKey = (tenantId: string) => `hs-eval-scenarios/${tenantId}/generated.json`;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const typology = typeof body['typology'] === 'string' ? body['typology'] : 'tbml';
  const jurisdiction = typeof body['jurisdiction'] === 'string' ? body['jurisdiction'] : 'AE';
  const entityType = (['individual', 'organisation', 'vessel'].includes(body['entityType'] as string) ? body['entityType'] : 'organisation') as 'individual' | 'organisation' | 'vessel';
  const evasionSophistication = ([1, 2, 3, 4, 5].includes(body['evasionSophistication'] as number) ? body['evasionSophistication'] : 3) as 1 | 2 | 3 | 4 | 5;
  const count = typeof body['count'] === 'number' ? Math.min(body['count'], 20) : 5;

  const tenantId = tenantIdFromGate(gate);
  const existing = await getJson<RegressionScenario[]>(scenariosKey(tenantId)) ?? [];
  const existingIds = existing.map((s) => s.id);

  const result = await generateScenarios({
    typology, jurisdiction, entityType, evasionSophistication, count,
    existingIds,
  });

  if (result.added > 0) {
    await setJson(scenariosKey(tenantId), [...existing, ...result.scenarios]);
  }

  await writeAuditChainEntry({
    tenantId,
    event: 'ai.synthetic_scenarios_generated',
    actor: gate.sub ?? 'system',
    payload: { typology, jurisdiction, requested: count, added: result.added, rejected: result.rejectedCount },
  });

  return NextResponse.json({ ok: true, ...result });
}
