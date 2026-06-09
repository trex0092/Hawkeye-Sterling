export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ownership temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: `You are a specialist AML analyst focused on corporate beneficial ownership analysis under FATF Recommendation 10, UAE Federal Decree-Law No. 10 of 2025 Art.11, and CBUAE AML Standards. Analyse corporate structure data to identify Ultimate Beneficial Owners (UBOs), map ownership layers, assess shell company risk, and flag opacity red flags. Apply the 25% ownership threshold for UBO identification per UAE law, noting that control can also arise through other means (veto rights, board appointment powers, letter of wishes in trust structures). Return ONLY valid JSON with this exact structure (no markdown fences):
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

Entity Name: ${sanitizeField(body.entityName, 300) || "Unknown"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "Not specified"}
Registration Number: ${sanitizeField(body.registrationNumber, 100) || "Not provided"}
Directors: ${sanitizeText(body.directors, 2000) || "Not provided"}
Shareholders / Ownership Structure: ${sanitizeText(body.shareholders, 3000) || "Not provided"}

Map the ownership structure, identify UBOs, assess shell company risk and jurisdiction layering, and flag all opacity red flags per FATF R.10 and UAE Federal Decree-Law No. 10 of 2025 Art.11.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as OwnershipResult;
    if (!Array.isArray(result.ownershipTree)) result.ownershipTree = [];
    if (!Array.isArray(result.jurisdictionLayering)) result.jurisdictionLayering = [];
    if (!Array.isArray(result.beneficialOwners)) result.beneficialOwners = [];
    void writeAuditChainEntry(
      { event: "ubo_ownership_analysed", actor: gate.keyId, shellCompanyRisk: result.shellCompanyRisk, ownershipLayers: result.ownershipLayers, uboIdentified: result.uboIdentified },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "ownership temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
