import { NextResponse } from "next/server";
import { publicKeyJwk } from "@/lib/server/report-pubkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /.well-known/jwks.json
//
// Serves the report-signing public key as a JSON Web Key Set (RFC 7517).
// Verifiers fetch this once, cache by `kid`, then use it to verify any
// `report.signature_ed25519` they receive from a Hawkeye Sterling
// deployment.
//
// Empty `keys` array when REPORT_ED25519_PRIVATE_KEY is unset — the
// endpoint stays valid (so verifiers don't 404) but signals "no
// signing key configured on this deployment".

export function GET(): NextResponse {
  const jwk = publicKeyJwk();
  return NextResponse.json(
    { keys: jwk ? [jwk] : [] },
    {
      status: 200,
      headers: {
        "content-type": "application/jwk-set+json; charset=utf-8",
        // RFC-conformant well-known endpoints should be cacheable.
        // 5 min lets a key rotation propagate quickly while still
        // sparing the server from per-request load.
        "cache-control": "public, max-age=300, must-revalidate",
      },
    },
  );
}
