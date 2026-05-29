import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { getJson, setJson } from '@/lib/server/store';
import type { TypologyCandidate } from '../../../../src/brain/emerging-typology-miner.js';

export const maxDuration = 15;

const storeKey = (tenantId: string) => `hs-typology-proposals/${tenantId}/proposals.json`;

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  try {
    const proposals = await getJson<TypologyCandidate[]>(storeKey(tenantId)) ?? [];
    const pending = proposals.filter((p) => p.status === 'pending_mlro_approval');
    return NextResponse.json({ ok: true, pending, total: proposals.length }, { headers: gate.headers });
  } catch (err) {
    console.error('[emerging-typologies] GET failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to load typology proposals' }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const candidateId = typeof body['candidateId'] === 'string' ? body['candidateId'] : null;
  const decision = body['decision'] as 'approve' | 'reject' | undefined;
  const rationale = typeof body['rationale'] === 'string' ? body['rationale'] : '';

  if (!candidateId || !decision || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ ok: false, error: 'candidateId and decision (approve|reject) required' }, { status: 400, headers: gate.headers });
  }

  const tenantId = tenantIdFromGate(gate);
  try {
    const proposals = await getJson<TypologyCandidate[]>(storeKey(tenantId)) ?? [];
    const idx = proposals.findIndex((p) => p.candidateId === candidateId);
    if (idx < 0) return NextResponse.json({ ok: false, error: 'Candidate not found' }, { status: 404, headers: gate.headers });

    const candidate = proposals[idx]!;
    candidate.status = decision === 'approve' ? 'approved' : 'rejected';
    proposals[idx] = candidate;
    await setJson(storeKey(tenantId), proposals);

    void writeAuditChainEntry({
      event: decision === 'approve' ? 'typology.candidate_approved' : 'typology.candidate_rejected',
      actor: gate.keyId ?? 'system',
      payload: { candidateId, rationale, supportingCases: candidate.supportingCases },
    }, tenantId).catch((e: unknown) => console.warn('[emerging-typologies] audit write failed:', e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, candidateId, status: candidate.status }, { headers: gate.headers });
  } catch (err) {
    console.error('[emerging-typologies] POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Failed to process typology decision' }, { status: 500, headers: gate.headers });
  }
}
