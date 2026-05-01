import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  facts: string;
  subjectType?: string;
  transactionTypes?: string[];
  jurisdictions?: string[];
  redFlags?: string[];
}

interface PrimaryTypology {
  name: string;
  fatfReference: string;
  matchStrength: "strong" | "moderate" | "weak";
  matchRationale: string;
}

interface SecondaryTypology {
  name: string;
  fatfReference: string;
  matchStrength: "strong" | "moderate" | "weak";
  overlap: string;
}

interface InvestigativePriority {
  step: number;
  action: string;
  rationale: string;
  tool: string;
}

interface TypologyMatchResult {
  primaryTypology: PrimaryTypology;
  secondaryTypologies: SecondaryTypology[];
  keyIndicators: string[];
  missingIndicators: string[];
  investigativePriorities: InvestigativePriority[];
  strThreshold: string;
  predicate: string;
  uaeCaseContext: string;
  regulatoryBasis: string;
}

const FALLBACK: TypologyMatchResult = {
  primaryTypology: {
    name: "Unknown",
    fatfReference: "",
    matchStrength: "weak",
    matchRationale: "AI analysis unavailable.",
  },
  secondaryTypologies: [],
  keyIndicators: [],
  missingIndicators: [],
  investigativePriorities: [],
  strThreshold: "Manual assessment required.",
  predicate: "",
  uaeCaseContext: "",
  regulatoryBasis: "",
};

const SYSTEM_PROMPT = `You are a UAE AML/CFT typology expert with comprehensive knowledge of all FATF typology reports, MENAFATF typologies, UAE FIU case studies, and global financial crime patterns. Match the provided facts to specific FATF typologies with precision and provide an investigative roadmap for the MLRO.

Output ONLY valid JSON, no markdown fences, in this exact shape:
{
  "primaryTypology": {
    "name": "string — e.g. 'Trade-Based Money Laundering (TBML)'",
    "fatfReference": "string — e.g. 'FATF Report on Trade-Based Money Laundering (2020)'",
    "matchStrength": "strong" | "moderate" | "weak",
    "matchRationale": "string — why these facts match this typology"
  },
  "secondaryTypologies": [
    {
      "name": "string",
      "fatfReference": "string",
      "matchStrength": "strong" | "moderate" | "weak",
      "overlap": "string — how it intersects with primary typology"
    }
  ],
  "keyIndicators": ["string array — the specific red flags from the facts that triggered typology matches"],
  "missingIndicators": ["string array — classic indicators for this typology that are NOT yet confirmed but should be investigated"],
  "investigativePriorities": [
    {
      "step": number,
      "action": "string — specific investigative action",
      "rationale": "string",
      "tool": "string — e.g. 'goAML query', 'GLEIF lookup', 'Adverse media search'"
    }
  ],
  "strThreshold": "string — assessment of whether STR threshold is reached under FDL 10/2025 Art.15",
  "predicate": "string — likely predicate offence e.g. 'Tax evasion', 'Corruption', 'Drug trafficking'",
  "uaeCaseContext": "string — UAE-specific context: DPMS sector risks, MoE guidance, goAML typologies",
  "regulatoryBasis": "string — FDL/FATF/MoE references"
}`;

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body?.facts?.trim()) {
    return NextResponse.json({ ok: false, error: "facts is required" }, { status: 400 });
  }

  const lines: string[] = [`Facts: ${body.facts.trim().slice(0, 2000)}`];
  if (body.subjectType) lines.push(`Subject type: ${body.subjectType}`);
  if (body.transactionTypes?.length) lines.push(`Transaction types: ${body.transactionTypes.join(", ")}`);
  if (body.jurisdictions?.length) lines.push(`Jurisdictions: ${body.jurisdictions.join(", ")}`);
  if (body.redFlags?.length) lines.push(`Reported red flags: ${body.redFlags.join(", ")}`);

  const userContent = `${lines.join("\n")}\n\nMatch these facts to FATF typologies and output the structured JSON.`;

  let result: TypologyMatchResult;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      return NextResponse.json(
        { ok: false, error: `Anthropic API error ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const raw = data?.content?.[0]?.text ?? "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    result = JSON.parse(cleaned) as TypologyMatchResult;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to match typologies",
      },
      { status: 502 },
    );
  }

  try {
    writeAuditEvent("mlro", "typology.ai-fingerprint", body.subjectType ?? "unknown");
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
