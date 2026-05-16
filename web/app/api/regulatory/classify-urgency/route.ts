export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
interface InputItem {
  title: string;
  summary?: string;
  date?: string;
  source?: string;
  [key: string]: unknown;
}

interface ClassifiedItem extends InputItem {
  urgency: "critical" | "high" | "medium" | "low";
  reason: string;
}

export interface ClassifyUrgencyResult {
  ok: true;
  classified: ClassifiedItem[];
}

const SYSTEM_PROMPT = `You are a regulatory intelligence analyst specialising in AML/CFT compliance. Your task is to classify regulatory news items by urgency for a UAE precious-metals dealer (DPMS/DNFBP) regulated by MoE, CBUAE, and subject to FATF Recommendations.

Urgency levels:
- critical: Immediate action required — new sanctions, enforcement actions, regulatory deadline breaches, law changes effective now or within 7 days, FATF grey/blacklist changes affecting key jurisdictions
- high: Action required within 30 days — new circulars, guidance updates, upcoming regulatory deadlines, enforcement trends, significant typology alerts
- medium: Monitor and assess — consultation papers, proposed rule changes, industry guidance, thematic reviews without immediate deadlines
- low: For awareness — general industry news, academic publications, minor updates, items with no direct compliance impact

Respond ONLY with a valid JSON array (no markdown fences). Each element must have: "index" (0-based), "urgency" ("critical"|"high"|"medium"|"low"), "reason" (one sentence, max 15 words).`;

export async function POST(req: Request) {
  let body: { items?: InputItem[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, classified: [] } satisfies ClassifyUrgencyResult);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    // Fallback: classify deterministically by keyword
    const classified: ClassifiedItem[] = items.map((item) => {
      const text = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
      let urgency: ClassifiedItem["urgency"] = "medium";
      let reason = "General regulatory update requiring routine monitoring.";
      if (
        text.includes("sanction") ||
        text.includes("enforcement") ||
        text.includes("breach") ||
        text.includes("grey list") ||
        text.includes("blacklist") ||
        text.includes("immediate") ||
        text.includes("urgent")
      ) {
        urgency = "critical";
        reason = "Contains sanctions, enforcement, or immediate compliance trigger.";
      } else if (
        text.includes("circular") ||
        text.includes("deadline") ||
        text.includes("guidance") ||
        text.includes("new law") ||
        text.includes("amendment") ||
        text.includes("aml") ||
        text.includes("fatf")
      ) {
        urgency = "high";
        reason = "New regulatory guidance or deadline requiring near-term action.";
      } else if (text.includes("consultation") || text.includes("proposed") || text.includes("draft")) {
        urgency = "medium";
        reason = "Proposed change requiring monitoring and impact assessment.";
      } else {
        urgency = "low";
        reason = "General awareness item with no immediate compliance impact.";
      }
      return { ...item, urgency, reason };
    });
    return NextResponse.json({ ok: true, classified } satisfies ClassifyUrgencyResult);
  }

  try {
    const client = getAnthropicClient(apiKey, 22_000);

    const itemsList = items
      .map(
        (item, i) =>
          `[${i}] title: "${sanitizeField(item.title, 300)}" | source: "${sanitizeField(item.source, 100)}" | date: "${sanitizeField(item.date, 50)}" | summary: "${sanitizeText(item.summary, 1000).slice(0, 200)}"`,
      )
      .join("\n");

    const response = await client.messages.create({
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
          content: `Classify each of the following ${items.length} regulatory news items by urgency. Return a JSON array with one object per item in order.

${itemsList}`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const classificationsRaw = JSON.parse(cleaned);
    if (!Array.isArray(classificationsRaw)) throw new Error("invalid LLM response");
    const classifications = classificationsRaw as Array<{
      index: number;
      urgency: ClassifiedItem["urgency"];
      reason: string;
    }>;

    const classified: ClassifiedItem[] = items.map((item, i) => {
      const match = classifications.find((c) => c.index === i);
      return {
        ...item,
        urgency: match?.urgency ?? "medium",
        reason: match?.reason ?? "Classification unavailable.",
      };
    });

    return NextResponse.json({ ok: true, classified } satisfies ClassifyUrgencyResult);
  } catch (err) {
    console.error("classify-urgency error", err);
    // Graceful fallback — return items with medium urgency
    const classified: ClassifiedItem[] = items.map((item) => ({
      ...item,
      urgency: "medium" as const,
      reason: "Classification service temporarily unavailable.",
    }));
    return NextResponse.json({ ok: true, classified } satisfies ClassifyUrgencyResult);
  }
}
