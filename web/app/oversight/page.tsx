"use client";

import { useState, useEffect, useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import { DateParts } from "@/components/ui/DateParts";
import { formatDMY } from "@/lib/utils/dateFormat";
import type { GovernanceGapResult } from "@/app/api/governance-gap/route";
import type { BoardAmlReportResult } from "@/app/api/board-aml-report/route";
import type { BoardPackResult } from "@/app/api/oversight/board-pack/route";
import { openReportWindow } from "@/lib/reportOpen";

// Management Oversight — four-eyes approvals, board minutes, regulatory circulars.
// Implements UAE FDL 10/2025 Art.20 (senior management accountability) and
// CBUAE AML Standards §6 (governance & oversight).

type ApprovalStatus = "pending" | "approved" | "rejected" | "escalated";
type CircularDisposition = "implemented" | "in-progress" | "gap-identified" | "noted";

interface Approval {
  id: string;
  title: string;
  requestedBy: string;
  requestedAt: string;
  slaHours: number;
  elapsedHours: number;
  status: ApprovalStatus;
  firstReviewer: string;
  firstSignedAt?: string;
  secondReviewer: string;
  secondSignedAt?: string;
  category: string;
  amount?: string;
  notes: string;
}

interface ActionItem {
  id: string;
  action: string;
  owner: string;
  due: string;
  closed: boolean;
}

interface Minute {
  id: string;
  date: string;
  title: string;
  attendees: string[];
  topics: string[];
  actionItems: ActionItem[];
  minuteRef: string;
  approved: boolean;
}

interface Circular {
  id: string;
  ref: string;
  date: string;
  issuer: string;
  title: string;
  disposition: CircularDisposition;
  owner: string;
  dueDate: string;
  notes: string;
}

const APPROVALS: Approval[] = [
  {
    id: "APV-2025-0089",
    title: "STR filing — DMCC Member 77341 bullion purchase",
    requestedBy: "A. Rahman (Compliance Analyst)",
    requestedAt: "2025-04-24 09:15",
    slaHours: 24,
    elapsedHours: 6,
    status: "pending",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    secondReviewer: "Managing Director",
    category: "STR Filing",
    notes: "Structuring pattern detected across 3 transactions. Threshold: AED 155,000. First reviewer signature pending.",
  },
  {
    id: "APV-2025-0088",
    title: "EDD waiver — low-risk re-classification request",
    requestedBy: "N. Patel (KYC Officer)",
    requestedAt: "2025-04-23 14:00",
    slaHours: 48,
    elapsedHours: 19,
    status: "pending",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-23 16:45",
    secondReviewer: "Managing Director",
    category: "Risk Reclassification",
    notes: "Customer inactive 24 months, no adverse media. First reviewer approved.",
  },
  {
    id: "APV-2025-0085",
    title: "New supplier onboarding — Swiss refinery Argor-Heraeus",
    requestedBy: "T. Ibrahim (Procurement)",
    requestedAt: "2025-04-21 10:30",
    slaHours: 72,
    elapsedHours: 72,
    status: "approved",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-22 09:00",
    secondReviewer: "Managing Director",
    secondSignedAt: "2025-04-22 15:30",
    category: "Supplier DD",
    notes: "LBMA Good Delivery certified. Full CDD completed. Both reviewers approved.",
  },
  {
    id: "APV-2025-0081",
    title: "Cash transaction exemption — diplomatic account",
    requestedBy: "F. Yusuf (Relationship Manager)",
    requestedAt: "2025-04-18 11:00",
    slaHours: 24,
    elapsedHours: 36,
    status: "escalated",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-18 14:00",
    secondReviewer: "Managing Director",
    category: "Policy Exemption",
    amount: "AED 850,000",
    notes: "Escalated to Board Risk Committee — amount exceeds MLRO delegated authority.",
  },
  {
    id: "APV-2025-0077",
    title: "Adverse media override — false positive confirmed",
    requestedBy: "A. Rahman (Compliance Analyst)",
    requestedAt: "2025-04-15 08:00",
    slaHours: 48,
    elapsedHours: 48,
    status: "rejected",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-15 12:00",
    secondReviewer: "Managing Director",
    secondSignedAt: "2025-04-16 09:00",
    category: "Screening Override",
    notes: "MLRO disagreed — media article deemed relevant. Customer placed on enhanced monitoring.",
  },
  // 3 additional seed approvals
  {
    id: "APV-2025-0073",
    title: "PEP annual re-approval — Al-Mansouri Trading LLC",
    requestedBy: "N. Patel (KYC Officer)",
    requestedAt: "2025-04-10 09:00",
    slaHours: 48,
    elapsedHours: 44,
    status: "approved",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-10 14:30",
    secondReviewer: "Managing Director",
    secondSignedAt: "2025-04-11 10:00",
    category: "PEP Re-Approval",
    notes: "Annual senior management re-approval for PEP customer. EDD updated. No adverse media. Approved within SLA.",
  },
  {
    id: "APV-2025-0068",
    title: "Transaction monitoring rule change — Rule TM-044 threshold update",
    requestedBy: "K. Tan (CFO)",
    requestedAt: "2025-04-05 11:00",
    slaHours: 72,
    elapsedHours: 48,
    status: "approved",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-04-06 09:00",
    secondReviewer: "Managing Director",
    secondSignedAt: "2025-04-07 10:30",
    category: "TM Rule Change",
    notes: "Rule TM-044 threshold raised from AED 50,000 to AED 75,000 following calibration analysis. Board Risk Committee notified.",
  },
  {
    id: "APV-2025-0060",
    title: "High-value client onboarding — Refiners International FZC",
    requestedBy: "F. Yusuf (Relationship Manager)",
    requestedAt: "2025-03-28 10:00",
    slaHours: 72,
    elapsedHours: 96,
    status: "approved",
    firstReviewer: "Luisa Fernanda (Compliance Officer)",
    firstSignedAt: "2025-03-29 09:00",
    secondReviewer: "Managing Director",
    secondSignedAt: "2025-04-01 11:00",
    category: "High-Value Onboarding",
    amount: "AED 2,400,000",
    notes: "Full EDD completed. UBO identified. SLA breached by 24h due to additional document collection. Approved.",
  },
];

const MINUTES: Minute[] = [
  {
    id: "MIN-2025-Q2-001",
    date: "15/04/2025",
    title: "Q2 AML/CFT Governance Committee",
    minuteRef: "GC-MIN-2025-0004",
    approved: true,
    attendees: ["Managing Director", "Luisa Fernanda (Compliance Officer)", "K. Tan (CFO)", "R. Mathur (Board Risk)", "A. Hassan (Legal)"],
    topics: [
      "Q1 STR/SAR filing statistics and FIU feedback",
      "LBMA RGG Step-4 audit readiness — target Sep 2025",
      "Sanctions list update: OFAC SDN delta 12 April 2025",
      "Adverse media false-positive rate: 0.8% (target ≤1%)",
      "Staff training completion: 94% (target 100%)",
      "CDD backlog: 3 high-risk customers overdue refresh",
    ],
    actionItems: [
      { id: "AI-001", action: "Commission LBMA Step-4 auditor from accredited list", owner: "S. Okafor", due: "30/04/2025", closed: true },
      { id: "AI-002", action: "Complete 3 overdue high-risk CDD refreshes", owner: "N. Patel", due: "30/04/2025", closed: false },
      { id: "AI-003", action: "Submit Q1 AML report to MoE", owner: "H. Al-Mansoori", due: "15/05/2025", closed: false },
      { id: "AI-004", action: "Schedule remaining 6% staff training completion", owner: "Training Coordinator", due: "31/05/2025", closed: false },
    ],
  },
  {
    id: "MIN-2025-Q1-002",
    date: "14/01/2025",
    title: "Q1 AML/CFT Governance Committee",
    minuteRef: "GC-MIN-2025-0001",
    approved: true,
    attendees: ["Managing Director", "Luisa Fernanda (Compliance Officer)", "K. Tan (CFO)", "R. Mathur (Board Risk)"],
    topics: [
      "2024 annual STR summary — 14 STRs filed, 2 SARs",
      "EWRA / BWRA annual refresh — scores updated",
      "New UAE CBUAE Circular 2/2025 — implementation plan",
      "Transaction monitoring tuning — 3 rules adjusted",
      "Board Risk Committee escalation review",
    ],
    actionItems: [
      { id: "AI-005", action: "Implement CBUAE Circular 2/2025 — update policies", owner: "S. Okafor", due: "31/03/2025", closed: true },
      { id: "AI-006", action: "EWRA board sign-off", owner: "H. Al-Mansoori", due: "28/02/2025", closed: true },
      { id: "AI-007", action: "TM rule tuning sign-off from Board Risk", owner: "R. Mathur", due: "31/01/2025", closed: true },
    ],
  },
];

const CIRCULARS: Circular[] = [
  {
    id: "CIR-001",
    ref: "CBUAE 2/2025",
    date: "10/01/2025",
    issuer: "CBUAE",
    title: "Enhanced Due Diligence for High-Risk Jurisdictions",
    disposition: "implemented",
    owner: "S. Okafor",
    dueDate: "31/03/2025",
    notes: "Policies updated. EDD template revised. Staff trained. Closed.",
  },
  {
    id: "CIR-002",
    ref: "MoE Circular 3/2025",
    date: "01/02/2025",
    issuer: "UAE MoE",
    title: "DNFBP Annual Compliance Reporting — 2025 Template",
    disposition: "in-progress",
    owner: "H. Al-Mansoori",
    dueDate: "31/12/2025",
    notes: "Template downloaded. Data collection started. Due end of year.",
  },
  {
    id: "CIR-003",
    ref: "FATF Guidance Mar-2025",
    date: "15/03/2025",
    issuer: "FATF",
    title: "Virtual Assets: Updated Guidance on Travel Rule",
    disposition: "noted",
    owner: "H. Al-Mansoori",
    dueDate: "—",
    notes: "No VA exposure. Noted for record. No action required.",
  },
  {
    id: "CIR-004",
    ref: "LBMA RGG v9",
    date: "01/01/2025",
    issuer: "LBMA",
    title: "Responsible Gold Guidance Version 9 — Updated Step-4 Requirements",
    disposition: "in-progress",
    owner: "S. Okafor",
    dueDate: "15/09/2025",
    notes: "Step-4 auditor to be commissioned by 30 Apr. Gap assessment underway.",
  },
  {
    id: "CIR-005",
    ref: "EOCN Dec-2024",
    date: "15/12/2024",
    issuer: "EOCN",
    title: "Annual Mineral Supply-Chain Declaration Requirements 2025",
    disposition: "gap-identified",
    owner: "T. Ibrahim",
    dueDate: "31/03/2025",
    notes: "OVERDUE — Declaration not yet filed. Escalated to MLRO 01/04/2025.",
  },
  // 2 additional seed circulars
  {
    id: "CIR-006",
    ref: "NAMLCFTC Mar-2025",
    date: "01/03/2025",
    issuer: "NAMLCFTC",
    title: "National AML/CFT Strategy 2025–2027 — DNFBP Implementation Requirements",
    disposition: "in-progress",
    owner: "Luisa Fernanda (Compliance Officer)",
    dueDate: "30/06/2025",
    notes: "Strategy reviewed. Action plan drafted. Policy update in progress. Presentation to Board Risk scheduled.",
  },
  {
    id: "CIR-007",
    ref: "CBUAE 4/2025",
    date: "15/03/2025",
    issuer: "CBUAE",
    title: "Proliferation Financing Risk Assessment — Guidance for DNFBPs",
    disposition: "gap-identified",
    owner: "S. Okafor",
    dueDate: "30/06/2025",
    notes: "Gap identified: PF risk assessment not yet integrated into EWRA. Working group formed. External consultant engaged.",
  },
];

const APPROVAL_TONE: Record<ApprovalStatus, string> = {
  pending: "bg-amber-dim text-amber",
  approved: "bg-green-dim text-green",
  rejected: "bg-red-dim text-red",
  escalated: "bg-violet-dim text-violet",
};

const DISPOSITION_TONE: Record<CircularDisposition, string> = {
  implemented: "bg-green-dim text-green",
  "in-progress": "bg-blue-dim text-blue",
  "gap-identified": "bg-red-dim text-red",
  noted: "bg-bg-2 text-ink-2",
};

const DISPOSITION_LABEL: Record<CircularDisposition, string> = {
  implemented: "Implemented",
  "in-progress": "In progress",
  "gap-identified": "Gap identified",
  noted: "Noted",
};

const OVERSIGHT_KEY = "hawkeye.oversight.overlay.v1";

interface OversightOverlay {
  deletedApprovalIds: string[];
  deletedMinuteIds: string[];
  deletedCircularIds: string[];
  customApprovals: Approval[];
  customMinutes: Minute[];
  customCirculars: Circular[];
  standaloneActionItems: ActionItem[];
  // Approval sign-off patches: id -> partial Approval
  approvalPatches: Record<string, Partial<Approval>>;
  // Action item status patches: actionId -> closed bool
  actionPatches: Record<string, boolean>;
}

const EMPTY_OVERLAY: OversightOverlay = {
  deletedApprovalIds: [],
  deletedMinuteIds: [],
  deletedCircularIds: [],
  customApprovals: [],
  customMinutes: [],
  customCirculars: [],
  standaloneActionItems: [],
  approvalPatches: {},
  actionPatches: {},
};

function loadOversightOverlay(): OversightOverlay {
  try {
    const raw = localStorage.getItem(OVERSIGHT_KEY);
    if (raw) return { ...EMPTY_OVERLAY, ...(JSON.parse(raw) as Partial<OversightOverlay>) };
  } catch { /* ignore */ }
  return { ...EMPTY_OVERLAY };
}

function saveOversightOverlay(o: OversightOverlay): void {
  try { localStorage.setItem(OVERSIGHT_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

function nowTs(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

type Tab = "approvals" | "minutes" | "circulars" | "action-tracker" | "kpi";


function SlaBar({ elapsed, sla }: { elapsed: number; sla: number }) {
  const pct = Math.min((elapsed / sla) * 100, 100);
  const over = elapsed > sla;
  return (
    <div>
      <div className="flex justify-between text-10 text-ink-3 mb-0.5">
        <span>{elapsed}h elapsed</span>
        <span className={over ? "text-red font-semibold" : ""}>{sla}h SLA {over ? "— BREACHED" : ""}</span>
      </div>
      <div className="w-full bg-bg-2 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${over ? "bg-red" : pct > 75 ? "bg-amber" : "bg-green"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SignBox({
  label,
  signer,
  signedAt,
  editable,
  onNameChange,
}: {
  label: string;
  signer: string;
  signedAt?: string;
  editable?: boolean;
  onNameChange?: (v: string) => void;
}) {
  return (
    <div className={`rounded p-2 border text-12 ${signedAt ? "border-green/30 bg-green-dim" : "border-hair-2 bg-bg-1"}`}>
      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">{label}</div>
      {editable && !signedAt ? (
        <input
          type="text"
          value={signer}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder="— fill in manually —"
          className="w-full font-medium text-ink-0 text-11 bg-transparent border-0 border-b border-hair-2 focus:border-brand focus:outline-none pb-0.5 placeholder:text-ink-3 placeholder:font-normal placeholder:text-10"
        />
      ) : (
        <div className="font-medium text-ink-0 text-11">{signer || "— fill in manually —"}</div>
      )}
      {signedAt
        ? <div className="text-10 text-green font-mono mt-0.5">✓ Signed {signedAt}</div>
        : <div className="text-10 text-amber font-mono mt-0.5">Awaiting signature</div>}
    </div>
  );
}

function AddApprovalForm({ onAdd, onCancel }: { onAdd: (a: Approval) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [slaHours, setSlaHours] = useState("24");
  const [firstReviewer, setFirstReviewer] = useState("");
  const [secondReviewer, setSecondReviewer] = useState("Managing Director");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

  const submit = () => {
    if (!title.trim() || !requestedBy.trim()) { setErr("Title and Requested by are required."); return; }
    const ts = nowTs();
    onAdd({
      id: `APV-CUSTOM-${Date.now()}`,
      title: title.trim(),
      requestedBy: requestedBy.trim(),
      requestedAt: ts,
      slaHours: parseInt(slaHours, 10) || 24,
      elapsedHours: 0,
      status: "pending",
      firstReviewer: firstReviewer.trim() || "Luisa Fernanda (Compliance Officer)",
      secondReviewer: secondReviewer.trim() || "Managing Director",
      category: category.trim() || "General",
      ...(amount.trim() ? { amount: amount.trim() } : {}),
      notes: notes.trim(),
    });
  };

  return (
    <div className="mt-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">New approval request</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}
      <div className="mb-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Approval request title" className={iCls} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Requested by *</label>
          <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name (Role)" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="STR, EDD, Supplier DD…" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">SLA hours</label>
          <input value={slaHours} onChange={(e) => setSlaHours(e.target.value)} placeholder="24" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">First reviewer</label>
          <input value={firstReviewer} onChange={(e) => setFirstReviewer(e.target.value)} placeholder="Compliance Officer" className={iCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Second reviewer</label>
          <input value={secondReviewer} onChange={(e) => setSecondReviewer(e.target.value)} placeholder="Managing Director" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Amount (optional)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="AED 850,000" className={iCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1}
            className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90">Add</button>
        <button type="button" onClick={onCancel} className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">Cancel</button>
      </div>
    </div>
  );
}

function AddMinuteForm({ onAdd, onCancel }: { onAdd: (m: Minute) => void; onCancel: () => void }) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [minuteRef, setMinuteRef] = useState("");
  const [attendees, setAttendees] = useState("");
  const [topics, setTopics] = useState("");
  const [actions, setActions] = useState("");
  const [err, setErr] = useState("");

  const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

  const submit = () => {
    if (!title.trim() || !date.trim()) { setErr("Date and Title are required."); return; }
    const attendeesList = attendees.split(",").map((s) => s.trim()).filter(Boolean);
    const topicsList = topics.split("\n").map((s) => s.trim()).filter(Boolean);
    const actionsList: ActionItem[] = actions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const [action, owner, due] = line.split("|").map((s) => s?.trim() ?? "");
        return {
          id: `AI-CUSTOM-${Date.now()}-${i}`,
          action: action || line,
          owner: owner || "—",
          due: due || "—",
          closed: false,
        };
      });
    onAdd({
      id: `MIN-CUSTOM-${Date.now()}`,
      date: date.trim(),
      title: title.trim(),
      minuteRef: minuteRef.trim() || `MIN-${Date.now()}`,
      attendees: attendeesList,
      topics: topicsList,
      actionItems: actionsList,
      approved: false,
    });
  };

  return (
    <div className="mt-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">New meeting minutes</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Date *</label>
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="2025-04-26" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Board Risk Committee" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Reference</label>
          <input value={minuteRef} onChange={(e) => setMinuteRef(e.target.value)} placeholder="MIN-2025-014" className={iCls} />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Attendees (comma-separated)</label>
        <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="L. Fernanda, MD, A. Rahman" className={iCls} />
      </div>
      <div className="mb-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Topics (one per line)</label>
        <textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={3} placeholder={"Topic one\nTopic two"} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none" />
      </div>
      <div className="mb-4">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Action items (one per line: action | owner | due)</label>
        <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={3} placeholder={"Update KYC policy | L. Fernanda | 2025-05-15"} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90">Add</button>
        <button type="button" onClick={onCancel} className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">Cancel</button>
      </div>
    </div>
  );
}

function AddCircularForm({ onAdd, onCancel }: { onAdd: (c: Circular) => void; onCancel: () => void }) {
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const [issuer, setIssuer] = useState("");
  const [title, setTitle] = useState("");
  const [disposition, setDisposition] = useState<CircularDisposition>("in-progress");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

  const submit = () => {
    if (!ref.trim() || !title.trim()) { setErr("Ref and Title are required."); return; }
    onAdd({
      id: `CIR-CUSTOM-${Date.now()}`,
      ref: ref.trim(),
      date: date || formatDMY(new Date()),
      issuer: issuer.trim() || "—",
      title: title.trim(),
      disposition,
      owner: owner.trim() || "—",
      dueDate: dueDate.trim() || "—",
      notes: notes.trim(),
    });
  };

  return (
    <div className="mt-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">New circular / report</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Ref *</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. CBUAE 3/2025" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Date</label>
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="dd/mm/yyyy" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Issuer</label>
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="e.g. CBUAE" className={iCls} />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Circular or report title" className={iCls} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Disposition</label>
          <select value={disposition} onChange={(e) => setDisposition(e.target.value as CircularDisposition)} className={iCls}>
            <option value="in-progress">In progress</option>
            <option value="implemented">Implemented</option>
            <option value="gap-identified">Gap identified</option>
            <option value="noted">Noted</option>
          </select>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Owner</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Due date</label>
          <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="dd/mm/yyyy or —" className={iCls} />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90">Add</button>
        <button type="button" onClick={onCancel} className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">Cancel</button>
      </div>
    </div>
  );
}

// ── KPI metric card ──────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green" | "amber" | "red" | "blue" | "neutral";
}) {
  const barColor =
    tone === "green"
      ? "bg-green"
      : tone === "amber"
      ? "bg-amber"
      : tone === "red"
      ? "bg-red"
      : tone === "blue"
      ? "bg-blue"
      : "bg-ink-3";
  const textColor =
    tone === "green"
      ? "text-green"
      : tone === "amber"
      ? "text-amber"
      : tone === "red"
      ? "text-red"
      : tone === "blue"
      ? "text-blue"
      : "text-ink-0";

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 flex flex-col gap-1.5">
      <div className={`h-1 w-8 rounded-full ${barColor}`} />
      <div className={`text-28 font-bold font-mono leading-none ${textColor}`}>{value}</div>
      <div className="text-11 font-semibold text-ink-1">{label}</div>
      {sub && <div className="text-10 text-ink-3">{sub}</div>}
    </div>
  );
}

// ── Gap analysis severity badge ──────────────────────────────────────────────
const SEV_TONE: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high: "bg-amber-dim text-amber",
  medium: "bg-blue-dim text-blue",
  low: "bg-bg-2 text-ink-2",
};

const PRI_TONE: Record<string, string> = {
  immediate: "bg-red-dim text-red",
  "short-term": "bg-amber-dim text-amber",
  "medium-term": "bg-blue-dim text-blue",
};

const GRADE_TONE: Record<string, string> = {
  A: "text-green",
  B: "text-blue",
  C: "text-amber",
  D: "text-amber",
  F: "text-red",
};

export default function OversightPage() {
  const [tab, setTab] = useState<Tab>("approvals");
  const [expandedMinute, setExpandedMinute] = useState<string | null>(MINUTES[0]?.id ?? null);
  const [mdName, setMdName] = useState("");
  const [overlay, setOverlay] = useState<OversightOverlay>(EMPTY_OVERLAY);
  const [showAddCircular, setShowAddCircular] = useState(false);
  const [showAddApproval, setShowAddApproval] = useState(false);
  const [showAddMinute, setShowAddMinute] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionText, setNewActionText] = useState("");
  const [newActionOwner, setNewActionOwner] = useState("");
  const [newActionDue, setNewActionDue] = useState("");

  // Inline edit state
  const [editingApprovalId, setEditingApprovalId] = useState<string | null>(null);
  const [editApprovalNotes, setEditApprovalNotes] = useState("");
  const [editingMinuteId, setEditingMinuteId] = useState<string | null>(null);
  const [editMinuteTitle, setEditMinuteTitle] = useState("");
  const [editingCircularId, setEditingCircularId] = useState<string | null>(null);
  const [editCircularNotes, setEditCircularNotes] = useState("");
  const [editCircularOwner, setEditCircularOwner] = useState("");
  const [editCircularDue, setEditCircularDue] = useState("");

  // AI Gap Analysis state
  const [gapLoading, setGapLoading] = useState(false);
  const [gapResult, setGapResult] = useState<GovernanceGapResult | null>(null);
  const [gapError, setGapError] = useState("");
  const [gapOpen, setGapOpen] = useState(false);

  // Board Report state
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardResult, setBoardResult] = useState<(BoardAmlReportResult & { ok: boolean }) | null>(null);
  const [boardError, setBoardError] = useState("");

  // Board Pack state
  const [packLoading, setPackLoading] = useState(false);
  const [packResult, setPackResult] = useState<BoardPackResult | null>(null);
  const [packError, setPackError] = useState("");
  const [packExpandedSection, setPackExpandedSection] = useState<string | null>("executiveSummary");

  useEffect(() => { setOverlay(loadOversightOverlay()); }, []);

  const updateOverlay = (next: OversightOverlay) => { setOverlay(next); saveOversightOverlay(next); };

  const deleteApproval = (id: string) => updateOverlay({ ...overlay, deletedApprovalIds: [...overlay.deletedApprovalIds, id] });
  const deleteMinute = (id: string) => updateOverlay({ ...overlay, deletedMinuteIds: [...overlay.deletedMinuteIds, id] });
  const deleteCircular = (id: string) => updateOverlay({ ...overlay, deletedCircularIds: [...overlay.deletedCircularIds, id] });
  const addApproval = (a: Approval) => { updateOverlay({ ...overlay, customApprovals: [...overlay.customApprovals, a] }); setShowAddApproval(false); };
  const addMinute = (m: Minute) => { updateOverlay({ ...overlay, customMinutes: [...overlay.customMinutes, m] }); setShowAddMinute(false); };
  const addCircular = (c: Circular) => { updateOverlay({ ...overlay, customCirculars: [...overlay.customCirculars, c] }); setShowAddCircular(false); };

  // ── Sign-off actions ───────────────────────────────────────────────────────
  const patchApproval = (id: string, patch: Partial<Approval>) => {
    const existing = overlay.approvalPatches[id] ?? {};
    updateOverlay({
      ...overlay,
      approvalPatches: { ...overlay.approvalPatches, [id]: { ...existing, ...patch } },
    });
  };

  const handleFirstSign = (a: Approval) => {
    patchApproval(a.id, { firstSignedAt: nowTs() });
  };

  const handleSecondSign = (a: Approval) => {
    const signer = mdName.trim() || a.secondReviewer;
    patchApproval(a.id, { secondSignedAt: nowTs(), status: "approved", secondReviewer: signer });
  };

  const handleReject = (a: Approval) => {
    patchApproval(a.id, { status: "rejected" });
  };

  // ── New sign/reject handlers (overlay-based, replaces seed record) ─────────
  const signApproval = (id: string, stage: "first" | "second") => {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const patch = (a: Approval): Approval => {
      if (a.id !== id) return a;
      if (stage === "first") return { ...a, firstSignedAt: ts };
      return { ...a, secondSignedAt: ts, status: "approved" };
    };
    const isCustom = overlay.customApprovals.some((a) => a.id === id);
    if (isCustom) {
      updateOverlay({ ...overlay, customApprovals: overlay.customApprovals.map(patch) });
    } else {
      const orig = liveApprovals.find((a) => a.id === id)!;
      updateOverlay({ ...overlay, deletedApprovalIds: [...overlay.deletedApprovalIds, id], customApprovals: [...overlay.customApprovals, patch(orig)] });
    }
  };

  const rejectApproval = (id: string) => {
    const patch = (a: Approval): Approval => a.id === id ? { ...a, status: "rejected" } : a;
    const isCustom = overlay.customApprovals.some((a) => a.id === id);
    if (isCustom) {
      updateOverlay({ ...overlay, customApprovals: overlay.customApprovals.map(patch) });
    } else {
      const orig = liveApprovals.find((a) => a.id === id)!;
      updateOverlay({ ...overlay, deletedApprovalIds: [...overlay.deletedApprovalIds, id], customApprovals: [...overlay.customApprovals, patch(orig)] });
    }
  };

  // ── Action item toggle ─────────────────────────────────────────────────────
  const toggleAction = (aiId: string, currentlyClosed: boolean) => {
    const standalone = overlay.standaloneActionItems ?? [];
    if (standalone.some((ai) => ai.id === aiId)) {
      updateOverlay({ ...overlay, standaloneActionItems: standalone.map((ai) => ai.id === aiId ? { ...ai, closed: !currentlyClosed } : ai) });
    } else {
      updateOverlay({ ...overlay, actionPatches: { ...overlay.actionPatches, [aiId]: !currentlyClosed } });
    }
  };

  const addStandaloneAction = () => {
    if (!newActionText.trim()) return;
    const id = `AI-STANDALONE-${Date.now()}`;
    const newItem: ActionItem = { id, action: newActionText.trim(), owner: newActionOwner.trim() || "—", due: newActionDue || "—", closed: false };
    updateOverlay({ ...overlay, standaloneActionItems: [...(overlay.standaloneActionItems ?? []), newItem] });
    setNewActionText(""); setNewActionOwner(""); setNewActionDue(""); setShowAddAction(false);
  };

  const toggleActionItem = (minuteId: string, actionId: string, currentlyClosed: boolean) => {
    const patchMinute = (m: Minute): Minute => {
      if (m.id !== minuteId) return m;
      return { ...m, actionItems: m.actionItems.map((ai) => ai.id === actionId ? { ...ai, closed: !currentlyClosed } : ai) };
    };
    const isCustom = overlay.customMinutes.some((m) => m.id === minuteId);
    if (isCustom) {
      updateOverlay({ ...overlay, customMinutes: overlay.customMinutes.map(patchMinute) });
    } else {
      const orig = liveMinutes.find((m) => m.id === minuteId)!;
      updateOverlay({ ...overlay, deletedMinuteIds: [...overlay.deletedMinuteIds, minuteId], customMinutes: [...overlay.customMinutes, patchMinute(orig)] });
    }
  };

  const startEditApproval = (a: Approval) => { setEditingApprovalId(a.id); setEditApprovalNotes(a.notes); };
  const saveEditApproval = (id: string) => {
    const patch = (a: Approval) => a.id === id ? { ...a, notes: editApprovalNotes } : a;
    const isCustom = overlay.customApprovals.some((a) => a.id === id);
    if (isCustom) {
      updateOverlay({ ...overlay, customApprovals: overlay.customApprovals.map(patch) });
    } else {
      const orig = [...APPROVALS, ...overlay.customApprovals].find((a) => a.id === id)!;
      updateOverlay({ ...overlay, deletedApprovalIds: [...overlay.deletedApprovalIds, id], customApprovals: [...overlay.customApprovals, patch(orig)] });
    }
    setEditingApprovalId(null);
  };

  const startEditMinute = (m: Minute) => { setEditingMinuteId(m.id); setEditMinuteTitle(m.title); };
  const saveEditMinute = (id: string) => {
    const patch = (m: Minute) => m.id === id ? { ...m, title: editMinuteTitle } : m;
    const isCustom = overlay.customMinutes.some((m) => m.id === id);
    if (isCustom) {
      updateOverlay({ ...overlay, customMinutes: overlay.customMinutes.map(patch) });
    } else {
      const orig = [...MINUTES, ...overlay.customMinutes].find((m) => m.id === id)!;
      updateOverlay({ ...overlay, deletedMinuteIds: [...overlay.deletedMinuteIds, id], customMinutes: [...overlay.customMinutes, patch(orig)] });
    }
    setEditingMinuteId(null);
  };

  const startEditCircular = (c: Circular) => { setEditingCircularId(c.id); setEditCircularNotes(c.notes); setEditCircularOwner(c.owner); setEditCircularDue(c.dueDate); };
  const saveEditCircular = (id: string) => {
    const patch = (c: Circular) => c.id === id ? { ...c, notes: editCircularNotes, owner: editCircularOwner, dueDate: editCircularDue } : c;
    const isCustom = overlay.customCirculars.some((c) => c.id === id);
    if (isCustom) {
      updateOverlay({ ...overlay, customCirculars: overlay.customCirculars.map(patch) });
    } else {
      const orig = [...CIRCULARS, ...overlay.customCirculars].find((c) => c.id === id)!;
      updateOverlay({ ...overlay, deletedCircularIds: [...overlay.deletedCircularIds, id], customCirculars: [...overlay.customCirculars, patch(orig)] });
    }
    setEditingCircularId(null);
  };

  // ── Live data (seed + custom, with patches applied) ────────────────────────
  const applyApprovalPatch = (a: Approval): Approval => {
    const p = overlay.approvalPatches[a.id];
    return p ? { ...a, ...p } : a;
  };

  const applyActionPatch = (ai: ActionItem): ActionItem => {
    const p = overlay.actionPatches[ai.id];
    return p !== undefined ? { ...ai, closed: p } : ai;
  };

  const liveApprovals = useMemo(
    () =>
      [
        ...APPROVALS.filter((a) => !overlay.deletedApprovalIds.includes(a.id)),
        ...overlay.customApprovals,
      ].map(applyApprovalPatch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlay],
  );

  const liveMinutes = useMemo(
    () =>
      [...MINUTES.filter((m) => !overlay.deletedMinuteIds.includes(m.id)), ...overlay.customMinutes].map(
        (m) => ({
          ...m,
          actionItems: m.actionItems.map(applyActionPatch),
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlay],
  );

  const liveCirculars = useMemo(
    () => [...CIRCULARS.filter((c) => !overlay.deletedCircularIds.includes(c.id)), ...overlay.customCirculars],
    [overlay],
  );

  // ── KPI calculations ──────────────────────────────────────────────────────
  const allActionItems = useMemo(
    () => [
      ...liveMinutes.flatMap((m) =>
        m.actionItems.map((ai) => ({ ...ai, meetingTitle: m.title, meetingId: m.id })),
      ),
      ...(overlay.standaloneActionItems ?? []).map((ai) => ({ ...ai, meetingTitle: "—", meetingId: "standalone" })),
    ],
    [liveMinutes, overlay.standaloneActionItems],
  );

  const openActionsCount = allActionItems.filter((ai) => !ai.closed).length;
  const openActions = openActionsCount;


  const pendingApprovals = liveApprovals.filter((a) => a.status === "pending").length;
  const slaBreached = liveApprovals.filter((a) => a.status === "pending" && a.elapsedHours > a.slaHours).length;
  const gaps = liveCirculars.filter((c) => c.disposition === "gap-identified").length;

  // SLA compliance: approved within SLA (elapsedHours <= slaHours)
  const approvedTotal = liveApprovals.filter((a) => a.status === "approved").length;
  const approvedWithinSla = liveApprovals.filter(
    (a) => a.status === "approved" && a.elapsedHours <= a.slaHours,
  ).length;
  const slaPct = approvedTotal > 0 ? Math.round((approvedWithinSla / approvedTotal) * 100) : 0;

  // Meetings this quarter (Q2 2025: Apr–Jun)
  const meetingsThisQuarter = liveMinutes.filter((m) => {
    const parts = m.date.split("/");
    if (parts.length < 3) return false;
    const month = parseInt(parts[1] ?? "0", 10);
    return month >= 4 && month <= 6;
  }).length;

  // ── AI Gap Analysis ───────────────────────────────────────────────────────
  const runGapAnalysis = async () => {
    setGapLoading(true);
    setGapError("");
    try {
      const res = await fetch("/api/governance-gap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvals: liveApprovals,
          minutes: liveMinutes,
          circulars: liveCirculars,
          institutionName: "Hawkeye Sterling DMCC",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GovernanceGapResult;
      setGapResult(data);
      setGapOpen(true);
    } catch (e) {
      setGapError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGapLoading(false);
    }
  };

  // ── Board Report ──────────────────────────────────────────────────────────
  const generateBoardReport = async () => {
    setBoardLoading(true);
    setBoardError("");
    try {
      const res = await fetch("/api/board-aml-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          institutionName: "Hawkeye Sterling DMCC",
          reportingPeriod: "Q2 2025",
          context: `Pending approvals: ${pendingApprovals}. SLA breaches: ${slaBreached}. Open action items: ${openActionsCount}. Regulatory gaps: ${gaps}. SLA compliance: ${slaPct}%. Meetings this quarter: ${meetingsThisQuarter}.`,
          strCount: liveApprovals.filter((a) => a.category === "STR Filing").length.toString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BoardAmlReportResult & { ok: boolean };
      setBoardResult(data);
    } catch (e) {
      setBoardError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBoardLoading(false);
    }
  };

  // ── Board Pack ───────────────────────────────────────────────────────────
  const generateBoardPack = async () => {
    setPackLoading(true);
    setPackError("");
    try {
      const res = await fetch("/api/oversight/board-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pendingApprovals,
          slaBreached,
          gaps,
          gapGrade: gapResult?.overallGrade,
          kpiSnapshot: {
            "Approval SLA %": slaPct,
            "Open action items": openActionsCount,
            "Meetings this quarter": meetingsThisQuarter,
            "Total approvals": liveApprovals.length,
            "Circulars tracked": liveCirculars.length,
            "Circulars implemented": liveCirculars.filter((c) => c.disposition === "implemented").length,
          },
          meetingDate: new Date().toLocaleDateString("en-GB"),
          institutionName: "Hawkeye Sterling DMCC",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as BoardPackResult;
      setPackResult(data);
      setPackExpandedSection("executiveSummary");
    } catch (e) {
      setPackError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPackLoading(false);
    }
  };

  const TAB_LABELS: Record<Tab, string> = {
    approvals: "⚖️ Approvals",
    minutes: "Meeting minutes",
    circulars: "📜 Circulars",
    "action-tracker": `✅ Action tracker${openActions > 0 ? ` (${openActions})` : ""}`,
    kpi: "📊 KPI Dashboard",
  };

  return (
    <ModuleLayout asanaModule="oversight" asanaLabel="Oversight" engineLabel="Governance engine">
      <ModuleHero
        moduleNumber={26}
        eyebrow="Module 26 · Governance"
        title="Management"
        titleEm="oversight."
        intro={
          <>
            <strong>FDL 10/2025 Art.20 · CBUAE AML Standards §6.</strong>{" "}
            Four-eyes approval workflow, board & committee minutes, and regulatory circular disposition.
            All approvals require two independent signatories. SLA breaches escalate to MLRO automatically.
          </>
        }
        kpis={[
          { value: String(pendingApprovals), label: "pending approvals", tone: pendingApprovals > 0 ? "amber" : undefined },
          { value: String(slaBreached), label: "SLA breached", tone: slaBreached > 0 ? "red" : undefined },
          { value: String(openActionsCount), label: "open action items", tone: openActionsCount > 0 ? "amber" : undefined },
          { value: String(gaps), label: "regulatory gaps", tone: gaps > 0 ? "red" : undefined },
          { value: String(liveCirculars.filter((c) => c.disposition === "implemented").length), label: "circulars closed" },
        ]}
      />

      {/* AI Gap Analysis panel */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => void runGapAnalysis()}
            disabled={gapLoading}
            className="text-12 font-semibold px-4 py-2 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
          >
            {gapLoading ? "◌ Analysing…" : "✦AI Gap Analysis"}
          </button>
          {gapOpen && gapResult && (
            <button type="button" onClick={() => setGapOpen(false)} className="text-11 text-ink-2 hover:text-ink-0">
              Hide report ▲
            </button>
          )}
          {gapError && <span className="text-11 text-red">{gapError}</span>}
          {gapResult && !gapLoading && !gapOpen && (
            <span className="text-11 text-ink-3">
              Overall grade:{" "}
              <span className={`font-bold font-mono text-14 ${GRADE_TONE[gapResult.overallGrade] ?? "text-ink-0"}`}>
                {gapResult.overallGrade}
              </span>
            </span>
          )}
        </div>

        {gapOpen && gapResult && (
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 flex flex-col gap-5">
            {/* Grade + rationale */}
            <div className="flex gap-4 items-start">
              <div className={`text-48 font-bold font-mono leading-none ${GRADE_TONE[gapResult.overallGrade] ?? "text-ink-0"}`}>
                {gapResult.overallGrade}
              </div>
              <div>
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Overall governance grade</div>
                <div className="text-12 text-ink-1 leading-relaxed">{gapResult.gradeRationale}</div>
              </div>
            </div>

            {/* Critical gaps */}
            {gapResult.criticalGaps.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-red mb-2">Critical gaps</div>
                <ul className="flex flex-col gap-1.5">
                  {gapResult.criticalGaps.map((g, i) => (
                    <li key={i} className="flex gap-2 text-12 text-ink-1">
                      <span className="shrink-0 text-red font-mono text-10 mt-0.5">!</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Findings table */}
            {gapResult.findings.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Findings</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-11">
                    <thead className="bg-bg-1 border-b border-hair-2">
                      <tr>
                        {["Area", "Finding", "Severity", "Regulatory ref"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gapResult.findings.map((f, i) => (
                        <tr key={i} className="border-b border-hair last:border-0">
                          <td className="px-3 py-2 font-medium text-ink-0 whitespace-nowrap">{f.area}</td>
                          <td className="px-3 py-2 text-ink-1 max-w-xs">{f.finding}</td>
                          <td className="px-3 py-2">
                            <span className={`font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm ${SEV_TONE[f.severity] ?? ""}`}>
                              {f.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-10 text-ink-3">{f.regulatoryRef}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {gapResult.recommendations.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Recommendations</div>
                <div className="flex flex-col gap-2">
                  {gapResult.recommendations.map((r, i) => (
                    <div key={i} className="flex gap-3 text-12">
                      <span className={`shrink-0 font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm h-fit mt-0.5 ${PRI_TONE[r.priority] ?? ""}`}>
                        {r.priority}
                      </span>
                      <div>
                        <div className="text-ink-1">{r.action}</div>
                        <div className="text-10 text-ink-3 font-mono mt-0.5">{r.owner} · {r.deadline}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regulatory risks */}
            {gapResult.regulatoryRisks.length > 0 && (
              <div>
                <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Regulatory risks</div>
                <div className="flex flex-col gap-2">
                  {gapResult.regulatoryRisks.map((r, i) => (
                    <div key={i} className="bg-bg-1 rounded p-3 text-11">
                      <div className="flex gap-2 items-start mb-1">
                        <span className={`shrink-0 font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm ${SEV_TONE[r.likelihood] ?? ""}`}>
                          {r.likelihood}
                        </span>
                        <span className="text-ink-1">{r.risk}</span>
                      </div>
                      <div className="text-10 text-ink-3 pl-0">{r.mitigant}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gapResult.summary && (
              <div className="border-t border-hair-2 pt-4 text-12 text-ink-2 italic">{gapResult.summary}</div>
            )}
            <div className="border-t border-hair-2 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => openReportWindow("/api/gap-report", { gapResult, institution: "Hawkeye Sterling DPMS" })}
                className="text-11 font-mono"
                style={{ color: "#7c3aed", fontWeight: 600 }}
              >
                PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-hair-2 overflow-x-auto">
        {(["approvals", "minutes", "circulars", "action-tracker", "kpi"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
              tab === t
                ? "border-brand text-brand bg-brand-dim"
                : t === "action-tracker" && openActions > 0
                ? "border-transparent text-amber hover:text-amber/80 hover:bg-bg-1"
                : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* APPROVALS TAB */}
      {tab === "approvals" && (
        <div className="flex flex-col gap-4">
          {showAddApproval ? (
            <AddApprovalForm onAdd={addApproval} onCancel={() => setShowAddApproval(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddApproval(true)}
              className="self-start text-11 font-semibold px-4 py-2 rounded border border-brand text-brand hover:bg-brand-dim transition-colors"
            >
              + Add
            </button>
          )}
          {liveApprovals.map((a) => (
            <div key={a.id} className="relative bg-bg-panel border border-hair-2 rounded-lg p-4">
              {editingApprovalId === a.id && (
                <div className="mb-3 space-y-2 pr-8">
                  <textarea
                    className="w-full text-11 px-2 py-1.5 rounded border border-brand bg-bg-0 text-ink-0"
                    rows={3}
                    value={editApprovalNotes}
                    onChange={(e) => setEditApprovalNotes(e.target.value)}
                    placeholder="Notes"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEditApproval(a.id)}
                      className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                    <button type="button" onClick={() => setEditingApprovalId(null)}
                      className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
                  </div>
                </div>
              )}
              <div className="absolute top-2 right-2 z-10">
                <RowActions
                  label={a.title}
                  onEdit={() => startEditApproval(a)}
                  onDelete={() => deleteApproval(a.id)}
                  confirmDelete={false}
                />
              </div>
              <div className="flex items-start justify-between gap-3 mb-3 pr-6">
                <div>
                  <div className="font-mono text-10 text-ink-3">{a.id}</div>
                  <div className="text-14 font-semibold text-ink-0 mt-0.5">{a.title}</div>
                  <div className="text-11 text-ink-2 mt-0.5">
                    {a.category} · Requested by {a.requestedBy} · {a.requestedAt}
                    {a.amount && <> · <span className="font-mono">{a.amount}</span></>}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${APPROVAL_TONE[a.status]}`}>
                  {a.status}
                </span>
              </div>

              {a.status === "pending" && (
                <div className="mb-3">
                  <SlaBar elapsed={a.elapsedHours} sla={a.slaHours} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <SignBox label="First reviewer" signer={a.firstReviewer} signedAt={a.firstSignedAt} />
                <SignBox
                  label="Second reviewer"
                  signer={a.secondSignedAt ? a.secondReviewer : mdName}
                  signedAt={a.secondSignedAt}
                  editable={!a.secondSignedAt}
                  onNameChange={setMdName}
                />
              </div>

              <div className="text-12 text-ink-2 border-l-2 border-hair-2 pl-3 mb-3">
                {a.notes}
              </div>

              {a.status === "pending" && !a.firstSignedAt && (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => signApproval(a.id, "first")}
                    className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1"
                  >
                    Approve (Sign)
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectApproval(a.id)}
                    className="text-11 font-semibold px-3 py-1.5 rounded border border-red text-red hover:bg-red-dim"
                  >
                    Reject
                  </button>
                </div>
              )}
              {a.status === "pending" && a.firstSignedAt && !a.secondSignedAt && (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => signApproval(a.id, "second")}
                    className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1"
                  >
                    Second sign-off
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectApproval(a.id)}
                    className="text-11 font-semibold px-3 py-1.5 rounded border border-red text-red hover:bg-red-dim"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MINUTES TAB */}
      {tab === "minutes" && (
        <div className="flex flex-col gap-4">
          {showAddMinute ? (
            <AddMinuteForm onAdd={addMinute} onCancel={() => setShowAddMinute(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddMinute(true)}
              className="self-start text-11 font-semibold px-4 py-2 rounded border border-brand text-brand hover:bg-brand-dim transition-colors"
            >
              + Add
            </button>
          )}
          {liveMinutes.map((m) => {
            const expanded = expandedMinute === m.id;
            const openAI = m.actionItems.filter((ai) => !ai.closed).length;
            return (
              <div key={m.id} className="relative bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
                {editingMinuteId === m.id && (
                  <div className="px-4 py-2 border-b border-hair-2 space-y-2">
                    <input
                      className="w-full text-12 px-2 py-1.5 rounded border border-brand bg-bg-0 text-ink-0"
                      value={editMinuteTitle}
                      onChange={(e) => setEditMinuteTitle(e.target.value)}
                      placeholder="Meeting title"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveEditMinute(m.id)}
                        className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                      <button type="button" onClick={() => setEditingMinuteId(null)}
                        className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
                    </div>
                  </div>
                )}
                <div className="absolute top-2 right-2 z-10">
                  <RowActions
                    label={`minute ${m.id}`}
                    onEdit={() => startEditMinute(m)}
                    onDelete={() => deleteMinute(m.id)}
                    confirmDelete={false}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedMinute(expanded ? null : m.id)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors pr-10"
                >
                  <div>
                    <div className="font-mono text-10 text-ink-3">{m.minuteRef}</div>
                    <div className="text-14 font-semibold text-ink-0 mt-0.5">{m.title}</div>
                    <div className="text-11 text-ink-2 mt-0.5">
                      {m.date} · {m.attendees.length} attendees · {m.actionItems.length} actions
                      {openAI > 0 && <span className="ml-1.5 text-amber font-semibold">({openAI} open)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.approved && (
                      <span className="bg-green-dim text-green font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm">
                        Approved
                      </span>
                    )}
                    <span className="text-ink-3 text-14">{expanded ? "▲" : "▾"}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-hair-2 px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Topics */}
                      <div>
                        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Topics discussed</div>
                        <ul className="flex flex-col gap-1.5">
                          {m.topics.map((topic, i) => (
                            <li key={i} className="flex gap-2 text-12 text-ink-1">
                              <span className="font-mono text-10 text-brand shrink-0 mt-0.5">{i + 1}.</span>
                              {topic}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3">
                          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">Attendees</div>
                          <div className="flex flex-wrap gap-1">
                            {m.attendees.map((a) => (
                              <span key={a} className="text-10 font-mono bg-bg-2 text-ink-1 px-1.5 py-px rounded">{a}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action items */}
                      <div>
                        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Action items</div>
                        <table className="w-full text-11">
                          <thead>
                            <tr className="border-b border-hair-2">
                              <th className="text-left pb-1.5 text-10 uppercase tracking-wide-3 text-ink-3 font-mono">Action</th>
                              <th className="text-left pb-1.5 text-10 uppercase tracking-wide-3 text-ink-3 font-mono">Owner</th>
                              <th className="text-left pb-1.5 text-10 uppercase tracking-wide-3 text-ink-3 font-mono">Due</th>
                              <th className="text-left pb-1.5 text-10 uppercase tracking-wide-3 text-ink-3 font-mono">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.actionItems.map((ai) => (
                              <tr key={ai.id} className="border-b border-hair last:border-0">
                                <td className="py-1.5 pr-2 text-ink-1">{ai.action}</td>
                                <td className="py-1.5 pr-2 font-mono text-10 text-ink-2 whitespace-nowrap">{ai.owner}</td>
                                <td className="py-1.5 pr-2 font-mono text-10 text-ink-2 whitespace-nowrap">{ai.due}</td>
                                <td className="py-1.5">
                                  <span className={`font-mono text-10 px-1.5 py-px rounded-sm font-semibold uppercase ${ai.closed ? "bg-green-dim text-green" : "bg-amber-dim text-amber"}`}>
                                    {ai.closed ? "Closed" : "Open"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CIRCULARS TAB */}
      {tab === "circulars" && (
        <>
          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Ref", "Date", "Issuer", "Title", "Owner", "Due", "Disposition", "Notes", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveCirculars.map((c, i) => (
                  <>
                    <tr key={c.id} className={i < liveCirculars.length - 1 ? "border-b border-hair" : ""}>
                      <td className="px-3 py-2.5 font-mono text-11 text-ink-0 whitespace-nowrap">{c.ref}</td>
                      <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{c.date}</td>
                      <td className="px-3 py-2.5 text-11 text-ink-2 whitespace-nowrap">{c.issuer}</td>
                      <td className="px-3 py-2.5 text-ink-0 font-medium max-w-[220px]">{c.title}</td>
                      <td className="px-3 py-2.5 text-11 text-ink-2 whitespace-nowrap">{editingCircularId === c.id ? <input className="text-11 px-1.5 py-1 rounded border border-brand bg-bg-0 text-ink-0 w-28" value={editCircularOwner} onChange={(e) => setEditCircularOwner(e.target.value)} /> : c.owner}</td>
                      <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{editingCircularId === c.id ? <DateParts className="text-10 px-1 py-1 rounded border border-brand bg-bg-0 text-ink-0" value={editCircularDue} onChange={setEditCircularDue} /> : c.dueDate}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DISPOSITION_TONE[c.disposition]}`}>
                          {DISPOSITION_LABEL[c.disposition]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-11 text-ink-2 max-w-[200px]">
                        {editingCircularId === c.id
                          ? <input className="text-11 px-1.5 py-1 rounded border border-brand bg-bg-0 text-ink-0 w-full" value={editCircularNotes} onChange={(e) => setEditCircularNotes(e.target.value)} />
                          : <span className="truncate block" title={c.notes}>{c.notes}</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {editingCircularId === c.id ? (
                          <div className="flex gap-1">
                            <button type="button" onClick={() => saveEditCircular(c.id)} className="text-10 font-semibold px-2 py-0.5 rounded bg-ink-0 text-bg-0">Save</button>
                            <button type="button" onClick={() => setEditingCircularId(null)} className="text-10 px-2 py-0.5 rounded text-ink-2">✕</button>
                          </div>
                        ) : (
                          <RowActions
                            label={`circular ${c.id}`}
                            onEdit={() => startEditCircular(c)}
                            onDelete={() => deleteCircular(c.id)}
                            confirmDelete={false}
                          />
                        )}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {showAddCircular ? (
            <AddCircularForm onAdd={addCircular} onCancel={() => setShowAddCircular(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddCircular(true)}
              className="text-11 font-semibold px-4 py-2 rounded border border-brand text-brand hover:bg-brand-dim transition-colors"
            >
              + Add
            </button>
          )}
        </>
      )}

      {/* ACTION TRACKER TAB */}
      {tab === "action-tracker" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-14 font-semibold text-ink-0">All action items</div>
              <div className="text-11 text-ink-3 mt-0.5">
                {openActionsCount} open · {allActionItems.length - openActionsCount} closed · {allActionItems.length} total
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddAction((v) => !v)}
              className="text-11 font-semibold px-3 py-1.5 rounded border border-brand text-brand hover:bg-brand-dim transition-colors"
            >
              {showAddAction ? "Cancel" : "+ Add Action Item"}
            </button>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["ID", "Action", "Owner", "Due", "Meeting", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allActionItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-11 text-ink-3">No action items found.</td>
                  </tr>
                )}
                {allActionItems.map((ai, i) => (
                  <tr key={ai.id} className={i < allActionItems.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{ai.id}</td>
                    <td className="px-3 py-2.5 text-ink-1 max-w-[260px]">{ai.action}</td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{ai.owner}</td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{ai.due}</td>
                    <td className="px-3 py-2.5 text-11 text-ink-2 max-w-[160px]">
                      <span className="truncate block" title={ai.meetingTitle}>{ai.meetingTitle}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`font-mono text-10 px-1.5 py-px rounded-sm font-semibold uppercase ${ai.closed ? "bg-green-dim text-green" : "bg-amber-dim text-amber"}`}>
                        {ai.closed ? "Closed" : "Open"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleAction(ai.id, ai.closed)}
                        className={`text-10 font-semibold px-2 py-0.5 rounded border transition-colors ${
                          ai.closed
                            ? "border-amber text-amber hover:bg-amber-dim"
                            : "border-green text-green hover:bg-green-dim"
                        }`}
                      >
                        {ai.closed ? "Reopen" : "Close"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddAction && (
            <div className="mt-3 bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">New action item</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="col-span-1">
                  <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Owner</label>
                  <input value={newActionOwner} onChange={(e) => setNewActionOwner(e.target.value)} placeholder="Name (Role)" className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" />
                </div>
                <div className="col-span-1">
                  <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Due date</label>
                  <input type="date" value={newActionDue} onChange={(e) => setNewActionDue(e.target.value)} className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand" />
                </div>
                <div className="col-span-1" />
              </div>
              <div className="mb-3">
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Action *</label>
                <textarea value={newActionText} onChange={(e) => setNewActionText(e.target.value)} rows={2} placeholder="Describe the action required…" className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand resize-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addStandaloneAction} disabled={!newActionText.trim()} className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">Add</button>
                <button type="button" onClick={() => setShowAddAction(false)} className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI DASHBOARD TAB */}
      {tab === "kpi" && (
        <div className="flex flex-col gap-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Approval SLA compliance"
              value={`${slaPct}%`}
              sub={`${approvedWithinSla} of ${approvedTotal} approved within SLA`}
              tone={slaPct >= 90 ? "green" : slaPct >= 70 ? "amber" : "red"}
            />
            <KpiCard
              label="Open action items"
              value={openActionsCount}
              sub={`${allActionItems.length - openActionsCount} closed of ${allActionItems.length} total`}
              tone={openActionsCount === 0 ? "green" : openActionsCount <= 3 ? "amber" : "red"}
            />
            <KpiCard
              label="Circulars with gaps"
              value={gaps}
              sub={`${liveCirculars.filter((c) => c.disposition === "implemented").length} fully implemented`}
              tone={gaps === 0 ? "green" : gaps === 1 ? "amber" : "red"}
            />
            <KpiCard
              label="Meetings this quarter"
              value={meetingsThisQuarter}
              sub="Q2 2025 (Apr–Jun) · target ≥2"
              tone={meetingsThisQuarter >= 2 ? "green" : meetingsThisQuarter === 1 ? "amber" : "red"}
            />
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Pending approvals"
              value={pendingApprovals}
              sub="Awaiting sign-off"
              tone={pendingApprovals === 0 ? "green" : pendingApprovals <= 2 ? "amber" : "red"}
            />
            <KpiCard
              label="SLA breaches (pending)"
              value={slaBreached}
              sub="Active breaches — escalate immediately"
              tone={slaBreached === 0 ? "green" : "red"}
            />
            <KpiCard
              label="Total approvals"
              value={liveApprovals.length}
              sub={`${approvedTotal} approved · ${liveApprovals.filter((a) => a.status === "rejected").length} rejected`}
              tone="neutral"
            />
            <KpiCard
              label="Circulars tracked"
              value={liveCirculars.length}
              sub={`${liveCirculars.filter((c) => c.disposition === "in-progress").length} in progress`}
              tone="blue"
            />
          </div>

          {/* SLA compliance visual indicator */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Approval SLA compliance breakdown</div>
            <div className="flex gap-2 flex-wrap mb-3">
              {liveApprovals.filter((a) => a.status === "approved").map((a) => (
                <div
                  key={a.id}
                  title={`${a.id} — ${a.elapsedHours}h / ${a.slaHours}h SLA`}
                  className={`w-6 h-6 rounded flex items-center justify-center text-8 font-mono font-bold ${
                    a.elapsedHours <= a.slaHours ? "bg-green-dim text-green" : "bg-red-dim text-red"
                  }`}
                >
                  {a.elapsedHours <= a.slaHours ? "✓" : "!"}
                </div>
              ))}
              {liveApprovals.filter((a) => a.status === "pending").map((a) => (
                <div
                  key={a.id}
                  title={`${a.id} — pending — ${a.elapsedHours}h / ${a.slaHours}h SLA`}
                  className="w-6 h-6 rounded bg-amber-dim text-amber flex items-center justify-center text-8 font-mono font-bold"
                >
                  ?
                </div>
              ))}
              {liveApprovals.filter((a) => a.status === "rejected" || a.status === "escalated").map((a) => (
                <div
                  key={a.id}
                  title={`${a.id} — ${a.status}`}
                  className="w-6 h-6 rounded bg-bg-2 text-ink-3 flex items-center justify-center text-8 font-mono font-bold"
                >
                  —
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-10 text-ink-3">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-dim text-green text-center leading-3 font-bold">✓</span> Within SLA</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-dim text-red text-center leading-3 font-bold">!</span> Breached</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-dim text-amber text-center leading-3 font-bold">?</span> Pending</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-bg-2 text-ink-3 text-center leading-3 font-bold">—</span> Rejected/Escalated</span>
            </div>
          </div>

          {/* Generate Board Pack */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-13 font-semibold text-ink-0">📋 Generate Board Pack</div>
                <div className="text-11 text-ink-3 mt-0.5">
                  Produces a formal board pack: executive summary, compliance posture, pending items, regulatory horizon, and resolutions.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void generateBoardPack()}
                disabled={packLoading}
                className="inline-flex items-center gap-2 text-12 font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {packLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Board Pack"
                )}
              </button>
            </div>

            {packError && (
              <div className="text-11 text-red bg-red-dim border border-red/20 rounded-lg px-4 py-2 mb-3">{packError}</div>
            )}

            {packResult && (
              <div className="flex flex-col gap-3 border-t border-hair-2 pt-4 mt-2">
                {/* Export PDF button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-11 font-mono"
                    style={{ color: "#7c3aed", fontWeight: 600 }}
                  >
                    PDF
                  </button>
                </div>

                {/* Expandable section helper */}
                {(
                  [
                    { key: "executiveSummary", label: "Executive Summary", content: packResult.executiveSummary },
                    { key: "compliancePosture", label: "Compliance Posture", content: packResult.compliancePosture },
                    { key: "regulatoryHorizon", label: "Regulatory Horizon", content: packResult.regulatoryHorizon },
                  ] as Array<{ key: string; label: string; content: string }>
                ).map(({ key, label, content }) => (
                  <div key={key} className="border border-hair-2 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPackExpandedSection(packExpandedSection === key ? null : key)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors"
                    >
                      <span className="text-12 font-semibold text-ink-0">{label}</span>
                      <span className="text-ink-3 text-13">{packExpandedSection === key ? "▲" : "▾"}</span>
                    </button>
                    {packExpandedSection === key && (
                      <div className="px-4 pb-4 border-t border-hair-2">
                        <p className="text-12 text-ink-1 leading-relaxed whitespace-pre-wrap mt-3">{content}</p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Pending items */}
                {packResult.pendingItems.length > 0 && (
                  <div className="border border-hair-2 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPackExpandedSection(packExpandedSection === "pendingItems" ? null : "pendingItems")}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors"
                    >
                      <span className="text-12 font-semibold text-ink-0">
                        Pending Items Requiring Board Attention
                        <span className="ml-2 font-mono text-10 text-ink-3">({packResult.pendingItems.length})</span>
                      </span>
                      <span className="text-ink-3 text-13">{packExpandedSection === "pendingItems" ? "▲" : "▾"}</span>
                    </button>
                    {packExpandedSection === "pendingItems" && (
                      <div className="px-4 pb-4 border-t border-hair-2 mt-0">
                        <div className="flex flex-col gap-3 mt-3">
                          {packResult.pendingItems.map((item, i) => {
                            const priCls =
                              item.priority === "immediate"
                                ? "bg-red-dim text-red"
                                : item.priority === "high"
                                ? "bg-amber-dim text-amber"
                                : "bg-blue-dim text-blue";
                            return (
                              <div key={i} className="bg-bg-1 rounded p-3 flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm ${priCls}`}>
                                    {item.priority}
                                  </span>
                                </div>
                                <p className="text-12 text-ink-1">{item.item}</p>
                                <p className="text-11 text-ink-3 italic">{item.recommendation}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recommended resolutions */}
                {packResult.recommendations.length > 0 && (
                  <div className="border border-hair-2 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPackExpandedSection(packExpandedSection === "recommendations" ? null : "recommendations")}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors"
                    >
                      <span className="text-12 font-semibold text-ink-0">
                        Recommended Resolutions
                        <span className="ml-2 font-mono text-10 text-ink-3">({packResult.recommendations.length})</span>
                      </span>
                      <span className="text-ink-3 text-13">{packExpandedSection === "recommendations" ? "▲" : "▾"}</span>
                    </button>
                    {packExpandedSection === "recommendations" && (
                      <div className="px-4 pb-4 border-t border-hair-2">
                        <div className="flex flex-col gap-2 mt-3">
                          {packResult.recommendations.map((r, i) => (
                            <div key={i} className="flex gap-3 text-12 bg-bg-1 rounded p-3">
                              <span className="shrink-0 font-mono text-10 font-bold text-brand mt-0.5">{i + 1}.</span>
                              <div>
                                <div className="text-ink-1">{r.resolution}</div>
                                <div className="text-10 text-ink-3 font-mono mt-0.5">{r.owner} · {r.deadline}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-10 text-ink-3 font-mono border-t border-hair-2 pt-2">
                  Generated: {new Date(packResult.generatedAt).toLocaleString("en-GB")} · UAE FDL 10/2025 Art.20 · CBUAE AML Standards §6
                </div>
              </div>
            )}
          </div>

          {/* Generate Board Report */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-13 font-semibold text-ink-0">Generate Board Report</div>
                <div className="text-11 text-ink-3 mt-0.5">
                  Produces a quarterly Board AML/CFT MIS report using live oversight data.
                </div>
              </div>
              <button
                type="button"
                onClick={generateBoardReport}
                disabled={boardLoading}
                className="inline-flex items-center gap-2 text-12 font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {boardLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Board Report"
                )}
              </button>
            </div>

            {boardError && (
              <div className="text-11 text-red bg-red-dim border border-red/20 rounded-lg px-4 py-2 mb-3">{boardError}</div>
            )}

            {boardResult && (
              <div className="flex flex-col gap-5 border-t border-hair-2 pt-4 mt-2">
                {/* Executive summary */}
                <div>
                  <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Executive Summary</div>
                  <div className="text-12 text-ink-1 leading-relaxed whitespace-pre-wrap">{boardResult.executiveSummary}</div>
                </div>

                {/* Key metrics */}
                {boardResult.keyMetrics?.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Key Metrics</div>
                    <div className="flex flex-col gap-2">
                      {boardResult.keyMetrics.map((m, i) => {
                        const trendColor = m.trend === "improving" ? "text-green" : m.trend === "deteriorating" ? "text-red" : "text-ink-3";
                        return (
                          <div key={i} className="bg-bg-1 rounded p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-12 font-semibold text-ink-0">{m.metric}</div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-11 text-ink-0">{m.value}</span>
                                <span className={`text-10 font-mono uppercase ${trendColor}`}>{m.trend}</span>
                              </div>
                            </div>
                            <div className="text-11 text-ink-2">{m.commentary}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MLRO update */}
                {boardResult.mlroUpdate && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">MLRO Update</div>
                    <div className="text-12 text-ink-1 leading-relaxed">{boardResult.mlroUpdate}</div>
                  </div>
                )}

                {/* Regulatory highlights */}
                {boardResult.regulatoryHighlights?.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Regulatory Highlights</div>
                    <ul className="flex flex-col gap-1.5">
                      {boardResult.regulatoryHighlights.map((h, i) => (
                        <li key={i} className="flex gap-2 text-12 text-ink-1">
                          <span className="shrink-0 text-brand font-mono text-10 mt-0.5">·</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Open findings */}
                {boardResult.openAuditFindings?.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Open Audit Findings</div>
                    <div className="flex flex-col gap-2">
                      {boardResult.openAuditFindings.map((f, i) => (
                        <div key={i} className="bg-bg-1 rounded p-3 flex gap-3 text-12">
                          <span className={`shrink-0 font-mono text-10 font-semibold uppercase px-1.5 py-px rounded-sm h-fit mt-0.5 ${SEV_TONE[f.severity] ?? ""}`}>{f.severity}</span>
                          <div>
                            <div className="text-ink-1">{f.finding}</div>
                            <div className="text-10 text-ink-3 font-mono mt-0.5">{f.status} · due {f.dueDate}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Board recommendations */}
                {boardResult.boardRecommendations?.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Board Recommendations</div>
                    <ul className="flex flex-col gap-1.5">
                      {boardResult.boardRecommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-12 text-ink-1">
                          <span className="shrink-0 font-mono text-10 text-brand font-bold mt-0.5">{i + 1}.</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Attestation */}
                {boardResult.attestationStatement && (
                  <div className="border border-hair-2 rounded p-4 bg-bg-1">
                    <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Attestation</div>
                    <div className="text-11 text-ink-2 font-mono whitespace-pre-wrap leading-relaxed">{boardResult.attestationStatement}</div>
                  </div>
                )}

                {boardResult.regulatoryBasis && (
                  <div className="text-10 text-ink-3 border-t border-hair-2 pt-3">{boardResult.regulatoryBasis}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
