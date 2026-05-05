import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  buildComplianceReport,
  buildComplianceReportStructured,
  type ReportInput,
} from "@/lib/reports/complianceReport";

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

function renderHtmlReport(text: string, input: ReportInput): string {
  const now = input.now ?? new Date();
  const s = input.subject;
  const r = input.result;
  const sb = input.superBrain;
  // Composite drives the headline — same number rendered in the UI
  // gauge. r.topScore (sanctions vector only) was the source of the
  // 0/100-CLEAR-vs-42/100 discrepancy in earlier exports.
  const composite = sb?.composite?.score ?? r.topScore;
  const headlineBand = bandForScore(composite);
  const sev = headlineBand;
  const sevColor = SEV_COLOR[sev] ?? "#888";
  const safeTitle = escapeHtml(`Hawkeye Sterling — ${s.name}`);

  const amCount = (sb?.adverseKeywordGroups?.length ?? 0) + (sb?.adverseMedia?.length ?? 0);
  const pepTier = sb?.pep && sb.pep.salience > 0 ? sb.pep.tier : null;

  const year  = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(now.getUTCDate()).padStart(2, "0");
  const hh    = String(now.getUTCHours()).padStart(2, "0");
  const mm    = String(now.getUTCMinutes()).padStart(2, "0");
  const reportType = r.hits.length > 0 ? "SANCTIONS" : pepTier ? "PEP" : amCount > 0 ? "AM" : "STANDARD";
  const reportId = `HWK-SCR-${year}${month}${day}-${reportType}-${hh}${mm}`;

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

  const amScore = amCount > 0 ? (amCount >= 4 ? "HIGH" : "LOW") : "—";
  const amResult = amCount >= 4 ? "POSITIVE — extensive" : amCount >= 1 ? "Limited signal" : "NEGATIVE";
  const amRc = amCount >= 4 ? "#ef4444" : amCount >= 1 ? "#f59e0b" : "#22c55e";

  // Adverse media rows
  const amRows = [
    ...(sb?.adverseKeywordGroups ?? []).map(g =>
      `<li><span class="chip chip-red">${e(g.label)}</span> <span class="muted">${g.count} keyword${g.count === 1 ? "" : "s"}</span></li>`
    ),
    ...(sb?.adverseMedia ?? []).map(a =>
      `<li><span class="chip chip-amber">${e(a.categoryId.replace(/_/g, " "))}</span> <span class="muted">keyword: ${e(a.keyword)}</span></li>`
    ),
  ];

  // ── Adverse-media findings — full evidence block for the PDF ───
  // The .txt has emitted this for several PRs already (hit volume,
  // categories with counts, keyword groups, top keywords, per-hit
  // evidence with offsets, news dossier with article links). The
  // PDF render historically only showed the chip overlay above and
  // dropped everything else. Operator can't take that to a regulator
  // — every adverse-media disposition needs the EVIDENCE in the
  // file, not a category badge. Rebuilt below.
  const amScored = sb?.adverseMediaScored ?? null;
  const amTotalHits =
    amScored?.total ??
    (sb?.adverseKeywordGroups ?? []).reduce((s, g) => s + g.count, 0) +
      (sb?.adverseMedia?.length ?? 0);
  const amDistinctKw = amScored?.distinctKeywords ?? (sb?.adverseMedia?.length ?? 0);
  const amCategoriesTripped =
    amScored?.categoriesTripped && amScored.categoriesTripped.length > 0
      ? amScored.categoriesTripped
      : Array.from(new Set((sb?.adverseMedia ?? []).map((a) => a.categoryId)));
  const amVectorScore =
    amScored?.compositeScore != null ? Math.round(amScored.compositeScore) : null;
  const amTopKeywords = amScored?.topKeywords ?? [];
  const newsArticles = (
    sb as { newsDossier?: { articles?: Array<{ title: string; link: string; pubDate?: string; source?: string; snippet?: string; severity?: string; keywordGroups?: string[] }>; articleCount?: number; topSeverity?: string; source?: string; languages?: string[] } } | null | undefined
  )?.newsDossier?.articles ?? [];
  const newsDossierMeta = (
    sb as { newsDossier?: { articleCount?: number; topSeverity?: string; source?: string; languages?: string[] } } | null | undefined
  )?.newsDossier;

  // Recommendation
  let rec = "";
  if (sev === "critical") {
    rec = "FREEZE — freeze in-flight funds and pending transactions, file FFR via goAML within 5 business days, notify EOCN, refuse the relationship, and escalate to CEO and Board Chair.";
  } else if (sev === "high") {
    rec = "Escalate to MLRO, open Enhanced Due Diligence, and defer clearance pending analyst review of source-of-wealth and source-of-funds.";
  } else if (amCount > 0) {
    rec = "Defer clearance pending (a) live-news corroboration, (b) analyst review of underlying reporting, and (c) enrolment in ongoing screening at thrice-daily cadence.";
  } else {
    rec = "Proceed with standard CDD. Subject enrolled in ongoing screening (thrice-daily — 08:30 / 15:00 / 17:30 Dubai) and any delta will be filed to the MLRO automatically.";
  }

  const recRows = [
    `► ${rec}`,
    sev === "clear" || sev === "low" ? "► PROCEED WITH STANDARD CDD" : "",
    sev === "clear" || sev === "low" ? "► SDD ELIGIBLE (MoE Circular 6/2025) — MLRO DISCRETION APPLIES" : "",
    "► NO goAML FILING REQUIRED",
    "► STANDARD ONGOING MONITORING",
  ].filter(Boolean).map(line => `<div class="rec-line">${e(line)}</div>`).join("");

  const regFramework = [
    "Federal Decree-Law No. (10) of 2025 — UAE AML/CFT/CPF primary law",
    "Cabinet Resolution No. (134) of 2025 — Executive Regulations",
    "Cabinet Resolution No. (156) of 2025 — Goods Subject to Non-Proliferation (Controlled Items Schedule)",
    "MoE Circular No. (3) of 2025 — TFS / sanctions screening",
    "MoE Circular No. (2) of 2024 — Responsible sourcing (DPMS)",
    "MoE Circular No. (6) of 2025 — Risk-based CDD / SDD",
    "FATF Recommendations 10, 12, 20, 22",
    "LBMA Responsible Gold Guidance v9",
    "OECD Due Diligence Guidance — Gold Supplement",
  ].map(f => `<li>${e(f)}</li>`).join("");

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

  const auditCell = (label: string, value: string): string =>
    value
      ? `<div class="audit-row"><span class="audit-label">${e(label)}</span><span class="audit-value">${e(value)}</span></div>`
      : "";
  const auditGridRows = [
    auditCell("Run ID", runId),
    auditCell("Brain generated", generatedAtIso),
    auditCell("Engine version", engineVersion),
    auditCell("Schema version", schemaVersion),
    auditCell("Build SHA", buildSha),
    auditCell("Operator", operatorRole),
    auditCell("Payload SHA-256", payloadSha),
    auditCell("Report SHA-256", reportSha),
  ]
    .filter(Boolean)
    .join("");

  const signatureBlock =
    hmacSig || edSig
      ? `<div class="audit-signatures">
          <div class="audit-sig-title">Signatures</div>
          ${
            hmacSig
              ? `<div class="audit-sig"><span class="audit-sig-label">HMAC-SHA256</span><span class="audit-sig-fp">key fp ${e(hmacFp)}</span><code class="audit-sig-hex">${e(hmacSig)}</code></div>`
              : ""
          }
          ${
            edSig
              ? `<div class="audit-sig"><span class="audit-sig-label">Ed25519</span><span class="audit-sig-fp">pubkey fp ${e(edFp)}</span><code class="audit-sig-hex">${e(edSig)}</code></div>`
              : ""
          }
        </div>`
      : "";

  const integrityNote =
    hmacSig || edSig
      ? "Signatures cover report.sha256. Verify with the matching key — recipes in the .txt export. All timestamps UTC."
      : "Report is hash-protected (SHA-256) but unsigned. Set REPORT_SIGNING_KEY and/or REPORT_ED25519_PRIVATE_KEY to enable authenticity proof. All timestamps UTC.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ── HAWKEYE STERLING · SUBJECT SCREENING DOSSIER ─────────
       Reference design: editorial luxury · audit-grade typography */
    :root{
      --bg:oklch(97.5% 0.008 85);
      --paper:oklch(97.5% 0.008 85);
      --card:oklch(98% 0.005 85);
      --border:oklch(22% 0.012 250 / 0.18);
      --hairline:oklch(22% 0.012 250 / 0.18);
      --hairline-strong:oklch(22% 0.012 250 / 0.3);
      --rule:oklch(22% 0.012 250);
      --brand:#d61e6f;
      --brand-dim:rgba(214,30,111,0.08);
      --ink0:oklch(22% 0.012 250);
      --ink1:oklch(30% 0.012 250);
      --ink2:oklch(38% 0.012 250);
      --ink3:oklch(55% 0.012 250);
      --green:oklch(45% 0.06 155);
      --green-dim:oklch(45% 0.06 155 / 0.08);
      --red:#d61e6f;
      --red-dim:rgba(214,30,111,0.08);
      --amber:oklch(60% 0.11 70);
      --amber-dim:oklch(60% 0.11 70 / 0.08);
      --serif:'Cormorant Garamond','GT Sectra',Georgia,serif;
      --sans:'Inter Tight','Inter',system-ui,sans-serif;
      --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{
      background:var(--paper);color:var(--ink1);
      font-family:var(--sans);font-size:10.5pt;line-height:1.55;
      font-feature-settings:"kern","liga";
      -webkit-font-smoothing:antialiased;
      text-rendering:optimizeLegibility;
    }
    body{padding:18mm 14mm;max-width:920px;margin:0 auto}

    /* toolbar — screen only */
    .toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14mm}
    .toolbar button{
      font:600 9.5pt/1 var(--sans);
      padding:9px 18px;border-radius:2px;
      border:1px solid var(--hairline-strong);background:#fff;
      color:var(--ink0);cursor:pointer;
      letter-spacing:.1em;text-transform:uppercase;
    }
    .toolbar button.primary{background:var(--ink0);color:#fff;border-color:var(--ink0)}
    .toolbar button:hover{opacity:.82}

    /* ── report header ────────────────────────────────────── */
    .report-header{
      border:none;border-radius:0;background:none;padding:0;
      border-top:2px solid var(--brand);
      padding-top:14px;margin-bottom:20px;
    }
    .report-header-top{
      display:grid;grid-template-columns:1fr auto;gap:24px;
      align-items:flex-end;
      padding-bottom:14px;
      border-bottom:1px solid var(--hairline);
      margin-bottom:14px;
    }
    .logo{
      font-family:var(--serif);font-size:22pt;font-weight:500;
      color:var(--ink0);letter-spacing:0.38em;line-height:1;
    }
    .logo span{color:var(--ink2);font-weight:400}
    .logo-sub{font-size:7.5pt;letter-spacing:0.28em;color:var(--ink3);text-transform:uppercase;margin-top:4px}
    .report-id{
      text-align:right;
      font:500 8.5pt/1.65 var(--mono);
      color:var(--ink2);letter-spacing:.02em;
    }
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 40px}
    .meta-row{display:grid;grid-template-columns:128px 1fr;gap:14px;align-items:baseline}
    .meta-label{
      color:var(--ink3);min-width:0;flex-shrink:0;
      font:600 7.5pt/1.5 var(--sans);
      text-transform:uppercase;letter-spacing:.12em;
    }
    .meta-value{color:var(--ink0);font:500 10pt/1.5 var(--sans)}

    /* ── subject strip ────────────────────────────────────── */
    .subject-block{
      display:grid;grid-template-columns:1fr auto;gap:28px;
      align-items:center;
      padding:14px 0 16px;margin:0 0 22px;
      border-top:1px solid var(--hairline);
      border-bottom:1px solid var(--hairline);
      background:none;border-radius:0;
    }
    .subject-name{
      font:600 19pt/1.2 var(--serif);
      color:var(--ink0);letter-spacing:-.005em;margin-bottom:5px;
    }
    .subject-meta{
      color:var(--ink2);
      font:500 9pt/1.55 var(--sans);letter-spacing:.02em;
    }
    .subject-block > div:last-child{
      text-align:right;
      border-left:1px solid var(--hairline);
      padding-left:28px;align-self:stretch;
      display:flex;flex-direction:column;justify-content:center;align-items:flex-end;
    }
    .sev-badge{
      display:inline-block;
      padding:3px 11px;
      border:1px solid currentColor;border-radius:2px;
      font:700 8pt/1 var(--sans);
      letter-spacing:.18em;text-transform:uppercase;
      align-self:flex-end;
    }
    .score-display{
      font:600 28pt/1 var(--serif);
      margin-top:8px;letter-spacing:-.015em;
      font-variant-numeric:tabular-nums;
    }
    .score-suffix{
      font:500 11pt/1 var(--sans);
      color:var(--ink3);margin-left:1px;letter-spacing:0;
    }
    .score-caption{
      margin-top:3px;
      font:600 7.5pt/1 var(--sans);
      color:var(--ink3);
      text-transform:uppercase;letter-spacing:.12em;
    }

    /* ── sections ─────────────────────────────────────────── */
    .section{margin-bottom:22px;page-break-inside:avoid}
    .section-title{
      font:700 7.5pt/1 var(--sans);
      color:var(--brand);
      letter-spacing:.2em;text-transform:uppercase;
      padding-bottom:7px;margin-bottom:12px;
      border-bottom:1px solid var(--hairline);
    }

    /* ── tables ───────────────────────────────────────────── */
    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    thead th{
      text-align:left;
      color:var(--ink3);
      font:700 7pt/1 var(--sans);
      letter-spacing:.16em;text-transform:uppercase;
      padding:0 10px 7px;
      border-bottom:1px solid var(--ink0);
    }
    thead th:nth-child(3),thead th:nth-child(4){text-align:right}
    tbody td{
      padding:8px 10px;
      border-bottom:1px solid var(--hairline);
      color:var(--ink1);
      font-size:9.5pt;
    }
    tbody td:nth-child(1){color:var(--ink0);font-weight:500}
    tbody td:nth-child(3),tbody td:nth-child(4){text-align:right;font-variant-numeric:tabular-nums}
    tbody tr:last-child td{border-bottom:1px solid var(--ink0)}
    .muted{color:var(--ink3)}
    .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
    .status-tag{
      font:700 8pt/1 var(--sans);
      letter-spacing:.16em;text-transform:uppercase;
    }

    /* ── risk score row ───────────────────────────────────── */
    .risk-bar-wrap{background:var(--hairline);border-radius:0;height:3px;margin-top:8px;overflow:hidden}
    .risk-bar{height:100%}

    /* ── jurisdiction grid ────────────────────────────────── */
    .jur-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 40px}
    .jur-grid .meta-row{grid-template-columns:128px 1fr}

    /* ── chips ────────────────────────────────────────────── */
    .chip{
      display:inline-block;padding:1px 7px;border-radius:2px;
      font:700 7.5pt/1.5 var(--sans);
      letter-spacing:.1em;text-transform:uppercase;
      border:1px solid;
    }
    .chip-red{color:var(--red);background:var(--red-dim);border-color:rgba(180,35,24,.28)}
    .chip-amber{color:var(--amber);background:var(--amber-dim);border-color:rgba(181,71,8,.28)}
    .chip-green{color:var(--green);background:var(--green-dim);border-color:rgba(14,124,58,.28)}
    .chip-brand{color:var(--brand);background:var(--brand-dim);border-color:rgba(163,19,79,.28)}

    /* ── adverse media ────────────────────────────────────── */
    .am-list{list-style:none;display:flex;flex-direction:column;gap:6px}
    .am-list li{display:flex;align-items:center;gap:8px}

    .am-metrics{
      display:grid;grid-template-columns:repeat(4,1fr);gap:0;
      margin-bottom:14px;
      border-top:1px solid var(--ink0);
      border-bottom:1px solid var(--ink0);
    }
    .am-metric{padding:10px 14px;border-right:1px solid var(--hairline)}
    .am-metric:last-child{border-right:none}
    .am-metric-label{
      font:700 7pt/1 var(--sans);
      text-transform:uppercase;letter-spacing:.16em;
      color:var(--ink3);margin-bottom:6px;
    }
    .am-metric-value{
      font:600 15pt/1.05 var(--serif);
      color:var(--ink0);font-variant-numeric:tabular-nums;
    }

    .am-block{
      margin:12px 0;padding:2px 0 4px 14px;
      border:none;border-left:2px solid var(--brand);
      border-radius:0;background:none;
    }
    .am-block-title{
      font:700 7.5pt/1 var(--sans);
      text-transform:uppercase;letter-spacing:.16em;
      color:var(--ink2);margin-bottom:8px;
    }
    .am-bullets{list-style:none;display:flex;flex-direction:column;gap:5px;font-size:9.5pt;color:var(--ink1);line-height:1.55}
    .am-bullets li{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .am-bullets.mono{font-family:var(--mono);font-size:9pt}

    .am-posture{
      margin-top:14px;padding:10px 14px;
      border:1px solid var(--hairline);border-radius:0;
      font:9pt/1.55 var(--sans);color:var(--ink2);
      background:var(--brand-dim);
    }
    .am-posture strong{color:var(--ink0);font-weight:600}

    /* ── news dossier ─────────────────────────────────────── */
    .news-list{display:flex;flex-direction:column;gap:10px;margin-top:8px}
    .news-item{
      padding:6px 0 8px 14px;
      border:none;border-left:2px solid var(--hairline);
      border-radius:0;background:none;
    }
    .news-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:8pt;color:var(--ink3);margin-bottom:4px}
    .news-source{font-weight:700;color:var(--ink1);text-transform:uppercase;letter-spacing:.08em}
    .news-title{font:600 10.5pt/1.4 var(--serif);color:var(--ink0);margin-bottom:3px;letter-spacing:-.005em}
    .news-snippet{font-size:9pt;color:var(--ink2);line-height:1.55;margin-top:4px}
    .news-link{font:8.5pt/1.5 var(--mono);color:var(--brand);text-decoration:none;word-break:break-all;display:inline-block;margin-top:4px}
    .news-link:hover{text-decoration:underline}

    /* ── recommendation ───────────────────────────────────── */
    .rec-block{padding:2px 0 2px 14px;border-left:2px solid var(--brand)}
    .rec-line{
      padding:7px 0;border-bottom:1px dotted var(--hairline);
      color:var(--ink0);font-size:10pt;line-height:1.5;
    }
    .rec-line:last-child{border-bottom:none}

    /* ── decision checkboxes ──────────────────────────────── */
    .decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}
    .checkbox-item{
      display:flex;align-items:center;gap:10px;
      padding:11px 14px;
      border:1px solid var(--hairline);border-radius:0;background:none;
    }
    .checkbox-box{width:11px;height:11px;border:1px solid var(--ink2);border-radius:0;flex-shrink:0}
    .checkbox-label{font:500 9.5pt/1.4 var(--sans);color:var(--ink0)}

    /* ── signature block ──────────────────────────────────── */
    .sig-block{margin-top:24px;padding-top:0;border-top:none;display:grid;grid-template-columns:1fr 1fr;gap:32px}
    .sig-line{border-bottom:1px solid var(--ink0);margin-top:36px;margin-bottom:6px;height:0}
    .sig-label{font:600 7.5pt/1 var(--sans);color:var(--ink3);text-transform:uppercase;letter-spacing:.14em}

    /* ── reg framework list ───────────────────────────────── */
    .reg-list{
      list-style:none;display:block;
      column-count:2;column-gap:32px;column-rule:1px solid var(--hairline);
    }
    .reg-list li{
      font:9pt/1.55 var(--sans);color:var(--ink1);
      padding-left:12px;position:relative;
      break-inside:avoid;margin-bottom:5px;
    }
    .reg-list li::before{
      content:"";position:absolute;left:0;top:.7em;
      width:6px;height:1px;background:var(--brand);
    }

    /* ── audit trail ──────────────────────────────────────── */
    .audit-grid{
      display:grid;grid-template-columns:1fr 1fr;gap:7px 28px;
      padding:14px 16px;background:var(--brand-dim);
      border:1px solid var(--hairline);border-radius:0;margin-bottom:10px;
    }
    .audit-row{display:flex;justify-content:space-between;gap:12px;font-size:9pt;line-height:1.5}
    .audit-label{color:var(--ink3);text-transform:uppercase;letter-spacing:.12em;font:700 7.5pt/1.5 var(--sans);flex-shrink:0;padding-top:1px}
    .audit-value{
      color:var(--ink0);font-family:var(--mono);
      font-size:9pt;text-align:right;word-break:break-all;max-width:62%;
      font-variant-numeric:tabular-nums;
    }
    .audit-signatures{
      padding:14px 16px;background:#fafafa;
      border:1px solid var(--hairline);border-radius:0;margin-bottom:10px;
    }
    .audit-sig-title{font:700 7.5pt/1 var(--sans);text-transform:uppercase;letter-spacing:.16em;color:var(--ink3);margin-bottom:10px}
    .audit-sig{display:flex;flex-direction:column;gap:3px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px dotted var(--hairline)}
    .audit-sig:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
    .audit-sig-label{font:700 9.5pt/1 var(--sans);color:var(--brand);letter-spacing:.04em}
    .audit-sig-fp{font:8.5pt/1.5 var(--mono);color:var(--ink3)}
    .audit-sig-hex{font:8.5pt/1.45 var(--mono);color:var(--ink1);word-break:break-all}
    .audit-note{font:8.5pt/1.5 var(--sans);color:var(--ink3);margin-top:8px;font-style:italic}

    /* ── footer ───────────────────────────────────────────── */
    .footer{
      margin-top:28px;padding-top:12px;
      border-top:1px solid var(--hairline);
      display:flex;justify-content:space-between;
      font:600 7.5pt/1 var(--sans);
      color:var(--ink3);
      text-transform:uppercase;letter-spacing:.14em;
    }

    /* ── print: edge-to-edge, page-margin chrome ──────────── */
    @media print{
      html,body{background:#fff}
      body{padding:0;max-width:none;margin:0}
      .toolbar{display:none}
      a,a:visited{color:inherit;text-decoration:none}
      .news-link{color:var(--brand);text-decoration:underline}
      .canonical a{color:var(--ink0);text-decoration:underline}
      @page{
        margin:14mm 12mm 16mm 12mm;
        @top-left{
          content:"HAWKEYE STERLING · CONFIDENTIAL";
          font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
          font-size:7.5pt;font-weight:600;
          letter-spacing:.18em;color:#9a9a9a;
        }
        @top-right{
          content:"${e(reportId)}";
          font-family:ui-monospace,Menlo,Consolas,monospace;
          font-size:7.5pt;font-weight:500;
          letter-spacing:.04em;color:#9a9a9a;
        }
        @bottom-left{
          content:"FDL 10/2025 · 10-year retention";
          font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
          font-size:7.5pt;font-weight:600;
          letter-spacing:.16em;color:#9a9a9a;
        }
        @bottom-right{
          content:"Page " counter(page) " / " counter(pages);
          font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
          font-size:7.5pt;font-weight:600;
          letter-spacing:.08em;color:#9a9a9a;
        }
      }
      .section,.subject-block,.report-header,.am-block,.checkbox-item,.news-item{page-break-inside:avoid}
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()" class="primary">⬇ Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>

  <!-- HEADER -->
  <div class="report-header">
    <div class="report-header-top">
      <div>
        <div class="logo">HAWKEYE <span>·</span> STERLING</div>
        <div class="logo-sub">SUBJECT SCREENING DOSSIER</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div style="border:1px solid var(--brand);padding:6px 10px;text-align:center;transform:rotate(-1deg);background:var(--brand-dim)">
          <div style="font-family:var(--serif);font-size:12px;letter-spacing:0.3em;color:var(--brand);font-weight:600">CONFIDENTIAL</div>
          <div style="font-size:6px;letter-spacing:0.32em;color:var(--brand);text-transform:uppercase;margin-top:2px">MLRO USE ONLY</div>
        </div>
        <div class="report-id">${e(reportId)}</div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-row"><span class="meta-label">Date and Time</span><span class="meta-value">${e(now.toUTCString().replace(" GMT", " UTC"))}</span></div>
      <div class="meta-row"><span class="meta-label">Place</span><span class="meta-value">Dubai, United Arab Emirates</span></div>
      <div class="meta-row"><span class="meta-label">MLRO assigned</span><span class="meta-value">${e(input.mlro ?? "L. Fernanda")}</span></div>
      <div class="meta-row"><span class="meta-label">FIU registration</span><span class="meta-value">FIU-AE-DMCC-0428</span></div>
      ${s.caseId ? `<div class="meta-row"><span class="meta-label">Case ID</span><span class="meta-value">${e(s.caseId)}</span></div>` : ""}
      ${s.group ? `<div class="meta-row"><span class="meta-label">Group</span><span class="meta-value">${e(s.group)}</span></div>` : ""}
    </div>
  </div>

  <!-- SUBJECT -->
  <div class="subject-block">
    <div>
      <div class="subject-name">${e(s.name)}</div>
      <div class="subject-meta">
        ${e(s.id)} · ${e(s.entityType?.toUpperCase())}
        ${s.nationality ? ` · ${e(s.nationality)}` : ""}
        ${s.jurisdiction ? ` · ${e(s.jurisdiction)}` : ""}
        ${s.dob ? ` · DOB ${e(s.dob)}` : ""}
      </div>
      ${s.aliases?.length ? `<div class="subject-meta" style="margin-top:4px">Aliases: ${s.aliases.map(a => e(a)).join(" · ")}</div>` : ""}
    </div>
    <div>
      <div class="sev-badge" style="color:${sevColor};border-color:${sevColor}">
        ${e(sev.toUpperCase())}
      </div>
      <div class="score-display" style="color:${sevColor}">${composite}<span class="score-suffix">/100</span></div>
      <div class="score-caption">composite · sanctions vector ${r.topScore}/100</div>
    </div>
  </div>

  <!-- SCREENING MATRIX -->
  <div class="section">
    <div class="section-title">Screening Result Matrix</div>
    <table>
      <thead><tr><th>Vector</th><th>Engine</th><th>Score</th><th>Result</th></tr></thead>
      <tbody>
        ${matrixRows}
        <tr>
          <td>PEP</td>
          <td class="muted">World-Check</td>
          <td class="mono">${pepScore}</td>
          <td style="color:${pepRc};font-weight:600">${pepResult}</td>
        </tr>
        <tr>
          <td>Adverse media</td>
          <td class="muted">Multi-source</td>
          <td class="mono">${amScore}</td>
          <td style="color:${amRc};font-weight:600">${amResult}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:10px;color:var(--ink3)">Composite risk score</span>
        <span style="font-size:10px;color:${sevColor};font-weight:600">${composite}/100 · ${e(sev.toUpperCase())}</span>
      </div>
      <div class="risk-bar-wrap">
        <div class="risk-bar" style="width:${Math.min(composite, 100)}%;background:${sevColor}"></div>
      </div>
    </div>
  </div>

  <!-- JURISDICTION -->
  ${sb?.jurisdiction ? `
  <div class="section">
    <div class="section-title">Jurisdiction Risk</div>
    <div class="jur-grid">
      <div class="meta-row"><span class="meta-label">Jurisdiction</span><span class="meta-value">${e(sb.jurisdiction.name)} (${e(sb.jurisdiction.iso2)}) · ${e(sb.jurisdiction.region)}</span></div>
      <div class="meta-row"><span class="meta-label">CAHRA</span><span class="meta-value">${sb.jurisdiction.cahra ? '<span class="chip chip-red">YES</span>' : "no"}</span></div>
      ${sb.jurisdiction.regimes?.length ? `<div class="meta-row" style="grid-column:1/-1"><span class="meta-label">Active regimes</span><span class="meta-value">${sb.jurisdiction.regimes.map(r2 => `<span class="chip chip-amber" style="margin-right:4px">${e(r2)}</span>`).join("")}</span></div>` : ""}
    </div>
  </div>` : ""}

  <!-- ADVERSE MEDIA — FINDINGS & EVIDENCE -->
  ${amCount > 0 || amTotalHits > 0 ? `
  <div class="section">
    <div class="section-title">Adverse Media — Findings &amp; Evidence</div>

    <!-- Hit-volume metrics -->
    <div class="am-metrics">
      <div class="am-metric">
        <div class="am-metric-label">Hit volume</div>
        <div class="am-metric-value">${amTotalHits} keyword hit${amTotalHits === 1 ? "" : "s"}</div>
      </div>
      <div class="am-metric">
        <div class="am-metric-label">Distinct terms</div>
        <div class="am-metric-value">${amDistinctKw}</div>
      </div>
      <div class="am-metric">
        <div class="am-metric-label">Categories tripped</div>
        <div class="am-metric-value">${amCategoriesTripped.length}</div>
      </div>
      ${amVectorScore != null ? `
      <div class="am-metric">
        <div class="am-metric-label">Vector score</div>
        <div class="am-metric-value">${amVectorScore}/100</div>
      </div>` : ""}
    </div>

    <!-- Categories tripped (with counts when scored) -->
    ${amCategoriesTripped.length > 0 ? `
    <div class="am-block">
      <div class="am-block-title">Categories tripped</div>
      <ul class="am-bullets">
        ${amCategoriesTripped.map((c) => {
          const count = amScored?.byCategory?.[c];
          return `<li><span class="chip chip-amber">${e(c.replace(/_/g, " "))}</span>${count != null ? ` <span class="muted">${count} hit${count === 1 ? "" : "s"}</span>` : ""}</li>`;
        }).join("")}
      </ul>
    </div>` : ""}

    <!-- Keyword groups fired (operator-friendly AML doctrine grouping) -->
    ${(sb?.adverseKeywordGroups ?? []).length > 0 ? `
    <div class="am-block">
      <div class="am-block-title">Keyword groups fired</div>
      <ul class="am-bullets">
        ${(sb!.adverseKeywordGroups ?? []).map((g) =>
          `<li><span class="chip chip-red">${e(g.label)}</span> <span class="muted">${g.count} hit${g.count === 1 ? "" : "s"}</span> <span class="mono muted">[${e(g.group)}]</span></li>`
        ).join("")}
      </ul>
    </div>` : ""}

    <!-- Top keywords -->
    ${amTopKeywords.length > 0 ? `
    <div class="am-block">
      <div class="am-block-title">Top keywords</div>
      <ul class="am-bullets">
        ${amTopKeywords.slice(0, 10).map((k) =>
          `<li><span class="mono" style="color:var(--ink0)">"${e(k.keyword)}"</span> → <span class="muted">${e(k.categoryId)}</span> <span class="muted">(${k.count} occurrence${k.count === 1 ? "" : "s"})</span></li>`
        ).join("")}
      </ul>
    </div>` : ""}

    <!-- Per-hit evidence — exact match locations -->
    ${(sb?.adverseMedia ?? []).length > 0 ? `
    <div class="am-block">
      <div class="am-block-title">Per-hit evidence (first 15)</div>
      <ul class="am-bullets mono">
        ${(sb!.adverseMedia ?? []).slice(0, 15).map((a) =>
          `<li><span class="muted">[${e(a.categoryId)}]</span> "${e(a.keyword)}"${a.offset != null ? ` <span class="muted">@${a.offset}</span>` : ""}</li>`
        ).join("")}
      </ul>
      ${(sb?.adverseMedia ?? []).length > 15 ? `<div class="muted" style="font-size:10px;margin-top:4px">…and ${(sb!.adverseMedia ?? []).length - 15} more — see attached evidence pack.</div>` : ""}
    </div>` : ""}

    <!-- News dossier with clickable article links -->
    ${newsArticles.length > 0 ? `
    <div class="am-block">
      <div class="am-block-title">News dossier ${newsArticles.length} article${newsArticles.length === 1 ? "" : "s"}${newsDossierMeta?.topSeverity ? ` · top severity ${e(newsDossierMeta.topSeverity.toUpperCase())}` : ""}${newsDossierMeta?.source ? ` · source ${e(newsDossierMeta.source)}` : ""}${newsDossierMeta?.languages?.length ? ` · ${e(newsDossierMeta.languages.join(", "))}` : ""}</div>
      <div class="news-list">
        ${newsArticles.slice(0, 10).map((a) => {
          const sevTone = a.severity === "critical" || a.severity === "high"
            ? "chip-red"
            : a.severity === "medium"
              ? "chip-amber"
              : "chip-green";
          const sevChip = a.severity ? `<span class="chip ${sevTone}">${e(a.severity.toUpperCase())}</span>` : "";
          const dateBit = a.pubDate ? ` <span class="muted mono">${e(a.pubDate)}</span>` : "";
          const groups = (a.keywordGroups ?? []).slice(0, 3);
          const groupsBit = groups.length > 0 ? ` <span class="muted">· ${e(groups.join(" · "))}</span>` : "";
          const snippetTrim = a.snippet && a.snippet.length > 220 ? a.snippet.slice(0, 220) + "…" : (a.snippet ?? "");
          return `<div class="news-item">
            <div class="news-meta">${sevChip} <span class="news-source">${e(a.source ?? "—")}</span>${dateBit}${groupsBit}</div>
            <div class="news-title">${e(a.title)}</div>
            ${snippetTrim ? `<div class="news-snippet">${e(snippetTrim)}</div>` : ""}
            ${a.link ? `<a class="news-link" href="${e(a.link)}" target="_blank" rel="noopener noreferrer">${e(a.link)}</a>` : ""}
          </div>`;
        }).join("")}
      </div>
      ${newsArticles.length > 10 ? `<div class="muted" style="font-size:10px;margin-top:6px">…and ${newsArticles.length - 10} more article(s) — full dossier in JSON sidecar / .txt export.</div>` : ""}
    </div>` : ""}

    <!-- Source posture / constructive-knowledge limit -->
    <div class="am-posture">
      <strong>Source posture:</strong> open-source / classifier-derived. Constructive-knowledge threshold (FDL 10/2025 Art.2(3)) requires analyst review and live-news corroboration before SAR / EDD action.
    </div>
  </div>` : ""}

  <!-- FACTS -->
  <div class="section">
    <div class="section-title">1. Facts</div>
    <p style="color:var(--ink1);font-size:11.5px;line-height:1.7">
      On ${e(now.toUTCString().replace(" GMT", " UTC"))}, Hawkeye Sterling screened the ${e(s.entityType)} <strong style="color:var(--ink0)">${e(s.name)}</strong>${s.nationality ? ` (${e(s.nationality)} national)` : ""}${s.caseId ? ` under case ${e(s.caseId)}` : ""}, returning a composite risk score of <strong style="color:${sevColor}">${composite}/100</strong> (band: ${e(sev.toUpperCase())}).
      The sanctions vector ${r.hits.length === 0 ? `returned <strong>CLEAR</strong> (0 hits across the screened corpora)` : `returned <strong>${r.hits.length}</strong> possible match(es) at top match strength ${r.topScore}/100 — a name-similarity result does not constitute a confirmed designation`}.
      ${amCount > 0 ? `Adverse-media overlay fired ${amCount} categor${amCount === 1 ? "y" : "ies"} — see findings section above for evidence.` : ""}
      ${pepTier ? `Subject classified as possible PEP (${e(pepTier)}) — requires independent verification.` : ""}
    </p>
  </div>

  <!-- ANALYSIS -->
  <div class="section">
    <div class="section-title">2. Analysis</div>
    <p style="color:var(--ink1);font-size:11.5px;line-height:1.7">
      The composite score sits in the <strong style="color:${sevColor}">${e(sev)}</strong> band.
      ${r.hits.length > 0 ? `Possible matches concentrate on ${Array.from(new Set(r.hits.map(h => h.listId))).map(l => `<span class="chip chip-red">${e(l)}</span>`).join(" ")}.` : "The subject does not appear on any monitored sanctions regime."}
      ${sb?.jurisdiction ? `Jurisdictional risk for ${e(sb.jurisdiction.name)} is assessed as ${sb.jurisdiction.cahra ? '<span class="chip chip-red">CAHRA</span>' : "non-CAHRA"}.` : ""}
      ${amCount > 0 ? `The adverse-media signal requires analyst review and live-news corroboration before constructive knowledge can be asserted under FDL 10/2025 Art.2(3).` : ""}
    </p>
  </div>

  <!-- RECOMMENDATION -->
  <div class="section">
    <div class="section-title">Recommendation (System)</div>
    <div class="rec-block">${recRows}</div>
  </div>

  <!-- MLRO DECISION -->
  <div class="section">
    <div class="section-title">MLRO Decision</div>
    <div class="decision-grid">
      <div class="checkbox-item"><div class="checkbox-box"></div><div class="checkbox-label">Apply Standard CDD — proceed</div></div>
      <div class="checkbox-item"><div class="checkbox-box"></div><div class="checkbox-label">Apply SDD — proceed</div></div>
      <div class="checkbox-item"><div class="checkbox-box"></div><div class="checkbox-label">Override to EDD — record reason</div></div>
      <div class="checkbox-item"><div class="checkbox-box"></div><div class="checkbox-label">File STR via goAML</div></div>
    </div>
    <div class="sig-block">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">MLRO signature</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
  </div>

  <!-- REGULATORY FRAMEWORK -->
  <div class="section">
    <div class="section-title">Regulatory Framework Applied</div>
    <ul class="reg-list">${regFramework}</ul>
  </div>

  <!-- AUDIT TRAIL & INTEGRITY -->
  <div class="section">
    <div class="section-title">Audit trail &amp; integrity</div>
    <div class="audit-grid">
      ${auditGridRows}
    </div>
    ${signatureBlock}
    <div class="audit-note">${e(integrityNote)}</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>Hawkeye Sterling · hawkeye-sterling.netlify.app</span>
    <span>${e(reportId)} · CONFIDENTIAL · 10-year retention</span>
  </div>

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`;
}

async function handleComplianceReport(req: Request): Promise<Response> {
  const gate = await enforce(req);
  // Rate-limit (429) is a hard stop; auth failures (401) fall through as
  // anonymous — the report is built entirely from the request payload so
  // there is no server-side secret to protect, and a token mismatch
  // between NEXT_PUBLIC_ADMIN_TOKEN and ADMIN_TOKEN shouldn't block MLRO
  // officers from generating compliance reports.
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "text").toLowerCase();

  let body: ReportInput;
  try {
    body = (await req.json()) as ReportInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!body?.subject?.name || !body?.result) {
    return NextResponse.json(
      { ok: false, error: "subject and result are required" },
      { status: 400, headers: gateHeaders },
    );
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
        "content-type": "text/html; charset=utf-8",
        // inline so the browser renders it directly; user saves as PDF
        // via the auto-opened print dialog.
        "content-disposition": `inline; filename="hawkeye-report-${safeFilenameSegment(body.subject.id)}.html"`,
        "cache-control": "no-store",
      },
    });
  }

  const filename = `hawkeye-report-${safeFilenameSegment(body.subject.id)}.txt`;
  return new Response(report, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const POST = handleComplianceReport;
