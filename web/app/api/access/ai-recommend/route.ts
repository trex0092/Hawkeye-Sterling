export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface RoleRecommendation {
  recommendedRole: string;
  rationale: string;
  suggestedModules: string[];
  risks: string[];
}

const FALLBACK: RoleRecommendation = {
  recommendedRole: "analyst",
  rationale: "Based on the provided responsibilities, the Analyst role provides appropriate access to Screening, STR Cases and Investigation modules while maintaining the principle of least privilege. The role supports day-to-day compliance operations without granting administrative or MLRO-level capabilities.",
  suggestedModules: ["Screening", "STR Cases", "Investigation", "Audit Trail"],
  risks: [
    "Ensure mandatory AML/CFT training is completed before activation.",
    "Confirm separation of duties — the user should not approve their own STR submissions.",
  ],
};

const ALL_MODULES = [
  "Screening",
  "STR Cases",
  "MLRO Advisor",
  "Oversight",
  "Responsible AI",
  "EWRA",
  "Playbook",
  "Investigation",
  "Audit Trail",
  "Access Control",
];

export async function POST(req: Request) {
  let body: { userName: string; jobTitle: string; department: string; responsibilities: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userName, jobTitle, department, responsibilities } = body;
  if (!userName || !jobTitle || !department || !responsibilities) {
    return NextResponse.json({ ok: false, error: "userName, jobTitle, department and responsibilities are required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "access/ai-recommend temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: `You are an AML access-control specialist for Hawkeye Sterling, a UAE-regulated gold trading firm. The platform has five roles: viewer (read-only screening + audit trail), analyst (+ STR Cases, Investigation), supervisor (+ MLRO Advisor, Oversight, EWRA, Playbook), mlro (all except Access Control), admin (all modules including Access Control). Available modules: ${ALL_MODULES.join(", ")}.

Given a new user's details, recommend the most appropriate role and modules, following the principle of least privilege and UAE FDL 10/2025 segregation-of-duties requirements.

Return ONLY valid JSON (no markdown fences):
{
  "recommendedRole": "viewer|analyst|supervisor|mlro|admin",
  "rationale": "2-3 sentence explanation",
  "suggestedModules": ["module names"],
  "risks": ["risk 1", "risk 2"]
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Name: ${userName}\nJob Title: ${jobTitle}\nDepartment: ${department}\nResponsibilities: ${responsibilities}\n\nRecommend the appropriate platform role and module access.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RoleRecommendation;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "access/ai-recommend temporarily unavailable - please retry." }, { status: 503 });
  }
}
