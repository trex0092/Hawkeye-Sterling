export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { loadUsers, saveUsers, withUsersLock, appendPermissionLog, ROLE_MODULES, type UserRole, type AccessUser } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

const FALLBACK_ASSESSMENT: Record<string, string> = {
  "trading→compliance": "Upgrading from Trading to Compliance Department grants full platform access including MLRO Advisor, STR Cases, Playbook and Access Control. Verify the user's AML certification and obtain senior management approval before activation per FDL 10/2025 Art.20.",
  "accounts→compliance": "Upgrading from Accounts to Compliance Department grants full platform access. Verify mandatory AML/CFT training completion and ensure separation-of-duties controls are documented.",
  "logistics→management": "Management access adds Oversight, EWRA, and MLRO Advisor read access. The user can now review board-level compliance reports. Risk: ensure the user understands their read-only advisory access to the MLRO module.",
  "compliance→management": "Downgrading to Management Department removes Access Control and advanced investigation modules. Confirm the user no longer needs MLRO-level access before applying this change.",
  "default": "Department role change modifies the user's module access profile. Review the Permission Matrix to confirm the new access scope is appropriate for the user's responsibilities. Ensure separation of duties is maintained per UAE FDL 10/2025 Art.20.",
};

export async function POST(req: Request) {
  const deny = adminAuth(req);
  if (deny) return deny;
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { userId: string; newRole: UserRole; reason: string; assignedBy: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { userId, newRole, reason, assignedBy } = body;
  if (!userId || !newRole || !reason || !assignedBy) {
    return NextResponse.json({ ok: false, error: "userId, newRole, reason and assignedBy are required" }, { status: 400 , headers: gate.headers });
  }

  if (!(newRole in ROLE_MODULES)) {
    return NextResponse.json(
      { ok: false, error: `newRole must be one of: ${Object.keys(ROLE_MODULES).join(", ")}` },
      { status: 400, headers: gate.headers }
    );
  }

  type LockResult =
    | { kind: 'error'; status: number; message: string }
    | { kind: 'ok'; updatedUser: AccessUser; oldRole: UserRole; users: AccessUser[] };

  const lockResult = await withUsersLock<LockResult>(async () => {
    const loadedUsers = await loadUsers();
    const userIdx = loadedUsers.findIndex((u) => u.id === userId);
    if (userIdx === -1) return { kind: 'error', status: 404, message: "User not found" };
    const target = loadedUsers[userIdx]!;
    const oldRole = target.role;
    const updatedUser = { ...target, role: newRole, modules: ROLE_MODULES[newRole] ?? target.modules };
    const updatedUsers = [...loadedUsers];
    updatedUsers[userIdx] = updatedUser;
    await saveUsers(updatedUsers);
    return { kind: 'ok', updatedUser, oldRole, users: updatedUsers };
  });

  if (lockResult.kind === 'error') {
    return NextResponse.json(
      { ok: false, error: lockResult.message },
      { status: lockResult.status, headers: gate.headers },
    );
  }

  const { updatedUser, oldRole, users } = lockResult;
  const user = users.find((u) => u.id === userId)!;

  const logEntry = {
    id: `log-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actor: assignedBy,
    action: "role_assigned" as const,
    targetUserId: userId,
    targetUserName: user.name,
    oldRole,
    newRole,
    reason,
  };
  await appendPermissionLog(logEntry);

  // FDL 10/2025 Art.20 — role assignments are privileged access-control events;
  // must be on the tamper-evident server-side chain.
  const tenant = tenantIdFromGate(gate);
  void writeAuditChainEntry(
    {
      event: "access.role_assigned",
      actor: gate.keyId,
      assignedBy,
      userId,
      targetUserName: user.name,
      oldRole,
      newRole,
      reason,
    },
    tenant,
  ).catch((err) =>
    console.warn("[access/assign-role] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  // Generate AI impact assessment with prompt caching
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  let impactAssessment = FALLBACK_ASSESSMENT[`${oldRole}→${newRole}`] ?? FALLBACK_ASSESSMENT["default"]!;

  if (apiKey) {
    const safeUserName = sanitizeField(user.name, 200);
    const safeOldRole = sanitizeField(oldRole, 50);
    const safeNewRole = sanitizeField(newRole, 50);
    const safeReason = sanitizeText(reason, 500);
    const safeAssignedBy = sanitizeField(assignedBy, 100);
    try {
      const client = getAnthropicClient(apiKey, 55_000);
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: `You are an AML compliance access-control expert for a UAE-regulated gold trading firm operating under FDL 10/2025 and CBUAE AML Standards. When a user's role changes within the Hawkeye Sterling AML platform, assess the impact in 2–3 sentences: what access changes occur, and what specific risks or considerations arise. Be concise and practical. Return only plain text — no markdown, no bullet points.`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `User: ${safeUserName} | Old role: ${safeOldRole} | New role: ${safeNewRole} | Reason: ${safeReason} | Assigned by: ${safeAssignedBy}. Provide a brief role change impact assessment.`,
          },
        ],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
      if (text) impactAssessment = text;
    } catch {
      // fall through to fallback
    }
  }

  const { passwordHash: _h, passwordSalt: _s, ...safeUser } = updatedUser;
  return NextResponse.json({
    ok: true,
    user: safeUser,
    logEntry,
    impactAssessment,
  }, { headers: gate.headers });
}
