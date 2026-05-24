// POST /api/gdpr/retention-sweep
//
// GDPR Article 5(1)(e) — Storage limitation / data minimisation.
//
// Identifies subject profiles that have:
//   - openedAt / createdAt older than retentionYears (default 7)
//   - status "cleared" (no ongoing AML obligation)
//
// Marks matching profiles with pendingRetentionDeletion: true so a
// downstream scheduled job (or a manual MLRO action) can hard-delete them
// after a grace-period review. This two-phase approach avoids accidental
// erasure while still satisfying the data-minimisation duty.
//
// Auth: API key or portal admin required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { listSubjects, patchSubject } from "@/lib/server/subject-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_RETENTION_YEARS = 7;

interface SweepBody {
  retentionYears?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: SweepBody = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text) as SweepBody;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  const retentionYears =
    typeof body.retentionYears === "number" && body.retentionYears > 0
      ? body.retentionYears
      : DEFAULT_RETENTION_YEARS;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
  const cutoffMs = cutoff.getTime();

  const subjects = await listSubjects(tenant);

  const eligible = subjects.filter((s) => {
    if (s.currentRiskCategory !== "LOW") {
      // Only clear/low-risk subjects with no ongoing obligations qualify.
      // "cleared" in SubjectProfile maps to riskCategory LOW + no active case.
      // Treat absence of activeCaseId and LOW risk as "cleared" for sweep purposes.
    }
    // Use createdAt as the age anchor (openedAt on Subject maps to createdAt here).
    const ageMs = new Date(s.createdAt).getTime();
    const isOld = ageMs < cutoffMs;
    // "Cleared" means no active case and LOW risk category.
    const isCleared =
      !s.activeCaseId && s.currentRiskCategory === "LOW" && !s.hasStrSarOnRecord;
    return isOld && isCleared;
  });

  const at = new Date().toISOString();
  let sweptCount = 0;

  await Promise.allSettled(
    eligible.map(async (s) => {
      const patched = await patchSubject(tenant, s.subjectId, {
        pendingRetentionDeletion: true,
        pendingRetentionDeletionAt: at,
      } as Partial<typeof s>, "retention-sweep");
      if (patched) sweptCount++;
    }),
  );

  void writeAuditChainEntry(
    {
      event: "gdpr_retention_sweep",
      actor: gate.keyId,
      retentionYears,
      cutoffDate: cutoff.toISOString(),
      sweptCount,
    },
    tenant,
  ).catch((err: unknown) =>
    console.warn(
      "[gdpr/retention-sweep] audit chain write failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      sweptCount,
      retentionYears,
      at,
    },
    { status: 200, headers: gate.headers },
  );
}
