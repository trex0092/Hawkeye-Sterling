// POST /api/subject-graph
//
// Screening-history entity cluster — links historical screenings of the same
// real-world entity across sessions, even when names differ (aliases, variants).
//
// Distinct from /api/entity-graph which resolves corporate UBO structures via
// OpenCorporates/GLEIF. This endpoint clusters screening *subjects* from the
// per-tenant subject-index in Netlify Blobs.
//
// Request:
//   { subject: ScreeningHistoryEntry, options?: { minScore?: number; maxLinked?: number } }
//
// Response:
//   { ok: true, cluster: EntityCluster }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { buildEntityCluster, indexSubject, type ScreeningHistoryEntry } from "@/lib/server/entity-graph";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { subject?: unknown; options?: { minScore?: number; maxLinked?: number } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = body.subject as ScreeningHistoryEntry | undefined;
  if (!subject?.subjectId || !subject?.name || !subject?.screenedAt) {
    return NextResponse.json(
      { ok: false, error: "subject.subjectId, subject.name, and subject.screenedAt are required" },
      { status: 422, headers: gate.headers },
    );
  }

  const tenantId = gate.record?.id ?? gate.keyId ?? "default";

  // Index the subject so future cluster queries can find it
  void indexSubject(tenantId, subject).catch(() => undefined);

  const cluster = await buildEntityCluster(tenantId, subject, body.options ?? {});

  void writeAuditChainEntry(tenantId, {
    event: "subject_graph.cluster_built",
    subjectId: subject.subjectId,
    subjectName: subject.name,
    linkedCount: cluster.totalLinked,
    minScore: body.options?.minScore ?? 0.6,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, cluster }, { headers: gate.headers });
}
