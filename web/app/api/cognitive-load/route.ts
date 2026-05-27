import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { getJson, setJson } from '@/lib/server/store';
import { detectAlertFatigue, type DisposalEvent } from '../../../../src/brain/cognitive-load-monitor.js';

export const maxDuration = 10;

const eventsKey = (tenantId: string, actorId: string) => `hs-cognitive-load/${tenantId}/${actorId}/events.json`;

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const actorId = url.searchParams.get('actor') ?? gate.keyId ?? 'unknown';
  const windowHours = Number(url.searchParams.get('windowHours') ?? '4');

  const tenantId = tenantIdFromGate(gate);
  const events = await getJson<DisposalEvent[]>(eventsKey(tenantId, actorId)) ?? [];

  const profile = detectAlertFatigue(
    events.map((e) => ({ ...e, actorId })),
    windowHours,
  );

  if (profile.fatigueScore >= 40) {
    await writeAuditChainEntry({
      tenantId,
      event: 'ai.alert_fatigue_detected',
      actor: actorId,
      payload: { fatigueScore: profile.fatigueScore, signalCount: profile.signals.length, caseCount: profile.caseCount },
    });
  }

  return NextResponse.json({ ok: true, ...profile });
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Record a new disposal event
  const event = body as unknown as DisposalEvent;
  if (!event.eventId || !event.caseId || !event.disposedAt) {
    return NextResponse.json({ error: 'eventId, caseId, disposedAt required' }, { status: 400 });
  }

  const actorId = event.actorId ?? gate.keyId ?? 'unknown';
  const tenantId = tenantIdFromGate(gate);
  const existing = await getJson<DisposalEvent[]>(eventsKey(tenantId, actorId)) ?? [];

  // Keep rolling 24-hour window only
  const cutoff = Date.now() - 86_400_000;
  const filtered = existing.filter((e) => new Date(e.disposedAt).getTime() > cutoff);
  filtered.push({ ...event, actorId });

  await setJson(eventsKey(tenantId, actorId), filtered);

  return NextResponse.json({ ok: true, eventId: event.eventId, totalEventsInWindow: filtered.length });
}
