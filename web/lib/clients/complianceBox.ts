// Hawkeye Sterling — client-side helpers for the /api/compliance-box endpoint.
//
// Wraps the 6 supported AML/CFT workflows behind typed functions so UI
// components don't need to remember the task_type string or prompt
// format. Each helper hits the same backend route; the route gates auth
// and runs the agent inside an Upstash Box.
//
// Same-origin only — never embed UPSTASH_BOX_API_KEY or ANTHROPIC_API_KEY
// in browser code; the route reads both server-side.

const ENDPOINT = "/api/compliance-box";

export interface ComplianceBoxResult {
  ok: boolean;
  result?: string;
  status?: string;
  box_id?: string;
  cost?: { totalUsd?: number; inputTokens?: number; outputTokens?: number };
  durationMs?: number;
  error?: string;
}

interface CallArgs {
  prompt: string;
  task_type: string;
  case_id?: string;
  subject?: Record<string, unknown>;
}

async function call(args: CallArgs): Promise<ComplianceBoxResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    credentials: "same-origin",
  });
  let body: ComplianceBoxResult;
  try {
    body = (await res.json()) as ComplianceBoxResult;
  } catch {
    body = { ok: false, error: `non-JSON response (HTTP ${res.status})` };
  }
  if (!res.ok && body.ok !== false) {
    body.ok = false;
    body.error = body.error ?? `HTTP ${res.status}`;
  }
  return body;
}

/** Sanctions screening against UN / OFAC / EU / UK / UAE EOCN / OpenSanctions. */
export function sanctionsScreen(name: string, caseId?: string): Promise<ComplianceBoxResult> {
  return call({
    task_type: "SANCTIONS_SCREENING",
    case_id: caseId,
    subject: { name },
    prompt:
      `Screen "${name}" against UN, OFAC SDN/CONS, EU FSF, UK OFSI, UAE EOCN, ` +
      `and OpenSanctions consolidated sources. Return: match status, confidence ` +
      `score, hit details (program / regime / dataset / lastChange), and the ` +
      `recommended next action per UAE FDL 10/2025 Art.26-29.`,
  });
}

/** KYC / CDD review of a customer envelope. */
export function kycReview(
  customer: Record<string, unknown>,
  caseId?: string,
): Promise<ComplianceBoxResult> {
  return call({
    task_type: "KYC_REVIEW",
    case_id: caseId,
    subject: customer,
    prompt:
      "Review the KYC envelope above. Verify identity, beneficial ownership chain, " +
      "source-of-funds documentation, PEP exposure, and adverse media. Return: " +
      "applicable CDD tier (simplified / standard / enhanced), missing or weak " +
      "documents, an aggregated risk score 0–100, and any tipping-off concerns.",
  });
}

/** Transaction monitoring + AML red-flag analysis. */
export function transactionAnalysis(
  transactions: unknown,
  caseId?: string,
): Promise<ComplianceBoxResult> {
  return call({
    task_type: "TRANSACTION_MONITORING",
    case_id: caseId,
    subject: { transactions },
    prompt:
      "Analyse the transactions above for AML red flags. Check: structuring / " +
      "smurfing patterns, TBML indicators, velocity anomalies, geography-of-funds " +
      "mismatches, and DPMS-specific 55,000 AED cash threshold breaches. " +
      "Return: matched typologies, severity, STR recommendation, and the FATF " +
      "Recommendation references.",
  });
}

/** STR draft for goAML submission. */
export function draftStr(
  caseDetails: Record<string, unknown>,
  caseId?: string,
): Promise<ComplianceBoxResult> {
  return call({
    task_type: "STR_DRAFT",
    case_id: caseId,
    subject: caseDetails,
    prompt:
      "Draft an STR for the case details above in UAE FIU goAML format. Include " +
      "all required fields (rentity, reporting person, subject identity, " +
      "transactions, narrative, attachments). Apply tipping-off filters per " +
      "FDL 10/2025 Art.29 — no language that could alert the subject. Return " +
      "the structured envelope ready for the /api/sar-report serialiser.",
  });
}

/** Enhanced Due Diligence report for a high-risk customer. */
export function eddReport(
  profile: Record<string, unknown>,
  caseId?: string,
): Promise<ComplianceBoxResult> {
  return call({
    task_type: "EDD_REPORT",
    case_id: caseId,
    subject: profile,
    prompt:
      "Produce an EDD report for the high-risk customer profile above. Include: " +
      "PEP screening (with role classification), beneficial ownership tree to " +
      "ultimate UBO, source-of-wealth narrative + verification, country-of-risk " +
      "assessment (FATF + UAE CAHRA list), and ongoing-monitoring frequency " +
      "recommendation per Cabinet Decision 134/2025.",
  });
}

/** LBMA Responsible Gold Guidance Steps 1–5 supply-chain check. */
export function lbmaCheck(
  supplier: Record<string, unknown>,
  caseId?: string,
): Promise<ComplianceBoxResult> {
  return call({
    task_type: "SUPPLY_CHAIN_LBMA",
    case_id: caseId,
    subject: supplier,
    prompt:
      "Apply LBMA Responsible Gold Guidance Steps 1–5 to the supplier above. " +
      "Cross-check OECD DDG Annex II (CAHRA jurisdictions, conflict-affected " +
      "high-risk areas, severe human rights abuses). Return: per-step compliance " +
      "status, identified gaps, remediation steps, and whether the supplier " +
      "should be onboarded / blocked / placed on enhanced monitoring.",
  });
}
