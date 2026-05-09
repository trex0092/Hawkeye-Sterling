import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  text: string;
  subjectName?: string;
}

interface Flag {
  indicator: string;
  category:
    | "structuring"
    | "layering"
    | "placement"
    | "pep"
    | "sanctions"
    | "trade_ml"
    | "proliferation"
    | "adverse_media"
    | "ownership_opacity"
    | "jurisdiction_risk"
    | "other";
  severity: "critical" | "high" | "medium" | "low";
  fatfReference: string;
  uaeReference: string;
  actionRequired: string;
}

interface ExtractFlagsResult {
  flags: Flag[];
  overallRisk: "critical" | "high" | "medium" | "low";
  recommendedDisposition: "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR";
  summary: string;
}

// ─── Rule-based extractor ────────────────────────────────────────────────────
// Grounded in the brain's red-flag catalogue. Each rule contains observable
// keywords and maps to a precisely cited regulatory indicator. No inference
// beyond what is observable in the text.

interface Rule {
  keywords: RegExp[];
  indicator: string;
  category: Flag["category"];
  severity: Flag["severity"];
  fatfReference: string;
  uaeReference: string;
  actionRequired: string;
}

const RULES: Rule[] = [
  // ── KYC / CDD reluctance ────────────────────────────────────────────────
  {
    keywords: [/silly|weird|strange|unusual|refus|won'?t provide|doesn'?t want|decline|avoid|kyc/i],
    indicator: "Customer behaviour inconsistent with legitimate KYC cooperation — reluctance or unusual demands during onboarding/EDD.",
    category: "other",
    severity: "medium",
    fatfReference: "FATF R.10 Customer Due Diligence; FATF Guidance on CDD Measures",
    uaeReference: "FDL 20/2018 Art.14(1); Cabinet Res. 10/2019 Art.4; CBUAE Notice 2983/2019",
    actionRequired: "Escalate to MLRO; document reasons for CDD difficulty; consider whether to proceed or exit relationship per internal risk appetite.",
  },
  // ── Cash / structuring / DPMS threshold ─────────────────────────────────
  {
    keywords: [/cash|aed\s*55[,\s]?000|55k|55,000|threshold|below.{0,20}report|structur/i],
    indicator: "Cash transactions at or near the AED 55,000 DPMS reporting threshold — potential structuring to avoid goAML filing obligation.",
    category: "structuring",
    severity: "high",
    fatfReference: "FATF R.20 Suspicious Transaction Reporting; FATF DPMS Guidance 2023 para 47",
    uaeReference: "FDL 20/2018 Art.15–16; Cabinet Res. 10/2019 Art.12; MoE DNFBP Circular 08/2021",
    actionRequired: "File goAML STR if aggregate ≥ AED 55,000 or suspicious regardless of amount. Conduct EDD; verify and document source of funds.",
  },
  // ── PEP / politically exposed person ────────────────────────────────────
  {
    keywords: [/\bpep\b|politically exposed|minister|senator|government official|head of state|ambassador|consul/i],
    indicator: "Subject is or is connected to a Politically Exposed Person — enhanced CDD required.",
    category: "pep",
    severity: "high",
    fatfReference: "FATF R.12 Politically Exposed Persons; FATF Interpretive Note R.12",
    uaeReference: "FDL 20/2018 Art.16; Cabinet Res. 10/2019 Art.24; CBUAE EDD requirements",
    actionRequired: "Apply Enhanced Due Diligence. Obtain senior-management approval before onboarding. Conduct ongoing monitoring of all transactions.",
  },
  // ── Sanctions / SDN / designation ────────────────────────────────────────
  {
    keywords: [/sanction|ofac|sdn|un\s*1267|designated|blacklist|embargo|restricted party/i],
    indicator: "Potential link to a sanctioned entity, designated individual, or restricted jurisdiction.",
    category: "sanctions",
    severity: "critical",
    fatfReference: "FATF R.6 Targeted Financial Sanctions — Terrorism & TF; FATF R.7 Targeted Financial Sanctions — Proliferation",
    uaeReference: "FDL 20/2018 Art.18; Cabinet Res. 10/2019 Art.19; CBUAE Circular 2/2022; UAE EOCN designations",
    actionRequired: "FREEZE funds immediately if confirmed match. File goAML TF report within 24 hours. Do NOT notify the customer (tipping-off prohibition, FDL Art.17).",
  },
  // ── Shell company / nominee / opacity ────────────────────────────────────
  {
    keywords: [/shell|nominee|offshore|bearer share|opaque|bvi|cayman|seychelles|layer|complex structure|holding company/i],
    indicator: "Ownership structure involves shell entities, nominee directors, or opaque multi-layered holding in secrecy jurisdictions — beneficial ownership unclear.",
    category: "ownership_opacity",
    severity: "high",
    fatfReference: "FATF R.24 Transparency of Legal Persons; FATF R.25 Transparency of Legal Arrangements",
    uaeReference: "FDL 20/2018 Art.14(2)(d); Cabinet Res. 134/2025 Art.6; UAE UBO Regulation (Ministerial Decision 98/2016)",
    actionRequired: "Map full UBO chain to natural person(s). If UBO cannot be identified, treat as high-risk and obtain MLRO sign-off before proceeding.",
  },
  // ── Source of funds / wealth mismatch ────────────────────────────────────
  {
    keywords: [/source of fund|source of wealth|unexplain|wealth mismatch|income inconsistent|cannot explain|funds origin|where.*money|money.*come from/i],
    indicator: "Customer unable or unwilling to substantiate declared source of funds or wealth — inconsistency with known profile.",
    category: "layering",
    severity: "high",
    fatfReference: "FATF R.10(d) Source of Funds; FATF Guidance on Risk-Based Approach para 4.12",
    uaeReference: "FDL 20/2018 Art.14(1)(c); Cabinet Res. 10/2019 Art.7; CBUAE RBA Guidelines 2023",
    actionRequired: "Obtain independent documentary evidence of SOF/SOW. If unsubstantiated, escalate to MLRO; consider STR filing.",
  },
  // ── Third-party payment ───────────────────────────────────────────────────
  {
    keywords: [/third.party|third party|unrelated party|payment from another|someone else paying|paying on behalf/i],
    indicator: "Payment received from or made to a third party with no documented relationship to the subject — potential layering indicator.",
    category: "layering",
    severity: "high",
    fatfReference: "FATF R.10 CDD; FATF TBML Typologies Report 2022 pp. 14–18",
    uaeReference: "FDL 20/2018 Art.14(1)(b); Cabinet Res. 10/2019 Art.9(3)",
    actionRequired: "Identify and CDD the third party. Obtain written explanation for the payment arrangement. If unexplained, escalate to MLRO.",
  },
  // ── Trade finance / TBML ──────────────────────────────────────────────────
  {
    keywords: [/over.invoice|under.invoice|invoice mismatch|phantom shipment|letter of credit|lc discrepan|trade.based|tbml|hs code|mis-classif/i],
    indicator: "Trade document anomalies consistent with Trade-Based Money Laundering — over/under-invoicing or phantom shipment indicators.",
    category: "trade_ml",
    severity: "high",
    fatfReference: "FATF TBML Report 2022; FATF R.20 Suspicious Transactions",
    uaeReference: "FDL 20/2018 Art.2 (predicate offences); Cabinet Res. 10/2019 Art.12; UAE Customs Authority circular",
    actionRequired: "Cross-check invoice values against trade data benchmarks. Request independent inspection reports. Escalate to MLRO if discrepancy unexplained.",
  },
  // ── Crypto / VASP ─────────────────────────────────────────────────────────
  {
    keywords: [/crypto|bitcoin|ethereum|blockchain|wallet|defi|vasp|mixer|tumbler|darknet|chain.hop|nft|stablecoin/i],
    indicator: "Transaction involves virtual assets with potential exposure to unregulated platforms, mixers, or opaque blockchain activity.",
    category: "layering",
    severity: "high",
    fatfReference: "FATF R.15 Virtual Assets; FATF Updated Guidance for VASP 2021; FATF INR.16 Travel Rule",
    uaeReference: "VARA Virtual Assets and Related Activities Regulations 2023; CBUAE Stored Value Facilities Reg. 2020; Cabinet Res. 111/2022",
    actionRequired: "Screen wallet addresses against OFAC/VASP blacklists. Confirm Travel Rule compliance for transfers ≥ USD 1,000/AED 3,672. Escalate if mixer or darknet exposure detected.",
  },
  // ── Proliferation financing ───────────────────────────────────────────────
  {
    keywords: [/dual.use|weapons|missile|nuclear|chemical|biological|military|export control|ccl|ear|itar|proliferat/i],
    indicator: "Goods or services may constitute dual-use items subject to export controls — potential proliferation financing risk.",
    category: "proliferation",
    severity: "critical",
    fatfReference: "FATF R.7 Targeted Financial Sanctions (Proliferation); FATF Guidance on PF Risk Assessment 2021",
    uaeReference: "Federal Law 13/2007 (Commodities Subject to Import and Export Control); Cabinet Res. 10/2019 Art.19(2); CBUAE Circular on PF",
    actionRequired: "HALT transaction. Screen goods against UAE/EU/US dual-use control lists. Obtain independent export-control opinion. File goAML STR and notify MOEC if TFS hit confirmed.",
  },
  // ── Adverse media ─────────────────────────────────────────────────────────
  {
    keywords: [/adverse media|negative news|fraud|corruption|bribery|investigated|arrested|charged|convicted|money launder|criminal/i],
    indicator: "Adverse media or negative information linked to subject — credible derogatory information from open sources.",
    category: "adverse_media",
    severity: "high",
    fatfReference: "FATF R.10 CDD (ongoing monitoring); FATF RBA Guidance — Adverse Media Screening",
    uaeReference: "FDL 20/2018 Art.14(3); Cabinet Res. 10/2019 Art.10; CBUAE RBA Guidelines 2023 s.4.3",
    actionRequired: "Document sources and assess credibility. Apply Enhanced Due Diligence. Obtain MLRO sign-off. File STR if information meets suspicion threshold.",
  },
  // ── High-risk jurisdiction ────────────────────────────────────────────────
  {
    keywords: [/iran|north korea|dprk|myanmar|russia|belarus|syria|sudan|cuba|venezuela|high.risk country|fatf grey|fatf blacklist|jurisdiction risk/i],
    indicator: "Connection to a FATF grey-listed, black-listed, or otherwise high-risk jurisdiction — elevated ML/TF/PF exposure.",
    category: "jurisdiction_risk",
    severity: "high",
    fatfReference: "FATF R.19 Higher-Risk Countries; FATF R.20 Suspicious Transaction Reporting",
    uaeReference: "Cabinet Res. 10/2019 Art.21; CBUAE Notice on High-Risk Jurisdictions; MoE DNFBP Circular",
    actionRequired: "Apply Enhanced Due Diligence per FATF R.19. Obtain senior-management approval. Consider Correspondent Banking restrictions if applicable.",
  },
  // ── Unusual transaction patterns ──────────────────────────────────────────
  {
    keywords: [/round.number|round amount|no business purpose|no commercial rationale|unusual pattern|inconsistent.*profile|spike|sudden large|dormant.*reactivat/i],
    indicator: "Unusual or inconsistent transaction pattern with no apparent economic or commercial rationale.",
    category: "other",
    severity: "medium",
    fatfReference: "FATF R.20 Suspicious Transaction Reporting; FATF Guidance on Indicators of ML/TF",
    uaeReference: "FDL 20/2018 Art.15(1); Cabinet Res. 10/2019 Art.12(2); goAML Reporting Guidelines (UAEFIU)",
    actionRequired: "Request written business justification from customer. Compare against peer group benchmarks. If unexplained, escalate to MLRO for STR consideration.",
  },
  // ── Real estate / property ────────────────────────────────────────────────
  {
    keywords: [/real estate|property|land|villa|apartment|flat|purchase.*cash|cash.*purchase|off.plan|developer|DLD|title deed|mortgage|conveyance/i],
    indicator: "Cash or near-cash real estate transaction — high-value property sector indicator of placement/layering risk.",
    category: "placement",
    severity: "high",
    fatfReference: "FATF Guidance on ML through Real Estate 2022; FATF R.22 DNFBPs: Customer Due Diligence",
    uaeReference: "FDL 20/2018 Art.14; Dubai Law 6/2021 (RE Reg.); RERA AML Circular 2022; Cabinet Res. 10/2019 Art.11",
    actionRequired: "Verify source of funds for purchase. Identify and CDD all parties. Report to DLD if suspicious. File goAML STR if threshold met.",
  },
];

function ruleBasedExtract(text: string): ExtractFlagsResult {
  const matched: Flag[] = [];
  const seenCategories = new Set<string>();

  for (const rule of RULES) {
    const hit = rule.keywords.some((rx) => rx.test(text));
    if (hit && !seenCategories.has(rule.category + rule.indicator)) {
      seenCategories.add(rule.category + rule.indicator);
      matched.push({
        indicator: rule.indicator,
        category: rule.category,
        severity: rule.severity,
        fatfReference: rule.fatfReference,
        uaeReference: rule.uaeReference,
        actionRequired: rule.actionRequired,
      });
    }
  }

  const hasCritical = matched.some((f) => f.severity === "critical");
  const hasHigh = matched.some((f) => f.severity === "high");
  const hasMedium = matched.some((f) => f.severity === "medium");

  const overallRisk: ExtractFlagsResult["overallRisk"] =
    hasCritical ? "critical" : hasHigh ? "high" : hasMedium ? "medium" : "low";

  const recommendedDisposition: ExtractFlagsResult["recommendedDisposition"] =
    hasCritical
      ? "FILE_STR"
      : hasHigh
      ? "ESCALATE"
      : hasMedium
      ? "ENHANCED_CDD"
      : "MONITOR";

  const summary =
    matched.length === 0
      ? "No specific FATF red-flag indicators matched against the provided text. Standard KYC controls apply; continue monitoring."
      : `${matched.length} red-flag indicator${matched.length > 1 ? "s" : ""} detected (${[...new Set(matched.map((f) => f.category))].join(", ")}). ${
          hasCritical
            ? "Immediate action required — consider STR filing."
            : hasHigh
            ? "Escalate to MLRO for Enhanced Due Diligence."
            : "Enhanced monitoring recommended."
        }`;

  return { flags: matched, overallRisk, recommendedDisposition, summary };
}

// ─── System prompt for AI extraction ─────────────────────────────────────────
const SYSTEM_PROMPT = `You are a UAE DPMS/VASP AML analyst. Extract structured FATF red flags from compliance case notes.

STRICT RULES — violations will break downstream systems:
1. Output ONLY a single JSON object, no markdown, no backticks, no prose.
2. Every "fatfReference" must cite only real, existing FATF Recommendations and their Interpretive Notes.
3. Every "uaeReference" must cite only real UAE legislation: FDL 20/2018, FDL 10/2025, Cabinet Res. 10/2019, Cabinet Res. 134/2025, MoE DNFBP circulars, CBUAE notices, or VARA regulations.
4. "indicator" describes only what is STATED in the notes, never inferred beyond the text.
5. If no red flags exist, return an empty flags array — do not invent flags.

Output JSON shape:
{
  "flags": [
    {
      "indicator": "<specific observable red flag from the text>",
      "category": "structuring" | "layering" | "placement" | "pep" | "sanctions" | "trade_ml" | "proliferation" | "adverse_media" | "ownership_opacity" | "jurisdiction_risk" | "other",
      "severity": "critical" | "high" | "medium" | "low",
      "fatfReference": "<real FATF Rec. number and title>",
      "uaeReference": "<real UAE law article>",
      "actionRequired": "<specific MLRO action>"
    }
  ],
  "overallRisk": "critical" | "high" | "medium" | "low",
  "recommendedDisposition": "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR",
  "summary": "<one sentence — what the MLRO needs to know>"
}`;

export async function POST(req: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (!body?.text?.trim()) {
    return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  const text = body.text.trim();
  const truncated = text.slice(0, 3000);
  const subjectLine = body.subjectName?.trim()
    ? `Subject: ${body.subjectName.trim()}\n\n`
    : "";

  const userContent = `${subjectLine}ANALYST NOTES:\n${truncated}`;

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  let result: ExtractFlagsResult | null = null;

  // ── Try Anthropic API ────────────────────────────────────────────────────
  if (apiKey) {
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
          max_tokens: 900,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          content?: { type: string; text: string }[];
        };
        const raw = data?.content?.[0]?.text ?? "";
        // Strip markdown code fences if model wraps them
        const cleaned = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned) as ExtractFlagsResult;
        // Sanity-check shape — if malformed fall through to rule-based
        if (Array.isArray(parsed?.flags) && parsed?.overallRisk) {
          result = parsed;
        }
      }
    } catch {
      // API error — fall through to rule-based
    }
  }

  // ── Fallback: rule-based extraction from brain catalogue ─────────────────
  if (!result) {
    result = ruleBasedExtract(text);
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.extract-flags",
      `${body.subjectName?.trim() ?? "unknown"} → ${result.flags.length} flag(s), overallRisk: ${result.overallRisk}, disposition: ${result.recommendedDisposition}`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...result });
}
