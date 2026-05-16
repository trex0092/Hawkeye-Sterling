import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReqBody {
  text: string;
  subjectName: string;
}

function heuristicFallback(text: string, subjectName: string) {
  const nameHash = subjectName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const wordCount = text.split(/\s+/).length;
  const hedgeWords = ["possibly", "might", "perhaps", "allegedly", "reportedly", "claimed", "purported"].filter(w => text.toLowerCase().includes(w));
  const vagueWords = ["various", "certain", "some", "multiple", "different", "several"].filter(w => text.toLowerCase().includes(w));
  const deceptionScore = Math.min(100, ((nameHash % 30) + hedgeWords.length * 8 + vagueWords.length * 5 + (wordCount > 200 ? 10 : 0)));
  const riskLevel = deceptionScore >= 70 ? "HIGH" : deceptionScore >= 40 ? "MEDIUM" : "LOW";
  return {
    deceptionScore,
    evasiveLanguage: hedgeWords.length > 0 ? hedgeWords : ["no evasive language detected"],
    inconsistencies: vagueWords.length > 2 ? ["Excessive use of vague quantifiers", "Lack of specific factual claims"] : [],
    riskLevel,
    analysis: `Heuristic analysis of ${wordCount}-word text for ${subjectName}. Detected ${hedgeWords.length} hedge terms and ${vagueWords.length} vague quantifiers. Deception score: ${deceptionScore}/100.`,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { text, subjectName } = body;
  if (!text || !subjectName) {
    return NextResponse.json({ ok: false, error: "text and subjectName are required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = getAnthropicClient(apiKey);
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are an AML linguistic analyst. Analyse the following text for deception markers, evasive language, and inconsistencies related to subject "${sanitizeField(subjectName)}".

Text: """${text.substring(0, 2000)}"""

Respond ONLY with valid JSON matching this schema:
{
  "deceptionScore": <0-100 integer>,
  "evasiveLanguage": ["<phrase>"],
  "inconsistencies": ["<description>"],
  "riskLevel": "<LOW|MEDIUM|HIGH|CRITICAL>",
  "analysis": "<2-3 sentence summary>"
}`,
          },
        ],
      });

      const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
      if (parsed["deceptionScore"] !== undefined) {
        if (!Array.isArray(parsed["evasiveLanguage"])) parsed["evasiveLanguage"] = [];
        if (!Array.isArray(parsed["inconsistencies"])) parsed["inconsistencies"] = [];
        return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
      }
    } catch {
      // fall through to heuristic
    }
  }

  const result = heuristicFallback(text, subjectName);
  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
