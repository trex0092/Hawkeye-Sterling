export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import type { EvidencePackEntry } from "@/lib/evidencePack";
import {
  buildHtmlDoc, hsPage, hsCover, hsSection, hsPill, hsKvGrid, hsNarrative,
  hsSignatureBlock, hsFinis, nowMeta, type CoverData,
} from "@/lib/reportHtml";

export async function POST(req: Request) {
  const entry: EvidencePackEntry = await req.json();

  const { dateStr, time } = nowMeta();
  const dd = dateStr.slice(0,2), mm = dateStr.slice(3,5), yyyy = dateStr.slice(6);
  const reportId = `EVID-${dd}-${mm}-${yyyy}`;
  const regs = "FDL 10/2025 ART.14 · CBUAE AML STANDARDS §8 · FATF R.20";

  const cover: CoverData = {
    reportId, regs,
    module: "MLRO ADVISOR",
    title: "MLRO Advisor Evidence Pack",
    subtitle: "AI-assisted advisory session evidence pack for MLRO review. Contains reasoning trail, classifier output, and integrity hash for audit purposes.",
    subjectLabel: "QUERY",
    subjectName: entry.question.slice(0,60)+(entry.question.length>60?"…":""),
    subjectMeta: `${entry.mode.toUpperCase()} · ${reportId}`,
    verdictLabel: (entry.verdict ?? "ESCALATE").toUpperCase(),
    verdictBand: "ember",
    verdictNote: "MLRO review required before advice is acted upon.",
    meta: [
      { label: "DATE / TIME",      value: dateStr, sub: time },
      { label: "ENGINE",           value: "claude-opus-4-7", sub: "Advisor Model" },
      { label: "ELAPSED",          value: `${(entry.elapsedMs/1000).toFixed(1)}s`, sub: "Session duration" },
      { label: "OFFICER",          value: "L. Fernanda", sub: "CO/MLRO" },
      { label: "INTEGRITY HASH",   value: entry.charterIntegrityHash ? entry.charterIntegrityHash.slice(0,24)+"…" : "—", sub: "HMAC-Verified" },
      { label: "RETENTION",        value: "10 years", sub: "FDL 10/2025" },
    ],
  };

  const sessionKv = [
    { k: "QUESTION",  v: entry.question },
    { k: "MODE",      v: entry.mode },
    { k: "VERDICT",   v: entry.verdict ?? "—" },
    { k: "ELAPSED",   v: `${(entry.elapsedMs/1000).toFixed(1)}s` },
    { k: "HASH",      v: entry.charterIntegrityHash ?? "—" },
  ];

  const trailRows = (entry.reasoningTrail ?? []).map(r => [
    `<span class="hs-mono-s">${String(r.stepNo).padStart(2,"0")}</span>`,
    `<span style="font-weight:500">${r.actor}</span>`,
    `<span class="hs-mono-s">${r.modelId}</span>`,
    r.summary,
  ]);

  const cls = entry.classifier;
  const classifierKv = cls ? [
    { k: "PRIMARY TOPIC",       v: cls.primaryTopic ?? "—" },
    { k: "FATF RECOMMENDATIONS",v: cls.fatfRecs?.map(f=>f.num).join(", ") ?? "—" },
    { k: "RED FLAGS",           v: cls.redFlags?.join("; ") ?? "—" },
  ] : [];

  const narrative = entry.narrative ?? entry.guidance ?? "";

  const contentBody = `
<div style="margin-bottom:14px">
  <h1 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0;color:var(--ink)">MLRO Advisor Evidence Pack</h1>
  <div style="margin-top:8px">${hsPill("ember", "ESCALATE", true)}</div>
</div>
${hsSection({ num:"01", kicker:"part one", title:"Session details", tight:true, content: hsKvGrid(sessionKv) })}
${narrative ? hsSection({ num:"02", kicker:"part two", title:"Narrative", tight:true, content: hsNarrative(narrative, true) }) : ""}
${trailRows.length > 0 ? hsSection({ num:"03", kicker:"part three", title:"Reasoning trail", tight:true,
  content: `<table class="hs-table">
    <thead><tr><th style="width:8%">Step</th><th style="width:18%">Actor</th><th style="width:22%">Model</th><th>Summary</th></tr></thead>
    <tbody>${trailRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` }) : ""}
${classifierKv.length > 0 ? hsSection({ num:"04", kicker:"part four", title:"Classifier hits", tight:true, content: hsKvGrid(classifierKv) }) : ""}
${hsSignatureBlock([
  { name:"L. Fernanda",      role:"CO/MLRO · Reviewer",     lic:"HS-MLRO-0428",              date: dateStr },
  { name:"Advisor Model",    role:"claude-opus-4-7",         lic: entry.charterIntegrityHash ? entry.charterIntegrityHash.slice(0,20)+"…" : "auto-signed", date:"auto-signed" },
  { name:"Senior Management",role:"Approval required",       lic:"—",                         date:"—" },
])}
${hsFinis(reportId, 2, 2)}`;

  const html = buildHtmlDoc({
    title: `Hawkeye Sterling · ${reportId}`,
    pages: [
      hsPage({ reportId, pageNum:1, pageTotal:2, regs, label:"01 Cover", content: hsCover(cover) }),
      hsPage({ reportId, pageNum:2, pageTotal:2, regs, label:"02 Evidence", content: contentBody }),
    ],
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
