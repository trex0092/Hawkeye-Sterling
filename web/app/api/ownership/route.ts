export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface OwnershipResult {
  ok: true;
  uboIdentified: boolean;
  ownershipLayers: number;
  ownershipTree: Array<{
    level: number;
    entity: string;
    type: "individual" | "corporate" | "trust" | "foundation";
    ownershipPct: number;
    jurisdiction: string;
    riskFlags: string[];
  }>;
  shellCompanyRisk: "low" | "medium" | "high" | "critical";
  jurisdictionLayering: string[];
  beneficialOwners: Array<{
    name: string;
    directPct: number;
    indirectPct: number;
    jurisdiction: string;
    pepFlag: boolean;
    sanctionsFlag: boolean;
  }>;
  controlStructure: string;
  redFlags: string[];
  uboDisclosureGaps: string[];
  recommendation: string;
  summary: string;
}

const FALLBACK: OwnershipResult = {
  ok: true,
  uboIdentified: false,
  ownershipLayers: 4,
  ownershipTree: [
    {
      level: 0,
      entity: "Meridian Trade LLC",
      type: "corporate",
      ownershipPct: 100,
      jurisdiction: "UAE — DMCC",
      riskFlags: [],
    },
    {
      level: 1,
      entity: "Meridian Holdings BV",
      type: "corporate",
      ownershipPct: 100,
      jurisdiction: "Netherlands",
      riskFlags: ["Non-operating holding — no employees, no physical presence"],
    },
    {
      level: 2,
      entity: "Albatross Capital Trust",
      type: "trust",
      ownershipPct: 100,
      jurisdiction: "Cayman Islands",
      riskFlags: ["Discretionary trust — beneficiaries not disclosed", "FATF high-risk jurisdiction for opacity"],
    },
    {
      level: 3,
      entity: "Unknown — Trustee refuses disclosure",
      type: "individual",
      ownershipPct: 100,
      jurisdiction: "Unknown",
      riskFlags: ["UBO identity unverified", "Trustee invoked confidentiality clause"],
    },
  ],
  shellCompanyRisk: "critical",
  jurisdictionLayering: [
    "UAE (DMCC) → Netherlands → Cayman Islands → Unknown",
    "Three jurisdictions used with progressively lower transparency obligations",
    "Cayman Islands: no public beneficial ownership register",
    "Netherlands: BV used as pass-through with no operational activity declared",
  ],
  beneficialOwners: [
    {
      name: "Unknown — not disclosed",
      directPct: 0,
      indirectPct: 100,
      jurisdiction: "Unknown",
      pepFlag: false,
      sanctionsFlag: false,
    },
  ],
  controlStructure:
    "Discretionary trust structure with professional trustee in Cayman Islands. Control exercised through letter of wishes — not legally binding and not subject to disclosure. Effective beneficial owner identity cannot be established through conventional corporate registry searches.",
  redFlags: [
    "UBO identity cannot be established — Cayman trust structure with undisclosed beneficiaries.",
    "Four-layer corporate structure with no apparent commercial rationale.",
    "Netherlands holding company has no employees, no revenue, and no physical presence — classic pass-through shell.",
    "Trustee refused UBO disclosure citing confidentiality obligations — evasive pattern.",
    "Structure spans three jurisdictions with progressively decreasing transparency requirements.",
    "No documented business reason for inter-jurisdictional structure from UAE operating company.",
  ],
  uboDisclosureGaps: [
    "Cayman Islands Albatross Capital Trust — beneficiaries not named and trustee refuses disclosure.",
    "Netherlands BV ultimate controllers not registered in Dutch UBO register (exempt as intermediary).",
    "Letter of wishes for trust — not provided and may not be legally obtainable.",
    "No group structure chart provided by client — self-declaration incomplete.",
  ],
  recommendation:
    "Do not proceed with onboarding until the UBO is identified and verified to the satisfaction of the MLRO. The current structure presents a critical shell company and opacity risk. Requirement: full UBO disclosure including certified copies of trust deed, letter of wishes, and identity documents for all beneficial owners with ≥25% interest or control. If UBO disclosure is refused or cannot be completed within 30 days, file an internal SAR and consider relationship termination. Escalate to Senior Management per FDL 10/2025 Art.11.",
  summary:
    "Meridian Trade LLC (UAE–DMCC) presents a critical-risk corporate ownership structure spanning four layers across UAE, Netherlands, and Cayman Islands. The ultimate beneficial owner cannot be identified — a Cayman Islands discretionary trust sits at the apex of the structure, with its trustee refusing to disclose beneficiaries. No UBO can be confirmed. The Netherlands intermediate holding has no commercial substance. The four-layer cross-jurisdictional structure with no operational rationale is a classic opacity red flag. Onboarding cannot proceed without full UBO identification and verification.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName?: string;
    jurisdiction?: string;
    registrationNumber?: string;
    directors?: string;
    shareholders?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ownership temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: `You are a specialist AML analyst focused on corporate beneficial ownership analysis under FATF Recommendation 10, UAE FDL 10/2025 Art.11, and CBUAE AML Standards. Analyse corporate structure data to identify Ultimate Beneficial Owners (UBOs), map ownership layers, assess shell company risk, and flag opacity red flags. Apply the 25% ownership threshold for UBO identification per UAE law, noting that control can also arise through other means (veto rights, board appointment powers, letter of wishes in trust structures). Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "uboIdentified": boolean,
  "ownershipLayers": number,
  "ownershipTree": [{"level":number,"entity":"string","type":"individual"|"corporate"|"trust"|"foundation","ownershipPct":number,"jurisdiction":"string","riskFlags":["string"]}],
  "shellCompanyRisk": "low"|"medium"|"high"|"critical",
  "jurisdictionLayering": ["string"],
  "beneficialOwners": [{"name":"string","directPct":number,"indirectPct":number,"jurisdiction":"string","pepFlag":boolean,"sanctionsFlag":boolean}],
  "controlStructure": "string",
  "redFlags": ["string"],
  "uboDisclosureGaps": ["string"],
  "recommendation": "string",
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Corporate Ownership Analysis Request:

Entity Name: ${body.entityName ?? "Unknown"}
Jurisdiction: ${body.jurisdiction ?? "Not specified"}
Registration Number: ${body.registrationNumber ?? "Not provided"}
Directors: ${body.directors ?? "Not provided"}
Shareholders / Ownership Structure: ${body.shareholders ?? "Not provided"}

Map the ownership structure, identify UBOs, assess shell company risk and jurisdiction layering, and flag all opacity red flags per FATF R.10 and UAE FDL 10/2025 Art.11.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as OwnershipResult;
    if (!Array.isArray(result.ownershipTree)) result.ownershipTree = [];
    if (!Array.isArray(result.jurisdictionLayering)) result.jurisdictionLayering = [];
    if (!Array.isArray(result.beneficialOwners)) result.beneficialOwners = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ownership temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
