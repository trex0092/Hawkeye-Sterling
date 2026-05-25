// GET   /api/admin/tenants/[tenantId] — get tenant details (admin only)
// PATCH /api/admin/tenants/[tenantId] — update tenant name/plan (admin only)

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin-auth";
import { getJson, setJson } from "@/lib/server/store";
import type { TenantRecord, TenantPlan } from "../route";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLANS: TenantPlan[] = ["free", "starter", "pro", "enterprise"];
const TENANT_KEY_PREFIX = "tenants:";

// ── GET — get single tenant ───────────────────────────────────────────────────

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> },
): Promise<NextResponse> {
  const authError = adminAuth(req);
  if (authError) return authError;

  const { tenantId } = await context.params;
  if (!tenantId?.trim()) {
    return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
  }

  const key = `${TENANT_KEY_PREFIX}${tenantId}`;
  let record: TenantRecord | null = null;

  try {
    record = await getJson<TenantRecord>(key);
  } catch (err) {
    console.error("[admin/tenants/id] GET failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to retrieve tenant." }, { status: 500 });
  }

  if (!record) {
    return NextResponse.json({ ok: false, error: `Tenant "${tenantId}" not found.` }, { status: 404 });
  }

  return NextResponse.json({ ok: true, tenant: record });
}

// ── PATCH — update tenant ─────────────────────────────────────────────────────

interface PatchTenantBody {
  name?: string;
  plan?: TenantPlan;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string }> },
): Promise<NextResponse> {
  const authError = adminAuth(req);
  if (authError) return authError;

  const { tenantId } = await context.params;
  if (!tenantId?.trim()) {
    return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
  }

  let body: PatchTenantBody;
  try {
    body = (await req.json()) as PatchTenantBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body.name && !body.plan) {
    return NextResponse.json(
      { ok: false, error: "At least one of name or plan must be provided." },
      { status: 400 },
    );
  }

  if (body.plan && !VALID_PLANS.includes(body.plan)) {
    return NextResponse.json(
      { ok: false, error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const key = `${TENANT_KEY_PREFIX}${tenantId}`;

  let existing: TenantRecord | null = null;
  try {
    existing = await getJson<TenantRecord>(key);
  } catch (err) {
    console.error("[admin/tenants/id] PATCH read failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to read tenant." }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ ok: false, error: `Tenant "${tenantId}" not found.` }, { status: 404 });
  }

  const updated: TenantRecord = {
    ...existing,
    ...(body.name?.trim() ? { name: body.name.trim() } : {}),
    ...(body.plan ? { plan: body.plan } : {}),
  };

  try {
    await setJson(key, updated);
  } catch (err) {
    console.error("[admin/tenants/id] PATCH write failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to update tenant." }, { status: 500 });
  }

  void writeAuditChainEntry(
    { event: "tenant.updated", actor: "portal_admin", meta: { tenantId, changes: body } },
    tenantId,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, tenant: updated });
}
