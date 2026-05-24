// POST /api/predictive-risk
// Forward-looking predictive risk scoring for one or more subjects.
//
// Single subject:  { subjectId: string }
//   Returns PredictiveRiskResult.
//
// Batch subjects:  { subjectIds: string[] }  (max 20)
//   Returns { results: PredictiveRiskResult[] }.
//
// The route loads the stored SubjectProfile from Blobs via the subject-store
// and maps it into the Subject shape expected by computePredictiveRisk.
// Auth required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject } from "@/lib/server/subject-store";
import { computePredictiveRisk, type PredictiveRiskResult } from "@/lib/server/predictive-risk";
import type { Subject, SubjectType, CDDPosture, BadgeTone, SubjectStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BATCH = 20;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LEN = 128;

function isSafeId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LEN && SAFE_ID_RE.test(id);
}

// Map SubjectProfile (compliance-law store) to the Subject shape.
// Fields not available in SubjectProfile are given safe defaults.
function profileToSubject(profile: Awaited<ReturnType<typeof loadSubject>>): Subject | null {
  if (!profile) return null;
  return {
    id: profile.subjectId,
    badge: profile.subjectId.slice(0, 6).toUpperCase(),
    badgeTone: "dashed" as BadgeTone,
    name: profile.subjectName,
    meta: profile.notes ?? "",
    country: "",
    jurisdiction: "",
    type: (profile.dueDiligence === "EDD" ? "Individual · UBO" : "Individual · Customer") as SubjectType,
    entityType: "individual",
    riskScore: (() => {
      const hist = profile.riskScoreHistory;
      if (hist && hist.length > 0) return hist[hist.length - 1]!.score;
      return 0;
    })(),
    status: "active" as SubjectStatus,
    cddPosture: (profile.dueDiligence ?? "CDD") as CDDPosture,
    listCoverage: [],
    pep: profile.isPep ? { tier: "1" } : undefined,
    exposureAED: "0",
    slaNotify: "",
    mostSerious: "",
    openedAgo: profile.createdAt,
  };
}

async function scoreOne(tenant: string, subjectId: string): Promise<PredictiveRiskResult | { error: string; subjectId: string }> {
  if (!isSafeId(subjectId)) {
    return { error: "invalid subjectId", subjectId };
  }
  const profile = await loadSubject(tenant, subjectId);
  if (!profile) {
    return { error: "not found", subjectId };
  }
  const subject = profileToSubject(profile);
  if (!subject) {
    return { error: "could not map profile to subject", subjectId };
  }
  return computePredictiveRisk(subject);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 2 });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400, headers: gate.headers });
  }

  const b = body as Record<string, unknown>;

  // ── Batch mode ─────────────────────────────────────────────────────────────
  if (Array.isArray(b["subjectIds"])) {
    const ids = b["subjectIds"] as unknown[];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "subjectIds must not be empty" }, { status: 400, headers: gate.headers });
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json(
        { ok: false, error: `batch limit is ${MAX_BATCH} subjects` },
        { status: 400, headers: gate.headers },
      );
    }

    const results = await Promise.all(ids.map((id) => scoreOne(tenant, String(id))));
    return NextResponse.json({ ok: true, results }, { headers: gate.headers });
  }

  // ── Single mode ─────────────────────────────────────────────────────────────
  const subjectId = b["subjectId"];
  if (!isSafeId(subjectId)) {
    return NextResponse.json(
      { ok: false, error: "subjectId required (alphanumeric/._-:, max 128 chars)" },
      { status: 400, headers: gate.headers },
    );
  }

  const result = await scoreOne(tenant, subjectId);
  if ("error" in result) {
    const status = result.error === "not found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status, headers: gate.headers });
  }

  return NextResponse.json({ ok: true, result }, { headers: gate.headers });
}
