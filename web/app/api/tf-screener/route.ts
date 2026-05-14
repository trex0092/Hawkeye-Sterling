export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export interface TfIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  typology: "structured_transfers" | "npo_abuse" | "hawala_ivts" | "crypto_tf" | "crowdfunding" | "foreign_fighter" | "lone_actor" | "cash_courier" | "trade_based" | "other";
  fatfRef: string;
  detail: string;
}

export interface TfScreenerResult {
  tfRisk: "critical" | "high" | "medium" | "low" | "clear";
  designatedEntityHit: boolean;
  unscr1267Hit: boolean;
  unscr1373Nexus: "confirmed" | "possible" | "unlikely" | "none";
  npOAbuseRisk: "high" | "medium" | "low" | "none";
  hawalaNexus: "high" | "medium" | "low" | "none";
  cryptoTfRisk: "high" | "medium" | "low" | "none";
  indicators: TfIndicator[];
  primaryTypology: string;
  primaryTypologyRef: string;
  recommendedAction: "freeze_and_report_immediately" | "file_str" | "escalate_mlro" | "enhanced_dd" | "monitor" | "clear";
  actionRationale: string;
  mandatoryFreeze: boolean;
  freezeBasis?: string;
  freezeTimeline?: string;
  requiredActions: string[];
  applicableRegime: string[];
  regulatoryBasis: string;
  ctfObligations: string[];
}

const FALLBACK: TfScreenerResult = {
  tfRisk: "high",
  designatedEntityHit: false,
  unscr1267Hit: false,
  unscr1373Nexus: "possible",
  npOAbuseRisk: "medium",
  hawalaNexus: "high",
  cryptoTfRisk: "low",
  primaryTypology: "Hawala / Informal Value Transfer System (IVTS) — TF conduit",
  primaryTypologyRef: "FATF R.14; FATF Guidance on TF Risk Assessment (2019) §4.3",
  indicators: [
    { indicator: "Cross-border remittances via unregistered hawala operator to conflict-affected jurisdiction", severity: "critical", typology: "hawala_ivts", fatfRef: "FATF R.14; UAE FDL 10/2025 Art.21(2)", detail: "Unregistered hawala to Syria/Iraq/Yemen/Afghanistan is a primary TF conduit per FATF Guidance on TF." },
    { indicator: "Transaction amounts consistent with foreign fighter financing pattern (USD 500–5,000)", severity: "high", typology: "foreign_fighter", fatfRef: "FATF R.5; UNSCR 2178 (2014)", detail: "Foreign fighter financing typically involves small transfers in the USD 500–5,000 range; patterns match FATF foreign fighter typology." },
    { indicator: "Beneficiary in FATF grey-list jurisdiction with active terrorist designation activity", severity: "high", typology: "structured_transfers", fatfRef: "FATF R.6; UNSCR 1373", detail: "Destination jurisdiction listed under FATF R.19 enhanced scrutiny with documented IS/AQ activity per UN Security Council Monitoring Team reports." },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "Hawala transfers to conflict-affected jurisdiction with foreign fighter financing pattern require immediate MLRO escalation and UNSCR 1267/1373 list screening. If MLRO determines reasonable grounds for TF suspicion, STR must be filed within 2 business days under FDL 10/2025 Art.26. Freeze consideration mandatory if designated entity link confirmed.",
  mandatoryFreeze: false,
  requiredActions: [
    "Screen all parties against UAE EOCN consolidated list (includes UNSCR 1267 Al-Qaida/Taliban and UNSCR 1988 Taliban)",
    "Screen against US OFAC SDN, EU, UN Consolidated List for terrorist designations",
    "Escalate to MLRO with full transaction record and customer CDD file",
    "Assess whether to file STR under UAE FDL 10/2025 Art.26 — 2 business day deadline from determination",
    "If hawala operator is unregistered, report to MoE / CBUAE as unlicensed money services business",
    "Consider account freeze pending MLRO determination",
  ],
  applicableRegime: ["UAE EOCN (Cabinet Decision 74/2020)", "UNSCR 1267 (Al-Qaida/Taliban)", "UNSCR 1373 (General TF)", "UNSCR 2178 (Foreign Fighters)", "UAE CTF Law 7/2014"],
  regulatoryBasis: "UAE Federal Law No. 7/2014 (CTF); UAE FDL 10/2025 Art.21(2), Art.26; FATF R.5, R.6, R.8, R.14; UNSCR 1267, 1373, 1988, 2178; UAE Cabinet Decision 74/2020 (EOCN)",
  ctfObligations: [
    "Immediate freeze obligation if UNSCR 1267/1988 designated entity identified (no delay, no court order required) — UAE CTF Law Art.7",
    "STR within 2 business days of reasonable TF suspicion — FDL 10/2025 Art.26",
    "Tipping-off prohibition applies — FDL 10/2025 Art.25",
    "Record retention 8 years — FDL 10/2025 Art.16",
    "No threshold applies to TF STR obligation — suspicion alone is sufficient (FATF R.20)",
  ],
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subject: string;
    subjectCountry?: string;
    counterparty?: string;
    counterpartyCountry?: string;
    transactionType?: string;
    amount?: string;
    currency?: string;
    destinationJurisdiction?: string;
    goods?: string;
    customerType?: string;
    existingRedFlags?: string[];
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.subject?.trim()) return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "tf-screener temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a UAE counter-terrorism financing (CTF) specialist with deep expertise in FATF recommendations on terrorist financing, UN Security Council sanctions regimes, UAE CTF law, and TF typologies.\n\nAssess the subject/transaction for terrorism financing risk. This is DISTINCT from general ML risk — TF involves funding terrorist acts, organisations, or foreign fighters and is subject to immediate freeze obligations without court order when designated entities are involved.\n\nKey frameworks to apply:\n- FATF R.5 (TF offence criminalisation), R.6 (targeted financial sanctions), R.8 (NPOs), R.14 (IVTS/hawala)\n- UNSCR 1267/1989/2253 (Al-Qaida/IS consolidated list — immediate freeze, no threshold)\n- UNSCR 1988 (Taliban consolidated list — immediate freeze)\n- UNSCR 1373 (general TF obligations — STR, freeze, cooperation)\n- UNSCR 2178 (foreign terrorist fighters — travel, financing)\n- UAE Federal Law No. 7/2014 on Combating Terrorism (CTF Law)\n- UAE Cabinet Decision 74/2020 (EOCN — implementing UNSCR 1267/1988 designations)\n- UAE FDL 10/2025 Art.21(2) (TF suspicion reporting — no threshold)\n\nTF typologies (from FATF Guidance on Terrorist Financing Risk Assessment 2019):\n1. Hawala/IVTS to conflict zones (Syria, Iraq, Yemen, Afghanistan, Sahel, Somalia)\n2. Foreign fighter financing (small amounts USD 500–5,000, travel + living expenses)\n3. NPO/charity abuse (donations routed to designated organisations)\n4. Crypto-TF (Bitcoin, Monero for pseudonymous TF transfers)\n5. Crowdfunding/social media fundraising for TF\n6. Lone actor self-financing (small personal account activity before attack)\n7. Cash courier (physical cash to conflict zones)\n8. Trade-based TF (gold/precious metals used to finance terrorist organisations in CAHRA regions)\n9. Structured small transfers below thresholds to avoid detection\n\nIMPORTANT: TF STR obligation has NO threshold — any suspicion is sufficient. Freeze is immediate if UNSCR 1267/1988 list hit confirmed.\n\nRespond ONLY with valid JSON — no markdown fences:\n{\n  \"tfRisk\": \"critical\"|\"high\"|\"medium\"|\"low\"|\"clear\",\n  \"designatedEntityHit\": <true|false>,\n  \"unscr1267Hit\": <true|false>,\n  \"unscr1373Nexus\": \"confirmed\"|\"possible\"|\"unlikely\"|\"none\",\n  \"npOAbuseRisk\": \"high\"|\"medium\"|\"low\"|\"none\",\n  \"hawalaNexus\": \"high\"|\"medium\"|\"low\"|\"none\",\n  \"cryptoTfRisk\": \"high\"|\"medium\"|\"low\"|\"none\",\n  \"indicators\": [{\"indicator\": \"<specific indicator>\", \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\", \"typology\": \"structured_transfers\"|\"npo_abuse\"|\"hawala_ivts\"|\"crypto_tf\"|\"crowdfunding\"|\"foreign_fighter\"|\"lone_actor\"|\"cash_courier\"|\"trade_based\"|\"other\", \"fatfRef\": \"<citation>\", \"detail\": \"<explanation>\"}],\n  \"primaryTypology\": \"<main TF typology>\",\n  \"primaryTypologyRef\": \"<FATF/UNSCR citation>\",\n  \"recommendedAction\": \"freeze_and_report_immediately\"|\"file_str\"|\"escalate_mlro\"|\"enhanced_dd\"|\"monitor\"|\"clear\",\n  \"actionRationale\": \"<paragraph — be specific about TF vs ML distinction>\",\n  \"mandatoryFreeze\": <true|false>,\n  \"freezeBasis\": \"<UNSCR/law basis if freeze required>\",\n  \"freezeTimeline\": \"<e.g. immediate, no delay>\",\n  \"requiredActions\": [\"<action>\"],\n  \"applicableRegime\": [\"<regime>\"],\n  \"regulatoryBasis\": \"<full citation>\",\n  \"ctfObligations\": [\"<specific UAE CTF obligation triggered>\"]\n}`,
        messages: [{
          role: "user",
          content: `Subject: ${body.subject}\nSubject Country: ${body.subjectCountry ?? "not specified"}\nCounterparty: ${body.counterparty ?? "not specified"}\nCounterparty Country: ${body.counterpartyCountry ?? "not specified"}\nTransaction Type: ${body.transactionType ?? "not specified"}\nAmount: ${body.amount ?? "not specified"} ${body.currency ?? ""}\nDestination Jurisdiction: ${body.destinationJurisdiction ?? "not specified"}\nGoods / Services: ${body.goods ?? "not specified"}\nCustomer Type: ${body.customerType ?? "not specified"}\nExisting Red Flags: ${body.existingRedFlags?.join("; ") ?? "none"}\nAdditional Context: ${body.context ?? "none"}\n\nAssess for terrorism financing risk.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TfScreenerResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "tf-screener temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
