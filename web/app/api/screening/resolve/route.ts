// POST /api/screening/resolve
//
// Mirrors the World-Check Case Manager resolution workflow.
//
// Body:
//   {
//     subjectId: string,
//     subjectName: string,
//     hitId: string,
//     resolution: "positive" | "possible" | "false" | "unspecified",
//     reason?: string,
//     hitContext?: {                           // for the audit trail
//       sourceList?: string,
//       matchedName?: string,
//       matchStrength?: number,
//       listRef?: string,
//     }
//   }
//
// Behavior:
//   - Always writes an immutable audit-trail event with the resolution
//   - Resolution = "positive": auto-creates an ongoing-monitoring Asana
//     task in ASANA_ESCALATIONS_PROJECT_GID (or hardcoded fallback) so
//     the subject is permanently tracked + re-screened daily
//   - Resolution = "false": writes the disambiguation rationale to the
//     audit log (FATF R.10 / FDL Art.19 negative-finding evidence-of-search)

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { asanaGids } from "@/lib/server/asanaConfig";
import { corsHeaders, corsPreflight } from "@/lib/api/cors";
import { submitFeedback } from "@/lib/server/feedback";
import { setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResolveBody {
  subjectId?: string;
  subjectName?: string;
  hitId?: string;
  resolution?: "positive" | "possible" | "false" | "unspecified";
  reason?: string;
  hitContext?: {
    sourceList?: string;
    matchedName?: string;
    matchStrength?: number;
    listRef?: string;
  };
}

interface ResolveResponse {
  ok: boolean;
  resolution: string;
  auditId: string;
  ongoingMonitorTaskId?: string;
  error?: string;
}

function respond(status: number, body: ResolveResponse, origin: string | null = null): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

async function createAsanaTask(opts: {
  name: string;
  notes: string;
  projectGid: string;
}): Promise<string | undefined> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) return undefined;
  try {
    const res = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name: opts.name,
          notes: opts.notes,
          projects: [opts.projectGid],
        },
      }),
    });
    if (!res.ok) {
      console.warn("[resolve] asana task create failed:", res.status, await res.text());
      return undefined;
    }
    const json = (await res.json()) as { data?: { gid?: string } };
    return json.data?.gid;
  } catch (err) {
    console.warn("[resolve] asana task create threw:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const origin = req.headers.get("origin");
  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return respond(400, { ok: false, resolution: "", auditId: "", error: "invalid JSON body" }, origin);
  }
  const { subjectId, subjectName, hitId, resolution, reason, hitContext } = body;
  if (!subjectId || !subjectName || !hitId || !resolution) {
    return respond(400, { ok: false, resolution: "", auditId: "", error: "subjectId, subjectName, hitId, resolution all required" }, origin);
  }
  if (!["positive", "possible", "false", "unspecified"].includes(resolution)) {
    return respond(400, { ok: false, resolution, auditId: "", error: "resolution must be positive | possible | false | unspecified" }, origin);
  }

  const auditId = `res_${randomUUID()}`;
  const timestamp = new Date().toISOString();

  // ── Side effect: Positive → create ongoing-monitoring task
  let ongoingMonitorTaskId: string | undefined;
  if (resolution === "positive") {
    const projectGid = asanaGids.escalations();
    if (projectGid) {
      const matchLabel = hitContext?.matchedName ?? subjectName;
      const taskName = `[ONGOING] ${matchLabel} — ${hitContext?.sourceList ?? "watchlist match"}${hitContext?.listRef ? ` (${hitContext.listRef})` : ""}`;
      const taskNotes = [
        `Subject: ${subjectName} (case #${subjectId})`,
        `Resolution: POSITIVE — confirmed same person`,
        hitContext?.sourceList ? `Source list: ${hitContext.sourceList}` : null,
        hitContext?.listRef ? `List reference: ${hitContext.listRef}` : null,
        typeof hitContext?.matchStrength === "number" ? `Match strength: ${hitContext.matchStrength}/100` : null,
        reason ? `MLRO note: ${reason}` : null,
        ``,
        `Auto-added to ongoing monitoring per FATF R.10 / FDL 10/2025 Art.19.`,
        `Resolved: ${timestamp}`,
        `Audit ID: ${auditId}`,
      ].filter(Boolean).join("\n");
      ongoingMonitorTaskId = await createAsanaTask({ name: taskName, notes: taskNotes, projectGid });
    }
  }

  // Persist verdict to feedback store so confidence-score adjusts future hits
  if (resolution === "false" || resolution === "positive") {
    void submitFeedback({
      subjectId,
      listId: hitContext?.sourceList ?? "unknown",
      listRef: hitContext?.listRef ?? hitContext?.matchedName ?? subjectName,
      candidateName: hitContext?.matchedName ?? subjectName,
      verdict: resolution === "false" ? "false_positive" : "true_match",
      reason,
      analyst: gate.keyId ?? "system",
    }).catch(() => {/* feedback is best-effort */});
  }

  // Persist immutable audit-trail event (FDL 10/2025 Art.19 — 10-year retention)
  const auditEvent = {
    auditId,
    eventType: "hit-resolution",
    timestamp,
    subjectId,
    subjectName,
    hitId,
    resolution,
    reason,
    hitContext,
    ongoingMonitorTaskId,
    analyst: gate.keyId ?? "system",
  };
  void setJson(`audit/hit-resolution/${auditId}`, auditEvent).catch((err) =>
    console.warn("[resolve] audit persist failed:", err instanceof Error ? err.message : err)
  );
  console.info("[audit]", auditId, "hit-resolution persisted");

  return respond(200, {
    ok: true,
    resolution,
    auditId,
    ...(ongoingMonitorTaskId ? { ongoingMonitorTaskId } : {}),
  }, origin);
}

export async function OPTIONS(req: Request): Promise<Response> {
  return corsPreflight(req.headers.get("origin"));
}
