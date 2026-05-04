"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

// Sample dates — fixed so no SSR/hydration mismatch.
const TODAY = "04/05/2026";
const NOW   = "04/05/2026 10:32:41 GST";

// ── shared PDF chrome ─────────────────────────────────────────────────────────

function ReportShell({
  title,
  module: mod,
  reportRef,
  basis,
  children,
}: {
  title: string;
  module: string;
  reportRef: string;
  basis: string;
  children: React.ReactNode;
}) {
  return (
    <div className="font-mono text-[11px] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg w-full max-w-[794px] mx-auto">
      {/* dark header band */}
      <div className="bg-[#0f0f14] px-5 py-3 flex items-start justify-between">
        <div>
          <div className="text-white font-bold text-[15px] font-sans">{title}</div>
          <div className="text-[#b4b4b4] text-[10px] mt-0.5">{mod} · Hawkeye Sterling DPMS</div>
        </div>
        <div className="text-[#dc3232] text-[9px] font-bold mt-1 text-right">
          CONFIDENTIAL<br />MLRO USE ONLY
        </div>
      </div>
      {/* metadata bar */}
      <div className="bg-[#1e1e23] px-5 py-1.5 text-[#8c8c96] text-[9px] flex gap-4">
        <span>Ref: {reportRef}</span>
        <span>Generated: {NOW}</span>
        <span>By: L. Fernanda</span>
      </div>
      {/* body */}
      <div className="px-6 py-5 space-y-4 bg-white text-[#1e1e28] font-sans text-[11px]">
        {children}
      </div>
      {/* footer */}
      <div className="bg-[#f5f5f8] px-5 py-2 text-[#787890] text-[8px] flex justify-between border-t border-gray-200">
        <span>This document is confidential and intended solely for regulatory compliance purposes. {basis}</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );
}

function RHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-bold text-[#1e1e28]">{children}</div>;
}
function RSub({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-bold text-[#505064] uppercase tracking-widest">{children}</div>
      <div className="border-t border-gray-200 mt-0.5" />
    </div>
  );
}
function RBadge({ label, tone }: { label: string; tone: "red" | "amber" | "green" | "neutral" }) {
  const cls =
    tone === "red" ? "bg-red-600" :
    tone === "amber" ? "bg-amber-500" :
    tone === "green" ? "bg-green-600" : "bg-gray-500";
  return (
    <span className={`${cls} text-white text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-wide`}>
      {label}
    </span>
  );
}
function RKV({ pairs }: { pairs: Array<{ label: string; value: string }> }) {
  return (
    <div className="space-y-1">
      {pairs.map((p) => (
        <div key={p.label} className="flex gap-2">
          <span className="w-36 text-[10px] font-bold text-[#505064] shrink-0">{p.label}</span>
          <span className="text-[10px] text-[#1e1e28]">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
function RTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="bg-[#1e1e28] text-white">
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 text-left font-bold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f8f8fc]"}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 border-b border-gray-100">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RDivider() { return <div className="border-t border-gray-100" />; }
function RPara({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-[#323244] leading-relaxed">{children}</p>;
}

// ── Report previews ───────────────────────────────────────────────────────────

function EwraPreview() {
  return (
    <ReportShell
      title="EWRA / BWRA Board Report"
      module="Module 23 · Risk Assessment"
      reportRef="EWRA-2026-BOARD"
      basis="UAE FDL 10/2025 Art.4 · FATF R.1 · CBUAE AML Standards"
    >
      <RHeader>Enterprise-Wide Risk Assessment — Board Report</RHeader>
      <RBadge label="HIGH RISK" tone="red" />
      <RSub>Executive Summary</RSub>
      <RPara>
        The enterprise risk assessment for the current period identifies elevated exposure across
        three primary dimensions: customer risk (score 72), geographic risk (score 68), and
        products &amp; services risk (score 61). Residual risk remains above appetite in the DPMS
        and cross-border wire categories. Immediate board attention is required on the UAE-Iran
        nexus and virtual asset onboarding controls.
      </RPara>
      <RDivider />
      <RSub>Risk Dimension Scores</RSub>
      <RTable
        columns={["Dimension", "Inherent", "Controls", "Notes"]}
        rows={[
          ["Customer Risk",       "78", "72", "PEP and HNW segment driving inherent score"],
          ["Geographic Risk",     "74", "68", "UAE-Iran corridor · FATF greylist jurisdictions"],
          ["Products & Services", "65", "61", "DPMS · virtual assets · cross-border wire"],
          ["Channels",            "52", "48", "Digital onboarding gap — biometric not deployed"],
          ["Delivery Mechanisms", "45", "42", "Correspondent relationships — 3 pending EDD"],
        ]}
      />
      <RDivider />
      <RSub>Board Recommendations</RSub>
      <RPara>1. Approve deployment of biometric verification for digital onboarding by Q3.</RPara>
      <RPara>2. Exit two correspondent relationships pending +90-day EDD without response.</RPara>
      <RPara>3. Increase MLRO headcount by one FTE — current workload exceeds CBUAE benchmarks.</RPara>
      <RDivider />
      <RSub>Regulatory Context</RSub>
      <RPara>
        UAE FDL No.10/2025 Art.4 requires annual enterprise-wide risk assessments. This report
        satisfies the CBUAE AML Standards §2 board sign-off obligation. Next assessment due: 04/05/2027.
      </RPara>
    </ReportShell>
  );
}

function StrPreview() {
  return (
    <ReportShell
      title="Suspicious Transaction Report — Draft"
      module="STR Workbench"
      reportRef="STR-DRAFT-04-05-2026"
      basis="UAE FDL 10/2025 Art.14 · CBUAE AML Standards §8 · FATF R.20"
    >
      <RHeader>Suspicious Transaction Report — Draft</RHeader>
      <RBadge label="Risk Score 84 / 100" tone="red" />
      <RSub>Report Details</RSub>
      <RKV pairs={[
        { label: "Subject",              value: "Mohammed Al-Rashidi" },
        { label: "Jurisdiction",         value: "UAE · AE-DU" },
        { label: "Composite Risk Score", value: "84 / 100" },
        { label: "Date Prepared",        value: TODAY },
        { label: "Reporting Officer",    value: "L. Fernanda — CO/MLRO" },
      ]} />
      <RDivider />
      <RSub>Narrative</RSub>
      <RPara>
        The subject conducted 14 cash transactions totalling AED 1,240,000 over a 22-day period,
        all structured below the AED 100,000 CTR threshold. Transactions show no plausible business
        rationale given the declared occupation (self-employed, retail). Three deposits were followed
        within 24 hours by international wire transfers to a correspondent account in Türkiye flagged
        on the EOCN. Adverse media identified two articles linking the subject to a Dubai-based hawala
        network (2023). MLRO recommends STR filing under CBUAE AML §8.
      </RPara>
      <RDivider />
      <RSub>Supporting Transactions</RSub>
      <RTable
        columns={["Date", "Amount (AED)", "Description"]}
        rows={[
          ["03/04/2026", "98,500.00",  "Cash deposit — Main St. branch"],
          ["05/04/2026", "97,200.00",  "Cash deposit — DIFC branch"],
          ["07/04/2026", "99,100.00",  "Cash deposit — Deira branch"],
          ["08/04/2026", "245,000.00", "Outward wire — Türkiye · ref. EOCN-44"],
          ["12/04/2026", "96,800.00",  "Cash deposit — Main St. branch"],
          ["14/04/2026", "350,000.00", "Outward wire — Türkiye · ref. EOCN-44"],
        ]}
      />
      <RDivider />
      <RPara>
        This draft STR has been prepared for MLRO review. It must not be disclosed to the subject.
        Filing is required within the timeframe prescribed by CBUAE AML Standards §8 and UAE FDL 10/2025 Art.14.
      </RPara>
    </ReportShell>
  );
}

function GapPreview() {
  return (
    <ReportShell
      title="Governance Gap Analysis"
      module="Management Oversight"
      reportRef="GAP-2026-05"
      basis="UAE FDL 10/2025 Art.20 · CBUAE AML Standards §6"
    >
      <RHeader>Governance Gap Analysis Report</RHeader>
      <RBadge label="Grade C" tone="amber" />
      <RSub>Overall Assessment</RSub>
      <RKV pairs={[
        { label: "Institution",     value: "Hawkeye Sterling DPMS" },
        { label: "Overall Grade",   value: "C — Partial Compliance" },
        { label: "Assessment Date", value: TODAY },
        { label: "Assessed By",     value: "L. Fernanda — CO/MLRO" },
      ]} />
      <RPara>
        The institution demonstrates adequate foundational controls but has material gaps in three
        areas: independent audit function, training frequency, and board-level AML oversight.
        Remediation required before next CBUAE inspection cycle.
      </RPara>
      <RDivider />
      <RSub>Findings</RSub>
      <RTable
        columns={["Area", "Finding", "Severity", "Regulatory Ref"]}
        rows={[
          ["Independent Audit", "No third-party AML audit in past 24 months",       "CRITICAL", "FDL Art.20"],
          ["Training",          "3 staff overdue by 6+ months on AML certification", "HIGH",     "CBUAE §6.4"],
          ["Board Oversight",   "Board AML report not tabled in last two meetings",  "HIGH",     "FDL Art.4"],
          ["STR Timeliness",    "2 STRs filed outside prescribed 30-day window",     "MEDIUM",   "FDL Art.14"],
          ["CDD Refresh",       "14% of customers overdue for periodic CDD review",  "MEDIUM",   "FATF R.10"],
        ]}
      />
      <RDivider />
      <RSub>Recommendations</RSub>
      <RTable
        columns={["Priority", "Action", "Owner", "Deadline"]}
        rows={[
          ["CRITICAL", "Commission independent AML audit",       "Board",   "30/06/2026"],
          ["HIGH",     "Complete overdue training for 3 staff",  "HR/MLRO", "15/05/2026"],
          ["HIGH",     "Table AML report at next board meeting", "MLRO",    "30/05/2026"],
          ["MEDIUM",   "Remediate 14% CDD refresh backlog",     "CO",      "30/07/2026"],
        ]}
      />
    </ReportShell>
  );
}

function ScreeningPreview() {
  return (
    <ReportShell
      title="Customer Screening Report"
      module="Name Screening"
      reportRef="SCR-04052026-001"
      basis="UAE FDL 10/2025 Art.9 · FATF R.10 · CBUAE AML Standards §4"
    >
      <RHeader>Customer Screening Report</RHeader>
      <RBadge label="EDD Required" tone="red" />
      <RSub>Subject Details</RSub>
      <RKV pairs={[
        { label: "Subject Name",    value: "Nikolai Volkov" },
        { label: "Entity Type",     value: "Individual · UBO" },
        { label: "Citizenship",     value: "RU — Russian Federation" },
        { label: "Composite Score", value: "78 / 100" },
        { label: "CDD Posture",     value: "EDD — Enhanced Due Diligence" },
        { label: "Screened On",     value: TODAY },
        { label: "Disposition",     value: "ESCALATE — Senior Approval Required" },
      ]} />
      <RDivider />
      <RSub>Findings</RSub>
      <RPara>• OFAC SDN match — exact name · confidence 94% · list date 12/03/2022</RPara>
      <RPara>• PEP match: Former Deputy Minister, Ministry of Energy (2015–2021) — Tier 2</RPara>
      <RPara>• Adverse media: 3 articles linking subject to sanctioned entity (Kommersant, FT, Reuters)</RPara>
      <RPara>• Jurisdiction risk: RU rated CRITICAL — FATF R.1 · OFAC comprehensive sanctions</RPara>
      <RDivider />
      <RSub>List Coverage</RSub>
      <RTable
        columns={["List", "Result", "Match %", "Date Checked"]}
        rows={[
          ["OFAC SDN",        "HIT",   "94%", TODAY],
          ["UN Consolidated", "HIT",   "87%", TODAY],
          ["EU Consolidated", "CLEAR", "—",   TODAY],
          ["UAE EOCN",        "CLEAR", "—",   TODAY],
          ["UK OFSI",         "HIT",   "91%", TODAY],
        ]}
      />
      <RDivider />
      <RPara>
        This screening report is produced for MLRO and compliance team use only. Results must be
        reviewed against primary source data before a final disposition is recorded.
      </RPara>
    </ReportShell>
  );
}

function MlroMemoPreview() {
  return (
    <ReportShell
      title="MLRO Internal Memorandum"
      module="MLRO Office"
      reportRef="MLRO-MEMO-04052026"
      basis="UAE FDL 10/2025 Art.14 · FATF R.20 · CBUAE AML Standards §8"
    >
      <RHeader>MLRO Internal Memorandum</RHeader>
      <RSub>Memorandum Details</RSub>
      <RKV pairs={[
        { label: "Subject",          value: "Nikolai Volkov — HS-10043" },
        { label: "Date",             value: TODAY },
        { label: "Prepared By",      value: "L. Fernanda — CO/MLRO" },
        { label: "Classification",   value: "CONFIDENTIAL — MLRO USE ONLY" },
        { label: "Regulatory Basis", value: "UAE FDL 10/2025 Art.14 · FATF R.20" },
      ]} />
      <RDivider />
      <RSub>Summary</RSub>
      <RPara>
        Subject Nikolai Volkov (HS-10043) was flagged during routine screening on {TODAY} with an
        OFAC SDN hit (94% confidence) and PEP classification at Tier 2 (Former Deputy Minister,
        Ministry of Energy, Russian Federation 2015–2021). Three adverse media articles corroborate
        association with a sanctioned entity. The composite risk score of 78/100 triggers mandatory
        EDD and senior management approval under UAE FDL 10/2025 Art.14.
      </RPara>
      <RDivider />
      <RSub>Recommendation</RSub>
      <RPara>
        MLRO recommends: (1) Immediate freeze of any pending transactions pending senior management
        review. (2) File STR within 30 days per CBUAE AML Standards §8 if relationship was
        established. (3) Do not establish relationship without written board-level approval.
        (4) Retain all screening evidence for 10 years per FDL Art.24.
      </RPara>
      <RDivider />
      <RPara>
        This memorandum is prepared by and for the MLRO and is protected under legal professional
        privilege where applicable. It is not to be disclosed externally without authorisation.
      </RPara>
    </ReportShell>
  );
}

function BatchPreview() {
  return (
    <ReportShell
      title="Batch Screening Audit Report"
      module="Batch Screening Engine"
      reportRef="HWK-BATCH-04052026"
      basis="UAE FDL 10/2025 Art.9 · FATF R.10 · CBUAE AML Standards §4"
    >
      <RHeader>Batch Screening Audit Report</RHeader>
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Total Screened", value: "247",  tone: "text-[#1e1e28]"  },
          { label: "Critical Hits",  value: "8",    tone: "text-red-600"    },
          { label: "High Risk",      value: "23",   tone: "text-orange-500" },
          { label: "Clear",          value: "201",  tone: "text-green-600"  },
          { label: "Duration",       value: "4.2s", tone: "text-[#1e1e28]"  },
        ].map((s) => (
          <div key={s.label} className="bg-[#f5f5f8] rounded p-2 text-center">
            <div className={`text-[16px] font-bold font-mono ${s.tone}`}>{s.value}</div>
            <div className="text-[8px] text-[#787890] uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>
      <RSub>Screening Results</RSub>
      <RTable
        columns={["ID", "Subject", "Score", "Severity", "Disposition", "Screened"]}
        rows={[
          ["HS-10043", "Nikolai Volkov",      "78", "CRITICAL", "ESCALATE",    TODAY],
          ["HS-10044", "Mohammed Al-Rashidi", "84", "CRITICAL", "ESCALATE",    TODAY],
          ["HS-10045", "Zhang Wei Corp",      "61", "HIGH",     "EDD REQUIRED",TODAY],
          ["HS-10046", "Fatima Al-Nouri",     "22", "LOW",      "CLEAR",       TODAY],
          ["HS-10047", "Karim Enterprises",   "45", "MEDIUM",   "REVIEW",      TODAY],
          ["HS-10048", "Ivan Petrov",         "15", "LOW",      "CLEAR",       TODAY],
        ]}
      />
      <RDivider />
      <RSub>List Coverage Applied</RSub>
      <RPara>UN Consolidated · OFAC SDN · OFAC Non-SDN · EU CFSP · UK OFSI · UAE EOCN · UAE LTL</RPara>
    </ReportShell>
  );
}

function EvidencePackPreview() {
  return (
    <ReportShell
      title="MLRO Advisor Evidence Pack"
      module="MLRO Advisor — Multi-Modal AI"
      reportRef="EVIDENCE-04052026-001"
      basis="UAE FDL 10/2025 · FATF R.1–40 · CBUAE AML Standards"
    >
      <RHeader>MLRO Advisor Evidence Pack</RHeader>
      <RBadge label="Escalate" tone="red" />
      <RSub>Session Details</RSub>
      <RKV pairs={[
        { label: "Question",       value: "Is Nikolai Volkov subject to sanctions?" },
        { label: "Mode",           value: "Sanctions · PEP · Adverse Media" },
        { label: "Verdict",        value: "ESCALATE — file STR, obtain senior approval" },
        { label: "Elapsed",        value: "3,241 ms" },
        { label: "Date / Time",    value: `${TODAY} · ${NOW}` },
        { label: "Integrity Hash", value: "sha256:a3f9c2e1...d84b (HMAC-verified)" },
      ]} />
      <RDivider />
      <RSub>Narrative</RSub>
      <RPara>
        Based on the multi-modal analysis across sanctions lists, PEP databases, and adverse media
        sources, the subject presents a critical risk profile. OFAC SDN match at 94% confidence,
        Tier-2 PEP classification, and three corroborating adverse media articles collectively
        exceed the filing threshold under UAE FDL 10/2025 Art.14 and FATF R.20.
      </RPara>
      <RDivider />
      <RSub>Reasoning Trail</RSub>
      <RTable
        columns={["Step", "Actor", "Model", "Summary"]}
        rows={[
          ["1", "Executor", "claude-sonnet-4-6", "Sanctions list cross-reference — OFAC SDN hit confirmed"],
          ["2", "Executor", "claude-sonnet-4-6", "PEP classification — Tier 2 · Former Deputy Minister"],
          ["3", "Advisor",  "claude-opus-4-7",   "Adverse media synthesis — 3 articles · high relevance"],
          ["4", "Advisor",  "claude-opus-4-7",   "FATF R.20 threshold assessment — STR filing required"],
        ]}
      />
      <RDivider />
      <RSub>Classifier Hits</RSub>
      <RPara>Primary Topic: Sanctions · PEP Exposure</RPara>
      <RPara>FATF Recommendations: R.12 (PEPs) · R.20 (STR) · R.6 (Targeted Financial Sanctions)</RPara>
      <RPara>Red Flags: Structuring · Sanctioned jurisdiction nexus · PEP SOW mismatch</RPara>
    </ReportShell>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const REPORTS = [
  { id: "ewra",      label: "EWRA Board Report",    tag: "EWRA-2026-BOARD.pdf",         Preview: EwraPreview      },
  { id: "str",       label: "STR Draft",            tag: "STR-DRAFT-DD-MM-YYYY.pdf",    Preview: StrPreview       },
  { id: "gap",       label: "Governance Gap",       tag: "GAP-YYYY-MM.pdf",             Preview: GapPreview       },
  { id: "screening", label: "Customer Screening",   tag: "SCR-DD-MM-YYYY.pdf",          Preview: ScreeningPreview },
  { id: "memo",      label: "MLRO Memo",            tag: "MLRO-MEMO-DD-MM-YYYY.pdf",    Preview: MlroMemoPreview  },
  { id: "batch",     label: "Batch Audit",          tag: "HWK-BATCH-DD-MM-YYYY.pdf",    Preview: BatchPreview     },
  { id: "evidence",  label: "Evidence Pack",        tag: "EVIDENCE-DD-MM-YYYY.pdf",     Preview: EvidencePackPreview },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPreviewPage() {
  const [active, setActive] = useState("ewra");
  const current = REPORTS.find((r) => r.id === active) ?? REPORTS[0]!;
  const { Preview } = current;

  return (
    <>
      <Header />
      <div className="min-h-[calc(100vh-84px)] bg-bg px-4 py-8 md:px-10">
        <div className="mb-6">
          <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
            MODULE 00
          </div>
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            PDF OUTPUT LIBRARY
          </div>
          <h1 className="font-display font-normal text-28 md:text-40 leading-[1.1] tracking-tightest text-ink-0 mb-2">
            Report <em className="italic text-brand">designs.</em>
          </h1>
          <p className="text-ink-1 text-13 max-w-[60ch]">
            Every PDF report the platform generates — rendered live so you can review layout,
            content, and formatting. All dates use{" "}
            <span className="font-mono text-brand">dd/mm/yyyy</span>.
          </p>
        </div>

        {/* tab strip */}
        <div className="flex gap-1 flex-wrap mb-6 border-b border-hair">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`px-3 py-2 text-12 rounded-t transition-colors whitespace-nowrap ${
                active === r.id
                  ? "bg-brand text-white font-semibold"
                  : "text-ink-2 hover:text-ink-0 hover:bg-bg-2"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* filename tag */}
        <div className="mb-4 flex items-center gap-2">
          <span className="font-mono text-10 bg-bg-2 border border-hair text-ink-2 px-2.5 py-1 rounded">
            📄 {current.tag}
          </span>
          <span className="text-11 text-ink-3">· jsPDF · A4 portrait · Confidential</span>
        </div>

        {/* preview */}
        <div className="overflow-x-auto pb-8">
          <Preview />
        </div>
      </div>
    </>
  );
}
