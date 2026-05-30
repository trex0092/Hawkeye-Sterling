// POST /api/live-adverse-media
// GET  /api/live-adverse-media?subject=<name>[&entityType=<type>][&jurisdiction=<j>]
//
// Alias for /api/adverse-media-live — delegates all logic there.
// Older dashboard widgets and the command-centre panel reference this path.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

// GET — convenience wrapper so dashboard panels can query by URL param
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const subjectName = (url.searchParams.get("subject") ?? "").trim();
  if (!subjectName) {
    return NextResponse.json(
      { ok: false, error: "subject query param required. Example: ?subject=John+Doe" },
      { status: 400, headers: gate.headers },
    );
  }
  const body = {
    subjectName,
    entityType: url.searchParams.get("entityType") ?? undefined,
    jurisdiction: url.searchParams.get("jurisdiction") ?? undefined,
  };
  try {
    const { POST } = await import("@/app/api/adverse-media-live/route");
    const synthetic = new Request(req.url.replace("/live-adverse-media", "/adverse-media-live"), {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", ...Object.fromEntries(req.headers) }),
      body: JSON.stringify(body),
    });
    return POST(synthetic);
  } catch (err) {
    console.error("[live-adverse-media] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Adverse media search failed" }, { status: 500, headers: gate.headers });
  }
}

// POST — same body as /api/adverse-media-live
export async function POST(req: Request): Promise<NextResponse> {
  const { POST: handler } = await import("@/app/api/adverse-media-live/route");
  return handler(req);
}

export async function OPTIONS(req: Request): Promise<NextResponse> {
  const { corsPreflight } = await import("@/lib/api/cors");
  return corsPreflight(req.headers.get("origin")) as unknown as NextResponse;
}
