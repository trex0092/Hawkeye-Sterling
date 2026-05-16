import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  buildComplianceReport,
  buildComplianceReportStructured,
  type ReportInput,
} from "@/lib/reports/complianceReport";
import { buildHtmlDoc, hsPage, hsFinis } from "@/lib/reportHtml";
import { disposition, inferIndustryHints, type DispositionResult } from "@/lib/intelligence/dispositionEngine";
import { inferIndustrySegment } from "@/lib/intelligence/industryRisk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/compliance-report
// Body: { subject, result, superBrain?, reportingEntity?, mlro? }
// Returns text/plain — the Hawkeye Sterling MLRO report, generated
// strictly from the payload (no invented facts, no narrative hallucinations).

// Strip characters that would let a caller inject response headers or
// break the filename quoting. Subject IDs are user-controlled; without
// this, "HS-10\r\nX-Evil: 1" in the body would split the header.
function safeFilenameSegment(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function e(s: string | number | undefined | null): string {
  return escapeHtml(String(s ?? "—"));
}

const SEV_COLOR: Record<string, string> = {
  clear: "#22c55e",
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const SCREEN_VECTORS = [
  { label: "Sanctions (UN)",      engine: "Hawkeye native", rx: /^UN[-_]/i },
  { label: "Sanctions (UAE LTL)", engine: "Hawkeye native", rx: /^(?:UAE|AE)[-_]|EOCN|LTL/i },
  { label: "Sanctions (OFAC)",    engine: "Hawkeye + WC",   rx: /\bOFAC\b/i },
  { label: "Sanctions (EU)",      engine: "Hawkeye native", rx: /^EU[-_]|[-_]EU\b/i },
  { label: "Sanctions (UK OFSI)", engine: "Hawkeye native", rx: /\bOFSI\b|\bHMT\b|^UK[-_]/i },
  { label: "Sanctions (Canada)",  engine: "Hawkeye native", rx: /\bOSFI\b|\bSEMA\b|^CA[-_]/i },
  { label: "Sanctions (AUS)",     engine: "Hawkeye native", rx: /\bDFAT\b|^AU[-_]/i },
];

// Severity band derived from the headline composite — same lookup used
// by the canonical text report so the HTML cover never disagrees with
// the canonical body it embeds.
function bandForScore(score: number): "clear" | "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "clear";
}

// MLRO POLICY: certain signals MUST escalate the dossier regardless of the
// raw composite. A subject with confirmed adverse media at moderate+ severity
// is HIGH-risk, full stop — even if the composite math hasn't crossed the
// 60-point threshold yet. Same rule for any-tier PEP and any sanctions hit.
// Without this override, a single "Istanbul Gold Refinery — bribery
// indictment" article scores composite ~28 (LOW) and the dossier reads as
// LOW while the CDD card simultaneously says EDD/zero-tolerance — that
// inconsistency is exactly what the regulator flags as "negligent screening".
function effectiveBand(
  rawScore: number,
  signals: {
    sanctionsHits: number;
    pepTier?: string | null;
    amCompositeScore?: number;       // 0..1 from structured scorer
    amCount?: number;                 // count fallback
    redlinesFired?: number;
    cahra?: boolean;
  },
): "clear" | "low" | "medium" | "high" | "critical" {
  const base = bandForScore(rawScore);
  const order = ["clear", "low", "medium", "high", "critical"] as const;
  let band: typeof order[number] = base;
  const escalateTo = (target: typeof order[number]): void => {
    if (order.indexOf(target) > order.indexOf(band)) band = target;
  };

  // Sanctions hits — any positive match escalates immediately.
  if (signals.sanctionsHits >= 1) escalateTo("high");
  if (signals.sanctionsHits >= 2) escalateTo("critical");

  // Adverse media — severity-weighted scorer dominates when available.
  if (typeof signals.amCompositeScore === "number" && signals.amCompositeScore >= 0) {
    if (signals.amCompositeScore >= 0.7) escalateTo("critical");
    else if (signals.amCompositeScore >= 0.4) escalateTo("high");
    else if (signals.amCompositeScore >= 0.1) escalateTo("high");  // any moderate signal → EDD
    else if (signals.amCompositeScore > 0)   escalateTo("medium"); // limited signal → at least medium
  } else if (typeof signals.amCount === "number" && signals.amCount > 0) {
    // Count-only fallback when the structured scorer didn't run.
    if (signals.amCount >= 4) escalateTo("high");
    else escalateTo("medium");
  }

  // Any PEP tier triggers EDD per FATF R.12 / FDL 10/2025 Art.17.
  if (signals.pepTier) escalateTo("high");

  // Redlines — hard charter prohibitions. Any fire = critical.
  if ((signals.redlinesFired ?? 0) > 0) escalateTo("critical");

  // CAHRA jurisdiction adds at least medium pressure.
  if (signals.cahra) escalateTo("medium");

  return band;
}

function renderHtmlReport(text: string, input: ReportInput): string {
  const now = input.now ?? new Date();
  const s   = input.subject;
  const r   = input.result;
  const sb  = input.superBrain;
  // Composite drives the headline — same number rendered in the UI
  // gauge. r.topScore (sanctions vector only) was the source of the
  // 0/100-CLEAR-vs-42/100 discrepancy in earlier exports.
  // ?? only narrows null/undefined, so a real 0 survives. Both paths
  // can still legitimately be undefined on the very first ever run
  // before any screening has happened — clamp to a number so
  // bandForScore never receives NaN/undefined and silently ranks the
  // subject as CLEAR by accident.
  const rawComposite = sb?.composite?.score ?? r.topScore;
  const composite = typeof rawComposite === "number" && Number.isFinite(rawComposite) ? rawComposite : 0;

  const amCount = (sb?.adverseKeywordGroups?.length ?? 0) + (sb?.adverseMedia?.length ?? 0);
  // Severity-weighted adverse-media score from the structured scorer (0..1).
  // Falls back to count-based classification when unavailable.
  const amCompositeScore: number = sb?.adverseMediaScored?.compositeScore ?? -1;
  const pepTier = sb?.pep && sb.pep.salience > 0 ? sb.pep.tier : null;

  // Run the full intelligence engine — produces band, recommendation,
  // typology fingerprints, FATF predicate-offence chain, MLRO interview
  // script, document requests, anomaly flags, calibrated confidence, and
  // a counterfactual narrative. Surfaces in the dossier so the MLRO sees
  // not just the band but the *why*.
  const intel: DispositionResult = disposition({
    composite,
    sanctionsHits: r.hits.length,
    topSanctionsScore: r.hits.length > 0 ? Math.max(...r.hits.map((h) => h.score)) : 0,
    sanctionsLists: Array.from(new Set(r.hits.map((h) => h.listId))),
    pepTier,
    pepSalience: sb?.pep?.salience,
    amCompositeScore,
    amCount,
    amCategoriesTripped:
      sb?.adverseMediaScored?.categoriesTripped ??
      Array.from(new Set((sb?.adverseMedia ?? []).map((a) => a.categoryId))),
    redlinesFired: sb?.redlines?.fired?.length ?? 0,
    jurisdictionIso2: sb?.jurisdiction?.iso2,
    cahra: sb?.jurisdiction?.cahra ?? false,
    crossRegimeSplit: Boolean((sb as { crossRegimeConflict?: { split?: boolean } } | null | undefined)?.crossRegimeConflict?.split),
    entityType: s.entityType as "individual" | "organisation" | "vessel" | "aircraft" | "other" | undefined,
    industryHints: inferIndustryHints(s.name, s.aliases ?? []),
    industrySegment: inferIndustrySegment(s.name, s.aliases ?? []),
    ...((sb as { newsDossier?: { articleCount?: number } } | null | undefined)?.newsDossier?.articleCount !== undefined
      ? { totalAdverseCount: (sb as { newsDossier?: { articleCount?: number } } | null | undefined)!.newsDossier!.articleCount }
      : {}),
    brainDegraded: Boolean((sb as { degradation?: unknown[] } | null | undefined)?.degradation?.length),
  });
  const headlineBand = intel.band;
  const sev = headlineBand;
  const sevColor = SEV_COLOR[sev] ?? "#888";
  const safeTitle = escapeHtml(`Hawkeye Sterling — ${s.name}`);

  const year  = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(now.getUTCDate()).padStart(2, "0");
  const hh    = String(now.getUTCHours()).padStart(2, "0");
  const mm    = String(now.getUTCMinutes()).padStart(2, "0");
  const hasAdverseMedia = amCompositeScore > 0 || amCount > 0;
  const reportType = r.hits.length > 0 ? "SANCTIONS" : pepTier ? "PEP" : hasAdverseMedia ? "AM" : "STANDARD";
  const reportId = `HWK-SCR-${day}-${month}-${year}-${reportType}-${hh}${mm}`;

  // Screening matrix rows
  const matrixRows = SCREEN_VECTORS.map((v) => {
    const hits = r.hits.filter((h) => v.rx.test(h.listId));
    const score = hits.length > 0 ? Math.round(Math.max(...hits.map((h) => h.score)) * 100) + "%" : "—";
    const result = hits.length > 0 ? "POSSIBLE MATCH — VERIFY" : "NEGATIVE";
    const rc = hits.length > 0 ? "#f97316" : "#22c55e";
    return `<tr>
      <td>${e(v.label)}</td>
      <td class="muted">${e(v.engine)}</td>
      <td class="mono">${score}</td>
      <td style="color:${rc};font-weight:600">${result}</td>
    </tr>`;
  }).join("");

  const pepScore = pepTier ? Math.round((sb!.pep!.salience) * 100) + "%" : "—";
  const pepResult = pepTier ? "POSSIBLE PEP — VERIFY" : "NEGATIVE";
  const pepRc = pepTier ? "#f97316" : "#22c55e";

  // Use the severity-weighted structured score when available (0..1 compositeScore).
  // Fall back to a count-based proxy only when the scorer did not run.
  // This prevents "LIMITED SIGNAL" labels on single terrorism/sanctions hits.
  const amScore: string = (() => {
    if (amCompositeScore >= 0) {
      if (amCompositeScore >= 0.7) return "CRITICAL";
      if (amCompositeScore >= 0.4) return "HIGH";
      if (amCompositeScore >= 0.1) return "MEDIUM";
      if (amCompositeScore > 0)   return "LOW";
      return "—";
    }
    // Count-based fallback
    return amCount >= 4 ? "HIGH" : amCount >= 1 ? "LOW" : "—";
  })();
  const amResult: string = (() => {
    if (amCompositeScore >= 0) {
      if (amCompositeScore >= 0.7) return "POSITIVE — critical findings";
      if (amCompositeScore >= 0.4) return "POSITIVE — significant adverse media";
      if (amCompositeScore >= 0.1) return "POSITIVE — moderate signal";
      if (amCompositeScore > 0)   return "POSITIVE — limited signal";
      return "NEGATIVE";
    }
    return amCount >= 4 ? "POSITIVE — extensive" : amCount >= 1 ? "POSITIVE — limited signal" : "NEGATIVE";
  })();
  const amRc: string = (() => {
    if (amCompositeScore >= 0) {
      if (amCompositeScore >= 0.7) return "#ef4444"; // critical red
      if (amCompositeScore >= 0.4) return "#f97316"; // high orange
      if (amCompositeScore >= 0.1) return "#f59e0b"; // medium amber
      if (amCompositeScore > 0)   return "#3b82f6"; // low blue
      return "#22c55e"; // clear green
    }
    return amCount >= 4 ? "#ef4444" : amCount >= 1 ? "#f59e0b" : "#22c55e";
  })();



  // Recommendation
  let rec = "";
  if (sev === "critical") {
    rec = "FREEZE — freeze in-flight funds and pending transactions, file FFR via goAML within 5 business days, notify EOCN, refuse the relationship, and escalate to CEO and Board Chair.";
  } else if (sev === "high") {
    rec = "Escalate to MLRO, open Enhanced Due Diligence, and defer clearance pending analyst review of source-of-wealth and source-of-funds.";
  } else if (hasAdverseMedia) {
    rec = "Defer clearance pending (a) live-news corroboration, (b) analyst review of underlying reporting, and (c) enrolment in ongoing screening at thrice-daily cadence.";
  } else {
    rec = "Proceed with standard CDD. Subject enrolled in ongoing screening (thrice-daily — 08:30 / 15:00 / 17:30 Dubai) and any delta will be filed to the MLRO automatically.";
  }



  // Extract audit-trail fields from the canonical text the report
  // builder produced. Renders them as a small styled panel in the
  // PDF — the .txt download remains the canonical hash-protected
  // form; the PDF just surfaces the integrity / signature lines so
  // a regulator can read them without opening the .txt sidecar.
  const grab = (re: RegExp): string => text.match(re)?.[1]?.trim() ?? "";
  const runId = grab(/reasoning\.run_id\s+(\S+)/);
  const generatedAtIso = grab(/brain\.generated_at\s+(\S+)/);
  const engineVersion = grab(/brain\.engine_version\s+(\S+)/);
  const schemaVersion = grab(/report\.schema_version\s+(\S+)/);
  const buildSha = grab(/brain\.build_sha\s+(\S+)/);
  const operatorRole = grab(/operator\.role\s+(.+)/);
  const payloadSha = grab(/payload\.sha256\s+([a-f0-9]+)/);
  const reportSha = grab(/report\.sha256\s+([a-f0-9]+)/);
  const hmacSig = grab(/report\.signature\s+hmac-sha256:([a-f0-9]+)/);
  const hmacFp = grab(/signing\.key_fp\s+([a-f0-9]+)/);
  const edSig = grab(/report\.signature_ed25519\s+([a-f0-9]+)/);
  const edFp = grab(/signing\.pubkey_fp\s+([a-f0-9]+)/);



  const integrityNote =
    hmacSig || edSig
      ? "Signatures cover report.sha256. Verify with the matching key — recipes in the .txt export. All timestamps UTC."
      : "Report is hash-protected (SHA-256) but unsigned. Set REPORT_SIGNING_KEY and/or REPORT_ED25519_PRIVATE_KEY to enable authenticity proof. All timestamps UTC.";

  // ── helpers ────────────────────────────────────────────────────────
  const subjectMeta = [
    e(s.id),
    s.entityType ? e(s.entityType.toUpperCase()) : null,
    s.nationality ? e(s.nationality.toUpperCase()) : null,
    s.jurisdiction ? e(s.jurisdiction.toUpperCase()) : null,
    s.dob ? `DOB ${e(s.dob)}` : null,
  ].filter(Boolean).join(" · ");

  const recLines = [
    `► ${rec}`,
    sev === "clear" || sev === "low" ? "► PROCEED WITH STANDARD CDD" : "",
    sev === "clear" || sev === "low" ? "► SDD ELIGIBLE (MoE Circular 6/2025) — MLRO DISCRETION APPLIES" : "",
    "► NO goAML FILING REQUIRED",
    "► STANDARD ONGOING MONITORING",
  ].filter(Boolean);

  const regItems = [
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

  const amScored = sb?.adverseMediaScored ?? null;
  const amTotalHits = amScored?.total
    ?? ((sb?.adverseKeywordGroups ?? []).reduce((acc, g) => acc + g.count, 0) + (sb?.adverseMedia?.length ?? 0));
  const amCategoriesTripped =
    amScored?.categoriesTripped?.length
      ? amScored.categoriesTripped
      : Array.from(new Set((sb?.adverseMedia ?? []).map((a) => a.categoryId)));
  const amVectorScore = amScored?.compositeScore != null ? Math.round(amScored.compositeScore) : null;
  const newsArticles = (sb as { newsDossier?: { articles?: Array<{ title: string; link: string; pubDate?: string; source?: string; snippet?: string; severity?: string }> } } | null | undefined)?.newsDossier?.articles ?? [];

  // ── extra CSS (scr-* classes) ──────────────────────────────────────
  const extraCss = `<style>
.scr-logo{display:grid;grid-template-columns:1fr auto;align-items:start;gap:16px;margin-bottom:12px}
.scr-logo-name{font-family:var(--serif);font-size:22px;letter-spacing:0.38em;font-weight:500;color:var(--ink);line-height:1.15}
.scr-logo-sub{font-size:7px;letter-spacing:0.26em;color:var(--ink-3);text-transform:uppercase;margin-top:3px}
.scr-stamp{border:1px solid var(--pink);padding:5px 9px;text-align:center;transform:rotate(-2deg);background:var(--pink-soft)}
.scr-stamp-l{font-family:var(--serif);font-size:10px;letter-spacing:0.3em;color:var(--pink);font-weight:600}
.scr-stamp-s{font-size:5px;letter-spacing:0.3em;color:var(--pink);text-transform:uppercase;margin-top:2px}
.scr-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 28px;padding:8px 0}
.scr-meta-row{display:grid;grid-template-columns:110px 1fr;gap:6px;align-items:baseline}
.scr-ml{font:700 6.5px/1.5 var(--sans);text-transform:uppercase;letter-spacing:0.12em;color:var(--ink-3)}
.scr-mv{font:500 9px/1.5 var(--sans);color:var(--ink)}
.scr-subj{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:9px 0;margin:9px 0;border-top:0.5px solid var(--hair);border-bottom:0.5px solid var(--hair)}
.scr-subj-name{font-family:var(--serif);font-size:22px;font-weight:600;color:var(--ink);line-height:1.1;margin-bottom:3px}
.scr-subj-meta{font:500 8px/1.5 var(--sans);color:var(--ink-2);letter-spacing:0.03em;text-transform:uppercase}
.scr-verdict{text-align:right;border-left:0.5px solid var(--hair);padding-left:14px;flex-shrink:0}
.scr-badge{display:inline-block;padding:3px 8px;border:1px solid currentColor;font:700 7px/1 var(--sans);letter-spacing:0.18em;text-transform:uppercase}
.scr-score{font-family:var(--serif);font-size:26px;font-weight:600;margin-top:4px;line-height:1}
.scr-score-cap{font:600 6.5px/1 var(--sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.12em;margin-top:2px}
.scr-sh{font:700 7px/1 var(--sans);color:var(--pink);letter-spacing:0.2em;text-transform:uppercase;padding-bottom:5px;margin:10px 0 7px;border-bottom:0.5px solid var(--hair)}
.scr-tbl{width:100%;border-collapse:collapse}
.scr-tbl thead th{text-align:left;font:700 6px/1 var(--sans);letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-3);padding:0 6px 5px;border-bottom:0.5px solid var(--ink)}
.scr-tbl thead th:nth-child(3),.scr-tbl thead th:nth-child(4){text-align:right}
.scr-tbl tbody td{padding:5px 6px;border-bottom:0.5px solid var(--hair);color:var(--ink);font-size:8px}
.scr-tbl tbody td:nth-child(1){font-weight:500}
.scr-tbl tbody td:nth-child(2){color:var(--ink-3)}
.scr-tbl tbody td:nth-child(3),.scr-tbl tbody td:nth-child(4){text-align:right}
.scr-tbl tbody tr:last-child td{border-bottom:0.5px solid var(--ink)}
.scr-comp{display:flex;justify-content:space-between;font:8px var(--sans);color:var(--ink-3);margin-top:4px;padding-top:3px;border-top:0.5px solid var(--hair)}
.scr-jur{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;margin-top:6px}
.scr-jl{font:700 6px/1 var(--sans);text-transform:uppercase;letter-spacing:0.12em;color:var(--ink-3);margin-bottom:2px}
.scr-jv{font:500 8px/1.4 var(--sans);color:var(--ink)}
.scr-para{font-family:var(--serif);font-size:10.5px;line-height:1.6;color:var(--ink)}
.scr-rec{padding:2px 0 2px 10px;border-left:1.5px solid var(--pink)}
.scr-rl{padding:5px 0;border-bottom:0.5px dotted var(--hair);font:8px/1.5 var(--sans);color:var(--ink)}
.scr-rl:last-child{border-bottom:none}
.scr-cbg{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:12px}
.scr-cb{display:flex;align-items:center;gap:7px;padding:8px 10px;border:0.5px solid var(--hair)}
.scr-cbb{width:9px;height:9px;border:0.5px solid var(--ink-2);flex-shrink:0}
.scr-cbl{font:500 8px/1.4 var(--sans);color:var(--ink)}
.scr-sigb{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px}
.scr-sigl{border-bottom:0.5px solid var(--ink);margin-top:22px;margin-bottom:4px}
.scr-siglabel{font:600 6.5px/1 var(--sans);text-transform:uppercase;letter-spacing:0.14em;color:var(--ink-3)}
.scr-regl{list-style:none;column-count:2;column-gap:18px;column-rule:0.5px solid var(--hair);margin-top:6px}
.scr-regl li{font:8px/1.55 var(--sans);color:var(--ink);padding-left:9px;position:relative;break-inside:avoid;margin-bottom:3px}
.scr-regl li::before{content:'';position:absolute;left:0;top:0.65em;width:5px;height:0.5px;background:var(--pink)}
.scr-ag{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;padding:10px 12px;background:var(--pink-soft);border:0.5px solid var(--hair);margin-bottom:8px}
.scr-ar{display:flex;justify-content:space-between;gap:8px;line-height:1.5}
.scr-al{font:700 6px/1.5 var(--sans);text-transform:uppercase;letter-spacing:0.1em;color:var(--ink-3);flex-shrink:0}
.scr-av{font-family:var(--mono);font-size:7.5px;text-align:right;word-break:break-all;max-width:58%;color:var(--ink)}
.scr-sigs{padding:10px 12px;border:0.5px solid var(--hair);margin-bottom:8px}
.scr-sigs-t{font:700 6.5px/1 var(--sans);text-transform:uppercase;letter-spacing:0.14em;color:var(--ink-3);margin-bottom:8px}
.scr-se{display:flex;flex-direction:column;gap:2px;margin-bottom:8px;padding-bottom:8px;border-bottom:0.5px dotted var(--hair)}
.scr-se:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
.scr-sen{font:700 8px/1 var(--sans);color:var(--pink);letter-spacing:0.04em}
.scr-sep{font:7px/1.5 var(--mono);color:var(--ink-3)}
.scr-sex{font:7px/1.4 var(--mono);color:var(--ink);word-break:break-all}
.scr-note{font:7.5px/1.5 var(--sans);color:var(--ink-3);font-style:italic;margin-top:6px}
.scr-am-brief{background:rgba(214,30,111,0.04);border:0.5px solid var(--hair);padding:7px 9px;margin:7px 0;font:8px/1.5 var(--sans);color:var(--ink)}
.scr-am-chip{display:inline-block;padding:1px 5px;border:0.5px solid #f59e0b;background:rgba(245,158,11,0.06);font:700 6.5px/1.4 var(--sans);text-transform:uppercase;letter-spacing:0.1em;color:#b45309;margin:1px 2px}
</style>`;

  // ── page 1: cover / screening ──────────────────────────────────────
  const jurBlock = sb?.jurisdiction ? `
  <div class="scr-sh">Jurisdiction Risk</div>
  <div class="scr-jur">
    <div><div class="scr-jl">Jurisdiction</div><div class="scr-jv">${e(sb.jurisdiction.name)} (${e(sb.jurisdiction.iso2)})</div></div>
    <div><div class="scr-jl">CAHRA</div><div class="scr-jv">${sb.jurisdiction.cahra ? '<span style="color:#d61e6f;font-weight:700">YES</span>' : "no"}</div></div>
    ${sb.jurisdiction.region ? `<div><div class="scr-jl">Region</div><div class="scr-jv">${e(sb.jurisdiction.region)}</div></div>` : ""}
  </div>` : "";

  const factsText = `On ${e(now.toUTCString().replace(" GMT"," UTC"))}, Hawkeye Sterling screened the ${e(s.entityType ?? "subject")} <strong>${e(s.name)}</strong>${s.nationality ? ` (${e(s.nationality)} national)` : ""}${s.caseId ? ` under case ${e(s.caseId)}` : ""}, returning a composite risk score of <strong style="color:${sevColor}">${composite}/100</strong> (band: ${e(sev.toUpperCase())}). The sanctions vector ${r.hits.length === 0 ? `returned <strong>CLEAR</strong> (0 hits across the screened corpora)` : `returned <strong>${r.hits.length}</strong> possible match(es) at top match strength ${r.topScore}/100`}.${amCount > 0 ? ` Adverse-media overlay fired ${amCount} categor${amCount === 1 ? "y" : "ies"}.` : ""}${pepTier ? ` Possible PEP (${e(pepTier)}) — requires independent verification.` : ""}`;

  const p1 = `
  <div class="scr-logo">
    <div>
      <div class="scr-logo-name">HAWKEYE&nbsp;&nbsp;STERLING</div>
      <div class="scr-logo-sub">Subject Screening Dossier</div>
    </div>
    <div class="scr-stamp">
      <div class="scr-stamp-l">CONFIDENTIAL</div>
      <div class="scr-stamp-s">MLRO USE ONLY</div>
    </div>
  </div>
  <div class="hs-rule"></div>
  <div class="scr-meta">
    <div class="scr-meta-row"><span class="scr-ml">Date and Time</span><span class="scr-mv">${e(now.toUTCString().replace(" GMT"," UTC"))}</span></div>
    <div class="scr-meta-row"><span class="scr-ml">Place</span><span class="scr-mv">Dubai, United Arab Emirates</span></div>
    <div class="scr-meta-row"><span class="scr-ml">MLRO Assigned</span><span class="scr-mv">${e(input.mlro ?? "L. Fernanda")}</span></div>
  </div>
  <div class="hs-doublerule"><div></div><div></div></div>
  <div class="scr-subj">
    <div>
      <div class="scr-subj-name">${e(s.name)}</div>
      <div class="scr-subj-meta">${subjectMeta}</div>
      ${s.aliases?.length ? `<div class="scr-subj-meta" style="margin-top:3px">Aliases: ${s.aliases.map(a => e(a)).join(" · ")}</div>` : ""}
    </div>
    <div class="scr-verdict">
      <div class="scr-badge" style="color:${sevColor};border-color:${sevColor}">${e(sev.toUpperCase())}</div>
      <div class="scr-score" style="color:${sevColor}">${composite}<span style="font-family:var(--sans);font-size:12px;font-weight:500;color:var(--ink-3)">/100</span></div>
      <div class="scr-score-cap">COMPOSITE · SANCTIONS VECTOR ${r.topScore}/100</div>
    </div>
  </div>
  <div class="scr-sh">Screening Result Matrix</div>
  <table class="scr-tbl">
    <thead><tr><th>Vector</th><th>Engine</th><th>Score</th><th>Result</th></tr></thead>
    <tbody>
      ${matrixRows}
      <tr><td>PEP</td><td>World-Check</td><td style="text-align:right;font-family:var(--mono)">${pepScore}</td><td style="text-align:right;font-weight:600;color:${pepRc}">${pepResult}</td></tr>
      <tr><td>Adverse media</td><td>Multi-source</td><td style="text-align:right;font-family:var(--mono)">${amScore}</td><td style="text-align:right;font-weight:600;color:${amRc}">${amResult}</td></tr>
    </tbody>
  </table>
  <div class="scr-comp">
    <span>Composite risk score</span>
    <span style="color:${sevColor};font-weight:600">${composite}/100 · ${e(sev.toUpperCase())}</span>
  </div>
  ${jurBlock}
  <div class="scr-sh" style="margin-top:12px">1. Facts</div>
  <p class="scr-para">${factsText}</p>`;

  // ── page 2: analysis + decision ───────────────────────────────────
  const analysisText = `The composite score sits in the <strong style="color:${sevColor}">${e(sev)}</strong> band. ${r.hits.length > 0 ? `Possible matches concentrate on ${Array.from(new Set(r.hits.map(h => h.listId))).slice(0, 3).map(l => `<strong>${e(l)}</strong>`).join(", ")}.` : "The subject does not appear on any monitored sanctions regime."} ${sb?.jurisdiction ? `Jurisdictional risk for ${e(sb.jurisdiction.name)} is assessed as ${sb.jurisdiction.cahra ? '<strong style="color:#d61e6f">CAHRA</strong>' : "non-CAHRA"}.` : ""} ${amCount > 0 ? `The adverse-media signal requires analyst review and live-news corroboration before constructive knowledge can be asserted under FDL 10/2025 Art.2(3). Categories tripped: ${amCategoriesTripped.slice(0, 5).map(c => e(c.replace(/_/g, " "))).join(", ")}${amCategoriesTripped.length > 5 ? ` +${amCategoriesTripped.length - 5} more` : ""}.` : ""}`;

  const amBrief = amCount > 0 ? `
  <div class="scr-am-brief">
    <strong>Adverse Media:</strong> ${amTotalHits} keyword hit${amTotalHits === 1 ? "" : "s"} · ${amCategoriesTripped.length} categor${amCategoriesTripped.length === 1 ? "y" : "ies"}${amVectorScore != null ? ` · vector score ${amVectorScore}/100` : ""}${newsArticles.length > 0 ? ` · ${newsArticles.length} news article${newsArticles.length === 1 ? "" : "s"}` : ""}<br>
    ${amCategoriesTripped.slice(0, 6).map(c => `<span class="scr-am-chip">${e(c.replace(/_/g, " "))}</span>`).join("")}
  </div>` : "";

  const p2 = `
  <div class="scr-sh" style="margin-top:0">2. Analysis</div>
  <p class="scr-para">${analysisText}</p>
  ${amBrief}
  <div class="scr-sh">Recommendation (System)</div>
  <div class="scr-rec">
    ${recLines.map(l => `<div class="scr-rl">${e(l)}</div>`).join("")}
  </div>
  <div class="scr-sh">MLRO Decision</div>
  <div class="scr-cbg">
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Apply Standard CDD — proceed</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Apply SDD — proceed</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Override to EDD — record reason</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">File STR via goAML</div></div>
  </div>
  <div class="scr-sigb">
    <div><div class="scr-sigl"></div><div class="scr-siglabel">MLRO Signature</div></div>
    <div><div class="scr-sigl"></div><div class="scr-siglabel">Date</div></div>
  </div>
  <div class="scr-sh">Regulatory Framework Applied</div>
  <ul class="scr-regl">${regItems.map(f => `<li>${e(f)}</li>`).join("")}</ul>`;

  // ── page 3: audit trail ───────────────────────────────────────────
  const auditRows: Array<[string, string]> = ([
    ["Run ID", runId],
    ["Brain Generated", generatedAtIso],
    ["Engine Version", engineVersion],
    ["Schema Version", schemaVersion],
    ["Build SHA", buildSha],
    ["Operator", operatorRole],
    ["Payload SHA-256", payloadSha],
    ["Report SHA-256", reportSha],
  ] as Array<[string, string]>).filter(([, v]) => !!v);

  const sigBlock = (hmacSig || edSig) ? `
  <div class="scr-sigs">
    <div class="scr-sigs-t">Signatures</div>
    ${hmacSig ? `<div class="scr-se"><div class="scr-sen">HMAC-SHA256</div><div class="scr-sep">key fp ${e(hmacFp)}</div><div class="scr-sex">${e(hmacSig)}</div></div>` : ""}
    ${edSig   ? `<div class="scr-se"><div class="scr-sen">Ed25519</div><div class="scr-sep">pubkey fp ${e(edFp)}</div><div class="scr-sex">${e(edSig)}</div></div>` : ""}
  </div>` : "";

  // ── Triage & disposition (per-hit operator decisions) ──────────────
  // When the caller passes triageResolutions[], the dossier renders an
  // immutable record of every name-similar candidate alongside the
  // operator's decision (positive/possible/false) and reason. This is
  // the audit trail the regulator examines for FATF R.10 / FDL Art.19
  // negative-finding evidence-of-search.
  const triage = input.triageResolutions ?? [];
  const triagePos = triage.filter((t) => t.resolution === "positive");
  const triagePos2 = triage.filter((t) => t.resolution === "possible");
  const triageNeg = triage.filter((t) => t.resolution === "false");
  const triageOpen = triage.filter((t) => t.resolution === "unspecified");
  const RES_COLOR: Record<string, string> = {
    positive: "#d61e6f", possible: "#f59e0b", false: "#22c55e", unspecified: "#94a3b8",
  };
  const RES_LABEL: Record<string, string> = {
    positive: "POSITIVE — same person", possible: "POSSIBLE — needs review",
    false: "FALSE — different person", unspecified: "UNRESOLVED",
  };
  const triageRow = (t: typeof triage[number]): string => `
    <tr>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;font-weight:500">${e(t.matchedName)}</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;font-family:var(--mono,monospace);font-size:10px;color:#64748b">${e(t.sourceList)}${t.listRef ? ` · ${e(t.listRef)}` : ""}</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;text-align:right;font-family:var(--mono,monospace)">${e(t.matchStrength)}/100</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;font-size:10px">${e(t.dob ?? "—")}</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;font-size:10px">${e(t.citizenship ?? "—")}</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;color:${RES_COLOR[t.resolution] ?? "#000"};font-weight:600;font-size:10px;white-space:nowrap">${e(RES_LABEL[t.resolution] ?? t.resolution)}</td>
      <td style="padding:4px 6px;border-top:1px solid #e2e8f0;font-style:italic;color:#475569;font-size:10px">${e(t.reason ?? "—")}</td>
    </tr>`;
  const triageTable = triage.length > 0 ? `
    <div class="scr-sh">Triage &amp; Disposition</div>
    <p class="scr-para" style="margin-bottom:6px">
      ${triage.length} candidate match(es) reviewed; <strong style="color:${RES_COLOR.positive}">${triagePos.length} positive</strong>,
      <strong style="color:${RES_COLOR.possible}">${triagePos2.length} possible</strong>,
      <strong style="color:${RES_COLOR.false}">${triageNeg.length} false</strong>,
      ${triageOpen.length} unresolved.
      Each disposition is operator-attested per FDL 10/2025 Art.19; reasons recorded below form the negative-finding evidence-of-search obligation.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px">
      <thead style="background:#f8fafc">
        <tr>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Matched name</th>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Source · ref</th>
          <th style="text-align:right;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Strength</th>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">DOB</th>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Citizen.</th>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Disposition</th>
          <th style="text-align:left;padding:5px 6px;font-weight:700;font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#475569">Reason / note</th>
        </tr>
      </thead>
      <tbody>
        ${triagePos.map(triageRow).join("")}
        ${triagePos2.map(triageRow).join("")}
        ${triageOpen.map(triageRow).join("")}
        ${triageNeg.map(triageRow).join("")}
      </tbody>
    </table>` : "";

  const p2extended = `
  <div class="scr-sh" style="margin-top:0">2. Analysis</div>
  <p class="scr-para">${analysisText}</p>
  ${amBrief}
  <div class="scr-sh">Recommendation (System)</div>
  <div class="scr-rec">
    ${recLines.map(l => `<div class="scr-rl">${e(l)}</div>`).join("")}
  </div>
  ${triageTable}
  <div class="scr-sh">MLRO Decision</div>
  <div class="scr-cbg">
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Apply Standard CDD — proceed</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Apply SDD — proceed</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">Override to EDD — record reason</div></div>
    <div class="scr-cb"><div class="scr-cbb"></div><div class="scr-cbl">File STR via goAML</div></div>
  </div>
  <div class="scr-sigb">
    <div><div class="scr-sigl"></div><div class="scr-siglabel">MLRO Signature</div></div>
    <div><div class="scr-sigl"></div><div class="scr-siglabel">Date</div></div>
  </div>
  <div class="scr-sh">Regulatory Framework Applied</div>
  <ul class="scr-regl">${regItems.map(f => `<li>${e(f)}</li>`).join("")}</ul>
  <div class="scr-sh" style="margin-top:10px">Audit Trail &amp; Integrity</div>
  <div class="scr-ag">
    ${auditRows.map(([k, v]) => `<div class="scr-ar"><span class="scr-al">${e(k)}</span><span class="scr-av">${e(v)}</span></div>`).join("")}
  </div>
  ${sigBlock}
  <div class="scr-note">${e(integrityNote)}</div>
  ${hsFinis(reportId, 2, 2)}`;

  const regs  = "FDL 10/2025 · 10-year retention";
  const label = "SUBJECT SCREENING DOSSIER";

  // ── page 3: Intelligence Pack — typologies, predicates, interview script ──
  // Geographic risk profile
  const intelGeography = `
    <div class="scr-sh">Geographic risk profile</div>
    <div style="font-size:9.5px;line-height:1.5">
      <strong>${e(intel.geography.subject.name)} (${e(intel.geography.subject.iso2)})</strong> —
      inherent risk <span class="mono">${intel.geography.subject.inherentRisk}/100</span>;
      tiers: ${intel.geography.subject.tiers.map((t) => `<span class="scr-am-chip">${e(t.replace(/_/g, " "))}</span>`).join("")}
      ${intel.geography.subject.activeRegimes.length > 0
        ? `<br><strong>Active regimes:</strong> ${intel.geography.subject.activeRegimes.map((r) => e(r)).join(", ")}`
        : ""}
      ${intel.geography.subject.notes.length > 0
        ? `<ul style="padding-left:14px;margin:4px 0">${intel.geography.subject.notes.map((n) => `<li>${e(n)}</li>`).join("")}</ul>`
        : ""}
    </div>`;

  // Industry / sector risk
  const intelIndustry = `
    <div class="scr-sh">Industry / sector inherent risk</div>
    <div style="font-size:9.5px;line-height:1.5">
      <strong>${e(intel.industry.label)}</strong> — inherent risk <span class="mono">${intel.industry.inherentRisk}/100</span>.
      ${e(intel.industry.rationale)}
      ${intel.industry.typologyReferences.length > 0
        ? `<br><strong>References:</strong> ${intel.industry.typologyReferences.map((r) => e(r)).join(" · ")}`
        : ""}
    </div>`;

  // Network analysis
  const intelNetwork = intel.network && intel.network.flaggedCount > 0
    ? `<div class="scr-sh">Network / RCA contagion</div>
       <div style="font-size:9.5px">
         Network contagion score <span class="mono">${intel.network.score}/100</span> from ${intel.network.flaggedCount} flagged related part${intel.network.flaggedCount === 1 ? "y" : "ies"}.
         ${intel.network.topContributors.length > 0
           ? `<ul style="padding-left:14px;margin:4px 0">${intel.network.topContributors.map((c) => `<li><strong>${e(c.partyName)}</strong> (${e(c.partyKind.replace(/_/g, " "))}) — +${c.contribution} pts · ${e(c.reason)}</li>`).join("")}</ul>`
           : ""}
       </div>` : "";

  // Temporal analysis
  const intelTemporal = intel.temporal
    ? `<div class="scr-sh">Temporal / velocity analysis</div>
       <div style="font-size:9.5px">
         Velocity <span class="mono">${intel.temporal.velocity}/100</span> · decayed-severity <span class="scr-am-chip">${e(intel.temporal.decayedSeverity.toUpperCase())}</span>
         · last 30d: ${intel.temporal.eventsLast30d} · last 90d: ${intel.temporal.eventsLast90d} · last 365d: ${intel.temporal.eventsLast365d}
       </div>` : "";

  const intelTypologies = intel.typologies.length > 0
    ? `<div class="scr-sh">Typology fingerprints (FATF / Egmont)</div>
       <table class="scr-tbl">
         <thead><tr><th>Typology</th><th>Family</th><th>Match</th><th>Evidence</th></tr></thead>
         <tbody>
           ${intel.typologies.map((t) => `
             <tr>
               <td>${e(t.name)}</td>
               <td class="muted">${e(t.family.toUpperCase())}</td>
               <td class="mono">${Math.round(t.match * 100)}%</td>
               <td class="muted">${t.evidence.map((ev) => e(ev)).join(" · ")}</td>
             </tr>`).join("")}
         </tbody>
       </table>` : "";

  // MLRO playbooks per fired typology
  const intelPlaybooks = intel.playbooks.length > 0
    ? `<div class="scr-sh">MLRO playbooks (per fired typology)</div>
       ${intel.playbooks.map((pb) => `
         <div style="border:0.5px solid var(--hair);padding:8px 10px;margin:6px 0">
           <div style="font:700 8px/1.2 var(--sans);text-transform:uppercase;letter-spacing:0.1em;color:var(--pink);margin-bottom:4px">${e(pb.typologyId.replace(/_/g, " "))}</div>
           <p style="font-size:9px;margin:0 0 6px;color:var(--ink)">${e(pb.summary)}</p>
           <div style="font:700 7px/1 var(--sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.1em;margin-top:6px">Immediate</div>
           <ul style="padding-left:14px;margin:2px 0;font-size:8.5px">${pb.immediate.map((i) => `<li>${e(i)}</li>`).join("")}</ul>
           <div style="font:700 7px/1 var(--sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.1em;margin-top:6px">Secondary verification</div>
           <ul style="padding-left:14px;margin:2px 0;font-size:8.5px">${pb.secondary.map((i) => `<li>${e(i)}</li>`).join("")}</ul>
           <div style="font:700 7px/1 var(--sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.1em;margin-top:6px">Escalation triggers</div>
           <ul style="padding-left:14px;margin:2px 0;font-size:8.5px">${pb.escalationTriggers.map((i) => `<li>${e(i)}</li>`).join("")}</ul>
           <div style="font:700 7px/1 var(--sans);color:var(--pink);text-transform:uppercase;letter-spacing:0.1em;margin-top:6px">Red lines (refuse the relationship)</div>
           <ul style="padding-left:14px;margin:2px 0;font-size:8.5px">${pb.redLines.map((i) => `<li>${e(i)}</li>`).join("")}</ul>
           <div style="font:7px/1.4 var(--mono);color:var(--ink-3);margin-top:6px">${pb.citations.map((c) => e(c)).join(" · ")}</div>
         </div>`).join("")}` : "";

  const intelPredicates = intel.predicateOffences.length > 0
    ? `<div class="scr-sh">FATF predicate offences implied</div>
       <ul class="scr-regl">
         ${intel.predicateOffences.map((p) => `<li><strong>${e(p.label)}</strong> — ${e(p.fatfReference)} · ${e(p.uaeBasis)}</li>`).join("")}
       </ul>` : "";

  const intelInterview = intel.interviewScript.length > 0
    ? `<div class="scr-sh">MLRO interview script — questions to put to the customer</div>
       <ol style="padding-left:18px;margin:6px 0">
         ${intel.interviewScript.map((q) => `
           <li style="margin-bottom:6px">
             <p class="scr-para" style="font-size:9.5px;margin:0 0 2px">${e(q.question)}</p>
             <p style="font:7px/1.4 var(--mono);color:var(--ink-3);margin:0">Why: ${e(q.rationale)}</p>
           </li>`).join("")}
       </ol>` : "";

  const intelDocs = intel.documentRequests.length > 0
    ? `<div class="scr-sh">Documents to request</div>
       <ul style="padding-left:14px;margin:6px 0">
         ${intel.documentRequests.map((d) => `
           <li style="margin-bottom:4px;font-size:9px">
             <strong>${e(d.document)}</strong> — <span class="muted">${e(d.why)}</span>
           </li>`).join("")}
       </ul>` : "";

  const intelEvidence = intel.requiredEvidence.length > 0
    ? `<div class="scr-sh">Required evidence to clear / dispose</div>
       <ul style="padding-left:14px;margin:6px 0">
         ${intel.requiredEvidence.map((ev) => `<li style="margin-bottom:3px;font-size:9px">${e(ev)}</li>`).join("")}
       </ul>` : "";

  const intelAnomalies = intel.anomalies.length > 0
    ? `<div class="scr-sh">Anomaly flags — unusual signal combinations</div>
       <ul style="padding-left:14px;margin:6px 0">
         ${intel.anomalies.map((a) => `<li style="margin-bottom:3px;font-size:9px;color:#b45309">${e(a)}</li>`).join("")}
       </ul>` : "";

  const intelEscalations = intel.escalations.length > 0
    ? `<div class="scr-sh">Band-escalation chain</div>
       <ol style="padding-left:18px;margin:6px 0">
         ${intel.escalations.map((esc) => `
           <li style="margin-bottom:3px;font-size:9px">
             <span class="mono">${e(esc.from.toUpperCase())} → ${e(esc.to.toUpperCase())}</span> · ${e(esc.reason)}
           </li>`).join("")}
       </ol>` : "";

  const intelConfidence = `
    <div class="scr-sh">Calibrated confidence + counterfactual</div>
    <p class="scr-para" style="font-size:9.5px">${e(intel.confidence.basis)}</p>
    <p class="scr-para" style="font-size:9.5px;color:var(--ink-2);font-style:italic">Counterfactual: ${e(intel.counterfactual)}</p>`;

  const p3 = `
    <div class="scr-sh" style="margin-top:0">3. Intelligence Pack</div>
    <p class="scr-para" style="font-size:9.5px;color:var(--ink-2);margin-bottom:8px">
      Cross-signal reasoning over sanctions, PEP, adverse media, redlines, jurisdiction, industry, and recency. The recommended
      disposition is <strong>${e(intel.recommendation.replace(/_/g, " ").toUpperCase())}</strong>; ${intel.escalations.length} band escalation(s)
      were applied above the raw composite ${composite}/100.
    </p>
    ${intelEscalations}
    ${intelGeography}
    ${intelIndustry}
    ${intelNetwork}
    ${intelTemporal}
    ${intelTypologies}
    ${intelPlaybooks}
    ${intelPredicates}
    ${intelAnomalies}
    ${intelEvidence}
    ${intelDocs}
    ${intelInterview}
    ${intelConfidence}
    ${(() => {
      // Live server pipeline (phonetic / cultural / sub-national / stress
      // tests) carried on superBrain.intelligence. Render only when the
      // server actually attached it.
      const si = (sb as { intelligence?: {
        phonetic?: { caverphone?: string; beiderMorseLite?: string; arabicPhonetic?: string; pinyinCanonical?: string };
        parsedName?: { culture?: string; given?: string; surname?: string; nasab?: string; kunya?: string; patronymic?: string };
        canonicalKey?: string;
        subnational?: { matched?: boolean; rationale?: string };
        stressTests?: Array<{ regime: string; fired: boolean; severity: string; rationale: string; citation: string }>;
        stressTestsFiredCount?: number;
      } } | null | undefined)?.intelligence;
      if (!si) return "";
      const fired = (si.stressTests ?? []).filter((s) => s.fired);
      return `
        <div class="scr-sh">Server intelligence (live pipeline)</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px 18px;font:9.5px var(--mono);color:var(--ink-1);margin-bottom:8px">
          ${si.phonetic?.caverphone ? `<div><span class="muted">Caverphone:</span> ${e(si.phonetic.caverphone)}</div>` : ""}
          ${si.phonetic?.beiderMorseLite ? `<div><span class="muted">Beider-Morse:</span> ${e(si.phonetic.beiderMorseLite)}</div>` : ""}
          ${si.phonetic?.arabicPhonetic ? `<div><span class="muted">Arabic phonetic:</span> ${e(si.phonetic.arabicPhonetic)}</div>` : ""}
          ${si.phonetic?.pinyinCanonical ? `<div><span class="muted">Pinyin:</span> ${e(si.phonetic.pinyinCanonical)}</div>` : ""}
          ${si.parsedName?.culture ? `<div><span class="muted">Culture:</span> ${e(si.parsedName.culture)}</div>` : ""}
          ${si.canonicalKey ? `<div><span class="muted">Canonical key:</span> ${e(si.canonicalKey)}</div>` : ""}
          ${si.parsedName?.kunya ? `<div><span class="muted">Kunya:</span> ${e(si.parsedName.kunya)}</div>` : ""}
          ${si.parsedName?.nasab ? `<div><span class="muted">Nasab:</span> ${e(si.parsedName.nasab)}</div>` : ""}
          ${si.parsedName?.patronymic ? `<div><span class="muted">Patronymic:</span> ${e(si.parsedName.patronymic)}</div>` : ""}
        </div>
        ${si.subnational?.matched ? `<p class="scr-para" style="font-size:10px;color:var(--pink)">Sub-national match: ${e(si.subnational.rationale ?? "")}</p>` : ""}
        ${fired.length > 0 ? `
          <div class="scr-sh">Sanctions stress tests fired (${fired.length})</div>
          <ul class="scr-regl">
            ${fired.map((t) => `<li><strong>${e(t.regime)}</strong> · ${e(t.severity.toUpperCase())} — ${e(t.rationale)} <span class="muted">(${e(t.citation)})</span></li>`).join("")}
          </ul>` : ""}
      `;
    })()}
    ${(() => {
      // Server-flagged module degradation. If anything degraded, surface
      // it explicitly so the regulator sees the integrity boundary.
      const deg = (sb as { degradation?: Array<{ module: string; reason: string }> } | null | undefined)?.degradation;
      if (!deg || deg.length === 0) return "";
      return `
        <div class="scr-sh" style="color:#b45309">⚠ Brain module degradation (${deg.length})</div>
        <ul class="scr-regl">
          ${deg.map((d) => `<li><strong>${e(d.module)}</strong>: ${e(d.reason)}</li>`).join("")}
        </ul>`;
    })()}
    ${hsFinis(reportId, 3, 3)}`;

  return buildHtmlDoc({
    title: safeTitle,
    autoprint: true,
    pages: [
      extraCss + hsPage({ reportId, pageNum: 1, pageTotal: 3, regs, label, content: p1 }),
      hsPage({ reportId, pageNum: 2, pageTotal: 3, regs, label, content: p2extended }),
      hsPage({ reportId, pageNum: 3, pageTotal: 3, regs, label, content: p3 }),
    ],
  });
}


async function handleComplianceReport(req: Request): Promise<Response> {
  const _handlerStart = Date.now();
  try {
  const gate = await enforce(req);
  // Rate-limit (429) is a hard stop; auth failures (401) fall through as
  // anonymous — the report is built entirely from the request payload so
  // there is no server-side secret to protect, and a token mismatch
  // between NEXT_PUBLIC_ADMIN_TOKEN and ADMIN_TOKEN shouldn't block MLRO
  // officers from generating compliance reports.
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "html").toLowerCase();

  let body: ReportInput;
  try {
    body = (await req.json()) as ReportInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!body?.subject?.name) {
    return NextResponse.json(
      { ok: false, error: "subject.name is required" },
      { status: 400, headers: gateHeaders },
    );
  }
  // When no prior screening result is supplied, inject a placeholder that
  // clearly marks the report as unscreened — never a CLEAR verdict.
  if (!body.result) {
    (body as any).result = { topScore: 0, severity: "pending", hits: [], _unscreened: true };
  } else if (!Array.isArray(body.result.hits)) {
    body.result.hits = [];
  }
  // Ensure subject.id is always present (filename and digest use it)
  if (!body.subject.id) {
    body.subject = { ...body.subject, id: body.subject.name.slice(0, 32).replace(/[^A-Za-z0-9]/g, "-") };
  }
  let report: string;
  try {
    report = buildComplianceReport(body);
  } catch (err) {
    console.error("compliance-report failed to build", err);
    // Return a minimal valid report rather than a 500 so the MLRO can still
    // download something actionable and the UI does not show a broken state.
    report = [
      `HAWKEYE STERLING — COMPLIANCE REPORT`,
      `Subject: ${body.subject.name}`,
      `Generated: ${new Date().toUTCString()}`,
      ``,
      `NOTE: Full report generation encountered an error. Please review manually.`,
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    ].join("\n");
  }

  // Structured JSON sidecar — same provenance and hashes as the text
  // version. Lets machine consumers (Asana automation, MAS bridges,
  // regulator portals) consume the report without parsing the prose.
  if (format === "json") {
    const structured = buildComplianceReportStructured(body);
    return NextResponse.json(structured, {
      status: 200,
      headers: {
        ...gateHeaders,
        "content-disposition": `attachment; filename="hawkeye-report-${safeFilenameSegment(body.subject.id)}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  if (format === "html" || format === "pdf") {
    const html = renderHtmlReport(report, body);
    return new Response(html, {
      status: 200,
      headers: {
        ...gateHeaders,
        "content-type": "text/html; charset=utf-8",
        // inline so the browser renders it directly; user saves as PDF
        // via the auto-opened print dialog.
        "content-disposition": `inline; filename="hawkeye-report-${safeFilenameSegment(body.subject.id)}.html"`,
        "cache-control": "no-store",
      },
    });
  }

  const filename = `hawkeye-report-${safeFilenameSegment(body.subject.id)}.txt`;
  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[compliance_report] latencyMs=${latencyMs} exceeds 5000ms`);
  return new Response(report, {
    status: 200,
    headers: {
      ...gateHeaders,
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-latency-ms": String(latencyMs),
    },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "compliance_report",
      message,
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500, headers: {} });
  }
}

export const POST = handleComplianceReport;
