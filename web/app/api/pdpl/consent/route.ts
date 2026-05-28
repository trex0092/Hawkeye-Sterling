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
import { writeAuditChainEntry } from '@/lib/server/audit-chain';
import { tenantIdFromGate } from '@/lib/server/tenant';

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LENGTH = 128;

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

function consentKey(tenantId: string, subjectId: string): string {
  return `pdpl/consent/${tenantId}/${subjectId}.json`;
}

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: gate.headers }); }

  const raw = (body ?? {}) as Record<string, unknown>;
  const subjectId = raw['subjectId'] as string | undefined;
  const subjectName = raw['subjectName'] as string | undefined;
  const lawfulBasis = raw['lawfulBasis'] as LawfulBasis | undefined;
  const purpose = raw['purpose'] as string | undefined;
  const recordedBy = raw['recordedBy'] as string | undefined;

  if (!subjectId?.trim() || !subjectName?.trim() || !lawfulBasis || !purpose?.trim() || !recordedBy?.trim()) {
    return NextResponse.json({ ok: false, error: 'subjectId, subjectName, lawfulBasis, purpose, recordedBy are required' }, { status: 400, headers: gate.headers });
  }
  const trimmedSubjectId = subjectId.trim();
  if (trimmedSubjectId.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(trimmedSubjectId)) {
    return NextResponse.json({ ok: false, error: 'subjectId must be alphanumeric/._-: and max 128 chars' }, { status: 400, headers: gate.headers });
  }

  const validBases: LawfulBasis[] = ['legitimate_interest_aml', 'legal_obligation', 'vital_interest', 'consent'];
  if (!validBases.includes(lawfulBasis)) {
    return NextResponse.json({ ok: false, error: `lawfulBasis must be one of: ${validBases.join(', ')}` }, { status: 400, headers: gate.headers });
  }

  const rawExpiresAt = (raw['expiresAt'] as string | undefined)?.trim();
  // PDPL Art.6(a): explicit consent must have a defined expiry date.
  if (lawfulBasis === 'consent') {
    if (!rawExpiresAt) {
      return NextResponse.json({ ok: false, error: 'expiresAt is required for lawfulBasis: consent (PDPL Art.6(a))' }, { status: 400, headers: gate.headers });
    }
    if (isNaN(Date.parse(rawExpiresAt)) || new Date(rawExpiresAt) <= new Date()) {
      return NextResponse.json({ ok: false, error: 'expiresAt must be a valid future ISO 8601 date' }, { status: 400, headers: gate.headers });
    }
  }

  const record: ConsentRecord = {
    subjectId: trimmedSubjectId,
    subjectName: subjectName.trim(),
    lawfulBasis,
    purpose: purpose.trim(),
    recordedAt: new Date().toISOString(),
    recordedBy: recordedBy.trim(),
    ...(rawExpiresAt ? { expiresAt: rawExpiresAt } : {}),
    legalReference: lawfulBasis === 'legal_obligation' || lawfulBasis === 'legitimate_interest_aml'
      ? 'UAE PDPL FDL 45/2021 Art.6; CBUAE AML/CFT Standards'
      : 'UAE PDPL FDL 45/2021 Art.6(a)',
  };

  await setJson(consentKey(tenantIdFromGate(gate), trimmedSubjectId), record);

  // PDPL Art.6 — recording of lawful basis for processing PII is a
  // compliance-significant event; must be on the tamper-evident chain.
  void writeAuditChainEntry(
    {
      event: 'pdpl.consent_recorded',
      actor: gate.keyId,
      subjectId: trimmedSubjectId,
      lawfulBasis,
      recordedBy: recordedBy.trim(),
      purpose: purpose.trim().slice(0, 256),
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn('[pdpl/consent] audit chain write failed:', err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
}

export async function GET(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const subjectId = req.nextUrl.searchParams.get('subjectId')?.trim();
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: 'subjectId query param required' }, { status: 400, headers: gate.headers });
  }
  if (subjectId.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(subjectId)) {
    return NextResponse.json({ ok: false, error: 'subjectId must be alphanumeric/._-: and max 128 chars' }, { status: 400, headers: gate.headers });
  }
  const record = await getJson<ConsentRecord>(consentKey(tenantIdFromGate(gate), subjectId));
  if (!record) {
    return NextResponse.json({ ok: false, error: 'No consent record found for this subject' }, { status: 404, headers: gate.headers });
  }
  const isExpired = record.expiresAt ? new Date(record.expiresAt) <= new Date() : false;
  return NextResponse.json({ ok: true, record, expired: isExpired }, { headers: gate.headers });
}
