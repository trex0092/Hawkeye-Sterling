import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-source tenant identity. Set TENANT_NAME (and optionally
// TENANT_JURISDICTION / TENANT_REGISTRATION) per Netlify site so
// the same Hawkeye Sterling codebase powers N client deployments
// without any per-tenant code forks. The client pulls this once on
// page load and renders the tenant label wherever needed.
//
// Falls back to "—" rather than a hardcoded company name so an
// unconfigured deploy can't accidentally leak one tenant's name
// into another's artefacts.

export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    name: process.env["TENANT_NAME"] ?? "—",
    jurisdiction: process.env["TENANT_JURISDICTION"] ?? undefined,
    registration: process.env["TENANT_REGISTRATION"] ?? undefined,
  });
}
