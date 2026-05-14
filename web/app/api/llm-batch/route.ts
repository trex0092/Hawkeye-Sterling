// POST /api/llm-batch         — submit a batch of LLM screening/analysis jobs
// GET  /api/llm-batch?id=X    — poll batch status and retrieve results
//
// Uses Anthropic's Messages Batches API for async bulk processing.
// Ideal for: bulk re-screening, typology matching across many subjects,
// or overnight SAR narrative generation.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import { getAnthropicClient } from "@/lib/server/llm";
import type { RedactionMap } from "@/lib/server/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const batchIndexKey = (keyId: string) => `llm-batch/index/${keyId}`;
// Per-batch redaction maps are persisted here so results retrieved hours
// later can be rehydrated with the same maps that redacted the inputs.
// Survives cold starts because Blobs are durable.
const batchMapsKey = (anthropicBatchId: string) => `llm-batch/maps/${anthropicBatchId}.json`;

interface BatchJob {
  batchId: string;
  submittedAt: string;
  requestCount: number;
  purpose: string;
  status: "submitted" | "in_progress" | "ended" | "failed";
  anthropicBatchId?: string;
  ownerId: string;
}

interface BatchRequest {
  customId: string;
  model?: string;
  system?: string;
  userMessage: string;
  maxTokens?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503, headers: gate.headers });
  }

  let body: { requests?: BatchRequest[]; purpose?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.requests?.length) {
    return NextResponse.json({ ok: false, error: "requests array required" }, { status: 400, headers: gate.headers });
  }
  if (body.requests.length > 100) {
    return NextResponse.json({ ok: false, error: "maximum 100 requests per batch" }, { status: 400, headers: gate.headers });
  }

  // LB-4: validate customId format required by Anthropic
  const CUSTOM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  const badId = body.requests.find((r) => !CUSTOM_ID_RE.test(r.customId ?? ""));
  if (badId) {
    return NextResponse.json({ ok: false, error: `customId "${badId.customId}" invalid — must match ^[a-zA-Z0-9_-]{1,64}$` }, { status: 400, headers: gate.headers });
  }

  const DEFAULT_SYSTEM = "You are an AML compliance analyst. Respond concisely with valid JSON only.";
  const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

  // Build Anthropic batch payload. Redaction happens inside the guarded
  // client (`getAnthropicClient().messages.batches.create`) — it returns
  // the live Anthropic response augmented with `_redactionMaps`
  // (customId → RedactionMap) so the caller can rehydrate results later.
  const anthropicRequests = body.requests.map((r) => ({
    custom_id: r.customId,
    params: {
      model: r.model ?? DEFAULT_MODEL,
      max_tokens: r.maxTokens ?? 1024,
      system: r.system ?? DEFAULT_SYSTEM,
      messages: [{ role: "user", content: r.userMessage }],
    },
  }));

  try {
    const client = getAnthropicClient(apiKey, 25_000, "llm-batch");
    const response = await client.messages.batches.create({ requests: anthropicRequests });
    const anthropicBatch = response as { id: string; processing_status: string; _redactionMaps: Record<string, RedactionMap> };

    // Persist per-customId redaction maps so result text retrieved hours
    // later can be rehydrated against the same maps that redacted inputs.
    // Stored under the Anthropic batch ID, which is what the results
    // endpoint keys on.
    try {
      await setJson(batchMapsKey(anthropicBatch.id), anthropicBatch._redactionMaps);
    } catch (mapErr) {
      console.warn("[llm-batch] redaction-map persist failed:", mapErr instanceof Error ? mapErr.message : mapErr);
    }

    const batchId = `hk-batch-${Date.now()}`;
    const ownerId = gate.keyId ?? "unknown";
    const job: BatchJob = {
      batchId,
      submittedAt: new Date().toISOString(),
      requestCount: body.requests.length,
      purpose: body.purpose ?? "bulk-analysis",
      status: "submitted",
      anthropicBatchId: anthropicBatch.id,
      ownerId,
    };

    // Persist per-owner index entry (tenant-isolated)
    const index = (await getJson<BatchJob[]>(batchIndexKey(ownerId))) ?? [];
    index.unshift(job);
    await setJson(batchIndexKey(ownerId), index.slice(0, 200));

    return NextResponse.json({ ok: true, batchId, anthropicBatchId: anthropicBatch.id, requestCount: body.requests.length }, { status: 202, headers: gate.headers });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503, headers: gate.headers });
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("id");
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const ownerId = gate.keyId ?? "unknown";
  const index = (await getJson<BatchJob[]>(batchIndexKey(ownerId))) ?? [];

  if (!batchId) {
    return NextResponse.json({ ok: true, batches: index }, { headers: gate.headers });
  }

  const job = index.find((j) => j.batchId === batchId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "batch not found" }, { status: 404, headers: gate.headers });
  }

  // Fetch live status from Anthropic via the guarded client.
  // The status response itself contains no PII (counts + processing_status
  // only), so this is a passthrough; rehydration of actual result text
  // happens at result-retrieval time using the persisted redaction maps.
  if (job.anthropicBatchId && apiKey) {
    try {
      const client = getAnthropicClient(apiKey, 10_000, "llm-batch");
      const statusData = (await client.messages.batches.retrieve(job.anthropicBatchId)) as {
        processing_status: string;
        request_counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number };
        results_url?: string;
      };
      return NextResponse.json({
        ok: true,
        ...job,
        liveStatus: statusData.processing_status,
        requestCounts: statusData.request_counts,
        // resultsUrl intentionally excluded — fetch results server-side only
      }, { headers: gate.headers });
    } catch { /* fall through to cached status */ }
  }

  return NextResponse.json({ ok: true, ...job }, { headers: gate.headers });
}
