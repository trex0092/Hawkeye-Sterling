// Hawkeye Sterling — PDPL Article 17 right-to-erasure (right to be forgotten).
// POST /api/pdpl/erasure — Submit an erasure request
// GET  /api/pdpl/erasure?requestId=<id> — Check erasure request status
//
// Note: AML records subject to Federal Decree-Law No. 10 of 2025 Art.20 10-year retention CANNOT
// be erased. Erasure is limited to non-AML PII fields within discretionary
// data stores.
//
// Auth: API key required (enforce). Erasure requests contain PII (subjectName)
// and must not be submitted or read by unauthenticated callers.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextRequest, NextResponse } from 'next/server';
import { getJson, setJson, del, listKeys } from '@/lib/server/store';
import { randomBytes } from 'node:crypto';
import { enforce } from '@/lib/server/enforce';
import { adminAuth } from '@/lib/server/admin-auth';
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
function safeRequestId(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t.length > 256 || !SAFE_ID_RE.test(t)) return null;
  return t;
}

export type ErasureStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface ErasureRequest {
  requestId: string;
  subjectId: string;
  subjectName: string;
  requestedAt: string;
  requestedBy: string;
  grounds: string;
  status: ErasureStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  amlExemptionApplied: boolean;
  amlExemptionBasis?: string;
}

function erasureKey(tenantId: string, requestId: string): string {
  return `pdpl/erasure/${tenantId}/${requestId}.json`;
}

// Admin key used by PATCH (adminAuth) where tenantId is not available from gate.
// Stores a cross-tenant pointer so admin can locate the full record via tenantId.
function erasureAdminKey(requestId: string): string {
  return `pdpl/erasure-admin/${requestId}.json`;
}

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const raw = (body ?? {}) as Record<string, unknown>;
  const subjectId = raw['subjectId'] as string | undefined;
  const subjectName = raw['subjectName'] as string | undefined;
  const requestedBy = raw['requestedBy'] as string | undefined;
  const grounds = raw['grounds'] as string | undefined;

  if (!subjectId?.trim() || !subjectName?.trim() || !requestedBy?.trim() || !grounds?.trim()) {
    return NextResponse.json({ ok: false, error: 'subjectId, subjectName, requestedBy, grounds are required' }, { status: 400, headers: gate.headers });
  }

  const requestId = `era_${randomBytes(6).toString('hex')}`;
  const request: ErasureRequest = {
    requestId,
    subjectId,
    subjectName,
    requestedAt: new Date().toISOString(),
    requestedBy,
    grounds,
    status: 'pending',
    amlExemptionApplied: true,
    amlExemptionBasis: 'Federal Decree-Law No. 10 of 2025 Art.20 — AML records are exempt from erasure for 10-year mandatory retention period. Non-AML discretionary data will be reviewed for erasure.',
  };

  const tenantId = tenantIdFromGate(gate);
  await setJson(erasureKey(tenantId, requestId), request);
  // Write an admin-accessible pointer so the PATCH handler (adminAuth) can locate the record.
  await setJson(erasureAdminKey(requestId), { tenantId, requestId });

  // PDPL Art.17 right-to-erasure requests are legally significant events —
  // must be on the tamper-evident chain for regulatory accountability.
  void writeAuditChainEntry(
    {
      event: 'pdpl.erasure_request_submitted',
      actor: gate.keyId,
      requestId,
      subjectId,
      requestedBy,
      grounds: grounds.slice(0, 256),
    },
    tenantId,
  ).catch((err) =>
    console.warn('[pdpl/erasure] audit chain write failed:', err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({
    ok: true,
    requestId,
    request,
    notice: 'Erasure request logged. AML records are subject to 10-year mandatory retention (Federal Decree-Law No. 10 of 2025 Art.20) and cannot be erased. Non-AML discretionary PII will be reviewed within 30 days per PDPL Art.17.',
  }, { status: 202, headers: gate.headers });
}

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const requestId = safeRequestId(req.nextUrl.searchParams.get('requestId'));
  if (!requestId) return NextResponse.json({ ok: false, error: 'requestId query param required and must be alphanumeric' }, { status: 400, headers: gate.headers });
  const request = await getJson<ErasureRequest>(erasureKey(tenantIdFromGate(gate), requestId));
  if (!request) return NextResponse.json({ ok: false, error: 'Erasure request not found' }, { status: 404, headers: gate.headers });
  return NextResponse.json({ ok: true, request }, { headers: gate.headers });
}

// PATCH /api/pdpl/erasure — Admin: approve/reject and execute erasure of
// non-AML discretionary data. AML records (cases, SAR, audit-trail, ongoing
// subjects, str-cases) are exempt from erasure per Federal Decree-Law No. 10 of 2025 Art.20.
export async function PATCH(req: NextRequest) {
  const deny = adminAuth(req);
  if (deny) return deny;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const raw = (body ?? {}) as Record<string, unknown>;
  const requestId = safeRequestId((raw['requestId'] as string | undefined)?.trim());
  const decision = raw['decision'] as string | undefined;
  const reviewedBy = (raw['reviewedBy'] as string | undefined)?.trim();
  const reviewNotes = (raw['reviewNotes'] as string | undefined)?.trim();

  if (!requestId || !decision || !reviewedBy) {
    return NextResponse.json({ ok: false, error: 'requestId (alphanumeric), decision, reviewedBy are required' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ ok: false, error: 'decision must be approved or rejected' }, { status: 400 });
  }

  // Resolve tenantId via the admin pointer written during POST.
  const adminPointer = await getJson<{ tenantId: string; requestId: string }>(erasureAdminKey(requestId));
  if (!adminPointer) return NextResponse.json({ ok: false, error: 'Erasure request not found' }, { status: 404 });
  const erasureTenantId = adminPointer.tenantId;
  const request = await getJson<ErasureRequest>(erasureKey(erasureTenantId, requestId));
  if (!request) return NextResponse.json({ ok: false, error: 'Erasure request not found' }, { status: 404 });
  if (request.status !== 'pending') {
    return NextResponse.json({ ok: false, error: `Erasure request is already ${request.status}` }, { status: 409 });
  }

  const erasedKeys: string[] = [];
  if (decision === 'approved') {
    // Erase non-AML discretionary PII for this subject.
    // AML-exempt prefixes (Federal Decree-Law No. 10 of 2025 Art.20 10-year retention):
    //   ongoing/subject/, cases/, str-cases/, sar/, audit-trail/, pkyc/subject/
    const discretionaryPrefixes = [
      `pdpl/consent/${erasureTenantId}/${request.subjectId}`,
      `feedback/${request.subjectId}`,
      `corrections/${request.subjectId}`,
      `screening-history/${request.subjectId}`,
    ];
    for (const prefix of discretionaryPrefixes) {
      const keys = await listKeys(prefix).catch(() => [] as string[]);
      for (const key of keys) {
        const deleted = await del(key).then(() => true).catch((err: unknown) => {
          console.warn("[pdpl/erasure] key deletion failed:", key, err instanceof Error ? err.message : String(err));
          return false;
        });
        if (deleted) erasedKeys.push(key);
      }
    }
  }

  const updated: ErasureRequest = {
    ...request,
    status: decision === 'approved' ? 'completed' : 'rejected',
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    reviewNotes,
  };
  await setJson(erasureKey(erasureTenantId, requestId), updated);

  // PDPL Art.17 erasure decision (approve/reject) must be on the
  // tamper-evident chain — this is a legally binding admin action.
  void writeAuditChainEntry(
    {
      event: 'pdpl.erasure_decision',
      actor: reviewedBy,
      requestId,
      subjectId: request.subjectId,
      decision,
      erasedKeyCount: erasedKeys.length,
    },
    'admin',
  ).catch((err) =>
    console.warn('[pdpl/erasure] audit chain write failed:', err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({
    ok: true,
    request: updated,
    erasedKeys: decision === 'approved' ? erasedKeys : [],
    notice: decision === 'approved'
      ? `Discretionary non-AML PII erased (${erasedKeys.length} record(s)). AML records retained per Federal Decree-Law No. 10 of 2025 Art.20.`
      : 'Erasure request rejected. No data was deleted.',
  });
}
