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
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const customerId = typeof body['customerId'] === 'string' ? body['customerId'] : null;
  const triggerKind = body['triggerKind'] as RbaTriggerKind | undefined;
  const priorTier = (body['priorTier'] as CddTier | undefined) ?? 'standard';
  const payload = (body['payload'] as Record<string, unknown> | undefined) ?? {};

  if (!customerId) return NextResponse.json({ ok: false, error: 'customerId required' }, { status: 400, headers: gate.headers });
  if (!triggerKind) return NextResponse.json({ ok: false, error: 'triggerKind required' }, { status: 400, headers: gate.headers });

  try {
    const triggerEvent = evaluateTrigger(triggerKind, payload, priorTier, customerId);
    if (!triggerEvent) {
      return NextResponse.json({ ok: true, customerId, priorTier, newTier: priorTier, tierChanged: false, rbaScore: 0, auditId: 'no_trigger' }, { headers: gate.headers });
    }

    const { newTier, rbaScore, rationale } = computeRbaScore(priorTier, triggerKind, payload);
    const tierChanged = newTier !== priorTier;
    const auditId = `rba_${Date.now()}`;

    let tierChangeEvent = undefined;
    if (tierChanged) {
      tierChangeEvent = buildTierChangeEvent(customerId, priorTier, newTier, triggerKind, rationale);
    }

    const tenantId = tenantIdFromGate(gate);
    void writeAuditChainEntry({
      event: tierChanged ? 'customer.risk_tier_changed' : 'customer.rba_recalculated_no_change',
      actor: gate.keyId ?? 'system',
      payload: { customerId, priorTier, newTier, rbaScore, triggerKind, rationale, auditId },
    }, tenantId).catch((e: unknown) => console.warn('[rba-recalculate] audit write failed:', e instanceof Error ? e.message : String(e)));

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
    }, { headers: gate.headers });
  } catch (err) {
    console.error('[rba-recalculate] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to recalculate RBA score' }, { status: 500, headers: gate.headers });
  }
}
