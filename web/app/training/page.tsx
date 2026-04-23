"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface TrainingRow {
  id: string;
  name: string;
  course: string;
  completed: string;
  expires: string;
  status: "current" | "expiring" | "expired";
}

const STORAGE = "hawkeye.training.v1";

const DEFAULT_ROWS: TrainingRow[] = [
  {
    id: "t1",
    name: "Luisa Fernanda",
    course: "FDL 10/2025 · AML/CFT refresher",
    completed: "2026-02-14",
    expires: "2027-02-14",
    status: "current",
  },
  {
    id: "t2",
    name: "Luisa Fernanda",
    course: "LBMA Responsible Gold Guidance v9",
    completed: "2025-11-08",
    expires: "2026-11-08",
    status: "current",
  },
  {
    id: "t3",
    name: "Luisa Fernanda",
    course: "goAML Web Submission · Reporter module",
    completed: "2025-03-02",
    expires: "2026-03-02",
    status: "expiring",
  },
  {
    id: "t4",
    name: "Analyst 1",
    course: "FATF R.10 / R.12 — CDD + PEP",
    completed: "2024-06-18",
    expires: "2025-06-18",
    status: "expired",
  },
];

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

export default function TrainingPage() {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [draft, setDraft] = useState({ name: "", course: "", completed: "", expires: "" });

  useEffect(() => {
    setRows(load());
  }, []);

  const add = () => {
    if (!draft.name || !draft.course) return;
    const now = Date.now();
    const expires = Date.parse(draft.expires);
    const status: TrainingRow["status"] =
      !draft.expires || expires - now > 30 * 86400_000
        ? "current"
        : expires > now
          ? "expiring"
          : "expired";
    const next: TrainingRow[] = [
      ...rows,
      { id: `t${rows.length + 1}`, ...draft, status },
    ];
    save(next);
    setRows(next);
    setDraft({ name: "", course: "", completed: "", expires: "" });
  };

  return (
    <ModuleLayout narrow>
      <div className="max-w-5xl mx-auto px-8 py-10">
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

        <div className="bg-white border border-hair-2 rounded-lg overflow-hidden mt-6">
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
                  Completed
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Expires
                </th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                  Status
                </th>
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
                  <td className="px-3 py-2 font-mono text-11 text-ink-2">
                    {r.completed}
                  </td>
                  <td className="px-3 py-2 font-mono text-11 text-ink-2">
                    {r.expires}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-hair-2 rounded-lg p-4 mt-4">
          <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
            Log new training
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0"
            />
            <input
              value={draft.course}
              onChange={(e) => setDraft({ ...draft, course: e.target.value })}
              placeholder="Course"
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0"
            />
            <input
              type="date"
              value={draft.completed}
              onChange={(e) => setDraft({ ...draft, completed: e.target.value })}
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0"
            />
            <input
              type="date"
              value={draft.expires}
              onChange={(e) => setDraft({ ...draft, expires: e.target.value })}
              className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0"
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!draft.name || !draft.course}
            className="mt-3 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-white hover:bg-ink-1 disabled:opacity-40"
          >
            + Log training
          </button>
        </div>
      </div>
    </ModuleLayout>
  );
}
