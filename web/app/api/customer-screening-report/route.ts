export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { enforce } from "@/lib/server/enforce";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsKvGrid,
  hsFindings, hsSignatureBlock, hsFinis, hsSeverityCell, nowMeta, escHtml, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const body = await req.json() as {
    subjectName: string;
    jurisdiction: string;
    verdict: string;
    verdictTone: "ember"|"amber"|"sage";
    subjectDetails: Array<{k:string; v:string}>;
    findings: string[];
    listCoverage: Array<{list:string; result:string; match:string; date:string}>;
  };

  if (!body?.subjectName?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "subjectName required" }), { status: 400, headers: gate.headers });
  }
  if (!Array.isArray(body.subjectDetails)) body.subjectDetails = [];
  if (!Array.isArray(body.findings)) body.findings = [];
  if (!Array.isArray(body.listCoverage)) body.listCoverage = [];
  if (!body.jurisdiction) body.jurisdiction = "—";
  if (!["ember","amber","sage"].includes(body.verdictTone)) body.verdictTone = "amber";

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `SCR-${dd}-${mm}-${yyyy}`;
  const regs = "UAE FDL 10/2025 · CBUAE AML STANDARDS · FATF R.10";

  const cover: CoverData = {
    reportId, regs,
    module: "CUSTOMER SCREENING",
    title: "Customer Screening Report",
    subtitle: "Sanctions, PEP, and adverse media screening report prepared for MLRO review under UAE FDL 10/2025 and CBUAE AML Standards.",
    subjectLabel: "SUBJECT",
    subjectName: body.subjectName,
    subjectMeta: `${body.jurisdiction.toUpperCase()} · ${reportId}`,
    verdictLabel: body.verdict,
    verdictBand: body.verdictTone,
    verdictNote: body.verdictTone === "ember" ? "Enhanced due diligence required before onboarding." : "Standard CDD procedures apply.",
    meta: [
      { label: "DATE PREPARED",     value: dateStr, sub: time },
      { label: "PLACE OF ISSUE",    value: "Dubai · DMCC", sub: "DMCC Free Zone" },
      { label: "OFFICER",           value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "FIU REGISTRATION",  value: "FIU-AE-DMCC-0428", sub: "goAML Reporting Entity" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Immutable · Signed" },
      { label: "RETENTION",         value: "10 years", sub: "FDL 10/2025 ART.24" },
    ],
  };

  // Escape user-supplied subjectDetails values before passing to hsKvGrid
  const safeSubjectDetails = body.subjectDetails.map(({ k, v }) => ({
    k: escHtml(k),
    v: escHtml(v),
  }));

  const listRows = body.listCoverage.map(r => [
    escHtml(r.list),
    hsSeverityCell(r.result),
    `<span class="hs-mono-s">${escHtml(r.match)}</span>`,
    `<span class="hs-mono-s">${escHtml(r.date)}</span>`,
  ]);

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">Customer Screening Report</h1>
  <div style="margin-top:8px">${hsPill(body.verdictTone, body.verdict, true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Subject details", tight:true,
  content: hsKvGrid(safeSubjectDetails) })}
${body.findings.length > 0 ? hsSection({ num:"02", kicker:"part two", title:"Findings", tight:true,
  content: hsFindings(body.findings) }) : ""}
${listRows.length > 0 ? hsSection({ num:"03", kicker:"part three", title:"List coverage", tight:true,
  content: `<table class="hs-table">
    <thead><tr><th>List</th><th>Result</th><th>Match %</th><th>Date Checked</th></tr></thead>
    <tbody>${listRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` }) : ""}
<div class="hs-cnote">This screening report is produced for MLRO and compliance team use only. Results must be reviewed against primary source data before a final disposition is recorded.</div>
${hsSignatureBlock([
  { name:"L. Fernanda",        role:"Compliance Officer / MLRO",   lic:"HS-MLRO-0428",   date: dateStr },
  { name:"M. Al-Hashimi",      role:"Senior Compliance Reviewer",  lic:"HS-SCR-0117",    date: dateStr },
  { name:"Board Sub-Committee",role:"AML Oversight",               lic:"Quorum 3/3",     date:"—" },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover", content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Findings", content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", ...gate.headers } });
}
