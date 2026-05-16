import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Startup validation — log a clear warning if the FATF typology engine is degraded
// (no Anthropic key means Claude cannot perform typology matching).
if (!process.env["ANTHROPIC_API_KEY"]) {
  console.warn(
    "[typology-match] STARTUP WARNING: ANTHROPIC_API_KEY not set — " +
    "typology matching will use static FATF fallback data only. " +
    "Set ANTHROPIC_API_KEY to enable full FATF typology AI analysis.",
  );
}

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
    matchRationale: "API key not configured.",
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

const SYSTEM_PROMPT = `You are a UAE AML/CFT/CPF typology expert with comprehensive knowledge of all FATF typology reports, MENAFATF typologies, UAE FIU case studies, and global financial crime patterns. Match the provided facts to specific FATF typologies — including AML, TF, and CPF (Counter-Proliferation Financing) typologies — with precision and provide an investigative roadmap for the MLRO.

CPF TYPOLOGIES to consider (FATF R.7 and Guidance on Proliferation Financing Risk Assessment 2021):
- Dual-use goods procurement: front companies acquiring goods with both civilian and WMD applications (electronics, metals, chemicals) via multi-layered procurement chains
- Front company for WMD: shell/front companies in third countries used to procure or finance materials for WMD programs; often registered in low-scrutiny jurisdictions
- Proliferation network: networks of brokers, shippers, and financial intermediaries facilitating technology transfer or finance for WMD/delivery-system programs (DPRK, Iran, Syria)
- Sanctions evasion for WMD programs: use of nominees, falsified end-user certificates, re-export schemes, and correspondent banking chains to circumvent proliferation-related sanctions (UNSCR 1540, 1718, 2231)

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
  const t0 = Date.now();
  try {
    const gate = await enforce(req);
    if (!gate.ok) return gate.response;
    const gateHeaders = gate.headers;
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return NextResponse.json({ ok: true, degraded: true, ...FALLBACK }, { headers: gateHeaders });
    }
    const client = getAnthropicClient(apiKey, 22_000);

    let rawBody: Body & { subject?: { facts?: string; subjectType?: string; transactionType?: string } };
    try {
      rawBody = (await req.json()) as typeof rawBody;
    } catch {
      return NextResponse.json({ ok: false, errorCode: "HANDLER_EXCEPTION", errorType: "internal", message: "invalid JSON body", tool: "typology_match" }, { status: 400, headers: gateHeaders });
    }

    // Unwrap subject envelope sent by the MCP tool layer.
    let body: Body;
    if (rawBody.subject && typeof rawBody.subject === "object") {
      body = {
        facts: rawBody.subject.facts ?? rawBody.facts ?? "",
        subjectType: rawBody.subject.subjectType ?? rawBody.subjectType,
        transactionTypes: rawBody.transactionTypes,
        jurisdictions: rawBody.jurisdictions,
        redFlags: rawBody.redFlags,
      };
    } else {
      body = rawBody as Body;
    }

    if (!body?.facts?.trim()) {
      return NextResponse.json({ ok: false, errorCode: "HANDLER_EXCEPTION", errorType: "internal", message: "facts is required", tool: "typology_match" }, { status: 400, headers: gateHeaders });
    }

    const lines: string[] = [`Facts: ${body.facts.trim().slice(0, 2000)}`];
    if (body.subjectType) lines.push(`Subject type: ${body.subjectType}`);
    if (body.transactionTypes?.length) lines.push(`Transaction types: ${body.transactionTypes.join(", ")}`);
    if (body.jurisdictions?.length) lines.push(`Jurisdictions: ${body.jurisdictions.join(", ")}`);
    if (body.redFlags?.length) lines.push(`Reported red flags: ${body.redFlags.join(", ")}`);

    const userContent = `${lines.join("\n")}\n\nMatch these facts to FATF typologies and output the structured JSON.`;

    let result: TypologyMatchResult;

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
      });
      const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      result = JSON.parse(cleaned) as TypologyMatchResult;
      if (!Array.isArray(result.secondaryTypologies)) result.secondaryTypologies = [];
      if (!Array.isArray(result.keyIndicators)) result.keyIndicators = [];
      if (!Array.isArray(result.missingIndicators)) result.missingIndicators = [];
      if (!Array.isArray(result.investigativePriorities)) result.investigativePriorities = [];
    } catch {
      return NextResponse.json({ ok: true, degraded: true, ...FALLBACK }, { headers: gateHeaders });
    }

    try {
      writeAuditEvent("mlro", "typology.ai-fingerprint", body.subjectType ?? "unknown");
    } catch { /* browser-only audit */ }

    const latencyMs = Date.now() - t0;
    if (latencyMs > 5000) console.warn(`[typology-match] slow response latencyMs=${latencyMs}`);
    return NextResponse.json({ ok: true, ...result, latencyMs }, { headers: gateHeaders });
  } catch (err) {
    console.error("[typology-match] unhandled exception:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: false,
        errorCode: "HANDLER_EXCEPTION",
        errorType: "internal",
        message: err instanceof Error ? err.message : String(err),
        tool: "typology_match",
        requestId: Math.random().toString(36).slice(2, 10),
        latencyMs: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
