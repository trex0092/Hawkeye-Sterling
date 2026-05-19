// Hawkeye Sterling — PDPL Article 6 consent / lawful basis tracking.
// POST /api/pdpl/consent — Record lawful basis for processing a subject's PII
// GET  /api/pdpl/consent?subjectId=<id> — Retrieve consent record
//
// Auth: API key required (enforce). Consent records contain PII (subjectName)
// and lawful-basis claims are compliance-critical — unauthenticated writes
// would allow fabrication of false processing justifications.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextRequest, NextResponse } from 'next/server';
import { getJson, setJson } from '@/lib/server/store';
import { enforce } from '@/lib/server/enforce';

export type LawfulBasis =
  | 'legitimate_interest_aml'     // PDPL Art.6(c) — AML/CFT legal obligation
  | 'legal_obligation'            // PDPL Art.6(b) — statutory requirement
  | 'vital_interest'              // PDPL Art.6(d)
  | 'consent';                    // PDPL Art.6(a) — explicit consent

export interface ConsentRecord {
  subjectId: string;
  subjectName: string;
  lawfulBasis: LawfulBasis;
  purpose: string;
  recordedAt: string;
  recordedBy: string;
  expiresAt?: string;
  legalReference: string;
}

function consentKey(subjectId: string): string {
  return `pdpl/consent/${subjectId}.json`;
}

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const raw = (body ?? {}) as Record<string, unknown>;
  const subjectId = raw['subjectId'] as string | undefined;
  const subjectName = raw['subjectName'] as string | undefined;
  const lawfulBasis = raw['lawfulBasis'] as LawfulBasis | undefined;
  const purpose = raw['purpose'] as string | undefined;
  const recordedBy = raw['recordedBy'] as string | undefined;

  if (!subjectId?.trim() || !subjectName?.trim() || !lawfulBasis || !purpose?.trim() || !recordedBy?.trim()) {
    return NextResponse.json({ error: 'subjectId, subjectName, lawfulBasis, purpose, recordedBy are required' }, { status: 400 });
  }

  const validBases: LawfulBasis[] = ['legitimate_interest_aml', 'legal_obligation', 'vital_interest', 'consent'];
  if (!validBases.includes(lawfulBasis)) {
    return NextResponse.json({ error: `lawfulBasis must be one of: ${validBases.join(', ')}` }, { status: 400 });
  }

  const record: ConsentRecord = {
    subjectId,
    subjectName,
    lawfulBasis,
    purpose,
    recordedAt: new Date().toISOString(),
    recordedBy,
    legalReference: lawfulBasis === 'legal_obligation' || lawfulBasis === 'legitimate_interest_aml'
      ? 'UAE PDPL FDL 45/2021 Art.6; CBUAE AML/CFT Standards'
      : 'UAE PDPL FDL 45/2021 Art.6(a)',
  };

  await setJson(consentKey(subjectId), record);
  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
}

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const subjectId = req.nextUrl.searchParams.get('subjectId');
  if (!subjectId?.trim()) {
    return NextResponse.json({ error: 'subjectId query param required' }, { status: 400 });
  }
  const record = await getJson<ConsentRecord>(consentKey(subjectId));
  if (!record) {
    return NextResponse.json({ error: 'No consent record found for this subject' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
}
