import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-source tenant identity. Each Netlify site sets its own
// TENANT_NAME so the same Hawkeye Sterling codebase powers N client
// deployments without per-tenant code forks. The client pulls this
// once on page load and renders the name wherever needed.
//
// Falls back to "—" when unset so an unconfigured deploy can't
// accidentally leak one tenant's name into another's artefacts.

export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    name: process.env["TENANT_NAME"] ?? "—",
  });
}
