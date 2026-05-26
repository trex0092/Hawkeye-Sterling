import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';
import { getJson, setJson } from '@/lib/server/store';
import {
  computeThresholdProposals,
  applyApprovedProposal,
  type ThresholdProposal,
} from '../../../../src/brain/fp-self-optimizer.js';
import type { OutcomeRecord } from '../../../../src/brain/outcome-feedback.js';

export const maxDuration = 10;

const proposalsKey = (t: string) => `hs-fp-proposals/${t}/proposals.json`;
const weightsKey = (t: string) => `hs-fp-proposals/${t}/weights.json`;
const journalKey = (t: string) => `hs-feedback-journal/${t}/journal.json`;

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  const tenantId = tenantIdFromGate(gate);
  const [journal, currentWeights] = await Promise.all([
    getJson<OutcomeRecord[]>(journalKey(tenantId)).then((j) => j ?? []),
    getJson<Record<string, number>>(weightsKey(tenantId)).then((w) => w ?? {}),
  ]);

  const proposals = computeThresholdProposals(journal, currentWeights);
  const stored = await getJson<ThresholdProposal[]>(proposalsKey(tenantId)) ?? [];

  // Merge: new proposals that aren't already stored pending
  const existingIds = new Set(stored.map((p) => p.modeId + p.proposedAt));
  const toAdd = proposals.filter((p) => !existingIds.has(p.modeId + p.proposedAt));
  const merged = [...stored, ...toAdd];
  if (toAdd.length > 0) await setJson(proposalsKey(tenantId), merged);

  return NextResponse.json({ ok: true, proposals: merged.filter((p) => p.status === 'pending_mlro_approval'), currentWeights });
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const proposalId = typeof body['proposalId'] === 'string' ? body['proposalId'] : null;
  const decision = body['decision'] as 'approve' | 'reject' | undefined;
  const rationale = typeof body['rationale'] === 'string' ? body['rationale'] : '';

  if (!proposalId || !decision || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'proposalId and decision required' }, { status: 400 });
  }

  const tenantId = tenantIdFromGate(gate);
  const [stored, currentWeights] = await Promise.all([
    getJson<ThresholdProposal[]>(proposalsKey(tenantId)).then((p) => p ?? []),
    getJson<Record<string, number>>(weightsKey(tenantId)).then((w) => w ?? {}),
  ]);

  const idx = stored.findIndex((p) => p.proposalId === proposalId);
  if (idx < 0) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const proposal = stored[idx]!;
  proposal.status = decision === 'approve' ? 'approved' : 'rejected';
  stored[idx] = proposal;

  let newWeights = currentWeights;
  if (decision === 'approve') {
    newWeights = applyApprovedProposal(proposal, currentWeights);
    await setJson(weightsKey(tenantId), newWeights);
  }
  await setJson(proposalsKey(tenantId), stored);

  await writeAuditChainEntry({
    tenantId,
    event: decision === 'approve' ? 'ai.threshold_proposal_approved' : 'ai.threshold_proposal_rejected',
    actor: gate.sub ?? 'system',
    payload: {
      proposalId,
      modeId: proposal.modeId,
      fromThreshold: proposal.currentThreshold,
      toThreshold: decision === 'approve' ? proposal.proposedThreshold : proposal.currentThreshold,
      rationale,
      fpRateObserved: proposal.fpRateObserved,
    },
  });

  return NextResponse.json({ ok: true, proposalId, status: proposal.status, newWeights });
}
