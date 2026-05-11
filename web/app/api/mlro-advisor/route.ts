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
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  retrieveForQuestion,
  runPreGenerationRouter,
  runPostGenerationCheck,
  appendAuditEntry,
  type RetrievalContext,
} from "@/lib/server/mlro-integration";
import {
  appendStructuredInstruction,
  tryParseStructured,
  runStructuredGate,
  buildStructuredFailClosed,
} from "@/lib/server/mlro-structured";
import {
  appendProbeInstructions,
  extractAndStripProbe,
} from "@/lib/server/mlro-probe";
import {
  buildJurisdictionComparator,
  buildCasePrecedentPreamble,
  buildRegulatoryUpdatePreamble,
  loadAdvisorSession,
  appendAdvisorTurn,
} from "@/lib/server/advisor-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Module-level safety net. Orphaned promises inside the executor → advisor
// → challenger pipeline (e.g. an aborted upstream fetch whose rejection
// arrives after the awaited call already returned) escape the route's
// local try/catch and crash the Lambda with HTTP 502 + raw runtime trace
// (`Runtime.UnhandledPromiseRejection: AbortError`). Swallowing them here
// keeps the function alive long enough to return a clean JSON response.
// Registered once per Lambda warm instance via a globalThis flag.
const REJECTION_GUARD_KEY = "__hsMlroAdvisorRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) {
      // Expected — upstream timeouts during executor / advisor / challenger calls.
      return;
    }
    console.error("[mlro-advisor] unhandled rejection", msg);
  });
}

interface ContextPair { q: string; a: string }

interface Body {
  question: string;
  subjectName: string;
  redTeamMode?: boolean;
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  listsChecked?: string[];
  matchingMethods?: string[];
  evidenceIds?: string[];
  typologyIds?: string[];
  adverseGroups?: string[];
  mode?: ReasoningMode;
  audience?: "regulator" | "mlro" | "board";
  /** When true, the route asks the model to emit an
   *  `AdvisorResponseV1` JSON object matching the 8-section schema.
   *  On parse / completion-gate failure, falls back to the legacy
   *  free-form `narrative` field with `structuredFallback: true`
   *  set on the response so the UI can render either form. */
  structured?: boolean;
  context?: ContextPair[];  // prior Q&A pairs from the session (in-memory)
  /** When supplied, the advisor's persistent server-side session for
   *  this key is loaded + the turn is appended after a successful
   *  answer. Typically caseId; falls back to operator-id. Lets the
   *  advisor pick up cross-device / cross-reload. */
  sessionKey?: string;
  /** Convenience alias: when the screening panel has a caseId open,
   *  pass it through. Used as sessionKey when sessionKey isn't set. */
  caseId?: string;
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
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};
  // Tenant id (defaults to "portal" for ADMIN_TOKEN portal calls,
  // keyId per API key otherwise) drives every per-tenant lookup
  // below: case-precedent search and persistent session storage.
  const tenant = gate.ok ? tenantIdFromGate(gate) : "anonymous";

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        answer: `**MLRO Advisor — Offline Mode**\n\nYour question has been received but the AI advisor is currently unavailable (ANTHROPIC_API_KEY not configured). Please consult your designated MLRO or compliance officer directly. Under UAE FDL 20/2018 and FATF Recommendations, all compliance decisions must be reviewed and documented by a qualified MLRO. Set ANTHROPIC_API_KEY in your Netlify environment variables to enable AI-powered advisory.`,
        advisorScore: null,
        citations: [],
        elapsedMs: 0,
        offline: true,
      },
      { status: 200, headers: gateHeaders },
    );
  }

  if (!body?.subjectName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gateHeaders },
    );
  }

  // Shared input gate — refuses empty / oversize / prompt-injection
  // inputs before they hit Claude. redTeamMode bypasses injection check
  // so adversarial test prompts can reach the model for refusal testing.
  const gateResult = gateMlroQuestion(body.question, {
    maxChars: body.redTeamMode ? 4000 : 2000,
    allowInjectionPatterns: body.redTeamMode === true,
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

  // Layer 1 retrieval — pull class-tagged chunks for this question.
  const retrieval: RetrievalContext = retrieveForQuestion(body.question, 16);

  // Layer 5 pre-generation refusal router — short-circuits before the
  // executor → advisor → challenger pipeline burns its budget.
  const preGen = runPreGenerationRouter({
    question: body.question,
    retrieval,
  });
  if (preGen.refused) {
    void appendAuditEntry({
      userId: tenant ?? "anonymous",
      mode: (body.mode as "speed" | "balanced" | "deep" | "multi_perspective") ?? "balanced",
      questionText: body.question,
      modelVersions: { sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-7" },
      charterVersionHash: "advisor-v1",
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.persistedSources,
      reasoningTrace: [],
      finalAnswer: null,
      refusalReason: preGen.reason,
    }).catch((err: unknown) => {
      console.error("[hawkeye] mlro-advisor: refusal audit-log append failed:", err);
    });
    return NextResponse.json(
      {
        ok: false,
        refused: true,
        reason: preGen.reason,
        message: preGen.message,
        escalation: preGen.escalation,
      },
      { status: 200, headers: gateHeaders },
    );
  }

  // Enrich the question with conversation context + classifier pre-brief.
  // ── Persistent advisor session ────────────────────────────────
  const rawSessionKey = body.sessionKey ?? body.caseId ?? null;
  const sessionKey = typeof rawSessionKey === "string" && rawSessionKey.length <= 256 && /^[\w\-]+$/.test(rawSessionKey)
    ? rawSessionKey
    : null;
  // Server-side session turns merged with any in-memory `context`
  // pairs the client supplied. In-memory wins on overlap (it's the
  // most recent state the operator saw).
  const persistedTurns = sessionKey
    ? await loadAdvisorSession(tenant, sessionKey)
    : [];
  const mergedContext: ContextPair[] = [
    ...persistedTurns.slice(-3).map((t) => ({ q: t.q, a: t.a })),
    ...(body.context ?? []),
  ];

  const preamble = buildContextPreamble(mergedContext);
  const subjectPreamble = buildSubjectPreamble(body.superBrain);

  // ── Tier-2 augmentations ──────────────────────────────────────
  // Each builder produces an empty string when not applicable, so
  // the prompt isn't padded with "no signal" boilerplate.
  const jurisdictionDirective = buildJurisdictionComparator(
    analysis.jurisdictions ?? [],
  );
  const [casePrecedent, regulatoryUpdates] = await Promise.all([
    buildCasePrecedentPreamble(tenant, {
      jurisdiction:
        body.jurisdiction ?? body.superBrain?.jurisdiction?.iso2,
      hasPep: !!body.superBrain?.pep,
      hasAdverseMedia:
        (body.superBrain?.adverseMediaScored?.total ?? 0) > 0 ||
        (body.superBrain?.adverseKeywordGroups?.length ?? 0) > 0,
      hasSanctionsHit:
        (body.superBrain?.redlines?.fired?.length ?? 0) > 0,
      topicHints: analysis.topics ?? [],
    }),
    buildRegulatoryUpdatePreamble(analysis.topics ?? []),
  ]);

  // Order: session continuity → subject posture → case precedent →
  // regulatory updates → jurisdiction directive → classifier
  // anchors → question. Tier-2 blocks sit between subject posture
  // (concrete) and topic anchors (general) so the model anchors on
  // operator-specific context before drifting to framework-level
  // guidance.
  let enrichedQuestion = `${preamble}${subjectPreamble}${casePrecedent}${regulatoryUpdates}${jurisdictionDirective}${analysis.enrichedPreamble}\n\n${body.question.trim()}`.slice(0, 4500);

  // Layer 3 — opt-in structured-output mode. Appends the 8-section
  // schema instruction so the model emits a single JSON object instead
  // of a free-form narrative. The route handler parses it post-gen,
  // runs the completion gate, and either ships the parsed object or
  // falls back to the legacy narrative field. Layer 6.3 — append the
  // adversarial-probe instruction in the same opt-in flow.
  if (body.structured) {
    enrichedQuestion = appendStructuredInstruction(enrichedQuestion);
  }
  // The probe instruction is cheap and works alongside structured
  // OR free-form output, so add it regardless of the structured flag.
  enrichedQuestion = appendProbeInstructions(enrichedQuestion);

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
      }).catch((err: unknown) => {
        console.warn("[hawkeye] mlro-advisor: RAG (askComplianceQuestion) failed — continuing without retrieval context:", err);
        return null;
      });

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
    // Layer 6.3 — extract the adversarial probe markers the model
    // emitted and strip them from the user-visible narrative. The
    // structured outcome is surfaced on the response.
    const probeWrap = result.narrative
      ? extractAndStripProbe(result.narrative, "escalate")
      : null;
    if (probeWrap) {
      result.narrative = probeWrap.cleanAnswer;
    }

    // Layer 3 — when the request opted into structured output, try to
    // parse the model's narrative as the 8-section JSON schema. On
    // parse failure OR completion-gate trip, fall back to the legacy
    // narrative path with `structuredFallback: true` so the UI can
    // render either form.
    let structured: unknown = null;
    let structuredFallback: { reason: "parse_failed" | "gate_tripped"; defects?: unknown } | null = null;
    if (body.structured && result.narrative) {
      const parsed = tryParseStructured(result.narrative);
      if (parsed.ok) {
        const gate = runStructuredGate(parsed.value);
        if (gate.passed) {
          structured = parsed.value;
        } else {
          // Build the fail-closed object the regulator-grade build
          // spec demands when the gate trips. The route returns the
          // legacy narrative AS WELL so the operator still has
          // something to read while the audit log records the
          // gate-tripped event.
          const fc = buildStructuredFailClosed(gate.defects, [gate.defects]);
          structuredFallback = { reason: "gate_tripped", defects: fc.defects };
        }
      } else {
        structuredFallback = { reason: "parse_failed" };
      }
    }

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

    // Persist the turn to the operator's server-side session blob
    // so this conversation survives reload / device switch. Skipped
    // when no sessionKey was supplied (the advisor still works
    // statelessly).
    if (sessionKey && result.narrative) {
      const tier =
        advisorScore && advisorScore.confidenceScore >= 75
          ? "STRONG"
          : advisorScore && advisorScore.confidenceScore >= 45
            ? "MEDIUM"
            : "WEAK";
      void appendAdvisorTurn(tenant, sessionKey, {
        q: body.question,
        a: result.narrative,
        askedAt: new Date().toISOString(),
        mode: body.mode ?? "multi_perspective",
        scoreTier: tier,
      }).catch((e) => console.warn("[mlro-advisor] session persist failed", e));
    }

    // Tier-2 context flags surfaced to the UI so chips / banners can
    // render without the client re-running the same heuristics.
    const contextFlags = {
      sessionKey,
      sessionTurnsLoaded: persistedTurns.length,
      jurisdictionComparison: jurisdictionDirective.length > 0,
      casePrecedentApplied: casePrecedent.length > 0,
      regulatoryUpdatesApplied: regulatoryUpdates.length > 0,
    };

    // Layer 2 retrieval-grounded validation + Layer 5 post-generation
    // router. Fires on the rendered narrative.
    const postGen = result.narrative
      ? runPostGenerationCheck({
          question: body.question,
          answer: result.narrative,
          retrieval,
        })
      : null;
    if (postGen?.router.refused) {
      void appendAuditEntry({
        userId: tenant ?? "anonymous",
        mode: (body.mode as "speed" | "balanced" | "deep" | "multi_perspective") ?? "balanced",
        questionText: body.question,
        modelVersions: { sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-7" },
        charterVersionHash: "advisor-v1",
        directivesInvoked: [],
        doctrinesApplied: [],
        retrievedSources: retrieval.persistedSources,
        reasoningTrace: [],
        finalAnswer: null,
        validation: postGen.validation,
        refusalReason: postGen.router.reason,
      }).catch((err: unknown) => {
        console.error("[hawkeye] mlro-advisor: post-gen refusal audit-log append failed:", err);
      });
      return NextResponse.json(
        {
          ok: false,
          refused: true,
          reason: postGen.router.reason,
          message: postGen.router.message,
          escalation: postGen.router.escalation,
        },
        { status: 200, headers: gateHeaders },
      );
    }

    // Layer 4 audit log — fire-and-forget; persists to Netlify Blobs.
    const audit = await appendAuditEntry({
      userId: tenant ?? "anonymous",
      mode: (body.mode as "speed" | "balanced" | "deep" | "multi_perspective") ?? "balanced",
      questionText: body.question,
      modelVersions: { sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-7" },
      charterVersionHash: "advisor-v1",
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.persistedSources,
      reasoningTrace: [],
      finalAnswer: null,
      ...(postGen?.validation ? { validation: postGen.validation } : {}),
    }).catch(() => ({ seq: 0, entryHash: "" }));

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
        contextFlags,
        retrievedSources: retrieval.persistedSources.map((s) => ({
          class: s.class,
          classLabel: s.classLabel,
          sourceId: s.sourceId,
          articleRef: s.articleRef,
          version: s.version,
        })),
        ...(postGen
          ? {
              retrievalGroundedValidation: {
                passed: postGen.validation.passed,
                summary: postGen.validation.summary,
                defectCount: postGen.validation.defects.length,
                ungroundedClaimCount: postGen.validation.ungroundedClaims.length,
              },
            }
          : {}),
        // Layer 3 — 8-section structured response. Only present when
        // body.structured was true AND the model emitted parseable
        // JSON AND the completion gate passed. Otherwise null and the
        // UI falls back to rendering `narrative`.
        structured,
        structuredFallback,
        // Layer 6.3 — adversarial probe outcome. Always populated when
        // the model emitted both markers; bothEmitted=false when the
        // model ignored the probe instruction (treat as informational).
        ...(probeWrap
          ? {
              probeOutcome: {
                innocent: probeWrap.outcome.innocent,
                adversarial: probeWrap.outcome.adversarial,
                survived: probeWrap.outcome.survived,
                ...(probeWrap.outcome.disagreement ? { disagreement: probeWrap.outcome.disagreement } : {}),
                bothEmitted: probeWrap.bothEmitted,
              },
            }
          : {}),
        auditEntrySeq: audit.seq,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[mlro-advisor] failed", err);
    return NextResponse.json(
      {
        ok: true,
        answer: "The MLRO advisor encountered a temporary error. Please retry your question. If the issue persists, consult your compliance officer directly for guidance under UAE FDL 20/2018 and FATF Recommendations.",
        advisorScore: null,
        citations: [],
        elapsedMs: 0,
        degraded: true,
      },
      { status: 200, headers: gateHeaders },
    );
  }
}
