// POST /api/crypto-chain
// Crypto chain analysis — single or batch wallet address analysis.
// Body: { address: string } | { addresses: string[] } (max 10)
// Auth required.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { analyzeWalletChain, type ChainAnalysisResult } from "@/lib/intelligence/crypto-chain";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface SingleBody {
  address: string;
  addresses?: never;
}

interface BatchBody {
  addresses: string[];
  address?: never;
}

type RequestBody = SingleBody | BatchBody;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 2 });
  if (!gate.ok) return gate.response;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Normalise to an address array
  let addresses: string[];
  if (body.addresses && Array.isArray(body.addresses)) {
    addresses = body.addresses;
  } else if (body.address && typeof body.address === "string") {
    addresses = [body.address];
  } else {
    return NextResponse.json(
      { ok: false, error: "Provide either `address` (string) or `addresses` (string array, max 10)" },
      { status: 422, headers: gate.headers },
    );
  }

  if (addresses.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one address is required" },
      { status: 422, headers: gate.headers },
    );
  }

  if (addresses.length > 10) {
    return NextResponse.json(
      { ok: false, error: "Maximum 10 addresses per request" },
      { status: 422, headers: gate.headers },
    );
  }

  // Validate all addresses are non-empty strings
  const invalid = addresses.filter((a) => typeof a !== "string" || !a.trim());
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: "All addresses must be non-empty strings" },
      { status: 422, headers: gate.headers },
    );
  }

  const trimmed = addresses.map((a) => a.trim());

  // Analyse addresses — run in parallel for batch efficiency
  const results: ChainAnalysisResult[] = await Promise.all(
    trimmed.map((addr) => analyzeWalletChain(addr)),
  );

  const isBatch = "addresses" in body && Array.isArray(body.addresses);

  if (isBatch) {
    return NextResponse.json(
      { ok: true, results, count: results.length },
      { headers: gate.headers },
    );
  }

  // Single address — return the first result directly (no wrapping array)
  return NextResponse.json(
    { ok: true, ...results[0] },
    { headers: gate.headers },
  );
}
