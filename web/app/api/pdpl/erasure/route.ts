// Hawkeye Sterling — PDPL Article 17 right-to-erasure (right to be forgotten).
// POST /api/pdpl/erasure — Submit an erasure request
// GET  /api/pdpl/erasure?requestId=<id> — Check erasure request status
//
// Note: AML records subject to FDL 10/2025 Art.20 10-year retention CANNOT
// be erased. Erasure is limited to non-AML PII fields within discretionary
// data stores.

import { NextRequest, NextResponse } from 'next/server';
import { getJson, setJson } from '@/lib/server/store';
import { randomBytes } from 'crypto';

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

function erasureKey(requestId: string): string {
  return `pdpl/erasure/${requestId}.json`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const raw = (body ?? {}) as Record<string, unknown>;
  const subjectId = raw['subjectId'] as string | undefined;
  const subjectName = raw['subjectName'] as string | undefined;
  const requestedBy = raw['requestedBy'] as string | undefined;
  const grounds = raw['grounds'] as string | undefined;

  if (!subjectId?.trim() || !subjectName?.trim() || !requestedBy?.trim() || !grounds?.trim()) {
    return NextResponse.json({ error: 'subjectId, subjectName, requestedBy, grounds are required' }, { status: 400 });
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
    amlExemptionBasis: 'FDL 10/2025 Art.20 — AML records are exempt from erasure for 10-year mandatory retention period. Non-AML discretionary data will be reviewed for erasure.',
  };

  await setJson(erasureKey(requestId), request);

  return NextResponse.json({
    ok: true,
    requestId,
    request,
    notice: 'Erasure request logged. AML records are subject to 10-year mandatory retention (FDL 10/2025 Art.20) and cannot be erased. Non-AML discretionary PII will be reviewed within 30 days per PDPL Art.17.',
  }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get('requestId');
  if (!requestId?.trim()) return NextResponse.json({ error: 'requestId query param required' }, { status: 400 });
  const request = await getJson<ErasureRequest>(erasureKey(requestId));
  if (!request) return NextResponse.json({ error: 'Erasure request not found' }, { status: 404 });
  return NextResponse.json({ ok: true, request });
}
