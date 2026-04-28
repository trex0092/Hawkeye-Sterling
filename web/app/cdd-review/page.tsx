"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import { RowActions } from "@/components/shared/RowActions";
import type { CaseRecord } from "@/lib/types";

// Periodic CDD Review — tracks which customers are due for re-KYC based
// on their risk tier. Review cadences per FDL 10/2025 Art.11:
//   High risk (PEP / sanctions hit): 3 months
//   Medium / elevated risk:          6 months
//   Standard / low risk:             12 months

type ReviewTier = "high" | "medium" | "standard";
type ReviewStatus = "overdue" | "due-soon" | "current" | "unknown";

interface ReviewRecord {
  id: string;
  subject: string;
  tier: ReviewTier;
  lastReview: string; // dd/mm/yyyy — "" if never reviewed
  notes: string;
  source: "case" | "manual";
}

const STORAGE = "hawkeye.cdd-review.v1";
const CADENCE_DAYS: Record<ReviewTier, number> = {
  high: 90,
  medium: 180,
  standard: 365,
};

const TIER_LABEL: Record<ReviewTier, string> = {
  high: "High risk",
  medium: "Medium risk",
  standard: "Low risk",
};

/** "dd/mm/yyyy" → Date | null */
function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]!), parseInt(m[2]!) - 1, parseInt(m[1]!));
}

/** ISO string → "dd/mm/yyyy" */
function isoToDMY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function deriveStatus(record: ReviewRecord): { status: ReviewStatus; daysOverdue: number; nextDue: string } {
  if (!record.lastReview) return { status: "unknown", daysOverdue: 0, nextDue: "—" };
  const last = parseDMY(record.lastReview);
  if (!last) return { status: "unknown", daysOverdue: 0, nextDue: "—" };
  const cadence = CADENCE_DAYS[record.tier];
  const nextTs = last.getTime() + cadence * 86_400_000;
  const now = Date.now();
  const days = Math.round((nextTs - now) / 86_400_000);
  const nextDate = new Date(nextTs);
  const nextDue = `${String(nextDate.getDate()).padStart(2, "0")}/${String(nextDate.getMonth() + 1).padStart(2, "0")}/${nextDate.getFullYear()}`;
  if (days < 0) return { status: "overdue", daysOverdue: Math.abs(days), nextDue };
  if (days <= 60) return { status: "due-soon", daysOverdue: 0, nextDue };
  return { status: "current", daysOverdue: 0, nextDue };
}

const STATUS_TONE: Record<ReviewStatus, string> = {
  overdue: "bg-red-dim text-red",
  "due-soon": "bg-amber-dim text-amber",
  current: "bg-green-dim text-green",
  unknown: "bg-bg-2 text-ink-3",
};

const TIER_TONE: Record<ReviewTier, string> = {
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  standard: "bg-green-dim text-green",
};

function loadManual(): ReviewRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as ReviewRecord[]) : [];
  } catch { return []; }
}

function saveManual(rows: ReviewRecord[]) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(rows.filter((r) => r.source === "manual"))); } catch { /* */ }
}

function casesToRecords(cases: CaseRecord[]): ReviewRecord[] {
  return cases.map((c) => {
    const lastTs = c.timeline?.length
      ? Math.max(...c.timeline.map((e) => new Date(e.timestamp).getTime()))
      : 0;
    const tier: ReviewTier =
      c.badge === "CRITICAL" || c.badge === "HIGH" ? "high" :
      c.badge === "MEDIUM" ? "medium" : "standard";
    return {
      id: `case-${c.id}`,
      subject: c.subject,
      tier,
      lastReview: lastTs ? isoToDMY(new Date(lastTs).toISOString()) : "",
      notes: `Auto-imported from case ${c.id} · badge: ${c.badge}`,
      source: "case" as const,
    };
  });
}

const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";
const BLANK = { subject: "", tier: "high" as ReviewTier, lastReview: "", notes: "" };

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function CddReviewPage() {
  const [manualRecords, setManualRecords] = useState<ReviewRecord[]>([]);
  const [caseRecords, setCaseRecords] = useState<ReviewRecord[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK);

  useEffect(() => {
    setManualRecords(loadManual());
    setCaseRecords(casesToRecords(loadCases()));
  }, []);

  const all = [...caseRecords, ...manualRecords];
  const enriched = all.map((r) => ({ ...r, ...deriveStatus(r) }));
  const sorted = [...enriched].sort((a, b) => {
    const order: Record<ReviewStatus, number> = { overdue: 0, "due-soon": 1, unknown: 2, current: 3 };
    return order[a.status] - order[b.status];
  });

  const overdue = sorted.filter((r) => r.status === "overdue").length;
  const dueSoon = sorted.filter((r) => r.status === "due-soon").length;

  const set = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const add = () => {
    if (!draft.subject) return;
    const rec: ReviewRecord = { ...draft, id: `manual-${Date.now()}`, source: "manual" };
    const next = [...manualRecords, rec];
    saveManual([...next]);
    setManualRecords(next);
    setDraft(BLANK);
  };

  const markReviewed = (id: string) => {
    const today = isoToDMY(new Date().toISOString());
    const update = (r: ReviewRecord) => r.id === id ? { ...r, lastReview: today } : r;
    if (id.startsWith("manual-")) {
      const next = manualRecords.map(update);
      saveManual(next);
      setManualRecords(next);
    } else {
      setCaseRecords((prev) => prev.map(update));
    }
  };

  const remove = (id: string) => {
    const next = manualRecords.filter((r) => r.id !== id);
    saveManual(next);
    setManualRecords(next);
  };

  const startEdit = (r: ReviewRecord) => {
    setEditingId(r.id);
    setEditDraft({ subject: r.subject, tier: r.tier, lastReview: r.lastReview, notes: r.notes });
  };

  const setE = (k: keyof typeof BLANK) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditDraft((d) => ({ ...d, [k]: e.target.value }));

  const saveRecordEdit = (id: string) => {
    const update = (r: ReviewRecord) => r.id === id ? { ...r, ...editDraft } : r;
    if (id.startsWith("manual-")) {
      const next = manualRecords.map(update);
      saveManual(next);
      setManualRecords(next);
    } else {
      setCaseRecords((prev) => prev.map(update));
    }
    setEditingId(null);
  };

  return (
    <ModuleLayout asanaModule="cdd-review" asanaLabel="CDD Review">
        <ModuleHero
          eyebrow="Module 22 · CDD Lifecycle"
          title="Periodic CDD"
          titleEm="review."
          intro={
            <>
              <strong>Who needs re-KYC and when.</strong> Risk-tiered review
              cadences per FDL 10/2025 Art.11 — high-risk (PEP / sanctions)
              every 3 months, medium every 6 months, low risk annually.
              Cases auto-imported; manual subjects can be added.
            </>
          }
          kpis={[
            { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
            { value: String(dueSoon), label: "due within 60d", tone: dueSoon > 0 ? "amber" : undefined },
            { value: String(all.length), label: "total tracked" },
          ]}
        />

        {/* Add manual record */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
          <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Add subject</div>
          <div className="grid grid-cols-4 gap-2">
            <input value={draft.subject} onChange={set("subject")} placeholder="Subject name" className={inputCls} />
            <select value={draft.tier} onChange={set("tier")} className={inputCls}>
              <option value="high">High risk (3 months)</option>
              <option value="medium">Medium risk (6 months)</option>
              <option value="standard">Low risk (12 months)</option>
            </select>
            <input value={draft.lastReview} onChange={set("lastReview")} placeholder="Last review dd/mm/yyyy" className={inputCls} />
            <input value={draft.notes} onChange={set("notes")} placeholder="Notes (optional)" className={inputCls} />
          </div>
          <button type="button" onClick={add} disabled={!draft.subject}
            className="mt-2 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40">
            + Add
          </button>
        </div>

        {/* Review table */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-4">
          <table className="w-full text-11">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                {["Subject", "Tier", "Last Review", "Next Due", "Status", "Notes", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-3 text-12">
                  No subjects tracked yet. Cases auto-import when filed; add manual subjects above.
                </td></tr>
              ) : sorted.map((r, i) => (
                editingId === r.id ? (
                  <tr key={r.id} className={i < sorted.length - 1 ? "border-b border-hair" : ""}>
                    <td colSpan={7} className="px-3 py-2">
                      <div className="grid grid-cols-4 gap-2 mb-1.5">
                        <input value={editDraft.subject} onChange={setE("subject")} placeholder="Subject" className="text-12 px-2 py-1 rounded border border-brand bg-bg-0 text-ink-0" />
                        <select value={editDraft.tier} onChange={setE("tier")} className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                          <option value="high">High risk (3 months)</option>
                          <option value="medium">Medium risk (6 months)</option>
                          <option value="standard">Low risk (12 months)</option>
                        </select>
                        <input value={editDraft.lastReview} onChange={setE("lastReview")} placeholder="Last review dd/mm/yyyy" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                        <input value={editDraft.notes} onChange={setE("notes")} placeholder="Notes" className="text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => saveRecordEdit(r.id)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-11 font-medium px-3 py-1 rounded text-ink-2">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={r.id} className={i < sorted.length - 1 ? "border-b border-hair" : ""}>
                  <td className="px-3 py-2 text-ink-0 font-medium">{r.subject}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${TIER_TONE[r.tier]}`}>
                      {TIER_LABEL[r.tier]}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-2">{r.lastReview || "—"}</td>
                  <td className="px-3 py-2 font-mono text-10 text-ink-2">{r.nextDue}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${STATUS_TONE[r.status]}`}>
                        {r.status === "due-soon" ? "due soon" : r.status === "overdue" ? `${r.daysOverdue}d overdue` : r.status}
                      </span>
                      <button type="button" onClick={() => markReviewed(r.id)}
                        className="text-10 font-mono text-brand hover:text-brand-deep underline whitespace-nowrap">
                        mark reviewed
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink-3 text-10 max-w-[160px] truncate" title={r.notes}>{r.notes || "—"}</td>
                  <td className="px-2 py-2 text-right">
                    <RowActions
                      label={`review ${r.id}`}
                      onEdit={() => startEdit(r)}
                      onDelete={() => remove(r.id)}
                      confirmDelete={false}
                    />
                  </td>
                </tr>
                )
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
          Cadences: High risk (PEP / sanctions) — 3 months · Medium risk — 6 months · Low risk — 12 months.
          Per FDL 10/2025 Art.11. Case records auto-imported from the screening register; last activity date used as proxy for last review.
        </p>
    </ModuleLayout>
  );
}
