export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";

export interface MlroMemoResult {
  memoRef: string;
  memo: string;
  decision: "file_str" | "escalate_senior" | "enhanced_cdd" | "monitor_and_review" | "close_no_action";
  decisionBasis: string;
  riskRating: "critical" | "high" | "medium" | "low";
  auditElements: {
    subjectIdentified: boolean;
    activityDocumented: boolean;
    redFlagsListed: boolean;
    regulatoryBasisCited: boolean;
    decisionRationalePresent: boolean;
    deadlineNoted: boolean;
  };
  qualityScore: number;
  regulatoryBasis: string;
}

const FALLBACK: MlroMemoResult = {
  memoRef: `MLRO-MEMO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
  decision: "file_str",
  decisionBasis: "Reasonable grounds to suspect ML/TF per UAE FDL 10/2025 Art.21. Pattern consistent with structuring and layering typology.",
  riskRating: "high",
  auditElements: { subjectIdentified: true, activityDocumented: true, redFlagsListed: true, regulatoryBasisCited: true, decisionRationalePresent: true, deadlineNoted: true },
  qualityScore: 82,
  regulatoryBasis: "UAE FDL 10/2025 Art.21, Art.26; FATF R.20; Cabinet Resolution 134/2025",
  memo: `MLRO DECISION MEMORANDUM
Reference: MLRO-MEMO-[YEAR]-[NUMBER]
Date: [DATE]
Prepared by: [MLRO NAME]
Classification: STRICTLY CONFIDENTIAL — LEGAL PRIVILEGE

────────────────────────────────────────────────────
1. SUBJECT IDENTIFICATION
────────────────────────────────────────────────────
Subject: [SUBJECT NAME]
Entity Type: [TYPE]
Nationality/Jurisdiction: [COUNTRY]
Risk Rating at Onboarding: [RATING]
Customer Since: [DATE]
Account Reference: [REF]

────────────────────────────────────────────────────
2. SUSPICIOUS ACTIVITY — SUMMARY OF FACTS
────────────────────────────────────────────────────
[Description of the suspicious activity, transaction pattern, timeline, amounts, and counterparties]

────────────────────────────────────────────────────
3. RED FLAGS IDENTIFIED
────────────────────────────────────────────────────
1. [Red flag 1 — with FATF typology reference]
2. [Red flag 2]
3. [Red flag 3]

────────────────────────────────────────────────────
4. INVESTIGATION CONDUCTED
────────────────────────────────────────────────────
— Transaction monitoring alert reviewed
— Customer CDD file reviewed — [findings]
— Enhanced scrutiny questions posed to customer — response: [outcome]
— Internal escalation to MLRO on [date]
— External database checks conducted: [results]

────────────────────────────────────────────────────
5. REGULATORY ANALYSIS
────────────────────────────────────────────────────
The subject's activity is consistent with [typology] as documented in FATF Guidance [reference]. The MLRO is satisfied, on the balance of reasonable grounds as required under UAE FDL 10/2025 Art.21(1), that the funds may constitute proceeds of a predicate offence or be intended for use in money laundering.

────────────────────────────────────────────────────
6. MLRO DECISION
────────────────────────────────────────────────────
DECISION: FILE SUSPICIOUS TRANSACTION REPORT (STR)

The MLRO has determined that an STR must be filed with the UAE FIU via goAML within 2 business days of this determination, pursuant to UAE FDL 10/2025 Art.26.

Filing deadline: [DATE + 2 BUSINESS DAYS]
Tipping-off prohibition applies per FDL 10/2025 Art.25.

────────────────────────────────────────────────────
7. SIGN-OFF
────────────────────────────────────────────────────
MLRO: _____________________ Date: ___________
Deputy MLRO: ______________ Date: ___________

This memorandum forms part of the entity's AML/CFT audit trail and is to be retained for a minimum of 8 years pursuant to UAE FDL 10/2025 Art.16.`,
};

export async function POST(req: Request) {
  let body: {
    subjectName: string;
    subjectType?: string;
    caseRef?: string;
    activitySummary: string;
    redFlags?: string[];
    investigationSteps?: string;
    proposedDecision?: string;
    mlroName?: string;
    date?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subjectName?.trim() || !body.activitySummary?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName and activitySummary required" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "mlro-memo temporarily unavailable - please retry." }, { status: 503 });

  const memoRef = `MLRO-MEMO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2500,
        system: `You are a senior UAE MLRO drafting a formal MLRO Decision Memorandum for the audit trail. This document will be reviewed by regulators (MoE, CBUAE, FIU) during inspections. It must be precise, formal, complete, and audit-ready.

The memo must include:
1. Header (reference, date, MLRO name, classification)
2. Subject Identification (name, type, nationality, risk rating, account ref)
3. Suspicious Activity Summary (facts, transactions, timeline, amounts)
4. Red Flags Identified (numbered, with FATF typology references)
5. Investigation Conducted (steps taken, customer responses, escalation timeline)
6. Regulatory Analysis (legal basis for suspicion, typology match)
7. MLRO Decision (clear decision with deadline if STR)
8. Sign-off block

Respond ONLY with valid JSON — no markdown fences:
{
  "memoRef": "<reference number ${memoRef}>",
  "memo": "<full formatted memo text — use newlines and section separators>",
  "decision": "file_str"|"escalate_senior"|"enhanced_cdd"|"monitor_and_review"|"close_no_action",
  "decisionBasis": "<one-sentence basis>",
  "riskRating": "critical"|"high"|"medium"|"low",
  "auditElements": {
    "subjectIdentified": <bool>, "activityDocumented": <bool>, "redFlagsListed": <bool>,
    "regulatoryBasisCited": <bool>, "decisionRationalePresent": <bool>, "deadlineNoted": <bool>
  },
  "qualityScore": <0–100>,
  "regulatoryBasis": "<citation>"
}`,
        messages: [{
          role: "user",
          content: `Subject: ${body.subjectName}
Type: ${body.subjectType ?? "not specified"}
Case Reference: ${body.caseRef ?? "to be assigned"}
Activity Summary: ${body.activitySummary}
Red Flags: ${body.redFlags?.join("; ") ?? "not specified"}
Investigation Steps: ${body.investigationSteps ?? "not specified"}
Proposed Decision: ${body.proposedDecision ?? "MLRO to determine"}
MLRO Name: ${body.mlroName ?? "[MLRO NAME]"}
Date: ${body.date ?? new Date().toLocaleDateString("en-GB")}

Draft the MLRO Decision Memorandum.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "mlro-memo temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as MlroMemoResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "mlro-memo temporarily unavailable - please retry." }, { status: 503 });
  }
}
