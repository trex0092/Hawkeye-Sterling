import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import {
  evaluateTrigger,
  computeRbaScore,
  buildTierChangeEvent,
  type RbaTriggerKind,
  type CddTier,
} from '../../../../src/brain/rba-recalculation-engine.js';

export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const customerId = typeof body['customerId'] === 'string' ? body['customerId'] : null;
  const triggerKind = body['triggerKind'] as RbaTriggerKind | undefined;
  const priorTier = (body['priorTier'] as CddTier | undefined) ?? 'standard';
  const payload = (body['payload'] as Record<string, unknown> | undefined) ?? {};

  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  if (!triggerKind) return NextResponse.json({ error: 'triggerKind required' }, { status: 400 });

  const triggerEvent = evaluateTrigger(triggerKind, payload, priorTier, customerId);
  if (!triggerEvent) {
    return NextResponse.json({ ok: true, customerId, priorTier, newTier: priorTier, tierChanged: false, rbaScore: 0, auditId: 'no_trigger' });
  }

  const { newTier, rbaScore, rationale } = computeRbaScore(priorTier, triggerKind, payload);
  const tierChanged = newTier !== priorTier;
  const auditId = `rba_${Date.now()}`;

  let tierChangeEvent = undefined;
  if (tierChanged) {
    tierChangeEvent = buildTierChangeEvent(customerId, priorTier, newTier, triggerKind, rationale);
  }

  const tenantId = tenantIdFromGate(gate);
  await writeAuditChainEntry({
    tenantId,
    event: tierChanged ? 'customer.risk_tier_changed' : 'customer.rba_recalculated_no_change',
    actor: gate.sub ?? 'system',
    payload: { customerId, priorTier, newTier, rbaScore, triggerKind, rationale, auditId },
  });

  return NextResponse.json({
    ok: true,
    customerId,
    priorTier,
    newTier,
    tierChanged,
    rbaScore,
    tierChangeEvent,
    auditId,
    rationale,
  });
}
