// Hawkeye Sterling — Senzing entity format export endpoint.
// POST /api/senzing-export
// Body: { subjects: Array<{ id: string, name: string, entityType?, dateOfBirth?, ... }> }
// Returns Senzing G2 JSONL for bulk entity resolution import.
//
// Auth: API key required (enforce). Subject PII (DOB, addresses, aliases) must
// not be exportable by unauthenticated callers.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { buildSenzingExport, toSenzingJsonl, type HawkeyeSubject } from '../../../../src/integrations/senzing-export';
import { enforce } from '@/lib/server/enforce';

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400, headers: gate.headers });
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw['subjects']) || raw['subjects'].length === 0) {
    return NextResponse.json({ ok: false, error: 'subjects array required' }, { status: 400, headers: gate.headers });
  }

  const subjects = (raw['subjects'] as Array<{ id?: string; name?: string } & HawkeyeSubject>)
    .filter((s) => typeof s.name === 'string' && s.name.trim())
    .map((s, i) => ({
      id: (typeof s.id === 'string' && s.id) ? s.id : `subject_${i + 1}`,
      subject: s as HawkeyeSubject,
    }));

  if (subjects.length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid subjects with name field' }, { status: 400, headers: gate.headers });
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'jsonl';
  const batch = buildSenzingExport(subjects);

  if (format === 'json') {
    return NextResponse.json(batch, { headers: gate.headers });
  }

  // Default: JSONL
  const jsonl = toSenzingJsonl(batch);
  return new NextResponse(jsonl, {
    headers: {
      ...gate.headers,
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="hawkeye-senzing-export.jsonl"',
    },
  });
}
