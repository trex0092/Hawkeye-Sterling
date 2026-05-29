// GET  /api/maker-checker        → list pending requests for tenant
// POST /api/maker-checker        → create a new maker-checker request

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import {
  createMakerCheckerRequest,
  listPendingRequests,
  listAllRequests,
  type MakerCheckerActionType,
} from "@/lib/server/maker-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ALLOWED_ACTIONS: ReadonlySet<MakerCheckerActionType> = new Set([
  "risk_override",
  "str_filing",
  "whitelist_add",
  "pep_clearance",
  "case_close",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function handleGet(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const all = url.searchParams.get("status") === "all";

  const items = all
    ? await listAllRequests(ctx.tenantId)
    : await listPendingRequests(ctx.tenantId);

  // Enrich with age (ms since requestedAt) for display
  const now = Date.now();
  const enriched = items.map((r) => ({
    ...r,
    ageMs: now - new Date(r.requestedAt).getTime(),
  }));

  return NextResponse.json({ ok: true, items: enriched, total: enriched.length });
}

async function handlePost(req: Request, ctx: RequestContext): Promise<NextResponse> {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }

  const initiatorId = stringField(raw["initiatorId"]) ?? ctx.apiKey.name ?? ctx.apiKey.email ?? ctx.apiKey.id;
  const actionType = stringField(raw["actionType"]);
  const subjectId  = stringField(raw["subjectId"]);

  if (!actionType || !ALLOWED_ACTIONS.has(actionType as MakerCheckerActionType)) {
    return NextResponse.json(
      { ok: false, error: `actionType must be one of: ${[...ALLOWED_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400 });
  }

  const payload = isRecord(raw["payload"]) ? (raw["payload"] as Record<string, unknown>) : {};

  try {
    const created = await createMakerCheckerRequest({
      tenantId: ctx.tenantId,
      initiatorId,
      actionType: actionType as MakerCheckerActionType,
      subjectId,
      payload,
    });
    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Create failed — service temporarily unavailable" },
      { status: 500 },
    );
  }
}

export const GET  = withGuard(handleGet);
export const POST = withGuard(handlePost);
