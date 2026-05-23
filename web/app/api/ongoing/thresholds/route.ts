// GET/PUT /api/ongoing/thresholds?customerId=<id>
//
// Per-customer alert threshold configuration for ongoing monitoring.
// Thresholds are stored in Netlify Blobs under ongoing/thresholds/<customerId>.
//
// GET  — returns current thresholds for the customer (defaults if never set).
// PUT  — updates one or more threshold fields; validates ranges.
//
// Fields:
//   sanctionsMatchThreshold    (0.70 – 1.0)           — hit score floor
//   adverseMediaSeverityThreshold ("low"|"medium"|"high"|"critical")
//   pepSalienceThreshold       (0 – 100)               — PEP match salience floor
//
// Auth: withGuard (same gate as the rest of /api/ongoing/*).
// Audit: every PUT writes a monitoring.threshold_updated chain entry.

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import {
  loadAlertThresholds,
  saveAlertThresholds,
  type AdverseMediaSeverityThreshold,
} from "@/lib/server/ongoing-monitoring-config";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LENGTH = 128;

function resolveCustomerId(req: Request, ctx: RequestContext): string | null {
  const url = new URL(req.url);
  const raw = url.searchParams.get("customerId")?.trim();
  if (!raw || raw.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(raw)) return null;
  // Scope to tenant — prefix the customer ID so cross-tenant reads are impossible.
  return `${ctx.tenantId}/${raw}`;
}

async function handleGet(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const customerId = resolveCustomerId(req, ctx);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customerId required (alphanumeric/._-:, max 128 chars)" },
      { status: 400 },
    );
  }
  const thresholds = await loadAlertThresholds(customerId);
  return NextResponse.json({ ok: true, thresholds });
}

async function handlePut(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const customerId = resolveCustomerId(req, ctx);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customerId required (alphanumeric/._-:, max 128 chars)" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const updates: Parameters<typeof saveAlertThresholds>[1] = {};

  if ("sanctionsMatchThreshold" in raw) {
    const v = raw["sanctionsMatchThreshold"];
    if (typeof v !== "number") {
      return NextResponse.json(
        { ok: false, error: "sanctionsMatchThreshold must be a number in [0.70, 1.0]" },
        { status: 400 },
      );
    }
    updates.sanctionsMatchThreshold = v;
  }
  if ("adverseMediaSeverityThreshold" in raw) {
    const allowed = ["low", "medium", "high", "critical"] as const;
    const v = raw["adverseMediaSeverityThreshold"];
    if (typeof v !== "string" || !allowed.includes(v as AdverseMediaSeverityThreshold)) {
      return NextResponse.json(
        { ok: false, error: `adverseMediaSeverityThreshold must be one of: ${allowed.join("|")}` },
        { status: 400 },
      );
    }
    updates.adverseMediaSeverityThreshold = v as AdverseMediaSeverityThreshold;
  }
  if ("pepSalienceThreshold" in raw) {
    const v = raw["pepSalienceThreshold"];
    if (typeof v !== "number") {
      return NextResponse.json(
        { ok: false, error: "pepSalienceThreshold must be a number in [0, 100]" },
        { status: 400 },
      );
    }
    updates.pepSalienceThreshold = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "At least one of sanctionsMatchThreshold, adverseMediaSeverityThreshold, pepSalienceThreshold required",
      },
      { status: 400 },
    );
  }

  let saved;
  try {
    saved = await saveAlertThresholds(customerId, updates, ctx.apiKey.id);
  } catch (err) {
    const msg = err instanceof RangeError ? err.message : "validation failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  void writeAuditChainEntry(
    {
      event: "monitoring.threshold_updated",
      actor: ctx.apiKey.id,
      customerId,
      updates,
    },
    ctx.tenantId,
  ).catch((e) =>
    console.warn(
      "[ongoing/thresholds] audit chain write failed:",
      e instanceof Error ? e.message : String(e),
    ),
  );

  return NextResponse.json({ ok: true, thresholds: saved });
}

export const GET = withGuard(handleGet);
export const PUT = withGuard(handlePut);
