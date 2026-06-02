// Shared post-screen handler for screening/run.
//
// Executes all fire-and-forget side-effects after a screening result is
// produced. Extracted from screening/run/route.ts to eliminate the
// identical duplicated blocks that existed at lines 317–373 and 386–443.
//
// Handles:
//   1. Compliance case auto-creation (hits only)
//   2. UAE stale-list re-screen queue entry
//   3. pKYC auto-enrollment (medium+ severity — matches quick-screen parity)
//   4. Bias monitor recording (with per-list source data)
//
// All operations are fire-and-forget. Failures are logged but never surface
// to the caller.

import { recordScreeningBias } from "./bias-monitor";
import type { QuickScreenSubject } from "@/lib/api/quickScreen.types";
import type { QuickScreenResult } from "@/lib/api/quickScreen.types";

export interface PostScreenContext {
  subject:    QuickScreenSubject;
  result:     QuickScreenResult;
  resultId:   string;
  tenantId:   string;
  actorKeyId: string;
  uaeStale:   boolean;
}

export function handlePostScreenResult(ctx: PostScreenContext): void {
  const { subject, result, resultId, tenantId, actorKeyId, uaeStale } = ctx;
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  // ── 1. Auto-create compliance case ─────────────────────────────────────────
  if (result.hits.length > 0) {
    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/hs-cases`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
          },
          body: JSON.stringify({
            subjectName:      subject.name,
            subjectId:        resultId,
            severity:         result.severity,
            hits: result.hits.map((h) => ({
              listId:        h.listId,
              listRef:       h.listRef,
              candidateName: h.candidateName,
              matchScore:    h.score,
            })),
            linkedAuditSeq: undefined,
            createdBy:      actorKeyId,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn("[post-screen] auto-case creation failed:", res.status, body.slice(0, 200));
          return;
        }
        const caseData = await res.json().catch(() => ({})) as {
          ok: boolean;
          case?: { caseId: string };
          deduplicated?: boolean;
        };
        if (caseData.ok && caseData.case?.caseId && !caseData.deduplicated) {
          void fetch(`${baseUrl}/api/hs-cases/${caseData.case.caseId}/enrich`, {
            method: "POST",
            headers: { "x-api-key": process.env["ADMIN_TOKEN"] ?? "" },
          }).catch((e: unknown) => {
            console.warn("[post-screen] auto-enrich failed:", e instanceof Error ? e.message : String(e));
          });
        }
        // ── 2. UAE stale-list re-screen queue ─────────────────────────────────
        if (uaeStale) {
          void fetch(`${baseUrl}/api/rescreen-queue`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": process.env["ADMIN_TOKEN"] ?? "",
            },
            body: JSON.stringify({
              subjectId:   resultId,
              subjectName: subject.name,
              reason: "Screened while UAE EOCN or LTL list was stale (>36h). Re-screen required after refresh.",
            }),
          }).catch(() => undefined);
        }
      } catch (err) {
        console.warn("[post-screen] auto-case error:", err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // ── 3. pKYC auto-enrollment (mirrors quick-screen logic) ───────────────────
  if (["medium", "high", "critical"].includes(result.severity)) {
    void (async () => {
      try {
        const { saveSubject, getSubject } = await import("../../app/api/pkyc/_store");
        const pkycId = `pkyc-auto-${subject.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`;
        const existing = await getSubject(pkycId, tenantId);
        if (!existing) {
          const cadence =
            result.severity === "critical" ? "weekly" :
            result.severity === "high"     ? "monthly" : "quarterly";
          const now     = new Date().toISOString();
          const nextRun = new Date(now);
          if      (cadence === "weekly")  nextRun.setUTCDate(nextRun.getUTCDate() + 7);
          else if (cadence === "monthly") nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
          else                            nextRun.setUTCMonth(nextRun.getUTCMonth() + 3);
          await saveSubject({
            id:           pkycId,
            name:         subject.name,
            entityType:   subject.entityType,
            jurisdiction: subject.jurisdiction,
            nationality:  subject.nationality,
            dob:          subject.dateOfBirth,
            aliases:      subject.aliases,
            cadence,
            status:       "active",
            enrolledAt:   now,
            lastRunAt:    null,
            nextRunAt:    nextRun.toISOString(),
            lastBand:     null,
            lastComposite: null,
            lastHits:     result.hits.length,
            runCount:     0,
            alertCount:   0,
            notes: `Auto-enrolled from screening/run: ${result.severity} severity`,
          }, tenantId);
        }
      } catch (err) {
        console.warn("[post-screen] pkyc auto-enroll failed:", err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // ── 4. Bias monitor (fire-and-forget, per-list source tracking) ────────────
  const hitListIds = result.hits.map((h) => h.listId);
  void recordScreeningBias(
    tenantId,
    subject.name,
    result.topScore,
    result.severity,
    result.hits.length,
    hitListIds,
  ).catch(() => undefined);
}
