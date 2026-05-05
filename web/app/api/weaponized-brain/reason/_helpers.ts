// Helpers for /api/weaponized-brain/reason — runReasoning extracts the live
// orchestrator out of route.ts so the route stays thin and so we can re-run
// the pipeline against perturbed inputs (counterfactuals). The four generator
// functions add downstream artefacts the UI surfaces in dedicated panels:
// counterfactual sensitivity, adversarial steelman, mode-coverage map,
// SAR/STR narrative.

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
import { REASONING_MODES } from "../../../../../dist/src/brain/reasoning-modes.js";
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

export interface ReasonInput {
  subject: {
    name: string;
    aliases?: string[];
    entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
    jurisdiction?: string;
    sector?: string;
  };
  roleText?: string;
  narrative?: string;
  adverseMediaText?: string;
}

export interface CitedModule {
  kind: "redline" | "regime" | "doctrine" | "typology" | "meta-cognition" | "jurisdiction";
  id: string;
  label: string;
  detail?: string;
}

export interface ReasoningStep {
  step: string;
  cited: string[];
  finding: string;
}

export interface Timings {
  quickScreen: number;
  jurisdiction: number;
  pep: number;
  adverseMediaTypology: number;
  redlines: number;
  doctrines: number;
  metaCognition: number;
  composite: number;
  total: number;
}

export interface ReasoningResult {
  subject: ReasonInput["subject"];
  composite: { score: number; breakdown: Record<string, number> };
  disposition: { code: string; label: string; rationale: string };
  screen: Pick<QuickScreenResult, "topScore" | "severity"> & { hits: QuickScreenResult["hits"] };
  jurisdiction: ReturnType<typeof resolveJurisdiction>;
  pep: ReturnType<typeof classifyPepRole> | null;
  adverseMedia: ReturnType<typeof classifyAdverseMedia>;
  typologies: { hits: Array<{ id: string; name: string; family: string; weight: number; snippet: string }>; compositeScore: number };
  redlines: ReturnType<typeof evaluateRedlines>;
  cited: CitedModule[];
  steps: ReasoningStep[];
  variants: { canonical: string; aliasExpansion: string[]; nameVariants: string[]; doubleMetaphone: ReturnType<typeof doubleMetaphone>; soundex: string };
  promptPreview: string;
  timings: Timings;
  firedModeIds: string[];
}

// ── runReasoning ────────────────────────────────────────────────────────────
//
// The instrumented orchestrator. Wraps each stage in performance.now() and
// records every reasoning-mode ID that fires (so the mode-coverage panel can
// render "X of N modes engaged"). All mode IDs below are confirmed in the
// REASONING_MODES registry (412 across 50 categories).

export async function runReasoning(body: ReasonInput): Promise<ReasoningResult> {
  const t0 = performance.now();
  const firedModeIds = new Set<string>();
  const cited: CitedModule[] = [];
  const steps: ReasoningStep[] = [];
  const narrative = (body.narrative ?? "").slice(0, 20_000);
  // Combine user-supplied narrative with auto-fetched adverseMediaText (GDELT
  // live feed, manual OSINT, or screening-tool evidence). Both fields carry
  // adverse-media signal; classifying only `narrative` silently zeros the score
  // when the Brain auto-fetches live news into adverseMediaText.
  const adverseMediaInput = [narrative, (body.adverseMediaText ?? "").slice(0, 20_000)]
    .filter(Boolean)
    .join("\n");

  // 1 · Watchlist screen
  const tA = performance.now();
  const candidates = await loadCandidates();
  const screen = quickScreen(body.subject, candidates);
  ["entity_resolution", "fuzzy_logic", "source_triangulation"].forEach((m) => firedModeIds.add(m));
  steps.push({
    step: "Watchlist screen",
    cited: ["faculty.matching", "mode.fuzzy-name-match"],
    finding: screen.hits.length > 0
      ? `${screen.hits.length} candidate hit(s); top score ${screen.topScore} (${screen.severity}).`
      : `No watchlist hits (top score ${screen.topScore}).`,
  });
  const tQuickScreen = performance.now() - tA;

  // 2 · Jurisdiction profile
  const tB = performance.now();
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
      cited: ["faculty.geopolitical", jurisdiction.cahra ? "doctrine.cahra-enhanced-dd" : "mode.jurisdiction-risk"],
      finding: jurisdiction.cahra
        ? `${jurisdiction.name} flagged CAHRA — enhanced DD mandatory; ${jurisdiction.regimes.length} regime(s) in scope.`
        : `${jurisdiction.name} (${jurisdiction.region}); ${jurisdiction.regimes.length} regime(s) in scope.`,
    });
    ["jurisdiction_cascade", "regulatory_mapping"].forEach((m) => firedModeIds.add(m));
    if (jurisdiction.cahra) firedModeIds.add("cahra_determination");
    if (jurisdiction.iso2 === "AE") firedModeIds.add("emirate_jurisdiction");
    if (/^(KY|VG|BS|PA|JE|GG|BM|MT|CY|LU)$/.test(jurisdiction.iso2)) firedModeIds.add("secrecy_jurisdiction_scoring");
  }
  const tJurisdiction = performance.now() - tB;

  // 3 · PEP classification
  const tC = performance.now();
  const pepRoleText = body.roleText ?? "";
  const pep = pepRoleText ? classifyPepRole(pepRoleText) : null;
  if (pep && pep.salience > 0) {
    steps.push({
      step: "PEP classification",
      cited: ["faculty.identity", "mode.pep-role-classifier"],
      finding: `${pep.type.replace(/_/g, " ")} · Tier ${pep.tier} · salience ${(pep.salience * 100).toFixed(0)}%.`,
    });
    firedModeIds.add("pep_connection_reasoning");
  }
  const tPep = performance.now() - tC;

  // 4 · Adverse-media + typology fingerprinting
  // Use the merged adverseMediaInput (narrative + adverseMediaText) so auto-fetched
  // GDELT articles contribute to adverse-media scoring, not just manually pasted text.
  const tD = performance.now();
  const fullText = [adverseMediaInput, body.subject.name, ...(body.subject.aliases ?? []), pepRoleText].join(" ");
  const adverseMedia = adverseMediaInput.trim() ? classifyAdverseMedia(adverseMediaInput) : [];
  const rawTypologyHits = (() => { try { return matchTypologies(fullText); } catch { return []; } })();
  const typologyScore = (() => { try { return typologyCompositeScore(rawTypologyHits); } catch { return 0; } })();
  for (const hit of rawTypologyHits.slice(0, 8)) {
    cited.push({ kind: "typology", id: hit.typology.id, label: hit.typology.name, detail: hit.snippet });
  }
  if (adverseMedia.length > 0 || rawTypologyHits.length > 0) {
    steps.push({
      step: "Adverse-media + typology fingerprinting",
      cited: ["faculty.adverse-media", "mode.adverse-media-classifier", "mode.typology-pattern-match"],
      finding: `${adverseMedia.length} category hit(s); ${rawTypologyHits.length} typology fingerprint(s); typology composite ${Math.round(typologyScore)}.`,
    });
    ["narrative_coherence", "linguistic_forensics", "typology_catalogue", "pf_red_flag_screen"].forEach((m) => firedModeIds.add(m));
  }
  const tAdverseMediaTypology = performance.now() - tD;

  // 5 · Redlines
  const tE = performance.now();
  const redlineKeywords = fullText.toLowerCase();
  const firedRedlineIds = REDLINES.filter((r: any) =>
    redlineKeywordsMatch(redlineKeywords, r.id, r.precondition ?? r.label ?? ""),
  ).map((r: any) => r.id);
  const redlines = evaluateRedlines(firedRedlineIds);
  for (const r of redlines.fired) {
    cited.push({ kind: "redline", id: r.id, label: r.label, detail: `${r.action} · ${r.regulatoryAnchor}` });
  }
  if (redlines.fired.length > 0) {
    steps.push({ step: "Redline evaluation", cited: ["faculty.charter", "mode.redline-evaluation"], finding: redlines.summary });
    ["escalation_logic", "proportionality_test"].forEach((m) => firedModeIds.add(m));
  }
  const tRedlines = performance.now() - tE;

  // 6 · Doctrines
  const tF = performance.now();
  const doctrineHits = DOCTRINES.filter((d: any) => doctrineApplies(d, body.subject, jurisdiction)).slice(0, 6);
  for (const d of doctrineHits) {
    cited.push({ kind: "doctrine", id: d.id, label: d.title, detail: d.authority });
  }
  if (doctrineHits.length > 0) {
    steps.push({
      step: "Doctrines in scope",
      cited: doctrineHits.map((d: any) => d.id),
      finding: `${doctrineHits.length} doctrine(s) apply: ${doctrineHits.map((d: any) => d.title).join("; ")}.`,
    });
    if (jurisdiction?.cahra) firedModeIds.add("oecd_ddg_annex");
    if ((body.subject.sector ?? "").toLowerCase().includes("gold")) firedModeIds.add("lbma_rgg_five_step");
    if ((body.subject.sector ?? "").toLowerCase().includes("correspondent")) firedModeIds.add("cbr_due_diligence_cascade");
  }
  const tDoctrines = performance.now() - tF;

  // 7 · Meta-cognition
  const tG = performance.now();
  const metaCtx = `${fullText} ${redlines.fired.length > 0 ? "redline" : ""} ${pep ? "pep" : ""} ${jurisdiction?.cahra ? "cahra" : ""}`.toLowerCase();
  const metaHits = META_COGNITION.filter((m: any) => metaCognitionApplies(m, metaCtx)).slice(0, 6);
  for (const m of metaHits) {
    cited.push({ kind: "meta-cognition", id: m.id, label: m.label, detail: m.directive });
  }
  if (metaHits.length > 0) {
    steps.push({
      step: "Meta-cognition activation",
      cited: metaHits.map((m: any) => m.id),
      finding: `${metaHits.length} primitive(s) active: ${metaHits.map((m: any) => m.label).join("; ")}.`,
    });
  }
  // Always-on meta-cognition modes per charter.
  ["steelman", "pre_mortem", "confidence_calibration", "cognitive_bias_audit", "popper_falsification"].forEach((m) => firedModeIds.add(m));
  const tMetaCognition = performance.now() - tG;

  // 8 · Composite
  const tH = performance.now();
  const jurisdictionPenalty = jurisdiction?.cahra ? 15 : 0;
  const regimesPenalty = Math.min((jurisdiction?.regimes.length ?? 0) * 3, 12);
  const redlinesPenalty = redlines.fired.length * 12;
  const adverseMediaPenalty = Math.min(adverseMedia.length * 8, 30);
  const typologyPenalty = Math.min(Math.round(typologyScore * 0.4), 25);
  const pepPenalty = pep && pep.salience > 0 ? Math.round(pep.salience * 20) : 0;
  const composite = Math.max(0, Math.min(100,
    screen.topScore + jurisdictionPenalty + regimesPenalty + redlinesPenalty + adverseMediaPenalty + typologyPenalty + pepPenalty,
  ));
  ["multi_criteria_decision_analysis", "risk_based_approach", "confidence_weighted_aggregation", "risk_adjusted"].forEach((m) => firedModeIds.add(m));

  const disposition = redlines.action
    ? { code: redlines.action.toUpperCase(), label: humanise(redlines.action), rationale: `Redline override — ${redlines.summary}` }
    : composite >= 75
      ? { code: "EDD_PRE_ONBOARD", label: "Enhanced DD before onboarding", rationale: `Composite ${composite}/100 above EDD threshold (75).` }
      : composite >= 45
        ? { code: "REVIEW_L2", label: "Level-2 analyst review", rationale: `Composite ${composite}/100 above L2 threshold (45).` }
        : { code: "PROCEED_STANDARD", label: "Proceed at standard CDD", rationale: `Composite ${composite}/100 below review thresholds.` };

  steps.push({
    step: "Composite + disposition",
    cited: ["faculty.synthesis", "mode.composite-scoring"],
    finding: `Composite ${composite}/100 → ${disposition.label} (${disposition.code}).`,
  });
  const tComposite = performance.now() - tH;

  const aliasExp = expandAliases(body.subject.name);
  const variants = {
    canonical: aliasExp.canonical,
    aliasExpansion: aliasExp.variants.slice(0, 12),
    nameVariants: variantsOf(body.subject.name).slice(0, 12),
    doubleMetaphone: doubleMetaphone(body.subject.name),
    soundex: soundex(body.subject.name),
  };

  const promptPreview = weaponizedSystemPrompt({
    includeSkillsCatalogue: false,
    includeMetaCognition: false,
    includeAmplifierBlock: false,
    includeCitationEnforcement: false,
  }).slice(0, 4_000);

  const total = performance.now() - t0;

  return {
    subject: body.subject,
    composite: {
      score: composite,
      breakdown: {
        quickScreen: screen.topScore,
        jurisdictionPenalty, regimesPenalty, redlinesPenalty,
        adverseMediaPenalty, typologyPenalty, pepPenalty,
      },
    },
    disposition,
    screen: { topScore: screen.topScore, severity: screen.severity, hits: screen.hits.slice(0, 10) },
    jurisdiction,
    pep,
    adverseMedia,
    typologies: {
      hits: rawTypologyHits.slice(0, 12).map((h: any) => ({
        id: h.typology.id, name: h.typology.name, family: h.typology.family,
        weight: h.typology.weight, snippet: h.snippet,
      })),
      compositeScore: typologyScore,
    },
    redlines,
    cited,
    steps,
    variants,
    promptPreview,
    timings: {
      quickScreen: round(tQuickScreen),
      jurisdiction: round(tJurisdiction),
      pep: round(tPep),
      adverseMediaTypology: round(tAdverseMediaTypology),
      redlines: round(tRedlines),
      doctrines: round(tDoctrines),
      metaCognition: round(tMetaCognition),
      composite: round(tComposite),
      total: round(total),
    },
    firedModeIds: [...firedModeIds].filter((id: any) => REASONING_MODES.some((m: any) => m.id === id)),
  };
}

// ── generateCounterfactuals ────────────────────────────────────────────────
//
// Re-runs runReasoning against three perturbed inputs ("nudges") and reports
// the delta vs. the baseline. Operators use this to gauge how sensitive a
// disposition is to the exact narrative supplied — a result that flips on
// a CAHRA toggle is materially different from one that survives all three.

const RED_FLAG_TOKENS_RX =
  /\b(ofac|sdn|shell|structuring|evasion|sanctions?|terror(?:ism|ist)?|cahra|ransomware|cybercrime|laundering|proliferation)\b/gi;

export interface Counterfactual {
  label: string;
  hypothesis: string;
  result: ReasoningResult;
  deltaScore: number;
  deltaDisposition: string | null;
}

export async function generateCounterfactuals(
  body: ReasonInput,
  baseline: ReasoningResult,
): Promise<{ baseline: ReasoningResult; nudges: Counterfactual[] }> {
  const nudges: Counterfactual[] = [];

  // A. Force CAHRA jurisdiction (Afghanistan).
  const cahraResult = await runReasoning({
    ...body,
    subject: { ...body.subject, jurisdiction: "Afghanistan" },
  });
  nudges.push({
    label: "Jurisdiction → CAHRA (Afghanistan)",
    hypothesis: "If the subject were domiciled in a Conflict-Affected and High-Risk Area, would the disposition change?",
    result: cahraResult,
    deltaScore: cahraResult.composite.score - baseline.composite.score,
    deltaDisposition: cahraResult.disposition.code === baseline.disposition.code ? null
      : `${baseline.disposition.code} → ${cahraResult.disposition.code}`,
  });

  // B. Strip red-flag tokens from the narrative.
  const scrubbed = (body.narrative ?? "").replace(RED_FLAG_TOKENS_RX, "[redacted]");
  const scrubbedResult = await runReasoning({ ...body, narrative: scrubbed });
  nudges.push({
    label: "Narrative scrubbed of red-flag tokens",
    hypothesis: "If the narrative did not name OFAC/sanctions/laundering/etc., would the result still hold?",
    result: scrubbedResult,
    deltaScore: scrubbedResult.composite.score - baseline.composite.score,
    deltaDisposition: scrubbedResult.disposition.code === baseline.disposition.code ? null
      : `${baseline.disposition.code} → ${scrubbedResult.disposition.code}`,
  });

  // C. Role downgraded to a junior accountant.
  const roleResult = await runReasoning({ ...body, roleText: "Junior accountant" });
  nudges.push({
    label: "Role → Junior accountant",
    hypothesis: "If the subject's role were non-prominent, would the PEP/EDD signal collapse?",
    result: roleResult,
    deltaScore: roleResult.composite.score - baseline.composite.score,
    deltaDisposition: roleResult.disposition.code === baseline.disposition.code ? null
      : `${baseline.disposition.code} → ${roleResult.disposition.code}`,
  });

  return { baseline, nudges };
}

// ── generateSteelman ───────────────────────────────────────────────────────
//
// Adversarial counter-arguments. Per-finding, names the meta-cognition
// primitive that anchors the challenge, the strongest counter-position, and
// the discriminating evidence an operator should look for. Citations point
// at META_COGNITION ids that exist in the catalogue (steelman, red_team,
// devils_advocate, bias_audit), so the UI can deep-link.

export interface SteelmanArgument {
  finding: string;
  counterArgument: string;
  citation: string;
  evidenceTest: string;
}

export function generateSteelman(result: ReasoningResult): SteelmanArgument[] {
  const out: SteelmanArgument[] = [];

  if (result.screen.hits.length > 0) {
    out.push({
      finding: `Watchlist hit: ${result.screen.hits[0]?.candidateName ?? "unknown"} (top score ${result.screen.topScore})`,
      counterArgument:
        "Common-name false positive — fuzzy match on a transliterated surname collides with the watchlist " +
        "entry without identifying details (DOB, nationality, photo) corroborating the same natural person.",
      citation: "mc.steelman",
      evidenceTest: "Pull at least 2 secondary identifiers (DOB, nationality, image) and re-screen. If they don't match the listed entity, downgrade.",
    });
  }
  if (result.redlines.fired.length > 0) {
    out.push({
      finding: `${result.redlines.fired.length} redline(s) fired: ${result.redlines.fired.map((r: any) => r.label).join(", ")}`,
      counterArgument:
        "Keyword bleeding — narrative contains the redline trigger string in a quoted news headline, " +
        "client disclosure, or counter-evidence context, not as a finding of fact.",
      citation: "mc.red-team",
      evidenceTest: "Verify the redline keyword is asserted as fact about the subject (not quoted, denied, or third-party). Re-evaluate after disambiguation.",
    });
  }
  if (result.pep && result.pep.salience > 0) {
    out.push({
      finding: `PEP (Tier ${result.pep.tier}, salience ${(result.pep.salience * 100).toFixed(0)}%)`,
      counterArgument:
        "Tier-lapsed — the subject left the prominent public function more than 12 months ago and FATF allows " +
        "step-down to standard CDD absent ongoing influence indicators.",
      citation: "mc.devils-advocate",
      evidenceTest: "Confirm departure date, ongoing influence (residual power, decision-making, RCA exposure), and apply the FATF R.12 step-down test.",
    });
  }
  if (result.typologies.hits.length > 0) {
    out.push({
      finding: `${result.typologies.hits.length} typology fingerprint(s) (composite ${Math.round(result.typologies.compositeScore)})`,
      counterArgument:
        "Circumstantial under FATF R.10 — typology matches are pattern indicators, not predicate findings; " +
        "absent corroborating transaction or beneficial-ownership evidence the typology hit alone does not warrant filing.",
      citation: "mc.bias-audit",
      evidenceTest: "Map each typology indicator to a specific transaction, counterparty, or ownership fact. If none corroborate, treat as low-weight.",
    });
  }
  if (result.jurisdiction?.cahra) {
    out.push({
      finding: `CAHRA jurisdiction: ${result.jurisdiction.name}`,
      counterArgument:
        "Ring-fenced UAE subsidiary — operating entity may be incorporated in CAHRA territory but funds, employees, " +
        "and beneficial owners are domiciled in a low-risk regime via a UAE holding structure.",
      citation: "mc.steelman",
      evidenceTest: "Verify capital flow, banking relationship and UBO are all outside the CAHRA. If yes, apply enhanced DD scoped to the residual exposure only.",
    });
  }
  if (result.adverseMedia.length > 0) {
    out.push({
      finding: `${result.adverseMedia.length} adverse-media category hit(s)`,
      counterArgument:
        "Allegation vs. finding — FATF Methodology distinguishes arrest / charge / conviction; treating an arrest article " +
        "as an adverse outcome inflates the composite without due process.",
      citation: "mc.bias-audit",
      evidenceTest: "Classify each hit by judicial stage (allegation / charge / conviction) and weight accordingly; rerun composite with downgraded inputs.",
    });
  }
  return out;
}

// ── generateModeCoverage ───────────────────────────────────────────────────
//
// Maps fired mode IDs to {faculty → modes} so the UI can render an accordion
// "X of N modes engaged on this case".

export interface ModeCoverage {
  totalCatalogued: number;
  totalFired: number;
  byFaculty: Array<{
    faculty: string;
    modes: Array<{ id: string; name: string; category: string; faculties: readonly string[] }>;
  }>;
}

export function generateModeCoverage(firedModeIds: string[]): ModeCoverage {
  const fired = firedModeIds
    .map((id: any) => REASONING_MODES.find((m: any) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  const byFaculty = new Map<string, ModeCoverage["byFaculty"][number]["modes"]>();
  for (const m of fired) {
    const primary = m.faculties[0] ?? "uncategorised";
    const list = byFaculty.get(primary) ?? [];
    list.push({ id: m.id, name: m.name, category: m.category, faculties: m.faculties });
    byFaculty.set(primary, list);
  }
  return {
    totalCatalogued: REASONING_MODES.length,
    totalFired: fired.length,
    byFaculty: [...byFaculty.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([faculty, modes]) => ({ faculty, modes })),
  };
}

// ── generateNarrative ──────────────────────────────────────────────────────
//
// Pure SAR/STR-style narrative — fact-only, no legal conclusions, regulator
// citations baked into the LEGAL BASIS section. The shape mirrors a UAE goAML
// filing template; operators can copy it into the FIU portal verbatim.

export function generateNarrative(input: ReasonInput, result: ReasoningResult): string {
  const now = new Date().toISOString();
  const subjectName = input.subject.name;
  const entityType = input.subject.entityType ?? "individual";
  const jurisdictionRaw = result.jurisdiction?.name ?? input.subject.jurisdiction;
  const jurisdiction = jurisdictionRaw ?? "— [SUPPLEMENT: enter subject's country before filing]";
  const sectorRaw = input.subject.sector;
  const sector = sectorRaw ?? "— [SUPPLEMENT: enter sector/business activity before filing]";
  const narrativeEmpty = !(input.narrative ?? "").trim() && !(input.adverseMediaText ?? "").trim();

  const trigger = [
    result.screen.hits.length > 0 ? `${result.screen.hits.length} watchlist candidate hit(s) (top score ${result.screen.topScore}, severity ${result.screen.severity})` : null,
    result.adverseMedia.length > 0 ? `${result.adverseMedia.length} adverse-media category match(es)` : null,
    result.typologies.hits.length > 0 ? `${result.typologies.hits.length} typology fingerprint(s) (composite ${Math.round(result.typologies.compositeScore)})` : null,
    result.redlines.fired.length > 0 ? `${result.redlines.fired.length} redline(s) fired` : null,
    result.pep && result.pep.salience > 0 ? `PEP classification (Tier ${result.pep.tier}, salience ${(result.pep.salience * 100).toFixed(0)}%)` : null,
    result.jurisdiction?.cahra ? `CAHRA-domiciled (${result.jurisdiction.name})` : null,
  ].filter(Boolean).join("; ") || "Composite-score threshold breach";

  const activitySummary = (input.narrative ?? "").trim().slice(0, 1200) ||
    (narrativeEmpty
      ? "[NARRATIVE NOT PROVIDED] — The Brain Inspector was run without adverse-media / OSINT text. Composite score reflects name-match and jurisdiction screening only. Paste transaction records, adverse media, or OSINT into the narrative field and re-run for a complete assessment. Supplement with primary records from the case file before filing with goAML."
      : "(no narrative supplied — facts to be supplemented from primary records before filing)");

  const redFlags = [
    ...result.redlines.fired.map((r: any) => `REDLINE · ${r.label} (${r.action.toUpperCase()})`),
    ...result.adverseMedia.map((a: any) => `ADVERSE MEDIA · ${a.categoryId.replace(/_/g, " ")} — keyword "${a.keyword}"`),
    ...result.typologies.hits.slice(0, 5).map((t) => `TYPOLOGY · ${t.name} (${t.family}) — "${t.snippet.slice(0, 140)}"`),
  ];
  if (redFlags.length === 0) redFlags.push("(no discrete red flags fired — composite score reflects accumulated weaker signals)");

  const legalBasis: string[] = [
    "FDL 10/2025 Art. 16(2) — duty to file Suspicious Transaction Report on reasonable suspicion (replaces former FDL 20/2018)",
    "Cabinet Decision 74/2020 — UAE TFS implementation: freeze and notify obligations",
    "FATF Recommendation 10 INR.10(b) — enhanced CDD on higher-risk relationships",
    "FATF Recommendation 20 — STR filing on suspicion of ML/TF predicate",
  ];
  if (result.jurisdiction?.cahra) {
    legalBasis.push("OECD Due Diligence Guidance Annex II — supplement on Conflict-Affected and High-Risk Areas");
  }
  if ((sector ?? "").toLowerCase().includes("gold") || (sector ?? "").toLowerCase().includes("bullion")) {
    legalBasis.push("LBMA Responsible Gold Guidance Step 3 — risk identification and assessment");
  }

  const nextSteps = [
    "Preserve full transaction blotter and KYC file under legal hold; log access via four-eyes principle.",
    "Suspend pending transactions where redline action ≠ proceed (no tipping-off; honour FATF R.21).",
    `File goAML STR within 35 calendar days of suspicion (current draft generated ${now}).`,
    result.disposition.code === "EDD_PRE_ONBOARD" ? "Apply enhanced DD pre-onboarding; senior-management approval required." : "",
    result.disposition.code === "REVIEW_L2" ? "Route to Level-2 analyst review with this evidence pack attached." : "",
  ].filter(Boolean);

  return [
    "═════════════════════════════════════════════════════════════════════════════",
    "  HAWKEYE STERLING · STR/SAR DRAFT NARRATIVE",
    "═════════════════════════════════════════════════════════════════════════════",
    "",
    "HEADER",
    "──────",
    `Subject:        ${subjectName}`,
    `Entity type:    ${entityType}`,
    `Jurisdiction:   ${jurisdiction}`,
    `Sector:         ${sector}`,
    `Generated at:   ${now}`,
    `Composite:      ${result.composite.score}/100`,
    `Disposition:    ${result.disposition.label} (${result.disposition.code})`,
    "",
    "TRIGGER",
    "───────",
    trigger + ".",
    "",
    "ACTIVITY",
    "────────",
    activitySummary,
    "",
    "RED FLAGS",
    "─────────",
    ...redFlags.map((rf) => `• ${rf}`),
    "",
    "LEGAL BASIS",
    "───────────",
    ...legalBasis.map((b) => `• ${b}`),
    "",
    "DISPOSITION",
    "───────────",
    `${result.disposition.label} (${result.disposition.code})`,
    `Rationale: ${result.disposition.rationale}`,
    "",
    "NEXT STEPS",
    "──────────",
    ...nextSteps.map((s) => `• ${s}`),
    "",
    "═════════════════════════════════════════════════════════════════════════════",
    "  This narrative is a draft. Charter prohibitions P1-P10 apply. Do not infer",
    "  legal conclusions; do not tip off the subject; preserve four-eyes review.",
    "═════════════════════════════════════════════════════════════════════════════",
  ].join("\n");
}

// ── shared helpers ─────────────────────────────────────────────────────────

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
    try { return regimesForJurisdiction(iso2Guess).map((r: any) => r.id ?? String(r)); }
    catch { return []; }
  })();
  return {
    iso2: iso2Guess,
    name: byName?.name ?? raw,
    region: byName?.region ?? "—",
    cahra: isCahra(iso2Guess),
    regimes,
  };
}

function redlineKeywordsMatch(haystack: string, id: string, description: string): boolean {
  const idFragments = id.split(/[._-]/).filter((f) => f.length >= 4);
  const descFragments = description.toLowerCase().split(/\W+/).filter((f) => f.length >= 5);
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
  subject: ReasonInput["subject"],
  jurisdiction: ReturnType<typeof resolveJurisdiction>,
): boolean {
  const subjectIsUae =
    !jurisdiction || jurisdiction.iso2 === "AE" || jurisdiction.region?.toLowerCase().includes("middle east");
  if (d.mandatoryInUAE && subjectIsUae) return true;
  const ctx = [
    subject.entityType ?? "", subject.sector ?? "", subject.jurisdiction ?? "",
    jurisdiction?.iso2 ?? "", jurisdiction?.region ?? "",
    jurisdiction?.cahra ? "cahra conflict-affected high-risk" : "", d.scope,
  ].join(" ").toLowerCase();
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

function metaCognitionApplies(m: { firesWhen: string }, ctx: string): boolean {
  const tokens = m.firesWhen.toLowerCase().split(/\W+/).filter((t) => t.length >= 5);
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

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}
