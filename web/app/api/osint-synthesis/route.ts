// POST /api/osint-synthesis
//
// Synthesizes OSINT findings (domain harvest, Sherlock, Social Analyzer) into
// a structured compliance-focused threat profile using Claude Haiku.
// UAE DPMS/VASP compliance lens — AML/CFT risk assessment output.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SherlockProfile { site: string; url: string; exists: boolean }
interface SocialProfile { platform: string; url: string; score: number }

interface RequestBody {
  target: string;
  mode: "domain" | "username";
  domain?: { emails: string[]; hosts: string[]; ips: string[] };
  sherlock?: { username: string; profiles: SherlockProfile[]; totalFound: number };
  social?: { person: string; profiles: Array<SocialProfile> };
}

interface ThreatProfile {
  threatScore: number;
  threatLevel: "critical" | "high" | "medium" | "low" | "clear";
  subjectType: "individual" | "organisation" | "domain";
  keyFindings: string[];
  redFlags: string[];
  jurisdictionExposure: string[];
  sanctionsRelevance: string;
  adverseMediaIndicators: string[];
  recommendedNextSteps: string[];
  complianceNarrative: string;
}

const SYSTEM_PROMPT = `You are a UAE DPMS/VASP compliance OSINT analyst synthesizing open-source intelligence findings into a structured threat profile. Analyze the digital footprint and produce a compliance-focused risk assessment.

Return ONLY a JSON object with these exact fields:
{
  "threatScore": number 0-100,
  "threatLevel": "critical" | "high" | "medium" | "low" | "clear",
  "subjectType": "individual" | "organisation" | "domain",
  "keyFindings": ["string array — specific findings that matter for AML/CFT compliance"],
  "redFlags": ["string array — specific red flags e.g. 'Active on dark-web forum', 'Domain registered in sanctioned jurisdiction'"],
  "jurisdictionExposure": ["string array — jurisdictions identified from email domains, IPs, social platforms"],
  "sanctionsRelevance": "string — whether any findings suggest sanctions exposure",
  "adverseMediaIndicators": ["string array — any adverse indicators found"],
  "recommendedNextSteps": ["string array — what the compliance officer should do next"],
  "complianceNarrative": "string — 3-sentence compliance-focused narrative for the case file"
}`;

const FALLBACK: ThreatProfile = {
  threatScore: 0,
  threatLevel: "clear",
  subjectType: "individual",
  keyFindings: ["API key not configured"],
  redFlags: [],
  jurisdictionExposure: [],
  sanctionsRelevance: "",
  adverseMediaIndicators: [],
  recommendedNextSteps: [],
  complianceNarrative: "",
};

function parseThreatLevel(val: unknown): ThreatProfile["threatLevel"] {
  if (val === "critical" || val === "high" || val === "medium" || val === "low" || val === "clear") return val;
  return "clear";
}

function parseSubjectType(val: unknown): ThreatProfile["subjectType"] {
  if (val === "individual" || val === "organisation" || val === "domain") return val;
  return "individual";
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "osint-synthesis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  if (!body.target || !body.mode) {
    return NextResponse.json({ ok: false, error: "target and mode are required" }, { status: 400 , headers: gate.headers });
  }
  if (body.target.length > 2000) {
    return NextResponse.json({ ok: false, error: "target exceeds 2000-character limit" }, { status: 400, headers: gate.headers });
  }

  const userContent = JSON.stringify({
    target: body.target,
    mode: body.mode,
    domain: body.domain ?? null,
    sherlock: body.sherlock ?? null,
    social: body.social ?? null,
  });

  let profile: ThreatProfile;
  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = (response.content[0]?.type === "text" ? response.content[0].text : "{}").trim();

    // Strip markdown fences before JSON.parse
    const clean = text
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json({ ok: false, error: "osint-synthesis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
    }

    const raw = parsed as Record<string, unknown>;
    profile = {
      threatScore: typeof raw["threatScore"] === "number" ? Math.min(100, Math.max(0, raw["threatScore"])) : 0,
      threatLevel: parseThreatLevel(raw["threatLevel"]),
      subjectType: parseSubjectType(raw["subjectType"]),
      keyFindings: toStringArray(raw["keyFindings"]),
      redFlags: toStringArray(raw["redFlags"]),
      jurisdictionExposure: toStringArray(raw["jurisdictionExposure"]),
      sanctionsRelevance: typeof raw["sanctionsRelevance"] === "string" ? raw["sanctionsRelevance"] : "",
      adverseMediaIndicators: toStringArray(raw["adverseMediaIndicators"]),
      recommendedNextSteps: toStringArray(raw["recommendedNextSteps"]),
      complianceNarrative: typeof raw["complianceNarrative"] === "string" ? raw["complianceNarrative"] : "",
    };
  } catch {
    return NextResponse.json({ ok: false, error: "osint-synthesis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    writeAuditEvent("analyst", "osint.ai-synthesis", body.target);
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...profile }, { headers: gate.headers });
}
