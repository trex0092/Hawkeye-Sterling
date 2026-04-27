import { NextResponse } from "next/server";
import { del, getJson, listKeys } from "@/lib/server/store";
import { adminAuth } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GDPR Article 17 — Right to erasure. Deletes all records whose
// subjectId / id / email field matches the supplied identifier. Does
// NOT delete audit-chain anchors (Art. 17(3)(b) exemption — legal
// obligation for AML record retention).
//
// Auth: ADMIN_TOKEN required (fail-closed). Mass-delete is too
// dangerous to expose to anonymous or API-key callers.

interface DeleteRequest {
  subjectId?: string;
  email?: string;
  dryRun?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  let body: DeleteRequest;
  try {
    body = (await req.json()) as DeleteRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 },
    );
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
  const deleted: string[] = [];
  for (const p of prefixes) {
    const keys = await listKeys(p);
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
      if (matches) {
        if (!body.dryRun) await del(k);
        deleted.push(k);
      }
    }
  }
  return NextResponse.json({
    ok: true,
    regulation: "GDPR Art. 17",
    dryRun: Boolean(body.dryRun),
    deletedCount: deleted.length,
    deletedKeys: deleted,
    retained: {
      reason:
        "Audit-chain anchors retained under GDPR Art. 17(3)(b) — legal obligation (AML record retention).",
    },
  });
}
