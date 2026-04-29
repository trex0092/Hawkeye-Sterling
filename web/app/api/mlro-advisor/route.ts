import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  invokeMlroAdvisor,
  type MlroAdvisorRequest,
  type ReasoningMode,
} from "../../../../dist/src/integrations/mlroAdvisor.js";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";
import { gateMlroQuestion } from "@/lib/server/mlro-input-gate";
import { scoreAdvisorAnswer } from "../../../../dist/src/integrations/qualityGates.js";
import { verifyCitations } from "@/lib/server/citation-verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ContextPair { q: string; a: string }

interface Body {
  question: string;
  subjectName: string;
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  listsChecked?: string[];
  matchingMethods?: string[];
  evidenceIds?: string[];
  typologyIds?: string[];
  adverseGroups?: string[];
  mode?: ReasoningMode;
  audience?: "regulator" | "mlro" | "board";
  context?: ContextPair[];  // prior Q&A pairs from the session
  /** Optional super-brain snapshot from the screening panel. When
   *  present, the advisor is briefed with the subject's actual
   *  composite/sanctions/PEP/AM/redlines/typology posture so the
   *  answer addresses *this* subject rather than generic guidance. */
  superBrain?: {
    composite?: { score?: number; breakdown?: Record<string, number> };
    pep?: { tier?: string; type?: string; salience?: number; rationale?: string } | null;
    jurisdiction?: { iso2?: string; name?: string; cahra?: boolean; regimes?: string[] } | null;
    adverseMediaScored?: { total?: number; categoriesTripped?: string[]; compositeScore?: number } | null;
    adverseKeywordGroups?: Array<{ label?: string; count?: number }>;
    redlines?: { fired?: Array<{ id?: string; label?: string }>; action?: string | null };
    typologies?: { hits?: Array<{ id?: string; name?: string; family?: string; weight?: number }>; compositeScore?: number } | null;
  };
}

// Subject-aware preamble — when the operator passes a superBrain
// snapshot we describe the subject's posture in 4-8 lines so the
// advisor's answer reasons against THIS subject's actual signals
// (composite / sanctions / PEP / AM / redlines / typologies) rather
// than producing textbook guidance. Empty string when no snapshot.
function buildSubjectPreamble(sb?: Body["superBrain"]): string {
  if (!sb) return "";
  const lines: string[] = [];
  lines.push("SUBJECT POSTURE (what the brain has computed about THIS subject — reason against these signals, not generic guidance):");
  if (sb.composite?.score != null) {
    lines.push(`  · Composite risk: ${sb.composite.score}/100`);
  }
  if (sb.jurisdiction) {
    lines.push(
      `  · Jurisdiction: ${sb.jurisdiction.name ?? "?"} (${sb.jurisdiction.iso2 ?? "?"})${sb.jurisdiction.cahra ? " · CAHRA" : ""}${sb.jurisdiction.regimes?.length ? ` · regimes: ${sb.jurisdiction.regimes.slice(0, 4).join(", ")}` : ""}`,
    );
  }
  if (sb.pep?.salience && sb.pep.salience > 0) {
    lines.push(`  · PEP: ${(sb.pep.tier ?? "").replace(/^tier_/, "tier ").replace(/_/g, " ")} (${sb.pep.type?.replace(/_/g, " ") ?? "?"}, salience ${Math.round(sb.pep.salience * 100)}%)`);
  } else {
    lines.push(`  · PEP: not classified`);
  }
  const amTotal = sb.adverseMediaScored?.total ?? 0;
  const amCats = sb.adverseMediaScored?.categoriesTripped ?? [];
  if (amTotal > 0 || (sb.adverseKeywordGroups?.length ?? 0) > 0) {
    lines.push(
      `  · Adverse media: ${amTotal} hit(s)${amCats.length ? ` across ${amCats.join(", ")}` : ""}${sb.adverseMediaScored?.compositeScore != null ? ` · vector score ${Math.round(sb.adverseMediaScored.compositeScore)}/100` : ""}`,
    );
  } else {
    lines.push(`  · Adverse media: clear`);
  }
  const redlinesFired = sb.redlines?.fired ?? [];
  if (redlinesFired.length > 0) {
    const labels = redlinesFired.slice(0, 5).map((r) => r.label ?? r.id ?? "redline").join(", ");
    lines.push(`  · Redlines fired: ${labels}${sb.redlines?.action ? ` → ${sb.redlines.action}` : ""}`);
  }
  const typHits = sb.typologies?.hits ?? [];
  if (typHits.length > 0) {
    const t = typHits.slice(0, 4).map((h) => h.name ?? h.id ?? "doctrine").join(", ");
    lines.push(`  · Typology fingerprints: ${t}${typHits.length > 4 ? "…" : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

// Lightweight jurisdiction signal extraction — no LLM needed.
const JURISDICTION_SIGNALS: Array<{ tag: string; keywords: string[] }> = [
  { tag: "UAE", keywords: ["uae", "united arab emirates", "fdl", "cbuae", "dpms", "moe circular", "goaml", "namlcftc", "dfsa", "adgm"] },
  { tag: "US",  keywords: ["bank secrecy act", "bsa", "ofac", "fincen", "fatca", "patriot act", "finra", "us treasury"] },
  { tag: "EU",  keywords: ["5amld", "6amld", "amld", "eu directive", "european union", "eba", "ecb", "esma"] },
  { tag: "UK",  keywords: ["mlr 2017", "proceeds of crime", "poca", "fca", "hmrc", "sanctions regulations", "uk government"] },
  { tag: "FATF/Global", keywords: ["fatf", "un security council", "unscr", "wolfsberg", "egmont", "basel committee"] },
];

function detectJurisdiction(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const { tag, keywords } of JURISDICTION_SIGNALS) {
    if (keywords.some((kw) => lower.includes(kw))) return tag;
  }
  return undefined;
}

// Build a session-context preamble so the advisor can give continuity-aware
// answers across a long Q&A session. We cap prior pairs at 3 and truncate
// each question/answer to keep the enriched question well under the 4000-char
// model context limit reserved for reasoning.
function buildContextPreamble(pairs: ContextPair[]): string {
  if (pairs.length === 0) return "";
  const lines = pairs
    .slice(-3)
    .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
    .join("\n---\n");
  return `REGULATORY SESSION CONTEXT (prior Q&A in this session — use for continuity):\n${lines}\n\nCURRENT QUESTION:\n`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured on this server." },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (!body?.subjectName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gateHeaders },
    );
  }

  // Shared input gate — refuses empty / oversize / prompt-injection /
  // out-of-scope questions before they hit Claude. Saves a slow round
  // trip and stops the advisor producing compliance-flavoured non-
  // answers to non-compliance prompts.
  const gateResult = gateMlroQuestion(body.question, {
    maxChars: 2000,
    allowGeneral: false,
  });
  if (!gateResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: gateResult.message,
        reason: gateResult.reason,
        ...(gateResult.hint ? { hint: gateResult.hint } : {}),
      },
      { status: gateResult.status, headers: gateHeaders },
    );
  }
  const analysis = gateResult.analysis;
  // Use the sanitised, gate-approved text downstream so injection
  // payloads can't reach the model via the original body.question.
  body.question = gateResult.question;

  // Enrich the question with conversation context + classifier pre-brief.
  const preamble = buildContextPreamble(body.context ?? []);
  const subjectPreamble = buildSubjectPreamble(body.superBrain);
  // Order matters: prior session context → subject posture → classifier
  // anchors → question. Subject posture sits between session continuity
  // and topic anchors so the advisor knows "this subject's facts"
  // before "here's the framework"; question is last so the model's
  // attention is freshest on what to actually answer.
  const enrichedQuestion = `${preamble}${subjectPreamble}${analysis.enrichedPreamble}\n\n${body.question.trim()}`.slice(0, 3500);

  const detectedJurisdiction = body.jurisdiction
    ?? detectJurisdiction(body.question)
    ?? (analysis.jurisdictions[0] ?? undefined);

  // Build a rich evidence ID list — caller-supplied + classifier hints.
  const evidenceIds = Array.from(
    new Set([
      ...(body.evidenceIds ?? []),
      ...(body.typologyIds ?? []),
      ...(body.adverseGroups ?? []).map((g) => `adverse:${g}`),
      ...analysis.typologies.map((t: string) => `typology:${t}`),
      ...analysis.doctrineHints.map((d: string) => `doctrine:${d}`),
      ...analysis.playbookHints.map((p: string) => `playbook:${p}`),
      ...analysis.redFlagHints.map((r: string) => `redflag:${r}`),
      ...analysis.fatfRecHints.map((f: string) => `fatf:${f}`),
      ...analysis.urgencyFlags.map((u: string) => `urgency:${u}`),
      ...(detectedJurisdiction ? [`jurisdiction:${detectedJurisdiction}`] : []),
    ]),
  );

  const advisorReq: MlroAdvisorRequest = {
    question: enrichedQuestion,
    mode: body.mode ?? "multi_perspective",
    audience: body.audience ?? "regulator",
    caseContext: {
      caseId: `hs-wb-${Date.now()}`,
      subjectName: body.subjectName.trim(),
      entityType: body.entityType ?? "individual",
      scope: {
        listsChecked: body.listsChecked ?? [
          "OFAC-SDN", "OFAC-Non-SDN", "UN-Consolidated",
          "EU-Consolidated", "UK-OFSI", "UAE-EOCN", "UAE-LTL",
        ],
        listVersionDates: {},
        jurisdictions: detectedJurisdiction
          ? [detectedJurisdiction, ...(body.jurisdiction && body.jurisdiction !== detectedJurisdiction ? [body.jurisdiction] : [])]
          : (body.jurisdiction ? [body.jurisdiction] : []),
        matchingMethods: body.matchingMethods ?? [
          "exact", "levenshtein", "jaro_winkler",
          "double_metaphone", "soundex", "token_set",
        ],
      },
      evidenceIds,
    },
  };

  // Netlify's edge layer enforces a ~26 s "inactivity timeout" on
  // synchronous functions independent of the route's maxDuration.
  // Any single-shot response that takes longer comes back to the
  // browser as an HTML 504/502 page that cannot be parsed as JSON,
  // surfacing as the "Advisor error: HTTP 502" / "HTTP 504 (non-JSON
  // body)" notices in the UI. We HARD-CAP every mode below the edge
  // ceiling so the route always returns valid JSON — partial when
  // the advisor runs out of budget. To restore the longer multi-
  // perspective latency, port this route to a Netlify background
  // function (15-minute timeout) and remove the Math.min below.
  const NETLIFY_EDGE_CEILING_MS = 22_000;
  const modeBudgets: Record<string, number> = {
    speed:             8_000,
    balanced:          22_000,
    multi_perspective: 22_000,
  };
  const requestedBudget = modeBudgets[body.mode ?? "multi_perspective"] ?? 22_000;
  const budgetMs = Math.min(requestedBudget, NETLIFY_EDGE_CEILING_MS);

  const isMulti = (body.mode ?? "multi_perspective") === "multi_perspective";
  const ragPromise = isMulti
    ? Promise.resolve(null)
    : askComplianceQuestion({
        query: body.question.trim().slice(0, 500),
        mode: "multi-agent",
      }).catch(() => null);

  try {
    const [result, ragResult] = await Promise.all([
      invokeMlroAdvisor(advisorReq, { apiKey, budgetMs }),
      ragPromise,
    ]);

    if (!result.ok) {
      const clientError =
        result.error ??
        (result.partial
          ? "Deep reasoning budget exceeded — try Speed or Balanced mode."
          : "Advisor pipeline failed.");
      return NextResponse.json(
        { ...result, ok: false, error: clientError },
        { status: result.partial ? 504 : 502, headers: gateHeaders },
      );
    }

    const regulatoryContext = ragResult?.ok && ragResult.passedQualityGate ? {
      answer: ragResult.answer,
      citations: ragResult.citations,
      confidenceScore: ragResult.confidenceScore,
      consistencyScore: ragResult.consistencyScore,
      jurisdiction: ragResult.jurisdiction,
    } : null;

    // Confidence + consistency score over the rendered narrative.
    // Surfaced to the UI so the operator sees a numeric strength
    // tag (STRONG / MEDIUM / WEAK) instead of just trusting the
    // model's tone.
    // scoreAdvisorAnswer takes the advisor's verdict from the
    // pipeline, not the reasoning mode. Map result.complianceReview's
    // verdict; default to "approved" when the pipeline didn't supply one.
    const verdict = (result.complianceReview as { verdict?: string } | undefined)?.verdict;
    const safeVerdict =
      verdict === "approved" ||
      verdict === "returned_for_revision" ||
      verdict === "blocked" ||
      verdict === "incomplete"
        ? verdict
        : "approved";
    const advisorScore = result.narrative
      ? scoreAdvisorAnswer(result.narrative, safeVerdict)
      : null;

    // Citation verifier — flags FATF Recs / FDL articles / Cabinet
    // Resolutions / etc. that don't exist in the bundled regulatory
    // catalogue. The model occasionally hallucinates plausible-looking
    // citations; the UI surfaces unknown ones as warning chips.
    const citationReport = result.narrative
      ? verifyCitations(result.narrative)
      : null;

    // Suggested follow-ups — the classifier returns 0-N per topic.
    // The UI renders the first three as one-click chips so the
    // operator can keep drilling without retyping.
    const suggestedFollowUps = analysis.suggestedFollowUps?.slice(0, 3) ?? [];

    return NextResponse.json(
      {
        ...result,
        ok: true,
        regulatoryContext,
        detectedJurisdiction: detectedJurisdiction ?? null,
        questionAnalysis: analysis,
        advisorScore,
        citationReport,
        suggestedFollowUps,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[mlro-advisor] failed", err);
    return NextResponse.json(
      { ok: false, error: "mlro-advisor unavailable — check server logs" },
      { status: 503, headers: gateHeaders },
    );
  }
}
