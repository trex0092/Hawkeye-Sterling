export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface FreezeSeizureResult {
  legalBasis: string;
  eligibleAssets: string[];
  freezeOrderDraft: string;
  procedureSteps: string[];
  timeConstraints: string;
  internationalCooperation: boolean;
  mutualLegalAssistance: boolean;
  regulatoryBasis: string;
}

const FALLBACK: FreezeSeizureResult = {
  legalBasis:
    "UAE FDL 10/2025 Art.28 (asset freezing), Art.29 (provisional measures), UNSCR 1267/1373 (TF-related freezing). No court order required for UNSCR-listed individuals — immediate administrative freeze by CBUAE directive.",
  eligibleAssets: [
    "Bank account balances: AED 1.2M (3 accounts)",
    "Gold bullion inventory: 22kg at current spot (est. AED 4.8M)",
    "UAE registered vehicle: Toyota Land Cruiser [Plate]",
    "Beneficial interest in Dubai freehold property (DLD registered)",
  ],
  freezeOrderDraft:
    "FREEZING NOTICE — [DATE]\nPursuant to UAE FDL 10/2025 Art.28 and instruction of the Competent Authority, you are hereby directed to immediately freeze all assets, accounts, and financial instruments held in the name of or beneficially owned by [SUBJECT], including but not limited to account nos. [ACCOUNTS]. No withdrawals, transfers, or encumbrances may be effected. Report confirmation of compliance within 2 business hours to the undersigned MLRO.",
  procedureSteps: [
    "Issue internal freeze notice to all account-holding departments immediately",
    "Notify CBUAE Financial Crime Supervision within 24 hours",
    "File STR / SAR with goAML citing Art.28 freeze",
    "Engage external legal counsel for court-ordered continuation beyond 7-day administrative window",
    "Coordinate with Public Prosecution if criminal referral required",
  ],
  timeConstraints:
    "Administrative freeze: 7 days without court order. Court-ordered extension: unlimited pending trial. UNSCR-listed: indefinite — no time limit.",
  internationalCooperation: true,
  mutualLegalAssistance: true,
  regulatoryBasis:
    "UAE FDL 10/2025 Art.28-30, FATF R.4, UAE-INTERPOL bilateral MLA treaty",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    assetDescription: string;
    legalBasisCited: string;
    estimatedValue: string;
    jurisdictions: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT legal expert specialising in asset freezing and seizure procedures under UAE FDL 10/2025 and FATF standards. Analyse asset freeze/seizure scenarios and return a JSON object with exactly these fields: { "legalBasis": string, "eligibleAssets": string[], "freezeOrderDraft": string, "procedureSteps": string[], "timeConstraints": string, "internationalCooperation": boolean, "mutualLegalAssistance": boolean, "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following asset freeze/seizure scenario:
- Subject Name: ${body.subjectName}
- Asset Description: ${body.assetDescription}
- Legal Basis Cited: ${body.legalBasisCited}
- Estimated Value: ${body.estimatedValue}
- Jurisdictions: ${body.jurisdictions}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as FreezeSeizureResult;
    if (!Array.isArray(parsed.eligibleAssets)) parsed.eligibleAssets = [];
    if (!Array.isArray(parsed.procedureSteps)) parsed.procedureSteps = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "freeze-seizure temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
