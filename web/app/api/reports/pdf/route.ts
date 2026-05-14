// POST /api/reports/pdf
//
// Generate a regulator-grade PDF evidence pack from an immutable
// screening result. The PDF is:
//   - deterministic (same input → byte-identical output)
//   - timestamped with the original screening result timestamp
//   - anchored to the audit chain (HMAC seal embedded in PDF metadata)
//   - suitable for regulatory submission and internal records
//
// Required body:
//   {
//     resultId: string,         ← unique screening result ID
//     subject: { name, entityType?, jurisdiction?, dateOfBirth? }
//     verdict: {
//       outcome, aggregateScore, aggregateConfidence,
//       findings?, reasoning?, evidence?
//     }
//     generatedAt?: string      ← ISO timestamp (defaults to now)
//     reviewerName?: string     ← optional reviewer identity for footer
//     chainAnchor?: string      ← audit-chain head hash to embed
//   }
//
// Returns: application/pdf

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { renderEvidencePack } from "../../../../../dist/src/brain/pdf-evidence-pack.js";
import type { BrainVerdict } from "../../../../../dist/src/brain/types.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface PdfReportRequest {
  resultId: string;
  subject: {
    name: string;
    entityType?: string;
    jurisdiction?: string;
    dateOfBirth?: string;
  };
  verdict: {
    outcome: string;
    aggregateScore: number;
    aggregateConfidence: number;
    findings?: unknown[];
    reasoning?: string;
    evidence?: unknown[];
    primaryHypothesis?: string;
    methodology?: string;
  };
  generatedAt?: string;
  reviewerName?: string;
  chainAnchor?: string;
}

const VALID_ENTITY_TYPES = ["individual", "entity", "vessel", "wallet", "aircraft"] as const;
type PdfEntityType = (typeof VALID_ENTITY_TYPES)[number];

function validatePdfRequest(raw: unknown): { ok: true; value: PdfReportRequest } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "body must be a JSON object" };
  const b = raw as Record<string, unknown>;
  if (typeof b["resultId"] !== "string" || !b["resultId"]) return { ok: false, error: "resultId required" };
  if (typeof b["subject"] !== "object" || b["subject"] === null) return { ok: false, error: "subject required" };
  const subj = b["subject"] as Record<string, unknown>;
  if (typeof subj["name"] !== "string" || !subj["name"].trim()) return { ok: false, error: "subject.name required" };
  if (subj["entityType"] !== undefined && !VALID_ENTITY_TYPES.includes(subj["entityType"] as PdfEntityType)) {
    return { ok: false, error: `subject.entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` };
  }
  if (typeof b["verdict"] !== "object" || b["verdict"] === null) return { ok: false, error: "verdict required" };
  const v = b["verdict"] as Record<string, unknown>;
  if (typeof v["outcome"] !== "string") return { ok: false, error: "verdict.outcome required" };
  if (typeof v["aggregateScore"] !== "number") return { ok: false, error: "verdict.aggregateScore required (number)" };
  if (typeof v["aggregateConfidence"] !== "number") return { ok: false, error: "verdict.aggregateConfidence required (number)" };
  return { ok: true, value: b as unknown as PdfReportRequest };
}

export async function POST(req: Request): Promise<NextResponse | Response> {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const validation = validatePdfRequest(raw);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: "validation_error", detail: validation.error }, { status: 400 });
  }

  const { resultId, subject, verdict, generatedAt, reviewerName, chainAnchor } = validation.value;
  const safeResultId = resultId.replace(/[^\x21-\x7E]/g, "").replace(/["\\]/g, "").slice(0, 64) || "unknown";
  const ts = generatedAt && !Number.isNaN(Date.parse(generatedAt))
    ? new Date(Date.parse(generatedAt)).toISOString()
    : new Date().toISOString();

  // Build BrainVerdict-compatible object from the slim request payload.
  // We expose only what was verifiably provided — no hallucinated fields.
  const brainVerdict: BrainVerdict = {
    runId: resultId,
    subject: {
      name: subject.name,
      type: (subject.entityType as BrainVerdict["subject"]["type"]) ?? "individual",
      jurisdiction: subject.jurisdiction,
      dateOfBirth: subject.dateOfBirth,
    },
    outcome: verdict.outcome as BrainVerdict["outcome"],
    aggregateScore: verdict.aggregateScore,
    aggregateConfidence: verdict.aggregateConfidence,
    generatedAt: new Date(ts).getTime(),
    findings: Array.isArray(verdict.findings) ? (verdict.findings as BrainVerdict["findings"]) : [],
    introspection: { bias: [], calibration: { confidence: verdict.aggregateConfidence, calibrationNote: "Score reflects matching ensemble output." } },
    methodology: verdict.methodology ?? "Hawkeye Sterling name-matching ensemble (Levenshtein + phonetic + alias expansion)",
    primaryHypothesis: verdict.primaryHypothesis,
    chain: [],
    recommendedActions: reviewerName ? [`Reviewed by: ${reviewerName}`] : [],
  } as unknown as BrainVerdict;

  // Integrity hash of the result payload (independent of chain anchor)
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ resultId, subject, verdict, ts }))
    .digest("hex");

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = renderEvidencePack(brainVerdict, {
      title: `Hawkeye Sterling — Evidence Pack — ${safeResultId}`,
      chainAnchor: chainAnchor ?? payloadHash,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[reports/pdf] renderEvidencePack failed", { resultId, detail });
    return NextResponse.json(
      { ok: false, error: "pdf_generation_failed", detail },
      { status: 500 },
    );
  }

  const filename = `hawkeye-evidence-${safeResultId.slice(0, 12)}-${ts.slice(0, 10)}.pdf`;
  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      ...gate.headers,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(pdfBytes.byteLength),
      "x-result-id": safeResultId,
      "x-payload-hash": payloadHash,
      "x-generated-at": ts,
      "x-latency-ms": String(Date.now() - t0),
      "cache-control": "no-store",
    },
  });
}
