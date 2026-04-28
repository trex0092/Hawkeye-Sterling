// Hawkeye Sterling — MLRO-grade compliance report formatter.
//
// Produces the canonical Hawkeye Sterling report shape (plain text, fixed-
// width columns) for a screened subject. Mirrors the template Luisa
// specified: header block · subject · screening result matrix ·
// classification · adverse-media overlay · recommendation · goAML package
// · MLRO decision · regulatory framework.

export type ReportType = "PEP" | "SANCTIONS" | "AM" | "STANDARD" | "SOE";

export interface ReportSubject {
  id: string;
  name: string;
  entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  nationality?: string;
  jurisdiction?: string;
  dob?: string;
  office?: string;
  aliases?: string[];
  caseId?: string;
  group?: string;
  idNumber?: string;
}

export interface ReportScreeningResult {
  topScore: number;
  severity: "clear" | "low" | "medium" | "high" | "critical";
  hits: Array<{
    listId: string;
    listRef: string;
    candidateName: string;
    score: number;
    programs?: string[];
    method: string;
  }>;
}

export interface ReportSuperBrain {
  pep?: {
    tier: string;
    type: string;
    salience: number;
    rationale?: string;
  } | null;
  jurisdiction?: {
    iso2: string;
    name: string;
    region: string;
    cahra: boolean;
    regimes: string[];
  } | null;
  adverseMedia?: Array<{ categoryId: string; keyword: string; offset?: number }>;
  adverseKeywordGroups?: Array<{ group: string; label: string; count: number }>;
  // Detailed adverse-media scoring — when present we emit a findings
  // section even if the simple `adverseMedia` / `adverseKeywordGroups`
  // arrays are short, so the report reflects everything the brain saw.
  adverseMediaScored?: {
    byCategory?: Record<string, number>;
    total?: number;
    distinctKeywords?: number;
    topKeywords?: Array<{ keyword: string; categoryId: string; count: number }>;
    categoriesTripped?: string[];
    compositeScore?: number;
  } | null;
  typologies?: {
    hits?: Array<{ id: string; name: string; family: string; weight: number; snippet?: string }>;
    compositeScore?: number;
  } | null;
  esg?: Array<{ categoryId: string; domain: string; label: string }>;
  redlines?: { fired: Array<{ label?: string; id?: string; why?: string }>; action: string | null };
  composite?: { score: number; breakdown?: Record<string, number> };
}

export interface ReportInput {
  subject: ReportSubject;
  result: ReportScreeningResult;
  superBrain?: ReportSuperBrain | null;
  reportingEntity?: string;
  mlro?: string;
  now?: Date;
}

const REG_FRAMEWORK = [
  "Federal Decree-Law No. (10) of 2025 — UAE AML/CFT/CPF primary law",
  "Cabinet Resolution No. (134) of 2025 — Executive Regulations",
  "Cabinet Resolution No. (156) of 2025 — Goods Subject to Non-Proliferation (Controlled Items Schedule)",
  "MoE Circular No. (3) of 2025 — TFS / sanctions screening",
  "MoE Circular No. (2) of 2024 — Responsible sourcing (DPMS)",
  "MoE Circular No. (6) of 2025 — Risk-based CDD / SDD",
  "FATF Recommendations 10, 12, 20, 22",
  "LBMA Responsible Gold Guidance v9",
  "OECD Due Diligence Guidance — Gold Supplement",
];

const SEP = "═".repeat(79);
const SUB = "─".repeat(75);

function pad(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n);
}

function inferReportType(r: ReportScreeningResult, sb?: ReportSuperBrain | null): ReportType {
  // Only classify as SANCTIONS when there are actual sanctions list hits.
  // Severity alone (which can be driven by adverse-media composite score) is
  // not sufficient — a subject with no sanctions hits must never receive the
  // SANCTIONS banner regardless of how high their overall risk score is.
  if (r.hits.length > 0) return "SANCTIONS";
  if (sb?.pep && sb.pep.salience > 0) return "PEP";
  if (sb?.adverseKeywordGroups && sb.adverseKeywordGroups.length > 0) return "AM";
  if (sb?.adverseMedia && sb.adverseMedia.length > 0) return "AM";
  return "STANDARD";
}

function buildId(type: ReportType, d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `HWK-SCR-${y}${m}${day}-${type}-${h}${mm}`;
}

function formatHeader(
  type: ReportType,
  input: ReportInput,
  now: Date,
): string[] {
  const lines: string[] = [];
  lines.push("HAWKEYE STERLING");
  lines.push(`Report ID           : ${buildId(type, now)}`);
  if (input.reportingEntity) {
    lines.push(`Reporting entity    : ${input.reportingEntity}`);
  }
  lines.push(
    `Date and Time       : ${now.toUTCString().replace(" GMT", " UTC")}`,
  );
  lines.push("Place               : Dubai, United Arab Emirates");
  lines.push("FIU registration    : [goAML reporting entity ID]");
  lines.push(`MLRO assigned       : ${input.mlro ?? "Luisa Fernanda"}`);
  lines.push("Report classification : Confidential");
  return lines;
}

function formatSubject(s: ReportSubject): string[] {
  const lines: string[] = [];
  lines.push(`Subject type       : ${s.entityType.toUpperCase()}`);
  if (s.entityType === "individual") {
    lines.push(`Full legal name    : ${s.name}`);
    if (s.dob) lines.push(`Date of birth      : ${s.dob}`);
    if (s.nationality ?? s.jurisdiction)
      lines.push(`Nationality        : ${s.nationality ?? s.jurisdiction}`);
    if (s.office) lines.push(`Current office     : ${s.office}`);
  } else {
    lines.push(`Registered name    : ${s.name}`);
    if (s.jurisdiction) lines.push(`Jurisdiction       : ${s.jurisdiction}`);
  }
  if (s.aliases?.length) lines.push(`Alias(es)          : ${s.aliases.join("; ")}`);
  if (s.caseId) lines.push(`Case ID            : ${s.caseId}`);
  if (s.group) lines.push(`Group              : ${s.group}`);
  if (s.idNumber) lines.push(`ID / Register      : ${s.idNumber}`);
  return lines;
}

const SCREEN_VECTORS: Array<{ vector: string; engine: string; listIdMatch: RegExp }> = [
  { vector: "Sanctions (UN)     ", engine: "Hawkeye native    ", listIdMatch: /^UN[-_]/i },
  { vector: "Sanctions (UAE LTL)", engine: "Hawkeye native    ", listIdMatch: /^(?:UAE|AE)[-_]|EOCN|LTL/i },
  { vector: "Sanctions (OFAC)   ", engine: "Hawkeye + WC      ", listIdMatch: /\bOFAC\b/i },
  { vector: "Sanctions (EU)     ", engine: "Hawkeye native    ", listIdMatch: /^EU[-_]|[-_]EU\b|\bEU-CFSP\b/i },
  { vector: "Sanctions (UK OFSI)", engine: "Hawkeye native    ", listIdMatch: /\bOFSI\b|\bHMT\b|^UK[-_]/i },
  { vector: "Sanctions (Canada) ", engine: "Hawkeye native    ", listIdMatch: /\bOSFI\b|\bSEMA\b|^CA[-_]/i },
  { vector: "Sanctions (AUS)    ", engine: "Hawkeye native    ", listIdMatch: /\bDFAT\b|^AU[-_]/i },
];

// Risk posture — the canonical headline of the report. Avoids the old
// trap of putting `topScore` (sanctions only) under a /100 figure that
// the UI shows as the composite SuperBrain score. Here every contributing
// number is labelled, the composite drives the headline, and "CLEAR" is
// scoped to the sanctions vector instead of being mistaken for the
// subject-level disposition.
function bandFor(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "clear";
}

function dispositionFor(
  r: ReportScreeningResult,
  sb?: ReportSuperBrain | null,
): string {
  if (sb?.redlines?.action) return sb.redlines.action;
  if (r.hits.length > 0) return "ESCALATE — possible sanctions match";
  if (sb?.pep && sb.pep.salience > 0) return "EDD — PEP classification";
  const amCount =
    (sb?.adverseKeywordGroups?.length ?? 0) + (sb?.adverseMedia?.length ?? 0);
  if (amCount >= 4) return "ESCALATE — extensive adverse media";
  if (amCount >= 1) return "EDD — adverse-media signal";
  return "CDD posture — periodic review";
}

function formatPosture(
  r: ReportScreeningResult,
  sb?: ReportSuperBrain | null,
): string[] {
  const composite = sb?.composite?.score ?? null;
  const headline = composite ?? r.topScore;
  const band = bandFor(headline);
  const disp = dispositionFor(r, sb);

  const sanctionsScore = r.hits.length > 0
    ? Math.max(...r.hits.map((h) => Math.round(h.score * 100)))
    : 0;
  const sanctionsLabel =
    r.hits.length === 0
      ? "CLEAR (0 hits)"
      : `POSSIBLE MATCH — ${r.hits.length} hit(s) across ${new Set(r.hits.map((h) => h.listId)).size} list(s)`;

  const pepScore =
    sb?.pep && sb.pep.salience > 0 ? Math.round(sb.pep.salience * 100) : 0;
  const pepLabel =
    sb?.pep && sb.pep.salience > 0
      ? `${pep(sb.pep.tier)} · ${sb.pep.type.replace(/_/g, " ")}`
      : "not classified";

  const amTotal =
    sb?.adverseMediaScored?.total ??
    (sb?.adverseKeywordGroups ?? []).reduce((s, g) => s + g.count, 0) +
      (sb?.adverseMedia?.length ?? 0);
  const amCategories =
    sb?.adverseMediaScored?.categoriesTripped?.length ??
    (sb?.adverseKeywordGroups?.length ?? 0);
  const amScore =
    sb?.adverseMediaScored?.compositeScore != null
      ? Math.round(sb.adverseMediaScored.compositeScore)
      : amCategories >= 4
        ? 70
        : amCategories >= 1
          ? 35
          : 0;
  const amLabel =
    amTotal === 0
      ? "no categories tripped"
      : `${amTotal} keyword hit(s) across ${amCategories} categor${amCategories === 1 ? "y" : "ies"}`;

  const jurisScore = sb?.jurisdiction?.cahra
    ? 80
    : (sb?.jurisdiction?.regimes?.length ?? 0) > 0
      ? 28
      : 0;
  const jurisLabel = sb?.jurisdiction
    ? `${sb.jurisdiction.name} (${sb.jurisdiction.iso2}) · ${sb.jurisdiction.cahra ? "CAHRA" : "non-CAHRA"} · ${sb.jurisdiction.regimes.length} regime(s)`
    : "—";

  const redlinesFired = sb?.redlines?.fired?.length ?? 0;
  const redlinesScore = redlinesFired > 0 ? Math.min(100, redlinesFired * 25) : 0;
  const redlinesLabel =
    redlinesFired === 0
      ? "none triggered"
      : `${redlinesFired} fired${sb?.redlines?.action ? ` → ${sb.redlines.action}` : ""}`;

  const typHits = sb?.typologies?.hits?.length ?? 0;
  const typScore =
    sb?.typologies?.compositeScore != null
      ? Math.round(sb.typologies.compositeScore)
      : Math.min(100, typHits * 20);
  const typLabel =
    typHits === 0
      ? "no doctrines in scope"
      : `${typHits} doctrine(s): ${(sb?.typologies?.hits ?? [])
          .slice(0, 3)
          .map((h) => h.name)
          .join(", ")}${typHits > 3 ? "…" : ""}`;

  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} RISK POSTURE ${"─".repeat(62)}`);
  lines.push(
    `COMPOSITE             ${pad(`${headline}/100`, 10)}    BAND: ${band.toUpperCase()}`,
  );
  lines.push(`Disposition           ${disp}`);
  lines.push("");
  lines.push(
    `Vector                Score        Note`,
  );
  lines.push(
    `${"─".repeat(20)}  ${"─".repeat(11)}  ${"─".repeat(40)}`,
  );
  lines.push(`Sanctions match       ${pad(`${sanctionsScore}/100`, 11)}  ${sanctionsLabel}`);
  lines.push(`PEP salience          ${pad(`${pepScore}/100`, 11)}  ${pepLabel}`);
  lines.push(`Adverse media         ${pad(`${amScore}/100`, 11)}  ${amLabel}`);
  lines.push(`Jurisdictional        ${pad(`${jurisScore}/100`, 11)}  ${jurisLabel}`);
  lines.push(`Redlines              ${pad(`${redlinesScore}/100`, 11)}  ${redlinesLabel}`);
  lines.push(`Typology fingerprints ${pad(`${typScore}/100`, 11)}  ${typLabel}`);
  if (composite != null && r.topScore !== composite) {
    lines.push("");
    lines.push(
      `Note: legacy "screening top score" is ${r.topScore}/100 (sanctions vector only).`,
    );
    lines.push(
      `Headline above is the SuperBrain composite — same number rendered in the UI.`,
    );
  }
  return lines;
}

function formatMatrix(r: ReportScreeningResult, sb?: ReportSuperBrain | null): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} SCREENING RESULT MATRIX ${"─".repeat(51)}`);
  lines.push(`Vector              Engine              Score    Result`);
  lines.push(`${"─".repeat(19)}   ${"─".repeat(17)}   ─────    ${"─".repeat(22)}`);
  for (const v of SCREEN_VECTORS) {
    const hits = r.hits.filter((h) => v.listIdMatch.test(h.listId));
    const maxScore = hits.length > 0 ? Math.max(...hits.map((h) => h.score)) : 0;
    const score = hits.length > 0 ? String(Math.round(maxScore * 100)) : "—";
    // Automated screening never "confirms" a match — only MLRO review can do
    // that. Exact string matches and fuzzy matches are both unverified until
    // a human investigates. Use "POSSIBLE MATCH" to reflect this accurately.
    const result = hits.length > 0 ? "POSSIBLE MATCH — VERIFY" : "NEGATIVE";
    lines.push(`${v.vector}   ${v.engine}  ${pad(score, 5)}    ${result}`);
  }
  // PEP
  const pepScore = sb?.pep && sb.pep.salience > 0
    ? Math.round(sb.pep.salience * 100)
    : null;
  lines.push(
    `PEP                 World-Check       ${pad(
      pepScore != null ? String(pepScore) : "—",
      5,
    )}    ${pepScore != null ? "POSSIBLE PEP — VERIFY" : "NEGATIVE"}`,
  );
  // Adverse media — uses the same scoring source as the posture block
  // so the matrix never disagrees with the findings section.
  const amTotal =
    sb?.adverseMediaScored?.total ??
    (sb?.adverseKeywordGroups ?? []).reduce((s, g) => s + g.count, 0) +
      (sb?.adverseMedia?.length ?? 0);
  const amScore =
    sb?.adverseMediaScored?.compositeScore != null
      ? Math.round(sb.adverseMediaScored.compositeScore)
      : amTotal >= 6
        ? 70
        : amTotal >= 1
          ? 35
          : 0;
  const amLabel =
    amScore >= 60 ? "HIGH " : amScore >= 20 ? "LOW  " : amTotal > 0 ? "LOW  " : "—    ";
  const amResult =
    amScore >= 60
      ? "POSITIVE — extensive"
      : amTotal > 0
        ? "POSITIVE — limited"
        : "NEGATIVE";
  lines.push(`Adverse media       Multi-source      ${amLabel}   ${amResult}`);
  return lines;
}

function formatPepBlock(sb: ReportSuperBrain): string[] {
  const pep = sb.pep;
  if (!pep) return [];
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} PEP CLASSIFICATION ${"─".repeat(56)}`);
  lines.push(`Flag              : PEP (primary)`);
  lines.push(`PEP class         : ${pep.type.replace(/_/g, " ").toUpperCase()}`);
  lines.push(`PEP tier          : ${pep.tier}`);
  lines.push(`Salience          : ${Math.round(pep.salience * 100)}%`);
  if (pep.rationale) lines.push(`Rationale         : ${pep.rationale}`);
  return lines;
}

// Adverse-media findings — when the subject is positive in adverse
// media, the report MUST carry the findings (groups, categories,
// top keywords, scoring). Empty-state returns an empty list so the
// section is omitted cleanly when there's nothing to report.
function formatAdverseMedia(sb: ReportSuperBrain): string[] {
  const kw = sb.adverseKeywordGroups ?? [];
  const am = sb.adverseMedia ?? [];
  const scored = sb.adverseMediaScored ?? null;
  const hasScored =
    !!scored &&
    ((scored.total ?? 0) > 0 ||
      (scored.distinctKeywords ?? 0) > 0 ||
      (scored.topKeywords?.length ?? 0) > 0 ||
      (scored.categoriesTripped?.length ?? 0) > 0);
  if (kw.length === 0 && am.length === 0 && !hasScored) return [];

  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} ADVERSE MEDIA — FINDINGS ${"─".repeat(50)}`);

  // Headline metrics
  const totalHits =
    scored?.total ??
    kw.reduce((s, g) => s + g.count, 0) + am.length;
  const distinctKw = scored?.distinctKeywords ?? am.length;
  const cats =
    scored?.categoriesTripped?.length ?? new Set(am.map((a) => a.categoryId)).size;
  const score =
    scored?.compositeScore != null ? Math.round(scored.compositeScore) : null;
  lines.push(
    `Hit volume        : ${totalHits} keyword hit(s) · ${distinctKw} distinct term(s) · ${cats} categor${cats === 1 ? "y" : "ies"}`,
  );
  if (score != null) {
    lines.push(`Vector score      : ${score}/100`);
  }

  // Categories tripped (typology of the news signal)
  const categoriesTripped =
    scored?.categoriesTripped && scored.categoriesTripped.length > 0
      ? scored.categoriesTripped
      : Array.from(new Set(am.map((a) => a.categoryId)));
  if (categoriesTripped.length > 0) {
    lines.push("");
    lines.push("Categories tripped:");
    for (const c of categoriesTripped) {
      const count = scored?.byCategory?.[c];
      lines.push(`  • ${c}${count != null ? `  (${count} hit${count === 1 ? "" : "s"})` : ""}`);
    }
  }

  // Keyword groups (operator-friendly grouping by AML doctrine)
  if (kw.length > 0) {
    lines.push("");
    lines.push("Keyword groups fired:");
    for (const g of kw) lines.push(`  • ${g.label} — ${g.count} hit${g.count === 1 ? "" : "s"}  [${g.group}]`);
  }

  // Top keywords (the actual evidence — what words tripped the engine)
  const topKw = scored?.topKeywords ?? [];
  if (topKw.length > 0) {
    lines.push("");
    lines.push("Top keywords:");
    for (const t of topKw.slice(0, 10)) {
      lines.push(
        `  • "${t.keyword}"  →  ${t.categoryId}  (${t.count} occurrence${t.count === 1 ? "" : "s"})`,
      );
    }
  }

  // Per-hit evidence — keyword + offset for the first 15 hits, so a
  // reviewer can locate the exact term in the source narrative without
  // having to refire the brain.
  if (am.length > 0) {
    lines.push("");
    lines.push("Per-hit evidence (first 15):");
    for (const a of am.slice(0, 15)) {
      const off = a.offset != null ? ` @${a.offset}` : "";
      lines.push(`  • [${a.categoryId}]  "${a.keyword}"${off}`);
    }
    if (am.length > 15) {
      lines.push(`  …and ${am.length - 15} more — see attached evidence pack.`);
    }
  }

  // Reviewer guidance — adverse-media is open-source signal, never
  // constructive knowledge by itself. State the limit so an MLRO doesn't
  // misread the section as a confirmed finding.
  lines.push("");
  lines.push(
    "Source posture    : open-source / classifier-derived. Constructive-knowledge",
  );
  lines.push(
    "                    threshold (FDL 10/2025 Art.2(3)) requires analyst review",
  );
  lines.push(
    "                    and live-news corroboration before SAR / EDD action.",
  );
  return lines;
}

function formatJurisdiction(sb: ReportSuperBrain): string[] {
  const j = sb.jurisdiction;
  if (!j) return [];
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} JURISDICTION RISK ${"─".repeat(57)}`);
  lines.push(`Jurisdiction      : ${j.name} (${j.iso2}) · ${j.region}`);
  lines.push(`CAHRA             : ${j.cahra ? "YES" : "no"}`);
  if (j.regimes.length) lines.push(`Active regimes    : ${j.regimes.join(", ")}`);
  return lines;
}

// Narrative MLRO memo — Section 1 Facts. Same facts as the matrix above,
// written in prose so the report reads like the memo an MLRO would sign,
// not just a dump of engine output. Never invents facts — only restates
// what the payload already carries.
function formatFacts(
  type: ReportType,
  input: ReportInput,
  now: Date,
): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} 1. FACTS ${"─".repeat(66)}`);
  const s = input.subject;
  const r = input.result;
  const sb = input.superBrain;
  const when = now.toUTCString().replace(" GMT", " UTC");
  const subjectDescriptor =
    s.entityType === "individual"
      ? `the individual subject **${s.name}**${
          s.nationality ? ` (${s.nationality} national)` : ""
        }`
      : `the ${s.entityType} **${s.name}**${
          s.jurisdiction ? ` (registered in ${s.jurisdiction})` : ""
        }`;
  const caseBit = s.caseId ? ` under case ${s.caseId}` : "";
  // Composite (full SuperBrain fusion) is the headline number — same one
  // the operator sees in the UI gauge. Sanctions top score is reported
  // separately so a 0/CLEAR sanctions vector doesn't get confused with
  // a low overall composite (or vice versa).
  const composite = sb?.composite?.score ?? null;
  const headline = composite ?? r.topScore;
  const band = bandFor(headline).toUpperCase();
  const compositeBit =
    composite != null
      ? `a composite risk score of ${composite}/100 (band: ${band})`
      : `a screening top score of ${r.topScore}/100 (band: ${band}) — composite not available`;
  const sanctionsBit =
    r.hits.length === 0
      ? `The sanctions vector returned CLEAR (0 hits across the screened corpora; severity ${r.severity.toUpperCase()}).`
      : `The sanctions vector returned ${r.hits.length} hit(s) across ${
          new Set(r.hits.map((h) => h.listId)).size
        } list(s) at top match strength ${r.topScore}/100 (severity ${r.severity.toUpperCase()}).`;
  lines.push(
    `On ${when}, Hawkeye Sterling screened ${subjectDescriptor}${caseBit},`,
  );
  lines.push(`returning ${compositeBit}.`);
  lines.push(sanctionsBit);
  if (sb?.pep && sb.pep.salience > 0) {
    lines.push(
      `Subject classified as PEP (${pep(sb.pep.tier)} · salience ${Math.round(
        sb.pep.salience * 100,
      )}%).`,
    );
  }
  // Use the same hit counter as the posture / findings sections so the
  // FACTS narrative never quotes a different number than the matrix
  // beneath it. Falls back to keyword-group counts only when the scored
  // payload is absent.
  const amTotal =
    sb?.adverseMediaScored?.total ??
    (sb?.adverseKeywordGroups ?? []).reduce((s, g) => s + g.count, 0) +
      (sb?.adverseMedia?.length ?? 0);
  if (amTotal > 0) {
    const distinctCats =
      sb?.adverseMediaScored?.categoriesTripped?.length ??
      new Set((sb?.adverseMedia ?? []).map((a) => a.categoryId)).size;
    lines.push(
      `Adverse-media overlay returned POSITIVE — ${amTotal} keyword hit(s) across ${distinctCats} categor${distinctCats === 1 ? "y" : "ies"}; see findings section for evidence.`,
    );
  }
  void type;
  return lines;
}

// Section 2 — Analysis. Ties the facts to the risk posture. Stays with
// the same single-paragraph-per-topic shape used in the B sample so
// the memo reads to a human but every claim still traces back to a
// field in the payload.
function formatAnalysis(type: ReportType, input: ReportInput): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} 2. ANALYSIS ${"─".repeat(63)}`);
  const r = input.result;
  const sb = input.superBrain;
  // Composite drives the band; sanctions severity is just the sanctions
  // vector. Reporting "clear" here when composite is 42 was the old bug.
  const headlineScore = sb?.composite?.score ?? r.topScore;
  const band = bandFor(headlineScore);
  lines.push(
    `The composite score sits in the **${band}** band. ${
      r.hits.length > 0
        ? `Possible sanctions matches found on: ${Array.from(
            new Set(r.hits.map((h) => h.listId)),
          ).join(", ")} — match identity must be verified by MLRO before any action.`
        : "The subject does not appear on any monitored sanctions regime."
    }`,
  );
  if (sb?.jurisdiction) {
    lines.push(
      `Jurisdictional risk for ${sb.jurisdiction.name} (${sb.jurisdiction.iso2})` +
        (sb.jurisdiction.cahra
          ? " is elevated — jurisdiction is on the CAHRA register."
          : ` is assessed as ${sb.jurisdiction.regimes.length > 0 ? "medium" : "baseline"} (non-CAHRA).`),
    );
  }
  if (type === "AM") {
    lines.push(
      "The adverse-media signal is presently open-source and requires analyst",
    );
    lines.push(
      "review and live-news corroboration before constructive-knowledge can be",
    );
    lines.push("asserted under FDL 10/2025 Art.2(3).");
  }
  if (type === "PEP") {
    lines.push(
      "PEP status alone does not constitute a suspicion trigger; it invokes EDD",
    );
    lines.push(
      "and senior-management approval under FATF Recommendation 12 / FDL 10/2025",
    );
    lines.push("Art.17.");
  }
  return lines;
}

function pep(tier: string): string {
  return tier.replace(/^tier_/, "tier ").replace(/_/g, " ");
}

function formatRecommendation(type: ReportType, r: ReportScreeningResult): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} RECOMMENDATION (SYSTEM) ${"─".repeat(51)}`);
  if (type === "SANCTIONS") {
    lines.push("▶ ESCALATE TO MLRO IMMEDIATELY — possible sanctions match detected");
    lines.push("▶ SUSPEND ONBOARDING / HALT IN-FLIGHT TRANSACTIONS pending MLRO decision");
    lines.push("▶ VERIFY MATCH IDENTITY — compare registration numbers, directors,");
    lines.push("  addresses, DOB and other identifiers against the sanctioned entry");
    lines.push("  before taking any freezing or filing action");
    lines.push("▶ IF MATCH CONFIRMED BY MLRO:");
    lines.push("    – FREEZE all in-flight funds and pending transactions");
    lines.push("    – FILE FFR via goAML within 5 business days");
    lines.push("    – NOTIFY EOCN and MoE");
    lines.push("    – FILE parallel SAR if sanctions evasion suspected");
    lines.push("    – ESCALATE to CEO + Board Chair");
    lines.push("    – ENGAGE legal counsel — multi-jurisdictional exposure");
    lines.push("▶ IF MATCH REJECTED (false positive) — document rationale for file,");
    lines.push("  update screening record with false-positive determination, proceed");
    lines.push("▶ TIPPING-OFF PROHIBITION ABSOLUTE — do not alert the subject");
  } else if (type === "PEP") {
    lines.push("▶ ENHANCED DUE DILIGENCE (EDD)");
    lines.push("▶ ESCALATE TO CEO AND BOARD CHAIR FOR APPROVAL DECISION");
    lines.push("▶ NO goAML FILING ON PEP STATUS ALONE");
    lines.push("▶ CONDITIONAL STR IF EDD REVEALS SoF / SoW INCONSISTENCY");
    lines.push("▶ CONDITIONAL DPMSR IF CASH COMPONENT ≥ AED 55,000 IN ANY TRANSACTION");
    lines.push("▶ RECOMMEND CONSIDER DECLINING ON REPUTATIONAL-RISK / RISK-APPETITE GROUNDS");
  } else if (type === "AM") {
    lines.push("▶ IMMEDIATE ESCALATION TO MLRO");
    lines.push("▶ 24-MONTH RETROSPECTIVE TRANSACTION REVIEW");
    lines.push("▶ CONSIDER SOURCING SUSPENSION PENDING INVESTIGATION");
    lines.push("▶ LBMA STEP 4 AUDIT FILE UPDATE (IF DPMS SUPPLIER)");
    lines.push("▶ ANNUAL RESPONSIBLE SOURCING REPORT DISCLOSURE");
    lines.push("▶ MoE NOTIFICATION (Circular 2/2024 compliance evidence)");
    lines.push("▶ SAR IF CONSTRUCTIVE KNOWLEDGE THRESHOLD CROSSED");
    lines.push("▶ TIPPING-OFF PROHIBITION ABSOLUTE");
  } else {
    lines.push("▶ PROCEED WITH STANDARD CDD");
    lines.push("▶ SDD ELIGIBLE (MoE Circular 6/2025) — MLRO DISCRETION APPLIES");
    lines.push("▶ NO goAML FILING REQUIRED");
    lines.push("▶ DPMSR NOT TRIGGERED (wire-funded; no cash component at threshold)");
    lines.push("▶ PERIODIC REVIEW PER RISK TABLE (LOW → 3 yrs · MEDIUM → 2 yrs)");
    lines.push("▶ STANDARD ONGOING MONITORING");
  }
  return lines;
}

function formatGoaml(type: ReportType, input: ReportInput, now: Date): string[] {
  if (type !== "SANCTIONS" && type !== "AM") return [];
  const lines: string[] = [];
  const isSan = type === "SANCTIONS";
  lines.push(
    `${SUB.slice(0, 3)} goAML PRE-FILL DATA (pending MLRO verification) ${"─".repeat(28)}`,
  );
  // For SANCTIONS the report_code is FFR only after MLRO confirms the match.
  // Pre-filling the data here saves time but does NOT mean filing is authorised.
  lines.push(`report_code           : ${isSan ? "FFR (if match confirmed)" : "SAR"}`);
  lines.push(
    `entity_reference      : ${buildId(type, now)}${isSan ? "-FFR" : "-SAR"}`,
  );
  lines.push(
    `reason                : [MLRO to complete after match verification]`,
  );
  lines.push(
    `action                : ${isSan ? "[MLRO to complete — freeze only after confirmation]" : "Sourcing suspended; retrospective review opened"}`,
  );
  if (input.subject.entityType === "individual") {
    lines.push(`t_person.name         : ${input.subject.name}`);
    if (input.subject.dob) lines.push(`t_person.dob          : ${input.subject.dob}`);
    if (input.subject.nationality)
      lines.push(`t_person.nationality  : ${input.subject.nationality}`);
  } else {
    lines.push(`t_entity.name         : ${input.subject.name}`);
    if (input.subject.jurisdiction)
      lines.push(`t_entity.incorp_ctry  : ${input.subject.jurisdiction}`);
  }
  return lines;
}

function formatDecision(type: ReportType): string[] {
  const lines: string[] = [];
  lines.push(`${SUB.slice(0, 3)} MLRO DECISION (TO BE COMPLETED) ${"─".repeat(44)}`);
  if (type === "SANCTIONS") {
    lines.push("STEP 1 — MATCH VERIFICATION");
    lines.push("[ ] Match CONFIRMED — subject is the sanctioned entity (proceed to Step 2)");
    lines.push("[ ] Match REJECTED  — false positive; document rationale below");
    lines.push("    Rationale: ____________________________________________");
    lines.push("");
    lines.push("STEP 2 — IF MATCH CONFIRMED");
    lines.push("[ ] Freeze in-flight funds + FFR + parallel SAR + notify EOCN / MoE");
    lines.push("[ ] Modify recommended action — record reason");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
    lines.push("CEO signature : _____________________     Date: _____________");
  } else if (type === "PEP") {
    lines.push("[ ] Accept recommendation — proceed to EDD + Board review");
    lines.push("[ ] Decline relationship — document rationale");
    lines.push("[ ] Escalate for policy-level decision — Board-standing item");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  } else if (type === "AM") {
    lines.push("[ ] Accept system recommendation — submit SAR + suspend sourcing");
    lines.push("[ ] Submit SAR with modifications — record rationale");
    lines.push("[ ] Escalate to Board before SAR submission");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  } else {
    lines.push("[ ] Apply Standard CDD — proceed");
    lines.push("[ ] Apply SDD — proceed");
    lines.push("[ ] Override to EDD — record reason");
    lines.push("");
    lines.push("MLRO signature: _____________________     Date: _____________");
  }
  return lines;
}

function formatFramework(): string[] {
  const lines: string[] = [];
  lines.push("Regulatory framework applied:");
  lines.push("");
  for (const f of REG_FRAMEWORK) lines.push(`  - ${f}`);
  return lines;
}

export function buildComplianceReport(input: ReportInput): string {
  const now = input.now ?? new Date();
  const type = inferReportType(input.result, input.superBrain);
  const out: string[] = [];

  out.push(SEP);
  out.push(...formatHeader(type, input, now));

  if (type === "SANCTIONS") {
    out.push("╔" + "═".repeat(77) + "╗");
    out.push(
      "║   ⚠  POSSIBLE SANCTIONS MATCH — MLRO REVIEW REQUIRED BEFORE ANY ACTION  ⚠ ║",
    );
    out.push(
      "║   DO NOT FREEZE OR FILE until MLRO has verified match identity            ║",
    );
    out.push("╚" + "═".repeat(77) + "╝");
  }

  out.push(...formatSubject(input.subject));
  out.push("");
  out.push(...formatPosture(input.result, input.superBrain));
  out.push(...formatMatrix(input.result, input.superBrain));
  if (input.superBrain) {
    out.push(...formatPepBlock(input.superBrain));
    out.push(...formatJurisdiction(input.superBrain));
    out.push(...formatAdverseMedia(input.superBrain));
  }
  out.push("");
  out.push(...formatFacts(type, input, now));
  out.push("");
  out.push(...formatAnalysis(type, input));
  out.push("");
  out.push(...formatRecommendation(type, input.result));
  out.push(...formatGoaml(type, input, now));
  out.push(...formatDecision(type));
  out.push(...formatFramework());
  out.push(SEP);
  out.push("END OF REPORT");
  out.push(SEP);
  return out.filter((l) => l != null).join("\n");
}
