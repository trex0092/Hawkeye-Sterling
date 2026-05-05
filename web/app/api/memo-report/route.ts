export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsKvGrid, hsNarrative,
  hsSignatureBlock, hsFinis, nowMeta, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const body = await req.json() as {
    subject: string;
    toRole: string;
    fromRole: string;
    re: string;
    summary: string;
    recommendation: string;
    details?: Array<{k: string; v: string}>;
    privilege?: string;
  };

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `MEMO-${yyyy}-${mm}-${dd}`;
  const regs = "FDL 10/2025 · CBUAE AML STANDARDS · LEGAL PRIVILEGE";

  const cover: CoverData = {
    reportId, regs,
    module: "MLRO MEMORANDUM",
    title: "MLRO Internal Memorandum",
    subtitle: "Privileged internal memorandum prepared by the MLRO for senior management review. Not to be disclosed externally without express authorisation.",
    subjectLabel: "SUBJECT",
    subjectName: body.subject,
    subjectMeta: `FROM: MLRO · TO: ${body.toRole.toUpperCase()} · ${reportId}`,
    verdictLabel: "ESCALATE",
    verdictBand: "ember",
    verdictNote: "Senior management review required within 24 hours.",
    meta: [
      { label: "DATE PREPARED",     value: dateStr, sub: time },
      { label: "PLACE OF ISSUE",    value: "Dubai · DMCC", sub: "DMCC Free Zone" },
      { label: "FROM",              value: "L. Fernanda", sub: "MLRO" },
      { label: "TO",                value: body.toRole, sub: "Addressee" },
      { label: "REPORT IDENTIFIER", value: reportId, sub: "Privileged · Confidential" },
      { label: "RE",                value: body.re, sub: "Subject matter" },
    ],
  };

  const detailKv = [
    { k: "TO",      v: body.toRole },
    { k: "FROM",    v: `L. Fernanda — MLRO` },
    { k: "DATE",    v: dateStr },
    { k: "RE",      v: body.re },
    ...(body.details ?? []),
  ];

  const privilege = body.privilege ?? "This memorandum is legally privileged and confidential. It is prepared for the sole use of the addressee in connection with the matter described. It must not be disclosed to any other person without the express written consent of the MLRO.";

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">MLRO Internal Memorandum</h1>
  <div style="margin-top:8px">${hsPill("ember","ESCALATE",true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Memorandum details", tight:true, content: hsKvGrid(detailKv) })}
${hsSection({ num:"02", kicker:"part two", title:"Summary", tight:true, content: hsNarrative(body.summary, true) })}
${hsSection({ num:"03", kicker:"part three", title:"Recommendation", tight:true, content: hsNarrative(body.recommendation) })}
<div class="hs-cnote">${privilege}</div>
${hsSignatureBlock([
  { name:"L. Fernanda",     role:"MLRO · Author",          lic:"HS-MLRO-0428",                date: dateStr },
  { name:"Senior Management",role:"Approval pending",       lic:"Required prior to relationship",date:"—" },
  { name:"Legal Counsel",   role:"Privilege noted",         lic:"External counsel",             date:"—" },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover", content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Memorandum", content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
