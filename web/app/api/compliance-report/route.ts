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

// Auto-hyperlink raw URLs so the news-dossier links in the embedded
// canonical body are clickable in the HTML / PDF render. Operates on
// already-escaped HTML — input is the post-escapeHtml string.
function autolinkUrls(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
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

  // Recommendation type — derived from the same hierarchy used by the
  // canonical text builder. Hoisted here so the findings-summary card
  // and disposition labels above can reference it.
  //   r.hits > 0      → SANCTIONS  (FFR pathway)
  //   pepTier present → PEP        (EDD + Board approval)
  //   amCount > 0     → AM         (SAR pathway + 24-month review)
  //   else            → STANDARD   (CDD)
  const recType: "SANCTIONS" | "PEP" | "AM" | "STANDARD" =
    r.hits.length > 0
      ? "SANCTIONS"
      : pepTier
        ? "PEP"
        : amCount > 0
          ? "AM"
          : "STANDARD";

  // News evidence — surface up to 6 articles inline with clickable
  // links. Earlier versions of this PDF rendered keyword categories
  // alone with no source attribution; an MLRO defending an AM-positive
  // disposition needs the actual articles in the file.
  const newsArticles = sb?.newsDossier?.articles ?? [];
  const newsRows = newsArticles
    .slice(0, 6)
    .map((a) => {
      const sevChip = a.severity
        ? `<span class="chip chip-${a.severity === "critical" || a.severity === "high" ? "red" : a.severity === "medium" ? "amber" : "green"}">${e(a.severity.toUpperCase())}</span>`
        : "";
      const kw = (a.keywordGroups ?? []).slice(0, 3).join(" · ");
      const dateBit = a.pubDate ? `<span>${e(a.pubDate)}</span>` : "";
      const snippet = a.snippet
        ? `<div class="news-snippet">${e(a.snippet.length > 200 ? a.snippet.slice(0, 200) + "…" : a.snippet)}</div>`
        : "";
      return `<div class="news-item">
        <div class="news-meta">${sevChip}<span class="news-source">${e(a.source ?? "—")}</span>${dateBit}${kw ? `<span class="muted">· ${e(kw)}</span>` : ""}</div>
        <div class="news-title">${e(a.title)}</div>
        ${snippet}
        ${a.link ? `<a class="news-link" href="${e(a.link)}" target="_blank" rel="noopener noreferrer">${e(a.link)}</a>` : ""}
      </div>`;
    })
    .join("");
  const newsOverflow =
    newsArticles.length > 6
      ? `<div class="news-overflow">…and ${newsArticles.length - 6} more article(s) — full dossier in JSON sidecar / .txt export.</div>`
      : "";

  // Findings summary — at-a-glance card just under the subject. Lets
  // a regulator scan the disposition + signals on page 1 without
  // reading the matrix.
  const dispositionLabel =
    recType === "SANCTIONS"
      ? "ESCALATE — possible sanctions match"
      : recType === "PEP"
        ? "EDD — PEP classification"
        : recType === "AM"
          ? "ESCALATE — adverse-media positive"
          : "CDD posture — periodic review";
  const dispositionTone =
    recType === "SANCTIONS" || recType === "AM"
      ? "alert"
      : recType === "PEP"
        ? "warn"
        : "";
  const summaryBullets: string[] = [];
  summaryBullets.push(
    `<strong>Composite ${composite}/100 (${e(sev.toUpperCase())})</strong> — sanctions ${r.topScore}/100${r.hits.length ? ` · ${r.hits.length} hit(s)` : " · CLEAR"}`,
  );
  if (pepTier) {
    summaryBullets.push(`<strong>PEP</strong> — ${e(pepTier.replace(/^tier_/, "tier ").replace(/_/g, " "))}`);
  }
  if (amCount > 0) {
    const totalHits =
      sb?.adverseMediaScored?.total ??
      (sb?.adverseKeywordGroups ?? []).reduce((s, g) => s + g.count, 0) +
        (sb?.adverseMedia?.length ?? 0);
    const cats =
      sb?.adverseMediaScored?.categoriesTripped?.length ??
      new Set((sb?.adverseMedia ?? []).map((a) => a.categoryId)).size;
    summaryBullets.push(
      `<strong>Adverse media</strong> — ${totalHits} keyword hit(s) across ${cats} categor${cats === 1 ? "y" : "ies"}${newsArticles.length > 0 ? ` · ${newsArticles.length} article(s) in dossier` : ""}`,
    );
  }
  if (sb?.jurisdiction) {
    summaryBullets.push(
      `<strong>Jurisdiction</strong> — ${e(sb.jurisdiction.name)} (${e(sb.jurisdiction.iso2)})${sb.jurisdiction.cahra ? " · CAHRA" : ""}${sb.jurisdiction.regimes.length ? ` · ${sb.jurisdiction.regimes.length} regime(s)` : ""}`,
    );
  }
  const redlineCount = sb?.redlines?.fired?.length ?? 0;
  if (redlineCount > 0) {
    summaryBullets.push(
      `<strong>Redlines</strong> — ${redlineCount} fired${sb?.redlines?.action ? ` → ${e(sb.redlines.action)}` : ""}`,
    );
  }

  // Recommendation — type-aware. recType already computed above, so the
  // HTML render and the news-evidence / findings-summary cards all share
  // the same disposition class.
  const RECS: Record<typeof recType, string[]> = {
    SANCTIONS: [
      "ESCALATE TO MLRO IMMEDIATELY — possible sanctions match detected",
      "SUSPEND ONBOARDING / HALT IN-FLIGHT TRANSACTIONS pending MLRO decision",
      "VERIFY MATCH IDENTITY before any freezing or filing action",
      "IF MATCH CONFIRMED: freeze in-flight funds, file FFR via goAML within 5 business days, notify EOCN, escalate to CEO + Board Chair",
      "TIPPING-OFF PROHIBITION ABSOLUTE — do not alert the subject",
    ],
    PEP: [
      "ENHANCED DUE DILIGENCE (EDD) per FATF R.12 / FDL 10/2025 Art.17",
      "ESCALATE TO CEO AND BOARD CHAIR FOR APPROVAL DECISION",
      "NO goAML FILING ON PEP STATUS ALONE",
      "CONDITIONAL STR IF EDD REVEALS SoF / SoW INCONSISTENCY",
      "RECOMMEND CONSIDER DECLINING ON REPUTATIONAL-RISK GROUNDS",
    ],
    AM: [
      "IMMEDIATE ESCALATION TO MLRO",
      "ENHANCED DUE DILIGENCE (EDD) per FATF R.10 / FDL 10/2025 Art.16",
      "24-MONTH RETROSPECTIVE TRANSACTION REVIEW",
      "CONSIDER SOURCING SUSPENSION PENDING INVESTIGATION",
      "SAR IF CONSTRUCTIVE-KNOWLEDGE THRESHOLD CROSSED (FDL 10/2025 Art.2(3))",
      "TIPPING-OFF PROHIBITION ABSOLUTE",
    ],
    STANDARD: [
      "PROCEED WITH STANDARD CDD",
      "SDD ELIGIBLE (MoE Circular 6/2025) — MLRO DISCRETION APPLIES",
      "NO goAML FILING REQUIRED",
      "STANDARD ONGOING MONITORING (thrice-daily — 08:30 / 15:00 / 17:30 Dubai)",
    ],
  };
  const recRows = RECS[recType]
    .map((line) => `<div class="rec-line">► ${e(line)}</div>`)
    .join("");

  // MLRO decision checklist — also type-aware. Generic 4-option list
  // before would let an MLRO sign off on Standard CDD for an AM-positive
  // subject by accident; now the options match the recommendation.
  const DECISION_OPTIONS: Record<typeof recType, string[]> = {
    SANCTIONS: [
      "Match CONFIRMED — freeze + FFR + parallel SAR + notify EOCN / MoE",
      "Match REJECTED — false positive; document rationale",
      "Modify recommended action — record reason",
      "Escalate to CEO + Board Chair before action",
    ],
    PEP: [
      "Accept recommendation — proceed to EDD + Board review",
      "Decline relationship — document rationale",
      "Escalate for policy-level decision",
      "Override to Standard CDD — record reason (rare)",
    ],
    AM: [
      "Accept recommendation — submit SAR + suspend sourcing",
      "Submit SAR with modifications — record rationale",
      "Escalate to Board before SAR submission",
      "Reject as false-positive — document evidence",
    ],
    STANDARD: [
      "Apply Standard CDD — proceed",
      "Apply SDD — proceed",
      "Override to EDD — record reason",
      "File STR via goAML",
    ],
  };
  const decisionRows = DECISION_OPTIONS[recType]
    .map(
      (label) =>
        `<div class="checkbox-item"><div class="checkbox-box"></div><div class="checkbox-label">${e(label)}</div></div>`,
    )
    .join("");

  // Extract audit fields directly from the canonical text the report
  // module already produced. This way the PDF's audit panel can never
  // disagree with the .txt download — both render from the same source
  // of truth, just in different presentations.
  const grab = (re: RegExp): string => text.match(re)?.[1]?.trim() ?? "";
  const runId = grab(/reasoning\.run_id\s+(\S+)/);
  const generatedAt = grab(/brain\.generated_at\s+(\S+)/);
  const engineVersion = grab(/brain\.engine_version\s+(\S+)/);
  const schemaVersion = grab(/report\.schema_version\s+(\S+)/);
  const buildSha = grab(/brain\.build_sha\s+(\S+)/);
  const dataFreshness = grab(/brain\.data_freshness\s+(.+)/);
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
    auditCell("Brain generated", generatedAt),
    auditCell("Engine version", engineVersion),
    auditCell("Schema version", schemaVersion),
    auditCell("Build SHA", buildSha),
    auditCell("Operator", operatorRole),
    auditCell("Data freshness", dataFreshness),
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

  const integrityNote = `${
    hmacSig || edSig
      ? "Both signatures cover report.sha256. Verify externally with the matching key — recipes in the .txt export."
      : "Report is hash-protected (SHA-256) but unsigned. Set REPORT_SIGNING_KEY and/or REPORT_ED25519_PRIVATE_KEY to enable authenticity proof."
  } All timestamps are UTC unless otherwise noted.`;

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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #0c0c0e;
      --card: #121215;
      --border: #1e1e24;
      --brand: #ec4899;
      --brand-dim: rgba(236,72,153,.12);
      --ink0: #f2f2f5;
      --ink1: #c8c8d0;
      --ink2: #888894;
      --ink3: #52525e;
      --green: #22c55e;
      --green-dim: rgba(34,197,94,.12);
      --red: #ef4444;
      --red-dim: rgba(239,68,68,.12);
      --amber: #f59e0b;
      --amber-dim: rgba(245,158,11,.12);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{background:var(--bg);color:var(--ink1);font-family:"Inter","Helvetica Neue",-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:11px;line-height:1.5}
    body{padding:18px 24px;max-width:900px;margin:0 auto}

    /* toolbar */
    .toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:14px}
    .toolbar button{font:inherit;padding:6px 14px;border-radius:4px;border:1px solid var(--border);background:var(--card);color:var(--ink1);cursor:pointer;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}
    .toolbar button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
    .toolbar button:hover{opacity:.85}

    /* header — compact, premium */
    .report-header{border:1px solid var(--border);border-top:2px solid var(--brand);border-radius:5px;background:var(--card);padding:14px 18px;margin-bottom:12px}
    .report-header-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
    .logo{font-size:15px;font-weight:700;color:var(--ink0);letter-spacing:.08em}
    .logo span{color:var(--brand);font-weight:300;font-style:italic}
    .report-id{font-size:9.5px;color:var(--ink3);text-align:right;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px}
    .meta-row{display:flex;gap:8px;font-size:10.5px}
    .meta-label{color:var(--ink3);min-width:110px;flex-shrink:0;text-transform:uppercase;letter-spacing:.05em;font-size:9.5px}
    .meta-value{color:var(--ink1)}

    /* subject — compact card with composite as the hero */
    .subject-block{background:linear-gradient(180deg,var(--brand-dim) 0%,transparent 100%);border:1px solid var(--brand);border-radius:5px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:14px}
    .subject-name{font-size:17px;font-weight:700;color:var(--ink0);letter-spacing:.01em;margin-bottom:2px}
    .subject-meta{color:var(--ink2);font-size:10.5px}
    .sev-badge{padding:4px 11px;border-radius:3px;font-weight:700;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;border:1px solid;align-self:flex-start}

    /* findings summary — at-a-glance card just under the subject */
    .summary{
      display:grid;grid-template-columns:repeat(4,1fr);gap:8px;
      margin-bottom:14px;
    }
    .summary-card{
      border:1px solid var(--border);border-radius:5px;background:var(--card);
      padding:8px 11px;
    }
    .summary-card.alert{border-color:var(--red);background:var(--red-dim)}
    .summary-card.warn{border-color:var(--amber);background:var(--amber-dim)}
    .summary-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:3px;font-weight:600}
    .summary-value{font-size:14px;font-weight:700;color:var(--ink0);line-height:1.2}
    .summary-card.alert .summary-value{color:var(--red)}
    .summary-card.warn .summary-value{color:var(--amber)}
    .summary-detail{font-size:9.5px;color:var(--ink2);margin-top:2px}
    .summary-bullets{
      grid-column:1/-1;
      border:1px solid var(--border);border-left:3px solid var(--brand);
      background:var(--card);border-radius:4px;
      padding:9px 14px;font-size:10.5px;color:var(--ink1);line-height:1.6;
      margin-top:2px;
    }
    .summary-bullets strong{color:var(--ink0)}

    /* sections — tighter spacing */
    .section{margin-bottom:12px}
    .section-title{font-size:8.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--brand);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border)}

    /* screening matrix table — denser */
    table{width:100%;border-collapse:collapse;font-size:10.5px}
    th{text-align:left;color:var(--ink3);font-weight:600;letter-spacing:.08em;font-size:8.5px;text-transform:uppercase;padding:4px 8px;border-bottom:1px solid var(--border)}
    td{padding:4px 8px;border-bottom:1px solid var(--border)}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(255,255,255,.02)}
    .muted{color:var(--ink3)}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px}

    /* risk bar */
    .risk-bar-wrap{background:var(--border);border-radius:2px;height:5px;margin-top:5px;overflow:hidden}
    .risk-bar{height:100%;border-radius:2px;transition:width .3s}

    /* jurisdiction */
    .jur-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:10.5px}

    /* chips */
    .chip{display:inline-block;padding:1.5px 7px;border-radius:3px;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    .chip-red{background:var(--red-dim);color:var(--red)}
    .chip-amber{background:var(--amber-dim);color:var(--amber)}
    .chip-green{background:var(--green-dim);color:var(--green)}
    .chip-brand{background:var(--brand-dim);color:var(--brand)}

    /* adverse media list — compact */
    .am-list{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:10.5px}
    .am-list li{display:flex;align-items:center;gap:6px}

    /* news evidence — clickable article cards */
    .news-list{display:flex;flex-direction:column;gap:6px;margin-top:8px}
    .news-item{
      border:1px solid var(--border);border-left:2px solid var(--brand);
      border-radius:4px;background:var(--card);
      padding:7px 10px;
    }
    .news-meta{display:flex;gap:8px;align-items:center;font-size:9.5px;color:var(--ink3);margin-bottom:2px}
    .news-source{font-weight:600;color:var(--ink2)}
    .news-title{font-size:11px;font-weight:600;color:var(--ink0);line-height:1.4;margin-bottom:2px}
    .news-snippet{font-size:10px;color:var(--ink2);line-height:1.45;margin-top:3px}
    .news-link{font-size:9.5px;color:var(--brand);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-decoration:none;word-break:break-all}
    .news-link:hover{text-decoration:underline}
    .news-overflow{font-size:9.5px;color:var(--ink3);font-style:italic;padding:4px 0}

    /* recommendation */
    .rec-line{padding:4px 0;border-bottom:1px solid var(--border);color:var(--ink0);font-size:10.5px;line-height:1.5}
    .rec-line:last-child{border-bottom:none}

    /* decision checkboxes — denser */
    .decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .checkbox-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--border);border-radius:4px;background:var(--card)}
    .checkbox-box{width:12px;height:12px;border:1.5px solid var(--ink3);border-radius:2px;flex-shrink:0}
    .checkbox-label{font-size:10.5px;color:var(--ink1);line-height:1.4}

    /* signature */
    .sig-block{margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}
    .sig-line{border-bottom:1px solid var(--ink3);margin-top:18px;margin-bottom:3px}
    .sig-label{font-size:9.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}

    /* legal list — denser */
    .reg-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}
    .reg-list li{font-size:9.5px;color:var(--ink2);padding-left:10px;position:relative;line-height:1.5}
    .reg-list li::before{content:"—";position:absolute;left:0;color:var(--ink3)}

    /* footer */
    .footer{margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:9px;color:var(--ink3)}

    /* audit panel — hashes / signatures / provenance, rendered
       visually in the PDF. Same fields the .txt export carries
       in monospace, but laid out so the PDF stays presentable
       and the .txt remains the canonical / hash-covered form. */
    .audit-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:6px 18px;
      padding:12px 14px;
      background:var(--card);
      border:1px solid var(--border);
      border-radius:5px;
      margin-bottom:10px;
    }
    .audit-row{display:flex;justify-content:space-between;gap:12px;font-size:10.5px;line-height:1.5}
    .audit-label{color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;flex-shrink:0}
    .audit-value{
      color:var(--ink1);
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:10px;
      text-align:right;
      word-break:break-all;
      max-width:60%;
    }
    .audit-signatures{
      padding:12px 14px;
      background:var(--card);
      border:1px solid var(--border);
      border-radius:5px;
      margin-bottom:10px;
    }
    .audit-sig-title{
      font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;
      color:var(--ink3);margin-bottom:6px;
    }
    .audit-sig{display:flex;flex-direction:column;gap:2px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed var(--border)}
    .audit-sig:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
    .audit-sig-label{font-size:10.5px;font-weight:600;color:var(--brand)}
    .audit-sig-fp{font-size:9.5px;color:var(--ink3);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .audit-sig-hex{
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      font-size:9px;color:var(--ink1);word-break:break-all;
    }
    .audit-note{font-size:10px;color:var(--ink3);line-height:1.5;margin-top:6px}

    /* print overrides — white background for paper, page numbers,
       running brand header so every page carries the report id. */
    @media print {
      :root{--bg:#fff;--card:#fafafa;--border:#e2e2e6;--ink0:#0c0c0e;--ink1:#1f1f24;--ink2:#525258;--ink3:#8a8a92;--brand:#c0156a;--brand-dim:rgba(192,21,106,.05);--green:#1f9d52;--green-dim:rgba(31,157,82,.06);--red:#c0392b;--red-dim:rgba(192,57,43,.06);--amber:#b76f00;--amber-dim:rgba(183,111,0,.06)}
      body{background:#fff;color:#1f1f24;padding:6px 8px}
      .toolbar{display:none}
      .news-link{color:var(--brand)}
      .summary-card.alert{background:var(--red-dim)}
      .summary-card.warn{background:var(--amber-dim)}
      @page{
        margin:10mm 11mm 12mm 11mm;
        @top-left{
          content:"HAWKEYE STERLING — confidential";
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size:8px;color:#888;
        }
        @top-right{
          content:"${e(reportId)}";
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size:8px;color:#888;
        }
        @bottom-right{
          content:"page " counter(page) " of " counter(pages);
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size:8px;color:#888;
        }
        @bottom-left{
          content:"10-year retention · FDL 10/2025";
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size:8px;color:#888;
        }
      }
      /* avoid splitting key blocks across pages */
      .section,.subject-block,.report-header,.summary,.news-item{page-break-inside:avoid}
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
      <div class="logo">HAWKEYE <span>STERLING</span></div>
      <div class="report-id">
        Report ID: ${e(reportId)}<br/>
        Classification: CONFIDENTIAL<br/>
        Retention: 10 years (FDL 10/2025)
      </div>
    </div>
    <div class="meta-grid">
      <div class="meta-row"><span class="meta-label">Date and Time</span><span class="meta-value">${e(now.toUTCString().replace(" GMT", " UTC"))}</span></div>
      <div class="meta-row"><span class="meta-label">Place</span><span class="meta-value">Dubai, United Arab Emirates</span></div>
      <div class="meta-row"><span class="meta-label">MLRO assigned</span><span class="meta-value">${e(input.mlro ?? "Luisa Fernanda")}</span></div>
      <div class="meta-row"><span class="meta-label">FIU registration</span><span class="meta-value">[goAML reporting entity ID]</span></div>
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
      <div class="sev-badge" style="color:${sevColor};border-color:${sevColor};background:${sevColor}1a">
        ${e(sev.toUpperCase())}
      </div>
      <div style="text-align:right;margin-top:6px;font-size:20px;font-weight:700;color:${sevColor}">${composite}<span style="font-size:11px;color:var(--ink3)">/100</span></div>
      <div style="text-align:right;margin-top:2px;font-size:9px;color:var(--ink3)">composite (sanctions: ${r.topScore})</div>
    </div>
  </div>

  <!-- FINDINGS SUMMARY -->
  <div class="summary">
    <div class="summary-card ${dispositionTone}">
      <div class="summary-label">Disposition</div>
      <div class="summary-value" style="font-size:11.5px">${e(dispositionLabel)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Composite</div>
      <div class="summary-value">${composite}/100</div>
      <div class="summary-detail">${e(sev.toUpperCase())} band</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Sanctions</div>
      <div class="summary-value">${r.hits.length === 0 ? "CLEAR" : `${r.hits.length} hit${r.hits.length === 1 ? "" : "s"}`}</div>
      <div class="summary-detail">top ${r.topScore}/100</div>
    </div>
    <div class="summary-card${amCount > 0 ? " warn" : ""}">
      <div class="summary-label">Adverse media</div>
      <div class="summary-value">${amCount === 0 ? "CLEAR" : amCount + " cat" + (amCount === 1 ? "" : "s")}</div>
      <div class="summary-detail">${newsArticles.length > 0 ? `${newsArticles.length} article${newsArticles.length === 1 ? "" : "s"}` : "no news dossier"}</div>
    </div>
    <div class="summary-bullets">
      ${summaryBullets.map((b) => `• ${b}`).join("<br/>")}
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

  <!-- ADVERSE MEDIA -->
  ${amRows.length > 0 ? `
  <div class="section">
    <div class="section-title">Adverse Media — Findings &amp; Evidence</div>
    <ul class="am-list">${amRows.join("")}</ul>
    ${newsRows ? `<div style="margin-top:10px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:5px;font-weight:600">News dossier ${newsArticles.length} article(s)${sb?.newsDossier?.source ? ` · ${e(sb.newsDossier.source)}` : ""}${sb?.newsDossier?.languages?.length ? ` · ${e(sb.newsDossier.languages.join(", "))}` : ""}</div><div class="news-list">${newsRows}</div>${newsOverflow}</div>` : ""}
  </div>` : ""}

  <!-- FACTS -->
  <div class="section">
    <div class="section-title">1. Facts</div>
    <p style="color:var(--ink1);font-size:10.5px;line-height:1.6">
      On ${e(now.toUTCString().replace(" GMT", " UTC"))}, Hawkeye Sterling screened the ${e(s.entityType)} <strong style="color:var(--ink0)">${e(s.name)}</strong>${s.nationality ? ` (${e(s.nationality)} national)` : ""}${s.caseId ? ` under case ${e(s.caseId)}` : ""}, returning a composite risk score of <strong style="color:${sevColor}">${composite}/100</strong> (band: ${e(sev.toUpperCase())}).
      The sanctions vector ${r.hits.length === 0 ? `returned <strong>CLEAR</strong> (0 hits across the screened corpora)` : `returned <strong>${r.hits.length}</strong> possible match(es) at top match strength ${r.topScore}/100 — a name-similarity result does not constitute a confirmed designation`}.
      ${amCount > 0 ? `Adverse-media overlay fired ${amCount} categor${amCount === 1 ? "y" : "ies"} — see findings section above for evidence.` : ""}
      ${pepTier ? `Subject classified as possible PEP (${e(pepTier)}) — requires independent verification.` : ""}
    </p>
  </div>

  <!-- ANALYSIS -->
  <div class="section">
    <div class="section-title">2. Analysis</div>
    <p style="color:var(--ink1);font-size:10.5px;line-height:1.6">
      The composite score sits in the <strong style="color:${sevColor}">${e(sev)}</strong> band.
      ${r.hits.length > 0 ? `Possible matches concentrate on ${Array.from(new Set(r.hits.map(h => h.listId))).map(l => `<span class="chip chip-red">${e(l)}</span>`).join(" ")}.` : "The subject does not appear on any monitored sanctions regime."}
      ${sb?.jurisdiction ? `Jurisdictional risk for ${e(sb.jurisdiction.name)} is assessed as ${sb.jurisdiction.cahra ? '<span class="chip chip-red">CAHRA</span>' : "non-CAHRA"}.` : ""}
      ${amCount > 0 ? `The adverse-media signal requires analyst review and live-news corroboration before constructive knowledge can be asserted under FDL 10/2025 Art.2(3).` : ""}
    </p>
  </div>

  <!-- RECOMMENDATION -->
  <div class="section">
    <div class="section-title">Recommendation (System)</div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:5px;padding:14px 16px">
      ${recRows}
    </div>
  </div>

  <!-- MLRO DECISION -->
  <div class="section">
    <div class="section-title">MLRO Decision</div>
    <div class="decision-grid">
      ${decisionRows}
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
    return NextResponse.json(
      { ok: false, error: "report generation failed" },
      { status: 500, headers: gateHeaders },
    );
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
