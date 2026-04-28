import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

// Per-module imports — the brain index barrel is ~20k LOC and blew Netlify's
// 10s cold-start cap (see web/app/api/super-brain/route.ts for the same
// rationale). Every primitive imported below is the live, signed, weaponized
// catalogue.
import { quickScreen as _quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { classifyPepRole } from "../../../../../dist/src/brain/pep-classifier.js";
import { classifyAdverseMedia } from "../../../../../dist/src/brain/adverse-media.js";
import { jurisdictionByName } from "../../../../../dist/src/brain/jurisdictions-full.js";
import { isCahra } from "../../../../../dist/src/brain/cahra.js";
import { regimesForJurisdiction } from "../../../../../dist/src/brain/sanction-regimes.js";
import { evaluateRedlines, REDLINES } from "../../../../../dist/src/brain/redlines.js";
import { variantsOf } from "../../../../../dist/src/brain/translit.js";
import { expandAliases } from "../../../../../dist/src/brain/aliases.js";
import { doubleMetaphone, soundex } from "../../../../../dist/src/brain/matching.js";
import { matchTypologies, typologyCompositeScore } from "../../../../../dist/src/brain/lib/typologies.js";
import { META_COGNITION } from "../../../../../dist/src/brain/meta-cognition.js";
import { DOCTRINES } from "../../../../../dist/src/brain/doctrines.js";
import { weaponizedSystemPrompt } from "../../../../../dist/src/brain/weaponized.js";
import { loadCandidates } from "@/lib/server/candidates-loader";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  subject: {
    name: string;
    aliases?: string[];
    entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
    jurisdiction?: string;
    sector?: string;
  };
  roleText?: string;
  narrative?: string;
}

interface CitedModule {
  kind:
    | "redline"
    | "regime"
    | "doctrine"
    | "typology"
    | "meta-cognition"
    | "jurisdiction";
  id: string;
  label: string;
  detail?: string;
}

interface ReasoningStep {
  step: string;
  cited: string[];
  finding: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body?.subject?.name || body.subject.name.length > 500) {
    return NextResponse.json(
      { ok: false, error: "subject.name required (max 500 chars)" },
      { status: 400, headers: gateHeaders },
    );
  }

  try {
    const narrative = (body.narrative ?? "").slice(0, 20_000);
    const cited: CitedModule[] = [];
    const steps: ReasoningStep[] = [];

    // 1 · Watchlist screen against the live ingested candidates.
    const candidates = await loadCandidates();
    const screen = quickScreen(body.subject, candidates);
    steps.push({
      step: "Watchlist screen",
      cited: ["faculty.matching", "mode.fuzzy-name-match"],
      finding:
        screen.hits.length > 0
          ? `${screen.hits.length} candidate hit(s); top score ${screen.topScore} (${screen.severity}).`
          : `No watchlist hits (top score ${screen.topScore}).`,
    });

    // 2 · Jurisdiction profile — name resolve, CAHRA, regimes in scope.
    const jurisdiction = resolveJurisdiction(body.subject.jurisdiction);
    if (jurisdiction) {
      cited.push({
        kind: "jurisdiction",
        id: jurisdiction.iso2,
        label: `${jurisdiction.name} (${jurisdiction.iso2})`,
        detail: jurisdiction.cahra ? "CAHRA" : jurisdiction.region,
      });
      for (const r of jurisdiction.regimes.slice(0, 8)) {
        cited.push({ kind: "regime", id: r, label: r });
      }
      steps.push({
        step: "Jurisdiction profile",
        cited: [
          "faculty.geopolitical",
          jurisdiction.cahra ? "doctrine.cahra-enhanced-dd" : "mode.jurisdiction-risk",
        ],
        finding: jurisdiction.cahra
          ? `${jurisdiction.name} flagged CAHRA — enhanced DD mandatory; ${jurisdiction.regimes.length} regime(s) in scope.`
          : `${jurisdiction.name} (${jurisdiction.region}); ${jurisdiction.regimes.length} regime(s) in scope.`,
      });
    }

    // 3 · PEP classification.
    const pepRoleText = body.roleText ?? "";
    const pep = pepRoleText ? classifyPepRole(pepRoleText) : null;
    if (pep && pep.salience > 0) {
      steps.push({
        step: "PEP classification",
        cited: ["faculty.identity", "mode.pep-role-classifier"],
        finding: `${pep.type.replace(/_/g, " ")} · Tier ${pep.tier} · salience ${(pep.salience * 100).toFixed(0)}%.`,
      });
    }

    // 4 · Adverse-media classification + structured typology fingerprints.
    const fullText = [narrative, body.subject.name, ...(body.subject.aliases ?? []), pepRoleText].join(" ");
    const adverseMedia = narrative ? classifyAdverseMedia(narrative) : [];
    const rawTypologyHits = (() => {
      try {
        return matchTypologies(fullText);
      } catch {
        return [];
      }
    })();
    const typologyScore = (() => {
      try {
        return typologyCompositeScore(rawTypologyHits);
      } catch {
        return 0;
      }
    })();
    for (const hit of rawTypologyHits.slice(0, 8)) {
      cited.push({
        kind: "typology",
        id: hit.typology.id,
        label: hit.typology.name,
        detail: hit.snippet,
      });
    }
    if (adverseMedia.length > 0 || rawTypologyHits.length > 0) {
      steps.push({
        step: "Adverse-media + typology fingerprinting",
        cited: ["faculty.adverse-media", "mode.adverse-media-classifier", "mode.typology-pattern-match"],
        finding: `${adverseMedia.length} category hit(s); ${rawTypologyHits.length} typology fingerprint(s); typology composite ${Math.round(typologyScore)}.`,
      });
    }

    // 5 · Redlines (charter prohibitions). evaluateRedlines() takes IDs of
    //     fired rules; we approximate by keyword-matching every redline's id
    //     fragments against the joined narrative. Conservative — only fires
    //     on explicit textual matches.
    const redlineKeywords = fullText.toLowerCase();
    const firedRedlineIds = REDLINES.filter((r) =>
      redlineKeywordsMatch(redlineKeywords, r.id, r.precondition ?? r.label ?? ""),
    ).map((r) => r.id);
    const redlines = evaluateRedlines(firedRedlineIds);
    for (const r of redlines.fired) {
      cited.push({
        kind: "redline",
        id: r.id,
        label: r.label,
        detail: `${r.action} · ${r.regulatoryAnchor}`,
      });
    }
    if (redlines.fired.length > 0) {
      steps.push({
        step: "Redline evaluation",
        cited: ["faculty.charter", "mode.redline-evaluation"],
        finding: redlines.summary,
      });
    }

    // 6 · Doctrines triggered — UAE-mandatory doctrines always apply; CAHRA
    //     adds OECD DDG / LBMA RGG; sector keywords ("gold", "refinery",
    //     "correspondent", "crypto", "vasp") pull in the relevant doctrine.
    const doctrineHits = DOCTRINES.filter((d) =>
      doctrineApplies(d, body.subject, jurisdiction),
    ).slice(0, 6);
    for (const d of doctrineHits) {
      cited.push({
        kind: "doctrine",
        id: d.id,
        label: d.title,
        detail: d.authority,
      });
    }
    if (doctrineHits.length > 0) {
      steps.push({
        step: "Doctrines in scope",
        cited: doctrineHits.map((d) => d.id),
        finding: `${doctrineHits.length} doctrine(s) apply: ${doctrineHits.map((d) => d.title).join("; ")}.`,
      });
    }

    // 7 · Meta-cognition primitives that fire — pattern-match the
    //     `firesWhen` clause against the narrative + subject context.
    const metaCtx = `${fullText} ${redlines.fired.length > 0 ? "redline" : ""} ${pep ? "pep" : ""} ${jurisdiction?.cahra ? "cahra" : ""}`.toLowerCase();
    const metaHits = META_COGNITION.filter((m) => metaCognitionApplies(m, metaCtx)).slice(0, 6);
    for (const m of metaHits) {
      cited.push({
        kind: "meta-cognition",
        id: m.id,
        label: m.label,
        detail: m.directive,
      });
    }
    if (metaHits.length > 0) {
      steps.push({
        step: "Meta-cognition activation",
        cited: metaHits.map((m) => m.id),
        finding: `${metaHits.length} primitive(s) active: ${metaHits.map((m) => m.label).join("; ")}.`,
      });
    }

    // 8 · Composite score + suggested disposition.
    const jurisdictionPenalty = jurisdiction?.cahra ? 15 : 0;
    const regimesPenalty = Math.min((jurisdiction?.regimes.length ?? 0) * 3, 12);
    const redlinesPenalty = redlines.fired.length * 12;
    const adverseMediaPenalty = Math.min(adverseMedia.length * 8, 30);
    const typologyPenalty = Math.min(Math.round(typologyScore * 0.4), 25);
    const pepPenalty = pep && pep.salience > 0 ? Math.round(pep.salience * 20) : 0;
    const composite = Math.max(
      0,
      Math.min(
        100,
        screen.topScore +
          jurisdictionPenalty +
          regimesPenalty +
          redlinesPenalty +
          adverseMediaPenalty +
          typologyPenalty +
          pepPenalty,
      ),
    );

    const disposition: { code: string; label: string; rationale: string } =
      redlines.action
        ? {
            code: redlines.action.toUpperCase(),
            label: humanise(redlines.action),
            rationale: `Redline override — ${redlines.summary}`,
          }
        : composite >= 75
          ? { code: "EDD_PRE_ONBOARD", label: "Enhanced DD before onboarding", rationale: `Composite ${composite}/100 above EDD threshold (75).` }
          : composite >= 45
            ? { code: "REVIEW_L2", label: "Level-2 analyst review", rationale: `Composite ${composite}/100 above L2 threshold (45).` }
            : { code: "PROCEED_STANDARD", label: "Proceed at standard CDD", rationale: `Composite ${composite}/100 below review thresholds.` };

    // 9 · Final reasoning step — the verdict.
    steps.push({
      step: "Composite + disposition",
      cited: ["faculty.synthesis", "mode.composite-scoring"],
      finding: `Composite ${composite}/100 → ${disposition.label} (${disposition.code}).`,
    });

    // Name variants (transliteration, phonetic) — exposed for transparency.
    const aliasExp = expandAliases(body.subject.name);
    const variants = {
      canonical: aliasExp.canonical,
      aliasExpansion: aliasExp.variants.slice(0, 12),
      nameVariants: variantsOf(body.subject.name).slice(0, 12),
      doubleMetaphone: doubleMetaphone(body.subject.name),
      soundex: soundex(body.subject.name),
    };

    // The exact catalogue header that would be prepended to any LLM call
    // routed through the Brain. Trimmed to the catalogue summary block so the
    // payload stays bounded. This is what makes the Brain "weaponized" — it
    // is the contract every downstream agent inherits.
    const promptPreview = weaponizedSystemPrompt({
      includeSkillsCatalogue: false,
      includeMetaCognition: false,
      includeAmplifierBlock: false,
      includeCitationEnforcement: false,
    }).slice(0, 4_000);

    return NextResponse.json(
      {
        ok: true,
        subject: body.subject,
        composite: {
          score: composite,
          breakdown: {
            quickScreen: screen.topScore,
            jurisdictionPenalty,
            regimesPenalty,
            redlinesPenalty,
            adverseMediaPenalty,
            typologyPenalty,
            pepPenalty,
          },
        },
        disposition,
        screen: {
          topScore: screen.topScore,
          severity: screen.severity,
          hits: screen.hits.slice(0, 10),
        },
        jurisdiction,
        pep,
        adverseMedia,
        typologies: {
          hits: rawTypologyHits.slice(0, 12).map((h) => ({
            id: h.typology.id,
            name: h.typology.name,
            family: h.typology.family,
            weight: h.typology.weight,
            snippet: h.snippet,
          })),
          compositeScore: typologyScore,
        },
        redlines,
        cited,
        steps,
        variants,
        promptPreview,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[weaponized-brain/reason]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "weaponized-brain reasoning unavailable" },
      { status: 503, headers: gateHeaders },
    );
  }
}

function resolveJurisdiction(input?: string): {
  iso2: string;
  name: string;
  region: string;
  cahra: boolean;
  regimes: string[];
} | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const byName = jurisdictionByName(raw);
  const iso2Guess = raw.length === 2 ? raw.toUpperCase() : byName?.iso2 ?? raw.toUpperCase();
  const regimes = (() => {
    try {
      return regimesForJurisdiction(iso2Guess).map((r) => r.id ?? String(r));
    } catch {
      return [];
    }
  })();
  return {
    iso2: iso2Guess,
    name: byName?.name ?? raw,
    region: byName?.region ?? "—",
    cahra: isCahra(iso2Guess),
    regimes,
  };
}

// Conservative redline keyword matcher — looks for either the redline id's
// human-readable fragments OR salient words from the description, requiring
// at least two distinct fragment matches in the narrative to count as fired.
// Avoids spurious fires from any one common word.
function redlineKeywordsMatch(haystack: string, id: string, description: string): boolean {
  const idFragments = id.split(/[._-]/).filter((f) => f.length >= 4);
  const descFragments = description
    .toLowerCase()
    .split(/\W+/)
    .filter((f) => f.length >= 5);
  const fragments = Array.from(new Set([...idFragments, ...descFragments])).slice(0, 12);
  let hits = 0;
  for (const f of fragments) {
    if (haystack.includes(f)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

function doctrineApplies(
  d: { id: string; title: string; scope: string; mandatoryInUAE: boolean },
  subject: Body["subject"],
  jurisdiction: ReturnType<typeof resolveJurisdiction>,
): boolean {
  // UAE-mandatory doctrines always apply when the jurisdiction is UAE-resident
  // or unspecified (we default to UAE per the product's home regulator).
  const subjectIsUae =
    !jurisdiction || jurisdiction.iso2 === "AE" || jurisdiction.region?.toLowerCase().includes("middle east");
  if (d.mandatoryInUAE && subjectIsUae) return true;

  const ctx = [
    subject.entityType ?? "",
    subject.sector ?? "",
    subject.jurisdiction ?? "",
    jurisdiction?.iso2 ?? "",
    jurisdiction?.region ?? "",
    jurisdiction?.cahra ? "cahra conflict-affected high-risk" : "",
    d.scope,
  ]
    .join(" ")
    .toLowerCase();
  // Sector / context keywords pull in the relevant doctrine.
  const keywords: Record<string, string[]> = {
    lbma_rgg: ["gold", "bullion", "refinery", "refiner"],
    oecd_ddg: ["mineral", "supply chain", "cahra", "conflict-affected"],
    wolfsberg_correspondent: ["correspondent", "nested", "respondent bank"],
    egmont_fiu: ["fiu", "intelligence sharing"],
    basel_aml_index: ["country risk", "jurisdiction"],
  };
  const list = keywords[d.id] ?? [];
  return list.some((k) => ctx.includes(k));
}

function metaCognitionApplies(
  m: { firesWhen: string },
  ctx: string,
): boolean {
  const tokens = m.firesWhen
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 5);
  let hits = 0;
  for (const t of tokens) {
    if (ctx.includes(t)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

function humanise(action: string): string {
  return action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
