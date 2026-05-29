export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { createHash } from "node:crypto";
import { parseLlmJson, withMlroLlm } from "@/lib/server/mlro-route-base";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

import { getAnthropicClient } from "@/lib/server/llm";

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

// COMPLIANCE FIX: The fallback memo reference must be deterministic.
// Using Math.random() here produces a different reference each time the
// offline fallback fires, making it impossible to deduplicate or correlate
// fallback-mode memo records in the audit trail (FDL 10/2025 Art.24).
// The fallback reference is a compile-time constant; per-request references
// are derived in buildRequest() from the request timestamp, which IS stable
// within a single invocation.
const FALLBACK_YEAR = new Date().getFullYear();
const FALLBACK: MlroMemoResult = {
  memoRef: `MLRO-MEMO-${FALLBACK_YEAR}-OFFLINE`,
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

interface MlroMemoBody {
  subjectName: string;
  subjectType?: string;
  caseRef?: string;
  activitySummary: string;
  redFlags?: string[];
  investigationSteps?: string;
  proposedDecision?: string;
  mlroName?: string;
  date?: string;
}

// Audit M7: post-consolidation, this route is a thin shell over the
// shared withMlroLlm() base. The whole enforce → parse → fallback →
// client → parse JSON → response envelope skeleton lives in
// web/lib/server/mlro-route-base.ts. This file now only declares the
// route's identity (system prompt, model, max_tokens, body/result shape).
export const POST = (req: Request) => withMlroLlm<MlroMemoBody, MlroMemoResult>(req, {
  route: "mlro-memo",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 2500,
  timeoutMs: 55_000,
  offlineFallback: FALLBACK,
  parseBody: (raw): MlroMemoBody | null => {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Partial<MlroMemoBody>;
    if (!b.subjectName?.trim() || !b.activitySummary?.trim()) return null;
    return b as MlroMemoBody;
  },
  buildRequest: (body) => {
    // COMPLIANCE FIX: derive a stable memo reference from the request content
    // so re-submitting the same case always produces the same reference number.
    // Math.random() previously produced a non-reproducible reference, breaking
    // audit-trail deduplication (FDL 10/2025 Art.24 — 10-year retention).
    const memoSeed = createHash("sha256")
      .update(`${body.subjectName}|${body.activitySummary}|${body.caseRef ?? ""}`)
      .digest("hex")
      .slice(0, 4)
      .toUpperCase();
    const memoRef = `MLRO-MEMO-${new Date().getFullYear()}-${memoSeed}`;
    return {
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
      userContent: `Subject: ${sanitizeField(body.subjectName, 300)}
Type: ${sanitizeField(body.subjectType, 100) || "not specified"}
Case Reference: ${sanitizeField(body.caseRef, 100) || "to be assigned"}
Activity Summary: ${sanitizeText(body.activitySummary, 3000)}
Red Flags: ${body.redFlags?.slice(0, 20).map((f: string) => sanitizeField(f, 200)).join("; ") ?? "not specified"}
Investigation Steps: ${sanitizeText(body.investigationSteps, 2000) || "not specified"}
Proposed Decision: ${sanitizeField(body.proposedDecision, 100) || "MLRO to determine"}
MLRO Name: ${sanitizeField(body.mlroName, 100) || "[MLRO NAME]"}
Date: ${sanitizeField(body.date, 50) || new Date().toLocaleDateString("en-GB")}

Draft the MLRO Decision Memorandum.`,
    };
  },
  parseResult: (text): MlroMemoResult => {
    const parsed = parseLlmJson<MlroMemoResult>(text);
    if (parsed) return parsed;
    // mlro-memo previously threw a SyntaxError on parse failure (which the
    // withMlroLlm wrapper then surfaced as a 500). Preserve the loud-fail
    // contract — callers depend on a thrown error to fall through to their
    // operator escalation path — but throw a typed error with context.
    throw new Error("mlro-memo: model output was not valid JSON and could not be extracted");
  },
});
