import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Supplier {
  id: string;
  name: string;
  jurisdiction: string;
  tier: string;
  lbmaListed: boolean;
  dgdListed: boolean;
  flags: string[];
}

interface VendorRiskResult {
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  eddRequired: boolean;
  findings: string[];
  redFlags: string[];
  recommendation: string;
  regulatoryBasis: string;
}

interface RequestBody {
  supplier: Supplier;
}

const FALLBACK_RESULT: VendorRiskResult = {
  riskScore: 0,
  riskLevel: "low",
  eddRequired: false,
  findings: ["API key not configured"],
  redFlags: [],
  recommendation: "Manual review required",
  regulatoryBasis: "",
};

const SYSTEM_PROMPT = `You are a UAE DPMS mineral supply-chain risk analyst specialising in precious metals compliance under:
- LBMA Responsible Gold Guidance v9 (LBMA RGG v9)
- OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas (4th ed.)
- UAE Ministry of Economy Circular 2/2024 on DPMS supervision
- FATF Guidance on DPMS (2020)

CAHRA jurisdictions requiring mandatory EDD include but are not limited to: DRC, Sudan, CAR, South Sudan, Mali, Burkina Faso, Somalia, Zimbabwe, Venezuela, Myanmar, North Korea, Iran.

Risk assessment rules:
- No LBMA Good Delivery listing is high risk for precious metal suppliers
- CAHRA jurisdiction exposure requires EDD and minimum "high" risk level
- Critical-tier suppliers missing DGD need immediate review and "high" or "critical" rating
- Combination of no-LBMA + no-DGD + critical tier = "critical" risk
- Multiple red flags escalate risk level

Respond ONLY with valid JSON (no markdown fences) in this exact format:
{
  "riskScore": <0-100>,
  "riskLevel": "<critical|high|medium|low>",
  "eddRequired": <true|false>,
  "findings": ["<finding>", ...],
  "redFlags": ["<red flag>", ...],
  "recommendation": "<one-sentence recommendation>",
  "regulatoryBasis": "<applicable regulatory references>"
}`;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { supplier } = body;

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "vendor-risk temporarily unavailable - please retry." }, { status: 503 });
  }

  const userContent = `Assess the supply-chain risk for the following supplier:

Supplier ID: ${supplier.id}
Name: ${supplier.name}
Jurisdiction: ${supplier.jurisdiction}
Tier: ${supplier.tier}
LBMA Good Delivery Listed: ${supplier.lbmaListed ? "Yes" : "No"}
DGD (Dubai Good Delivery) Listed: ${supplier.dgdListed ? "Yes" : "No"}
Existing Flags: ${supplier.flags.length > 0 ? supplier.flags.join(", ") : "none"}`;

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!claudeRes.ok) {
    return NextResponse.json({ ok: false, error: "vendor-risk temporarily unavailable - please retry." }, { status: 503 });
  }

  interface ClaudeContent { type: string; text?: string }
  interface ClaudeResponse { content: ClaudeContent[] }
  const claudeData = (await claudeRes.json()) as ClaudeResponse;
  const rawText = claudeData.content.find((b) => b.type === "text")?.text ?? "";

  let result: VendorRiskResult;
  try {
    const cleaned = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    result = JSON.parse(cleaned) as VendorRiskResult;
  } catch {
    return NextResponse.json({ ok: false, error: "vendor-risk temporarily unavailable - please retry." }, { status: 503 });
  }

  try {
    writeAuditEvent("mlro", "vendor-dd.ai-risk", `assessed supplier ${supplier.id} (${supplier.name})`);
  } catch {
    // Non-fatal — server-side localStorage is unavailable
  }

  return NextResponse.json({ ok: true, result });
}
