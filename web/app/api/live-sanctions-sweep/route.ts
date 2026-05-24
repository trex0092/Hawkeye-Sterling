// POST /api/live-sanctions-sweep
//
// Proactive Sanctions Sweep Engine.
// Screens ALL active customers against a freshly-supplied delta list of new
// designations — finding matches BEFORE the next scheduled screening run.
//
// Use cases:
//   - Daily delta sweeps: supply new OFAC/EU/UN designations from the past 24h
//   - Emergency sweeps: immediate response to a major designation event
//   - List refresh: re-screen after a watchlist update
//
// Returns: matched customers, match details, priority triage, and a sweep
// summary ready for MLRO review and goAML filing if needed.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NewDesignation {
  name: string;
  aliases?: string[];
  listId: string;          // "OFAC-SDN" | "UN-SC" | "EU-FSF" | "UAE-EOCN"
  designationDate: string;
  entityType?: "individual" | "entity" | "vessel" | "aircraft";
  nationality?: string;
  dob?: string;
  identifiers?: string[];  // passport, national ID, LEI, etc.
  reason?: string;
}

interface SweepRequest {
  designations: NewDesignation[];
  sweepReason?: string;    // "daily_delta" | "emergency" | "list_refresh"
  priorityOnly?: boolean;  // only return high-confidence matches
}

function nameScore(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = nb.split(" ").filter((w) => w.length > 2);
  const matched = wordsB.filter((w) => wordsA.has(w)).length;
  if (wordsB.length === 0) return 0;
  return Math.round((matched / wordsB.length) * 70);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: SweepRequest;
  try { body = await req.json() as SweepRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!Array.isArray(body.designations) || body.designations.length === 0) {
    return NextResponse.json({ ok: false, error: "designations[] required" }, { status: 400, headers: gate.headers });
  }

  const tenant = tenantIdFromGate(gate);
  const allCases = await loadAllCases(tenant);

  // Build deterministic match results
  interface RawMatch {
    caseId: string;
    subjectName: string;
    designation: NewDesignation;
    matchScore: number;
    matchBasis: string[];
    requiresImmediateFreeze: boolean;
  }

  const rawMatches: RawMatch[] = [];
  for (const des of body.designations) {
    const allNames = [des.name, ...(des.aliases ?? [])];
    for (const c of allCases) {
      const caseSubject = (c as { subjectName?: string }).subjectName ?? "";
      const caseId = (c as { id?: string }).id ?? "?";
      const bestScore = Math.max(...allNames.map((n) => nameScore(n, caseSubject)));
      if (bestScore >= 60) {
        rawMatches.push({
          caseId,
          subjectName: caseSubject,
          designation: des,
          matchScore: bestScore,
          matchBasis: bestScore === 100 ? ["exact_name_match"] : bestScore >= 85 ? ["name_contains_match"] : ["partial_name_match"],
          requiresImmediateFreeze: bestScore >= 85 || des.listId === "UAE-EOCN",
        });
      }
    }
  }

  // Deduplicate by caseId (keep highest score)
  const matchMap = new Map<string, RawMatch>();
  for (const m of rawMatches) {
    const existing = matchMap.get(m.caseId);
    if (!existing || m.matchScore > existing.matchScore) matchMap.set(m.caseId, m);
  }
  const matches = [...matchMap.values()].sort((a, b) => b.matchScore - a.matchScore);
  const filteredMatches = body.priorityOnly ? matches.filter((m) => m.matchScore >= 80) : matches;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let aiNarrative = "";
  let triage: unknown[] = [];

  if (apiKey && filteredMatches.length > 0) {
    const client = getAnthropicClient(apiKey, 4_500, "live-sanctions-sweep");
    try {
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: `You are a UAE AML sanctions specialist. Given a live sanctions sweep result, provide triage priority and action recommendations. Return JSON: { "sweepNarrative": "<2-3 sentence summary>", "triage": [{ "caseId": "<id>", "priority": "immediate|high|medium", "recommendedAction": "<action>", "freezeRequired": true|false }] }`,
        messages: [{
          role: "user",
          content: `Sweep reason: ${sanitizeField(body.sweepReason ?? "delta_sweep", 100)}
Designations screened: ${body.designations.length}
Cases in base: ${allCases.length}
Matches found: ${filteredMatches.length}

Matches:
${JSON.stringify(filteredMatches.slice(0, 10).map((m) => ({
  caseId: m.caseId,
  subjectName: m.subjectName,
  matchedDesignation: m.designation.name,
  listId: m.designation.listId,
  matchScore: m.matchScore,
  requiresFreeze: m.requiresImmediateFreeze,
})), null, 2)}

Triage and recommend actions.`,
        }],
      });
      const raw = res.content[0]?.type === "text" ? (res.content[0] as { type: "text"; text: string }).text : "{}";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      aiNarrative = parsed.sweepNarrative ?? "";
      triage = Array.isArray(parsed.triage) ? parsed.triage : [];
    } catch { /* triage is non-blocking */ }
  }

  return NextResponse.json({
    ok: true,
    sweepReason: body.sweepReason ?? "delta_sweep",
    designationsScreened: body.designations.length,
    casesInBase: allCases.length,
    matchesFound: filteredMatches.length,
    immediateActionRequired: filteredMatches.filter((m) => m.requiresImmediateFreeze).length,
    matches: filteredMatches,
    triage,
    sweepNarrative: aiNarrative,
    regulatoryBasis: "FDL 10/2025 Art.14 (ongoing screening); CBUAE AML Standards §7.2; FATF R.10",
    sweptAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
