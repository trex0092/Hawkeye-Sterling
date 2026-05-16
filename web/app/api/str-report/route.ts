export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { enforce } from "@/lib/server/enforce";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsKvGrid,
  hsNarrative, hsTable, hsSignatureBlock, hsFinis, nowMeta, escHtml, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const body = await req.json() as {
    subject: string;
    narrative: string;
    transactions: Array<{ date: string; amount: number; desc: string }>;
    composite: number;
    jurisdiction: string;
  };

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `STR-DRAFT-${dd}-${mm}-${yyyy}`;
  const regs = "FDL 10/2025 ART.14 · CBUAE AML STANDARDS §8 · FATF R.20";
  const tone = body.composite >= 70 ? "ember" : body.composite >= 50 ? "amber" : "sage";

  const cover: CoverData = {
    reportId, regs,
    module: "STR WORKBENCH",
    title: "Suspicious Transaction Report — Draft",
    subtitle: "Draft STR prepared for MLRO review. Documents structuring pattern and supporting transactions for submission via goAML under UAE FDL 10/2025 Art.14 and CBUAE AML Standards §8.",
    subjectLabel: "SUBJECT OF REPORT",
    subjectName: body.subject,
    subjectMeta: `${body.jurisdiction.toUpperCase()} · ${reportId}`,
    verdictLabel: `RISK ${body.composite}/100`,
    verdictBand: tone,
    verdictNote: "Filing required within prescribed 30-day window.",
    meta: [
      { label: "DATE PREPARED",     value: dateStr, sub: time },
      { label: "PLACE OF ISSUE",    value: "Dubai · DMCC", sub: "DMCC Free Zone" },
      { label: "OFFICER",           value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "FIU REGISTRATION",  value: "FIU-AE-DMCC-0428", sub: "goAML Reporting Entity" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Draft · Pre-filing" },
      { label: "RETENTION",         value: "10 years", sub: "FDL 10/2025 ART.24" },
    ],
  };

  const details = [
    { k: "SUBJECT",              v: body.subject },
    { k: "JURISDICTION",         v: body.jurisdiction.toUpperCase() },
    { k: "COMPOSITE RISK SCORE", v: `${body.composite} / 100` },
    { k: "DATE PREPARED",        v: dateStr },
    { k: "REPORTING OFFICER",    v: "L. Fernanda — CO/MLRO" },
  ];

  const txRows = body.transactions.map(tx => [
    `<span class="hs-mono-s">${escHtml(tx.date)}</span>`,
    `<span class="hs-mono-s" style="display:block;text-align:right">${tx.amount.toLocaleString("en-AE",{minimumFractionDigits:2})}</span>`,
    escHtml(tx.desc),
  ]);

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">Suspicious Transaction Report — Draft</h1>
  <div style="margin-top:8px">${hsPill(tone,"RISK SCORE "+body.composite+" / 100", true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Report details", tight:true, content: hsKvGrid(details) })}
${hsSection({ num:"02", kicker:"part two", title:"Narrative", tight:true, content: hsNarrative(body.narrative, true) })}
${body.transactions.length > 0 ? hsSection({ num:"03", kicker:"part three", title:"Supporting transactions", tight:true,
  content: hsTable(["Date","Amount (AED)","Description"], txRows) }) : ""}
<div class="hs-cnote">This draft STR has been prepared for MLRO review. It must not be disclosed to the subject. Filing is required within the timeframe prescribed by CBUAE AML Standards §8 and UAE FDL 10/2025 Art.14.</div>
${hsSignatureBlock([
  { name:"L. Fernanda",      role:"CO/MLRO · Author",                 lic:"HS-MLRO-0428",       date: dateStr },
  { name:"FIU goAML",        role:"Submission pending",                lic:"FIU-AE-DMCC-0428",   date:"—" },
  { name:"Senior Management",role:"Awareness",                         lic:"Not to be disclosed to subject", date: dateStr },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover",
        content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 STR",
        content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", ...gate.headers } });
}
