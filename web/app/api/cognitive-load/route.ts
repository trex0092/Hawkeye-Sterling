import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { getJson, setJson } from '@/lib/server/store';
import { detectAlertFatigue, type DisposalEvent } from '../../../../src/brain/cognitive-load-monitor.js';

export const maxDuration = 10;

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

const eventsKey = (tenantId: string, actorId: string) =>
  `hs-cognitive-load/${safeSegment(tenantId)}/${safeSegment(actorId)}/events.json`;

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const actorId = url.searchParams.get('actor') ?? gate.keyId ?? 'unknown';
  const windowHours = Number(url.searchParams.get('windowHours') ?? '4');

  const tenantId = tenantIdFromGate(gate);
  try {
    const events = await getJson<DisposalEvent[]>(eventsKey(tenantId, actorId)) ?? [];
    const profile = detectAlertFatigue(
      events.map((e) => ({ ...e, actorId })),
      windowHours,
    );

    if (profile.fatigueScore >= 40) {
      void writeAuditChainEntry({
        event: 'ai.alert_fatigue_detected',
        actor: actorId,
        payload: { fatigueScore: profile.fatigueScore, signalCount: profile.signals.length, caseCount: profile.caseCount },
      }, tenantId).catch((e: unknown) => console.warn('[cognitive-load] audit write failed:', e instanceof Error ? e.message : String(e)));
    }

    return NextResponse.json({ ok: true, ...profile }, { headers: gate.headers });
  } catch (err) {
    console.error('[cognitive-load] GET failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to load cognitive load profile' }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const event = body as unknown as DisposalEvent;
  if (!event.eventId || !event.caseId || !event.disposedAt) {
    return NextResponse.json({ ok: false, error: 'eventId, caseId, disposedAt required' }, { status: 400, headers: gate.headers });
  }

  const actorId = event.actorId ?? gate.keyId ?? 'unknown';
  const tenantId = tenantIdFromGate(gate);
  try {
    const existing = await getJson<DisposalEvent[]>(eventsKey(tenantId, actorId)) ?? [];
    const cutoff = Date.now() - 86_400_000;
    const filtered = existing.filter((e) => new Date(e.disposedAt).getTime() > cutoff);
    filtered.push({ ...event, actorId });
    await setJson(eventsKey(tenantId, actorId), filtered);

    return NextResponse.json({ ok: true, eventId: event.eventId, totalEventsInWindow: filtered.length }, { headers: gate.headers });
  } catch (err) {
    console.error('[cognitive-load] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to record disposal event' }, { status: 500, headers: gate.headers });
  }
}
