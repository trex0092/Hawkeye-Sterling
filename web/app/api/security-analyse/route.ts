export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { type NextRequest, NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

interface SecurityFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  description: string;
  location: string;
  fix: string;
}

export interface AnalysisResult {
  summary: string;
  findings: SecurityFinding[];
  score: number;
  topPriority: string;
}

const SYSTEM_PROMPT = `You are a senior security researcher specialising in AML/compliance SaaS applications. Analyse the provided code for security vulnerabilities. Respond ONLY with a valid JSON object — no markdown, no backticks, no preamble. Format:
{
  "summary": "one sentence overview",
  "findings": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
      "title": "short title",
      "description": "what the issue is",
      "location": "where in the code",
      "fix": "concrete remediation step"
    }
  ],
  "score": <integer 0-100 where 100 is perfectly secure>,
  "topPriority": "single most urgent action"
}`;

export async function POST(req: NextRequest) {
  const gate = await enforce(req, { requireAuth: false });
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on this deployment" },
      { status: 503, headers: gate.headers }
    );
  }

  let code: string;
  try {
    const body = (await req.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json({ error: "code field required" }, { status: 400, headers: gate.headers });
    }
    code = body.code.slice(0, 40_000);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "security-analyse");

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyse this code from the Hawkeye Sterling compliance screening app:\n\n${code}`,
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(clean) as AnalysisResult;
    return NextResponse.json(result, { headers: gate.headers });
  } catch (e) {
    const msg =
      e instanceof SyntaxError
        ? "Model returned non-JSON — try again"
        : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500, headers: gate.headers });
  }
}
