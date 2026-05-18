import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadAllCases,
  mergeCases,
  saveAllCases,
} from "@/lib/server/case-vault";
import { generateCaseId, CASE_ID_RE } from "@/lib/server/case-id";
import { verifyRegulatorToken, tokenCoversScope } from "@/lib/server/regulator-jwt";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET  /api/cases
//   → { cases: CaseRecord[] } from the server vault. Empty array on a
//     fresh deployment (no migration; the client's localStorage is the
//     bootstrap source).
//
// POST /api/cases
//   Body: { cases: CaseRecord[] } — the client's current localStorage
//                                    state.
//   → { cases: merged CaseRecord[] } — server merges by id with
//     last-write-wins on lastActivity. Returned merged state is what
//     the client should now mirror locally.
//
// PUT  /api/cases
//   Body: { cases: CaseRecord[] } — REPLACE server state outright.
//   Used when the client wants to authoritatively reset the register
//   (e.g. after a bulk import). Gated identically to POST.

async function handleGet(req: Request): Promise<NextResponse> {
  // Regulator read-only path: accept Ed25519-signed regulator tokens as an
  // alternative to API-key auth. Scope is enforced — a case-scoped token
  // only returns that specific case; a tenant-scoped token returns all cases
  // for that tenant (read-only, no quota consumed).
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (rawToken && !rawToken.startsWith("hks_live_")) {
    const regClaims = verifyRegulatorToken(rawToken);
    if (regClaims) {
      // Determine tenant from scope (first tenant: entry, or "portal" default).
      const tenantEntry = regClaims.scope.find((s) => s.startsWith("tenant:"));
      const tenant = tenantEntry ? tenantEntry.slice(7) : "portal";
      const allowedCaseIds = regClaims.scope
        .filter((s) => s.startsWith("case:"))
        .map((s) => s.slice(5));

      const url = new URL(req.url);
      const requestedCaseId = url.searchParams.get("caseId");

      // Scope check: if a caseId is requested, it must be in the token scope.
      if (requestedCaseId && !tokenCoversScope(regClaims, { caseId: requestedCaseId, tenantId: tenant })) {
        return NextResponse.json(
          { ok: false, error: "scope_denied", hint: "Token scope does not cover the requested case." },
          { status: 403 },
        );
      }

      let cases = await loadAllCases(tenant);
      // If token has case-scope entries, restrict to those cases only.
      if (allowedCaseIds.length > 0) {
        cases = cases.filter((c) => allowedCaseIds.includes(c.id));
      }
      if (requestedCaseId) {
        cases = cases.filter((c) => c.id === requestedCaseId);
      }

      return NextResponse.json({
        ok: true,
        tenant,
        cases,
        totalCount: cases.length,
        regulatorAccess: true,
        examinerId: regClaims.sub,
      });
    }
  }

  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const includeArchived = url.searchParams.get("includeArchived") !== "false";
  const category = url.searchParams.get("category");
  const sourceType = url.searchParams.get("sourceType");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  let cases = await loadAllCases(tenant);

  if (statusFilter && statusFilter !== "all") {
    cases = cases.filter((c) => c.status === statusFilter);
  }
  if (!includeArchived) {
    cases = cases.filter((c) => c.status !== "closed");
  }
  if (category) {
    cases = cases.filter((c) => c.badge === category || c.evidence?.some((e) => e.category === category));
  }
  if (sourceType) {
    cases = cases.filter((c) => c.badge === sourceType);
  }

  const totalCount = cases.length;
  const page = cases.slice(offset, offset + limit);

  return NextResponse.json(
    { ok: true, tenant, cases: page, totalCount, limit, offset },
    { headers: gate.headers },
  );
}

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 10 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "request body too large (max 10 MB)" },
      { status: 413, headers: gate.headers },
    );
  }
  const tenant = tenantIdFromGate(gate);
  let body: { cases?: CaseRecord[] };
  try {
    body = (await req.json()) as { cases?: CaseRecord[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.cases)) {
    return NextResponse.json(
      { ok: false, error: "body.cases must be an array" },
      { status: 400, headers: gate.headers },
    );
  }
  // Stamp server-format CASE-YYYYMMDD-xxxx IDs for any case that lacks one.
  // The client learns the authoritative ID from the POST response and updates localStorage.
  const stamped = body.cases.map((c) =>
    c.id && CASE_ID_RE.test(c.id) ? c : { ...c, id: generateCaseId() },
  );
  const merged = await mergeCases(tenant, stamped);
  return NextResponse.json(
    { ok: true, tenant, cases: merged },
    { headers: gate.headers },
  );
}

async function handlePut(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  let body: { cases?: CaseRecord[] };
  try {
    body = (await req.json()) as { cases?: CaseRecord[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.cases)) {
    return NextResponse.json(
      { ok: false, error: "body.cases must be an array" },
      { status: 400, headers: gate.headers },
    );
  }
  await saveAllCases(tenant, body.cases);
  const saved = await loadAllCases(tenant);
  return NextResponse.json(
    { ok: true, tenant, cases: saved },
    { headers: gate.headers },
  );
}

export const GET = handleGet;
export const POST = handlePost;
export const PUT = handlePut;
