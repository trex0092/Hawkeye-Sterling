import { NextResponse } from "next/server";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GDPR Article 15 — Right of access. The platform persists three classes
// of tenant-linked data: enrolled subjects (ongoing/subject/*), ongoing
// screening snapshots (ongoing/last/*) and analyst feedback (feedback/*).
// This endpoint returns all records whose subjectId / id / email matches
// the supplied identifier.

interface ExportRequest {
  subjectId?: string;
  email?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ExportRequest;
  try {
    body = (await req.json()) as ExportRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const subjectId = body.subjectId?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!subjectId && !email) {
    return NextResponse.json(
      { ok: false, error: "subjectId or email required" },
      { status: 400 },
    );
  }
  const prefixes = [
    "ongoing/subject/",
    "ongoing/last/",
    "feedback/",
    "corrections/",
  ];
  const output: Record<string, unknown[]> = {};
  for (const p of prefixes) {
    const keys = await listKeys(p);
    const bucket: unknown[] = [];
    for (const k of keys) {
      const rec = await getJson<Record<string, unknown>>(k);
      if (!rec) continue;
      const idField = rec["id"];
      const emailField = rec["requesterEmail"] ?? rec["email"];
      const subjectField = rec["subjectId"] ?? rec["id"];
      const matches =
        (subjectId !== undefined &&
          (String(idField) === subjectId || String(subjectField) === subjectId)) ||
        (email !== undefined &&
          typeof emailField === "string" &&
          emailField.toLowerCase() === email);
      if (matches) bucket.push(rec);
    }
    output[p] = bucket;
  }
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    identifier: subjectId ? { subjectId } : { email },
    regulation: "GDPR Art. 15",
    data: output,
  });
}
