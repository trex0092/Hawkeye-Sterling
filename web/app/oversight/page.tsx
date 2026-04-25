"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

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

type Tab = "approvals" | "minutes" | "circulars";

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

export default function OversightPage() {
  const [tab, setTab] = useState<Tab>("approvals");
  const [expandedMinute, setExpandedMinute] = useState<string | null>(MINUTES[0]?.id ?? null);
  const [mdName, setMdName] = useState("");

  const pendingApprovals = APPROVALS.filter((a) => a.status === "pending").length;
  const slaBreached = APPROVALS.filter((a) => a.status === "pending" && a.elapsedHours > a.slaHours).length;
  const openActions = MINUTES.flatMap((m) => m.actionItems).filter((ai) => !ai.closed).length;
  const gaps = CIRCULARS.filter((c) => c.disposition === "gap-identified").length;

  return (
    <ModuleLayout engineLabel="Governance engine">
      <ModuleHero
        eyebrow="Module 25 · Governance"
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
          { value: String(openActions), label: "open action items", tone: openActions > 0 ? "amber" : undefined },
          { value: String(gaps), label: "regulatory gaps", tone: gaps > 0 ? "red" : undefined },
          { value: String(CIRCULARS.filter((c) => c.disposition === "implemented").length), label: "circulars closed" },
        ]}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-hair-2">
        {(["approvals", "minutes", "circulars"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-12 font-medium capitalize rounded-t border-b-2 transition-colors ${
              tab === t
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t === "approvals" ? "Approvals" : t === "minutes" ? "Meeting minutes" : "Circulars"}
          </button>
        ))}
      </div>

      {/* APPROVALS TAB */}
      {tab === "approvals" && (
        <div className="flex flex-col gap-4">
          {APPROVALS.map((a) => (
            <div key={a.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
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

              <div className="grid grid-cols-2 gap-2 mb-3">
                <SignBox label="First reviewer" signer={a.firstReviewer} signedAt={a.firstSignedAt} />
                <SignBox
                  label="Second reviewer"
                  signer={a.secondSignedAt ? a.secondReviewer : mdName}
                  signedAt={a.secondSignedAt}
                  editable={!a.secondSignedAt}
                  onNameChange={setMdName}
                />
              </div>

              <div className="text-12 text-ink-2 border-l-2 border-hair-2 pl-3">
                {a.notes}
              </div>

              {a.status === "pending" && !a.firstSignedAt && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">
                    Approve (Sign)
                  </button>
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded border border-red text-red hover:bg-red-dim">
                    Reject
                  </button>
                </div>
              )}
              {a.status === "pending" && a.firstSignedAt && !a.secondSignedAt && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">
                    Second sign-off
                  </button>
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded border border-red text-red hover:bg-red-dim">
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
          {MINUTES.map((m) => {
            const expanded = expandedMinute === m.id;
            const openAI = m.actionItems.filter((ai) => !ai.closed).length;
            return (
              <div key={m.id} className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedMinute(expanded ? null : m.id)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors"
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
                    <div className="grid grid-cols-2 gap-6">
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
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
          <table className="w-full text-12">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                {["Ref", "Date", "Issuer", "Title", "Owner", "Due", "Disposition", "Notes"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CIRCULARS.map((c, i) => (
                <tr key={c.id} className={i < CIRCULARS.length - 1 ? "border-b border-hair" : ""}>
                  <td className="px-3 py-2.5 font-mono text-11 text-ink-0 whitespace-nowrap">{c.ref}</td>
                  <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{c.date}</td>
                  <td className="px-3 py-2.5 text-11 text-ink-2 whitespace-nowrap">{c.issuer}</td>
                  <td className="px-3 py-2.5 text-ink-0 font-medium max-w-[220px]">{c.title}</td>
                  <td className="px-3 py-2.5 text-11 text-ink-2 whitespace-nowrap">{c.owner}</td>
                  <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{c.dueDate}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DISPOSITION_TONE[c.disposition]}`}>
                      {DISPOSITION_LABEL[c.disposition]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-11 text-ink-2 max-w-[200px] truncate" title={c.notes}>
                    {c.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleLayout>
  );
}
