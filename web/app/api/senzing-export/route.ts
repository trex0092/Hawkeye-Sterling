// Hawkeye Sterling — Senzing entity format export endpoint.
// POST /api/senzing-export
// Body: { subjects: Array<{ id: string, name: string, entityType?, dateOfBirth?, ... }> }
// Returns Senzing G2 JSONL for bulk entity resolution import.

import { NextRequest, NextResponse } from 'next/server';
import { buildSenzingExport, toSenzingJsonl, type HawkeyeSubject } from '../../../../src/integrations/senzing-export';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw['subjects']) || raw['subjects'].length === 0) {
    return NextResponse.json({ error: 'subjects array required' }, { status: 400 });
  }

  const subjects = (raw['subjects'] as Array<{ id?: string; name?: string } & HawkeyeSubject>)
    .filter((s) => typeof s.name === 'string' && s.name.trim())
    .map((s, i) => ({
      id: (typeof s.id === 'string' && s.id) ? s.id : `subject_${i + 1}`,
      subject: s as HawkeyeSubject,
    }));

  if (subjects.length === 0) {
    return NextResponse.json({ error: 'No valid subjects with name field' }, { status: 400 });
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'jsonl';
  const batch = buildSenzingExport(subjects);

  if (format === 'json') {
    return NextResponse.json(batch);
  }

  // Default: JSONL
  const jsonl = toSenzingJsonl(batch);
  return new NextResponse(jsonl, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="hawkeye-senzing-export.jsonl"',
    },
  });
}
