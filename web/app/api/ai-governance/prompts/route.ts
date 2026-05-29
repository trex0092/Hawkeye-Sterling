// GET /api/ai-governance/prompts — prompt registry snapshot.
//
// Returns all registered prompt entries with their version, runtime hash, and
// drift status. Returns 409 when any prompt has drifted (text changed without
// a version bump) so health monitors can alert the AI governance team.
//
// Auth: Bearer ADMIN_TOKEN (admin-only — prompt metadata is sensitive).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { promptRegistry } from "@/lib/server/prompt-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  if (gate.keyId !== "portal_admin") {
    return NextResponse.json(
      { ok: false, error: "Forbidden — prompt registry requires admin access." },
      { status: 403, headers: gate.headers },
    );
  }

  const snapshot = promptRegistry.getRegistrySnapshot();
  const driftViolations = promptRegistry.validate();
  const hasDrift = driftViolations.length > 0;

  const body = {
    ok: !hasDrift,
    generatedAt: new Date().toISOString(),
    promptCount: snapshot.length,
    driftDetected: hasDrift,
    driftViolations,
    prompts: snapshot.map((e) => ({
      id: e.id,
      version: e.version,
      hash: e.hash,
      deployedAt: e.deployedAt,
      owner: e.owner,
      drifted: e.drifted,
    })),
  };

  return NextResponse.json(body, {
    status: hasDrift ? 409 : 200,
    headers: gate.headers,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
