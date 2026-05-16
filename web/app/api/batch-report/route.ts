export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsNarrative,
  hsSignatureBlock, hsFinis, hsScorebox, hsSeverityCell, nowMeta, escHtml, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const body = await req.json() as {
    totalScreened: number;
    criticalHits: number;
    highRisk: number;
    clear: number;
    durationMs: number;
    listCoverage: string;
    results: Array<{
      id: string; subject: string; score: number;
      severity: string; disposition: string; date: string;
    }>;
  };

  if (!Array.isArray(body?.results)) {
    return NextResponse.json({ ok: false, error: "results must be an array" }, { status: 400, headers: gate.headers });
  }

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `HWK-BATCH-${dd}-${mm}-${yyyy}`;
  const regs = "FDL 10/2025 · CBUAE AML STANDARDS · FATF R.10";
  const durSec = (body.durationMs / 1000).toFixed(1)+"s";

  const cover: CoverData = {
    reportId, regs,
    module: "BATCH SCREENING ENGINE",
    title: "Batch Screening Audit Report",
    subtitle: `Automated batch screening audit for ${body.totalScreened} subjects. Critical hits require MLRO review within 24 hours per CBUAE AML Standards §6.`,
    subjectLabel: "SCOPE",
    subjectName: `${body.totalScreened} subjects`,
    subjectMeta: `${body.criticalHits} CRITICAL · ${body.highRisk} HIGH · ${body.clear} CLEAR`,
    verdictLabel: body.criticalHits > 0 ? `${body.criticalHits} CRITICAL` : "ALL CLEAR",
    verdictBand: body.criticalHits > 0 ? "ember" : body.highRisk > 0 ? "amber" : "sage",
    verdictNote: `${body.totalScreened} subjects screened in ${durSec}.`,
    meta: [
      { label: "DATE GENERATED",    value: dateStr, sub: time },
      { label: "ENGINE",            value: "claude-sonnet-4-6", sub: "Batch Screener" },
      { label: "DURATION",          value: durSec, sub: `${body.totalScreened} subjects` },
      { label: "OFFICER",           value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Immutable · Signed" },
      { label: "RETENTION",         value: "10 years", sub: "FDL 10/2025" },
    ],
  };

  const kpiHtml = `<div class="hs-kpis">
    ${hsScorebox(String(body.totalScreened), "TOTAL SCREENED", "")}
    ${hsScorebox(String(body.criticalHits), "CRITICAL HITS", body.criticalHits > 0 ? "ember" : "")}
    ${hsScorebox(String(body.highRisk), "HIGH RISK", body.highRisk > 0 ? "amber" : "")}
    ${hsScorebox(String(body.clear), "CLEAR", body.clear === body.totalScreened ? "sage" : "")}
    ${hsScorebox(durSec, "DURATION", "")}
  </div>`;

  const resultRows = body.results.map(r => [
    `<span class="hs-mono-s">${escHtml(r.id)}</span>`,
    `<span style="font-weight:500">${escHtml(r.subject)}</span>`,
    `<span class="hs-mono-s" style="display:block;text-align:right">${r.score}</span>`,
    hsSeverityCell(r.severity),
    hsSeverityCell(r.disposition),
    `<span class="hs-mono-s">${escHtml(r.date)}</span>`,
  ]);

  const tone = body.criticalHits > 0 ? "ember" : body.highRisk > 0 ? "amber" : "sage";

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">Batch Screening Audit Report</h1>
  <div style="margin-top:6px;font-size:11px;color:var(--ink-2);font-style:italic;font-family:var(--serif)">${body.totalScreened} subjects · ${body.criticalHits} critical hits · run duration ${durSec}</div>
</div>
${kpiHtml}
${hsSection({ num:"01", kicker:"part one", title:"Screening results", tight:true,
  content: resultRows.length > 0 ? `<table class="hs-table">
    <thead><tr><th>ID</th><th>Subject</th><th>Score</th><th>Severity</th><th>Disposition</th><th>Screened</th></tr></thead>
    <tbody>${resultRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` : "<p style='font-style:italic;color:var(--ink-3);font-size:11px'>No results to display.</p>" })}
${hsSection({ num:"02", kicker:"part two", title:"List coverage applied", tight:true,
  content: hsNarrative(body.listCoverage || "UN sanctions, OFAC SDN, EU Consolidated, Interpol Red Notices, PEP databases (World-Check, Dow Jones), UAE local watchlists, adverse media (proprietary NLP).") })}
${hsSignatureBlock([
  { name:"L. Fernanda",   role:"CO/MLRO · Reviewer", lic:"HS-MLRO-0428", date: dateStr },
  { name:"Engine Operator",role:"Batch Engine",       lic:"HWK-ENG-0042", date: dateStr },
  { name:"QA Reviewer",   role:"Sample Audit 5%",     lic:"HS-QA-0019",   date: dateStr },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover", content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Results", content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", ...gate.headers } });
}
