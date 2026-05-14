export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface PrimaryPredicate {
  offence: string;
  uaeLegalRef: string;
  fatfCategory: string;
  maxPenalty: string;
  imprisonmentYears?: string;
  fineAed?: string;
}

export interface SecondaryPredicate {
  offence: string;
  uaeLegalRef: string;
  fatfCategory: string;
  maxPenalty: string;
  overlap: string;
}

export interface MlPredicateResult {
  primaryPredicate: PrimaryPredicate;
  secondaryPredicates: SecondaryPredicate[];
  mlOffenceApplicable: boolean;
  mlLegalBasis: string;
  proceedsEstimate: string;
  selfLaunderingApplicable: boolean;
  strRequired: boolean;
  strBasis: string;
  investigativeActions: string[];
  jurisdictionalIssues: string[];
  regulatoryBasis: string;
  fatfR3Categories: string[];
}

const FALLBACK: MlPredicateResult = {
  primaryPredicate: {
    offence: "Corruption / Bribery",
    uaeLegalRef: "UAE Federal Anti-Corruption Law No. 6/2023; UAE Penal Code Art.234-239",
    fatfCategory: "Corruption and bribery",
    maxPenalty: "Life imprisonment + AED 1,000,000 fine",
    imprisonmentYears: "Life",
    fineAed: "1,000,000",
  },
  secondaryPredicates: [
    {
      offence: "Fraud / Misappropriation",
      uaeLegalRef: "UAE Penal Code Art.399-402; UAE Federal Decree-Law No. 38/2016 (Commercial Fraud)",
      fatfCategory: "Fraud",
      maxPenalty: "Up to 5 years imprisonment + fine",
      overlap: "Fraudulent misrepresentation may accompany corrupt payments to conceal their true nature and purpose.",
    },
    {
      offence: "Tax Evasion",
      uaeLegalRef: "UAE Federal Decree-Law No. 47/2022 (Corporate Tax); UAE Federal Law No. 7/2017 (Tax Procedures) Art.26",
      fatfCategory: "Tax crimes",
      maxPenalty: "Up to 5 years imprisonment + administrative penalties up to 500% of evaded tax",
      overlap: "Proceeds of corruption may involve concealment of taxable income or structuring to avoid UAE corporate tax and VAT obligations.",
    },
  ],
  mlOffenceApplicable: true,
  mlLegalBasis: "UAE FDL 10/2025 Art.3",
  proceedsEstimate: "Cannot be quantified from available facts — account records required",
  selfLaunderingApplicable: true,
  strRequired: true,
  strBasis: "Reasonable grounds of ML under FDL 10/2025 Art.21",
  investigativeActions: [
    "Obtain and analyse full account transaction history to identify proceeds of the predicate offence",
    "Request source-of-funds and source-of-wealth documentation from the subject",
    "Screen subject and all associated entities against UAE EOCN, OFAC SDN, UN Consolidated List and PEP databases",
    "Escalate to MLRO for STR assessment — STR must be filed within 2 business days of determination under FDL 10/2025 Art.26",
    "Preserve all records in accordance with FDL 10/2025 Art.16 (8-year retention obligation)",
  ],
  jurisdictionalIssues: [],
  regulatoryBasis: "UAE FDL 10/2025 Art.3, Art.21, Art.26; UAE Federal Anti-Corruption Law No. 6/2023; UAE Penal Code Art.234-239, Art.399-402; UAE Federal Decree-Law No. 38/2016; FATF R.3; FATF R.20",
  fatfR3Categories: ["Corruption", "Fraud"],
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    facts: string;
    suspectedActivity?: string;
    jurisdiction?: string;
    subjectType?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.facts?.trim()) return NextResponse.json({ ok: false, error: "facts required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ml-predicate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1400,
        system: `You are a UAE AML legal specialist mapping case facts to applicable predicate offences under UAE Federal Law No. 10/2025 (FDL), UAE Penal Code (Federal Law No. 3/1987 as amended), and FATF Recommendation 3's 23 designated predicate offences. Identify the primary predicate offence, secondary predicates, maximum penalties, and whether self-laundering applies. The ML offence in the UAE is codified in FDL 10/2025 Art.3 (previously UAE ML Law 20/2014).

Respond ONLY with valid JSON — no markdown fences:
{
  "primaryPredicate": {"offence": "<offence name>", "uaeLegalRef": "<UAE statute and article>", "fatfCategory": "<FATF R.3 category>", "maxPenalty": "<penalty description>", "imprisonmentYears": "<years or Life>", "fineAed": "<amount as string>"},
  "secondaryPredicates": [{"offence": "<offence>", "uaeLegalRef": "<citation>", "fatfCategory": "<FATF R.3 category>", "maxPenalty": "<penalty>", "overlap": "<explanation of overlap with primary>"}],
  "mlOffenceApplicable": <true|false>,
  "mlLegalBasis": "<e.g. UAE FDL 10/2025 Art.3>",
  "proceedsEstimate": "<estimate or cannot be determined>",
  "selfLaunderingApplicable": <true|false>,
  "strRequired": <true|false>,
  "strBasis": "<basis for STR obligation>",
  "investigativeActions": ["<action>"],
  "jurisdictionalIssues": ["<issue>"],
  "regulatoryBasis": "<full citation string>",
  "fatfR3Categories": ["<category>"]
}`,
        messages: [
          {
            role: "user",
            content: `Case Facts:
${body.facts}

Suspected Activity: ${body.suspectedActivity ?? "not specified"}
Jurisdiction: ${body.jurisdiction ?? "UAE"}
Subject Type: ${body.subjectType ?? "not specified"}
Additional Context: ${body.context ?? "none"}

Map these facts to applicable UAE ML predicate offences with penalties.`,
          },
        ],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as MlPredicateResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ml-predicate temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
