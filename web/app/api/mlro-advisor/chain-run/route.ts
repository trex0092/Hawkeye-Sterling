export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface ChainRunResult {
  ok: true;
  subjectBrief: string;
  typologyMatch: string;
  strRecommendation: string;
  chainDuration: number;
}

const SYSTEM_PROMPT = `You are a senior MLRO (Money Laundering Reporting Officer) with deep expertise in UAE AML/CFT law (FDL 10/2025, CBUAE AML Standards), FATF Recommendations, and financial crime typologies. You produce concise, actionable analysis for compliance officers. Respond in plain prose — no markdown headers, no bullet points — focused and professional.`;

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subject?: string;
    jurisdiction?: string;
    riskScore?: number;
    transactionPattern?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { subject = "Unknown Subject", jurisdiction = "UAE", riskScore = 50, transactionPattern = "" } = body;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        subjectBrief: `[Demo] Subject brief for ${subject} in ${jurisdiction}. Risk score: ${riskScore}/100. Key risk factors include jurisdiction exposure and transaction pattern anomalies consistent with layering typologies.`,
        typologyMatch: `[Demo] Typology match for ${subject}: Trade-Based Money Laundering (FATF R.22), Structuring below reporting thresholds (FATF R.20), and potential use of shell entities for placement (FATF R.24).`,
        strRecommendation: `[Demo] Recommendation: FILE STR. The subject presents a composite risk score of ${riskScore}/100 with indicators meeting the reasonable suspicion threshold under UAE FDL 10/2025 Art.26. Recommended narrative opening: "This report concerns [${subject}], a [entity type] operating in [${jurisdiction}], whose account activity has given rise to suspicion of money laundering pursuant to UAE FDL 10/2025."`,
        chainDuration: 0,
      } satisfies ChainRunResult,
      { headers: gate.headers },
    );
  }

  const chainStart = Date.now();

  try {
    const client = getAnthropicClient(apiKey, 22_000);

    // ── Step 1: Subject Brief ──────────────────────────────────────────────
    const step1 = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Write a concise Subject Brief (3–4 sentences) for the following subject. Cover: who they likely are, their key risk factors given the jurisdiction and risk score, and any structural red flags from the transaction pattern.

Subject: ${subject}
Jurisdiction: ${jurisdiction}
Risk Score: ${riskScore}/100
Transaction Pattern: ${transactionPattern || "Not provided"}

Respond in plain prose only — no bullet points, no headers.`,
        },
      ],
    });

    const subjectBrief =
      step1.content[0]?.type === "text" ? step1.content[0].text.trim() : "Subject brief unavailable.";

    // ── Step 2: Typology Match ─────────────────────────────────────────────
    const step2 = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Based on the subject brief below, identify 2–3 FATF money laundering typologies that best match this profile. For each typology, name it and cite the relevant FATF Recommendation. Explain in 1–2 sentences why it matches. Write in plain prose only.

Subject Brief: ${subjectBrief}
Subject: ${subject}
Jurisdiction: ${jurisdiction}
Risk Score: ${riskScore}/100
Transaction Pattern: ${transactionPattern || "Not provided"}`,
        },
      ],
    });

    const typologyMatch =
      step2.content[0]?.type === "text" ? step2.content[0].text.trim() : "Typology match unavailable.";

    // ── Step 3: STR Recommendation ────────────────────────────────────────
    const step3 = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Given the subject brief and typology matches below, provide an STR disposition decision: FILE, DEFER, or CLOSE — with a one-sentence rationale citing UAE FDL 10/2025 or FATF R.20 where applicable. Then write the first 2–3 sentences of a recommended STR narrative opening that an MLRO could use in a goAML submission. Write in plain prose only.

Subject Brief: ${subjectBrief}

Typology Match: ${typologyMatch}

Subject: ${subject}
Jurisdiction: ${jurisdiction}
Risk Score: ${riskScore}/100`,
        },
      ],
    });

    const strRecommendation =
      step3.content[0]?.type === "text" ? step3.content[0].text.trim() : "STR recommendation unavailable.";

    const chainDuration = Date.now() - chainStart;

    return NextResponse.json({
      ok: true,
      subjectBrief,
      typologyMatch,
      strRecommendation,
      chainDuration,
    } satisfies ChainRunResult, { headers: gate.headers });
  } catch (err) {
    console.error("chain-run error", err);
    return NextResponse.json({
      ok: true,
      subjectBrief: `[Fallback] Subject brief for ${subject} in ${jurisdiction}. Risk score: ${riskScore}/100. AI analysis unavailable — manual review required.`,
      typologyMatch: `[Fallback] Typology match unavailable — manual review required.`,
      strRecommendation: `[Fallback] STR recommendation unavailable — manual review required.`,
      chainDuration: 0,
    } satisfies ChainRunResult, { headers: gate.headers });
  }
}
