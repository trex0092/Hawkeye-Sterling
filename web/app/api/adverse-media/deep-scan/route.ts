// POST /api/adverse-media/deep-scan — start a worldwide adverse-media deep scan.
// GET  /api/adverse-media/deep-scan?scanId=... — poll status / retrieve results.
//
// The deep scan sweeps every active news source plus targeted per-country
// passes (subject countries + all FATF/EU/Basel high-risk jurisdictions, each
// in its primary press language) with NO result caps. It runs asynchronously —
// POST returns a scanId immediately; results persist for 7 days.
//
// Auth: fail-closed (enforce with default requireAuth) — adverse-media
// results are regulated data.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { startDeepScan, getDeepScan, deepScanConfig } from "@/lib/server/adverse-media-deep-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sweep itself is fire-and-forget; the route only persists the record and
// kicks it off. Netlify keeps the background work alive via the same
// invocation, so allow headroom for large fan-outs.
export const maxDuration = 60;

interface DeepScanRequestBody {
  subject?: {
    name?: string;
    nationality?: string;
    jurisdiction?: string;
    extraCountries?: string[];
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: DeepScanRequestBody;
  try {
    body = (await req.json()) as DeepScanRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const rawName = body.subject?.name?.trim();
  if (!rawName) {
    return NextResponse.json({ ok: false, error: "subject.name is required" }, { status: 400, headers: gate.headers });
  }

  const cfg = deepScanConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      { ok: false, error: "deep_scan_disabled", message: "HAWKEYE_DEEP_SCAN_ENABLED=false" },
      { status: 503, headers: gate.headers },
    );
  }

  const tenant = tenantIdFromGate(gate);
  const subject = {
    name: sanitizeField(rawName, 300),
    ...(body.subject?.nationality ? { nationality: sanitizeField(body.subject.nationality, 8) } : {}),
    ...(body.subject?.jurisdiction ? { jurisdiction: sanitizeField(body.subject.jurisdiction, 8) } : {}),
    ...(Array.isArray(body.subject?.extraCountries)
      ? { extraCountries: body.subject.extraCountries.slice(0, 20).map((c) => sanitizeField(String(c), 8)) }
      : {}),
  };

  const scanId = await startDeepScan(subject, tenant);
  if (!scanId) {
    return NextResponse.json(
      { ok: false, error: "scan_not_started", message: "Deep scan could not be persisted (blob store unavailable)." },
      { status: 503, headers: gate.headers },
    );
  }

  // Audit the initiation — completion writes its own correlated entry.
  void writeAuditChainEntry(
    {
      event: "adverse_media.deep_scan.started",
      actor: gate.keyId,
      subject: subject.name,
      scanId,
    },
    tenant,
  ).catch((err: unknown) => {
    console.error("[deep-scan route] audit chain write failed:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json(
    { ok: true, scanId, status: "running", pollUrl: `/api/adverse-media/deep-scan?scanId=${scanId}` },
    { status: 202, headers: gate.headers },
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId")?.trim();
  if (!scanId) {
    return NextResponse.json({ ok: false, error: "scanId query parameter is required" }, { status: 400, headers: gate.headers });
  }

  const record = await getDeepScan(scanId);
  if (!record) {
    return NextResponse.json({ ok: false, error: "scan not found or expired" }, { status: 404, headers: gate.headers });
  }

  // Tenant isolation — a scan is only visible to the tenant that started it.
  if (record.tenantId !== tenantIdFromGate(gate)) {
    return NextResponse.json({ ok: false, error: "scan not found or expired" }, { status: 404, headers: gate.headers });
  }

  return NextResponse.json({ ok: true, ...record }, { status: 200, headers: gate.headers });
}
