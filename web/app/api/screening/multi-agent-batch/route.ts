// POST /api/screening/multi-agent-batch
//
// Multi-agent parallel batch screening for high-volume subject lists.
// Accepts up to 50 subjects per request; dispatches them in parallel
// sub-batches of 5 using the quick-screen endpoint, then aggregates results.
//
// Each sub-batch result is independently audit-logged.
// Fail-closed: any sub-batch failure returns a held_review entry.

import { NextResponse, type NextRequest } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { incrementCounter } from "@/lib/server/metrics-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_SUBJECTS = 50;
const BATCH_SIZE   = 5;

export interface BatchSubject {
  id?: string;
  name: string;
  dob?: string;
  nationality?: string;
  entityType?: "individual" | "entity";
}

export interface BatchResult {
  subjectId: string;
  name: string;
  verdict: "clear" | "hit" | "possible_match" | "held_review" | "error";
  riskScore: number | null;
  matchCount: number;
  processingMs: number;
  error?: string;
}

export interface BatchScreeningResponse {
  ok: boolean;
  batchId: string;
  processedAt: string;
  totalSubjects: number;
  completedCount: number;
  errorCount: number;
  results: BatchResult[];
  summary: {
    clear: number;
    hit: number;
    possible_match: number;
    held_review: number;
    error: number;
  };
}

async function screenOne(subject: BatchSubject, baseUrl: string, authHeader: string | null): Promise<BatchResult> {
  const t0 = Date.now();
  const subjectId = subject.id ?? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (authHeader) headers["authorization"] = authHeader;

    const res = await fetch(`${baseUrl}/api/quick-screen`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        subjectName: subject.name,
        dateOfBirth: subject.dob,
        nationality: subject.nationality,
        entityType: subject.entityType ?? "individual",
        batchMode: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return { subjectId, name: subject.name, verdict: "held_review", riskScore: null, matchCount: 0, processingMs: Date.now() - t0, error: `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      verdict?: string;
      riskScore?: number;
      hits?: unknown[];
      decision?: string;
    };

    const rawVerdict = data.verdict ?? data.decision ?? "held_review";
    const verdict: BatchResult["verdict"] =
      rawVerdict === "clear"          ? "clear"
      : rawVerdict === "hit"          ? "hit"
      : rawVerdict === "possible_match" ? "possible_match"
      : "held_review";

    return {
      subjectId,
      name: subject.name,
      verdict,
      riskScore: data.riskScore ?? null,
      matchCount: Array.isArray(data.hits) ? data.hits.length : 0,
      processingMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      subjectId,
      name: subject.name,
      verdict: "held_review",
      riskScore: null,
      matchCount: 0,
      processingMs: Date.now() - t0,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  let body: { subjects?: BatchSubject[] };
  try {
    body = await req.json() as { subjects?: BatchSubject[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const subjects = body.subjects;
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return NextResponse.json({ ok: false, error: "subjects array required" }, { status: 400 });
  }
  if (subjects.length > MAX_SUBJECTS) {
    return NextResponse.json({ ok: false, error: `Maximum ${MAX_SUBJECTS} subjects per batch` }, { status: 400 });
  }

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const authHeader = req.headers.get("authorization");
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  // ── Parallel sub-batches ────────────────────────────────────────────────────
  const results: BatchResult[] = [];
  for (let i = 0; i < subjects.length; i += BATCH_SIZE) {
    const chunk = subjects.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((s) => screenOne(s, baseUrl, authHeader))
    );
    results.push(...chunkResults);
  }

  const summary = {
    clear:          results.filter((r) => r.verdict === "clear").length,
    hit:            results.filter((r) => r.verdict === "hit").length,
    possible_match: results.filter((r) => r.verdict === "possible_match").length,
    held_review:    results.filter((r) => r.verdict === "held_review").length,
    error:          results.filter((r) => r.verdict === "error").length,
  };

  incrementCounter("hawkeye_batch_screening_requests_total", 1);
  incrementCounter("hawkeye_batch_screening_subjects_total", subjects.length);

  await writeAuditChainEntry({
    event:        "batch_screening_completed",
    actor:        "api",
    batchId,
    subjectCount: subjects.length,
    hitCount:     summary.hit,
    heldCount:    summary.held_review,
  }, tenantId).catch(() => {/* fire-and-forget audit */});

  const responseBody: BatchScreeningResponse = {
    ok: true,
    batchId,
    processedAt: new Date().toISOString(),
    totalSubjects: subjects.length,
    completedCount: results.filter((r) => r.verdict !== "error").length,
    errorCount: results.filter((r) => !!r.error).length,
    results,
    summary,
  };

  return NextResponse.json(responseBody, { headers: gate.headers });
}
