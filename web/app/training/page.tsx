"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface TrainingRow {
  id: string;
  name: string;
  course: string;
  provider: string;
  completed: string; // stored as YYYY-MM-DD
  durationHrs: string;
  delivery: string;
  status: "current" | "expiring" | "expired";
}

const STORAGE = "hawkeye.training.v2";

const DEFAULT_ROWS: TrainingRow[] = [
  {
    id: "t1",
    name: "Luisa Fernanda",
    course: "FDL 10/2025 · AML/CFT refresher",
    provider: "CBUAE",
    completed: "2026-02-14",
    durationHrs: "8",
    delivery: "Online",
    status: "current",
  },
  {
    id: "t2",
    name: "Luisa Fernanda",
    course: "LBMA Responsible Gold Guidance v9",
    provider: "LBMA",
    completed: "2025-11-08",
    durationHrs: "4",
    delivery: "Online",
    status: "current",
  },
  {
    id: "t3",
    name: "Luisa Fernanda",
    course: "goAML Web Submission · Reporter module",
    provider: "UNODC",
    completed: "2025-03-02",
    durationHrs: "3",
    delivery: "Online",
    status: "expiring",
  },
  {
    id: "t4",
    name: "Analyst 1",
    course: "FATF R.10 / R.12 — CDD + PEP",
    provider: "ACAMS",
    completed: "2024-06-18",
    durationHrs: "6",
    delivery: "Classroom",
    status: "expired",
  },
];

/** "14/02/2026" → "2026-02-14" (returns "" if invalid) */
function parseDMY(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  if (!d || !mo) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "2026-02-14" → "14/02/2026" */
function fmtDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function deriveStatus(completedIso: string): TrainingRow["status"] {
  if (!completedIso) return "current";
  const expiresTs = new Date(completedIso).getTime() + 365 * 86_400_000;
  const now = Date.now();
  if (expiresTs - now > 30 * 86_400_000) return "current";
  if (expiresTs > now) return "expiring";
  return "expired";
}

function load(): TrainingRow[] {
  if (typeof window === "undefined") return DEFAULT_ROWS;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : DEFAULT_ROWS;
  } catch {
    return DEFAULT_ROWS;
  }
}

function save(rows: TrainingRow[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(rows));
  } catch {
    /* */
  }
}

const STATUS_TONE: Record<TrainingRow["status"], string> = {
  current: "bg-green-dim text-green",
  expiring: "bg-amber-dim text-amber",
  expired: "bg-red-dim text-red",
};

const BLANK = { name: "", course: "", provider: "", completed: "", durationHrs: "", delivery: "" };

export default function TrainingPage() {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [draft, setDraft] = useState(BLANK);

  useEffect(() => {
    setRows(load());
  }, []);

  const add = () => {
    if (!draft.name || !draft.course) return;
    const completedIso = parseDMY(draft.completed);
    const next: TrainingRow[] = [
      ...rows,
      {
        id: `t${Date.now()}`,
        name: draft.name,
        course: draft.course,
        provider: draft.provider,
        completed: completedIso || draft.completed,
        durationHrs: draft.durationHrs,
        delivery: draft.delivery,
        status: deriveStatus(completedIso),
      },
    ];
    save(next);
    setRows(next);
    setDraft(BLANK);
  };

  const remove = (id: string) => {
    const next = rows.filter((r) => r.id !== id);
    save(next);
    setRows(next);
  };

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <ModuleLayout>
      <div>
        <ModuleHero
          eyebrow="Module 15 · Staff certification"
          title="Training"
          titleEm="log."
          intro={
            <>
              <strong>Who took what, when it expires.</strong> Auditor-
              demanded artefact under FDL 10/2025 Art.16 — every AML/CFT
              team member must have current training on the relevant
              frameworks. Log tracks completion and renewal dates.
            </>
          }
        />

        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mt-6">
          <table className="w-full text-12">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Name
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Course
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Training Provider
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Completed
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Duration (Hrs)
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Delivery Method
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Status
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={i < rows.length - 1 ? "border-b border-hair" : ""}
                >
                  <td className="px-3 py-2 text-ink-0">{r.name}</td>
                  <td className="px-3 py-2 text-ink-1">{r.course}</td>
                  <td className="px-3 py-2 text-ink-1">{r.provider}</td>
                  <td className="px-3 py-2 font-mono text-11 text-ink-2">
                    {fmtDMY(r.completed)}
                  </td>
                  <td className="px-3 py-2 font-mono text-11 text-ink-2 text-center">
                    {r.durationHrs}
                  </td>
                  <td className="px-3 py-2 text-11 text-ink-2">{r.delivery}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label="Delete row"
                      className="text-ink-3 hover:text-red transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-4">
          <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
            Log new training
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input
              value={draft.name}
              onChange={set("name")}
              placeholder="Name"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
            <input
              value={draft.course}
              onChange={set("course")}
              placeholder="Course"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
            <input
              value={draft.provider}
              onChange={set("provider")}
              placeholder="Training Provider"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={draft.completed}
              onChange={set("completed")}
              placeholder="Completed dd/mm/yyyy"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
            <input
              value={draft.durationHrs}
              onChange={set("durationHrs")}
              placeholder="Duration (Hrs)"
              type="number"
              min="0"
              step="0.5"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
            <input
              value={draft.delivery}
              onChange={set("delivery")}
              placeholder="Delivery Method"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0"
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!draft.name || !draft.course}
            className="mt-3 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40"
          >
            + Log training
          </button>
        </div>
      </div>
    </ModuleLayout>
  );
}
