export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import type { EwraBoardReportResult } from "@/app/api/ewra-report/route";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsNarrative,
  hsNumList, hsSignatureBlock, hsFinis, hsBar, nowMeta, type CoverData,
} from "@/lib/reportHtml";

interface Dimension { dimension: string; inherent: number; controls: number; notes: string }

export async function POST(req: Request) {
  const body = await req.json() as { boardReport: EwraBoardReportResult; dimensions: Dimension[] };
  const { boardReport, dimensions } = body;

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `EWRA-${dd}-${mm}-${yyyy}`;
  const regs = "FDL 10/2025 ART.4 · FATF R.1 · CBUAE AML STANDARDS §2";

  const risk = (boardReport.overallRisk ?? "high").toUpperCase();
  const tone = risk === "CRITICAL" || risk === "HIGH" ? "ember" : risk === "MEDIUM" ? "amber" : "sage";

  const cover: CoverData = {
    reportId, regs,
    module: "MODULE 23 · RISK ASSESSMENT",
    title: "Enterprise-Wide Risk Assessment — Board Report",
    subtitle: "Annual enterprise-wide risk assessment under UAE FDL 10/2025 Art.4 and CBUAE AML Standards §2. Scope: customer, geographic, products, channels, delivery mechanisms.",
    subjectLabel: "REPORTING ENTITY",
    subjectName: "Hawkeye Sterling DPMS",
    subjectMeta: `LICENSED DPMS · DMCC · UAE · ${reportId}`,
    verdictLabel: `${risk} RISK`,
    verdictBand: tone,
    verdictNote: boardReport.executiveSummary?.slice(0,80)+"…",
    meta: [
      { label: "DATE GENERATED",    value: dateStr, sub: time },
      { label: "PLACE OF ISSUE",    value: "Dubai · DMCC", sub: "DMCC Free Zone" },
      { label: "OFFICER",           value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "FIU REGISTRATION",  value: "FIU-AE-DMCC-0428", sub: "goAML Reporting Entity" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Immutable · Signed" },
      { label: "NEXT ASSESSMENT",   value: `${dd}/${mm}/${Number(yyyy)+1}`, sub: "Annual Cycle" },
    ],
  };

  const dimRows = dimensions.map(d => {
    const tone = d.controls >= 70 ? "pink" : d.controls >= 60 ? "amber" : d.controls >= 50 ? "ink" : "sage";
    return [
      `<span style="font-weight:500">${d.dimension}</span>`,
      hsBar(d.inherent, tone as "pink"|"amber"|"sage"|"ink"),
      hsBar(d.controls, tone as "pink"|"amber"|"sage"|"ink"),
      d.notes || "—",
    ];
  });

  const dimTable = dimensions.length > 0
    ? `<table class="hs-table">
        <thead><tr><th>Dimension</th><th>Inherent</th><th>Controls</th><th>Notes</th></tr></thead>
        <tbody>${dimRows.map(r => `<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>` : "";

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">Enterprise-Wide Risk Assessment — Board Report</h1>
  <div style="margin-top:8px">${hsPill(tone, `${risk} RISK`, true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Executive summary", tight:true,
  content: hsNarrative(boardReport.executiveSummary, true) })}
${dimensions.length > 0 ? hsSection({ num:"02", kicker:"part two", title:"Risk dimension scores", tight:true, content: dimTable }) : ""}
${boardReport.boardRecommendations?.length > 0 ? hsSection({ num:"03", kicker:"part three", title:"Board recommendations", tight:true,
  content: hsNumList(boardReport.boardRecommendations) }) : ""}
${boardReport.regulatoryContext ? hsSection({ num:"04", kicker:"part four", title:"Regulatory context", tight:true,
  content: hsNarrative(boardReport.regulatoryContext) }) : ""}
${hsSignatureBlock([
  { name:"L. Fernanda",         role:"Compliance Officer / MLRO", lic:"HS-MLRO-0428",               date: dateStr },
  { name:"Board Chair",         role:"AML Sign-off",              lic:`Board Resolution ${yyyy}-04`, date: dateStr },
  { name:"Independent Director",role:"AML Oversight",             lic:"—",                           date:"—" },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover",
        content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Assessment",
        content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
