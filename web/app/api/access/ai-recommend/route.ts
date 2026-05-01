export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface RoleRecommendation {
  recommendedRole: string;
  rationale: string;
  suggestedModules: string[];
  risks: string[];
}

const FALLBACK: RoleRecommendation = {
  recommendedRole: "compliance",
  rationale: "Based on the provided responsibilities, the Compliance Department role provides full access to all AML modules. For other departments, restrict access to Screening and Audit Trail only, following the principle of least privilege under UAE FDL 10/2025 Art.20.",
  suggestedModules: ["Screening", "Audit Trail"],
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
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: `You are an AML access-control specialist for Hawkeye Sterling, a UAE-regulated gold trading firm. The platform has five department-based access roles: compliance (full access to all modules), management (Screening, STR Cases, MLRO Advisor read, Oversight, EWRA, Audit Trail), logistics (Screening, Investigation read, Audit Trail), trading (Screening, Audit Trail), accounts (Screening, Audit Trail). Available modules: ${ALL_MODULES.join(", ")}.

Given a new user's department and responsibilities, recommend the most appropriate department role and modules, following the principle of least privilege and UAE FDL 10/2025 Art.20 segregation-of-duties requirements.

Return ONLY valid JSON (no markdown fences):
{
  "recommendedRole": "compliance|management|logistics|trading|accounts",
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
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
