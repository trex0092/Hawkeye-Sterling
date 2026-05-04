export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
interface SubjectInput {
  id: string;
  name: string;
  jurisdiction?: string;
  clientType?: string;
  lastScreened?: string; // ISO date string
  riskScore?: number;
  hitCount?: number;
}

interface PrioritizedSubject extends SubjectInput {
  priority: "immediate" | "scheduled" | "low";
  reason: string;
  estimatedRisk: string;
}

interface PrioritizeResult {
  ok: true;
  prioritized: PrioritizedSubject[];
  immediateCount: number;
  scheduledCount: number;
  insights: string;
}

const FALLBACK: PrioritizeResult = {
  ok: true,
  prioritized: [],
  immediateCount: 0,
  scheduledCount: 0,
  insights: "Unable to generate prioritization — Anthropic API key not configured.",
};

export async function POST(req: Request) {
  let body: { subjects?: SubjectInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const subjects = body.subjects ?? [];
  if (subjects.length === 0) {
    return NextResponse.json({ ok: false, error: "No subjects provided" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    const fallbackWithSubjects: PrioritizeResult = {
      ...FALLBACK,
      prioritized: subjects.map((s) => ({
        ...s,
        priority: "scheduled" as const,
        reason: "Default scheduled — API key not configured",
        estimatedRisk: "Unknown",
      })),
    };
    return NextResponse.json(fallbackWithSubjects);
  }

  try {
    const client = getAnthropicClient(apiKey);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are an AML compliance expert specialising in screening prioritisation under FATF Recommendations, UAE FDL 10/2025, CBUAE AML Standards, and OFAC/HMT/EU sanctions frameworks.

Your task: analyse the provided batch subjects and rank them by screening urgency. Consider:
1. Time elapsed since last screening — subjects not screened in >30 days need review; >90 days are critical
2. Existing risk score — higher scores warrant more frequent re-screening
3. Hit count — subjects with prior hits need priority re-screening when lists update
4. Jurisdiction risk — FATF grey/black-listed jurisdictions (Iran, North Korea, Myanmar, etc.), high-risk DNFBP jurisdictions
5. Client type risk — PEPs, high-net-worth, cash-intensive businesses need frequent checks
6. Known recent list changes — OFAC SDN updates, UN Security Council designations, FATF plenary outcomes

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "prioritized": [
    {
      "id": "string",
      "name": "string",
      "jurisdiction": "string or null",
      "clientType": "string or null",
      "lastScreened": "string or null",
      "riskScore": number or null,
      "hitCount": number or null,
      "priority": "immediate"|"scheduled"|"low",
      "reason": "string — concise explanation referencing specific risk factor",
      "estimatedRisk": "string — brief risk assessment e.g. 'High — prior hits + FATF grey-list jurisdiction'"
    }
  ],
  "immediateCount": number,
  "scheduledCount": number,
  "insights": "string — 2-3 sentences summarising the batch's risk concentration, most urgent reasons, and any systemic patterns"
}

Sort the prioritized array: immediate first, then scheduled, then low. Within each priority tier, sort by estimated risk descending.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Batch subjects for prioritization (${subjects.length} total):
${JSON.stringify(subjects, null, 2)}

Today's date: ${new Date().toISOString().slice(0, 10)}

Analyse and prioritise these subjects for AML re-screening urgency. Flag immediate re-screens for any subject with: prior sanctions hits, FATF grey/black-list jurisdiction, >90 days since last screen, risk score ≥70, or known recent list updates affecting their profile.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PrioritizeResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "batch/prioritize temporarily unavailable - please retry." }, { status: 503 });
  }
}
