// POST /api/document-intelligence/analyze
//
// Accepts extracted text from a KYC document and returns a structured
// DocumentAnalysis (classification, entity extraction, cross-reference
// against the optionally-supplied subject).
//
// Auth required — no anonymous access.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSubject } from "@/lib/server/subject-store";
import { analyzeDocument } from "@/lib/server/document-intelligence";
import type { Subject } from "@/lib/types";

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: { text?: unknown; subjectId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json(
      { ok: false, error: "text is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const text = body.text.slice(0, 500_000); // safety cap

  // Optionally load subject for cross-reference
  let subject: Subject | undefined;
  if (typeof body.subjectId === "string" && body.subjectId.trim()) {
    const tenant = tenantIdFromGate(gate);
    const profile = await loadSubject(tenant, body.subjectId.trim());
    if (profile) {
      // Map SubjectProfile fields to the Subject type shape needed by analyzeDocument
      subject = {
        id: profile.subjectId,
        name: profile.subjectName,
        meta: profile.notes ?? "",
        country: "",
        jurisdiction: "",
        badge: "",
        badgeTone: "dashed",
        type: "Individual · Customer",
        entityType: "individual",
        riskScore: 0,
        status: "active",
        cddPosture: "CDD",
        listCoverage: [],
        exposureAED: "",
        slaNotify: "",
        mostSerious: "",
        openedAgo: "",
      } satisfies Subject;
    }
  }

  try {
    const analysis = analyzeDocument(text, subject);
    return NextResponse.json({ ok: true, analysis }, { headers: gate.headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[document-intelligence/analyze] error:", message);
    return NextResponse.json(
      { ok: false, error: "Analysis failed. Please try again." },
      { status: 500, headers: gate.headers },
    );
  }
}
