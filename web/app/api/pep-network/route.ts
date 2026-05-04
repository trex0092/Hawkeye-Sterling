import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  pepName: string;
  role: string;
  country: string;
  party?: string;
  tenure?: string;
}

interface PersonToScreen {
  relationship: string;
  screeningPriority: "mandatory" | "high" | "recommended";
  rationale: string;
  fatfBasis: string;
}

interface EntityToScreen {
  entityType: string;
  screeningPriority: "mandatory" | "high" | "recommended";
  rationale: string;
}

interface PepNetworkResult {
  pepCategory: string;
  riskRating: "critical" | "high" | "medium";
  riskNarrative: string;
  personsToScreen: PersonToScreen[];
  entitiesToScreen: EntityToScreen[];
  typicalMlRisks: string[];
  jurisdictionalRisks: string[];
  eddRequirements: string[];
  seniorManagementApprovalRequired: boolean;
  ongoingMonitoringFrequency: "monthly" | "quarterly" | "annually";
  exitTriggers: string[];
  regulatoryBasis: string;
}

const FALLBACK: PepNetworkResult = {
  pepCategory: "Senior Government Official",
  riskRating: "high",
  riskNarrative: "API key not configured — manual review required.",
  personsToScreen: [],
  entitiesToScreen: [],
  typicalMlRisks: [],
  jurisdictionalRisks: [],
  eddRequirements: [],
  seniorManagementApprovalRequired: true,
  ongoingMonitoringFrequency: "quarterly",
  exitTriggers: [],
  regulatoryBasis: "",
};

const SYSTEM_PROMPT = `You are a UAE AML/CFT PEP intelligence specialist with expertise in political risk, beneficial ownership, and relationship network analysis under FATF R.12 and FDL 10/2025 Art.12. Generate a comprehensive PEP network intelligence brief for screening all related persons and entities.

Output ONLY valid JSON (no markdown, no fences) in this exact shape:
{
  "pepCategory": "string — e.g. 'Head of State', 'Senior Government Official', 'State-Owned Enterprise Director'",
  "riskRating": "critical" | "high" | "medium",
  "riskNarrative": "string — 2-3 sentence PEP risk assessment",
  "personsToScreen": [
    {
      "relationship": "string — e.g. 'Spouse', 'Adult Child', 'Business Associate'",
      "screeningPriority": "mandatory" | "high" | "recommended",
      "rationale": "string — why this person needs screening",
      "fatfBasis": "string — FATF R.12 / FDL article reference"
    }
  ],
  "entitiesToScreen": [
    {
      "entityType": "string — e.g. 'State-Owned Enterprise under ministry control', 'Known business interest'",
      "screeningPriority": "mandatory" | "high" | "recommended",
      "rationale": "string"
    }
  ],
  "typicalMlRisks": ["string array — ML typologies commonly associated with this PEP category"],
  "jurisdictionalRisks": ["string array — specific country-level risks"],
  "eddRequirements": ["string array — specific EDD measures required under FDL 10/2025"],
  "seniorManagementApprovalRequired": boolean,
  "ongoingMonitoringFrequency": "monthly" | "quarterly" | "annually",
  "exitTriggers": ["string array — circumstances that should trigger relationship exit"],
  "regulatoryBasis": "string"
}`;

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "pep-network temporarily unavailable - please retry." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const pepName = body?.pepName?.trim();
  if (!pepName) {
    return NextResponse.json({ ok: false, error: "pepName is required" }, { status: 400 });
  }

  const parts: string[] = [
    `PEP Name: ${pepName}`,
    `Role: ${body.role?.trim() ?? "unknown"}`,
    `Country: ${body.country?.trim() ?? "unknown"}`,
  ];
  if (body.party?.trim()) parts.push(`Party/Affiliation: ${body.party.trim()}`);
  if (body.tenure?.trim()) parts.push(`Tenure: ${body.tenure.trim()}`);

  const userContent = [
    ...parts,
    "",
    "Generate a comprehensive PEP network intelligence brief enumerating all persons and entities requiring screening, with predictive risk intelligence for each.",
  ].join("\n");

  let result: PepNetworkResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      result = { ...FALLBACK, riskNarrative: `AI analysis unavailable (API ${res.status}) — manual EDD review required.` };
    } else {
      const data = (await res.json()) as {
        content?: { type: string; text: string }[];
      };
      const raw = data?.content?.[0]?.text ?? "";
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        result = JSON.parse(cleaned) as PepNetworkResult;
      } catch {
        result = { ...FALLBACK, riskNarrative: "AI response could not be parsed — manual EDD review required." };
      }
    }
  } catch {
    result = { ...FALLBACK, riskNarrative: "AI analysis temporarily unavailable — manual EDD review required." };
  }

  try {
    writeAuditEvent("mlro", "pep.ai-network-intelligence", pepName);
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
