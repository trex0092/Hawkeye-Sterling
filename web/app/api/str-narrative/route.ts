export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { checkHallucination } from "@/lib/server/hallucination-gate";

export interface StrNarrativeResult {
  narrative: string;
  wordCount: number;
  qualityScore: number;
  fatfR20Coverage: string[];
  missingElements: string[];
  goAmlFields: {
    reportType: string;
    suspiciousActivityType: string;
    filingBasis: string;
    deadlineDate: string;
  };
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  let body: {
    subjectName: string;
    subjectType?: string;
    subjectNationality?: string;
    activityDescription: string;
    amounts?: string;
    dates?: string;
    counterparty?: string;
    jurisdiction?: string;
    redFlags?: string[];
    actionsTaken?: string;
    additionalFacts?: string;
    // FATF predicate offences identified in adverse media / transaction monitoring
    fatfPredicateOffences?: string[];
    // What triggered the monitoring alert (threshold_breach, pattern_match, peer_comparison, etc.)
    monitoringTrigger?: string;
    // Adverse media findings summary
    adverseMediaFindings?: string;
    // Transaction monitoring alert details
    transactionMonitoringAlert?: string;
    // Whether this is an initial or supplementary report
    reportAction?: "initial" | "supplementary";
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.subjectName?.trim() || !body.activityDescription?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName and activityDescription required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  const QUALITY_THRESHOLD = 80;
  const MAX_ITERATIONS = 3;

  const baseUserContent = `Subject Name: ${sanitizeField(body.subjectName, 500)}
Subject Type: ${sanitizeField(body.subjectType, 100) || "not specified"}
Nationality/Jurisdiction: ${sanitizeField(body.subjectNationality, 100) || "not specified"}
Activity Description: ${sanitizeText(body.activityDescription, 3000)}
Amounts Involved: ${sanitizeField(body.amounts, 200) || "not specified"}
Key Dates: ${sanitizeField(body.dates, 200) || "not specified"}
Counterparty: ${sanitizeField(body.counterparty, 500) || "not specified"}
Jurisdiction: ${sanitizeField(body.jurisdiction, 100) || "not specified"}
Red Flags Identified: ${body.redFlags?.slice(0, 20).map((f) => sanitizeField(f, 200)).join("; ") ?? "not specified"}
Actions Taken: ${sanitizeText(body.actionsTaken, 1000) || "not specified"}
Additional Facts: ${sanitizeText(body.additionalFacts, 2000) || "none"}
FATF Predicate Offences Identified: ${body.fatfPredicateOffences?.slice(0, 20).map((f) => sanitizeField(f, 200)).join("; ") ?? "not specified"}
Monitoring Trigger: ${sanitizeField(body.monitoringTrigger, 300) || "not specified"}
Adverse Media Findings: ${sanitizeText(body.adverseMediaFindings, 1000) || "none"}
Transaction Monitoring Alert Details: ${sanitizeText(body.transactionMonitoringAlert, 1000) || "none"}
Report Action: ${body.reportAction === "supplementary" ? "Supplementary" : "Initial"}

Draft the STR narrative, ensuring all FATF predicate offences, specific dates, amounts, transaction types, monitoring trigger, and regulatory provisions (UAE Federal Decree-Law No. 10 of 2025 Art.17, FATF Recommendation 20) are included.`;

  const SYSTEM = `You are a senior UAE AML compliance officer drafting a Suspicious Transaction Report (STR) for submission via goAML to the UAE Financial Intelligence Unit (FIU).

REGULATORY FRAMEWORK:
- UAE Federal Decree-Law No. 10 of 2025 (Federal Decree-Law No. 10 of 2025) on Anti-Money Laundering and Combating the Financing of Terrorism:
  Art. 14: obligation to monitor customer transactions and detect suspicious activity
  Art. 17: mandatory STR filing within 48 hours of forming suspicion
  Art. 18: tipping-off prohibition
- FATF Recommendation 20: mandatory STR reporting when a financial institution suspects or has reasonable grounds to suspect that funds are the proceeds of a criminal activity or are related to terrorist financing
- FATF 40 Recommendations — Predicate Offences (Rec. 3): all serious offences including drug trafficking, corruption, fraud, tax evasion, human trafficking, arms trafficking, cybercrime, organised crime, terrorist financing, proliferation financing, environmental crime, market manipulation

MANDATORY NARRATIVE ELEMENTS (ALL must appear):
1. WHO — Full subject identification: name, type (individual/corporate), nationality, ID/passport, account number(s)
2. WHAT — Precise description of suspicious activity with specific transaction types (cash deposit, wire transfer, trade finance, crypto exchange, etc.), amounts in AED and original currency, frequency, and pattern
3. WHEN — Specific dates and timeline of all suspicious transactions and when suspicion was formed
4. WHERE — Account numbers, branch location, correspondent banks, receiving jurisdictions, geographic routing
5. WHY — Clear suspicion rationale: which specific FATF predicate offence(s) are suspected, how each red flag maps to a typology, linkage to adverse media findings if present
6. MONITORING TRIGGER — Explicitly state what triggered the alert: threshold breach (specify the threshold), unusual pattern vs peer group, velocity rule, structuring pattern, geographic anomaly, etc.
7. REGULATORY BASIS — Cite: UAE Federal Decree-Law No. 10 of 2025 Art.17 as the filing obligation; FATF R.20 as the international standard; specify predicate offences under FATF R.3
8. ACTIONS TAKEN — Internal escalation chain, account restrictions applied, documentation gathered, MLRO decision date

QUALITY REQUIREMENTS:
- Narrative must be 300–500 words minimum
- Every specific amount must include the date it occurred
- FATF predicate offences must be named explicitly (e.g., "tax evasion," "corruption," "drug trafficking proceeds") not generically
- Suspicion rationale paragraph must explain WHY the activity is suspicious, not just WHAT occurred
- Do not use weasel words ("may," "might," "possibly") — use factual language ("the pattern is consistent with," "the activity displays the hallmarks of")
- If adverse media findings are provided, they must be referenced in the suspicion rationale

Tone: formal, factual, precise. No speculation beyond what the facts support. Use clear paragraphs with headings. The narrative must be suitable for direct submission to the UAE FIU via goAML.

Respond ONLY with valid JSON — no markdown fences:
{
  "narrative": "<full STR narrative — structured text with headings, minimum 300 words>",
  "wordCount": <number>,
  "qualityScore": <0–100>,
  "fatfR20Coverage": ["<covered element>"],
  "missingElements": ["<element that should be added before filing>"],
  "goAmlFields": {
    "reportType": "<STR|SAR|CTR>",
    "suspiciousActivityType": "<typology category matching UAE FIU codes>",
    "filingBasis": "UAE Federal Decree-Law No. 10 of 2025 Art.17; FATF R.20",
    "deadlineDate": "<ISO date 48 hours from suspicion formation>"
  },
  "regulatoryBasis": "UAE Federal Decree-Law No. 10 of 2025 Art.14, Art.17; FATF Recommendation 20; FATF Predicate Offences Recommendation 3"
}`;

  const client = getAnthropicClient(apiKey, 4_500, "str-narrative");

  try {
    let best: StrNarrativeResult | null = null;
    let iterations = 0;
    let userContent = baseUserContent;

    while (iterations < MAX_ITERATIONS) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";

      let candidate: StrNarrativeResult | null = null;
      try {
        candidate = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as StrNarrativeResult;
        if (!Array.isArray(candidate.fatfR20Coverage)) candidate.fatfR20Coverage = [];
        if (!Array.isArray(candidate.missingElements)) candidate.missingElements = [];
      } catch {
        break; // parse failure — keep best from prior iterations
      }

      if (candidate?.narrative) {
        iterations++;
        if (!best || (candidate.qualityScore ?? 0) > (best.qualityScore ?? 0)) best = candidate;
        if ((candidate.qualityScore ?? 0) >= QUALITY_THRESHOLD) break;
        if (candidate.missingElements?.length) {
          userContent = `${baseUserContent}

REVISION REQUEST (attempt ${iterations}/${MAX_ITERATIONS}):
The previous draft scored ${candidate.qualityScore}/100. Improve it by addressing these missing elements:
${candidate.missingElements.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Produce a revised narrative that scores ≥${QUALITY_THRESHOLD}/100.`;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (!best) return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
    void writeAuditChainEntry({ event: "str_narrative.generated", actor: gate.keyId, subjectName: body.subjectName, iterations, qualityScore: best.qualityScore }, tenant).catch(() => {});
    // Fire-and-forget hallucination check — must not block the response path.
    const evidence = [body.activityDescription, body.adverseMediaFindings, body.transactionMonitoringAlert].filter((s): s is string => !!s);
    void checkHallucination(best.narrative, evidence, { route: "str-narrative", tenantId: tenant, actor: gate.keyId }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...best, iterations }, { headers: gate.headers });
  } catch (err) {
    console.error("[str-narrative] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "str-narrative temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }
}
