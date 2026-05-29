// GET /api/forensic/case/[subjectId]
//
// Forensic case-bundle export. Returns a chain-of-custody-signed
// JSON document containing every artefact related to one screening
// subject, suitable for forwarding to an FIU / regulator / FATF
// reviewer. The bundle is sha256-hashed and HMAC-signed (when
// AUDIT_CHAIN_SECRET is configured) so the recipient can verify
// provenance offline.
//
// See web/lib/server/forensic-bundle.ts for the bundle schema and
// verification math.

import { NextResponse } from 'next/server';
import { enforce } from '@/lib/server/enforce';
import { getJson, listKeys } from '@/lib/server/store';
import {
  buildForensicBundle,
  type ForensicBundlePayload,
} from '@/lib/server/forensic-bundle';
import { getRequestId, withRequestIdHeader } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: { role: string; name?: string };
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

interface FourEyesItem {
  id: string;
  subjectId: string;
  subjectName: string;
  action: string;
  initiatedBy: string;
  initiatedAt: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  reason?: string;
  rejectionReason?: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> },
): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const rid = getRequestId(req);
  const { subjectId } = await params;
  if (!subjectId || subjectId.length > 128 || !/^[a-zA-Z0-9_\-:.]+$/.test(subjectId)) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error: 'invalid_subject_id',
        hint: 'subjectId must be 1-128 chars of [a-zA-Z0-9_-:.]',
        requestId: rid,
        generatedAt: new Date().toISOString(),
      },
      { status: 400, headers: { ...gate.headers, ...withRequestIdHeader(rid) } },
    );
  }

  try {
    // Pull every artefact for this subject in parallel. Each get is
    // independent so failures are isolated.
    const [profile, latestSnapshot, adverseMediaSeen, allAuditKeys, allFourEyesKeys] =
      await Promise.all([
        getJson<unknown>(`profile/${subjectId}`),
        getJson<unknown>(`ongoing/last/${subjectId}`),
        getJson<unknown>(`ongoing/adverse-seen/${subjectId}`),
        listKeys('audit/entry/'),
        listKeys('four-eyes/'),
      ]);

    // Filter audit chain to entries targeting this subject. Keep the
    // verification-friendly fields untouched so the recipient can
    // re-verify the chain against /api/audit/verify.
    const auditEntries: AuditEntry[] = [];
    for (const key of allAuditKeys.sort()) {
      const e = await getJson<AuditEntry>(key);
      if (e && e.target === subjectId) auditEntries.push(e);
    }

    // Filter four-eyes items.
    const fourEyesItems: FourEyesItem[] = [];
    for (const key of allFourEyesKeys) {
      const f = await getJson<FourEyesItem>(key);
      if (f && f.subjectId === subjectId) fourEyesItems.push(f);
    }

    const payload: ForensicBundlePayload = {
      subjectId,
      profile: profile ?? null,
      latestSnapshot: latestSnapshot ?? null,
      adverseMediaSeen: adverseMediaSeen ?? null,
      auditEntries,
      fourEyesItems,
    };

    // gate.keyId identifies the principal that authenticated the
    // request (api-key id, JWT sub, or `portal_admin` for same-origin
    // admin bypass). Pinning generatedBy means the bundle's
    // chain-of-custody includes the operator identity.
    const generatedBy = gate.keyId;
    const signingSecret = process.env['AUDIT_CHAIN_SECRET'];
    const bundle = buildForensicBundle(subjectId, payload, generatedBy, signingSecret);

    return NextResponse.json(
      {
        ok: true,
        requestId: rid,
        generatedAt: bundle.generatedAt,
        bundle,
      },
      {
        headers: {
          ...gate.headers,
          ...withRequestIdHeader(rid),
          // Make the bundle downloadable as a regulator-friendly filename.
          'content-disposition': `attachment; filename="hawkeye-case-${subjectId}-${bundle.generatedAt.replace(/[:.]/g, '-')}.json"`,
        },
      },
    );
  } catch (err) {
    console.error("[forensic/case] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to assemble forensic bundle", requestId: rid },
      { status: 500, headers: { ...gate.headers, ...withRequestIdHeader(rid) } },
    );
  }
}
