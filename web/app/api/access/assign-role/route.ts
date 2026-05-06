export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { USERS, PERMISSION_LOG, ROLE_MODULES, type UserRole } from "../_store";

const FALLBACK_ASSESSMENT: Record<string, string> = {
  "trading→compliance": "Upgrading from Trading to Compliance Department grants full platform access including MLRO Advisor, STR Cases, Playbook and Access Control. Verify the user's AML certification and obtain senior management approval before activation per FDL 10/2025 Art.20.",
  "accounts→compliance": "Upgrading from Accounts to Compliance Department grants full platform access. Verify mandatory AML/CFT training completion and ensure separation-of-duties controls are documented.",
  "logistics→management": "Management access adds Oversight, EWRA, and MLRO Advisor read access. The user can now review board-level compliance reports. Risk: ensure the user understands their read-only advisory access to the MLRO module.",
  "compliance→management": "Downgrading to Management Department removes Access Control and advanced investigation modules. Confirm the user no longer needs MLRO-level access before applying this change.",
  "default": "Department role change modifies the user's module access profile. Review the Permission Matrix to confirm the new access scope is appropriate for the user's responsibilities. Ensure separation of duties is maintained per UAE FDL 10/2025 Art.20.",
};

export async function POST(req: Request) {
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

  const userIdx = USERS.findIndex((u) => u.id === userId);
  if (userIdx === -1) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const user = USERS[userIdx]!;
  const oldRole = user.role;

  // Update user role and modules
  USERS[userIdx] = {
    ...user,
    role: newRole,
    modules: ROLE_MODULES[newRole] ?? user.modules,
  };

  // Log the change
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
  PERMISSION_LOG.push(logEntry);

  // Generate AI impact assessment with prompt caching
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  let impactAssessment = FALLBACK_ASSESSMENT[`${oldRole}→${newRole}`] ?? FALLBACK_ASSESSMENT["default"]!;

  if (apiKey) {
    try {
      const client = getAnthropicClient(apiKey, 22_000);
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
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
    user: USERS[userIdx],
    logEntry,
    impactAssessment,
  });
}
