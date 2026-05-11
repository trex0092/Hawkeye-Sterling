// GET  /api/operator/registry       — read the full agent registry
// POST /api/operator/registry       — persist a fresh registry snapshot to Blobs
//
// Controls 1.01/1.05 — agent lifecycle management and central AI asset catalogue.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { buildRegistry, loadRegistry, persistRegistry } from "@/lib/mcp/agent-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function handleGet(_req: Request): Promise<NextResponse> {
  const registry = await loadRegistry();
  return NextResponse.json({ ok: true, registry });
}

async function handlePost(_req: Request): Promise<NextResponse> {
  const registry = buildRegistry();
  await persistRegistry(registry);
  return NextResponse.json({ ok: true, message: "Registry snapshot persisted.", registry });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
