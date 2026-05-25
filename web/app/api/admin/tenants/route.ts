// GET /api/admin/tenants  — list all tenants (admin only)
// POST /api/admin/tenants — create a new tenant record (admin only)

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin-auth";
import { getJson, setJson, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TenantPlan = "free" | "starter" | "pro" | "enterprise";

export interface TenantRecord {
  id: string;
  name: string;
  plan: TenantPlan;
  createdAt: string;
}

const TENANT_KEY_PREFIX = "tenants:";

// ── GET — list all tenants ────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const authError = adminAuth(req);
  if (authError) return authError;

  try {
    const keys = await listKeys(TENANT_KEY_PREFIX);
    const tenants: TenantRecord[] = [];

    await Promise.all(
      keys.map(async (key) => {
        const record = await getJson<TenantRecord>(key);
        if (record) tenants.push(record);
      }),
    );

    // Sort by createdAt descending (newest first)
    tenants.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ ok: true, tenants, count: tenants.length });
  } catch (err) {
    console.error("[admin/tenants] GET failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to list tenants." }, { status: 500 });
  }
}

// ── POST — create a new tenant ────────────────────────────────────────────────

interface CreateTenantBody {
  id: string;
  name: string;
  plan: TenantPlan;
}

const VALID_PLANS: TenantPlan[] = ["free", "starter", "pro", "enterprise"];
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;

export async function POST(req: Request): Promise<NextResponse> {
  const authError = adminAuth(req);
  if (authError) return authError;

  let body: CreateTenantBody;
  try {
    body = (await req.json()) as CreateTenantBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { id, name, plan } = body;

  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }
  if (!ID_RE.test(id.trim())) {
    return NextResponse.json(
      { ok: false, error: "id must be 3–64 lowercase alphanumeric characters, hyphens, or underscores" },
      { status: 400 },
    );
  }
  if (!name?.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }
  if (!plan || !VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { ok: false, error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const key = `${TENANT_KEY_PREFIX}${id.trim()}`;

  // Check for duplicate
  const existing = await getJson<TenantRecord>(key);
  if (existing) {
    return NextResponse.json(
      { ok: false, error: `Tenant with id "${id}" already exists.` },
      { status: 409 },
    );
  }

  const record: TenantRecord = {
    id: id.trim(),
    name: name.trim(),
    plan,
    createdAt: new Date().toISOString(),
  };

  try {
    await setJson(key, record);
  } catch (err) {
    console.error("[admin/tenants] POST store write failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to create tenant." }, { status: 500 });
  }

  void writeAuditChainEntry(
    { event: "tenant.created", actor: "portal_admin", meta: { id: record.id, name: record.name, plan: record.plan } },
    record.id,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json({ ok: true, tenant: record }, { status: 201 });
}
