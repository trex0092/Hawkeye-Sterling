// GET  /api/admin/rbac — list all users and their roles
// POST /api/admin/rbac — assign a role to a user
// Auth required. Only super_admin / mlro / it_admin may call this.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listApiKeys, type ApiKeyRecord } from "@/lib/server/api-keys";
import { getJson, setJson } from "@/lib/server/store";
import { ROLE_MANAGERS, isValidRole, type UserRole } from "@/lib/server/rbac";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

const ALL_ROLES = ["super_admin", "mlro", "senior_analyst", "junior_analyst", "auditor", "compliance_officer", "it_admin"] as const;

// ---------------------------------------------------------------------------
// Role store helpers
// ---------------------------------------------------------------------------

async function getUsersWithRoles(): Promise<
  Array<{ id: string; name: string; email: string; role: string | null; tier: string }>
> {
  const keys = await listApiKeys();
  return keys
    .filter((r) => !r.revokedAt)
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role ?? null,
      tier: r.tier,
    }));
}

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

async function assignRole(userId: string, role: UserRole): Promise<{ ok: boolean; error?: string }> {
  const key = `keys/${safeSegment(userId)}`;
  const record = await getJson<ApiKeyRecord>(key);
  if (!record) return { ok: false, error: "user not found" };
  const updated: ApiKeyRecord = { ...record, role };
  await setJson(key, updated);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// GET — list users + roles
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Gate: only role-manager roles may list user roles
  const callerRole = gate.record?.role ?? null;
  if (!callerRole || !ROLE_MANAGERS.includes(callerRole as UserRole)) {
    return NextResponse.json(
      { ok: false, error: "Insufficient permissions — requires super_admin, mlro, or it_admin" },
      { status: 403, headers: gate.headers },
    );
  }

  const users = await getUsersWithRoles();
  return NextResponse.json({ ok: true, users }, { headers: gate.headers });
}

// ---------------------------------------------------------------------------
// POST — assign role to user
// ---------------------------------------------------------------------------

interface AssignRoleBody {
  userId: string;
  role: UserRole;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Gate: only role-manager roles may assign roles
  const callerRole = gate.record?.role ?? null;
  if (!callerRole || !ROLE_MANAGERS.includes(callerRole as UserRole)) {
    return NextResponse.json(
      { ok: false, error: "Insufficient permissions — requires super_admin, mlro, or it_admin" },
      { status: 403, headers: gate.headers },
    );
  }

  let body: AssignRoleBody;
  try {
    body = (await req.json()) as AssignRoleBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.userId || typeof body.userId !== "string") {
    return NextResponse.json(
      { ok: false, error: "userId is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (!body.role || !isValidRole(body.role)) {
    return NextResponse.json(
      { ok: false, error: `role must be one of: ${ALL_ROLES.join(", ")}` },
      { status: 422, headers: gate.headers },
    );
  }

  const result = await assignRole(body.userId, body.role);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 404, headers: gate.headers },
    );
  }

  void writeAuditChainEntry(
    { event: "rbac.role_assigned", actor: gate.keyId, meta: { targetUserId: body.userId, role: body.role } },
    tenantIdFromGate(gate),
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
  return NextResponse.json(
    { ok: true, userId: body.userId, role: body.role },
    { headers: gate.headers },
  );
}
