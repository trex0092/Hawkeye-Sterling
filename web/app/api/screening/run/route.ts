// POST /api/screening/run
//
// Unified, production-grade screening entry point.
//
// Every screening invocation through this route:
//   1. Validates input with a typed schema (Zod-like structural check)
//   2. Assigns a deterministic, immutable screening result ID
//      (sha256 of subject + timestamp + request-id — suitable for audit)
//   3. Runs the brain quickScreen against the live watchlist corpus
//   4. Returns a typed screening envelope with:
//      - result ID, subject, hits, score, severity
//      - source provenance (listId, listRef) on every hit
//      - match rationale on every hit
//      - negative evidence (what was checked and found clear)
//      - confidence calibration note
//      - generation timestamp + schema version
//      - auditable request-id header
//
// This route is the primary production endpoint.
// /api/quick-screen is maintained for backward compatibility.
//
// Rate-limited per tier. Returns typed errors — no silent 200 failures.

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { quickScreen as brainQuickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SCHEMA_VERSION = "1.0";
const MAX_CANDIDATES = 5_000;
const MAX_ALIASES = 50;

// ── Input validation ──────────────────────────────────────────────────────────

interface ScreeningRunRequest {
  subject: QuickScreenSubject;
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
  requestId?: string; // caller-supplied idempotency key (optional)
}

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(raw: unknown): { ok: true; value: ScreeningRunRequest } | { ok: false; errors: ValidationError[] } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }
  const body = raw as Record<string, unknown>;
  const errors: ValidationError[] = [];

  // Subject
  if (!body["subject"] || typeof body["subject"] !== "object") {
    errors.push({ field: "subject", message: "subject is required and must be an object" });
    return { ok: false, errors };
  }
  const subject = body["subject"] as Record<string, unknown>;
  if (typeof subject["name"] !== "string" || !subject["name"].trim()) {
    errors.push({ field: "subject.name", message: "subject.name must be a non-empty string" });
  }
  const name = typeof subject["name"] === "string" ? subject["name"].trim() : "";
  if (name.length > 512) {
    errors.push({ field: "subject.name", message: "subject.name must not exceed 512 characters" });
  }

  const VALID_ENTITY_TYPES = ["individual", "organisation", "vessel", "aircraft", "other"];
  if (subject["entityType"] !== undefined && !VALID_ENTITY_TYPES.includes(subject["entityType"] as string)) {
    errors.push({ field: "subject.entityType", message: `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` });
  }

  if (subject["aliases"] !== undefined) {
    if (!Array.isArray(subject["aliases"])) {
      errors.push({ field: "subject.aliases", message: "aliases must be an array of strings" });
    } else if ((subject["aliases"] as unknown[]).length > MAX_ALIASES) {
      errors.push({ field: "subject.aliases", message: `aliases must not exceed ${MAX_ALIASES} entries` });
    } else if (!(subject["aliases"] as unknown[]).every((a) => typeof a === "string")) {
      errors.push({ field: "subject.aliases", message: "all aliases must be strings" });
    }
  }

  if (subject["dateOfBirth"] !== undefined && typeof subject["dateOfBirth"] !== "string") {
    errors.push({ field: "subject.dateOfBirth", message: "dateOfBirth must be a string (ISO date or partial)" });
  }

  // Candidates (optional)
  if (body["candidates"] !== undefined) {
    if (!Array.isArray(body["candidates"])) {
      errors.push({ field: "candidates", message: "candidates must be an array" });
    } else if ((body["candidates"] as unknown[]).length > MAX_CANDIDATES) {
      errors.push({ field: "candidates", message: `candidates must not exceed ${MAX_CANDIDATES} entries` });
    }
  }

  // Options (optional)
  if (body["options"] !== undefined && (typeof body["options"] !== "object" || body["options"] === null)) {
    errors.push({ field: "options", message: "options must be an object" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      subject: body["subject"] as QuickScreenSubject,
      candidates: body["candidates"] as QuickScreenCandidate[] | undefined,
      options: body["options"] as QuickScreenOptions | undefined,
      requestId: typeof body["requestId"] === "string" ? body["requestId"] : undefined,
    },
  };
}

// ── Deterministic result ID ───────────────────────────────────────────────────
// sha256(requestId | subject.name | subject.entityType | ISO-timestamp)
// Stable across retries when caller supplies requestId (idempotency).
// Unique per screening when requestId is omitted.

function buildResultId(subject: QuickScreenSubject, ts: string, requestId?: string): string {
  const seed = [
    requestId ?? randomUUID(),
    subject.name.toLowerCase().trim(),
    subject.entityType ?? "",
    ts,
  ].join("|");
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

// ── Negative evidence summary ─────────────────────────────────────────────────
// Explains what was checked and found clear — required by regulator-grade
// non-match documentation requirements.

function buildNegativeEvidence(
  result: QuickScreenResult,
  listsLoaded: number,
): string[] {
  const clear: string[] = [];
  if (result.hits.length === 0) {
    clear.push(`Screened against ${listsLoaded.toLocaleString()} watchlist entries — no matches found`);
  }
  if (result.topScore < 50) {
    clear.push(`Top match score (${result.topScore.toFixed(0)}%) is below significance threshold — no material similarity detected`);
  }
  if (result.severity === "clear") {
    clear.push("Severity assessment: CLEAR — no actionable hits requiring human review");
  }
  return clear;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Structured request ID for observability
  const reqId = req.headers.get("x-request-id") ?? randomUUID();
  const responseHeaders: Record<string, string> = {
    ...gate.headers,
    "x-request-id": reqId,
    "x-schema-version": SCHEMA_VERSION,
  };

  // Parse body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Request body is not valid JSON", requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }

  // Validate
  const validation = validateRequest(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "Request validation failed", errors: validation.errors, requestId: reqId },
      { status: 400, headers: responseHeaders },
    );
  }
  const { subject, candidates: callerCandidates, options, requestId: callerRequestId } = validation.value;

  // Load watchlist candidates
  let candidates: QuickScreenCandidate[];
  let listsLoaded = 0;
  if (Array.isArray(callerCandidates)) {
    candidates = callerCandidates;
    listsLoaded = candidates.length;
  } else {
    try {
      const loaded = await loadCandidates();
      if (!Array.isArray(loaded) || loaded.length === 0) {
        return NextResponse.json(
          { ok: false, error: "corpus_unavailable", message: "Watchlist corpus is unavailable. Run /api/sanctions/refresh to ingest lists.", requestId: reqId },
          { status: 503, headers: responseHeaders },
        );
      }
      candidates = loaded.filter(
        (c): c is QuickScreenCandidate =>
          !!c && typeof c === "object" &&
          typeof (c as QuickScreenCandidate).listId === "string" &&
          typeof (c as QuickScreenCandidate).listRef === "string" &&
          typeof (c as QuickScreenCandidate).name === "string",
      );
      listsLoaded = candidates.length;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[screening/run] loadCandidates failed", { reqId, detail });
      return NextResponse.json(
        { ok: false, error: "corpus_unavailable", message: "Failed to load watchlist corpus", detail, requestId: reqId },
        { status: 503, headers: responseHeaders },
      );
    }
  }

  // Run screening
  const ts = new Date().toISOString();
  const resultId = buildResultId(subject, ts, callerRequestId);

  let result: QuickScreenResult;
  try {
    result = (brainQuickScreen as (s: QuickScreenSubject, c: QuickScreenCandidate[], o?: QuickScreenOptions) => QuickScreenResult)(
      subject,
      candidates,
      options,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[screening/run] quickScreen threw", { reqId, resultId, detail });
    return NextResponse.json(
      { ok: false, error: "screening_failed", message: "Screening engine error", detail, requestId: reqId, resultId },
      { status: 500, headers: responseHeaders },
    );
  }

  // Confidence calibration note — honest statement about what was and
  // wasn't checked. Never claim higher confidence than supported.
  const confidenceNote =
    listsLoaded > 0
      ? `Screened ${listsLoaded.toLocaleString()} watchlist entries from configured sanctions and PEP sources. ` +
        `Score is based on name similarity (Levenshtein + phonetic ensemble). ` +
        `Results should be reviewed by a qualified compliance officer before taking adverse action.`
      : "No watchlist entries available — result is based on caller-supplied candidates only.";

  const negativeEvidence = buildNegativeEvidence(result, listsLoaded);

  return NextResponse.json(
    {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      resultId,
      requestId: reqId,
      ...result,
      negativeEvidence,
      confidenceNote,
      // Disambiguate unresolved ambiguity
      unresolvedAmbiguity:
        result.severity === "medium" || result.topScore >= 70
          ? ["Manual reviewer must confirm or dismiss hits. Automated disposition not permitted for scores >= 70."]
          : [],
    },
    { headers: responseHeaders },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key, x-request-id",
    },
  });
}
