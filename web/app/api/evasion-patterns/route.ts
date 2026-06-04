// GET  /api/evasion-patterns — public pattern catalogue (no auth)
// POST /api/evasion-patterns — match context against evasion patterns (auth required)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  EXTENDED_EVASION_PATTERNS,
  matchEvasionPatterns,
  type MatchContext,
} from "@/lib/server/evasion-patterns";

// ---------------------------------------------------------------------------
// GET — public catalogue
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    patterns: EXTENDED_EVASION_PATTERNS,
    count: EXTENDED_EVASION_PATTERNS.length,
  });
}

// ---------------------------------------------------------------------------
// POST — match context against patterns (auth required)
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "evasion-patterns_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  let body: MatchContext;
  try {
    body = (await req.json()) as MatchContext;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // At least one context field required
  const hasContext =
    body.subjectName ||
    (body.aliases && body.aliases.length > 0) ||
    body.entityType ||
    body.jurisdiction ||
    body.transactionNarrative ||
    body.corporateLayers !== undefined ||
    (body.cryptoAddresses && body.cryptoAddresses.length > 0) ||
    body.passportCount !== undefined;

  if (!hasContext) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one context field to match against" },
      { status: 422, headers: gate.headers },
    );
  }

  const matches = matchEvasionPatterns(body);

  return NextResponse.json(
    {
      ok: true,
      matches,
      matchCount: matches.length,
      highConfidenceCount: matches.filter((m) => m.confidence >= 0.7).length,
      context: body,
    },
    { headers: gate.headers },
  );
}
