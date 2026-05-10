export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import type { GovernanceGapResult } from "@/app/api/governance-gap/route";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsKvGrid, hsNarrative,
  hsSignatureBlock, hsFinis, hsSeverityCell, nowMeta, escHtml, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const body = await req.json() as { gapResult: GovernanceGapResult; institution: string };
  const { gapResult, institution } = body;

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `GAP-${dd}-${mm}-${yyyy}`;
  const regs = "FDL 10/2025 · CBUAE GOVERNANCE STANDARDS · FATF R.1";

  const grade = gapResult.overallGrade ?? "C";
  const tone = grade === "A" || grade === "B" ? "sage" : grade === "C" ? "amber" : "ember";

  const cover: CoverData = {
    reportId, regs,
    module: "GOVERNANCE OVERSIGHT",
    title: "Governance Gap Analysis Report",
    subtitle: `Assessment of AML/CFT governance framework for ${escHtml(institution)} against CBUAE AML Standards and UAE FDL 10/2025 requirements.`,
    subjectLabel: "INSTITUTION",
    subjectName: institution,
    subjectMeta: `UAE · DMCC · ${reportId}`,
    verdictLabel: `GRADE ${grade}`,
    verdictBand: tone,
    verdictNote: gapResult.gradeRationale?.slice(0,100)+"…",
    meta: [
      { label: "DATE PREPARED",     value: dateStr, sub: time },
      { label: "PLACE OF ISSUE",    value: "Dubai · DMCC", sub: "DMCC Free Zone" },
      { label: "OFFICER",           value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "FIU REGISTRATION",  value: "FIU-AE-DMCC-0428", sub: "goAML Reporting Entity" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Immutable · Signed" },
      { label: "NEXT REVIEW",       value: `${dd}/${mm}/${Number(yyyy)+1}`, sub: "Annual Cycle" },
    ],
  };

  const overallKv = [
    { k: "INSTITUTION",   v: institution },
    { k: "OVERALL GRADE", v: grade },
    { k: "DATE ASSESSED", v: dateStr },
    { k: "ASSESSOR",      v: "L. Fernanda — CO/MLRO" },
  ];

  const findingsRows = (gapResult.findings ?? []).map(f => [
    `<span style="font-weight:500">${escHtml(f.area)}</span>`,
    escHtml(f.finding),
    hsSeverityCell(f.severity),
    `<span class="hs-mono-s">${escHtml(f.regulatoryRef)}</span>`,
  ]);

  const recsRows = (gapResult.recommendations ?? []).map(r => [
    hsSeverityCell(r.priority),
    escHtml(r.action),
    escHtml(r.owner),
    `<span class="hs-mono-s">${escHtml(r.deadline)}</span>`,
  ]);

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">Governance Gap Analysis Report</h1>
  <div style="margin-top:8px">${hsPill(tone, `GRADE ${grade}`, true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Overall assessment", tight:true,
  content: hsKvGrid(overallKv) + (gapResult.gradeRationale ? hsNarrative(gapResult.gradeRationale) : "") })}
${findingsRows.length > 0 ? hsSection({ num:"02", kicker:"part two", title:"Findings", tight:true,
  content: `<table class="hs-table">
    <thead><tr><th style="width:18%">Area</th><th>Finding</th><th style="width:16%">Severity</th><th style="width:18%">Regulatory Ref</th></tr></thead>
    <tbody>${findingsRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` }) : ""}
${recsRows.length > 0 ? hsSection({ num:"03", kicker:"part three", title:"Recommendations", tight:true,
  content: `<table class="hs-table">
    <thead><tr><th style="width:18%">Priority</th><th>Action</th><th style="width:16%">Owner</th><th style="width:16%">Deadline</th></tr></thead>
    <tbody>${recsRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` }) : ""}
${hsSignatureBlock([
  { name:"L. Fernanda",        role:"CO/MLRO · Assessor",   lic:"HS-MLRO-0428",             date: dateStr },
  { name:"Board Chair",        role:"Acknowledged",          lic:`Board Resolution ${yyyy}-04`, date: dateStr },
  { name:"Independent Auditor",role:"Engagement",            lic:"Pending CRITICAL action",  date:"—" },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover", content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Findings", content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
