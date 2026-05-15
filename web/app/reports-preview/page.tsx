"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const PINK = "#D20055";

// ── Shared PDF chrome primitives ─────────────────────────────────────────────

function SecurityStrip({ ref: reportRef }: { ref: string }) {
  const seg = `HAWKEYE STERLING  ·  ${reportRef}  ·  CONFIDENTIAL  ·  DO NOT REDISTRIBUTE  `;
  return (
    <div className="overflow-hidden whitespace-nowrap py-[3px] bg-white" style={{fontSize:5.5,color:"#828282",letterSpacing:"0.3px"}}>
      {Array(12).fill(seg).join("")}
    </div>
  );
}

function HeaderBar({ reportRef }: { reportRef: string }) {
  return (
    <div className="bg-white border-b border-gray-200 px-5 flex items-center justify-between" style={{height:30}}>
      <div className="flex items-center gap-2">
        <div className="w-[18px] h-[18px] rounded-full border border-gray-900 flex items-center justify-center" style={{fontSize:7,fontWeight:700,color:"#141414"}}>H</div>
        <span style={{fontSize:8,fontWeight:700,letterSpacing:"1.5px",color:"#141414"}}>HAWKEYE  ·  STERLING</span>
      </div>
      <span style={{fontSize:7,fontWeight:700,letterSpacing:"0.8px",color:PINK}}>CONFIDENTIAL  ·  MLRO USE ONLY</span>
      <span style={{fontSize:7.5,color:"#141414",letterSpacing:"0.5px"}}>{reportRef}</span>
    </div>
  );
}

function ContentPageTop({ reportRef, reg1, reg2, page, total }: { reportRef:string; reg1:string; reg2?:string; page:number; total:number }) {
  return (
    <>
      <div className="bg-white px-5 flex items-start justify-between border-b border-gray-200" style={{height:18}}>
        <div style={{fontSize:6,color:"#464646",letterSpacing:"0.5px",lineHeight:"8px",paddingTop:3}}>
          {reg1}{reg2 && <><br />{reg2}</>}
        </div>
        <div style={{fontSize:6,color:"#464646",letterSpacing:"0.5px",paddingTop:5}}>{reportRef}</div>
        <div style={{fontSize:6,color:"#464646",letterSpacing:"0.5px",paddingTop:5}}>
          {String(page).padStart(2,"0")} / {String(total).padStart(2,"0")}
        </div>
      </div>
      <div className="border-b border-gray-100"/>
      <SecurityStrip ref={reportRef} />
      <HeaderBar reportRef={reportRef} />
    </>
  );
}

function CoverLogo() {
  return (
    <div className="relative flex items-center justify-center" style={{width:52,height:52}}>
      <div className="absolute rounded-full border border-gray-900" style={{width:52,height:52}}/>
      <div className="absolute rounded-full border border-gray-900" style={{width:33,height:33}}/>
      <span style={{fontSize:13,fontWeight:700,color:"#141414",zIndex:1}}>HS</span>
    </div>
  );
}

function SmallLogo() {
  return (
    <div className="flex items-center justify-center rounded-full border border-gray-400" style={{width:13,height:13}}>
      <span style={{fontSize:7,fontWeight:700,color:"#828282"}}>H</span>
    </div>
  );
}

function CoverFrame({ reportRef, module: mod, cap, rest, description, leftCard, rightCard, meta }: {
  reportRef: string;
  module: string;
  cap: string;
  rest: string;
  description: string;
  leftCard: React.ReactNode;
  rightCard?: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <div className="bg-white" style={{minHeight:1123}}>
      <SecurityStrip ref={reportRef} />
      <HeaderBar reportRef={reportRef} />
      <div className="mx-8 border-b border-gray-200 mt-0" />

      {/* Cover body */}
      <div className="flex flex-col items-center pt-6 px-10 pb-4">
        {/* Logo + brand */}
        <div className="flex items-center gap-4 self-start mb-6 w-full">
          <CoverLogo />
          <div className="flex-1">
            <div style={{fontSize:19,fontWeight:700,letterSpacing:"5px",color:"#141414"}}>HAWKEYE  ·  STERLING</div>
            <div style={{fontSize:7.5,letterSpacing:"2px",color:"#464646",marginTop:2}}>{mod}</div>
          </div>
          <div style={{fontSize:7.5,letterSpacing:"0.5px",color:"#464646"}}>{reportRef}</div>
        </div>

        {/* Document type */}
        <div style={{fontSize:7,letterSpacing:"2.5px",color:"#828282",marginBottom:8,textTransform:"uppercase"}}>DOCUMENT TYPE</div>

        {/* Drop cap title */}
        <div style={{marginBottom:12,textAlign:"center"}}>
          <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:38,color:PINK,lineHeight:1}}>{cap}</span>
          <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:26,color:"#141414",lineHeight:1}}>{rest}</span>
        </div>

        {/* Description */}
        <p style={{fontSize:8.5,color:"#464646",maxWidth:380,textAlign:"center",lineHeight:1.5,marginBottom:20}}>{description}</p>

        {/* Cards */}
        <div className="flex gap-4 w-full mb-6">
          {leftCard}
          {rightCard}
        </div>

        {/* Meta grid */}
        {meta}
      </div>

      {/* Footer */}
      <div className="mx-10 mt-4 pt-3 border-t border-gray-200 flex justify-between items-end">
        <p style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:7.5,color:"#464646",lineHeight:1.7}}>
          Issued in confidence to the addressee. Reproduction,<br />
          transmission or storage outside the controlled domain of<br />
          the recipient institution is prohibited under the terms of<br />
          the engagement.
        </p>
        <SmallLogo />
      </div>
    </div>
  );
}

function Card({ label, title, tags }: { label: string; title: string; tags: string }) {
  return (
    <div className="border border-gray-200 flex-1 p-3" style={{minHeight:100}}>
      <div style={{fontSize:6.5,letterSpacing:"1.5px",color:"#828282",marginBottom:6,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:13,fontWeight:700,color:"#141414",marginBottom:6,lineHeight:1.3}}>{title}</div>
      <div style={{fontSize:6.5,letterSpacing:"0.8px",color:"#464646",textTransform:"uppercase"}}>{tags}</div>
    </div>
  );
}

function VerdictCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-200 flex-1 p-3" style={{minHeight:100}}>
      <div style={{fontSize:6.5,letterSpacing:"1.5px",color:"#828282",marginBottom:6,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:19,fontWeight:700,color:PINK,marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:7.5,color:"#464646",lineHeight:1.4}}>{sub}</div>}
    </div>
  );
}

function MetaGrid({ cells }: { cells: Array<{label:string;value:string;sub?:string}> }) {
  return (
    <div className="w-full grid grid-cols-3 gap-y-4 mb-4">
      {cells.map((c,i) => (
        <div key={i}>
          <div style={{fontSize:6.5,letterSpacing:"1.2px",color:"#828282",marginBottom:4,textTransform:"uppercase"}}>{c.label}</div>
          <div style={{fontSize:9.5,color:"#141414"}}>{c.value}</div>
          {c.sub && <div style={{fontSize:7,color:"#828282",textTransform:"uppercase",letterSpacing:"0.5px"}}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function PartHeader({ label, num, title }: { label: string; num: string; title: string }) {
  return (
    <div className="mb-3">
      <div style={{fontSize:7,letterSpacing:"2px",color:"#828282",marginLeft:20,marginBottom:2,textTransform:"uppercase"}}>{label}</div>
      <div className="flex items-baseline gap-1" style={{marginLeft:20}}>
        <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:18,color:PINK}}>{num}</span>
        <span style={{fontSize:14,color:"#141414",marginLeft:4}}>{title}</span>
      </div>
      <div className="border-t border-gray-200 mt-1" />
    </div>
  );
}

function VerdictBadge({ text }: { text: string }) {
  return (
    <div className="inline-block border px-2.5 py-0.5 mb-4" style={{borderColor:PINK}}>
      <span style={{fontSize:8,fontWeight:700,letterSpacing:"1.2px",color:PINK}}>{text}</span>
    </div>
  );
}

function KVTable({ rows, labelW=120 }: { rows: Array<[string,string]>; labelW?: number }) {
  return (
    <div className="mb-3">
      {rows.map(([lbl,val],i) => (
        <div key={i} className="flex mb-1">
          <span style={{width:labelW,fontSize:7.5,fontWeight:700,letterSpacing:"0.8px",color:"#141414",flexShrink:0}}>{lbl}</span>
          <span style={{fontSize:8.5,color:"#464646"}}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function DropCapPara({ text }: { text: string }) {
  return (
    <p className="mb-4" style={{fontSize:9,color:"#141414",lineHeight:1.6}}>
      <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:28,color:"#464646",float:"left",lineHeight:0.9,marginRight:2,marginTop:2}}>{text[0]}</span>
      {text.slice(1)}
    </p>
  );
}

function PlainTable({ head, rows, colWidths }: { head: string[]; rows: string[][]; colWidths?: string[] }) {
  return (
    <table className="w-full border-collapse mb-4" style={{fontSize:8}}>
      <thead>
        <tr className="border-b border-gray-200">
          {head.map((h,i) => (
            <th key={i} className="text-left pb-1.5 font-bold" style={{fontSize:7,letterSpacing:"0.5px",color:"#141414",width:colWidths?.[i]}}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i) => (
          <tr key={i} className="border-b border-gray-100">
            {row.map((cell,j) => <td key={j} className="py-1.5 pr-2" style={{color:"#323232"}}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SigFooter({ ref: reportRef, signers }: {
  ref: string;
  signers: Array<{name:string;role:string;id?:string;date?:string;extra?:string}>;
}) {
  return (
    <div className="mt-6">
      <div className="grid border-t border-gray-300" style={{gridTemplateColumns:`repeat(${signers.length},1fr)`}}>
        {signers.map((s,i) => (
          <div key={i} className="pt-2 pr-4">
            <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:9,color:"#141414"}}>{s.name}</div>
            <div style={{fontSize:6.5,letterSpacing:"0.8px",color:"#464646",textTransform:"uppercase",marginTop:2}}>{s.role}</div>
            {s.id    && <div style={{fontSize:6.5,color:"#464646",marginTop:1}}>{s.id}</div>}
            {s.date  && <div style={{fontSize:6.5,color:"#464646"}}>{s.date}</div>}
            {s.extra && <div style={{fontSize:6.5,color:"#828282",letterSpacing:"0.5px"}}>{s.extra}</div>}
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center mt-3">
        <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:8,color:"#464646"}}>finis</span>
        <span style={{fontSize:7,letterSpacing:"0.5px",color:"#828282"}}>{reportRef}  ·  END OF DOCUMENT  ·  01 OF 01</span>
        <SmallLogo />
      </div>
    </div>
  );
}

// ── Report previews ───────────────────────────────────────────────────────────

const TODAY = "04/05/2026";
const TIME  = "10:32:41 GST";

function EwraPreview() {
  return (
    <div className="space-y-2">
      {/* Cover */}
      <CoverFrame
        reportRef="EWRA-2026-BOARD"
        module="RISK ASSESSMENT"
        cap="E" rest="nterprise-Wide Risk Assessment — Board Report"
        description="Annual enterprise-wide risk assessment under UAE FDL 10/2025 Art.4 and CBUAE AML Standards §2. Scope: customer, geographic, products, channels, delivery mechanisms."
        leftCard={<Card label="REPORTING ENTITY" title="Hawkeye Sterling DPMS" tags="LICENSED DPMS  ·  DMCC  ·  UAE  ·  EWRA-2026-BOARD" />}
        rightCard={<VerdictCard label="VERDICT" value="HIGH RISK" sub="Residual risk above board appetite in DPMS and cross-border wire categories." />}
        meta={<MetaGrid cells={[
          {label:"DATE GENERATED", value:TODAY,            sub:TIME},
          {label:"PLACE OF ISSUE", value:"Dubai  ·  DMCC", sub:"DMCC Free Zone"},
          {label:"OFFICER",        value:"L. Fernanda",    sub:"CO/MLRO"},
          {label:"FIU REGISTRATION",value:"FIU-AE-DMCC-0428", sub:"goAML Reporting Entity"},
          {label:"REPORT IDENTIFIER",value:"EWRA-2026-BOARD", sub:"Immutable  ·  Signed"},
          {label:"NEXT ASSESSMENT", value:"04/05/2027",    sub:"Annual Cycle"},
        ]} />}
      />
      {/* Content page 1 */}
      <div className="bg-white">
        <ContentPageTop reportRef="EWRA-2026-BOARD" reg1="FDL 10/2025 ART.4  ·  FATF R.1  ·  CBUAE AML" reg2="STANDARDS §2" page={1} total={1} />
        <div className="px-10 pt-4 pb-6">
          <div style={{fontSize:16,fontWeight:700,color:"#141414",marginBottom:10}}>Enterprise-Wide Risk Assessment — Board Report</div>
          <VerdictBadge text="HIGH RISK" />
          <PartHeader label="PART ONE" num="01" title="Executive summary" />
          <DropCapPara text="The enterprise risk assessment for the current period identifies elevated exposure across three primary dimensions: customer risk (score 72), geographic risk (score 68), and products & services risk (score 61). Residual risk remains above appetite in the DPMS and cross-border wire categories. Immediate board attention is required on the UAE-Iran nexus and virtual asset onboarding controls." />
          <PartHeader label="PART TWO" num="02" title="Risk dimension scores" />
          <PlainTable
            head={["DIMENSION","INHERENT","CONTROLS","NOTES"]}
            rows={[
              ["Customer Risk","78","72","PEP and HNW segment driving inherent score"],
              ["Geographic Risk","74","68","UAE-Iran corridor · FATF greylist jurisdictions"],
              ["Products & Services","65","61","DPMS · virtual assets · cross-border wire"],
              ["Channels","52","48","Digital onboarding gap — biometric not deployed"],
              ["Delivery Mechanisms","45","42","Correspondent relationships — 3 pending EDD"],
            ]}
            colWidths={["30%","10%","10%","50%"]}
          />
          <PartHeader label="PART THREE" num="03" title="Board recommendations" />
          <div className="mb-3 space-y-2">
            {["Approve deployment of biometric verification for digital onboarding by Q3.",
              "Exit two correspondent relationships pending +90-day EDD without response.",
              "Increase MLRO headcount by one FTE — current workload exceeds CBUAE benchmarks.",
            ].map((rec,i) => (
              <div key={i} className="flex gap-2">
                <span style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:10,color:PINK,minWidth:24}}>{String(i+1).padStart(2,"0")}</span>
                <span style={{fontSize:9,color:"#141414"}}>{rec}</span>
              </div>
            ))}
          </div>
          <PartHeader label="PART FOUR" num="04" title="Regulatory context" />
          <p style={{fontSize:9,color:"#141414",lineHeight:1.6,marginBottom:16}}>UAE FDL No.10/2025 Art.4 requires annual enterprise-wide risk assessments. This report satisfies the CBUAE AML Standards §2 board sign-off obligation. Next assessment due: 04/05/2027.</p>
          <SigFooter ref="EWRA-2026-BOARD" signers={[
            {name:"L. Fernanda",role:"COMPLIANCE OFFICER / MLRO",id:"HS-MLRO-0428",date:TODAY},
            {name:"Board Chair",role:"AML SIGN-OFF",id:"Board Resolution 2026-04",date:TODAY},
            {name:"Independent Director",role:"AML OVERSIGHT",id:"—",date:"—"},
          ]} />
        </div>
      </div>
    </div>
  );
}

function StrPreview() {
  return (
    <div className="space-y-2">
      <CoverFrame
        reportRef="STR-DRAFT-04-05-2026"
        module="STR WORKBENCH"
        cap="S" rest="uspicious Transaction Report — Draft"
        description="Draft STR prepared for MLRO review. Documents structuring pattern and supporting transactions for submission via goAML under UAE FDL 10/2025 Art.14 and CBUAE AML Standards §8."
        leftCard={<Card label="SUBJECT OF REPORT" title="Mohammed Al-Rashidi" tags="INDIVIDUAL  ·  UAE  ·  AE-DU  ·  STR-DRAFT-04-05-2026" />}
        rightCard={<VerdictCard label="VERDICT" value="RISK 84/100" sub="Filing required within prescribed 30-day window." />}
        meta={<MetaGrid cells={[
          {label:"DATE PREPARED",     value:TODAY,               sub:TIME},
          {label:"PLACE OF ISSUE",    value:"Dubai  ·  DMCC",    sub:"DMCC Free Zone"},
          {label:"OFFICER",           value:"L. Fernanda",        sub:"CO/MLRO"},
          {label:"FIU REGISTRATION",  value:"FIU-AE-DMCC-0428",  sub:"goAML Reporting Entity"},
          {label:"REPORT IDENTIFIER", value:"STR-DRAFT-04-05-2026",sub:"Draft  ·  Pre-filing"},
          {label:"RETENTION",         value:"10 years",           sub:"FDL 10/2025 ART.24"},
        ]} />}
      />
      <div className="bg-white">
        <ContentPageTop reportRef="STR-DRAFT-04-05-2026" reg1="FDL 10/2025 ART.14  ·  CBUAE AML STANDARDS" reg2="§8  ·  FATF R.20" page={1} total={1} />
        <div className="px-10 pt-4 pb-6">
          <div style={{fontSize:16,fontWeight:700,color:"#141414",marginBottom:10}}>Suspicious Transaction Report — Draft</div>
          <VerdictBadge text="RISK SCORE 84 / 100" />
          <PartHeader label="PART ONE" num="01" title="Report details" />
          <KVTable rows={[
            ["SUBJECT","Mohammed Al-Rashidi"],
            ["JURISDICTION","UAE  ·  AE-DU"],
            ["COMPOSITE RISK SCORE","84 / 100"],
            ["DATE PREPARED",TODAY],
            ["REPORTING OFFICER","L. Fernanda — CO/MLRO"],
          ]} />
          <PartHeader label="PART TWO" num="02" title="Narrative" />
          <DropCapPara text="The subject conducted 14 cash transactions totalling AED 1,240,000 over a 22-day period, all structured below the AED 100,000 CTR threshold. Transactions show no plausible business rationale given the declared occupation (self-employed, retail). Three deposits were followed within 24 hours by international wire transfers to a correspondent account in Türkiye flagged on the EOCN. Adverse media identified two articles linking the subject to a Dubai-based hawala network (2023). MLRO recommends STR filing under CBUAE AML Standards §8." />
          <PartHeader label="PART THREE" num="03" title="Supporting transactions" />
          <PlainTable
            head={["DATE","AMOUNT (AED)","DESCRIPTION"]}
            rows={[
              ["03/04/2026","98,500.00","Cash deposit — Main St. branch"],
              ["05/04/2026","97,200.00","Cash deposit — DIFC branch"],
              ["07/04/2026","99,100.00","Cash deposit — Deira branch"],
              ["08/04/2026","245,000.00","Outward wire — Türkiye · ref. EOCN-44"],
              ["12/04/2026","96,800.00","Cash deposit — Main St. branch"],
              ["14/04/2026","350,000.00","Outward wire — Türkiye · ref. EOCN-44"],
            ]}
            colWidths={["15%","20%","65%"]}
          />
          <p style={{fontFamily:"Georgia,'Times New Roman',serif",fontStyle:"italic",fontSize:7.5,color:"#464646",lineHeight:1.5,marginBottom:16}}>This draft STR has been prepared for MLRO review. It must not be disclosed to the subject. Filing is required within the timeframe prescribed by CBUAE AML Standards §8 and UAE FDL 10/2025 Art.14.</p>
          <SigFooter ref="STR-DRAFT-04-05-2026" signers={[
            {name:"L. Fernanda",role:"CO/MLRO  ·  AUTHOR",id:"HS-MLRO-0428",date:TODAY},
            {name:"FIU goAML",role:"SUBMISSION PENDING",id:"FIU-AE-DMCC-0428",date:"—"},
            {name:"Senior Management",role:"AWARENESS",id:"Not to be disclosed to subject",date:TODAY},
          ]} />
        </div>
      </div>
    </div>
  );
}

function BatchPreview() {
  const sevBadge = (s: string) => {
    const isCrit = s==="CRITICAL"||s==="ESCALATE";
    const isHigh = s==="HIGH"||s==="EDD REQUIRED";
    const isMed  = s==="MEDIUM"||s==="REVIEW";
    const color  = isCrit||isHigh ? PINK : isMed ? "#646464" : "#969696";
    return (
      <span className="inline-block border px-1.5 py-0.5" style={{borderColor:color,fontSize:7,fontWeight:700,color,letterSpacing:"0.5px"}}>{s}</span>
    );
  };

  return (
    <div className="space-y-2">
      <CoverFrame
        reportRef="HWK-BATCH-04052026"
        module="BATCH SCREENING ENGINE"
        cap="B" rest="atch Screening Audit Report"
        description="Aggregate screening results for the current batch run. Records list coverage, severity distribution, and per-subject disposition. Generated by the Hawkeye Sterling screening engine."
        leftCard={<Card label="BATCH IDENTIFIER" title="Batch HWK-BATCH-04052026" tags="247 SUBJECTS  ·  8 LISTS APPLIED  ·  HWK-BATCH-04052026" />}
        meta={<MetaGrid cells={[
          {label:"DATE GENERATED",    value:TODAY,                      sub:TIME},
          {label:"ENGINE",            value:"Sonnet-4.6 / Opus-4.7",   sub:"Multi-modal Advisor"},
          {label:"DURATION",          value:"4.2 s",                    sub:"247 Subjects"},
          {label:"OFFICER",           value:"L. Fernanda",               sub:"CO/MLRO"},
          {label:"REPORT IDENTIFIER", value:"HWK-BATCH-04052026",       sub:"Immutable  ·  Signed"},
          {label:"RETENTION",         value:"10 years",                 sub:"FDL 10/2025"},
        ]} />}
      />
      <div className="bg-white">
        <ContentPageTop reportRef="HWK-BATCH-04052026" reg1="FDL 10/2025 ART.9  ·  FATF R.10  ·  CBUAE AML" reg2="STANDARDS §4" page={1} total={1} />
        <div className="px-10 pt-4 pb-6">
          <div style={{fontSize:16,fontWeight:700,color:"#141414",marginBottom:4}}>Batch Screening Audit Report</div>
          <div style={{fontSize:8.5,color:"#828282",marginBottom:14}}>247 subjects  ·  8 critical hits  ·  run duration 4.2 s</div>
          {/* Stats bar */}
          <div className="grid grid-cols-5 gap-2 mb-5">
            {[
              {num:"247",  label:"TOTAL SCREENED", color:"#141414"},
              {num:"8",    label:"CRITICAL HITS",  color:PINK},
              {num:"23",   label:"HIGH RISK",      color:PINK},
              {num:"201",  label:"CLEAR",          color:"#141414"},
              {num:"4.2S", label:"DURATION",       color:"#141414"},
            ].map((s,i) => (
              <div key={i} className="border border-gray-200 flex flex-col items-center justify-center py-2">
                <div style={{fontSize:20,fontWeight:700,color:s.color,lineHeight:1}}>{s.num}</div>
                <div style={{fontSize:6.5,color:"#828282",letterSpacing:"0.5px",marginTop:4}}>{s.label}</div>
              </div>
            ))}
          </div>
          <PartHeader label="PART ONE" num="01" title="Screening results" />
          <table className="w-full border-collapse mb-4" style={{fontSize:8}}>
            <thead>
              <tr className="border-b border-gray-200">
                {["ID","SUBJECT","SCORE","SEVERITY","DISPOSITION","SCREENED"].map(h => (
                  <th key={h} className="text-left pb-1.5 font-bold" style={{fontSize:7,letterSpacing:"0.5px",color:"#141414"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["HS-10043","Nikolai Volkov","78","CRITICAL","ESCALATE",TODAY],
                ["HS-10044","Mohammed Al-Rashidi","84","CRITICAL","ESCALATE",TODAY],
                ["HS-10045","Zhang Wei Corp","61","HIGH","EDD REQUIRED",TODAY],
                ["HS-10046","Fatima Al-Nouri","22","LOW","CLEAR",TODAY],
                ["HS-10047","Karim Enterprises","45","MEDIUM","REVIEW",TODAY],
                ["HS-10048","Ivan Petrov","15","LOW","CLEAR",TODAY],
              ].map((row,i) => (
                <tr key={i} className="border-b border-gray-100">
                  {row.map((cell,j) => (
                    <td key={j} className="py-1.5 pr-2">
                      {(j===3||j===4) ? sevBadge(cell) : <span style={{color:"#323232"}}>{cell}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <PartHeader label="PART TWO" num="02" title="List coverage applied" />
          <p style={{fontSize:9,color:"#464646",marginBottom:16}}>UN Consolidated  ·  OFAC SDN  ·  OFAC Non-SDN  ·  EU CFSP  ·  UK OFSI  ·  UAE EOCN  ·  UAE LTL</p>
          <SigFooter ref="HWK-BATCH-04052026" signers={[
            {name:"L. Fernanda",role:"CO/MLRO  ·  REVIEWER",id:"HS-MLRO-0428",date:TODAY},
            {name:"Engine Operator",role:"BATCH ENGINE",id:"HWK-ENG-0042",date:TODAY},
            {name:"QA Reviewer",role:"SAMPLE AUDIT 5%",id:"HS-QA-0019",date:TODAY},
          ]} />
        </div>
      </div>
    </div>
  );
}

function EvidencePackPreview() {
  return (
    <div className="space-y-2">
      <CoverFrame
        reportRef="EVIDENCE-04052026-001"
        module="MLRO ADVISOR  —  MULTI-MODAL AI"
        cap="M" rest="LRO Advisor Evidence Pack"
        description="Reasoning trail and classifier evidence supporting the advisor's verdict. Hash-chained for tamper-evident review under UAE FDL 10/2025 Art.14 and FATF R.20."
        leftCard={<Card label="ADVISOR SESSION" title="Is Nikolai Volkov subject to sanctions?" tags="SANCTIONS  ·  PEP  ·  ADVERSE MEDIA  ·  EVIDENCE-04052026-001  ·  3,241 MS" />}
        rightCard={<VerdictCard label="VERDICT" value="ESCALATE" sub="File STR · obtain senior approval prior to relationship." />}
        meta={<MetaGrid cells={[
          {label:"DATE / TIME",     value:TODAY,                  sub:TIME},
          {label:"ENGINE",          value:"claude-opus-4-7",      sub:"Advisor Model"},
          {label:"EXECUTOR",        value:"claude-sonnet-4-6",    sub:"Tool-calling"},
          {label:"OFFICER",         value:"L. Fernanda",           sub:"CO/MLRO"},
          {label:"INTEGRITY HASH",  value:"sha256:a3f9c2e1...d84b",sub:"HMAC-Verified"},
          {label:"RETENTION",       value:"10 years",             sub:"FDL 10/2025"},
        ]} />}
      />
      <div className="bg-white">
        <ContentPageTop reportRef="EVIDENCE-04052026-001" reg1="FDL 10/2025 ART.14  ·  FATF R.1-40  ·  CBUAE" reg2="AML STANDARDS" page={1} total={1} />
        <div className="px-10 pt-4 pb-6">
          <div style={{fontSize:16,fontWeight:700,color:"#141414",marginBottom:10}}>MLRO Advisor Evidence Pack</div>
          <VerdictBadge text="ESCALATE" />
          <PartHeader label="PART ONE" num="01" title="Session details" />
          <KVTable rows={[
            ["QUESTION","Is Nikolai Volkov subject to sanctions?"],
            ["MODE","Sanctions · PEP · Adverse Media"],
            ["VERDICT","ESCALATE  —  file STR, obtain senior approval"],
            ["ELAPSED","3,241 ms"],
            ["DATE / TIME",`${TODAY}  ·  ${TIME}`],
            ["INTEGRITY HASH","sha256:a3f9c2e1...d84b (HMAC-verified)"],
          ]} />
          <PartHeader label="PART TWO" num="02" title="Narrative" />
          <DropCapPara text="Based on the multi-modal analysis across sanctions lists, PEP databases, and adverse media sources, the subject presents a critical risk profile. OFAC SDN match at 94% confidence, Tier-2 PEP classification, and three corroborating adverse media articles collectively exceed the filing threshold under UAE FDL 10/2025 Art.14 and FATF R.20." />
          <PartHeader label="PART THREE" num="03" title="Reasoning trail" />
          <PlainTable
            head={["STEP","ACTOR","MODEL","SUMMARY"]}
            rows={[
              ["1","Executor","claude-sonnet-4-6","Sanctions list cross-reference — OFAC SDN hit confirmed"],
              ["2","Executor","claude-sonnet-4-6","PEP classification — Tier 2 · Former Deputy Minister"],
              ["3","Advisor","claude-opus-4-7","Adverse media synthesis — 3 articles · high relevance"],
              ["4","Advisor","claude-opus-4-7","FATF R.20 threshold assessment — STR filing required"],
            ]}
            colWidths={["6%","12%","22%","60%"]}
          />
          <PartHeader label="PART FOUR" num="04" title="Classifier hits" />
          <KVTable rows={[
            ["PRIMARY TOPIC","Sanctions · PEP Exposure"],
            ["FATF RECOMMENDATIONS","R.12 (PEPs) · R.20 (STR) · R.6 (Targeted Financial Sanctions)"],
            ["RED FLAGS","Structuring · Sanctioned jurisdiction nexus · PEP SOW mismatch"],
          ]} labelW={145} />
          <SigFooter ref="EVIDENCE-04052026-001" signers={[
            {name:"L. Fernanda",role:"CO/MLRO  ·  REVIEWER",id:"HS-MLRO-0428",date:TODAY},
            {name:"Advisor Model",role:"CLAUDE-OPUS-4-7",id:"sha256:a3f9c2e1...d84b",extra:"AUTO-SIGNED"},
            {name:"Senior Management",role:"APPROVAL REQUIRED",id:"—",date:"—"},
          ]} />
        </div>
      </div>
    </div>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const REPORTS = [
  { id:"ewra",      label:"EWRA Board Report",  tag:"EWRA-2026-BOARD.pdf",           Preview:EwraPreview },
  { id:"str",       label:"STR Draft",           tag:"STR-DRAFT-04-05-2026.pdf",      Preview:StrPreview },
  { id:"batch",     label:"Batch Audit",         tag:"HWK-BATCH-04052026.pdf",        Preview:BatchPreview },
  { id:"evidence",  label:"Evidence Pack",       tag:"EVIDENCE-04052026-001.pdf",     Preview:EvidencePackPreview },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPreviewPage() {
  const [active, setActive] = useState("ewra");
  const current = REPORTS.find(r => r.id === active) ?? REPORTS[0]!;
  const { Preview } = current;

  return (
    <>
      <Header />
      <div className="min-h-[calc(100vh-84px)] bg-bg px-4 py-8 md:px-10">
        <div className="mb-6">
          <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            PDF OUTPUT LIBRARY
          </div>
          <h1 className="font-display font-normal text-28 md:text-40 leading-[1.1] tracking-tightest text-ink-0 mb-2">
            Report <em className="italic text-brand">designs.</em>
          </h1>
          <p className="text-ink-1 text-13 max-w-[60ch]">
            Every PDF report — rendered live. Cover page + content page for each module.
            The pink drop-cap, security watermark, header bar, and signature footer match the downloaded PDF exactly.
          </p>
        </div>

        {/* tab strip */}
        <div className="flex gap-1 flex-wrap mb-6 border-b border-hair">
          {REPORTS.map(r => (
            <button key={r.id} onClick={() => setActive(r.id)}
              className={`px-3 py-2 text-12 rounded-t transition-colors whitespace-nowrap ${
                active===r.id ? "bg-brand text-white font-semibold" : "text-ink-2 hover:text-ink-0 hover:bg-bg-2"
              }`}
            >{r.label}</button>
          ))}
        </div>

        {/* filename tag */}
        <div className="mb-4 flex items-center gap-2">
          <span className="font-mono text-10 bg-bg-2 border border-hair text-ink-2 px-2.5 py-1 rounded">📄 {current.tag}</span>
          <span className="text-11 text-ink-3">· jsPDF · A4 portrait · Confidential</span>
        </div>

        {/* preview */}
        <div className="overflow-x-auto pb-8 max-w-[794px]">
          <Preview />
        </div>
      </div>
    </>
  );
}
