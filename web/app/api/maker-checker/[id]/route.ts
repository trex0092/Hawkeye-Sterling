// GET  /api/maker-checker/[id]            → get single request
// POST /api/maker-checker/[id]            → approve or reject (body: { decision, note })

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import {
  getRequestById,
  approveMakerCheckerRequest,
  rejectMakerCheckerRequest,
} from "@/lib/server/maker-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;

function safeId(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 96 || !SAFE_ID_RE.test(raw)) return null;
  return raw;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function handleGet(
  _req: Request,
  ctx: RequestContext,
  params: { id: string },
): Promise<NextResponse> {
  const id = safeId(params.id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });

  const item = await getRequestById(id, ctx.tenantId);
  if (!item) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, item });
}

async function handlePost(
  req: Request,
  ctx: RequestContext,
  params: { id: string },
): Promise<NextResponse> {
  const id = safeId(params.id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }

  const decision = stringField(raw["decision"]);
  const note     = stringField(raw["note"]) ?? "";

  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { ok: false, error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  // Resolve checker identity from the authenticated API key context — not the
  // request body — so the caller cannot impersonate another operator.
  const checkerId = ctx.apiKey.name || ctx.apiKey.email || ctx.apiKey.id;
  if (!checkerId) {
    return NextResponse.json(
      { ok: false, error: "checker identity could not be resolved from auth context" },
      { status: 403 },
    );
  }

  try {
    const updated =
      decision === "approve"
        ? await approveMakerCheckerRequest(id, checkerId, note || undefined)
        : await rejectMakerCheckerRequest(id, checkerId, note);

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "operation failed";
    // Distinguish self-approval (403) from other errors (500)
    const status = msg.includes("self-approval") || msg.includes("self-rejection") ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// Next.js App Router passes route params as { params: Promise<{ id }> }
// We bridge to our internal handler pattern with an intermediate wrapper.

type RouteCtx = { params: Promise<{ id: string }> };

function makeHandler(
  fn: (req: Request, ctx: RequestContext, params: { id: string }) => Promise<NextResponse>,
) {
  return withGuard(async (req: Request, ctx: RequestContext, routeCtx?: RouteCtx) => {
    const params = routeCtx ? await routeCtx.params : { id: "" };
    return fn(req, ctx, params);
  });
}

export const GET  = makeHandler(handleGet);
export const POST = makeHandler(handlePost);
