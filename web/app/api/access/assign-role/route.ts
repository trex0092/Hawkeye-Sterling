export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { USERS, type UserRole } from "../users/route";
import { PERMISSION_LOG } from "../permission-log/route";

const ROLE_MODULES: Record<UserRole, string[]> = {
  viewer: ["Screening", "Audit Trail"],
  analyst: ["Screening", "STR Cases", "Investigation", "Audit Trail"],
  supervisor: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "Investigation", "Audit Trail", "EWRA", "Playbook"],
  mlro: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "Responsible AI", "EWRA", "Playbook", "Investigation", "Audit Trail"],
  admin: ["Screening", "STR Cases", "MLRO Advisor", "Oversight", "Responsible AI", "EWRA", "Playbook", "Investigation", "Audit Trail", "Access Control"],
};

const FALLBACK_ASSESSMENT: Record<string, string> = {
  "viewer→analyst": "Promotion to Analyst grants read/write access to STR Cases and Investigation modules. The user can now draft and submit STR filings. Risk: ensure the user has completed mandatory AML training before activation.",
  "analyst→supervisor": "Supervisor role adds MLRO Advisor, Oversight, EWRA and Playbook access. The user gains authority to approve analyst submissions. Risk: validate that four-eyes controls are still in place for STR sign-offs.",
  "supervisor→mlro": "MLRO role grants full access to all operational modules including Responsible AI oversight. This is a regulated function under UAE FDL 10/2025 Art.8. Risk: confirm regulatory registration and notify the CBUAE of the MLRO appointment.",
  "default": "Role change modifies the user's module access profile. Review the Permission Matrix to confirm the new access scope is appropriate for the user's responsibilities. Ensure separation of duties is maintained.",
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
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
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
