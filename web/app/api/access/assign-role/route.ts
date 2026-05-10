export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { loadUsers, saveUsers, appendPermissionLog, ROLE_MODULES, type UserRole } from "../_store";
import { adminAuth } from "@/lib/server/admin-auth";

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, newRole, reason, assignedBy } = body;
  if (!userId || !newRole || !reason || !assignedBy) {
    return NextResponse.json({ ok: false, error: "userId, newRole, reason and assignedBy are required" }, { status: 400 });
  }

  const users = await loadUsers();
  const userIdx = users.findIndex((u) => u.id === userId);
  if (userIdx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = users[userIdx]!;
  const oldRole = user.role;
  const updatedUsers = [...users];
  updatedUsers[userIdx] = {
    ...user,
    role: newRole,
    modules: ROLE_MODULES[newRole] ?? user.modules,
  };
  await saveUsers(updatedUsers);

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

  // Generate AI impact assessment with prompt caching
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  let impactAssessment = FALLBACK_ASSESSMENT[`${oldRole}→${newRole}`] ?? FALLBACK_ASSESSMENT["default"]!;

  if (apiKey) {
    try {
      const client = getAnthropicClient(apiKey, 22_000);
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: `You are an AML compliance access-control expert for a UAE-regulated gold trading firm operating under FDL 20/2018, FDL 10/2025, and CBUAE AML Standards. When a user's role changes within the Hawkeye Sterling AML platform, assess the impact in 2–3 sentences: what access changes occur, and what specific risks or considerations arise. Be concise and practical. Return only plain text — no markdown, no bullet points.`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `User: ${user.name} | Old role: ${oldRole} | New role: ${newRole} | Reason: ${reason} | Assigned by: ${assignedBy}. Provide a brief role change impact assessment.`,
          },
        ],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
      if (text) impactAssessment = text;
    } catch {
      // fall through to fallback
    }
  }

  return NextResponse.json({
    ok: true,
    user: updatedUsers[userIdx],
    logEntry,
    impactAssessment,
  });
}
