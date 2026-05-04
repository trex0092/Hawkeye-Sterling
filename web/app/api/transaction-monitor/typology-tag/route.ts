export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
interface TxInput {
  id: string;
  amount: string | number;
  currency: string;
  fromAccount?: string;
  toAccount?: string;
  date?: string;
  description?: string;
  channel?: string;
  // Allow extra fields from TxRow
  [key: string]: unknown;
}

interface TaggedTx extends TxInput {
  typology:
    | "structuring"
    | "layering"
    | "smurfing"
    | "trade-based ML"
    | "funnel account"
    | "crypto conversion"
    | "none";
  confidence: number;
  redFlags: string[];
  fatfReference: string;
}

interface TypologyTagResult {
  tagged: TaggedTx[];
  highRiskCount: number;
  summary: string;
}

const HIGH_RISK_TYPOLOGIES = new Set([
  "structuring",
  "layering",
  "smurfing",
  "trade-based ML",
  "funnel account",
  "crypto conversion",
]);

function buildFallback(transactions: TxInput[]): TypologyTagResult {
  const tagged: TaggedTx[] = transactions.map((tx) => ({
    ...tx,
    typology: "none",
    confidence: 10,
    redFlags: [],
    fatfReference: "FATF Rec. 20",
  }));
  return {
    tagged,
    highRiskCount: 0,
    summary: "Typology tagging unavailable — API key not configured.",
  };
}

export async function POST(req: Request) {
  let body: { transactions?: TxInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const transactions = body.transactions ?? [];
  if (transactions.length === 0) {
    return NextResponse.json({
      tagged: [],
      highRiskCount: 0,
      summary: "No transactions provided.",
    });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(buildFallback(transactions));

  try {
    const client = getAnthropicClient(apiKey);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: `You are a senior FATF-certified AML typology analyst specialising in UAE DPMS, CBUAE AML Standards, and FATF Recommendations. Your task is to analyse financial transactions and assign ML typology tags to each one.

TYPOLOGY DEFINITIONS (FATF):
- structuring: Breaking large amounts into smaller transactions to avoid reporting thresholds (FATF Typology R.20, "smurfing" variant involves multiple people)
- layering: Moving funds through multiple accounts/jurisdictions to obscure origin
- smurfing: Multiple individuals making deposits/transactions just below thresholds
- trade-based ML: Over/under invoicing, multiple invoicing, falsely described goods (FATF Typology R.16)
- funnel account: Account that collects funds from multiple sources and funnels to single destination
- crypto conversion: Converting illicit cash to/from cryptocurrency to break audit trail
- none: No ML typology indicators detected

For each transaction return EXACTLY this JSON structure (no markdown, no extra keys):
{
  "id": "<original transaction id>",
  "typology": "<one of the 7 typology values>",
  "confidence": <integer 0-100>,
  "redFlags": ["<flag1>", "<flag2>"],
  "fatfReference": "<e.g. FATF Typology R.20>"
}

Return a JSON object with:
{
  "tagged": [ ...per-transaction objects above ],
  "summary": "<2-3 sentence summary of the typology landscape across the batch>"
}

Be conservative: only assign a non-none typology when there are genuine indicators in the data. A single below-threshold cash transaction is not automatically structuring.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Tag the following ${transactions.length} transaction(s) for ML typologies. Analyse each independently but also consider cross-transaction patterns (structuring, smurfing).

Transactions:
${JSON.stringify(transactions, null, 2)}`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim(),
    ) as { tagged: Array<{ id: string; typology: string; confidence: number; redFlags: string[]; fatfReference: string }>; summary: string };

    // Merge AI tags back onto original transaction objects
    const tagMap = new Map(
      (parsed.tagged ?? []).map((t) => [t.id, t]),
    );

    const tagged: TaggedTx[] = transactions.map((tx) => {
      const aiTag = tagMap.get(tx.id);
      if (aiTag) {
        return {
          ...tx,
          typology: (aiTag.typology ?? "none") as TaggedTx["typology"],
          confidence: typeof aiTag.confidence === "number" ? aiTag.confidence : 0,
          redFlags: Array.isArray(aiTag.redFlags) ? (aiTag.redFlags as string[]) : [],
          fatfReference: aiTag.fatfReference ?? "FATF Rec. 20",
        };
      }
      return { ...tx, typology: "none", confidence: 0, redFlags: [], fatfReference: "FATF Rec. 20" };
    });

    const highRiskCount = tagged.filter(
      (t) => HIGH_RISK_TYPOLOGIES.has(t.typology) && t.confidence >= 40,
    ).length;

    return NextResponse.json({
      tagged,
      highRiskCount,
      summary: parsed.summary ?? "",
    } satisfies TypologyTagResult);
  } catch {
    return NextResponse.json(buildFallback(transactions));
  }
}
