import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadAllCases,
  mergeCases,
  saveAllCases,
} from "@/lib/server/case-vault";
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
  const merged = await mergeCases(tenant, body.cases);
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
