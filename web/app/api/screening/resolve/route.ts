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
//     reasonCode?: "FP_01" | ... | "FP_09" (see fp-reason-codes.ts),
//                              // REQUIRED when resolution === "false" (J-06 / G-05)
//     reason?: string,         // free-text, REQUIRED when reasonCode === "FP_06"
//                              // also REQUIRED when resolution === "unspecified" (I-10)
//     evidenceReviewed?: string,
//                              // REQUIRED when resolution === "unspecified" (I-10) —
//                              // describe what the analyst inspected before deciding
//                              // to take no action
//     hitContext?: {           // for the audit trail
//       sourceList?: string,
//       matchedName?: string,
//       matchStrength?: number,
//       listRef?: string,
//     }
//   }
//
// Behavior:
//   - Always writes a HMAC-signed audit-chain entry (Federal Decree-Law No. 10 of 2025 Art.19,
//     Art.24 — tamper-evident regulator evidence). J-06 + J-07 enrichment:
//       · structured FP reason code (J-06)
//       · canonical sanctions-entity snapshot at resolution time (J-07)
//   - Resolution = "false": validates reasonCode + reason and writes the
//     structured disposition to the chain. The MLRO can later query "all FP
//     dispositions with reasonCode FP_01" without grepping free text.
//   - Resolution = "positive": auto-creates an ongoing-monitoring Asana task
//     so the subject is permanently tracked + re-screened daily.
//   - The legacy plain-Blobs audit/hit-resolution/{auditId} write is kept
//     for backward compatibility with the existing case-history reader.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { asanaGids } from "@/lib/server/asanaConfig";
import { corsHeaders, corsPreflight } from "@/lib/api/cors";
import { submitFeedback } from "@/lib/server/feedback";
import { setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { validateFpDisposition, type FpReasonCode } from "@/lib/server/fp-reason-codes";
import { validateNoActionDisposition } from "@/lib/server/no-action-disposition";
import { captureMatchEvidence, type MatchEvidenceStore } from "@/lib/server/match-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ResolveBody {
  subjectId?: string;
  subjectName?: string;
  hitId?: string;
  resolution?: "positive" | "possible" | "false" | "unspecified";
  /** J-06 / G-05 — structured reason code. Required when resolution === "false". */
  reasonCode?: FpReasonCode | string;
  reason?: string;
  /** I-10 — what the analyst inspected before deciding to take no action.
   *  Required when resolution === "unspecified". */
  evidenceReviewed?: string;
  hitContext?: {
    sourceList?: string;
    matchedName?: string;
    matchStrength?: number;
    listRef?: string;
  };
}

/** Open the hawkeye-lists Blobs store for J-07 match-evidence capture. Same
 *  env-var precedence as the rest of the screening code. Returns null in
 *  local dev or when Blobs isn't configured — captureMatchEvidence handles
 *  that path with a storeUnavailable-style degraded snapshot. */
async function openListStore(): Promise<MatchEvidenceStore | null> {
  let mod: typeof import("@netlify/blobs");
  try {
    mod = await import("@netlify/blobs");
  } catch {
    return null;
  }
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  try {
    const raw =
      siteID && token
        ? mod.getStore({ name: "hawkeye-lists", siteID, token, consistency: "strong" })
        : mod.getStore({ name: "hawkeye-lists" });
    return {
      get: (key, opts) => raw.get(key, opts as { type: "json" }) as Promise<unknown>,
    };
  } catch {
    return null;
  }
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
    const json = await res.json().catch(() => ({})) as { data?: { gid?: string } };
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
  const { subjectId, subjectName, hitId, resolution, reasonCode, reason, evidenceReviewed, hitContext } = body;
  if (!subjectId || !subjectName || !hitId || !resolution) {
    return respond(400, { ok: false, resolution: "", auditId: "", error: "subjectId, subjectName, hitId, resolution all required" }, origin);
  }
  if (!["positive", "possible", "false", "unspecified"].includes(resolution)) {
    return respond(400, { ok: false, resolution, auditId: "", error: "resolution must be positive | possible | false | unspecified" }, origin);
  }
  // Length caps prevent storage exhaustion in audit chain.
  if (subjectId.length > 256 || subjectName.length > 512 || hitId.length > 256 ||
      (typeof reason === "string" && reason.length > 4000) ||
      (typeof evidenceReviewed === "string" && evidenceReviewed.length > 4000)) {
    return respond(400, { ok: false, resolution, auditId: "", error: "one or more fields exceed maximum length" }, origin);
  }

  // J-06 / G-05 — on false-positive dispositions, validate the structured
  // reason code (and the free-text reason when reasonCode === "FP_06"). A
  // missing or malformed reasonCode is a 400 — every FP must carry an
  // immutable, queryable justification per Federal Decree-Law No. 10 of 2025 Art.19.
  let validatedReasonCode: FpReasonCode | null = null;
  let validatedReason: string | null = typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null;
  if (resolution === "false") {
    const v = validateFpDisposition({ reasonCode, reason });
    if (!v.ok) {
      return respond(400, { ok: false, resolution, auditId: "", error: v.error }, origin);
    }
    validatedReasonCode = v.value.reasonCode;
    validatedReason = v.value.reason;
  }

  // I-10 — on no-action dispositions, validate the analyst rationale +
  // evidence-reviewed fields. The audit chain entry below carries both
  // verbatim so a regulator can query "show me every unactioned alert and
  // why" months later.
  let validatedEvidenceReviewed: string | null = null;
  if (resolution === "unspecified") {
    const v = validateNoActionDisposition({ reason, evidenceReviewed });
    if (!v.ok) {
      return respond(400, { ok: false, resolution, auditId: "", error: v.error }, origin);
    }
    validatedReason = v.value.reason;
    validatedEvidenceReviewed = v.value.evidenceReviewed;
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
        `Auto-added to ongoing monitoring per FATF R.10 / Federal Decree-Law No. 10 of 2025 Art.19.`,
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

  // J-07 — snapshot the canonical sanctions entity at this exact moment so
  // a future regulator query "what did the list show for this entity on
  // this date" has an authoritative answer pinned to the audit entry.
  // Failure to capture (Blobs unavailable, listRef not found) is non-fatal:
  // the snapshot carries entity:null and the regulator sees that ambiguity.
  let matchEvidence: Awaited<ReturnType<typeof captureMatchEvidence>> | null = null;
  if (hitContext?.sourceList && hitContext?.listRef) {
    try {
      const store = await openListStore();
      matchEvidence = await captureMatchEvidence(store, hitContext.sourceList, hitContext.listRef);
    } catch (err) {
      console.warn("[resolve] match-evidence capture failed:", err instanceof Error ? err.message : err);
    }
  }

  // Persist immutable audit-trail event (Federal Decree-Law No. 10 of 2025 Art.19 — 10-year retention).
  // Two writes happen in parallel:
  //   1. Plain Blobs at audit/hit-resolution/{auditId} — preserves the
  //      existing case-history reader contract (backward compatible).
  //   2. HMAC-signed audit chain — adds the disposition to the
  //      tamper-evident regulator chain alongside screening events.
  const auditEvent = {
    auditId,
    eventType: "hit-resolution",
    timestamp,
    subjectId,
    subjectName,
    hitId,
    resolution,
    reasonCode: validatedReasonCode,
    reason: validatedReason,
    evidenceReviewed: validatedEvidenceReviewed,
    hitContext,
    matchEvidence,
    ongoingMonitorTaskId,
    analyst: gate.keyId ?? "system",
  };
  void setJson(`audit/hit-resolution/${auditId}`, auditEvent).catch((err) =>
    console.warn("[resolve] audit persist failed:", err instanceof Error ? err.message : err)
  );

  // HMAC-signed chain entry (J-06 + J-07 enrichment lives here).
  void writeAuditChainEntry(
    {
      event: `screening.${resolution === "false" ? "false_positive" : resolution === "positive" ? "true_match" : resolution === "unspecified" ? "no_action" : `resolution_${resolution}`}`,
      actor: gate.keyId ?? "system",
      auditId,
      subjectId,
      subjectName,
      hitId,
      resolution,
      reasonCode: validatedReasonCode,
      reason: validatedReason,
      // I-10 — mandatory rationale fields for no-action dispositions.
      // Null for other resolutions; present + non-empty for "unspecified".
      evidenceReviewed: validatedEvidenceReviewed,
      hitContext: hitContext ?? null,
      matchEvidence,
      ongoingMonitorTaskId: ongoingMonitorTaskId ?? null,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn("[resolve] HMAC audit-chain write failed:", err instanceof Error ? err.message : err),
  );

  console.info("[audit]", auditId, "hit-resolution persisted", { resolution, reasonCode: validatedReasonCode });

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
