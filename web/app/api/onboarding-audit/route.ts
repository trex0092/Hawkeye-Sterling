// POST /api/onboarding-audit
//
// Per-step audit-log entry for the onboarding wizard (option F).
// Each step transition appends an immutable entry to the Layer-4
// audit log via web/lib/server/mlro-integration.appendAuditEntry,
// which writes through to Netlify Blobs so the trail survives
// cold-starts.
//
// Body:
//   {
//     userId?:    string  (defaults to "anonymous")
//     fromStep:   1..5
//     toStep:     1..5
//     draftSnapshot: object — minimal subset captured at transition
//                            (name, nationality, occupation, screened,
//                             tier, etc.; no document binaries)
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { appendAuditEntry } from "@/lib/server/mlro-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

interface Body {
  userId?: string;
  fromStep?: number;
  toStep?: number;
  draftSnapshot?: Record<string, unknown>;
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  const userId = body.userId ?? "anonymous";
  const fromStep = body.fromStep ?? 0;
  const toStep = body.toStep ?? 0;
  const summary = `onboarding step ${fromStep} → ${toStep}`;

  const audit = await appendAuditEntry({
    userId,
    mode: "balanced", // closest match in the audit-log enum
    questionText: summary,
    modelVersions: {},
    charterVersionHash: "onboarding-v1",
    directivesInvoked: [`onboarding.step.${toStep}`],
    doctrinesApplied: [],
    retrievedSources: [],
    reasoningTrace: [
      {
        role: "executor",
        modelBuild: "onboarding-wizard",
        text: JSON.stringify({ fromStep, toStep, draftSnapshot: body.draftSnapshot ?? {} }),
      },
    ],
    finalAnswer: null,
  }).catch(() => ({ seq: 0, entryHash: "" }));

  return NextResponse.json(
    { ok: true, seq: audit.seq, entryHash: audit.entryHash },
    { headers: CORS },
  );
}
