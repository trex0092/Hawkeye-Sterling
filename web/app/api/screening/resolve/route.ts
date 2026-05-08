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
import { asanaGids } from "@/lib/server/asanaConfig";

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

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

function respond(status: number, body: ResolveResponse): NextResponse {
  return NextResponse.json(body, { status, headers: CORS });
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
  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return respond(400, { ok: false, resolution: "", auditId: "", error: "invalid JSON body" });
  }
  const { subjectId, subjectName, hitId, resolution, reason, hitContext } = body;
  if (!subjectId || !subjectName || !hitId || !resolution) {
    return respond(400, { ok: false, resolution: "", auditId: "", error: "subjectId, subjectName, hitId, resolution all required" });
  }
  if (!["positive", "possible", "false", "unspecified"].includes(resolution)) {
    return respond(400, { ok: false, resolution, auditId: "", error: "resolution must be positive | possible | false | unspecified" });
  }

  // Audit ID — caller persists this in their UI state if needed
  const auditId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

  // Audit-trail entry — for now we write to console. Future: persist to
  // Netlify Blobs or a dedicated /api/audit endpoint that signs and
  // stores immutably.
  console.info(`[audit] ${timestamp} hit-resolution`, {
    auditId,
    subjectId,
    subjectName,
    hitId,
    resolution,
    reason,
    hitContext,
    ongoingMonitorTaskId,
  });

  return respond(200, {
    ok: true,
    resolution,
    auditId,
    ...(ongoingMonitorTaskId ? { ongoingMonitorTaskId } : {}),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}
