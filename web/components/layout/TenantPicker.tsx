"use client";

import { useEffect, useState } from "react";
import {
  addTenant,
  loadCurrentTenant,
  loadTenantList,
  saveCurrentTenant,
} from "@/lib/data/tenant-picker";

// Tenant picker in the top header. Click to open a dropdown with the
// pre-seeded list + any locally-added companies. Free-text input at
// the bottom lets you add a new company on the fly; every report,
// goAML XML, and Asana task generated after that picks up the
// selected value as the reporting-entity.

export function TenantPicker() {
  const [current, setCurrent] = useState("");
  const [list, setList] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setCurrent(loadCurrentTenant());
    setList(loadTenantList());
    const onUpdate = () => {
      setCurrent(loadCurrentTenant());
      setList(loadTenantList());
    };
    window.addEventListener("hawkeye:tenant-updated", onUpdate);
    window.addEventListener("hawkeye:tenant-list-updated", onUpdate);
    return () => {
      window.removeEventListener("hawkeye:tenant-updated", onUpdate);
      window.removeEventListener("hawkeye:tenant-list-updated", onUpdate);
    };
  }, []);

  const pick = (name: string) => {
    saveCurrentTenant(name);
    setCurrent(name);
    setOpen(false);
  };

  const addAndPick = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addTenant(trimmed);
    saveCurrentTenant(trimmed);
    setDraft("");
    setOpen(false);
  };

  const display = current || "Select company…";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-12 font-medium rounded border border-hair-2 bg-white text-ink-0 hover:bg-bg-1"
        title="Switch reporting company"
      >
        <span className="font-mono text-10 uppercase tracking-wide-3 text-ink-2">
          Co.
        </span>
        <span className="font-semibold truncate max-w-[160px]">{display}</span>
        <span className="text-10 text-ink-3">▾</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-[280px] bg-white border border-hair-2 rounded-lg shadow-lg p-2">
            <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 px-2 py-1">
              Reporting entity
            </div>
            <ul className="list-none p-0 m-0 max-h-60 overflow-y-auto">
              {list.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => pick(name)}
                    className={`w-full text-left px-2 py-1.5 rounded text-12 ${
                      name === current
                        ? "bg-brand-dim text-brand-deep font-semibold"
                        : "hover:bg-bg-1 text-ink-0"
                    }`}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-hair flex gap-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAndPick();
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="+ Add company"
                className="flex-1 text-12 px-2 py-1.5 rounded border border-hair-2 bg-white text-ink-0"
              />
              <button
                type="button"
                onClick={addAndPick}
                disabled={!draft.trim()}
                className="text-11 font-semibold px-2 py-1.5 rounded bg-ink-0 text-white hover:bg-ink-1 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
