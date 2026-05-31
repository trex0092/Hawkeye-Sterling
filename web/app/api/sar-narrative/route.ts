// POST /api/sar-narrative
//
// AI SAR Narrative Generator — jurisdiction-aware professional narrative
// generation for SAR/STR filings using Claude.
//
// Supported jurisdictions:
//   uae  → FDL 20/2018 Article 26 (now consolidated under FDL 10/2025)
//   uk   → POCA 2002
//   us   → BSA Title 31
//   au   → AML/CTF Act 2006
//   sg   → MAS Notice 626
//   other → generic FATF R.20 framework

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeLlmInput } from "@/lib/server/sanitize-prompt";
import { checkHallucination } from "@/lib/server/hallucination-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SarNarrativeRequest {
  subjectName: string;
  subjectType: "individual" | "entity";
  nationality?: string;
  riskScore?: number;
  pepStatus?: boolean;
  sanctionsHits?: Array<{ list: string; matchScore: number }>;
  adverseMediaSummary?: string;
  transactionSummary?: string;
  mlroNotes?: string;
  jurisdiction: "uae" | "uk" | "us" | "au" | "sg" | "other";
}

interface SarNarrativeResponse {
  ok: true;
  narrative: string;
  wordCount: number;
  jurisdiction: string;
  generatedAt: string;
  modelUsed: string;
  disclaimers: string[];
}

function buildSystemPrompt(jurisdiction: SarNarrativeRequest["jurisdiction"]): string {
  const jurisMap: Record<SarNarrativeRequest["jurisdiction"], string> = {
    uae: `You are a senior UAE AML compliance officer drafting a Suspicious Activity Report (SAR/STR) narrative.

REGULATORY FRAMEWORK:
- UAE Federal Decree-Law No. 20 of 2018 (Anti-Money Laundering), Article 26: mandatory STR reporting obligation
- UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025), Art. 15-17: reporting obligations and timelines
- Cabinet Resolution No. 10 of 2019: implementing regulations
- CBUAE AML/CFT Standards: narrative quality requirements
- Mandatory submission via goAML to the UAE Financial Intelligence Unit (FIU/EOCN)

Filing deadline: 30 days from suspicion formation (FDL 10/2025 Art. 17).
Tipping-off prohibition: Art. 29 — do not include any language that could alert the subject.`,

    uk: `You are a senior UK MLRO drafting a Suspicious Activity Report (SAR) narrative for submission to the National Crime Agency (NCA).

REGULATORY FRAMEWORK:
- Proceeds of Crime Act 2002 (POCA 2002): primary SAR obligation
- Terrorism Act 2000: terrorist financing reporting
- Money Laundering Regulations 2017 (as amended): firm-level obligations
- Joint Money Laundering Steering Group (JMLSG) guidance
- NCA SAR Online submission platform

Key legal provisions:
- POCA 2002 s.330 (failure to disclose in the regulated sector)
- POCA 2002 s.333A (tipping-off prohibition)
- Defence against money laundering (DAML) SARs where consent is required before proceeding.`,

    us: `You are a senior US BSA Officer drafting a Suspicious Activity Report (SAR) narrative for submission to FinCEN.

REGULATORY FRAMEWORK:
- Bank Secrecy Act (BSA) Title 31 USC §5318(g): mandatory SAR filing
- 31 CFR Part 1020 (banks), Part 1022 (MSBs), Part 1023 (brokers): implementing rules
- FinCEN SAR Filing Instructions (FinCEN Form 111)
- FFIEC BSA/AML Examination Manual
- USA PATRIOT Act Section 314(b): voluntary information sharing

Filing deadline: 30 days from detection (60 days if no suspect identified).
Safe harbor: 31 USC §5318(g)(3) — filers are immune from liability.
Prohibition on disclosure: 31 USC §5318(g)(2) — do not disclose the SAR to the subject.`,

    au: `You are a senior Australian AMLCO drafting a Suspicious Matter Report (SMR) for submission to AUSTRAC.

REGULATORY FRAMEWORK:
- Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (AML/CTF Act): primary obligation
- AML/CTF Rules 2007 (as amended): operational requirements
- AUSTRAC guidance on SMR reporting obligations
- Proceeds of Crime Act 2002 (Cth): predicate offences

Filing deadline: within 3 business days of forming a suspicion.
Safe harbour protections apply under AML/CTF Act s.49.`,

    sg: `You are a senior Singapore Compliance Officer drafting a Suspicious Transaction Report (STR) for submission to the Singapore Police Force / STRO.

REGULATORY FRAMEWORK:
- Corruption, Drug Trafficking and Other Serious Crimes (Confiscation of Benefits) Act (CDSA)
- Terrorism (Suppression of Financing) Act (TSOFA)
- MAS Notice 626 (AML/CFT for banks) and equivalent sector notices
- MAS Guidelines on AML/CFT practices

Filing requirement: promptly upon forming a suspicion.
Tipping-off prohibition applies under CDSA and TSOFA.`,

    other: `You are a senior AML Compliance Officer drafting a Suspicious Activity Report (SAR) narrative in accordance with international AML/CFT standards.

REGULATORY FRAMEWORK:
- FATF Recommendation 20: mandatory STR/SAR reporting
- FATF Recommendation 40 Methodology: reporting entity obligations
- Egmont Group: FIU reporting standards
- Local jurisdiction AML/CFT legislation as applicable`,
  };

  return `${jurisMap[jurisdiction]}

MANDATORY NARRATIVE ELEMENTS (all must appear):
1. Subject identification — full name, entity type, nationality/jurisdiction, relevant risk factors
2. Suspicious activity description — what occurred, specific transaction types, amounts, dates, counterparties
3. Basis for suspicion — specific red flags, risk indicators, PEP/sanctions/adverse media findings
4. Timeline — when activity occurred and when suspicion was formed
5. Due diligence steps taken — what the institution did to determine legitimacy
6. Regulatory filing basis — cite the specific legal provision requiring this report

QUALITY REQUIREMENTS:
- Narrative must be 300–600 words
- Formal, factual, precise tone — no speculation beyond what facts support
- Do not include language that could alert the subject (tipping-off)
- Reference all relevant risk scores, sanctions hits, and adverse media findings provided
- Use factual language: "the activity is consistent with" not "may possibly suggest"

Return ONLY a plain prose narrative — no JSON, no markdown code fences, no headings labels like "1." — just professional flowing paragraphs suitable for direct submission to the FIU/financial intelligence authority.`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, cost: 3 });
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: SarNarrativeRequest;
  try {
    body = (await req.json()) as SarNarrativeRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400, headers: gate.headers });
  }
  if (!body.jurisdiction) {
    return NextResponse.json({ ok: false, error: "jurisdiction is required" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "SAR narrative generation temporarily unavailable — ANTHROPIC_API_KEY not configured." },
      { status: 503, headers: gate.headers },
    );
  }

  const systemPrompt = buildSystemPrompt(body.jurisdiction);

  const userContent = [
    `Subject Name: ${sanitizeField(body.subjectName, 300)}`,
    `Subject Type: ${sanitizeField(body.subjectType, 20)}`,
    body.nationality ? `Nationality/Country: ${sanitizeField(body.nationality, 100)}` : null,
    body.riskScore != null ? `Risk Score: ${body.riskScore}/100` : null,
    body.pepStatus ? `PEP Status: YES — subject is a Politically Exposed Person` : null,
    body.sanctionsHits?.length
      ? `Sanctions Hits: ${body.sanctionsHits.map((h) => `${sanitizeField(h.list, 100)} (${Math.round(h.matchScore * 100)}% match)`).join("; ")}`
      : null,
    body.adverseMediaSummary ? `Adverse Media Summary: ${sanitizeLlmInput(body.adverseMediaSummary, 2000)}` : null,
    body.transactionSummary ? `Transaction Summary: ${sanitizeLlmInput(body.transactionSummary, 2000)}` : null,
    body.mlroNotes ? `MLRO Notes: ${sanitizeLlmInput(body.mlroNotes, 2000)}` : null,
    `Jurisdiction for filing: ${sanitizeField(body.jurisdiction, 20).toUpperCase()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getAnthropicClient(apiKey, 4_500, "sar-narrative");
  const generatedAt = new Date().toISOString();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Draft a professional SAR narrative for the following case:\n\n${userContent}\n\nWrite the full narrative now.`,
        },
      ],
    });

    const narrative =
      response.content[0]?.type === "text"
        ? (response.content[0] as { type: "text"; text: string }).text.trim()
        : "";

    if (!narrative) {
      return NextResponse.json(
        { ok: false, error: "SAR narrative generation failed — empty response from AI model." },
        { status: 503, headers: gate.headers },
      );
    }

    const wordCount = narrative.split(/\s+/).filter(Boolean).length;

    const result: SarNarrativeResponse = {
      ok: true,
      narrative,
      wordCount,
      jurisdiction: body.jurisdiction,
      generatedAt,
      modelUsed: response.model,
      disclaimers: [
        "This narrative was AI-generated and requires MLRO review and approval before filing.",
        "The reporting institution remains solely responsible for the accuracy and completeness of any SAR/STR submission.",
        "Do not disclose the existence of this report to the subject or any third party not authorised to receive it (tipping-off prohibition).",
        "Retain this report and all supporting documentation for the minimum statutory retention period.",
      ],
    };

    void writeAuditChainEntry({ event: "sar_narrative.generated", actor: gate.keyId, subjectName: body.subjectName, jurisdiction: body.jurisdiction }, tenant).catch(() => {});
    // Fire-and-forget hallucination check — must not block the response path.
    const evidence = [body.adverseMediaSummary, body.transactionSummary, body.mlroNotes].filter((s): s is string => !!s);
    void checkHallucination(narrative, evidence, { route: "sar-narrative", tenantId: tenant, actor: gate.keyId }).catch(() => undefined);
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.error("[sar-narrative] AI generation failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "SAR narrative generation temporarily unavailable — please retry." },
      { status: 503, headers: gate.headers },
    );
  }
}
